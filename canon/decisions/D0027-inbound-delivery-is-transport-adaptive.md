---
uri: ams://canon/decisions/D0027-inbound-delivery-is-transport-adaptive
title: "D0027 — Inbound Delivery Is Transport-Adaptive: Ride-Along on Tool-Call POST Responses"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "decision", "mcp", "edge-wrapper", "delivery", "ride-along", "non-sse-clients", "wrapper-stays-cheap", "vodka-architecture"]
epoch: E0008.5
date: 2026-05-07
derives_from: "D0006-dream-house-wire-edge-wrappers (wrappers absorb runtime concerns; this decision realizes that promise for non-SSE clients); D0012-browser-is-an-mcp-runtime (constrained-runtime precedent); D0023-magic-link-as-mcp-transport-endpoint (magic-link MCP entry point that this decision sits beneath); D0024-migrate-hosted-mcp-wrapper-to-mcpagent-sdk (the SDK whose primitive this decision uses); ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai §The Latency and Delivery Budget"
governs: "How the MCP edge wrapper delivers inbound peer frames across the three classes of consumer-runtime behavior: clients holding the SSE GET leg (push), clients that only POST tool calls (ride-along), and clients that explicitly poll (ams_recv). The mechanism the wrapper uses to route notifications onto specific response streams. The relationship between the per-session buffer source-of-truth and the three drain paths."
status: active
---

# D0027 — Inbound Delivery Is Transport-Adaptive: Ride-Along on Tool-Call POST Responses

> Inbound peer frames reach a consumer through one of three paths, drained from a single buffered queue: push (SSE GET leg), ride-along (drained onto active POST tool-call responses), or poll (`ams_recv`). The wrapper picks the path the consumer's runtime can actually use; the wire stays unchanged. This is the "wrappers absorb runtime concerns" promise made concrete.

## Decision

The AMS MCP edge wrapper drains buffered peer frames onto **three distinct delivery paths**, all sourced from a single per-session `recvBuffer`:

1. **Push** — when the consumer holds the SSE GET leg open, peer frames are pushed there immediately via the SDK's standard `notifications/ams/token` and `notifications/ams/stream_metadata` emission. Standard MCP Streamable HTTP behavior. Already shipped.
2. **Ride-along** — at the end of every tool-call POST handler, before returning the result, pending frames in the buffer are drained onto the active POST response stream as `event: message` notifications via the SDK's `extra.sendNotification` primitive, which routes by `relatedRequestId` to the active request's response. Consumers without an open SSE leg receive inbound transparently as part of any tool call. **This decision adds this path.**
3. **Poll** — explicit `ams_recv` tool with `wait_ms`. Long-block escape hatch for consumers that want sustained presence beyond a single tool call's window. Already shipped.

A consumer's runtime determines which path it sees, not the wire. The buffer is the single source of truth; all three paths drain it.

The buffer is per-session, not per-conversation. N subscribers attached to a stream means N independent buffers; one subscriber's drain never affects another's view. Fan-out happens upstream at the Conversation DO per `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`; the per-session buffer is what each wrapper instance accumulates from its own subscription.

## Three-Tier Delivery Model

The three tiers carry different latency and presence properties:

| Tier | Latency (peer emit → consumer) | Presence | Triggered by |
|---|---|---|---|
| Push | Sub-second median (per the conformance constraint's delivery budget) | Continuous while the GET leg is held | SSE GET held open |
| Ride-along | Bounded by consumer's tool-call frequency | Active during POST tool calls | Any POST tool call |
| Poll | ≤ `wait_ms` cap (currently 25s) | On-demand per call | `ams_recv` invocation |

A constrained runtime — hosted-model chat without persistent SSE support, mobile clients with network sleep, sandboxed agents with restricted I/O — gets ride-along automatically by virtue of using the wrapper at all. No client-side awareness, no opt-in, no fallback negotiation. The wrapper just works.

`ams_recv` survives because some consumers want sustained inbound presence beyond what their normal tool-call cadence provides. A consumer doing one tool call every 30 seconds gets ride-along latency of ~30 seconds; if that is too slow, the consumer can call `ams_recv` with `wait_ms=25000` for explicit long-block. Both paths drain the same buffer.

## Mechanism

The decision uses an existing SDK primitive — no fork, no upstream PR.

`@modelcontextprotocol/sdk` exposes `extra.sendNotification(notification)` on the request-handler callback's `extra` argument. The SDK pre-binds this to the current request's `relatedRequestId`. Internally, `StreamableHTTPServerTransport.send(message, options)` routes by `options.relatedRequestId` to the connection holding that request, writing the SSE `event: message` block onto that response stream rather than the standalone GET leg.

The wrapper applies a small helper at tool registration:

```ts
// Conceptual; exact shape lands in implementation.
const withRideAlong = (handler) => async (args, extra) => {
  const result = await handler(args, extra);
  const drain = this.recvBuffer.splice(0, RIDE_ALONG_BUDGET);
  for (const frame of drain) {
    await extra.sendNotification({ method: frame.method, params: frame.params });
  }
  return result;
};
```

Applied to all tool callbacks except `ams_recv` (which owns the buffer explicitly). `RIDE_ALONG_BUDGET` caps drain count per call to prevent burst delivery from blocking the response.

## Echo Filter and Truncation

Both invariants apply symmetrically across all three paths because they are **buffer-side invariants**, not path-side:

- **Echo filter** is applied at buffer-push time, not at drain time. A peer's own emission either enters the buffer (and reaches the consumer via whichever path drains first) or it does not, per the consumer's `self_subscribe` posture at `ams_join`. `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai §The Echo-Filter Recommendation` describes the wrapper-side filter; this decision inherits it unchanged.
- **Truncation surfacing** matches `ams_recv`'s contract. When the per-session buffer overflows (per the budget in `§The Backpressure Behavior` of the same constraint), the next drain — push, ride-along, or poll — emits a `notifications/ams/truncated` frame so the consumer learns regardless of path.

A consumer attached only via push, only via ride-along, only via poll, or any combination, sees consistent semantics. Path is a delivery mechanism, not a content surface.

## Cost Properties

Per-session isolation is the right trade for substrate hygiene, but it is not free. This section names the cost shape explicitly so future readers do not think it was missed.

**What is multiplied per subscriber:**

- **In-memory `recvBuffer`.** Each MCP session's McpAgent instance carries its own array, capped at the backpressure budget in `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai §The Backpressure Behavior` (recommended 1 MiB or 1000 events, whichever is smaller). Worst-case fleet footprint scales linearly with subscriber count.
- **Wire bandwidth from the Conversation DO downstream.** Fan-out broadcast inherently sends N copies — one per subscriber — regardless of buffering strategy. This is a property of `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`, not of this decision.

**What is not multiplied:**

- **Persistent DO storage.** The McpAgent persists only props (prebind context, account_id, outer host). Buffers are in-memory transient, not persisted.
- **Compute at the broker.** Conversation DO does broadcast-and-forget; no per-subscriber coordinator state, no per-subscriber CPU.
- **Wire bandwidth upstream.** One emit produces one outbound; fan-out happens at the broker, not multiplicatively at the wire.

**Steady-state behavior is far below worst-case.** The buffer is only non-empty when a consumer is slow or not actively draining:

- Push-mode consumers (SSE GET leg held) drain frames straight through. Buffer hovers near zero almost always.
- Ride-along consumers drain on every tool call. Buffer fills between calls and empties on each; steady state is tens of frames at most for typical agent cadences.
- Idle-then-resume consumers fill toward the cap while idle and drain on the next interaction. The cap is the worst case, not the nominal case.

**The architectural trade.** This decision accepts the multiplied per-session footprint because:

- One slow consumer cannot block fast consumers (no head-of-line blocking across subscribers).
- The Conversation DO stays thin — broadcast-and-forget, no per-subscriber state, no coordinated backpressure logic.
- Each session's backpressure is independent; a misbehaving consumer ejects itself, not the conversation.
- This matches the substrate's vodka discipline (`ams://canon/constraints/wrapper-stays-cheap`): coordinator-shaped state lives at the edges (wrappers), not in the broker.

The alternative — centralized per-conversation buffer with N consumer cursors — concentrates memory in one DO, makes the Conversation DO O(N) in subscribers, introduces coordinated backpressure across consumers, and grows the broker into a fatter primitive. For a thin pub-sub wire, per-session isolation is the right side of the trade.

## Reversibility

Two-way door. Removing the `withRideAlong` wrapper restores prior behavior — push and poll only. No wire schema change, no new tool, no new MCP method, no new metadata key. Consumers without an SSE GET leg revert to needing explicit `ams_recv` calls. The decision can be reverted by a single PR with no consumer-side migration.

The mechanism uses a documented public API of `@modelcontextprotocol/sdk` (`extra.sendNotification` with `relatedRequestId`) used internally by the SDK itself for elicitation-completion and progress notifications. The risk of upstream breakage is bounded; the dep is pinned and version-locked at the wrapper's package.json.

## Success Criteria

Empirically observable:

- A consumer that opens an MCP session, calls `ams_join` with `self_subscribe: true`, calls `ams_send` (the self-subscribed frame enters the buffer), then calls any other tool (e.g., `tools/list`) — the response stream contains the prior `notifications/ams/token` frame as an `event: message` block before the result. Pre-decision: zero peer frames in that response. Post-decision: one or more. (This test was run during the decision's evidence-gathering phase against the pre-decision wrapper and produced exactly the negative result described.)
- A consumer holding an open SSE GET leg sees no behavior change. Frames continue to arrive on push exactly as before.
- A consumer calling `ams_recv` immediately after a ride-along drain sees an empty buffer (or only frames that arrived after the drain). The buffer remains the single source of truth.
- A burst of peer frames exceeding `RIDE_ALONG_BUDGET` in a single tool call results in `RIDE_ALONG_BUDGET` frames riding along on the current response and the remainder staying in the buffer for the next drain (next tool call, next `ams_recv`, or next push if a GET leg opens).

## What This Is Not

- Not a wire change. `PROTOCOL.md` is unchanged. Wire conformance is unchanged.
- Not a new tool or new notification type. The frames delivered via ride-along are the existing `notifications/ams/token` and `notifications/ams/stream_metadata` frames; only their delivery path is new.
- Not a vendor-specific accommodation. The decision targets the entire class of consumers that do not hold the SSE GET leg, regardless of vendor or runtime — hosted-model chat clients, mobile clients with network sleep, browser tools without EventSource access, and any future runtime with similar properties.
- Not a substitute for `ams_recv`. The poll tier remains the explicit long-block escape hatch for consumers wanting sustained presence beyond their normal tool-call cadence.
- Not a commitment that ride-along delivery is as fast as push. Push remains the lowest-latency path; ride-along latency is bounded by tool-call frequency. Consumers that need sub-second inbound should hold the SSE leg.

## See Also

- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` — the principle this decision realizes
- `ams://canon/decisions/D0012-browser-is-an-mcp-runtime` — earlier constrained-runtime precedent in canon
- `ams://canon/decisions/D0023-magic-link-as-mcp-transport-endpoint` — magic-link MCP entry point this decision sits beneath
- `ams://canon/decisions/D0024-migrate-hosted-mcp-wrapper-to-mcpagent-sdk` — the SDK substrate that provides `extra.sendNotification`
- `ams://canon/decisions/D0025-magic-link-url-is-the-tincan-portal` — the portal that makes magic-link bootstrap work end-to-end alongside this delivery decision
- `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai` — the conformance checklist this decision adds a third delivery path to
- `ams://canon/constraints/wrapper-stays-cheap` — the discipline this decision honors: a single helper, no new state, drain shares the existing buffer
