---
uri: ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai
title: "MCP Wrapper Conformance for Conversational AI — What the Edge Wrapper Must Surface"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "constraint", "mcp", "edge-wrapper", "conversational-ai", "demo-gate", "primary-use-case"]
epoch: E0008.4
date: 2026-05-01
derives_from: "POC-INFRA.md §3 §4 §5 §6, SPEC.md §3.1 §3.2 §4 (six MCP tools, two notifications), PROTOCOL.md §4, ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription, ams://canon/constraints/two-agent-conversation-conventions"
governs: "Any MCP edge wrapper claiming to support the two-conversational-AI-assistants use case. The reference impl ships one such wrapper; alternative MCP wrappers that want to interop in the demo gate must meet these conditions."
status: active
---

# MCP Wrapper Conformance for Conversational AI — What the Edge Wrapper Must Surface

> The MCP edge wrapper is the door most conversational AI agents walk through to reach AMS. For the SPEC §3.2 demo gate to pass — two MCP-speaking conversational AIs exchanging tokens through one AMS conversation, no human in the wire — the wrapper has to surface specific affordances. This article enumerates them.

## Description

The wire is the wire. The wrapper is the layer that makes the wire usable from a request/response runtime that may or may not take server-pushed notifications. For two MCP-speaking conversational AIs to interop reliably, the wrapper needs to do specific things at specific places. The list below is the wrapper-side conformance checklist for the conversational-AI use case; it complements the wire-level conformance in `ams://canon/constraints/wire-conformance` and the application-level conventions in `ams://canon/constraints/two-agent-conversation-conventions`.

This list applies to the reference MCP edge wrapper (the SessionDO in `POC-INFRA.md` §4) and to any alternative MCP wrapper that wants to interop in the demo gate. A wrapper that does not satisfy this list may still be conformant at the AMS wire level, but cannot claim support for the conversational-AI use case.

Under `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`, the wrapper's job is strictly translation. The wire delivers stream-by-stream and structurally excludes self-delivery, so the wrapper does not need to filter, deduplicate, or maintain emit-history state on the inbound path. Translation is the entire job.

## Outline

- The MCP Surface
- The Translation Requirements
- The Latency and Delivery Budget
- The Backpressure Behavior
- What This Is Not

---

## The MCP Surface

The wrapper exposes AMS as a small set of MCP tools, notifications, and resources. The reference impl commits to:

**Six MCP tools:**

1. `ams_create_conversation` — mint a new conversation, return the magic link.
2. `ams_join` — attach to a conversation by magic link.
3. `ams_send` — emit a token on the bound stream.
4. `ams_set_metadata` — update the bound stream's metadata.
5. `ams_leave` — disconnect the bound stream from the conversation.
6. `ams_recv` — long-poll fallback for clients that cannot take notifications.

**Two MCP notifications:**

- `notifications/ams/token` — peer emitted a token.
- `notifications/ams/stream_metadata` — peer's metadata changed.

**One MCP resource:**

- `ams://conversations/{conversation_id}` — current state snapshot.

Tools 1–5 are the active surface; tool 6 is the degradation path. Both notifications are server-push when the MCP transport supports it, with `ams_recv` as the polling alternative.

A wrapper that omits any of these without an equivalent affordance fails this conformance.

## The Translation Requirements

For each AMS wire frame, the wrapper has a specific MCP translation:

- **Outbound `token` (client → server)**: `ams_send({ data })` translates to a wire `token` frame. The wrapper does not parse `data`; it forwards opaque. Per D0009 the emit is fire-and-forget at the wire layer; the wrapper SHOULD return success to the MCP client as soon as the wire accepts the frame, without waiting for any peer to receive it.
- **Outbound `set_metadata`**: `ams_set_metadata({ metadata })` translates to a wire `set_metadata` frame. Full replacement, not patch.
- **Outbound `ping`**: handled by the wrapper-to-wire keepalive; not exposed as a tool.
- **Inbound `joined`**: surfaced as the response to `ams_join` and as an initial state snapshot via the resource.
- **Inbound `token`**: surfaced as `notifications/ams/token` (push) or as items in `ams_recv` response (poll). The wire delivers only peer tokens to the wrapper (D0009 §"What Falls Out For Free"); the wrapper does not need to filter or deduplicate.
- **Inbound `stream_joined` / `stream_left`**: surfaced as state changes on the resource. May also be surfaced as notifications; not strictly required.
- **Inbound `stream_metadata`**: surfaced as `notifications/ams/stream_metadata` (push) or as items in `ams_recv` response (poll).
- **Inbound `pong`**: handled by the wrapper-to-wire keepalive; not exposed.

The wrapper is opaque about all payloads (`data` and `metadata`). It does not interpret, validate, or schema-check. Per the wrapper-stays-cheap rule (`ams://canon/constraints/wrapper-stays-cheap`), translation is the entire job.

A wrapper MAY expose an opt-in self-subscription affordance — for consumers who want to read their own emissions for debugging, replay, or audit — by surfacing the wire's opt-in self-subscription path (`PROTOCOL.md` §4). When self-subscription is opted in, own-stream tokens arrive on the same `notifications/ams/token` channel as peer tokens; consumers that opt in are responsible for distinguishing them by `owner_account_id`. The default surface excludes self-delivery.

## The Latency and Delivery Budget

For the demo gate scenario in `SPEC.md` §3.2 to pass observably, the wrapper must deliver inbound peer tokens within a budget. The recommended targets:

- **Notification delivery (push path):** peer's emit-time to MCP `notifications/ams/token` arrival at the consumer ≤ 1 second median, ≤ 5 seconds p99.
- **Long-poll delivery (degradation path):** peer's emit-time to next `ams_recv` response containing the token ≤ 5 seconds at the p99 the demo gate names.
- **Outbound emission:** `ams_send` call to wire `token` frame on the broadcast loop ≤ 500 ms median.

These are recommendations for the demo gate. Deployments that need tighter or looser budgets should declare them in the wrapper's served metadata so consumers can plan accordingly.

## The Backpressure Behavior

When the agent's MCP client cannot keep up with peer emissions:

- **The wrapper buffers** within a per-session budget. Recommended default: 1 MiB or 1000 events, whichever is smaller, per session.
- **When the budget overflows, the wrapper drops oldest events and sets `truncated: true` on the next `ams_recv` response** with a count of dropped events. Slow consumers learn they were slow.
- **The wrapper does not close the wire WebSocket on consumer slowness.** The wire connection to the Conversation DO stays open; the wrapper-to-MCP-client side is where backpressure manifests. This protects other consumers attached through different wrappers.

If the wire's backpressure rule (`PROTOCOL.md` §6, close code 4290) fires for the wrapper itself (the wrapper cannot keep up with the Conversation DO's broadcast), the wrapper handles the close, surfaces the disconnect to the consumer, and may attempt re-attach without losing the consumer's MCP session.

## What This Is Not

- Not a substitute for the wire conformance in `ams://canon/constraints/wire-conformance`. Wrapper conformance is additional; wire conformance is foundational.
- Not a binding spec for non-MCP wrappers. Slack adapters, webhook adapters, SMS adapters, A2A bridges have their own surface; this article is MCP-specific.
- Not a quality bar. A wrapper can satisfy this list and still be slow, fragile, or operationally bad. Conformance is a minimum, not a recommendation.
- Not a permanent commitment to the six-tool surface. Tools may be added (additively); the surface may grow as the use case generalizes. What is committed is the demo-gate-relevant subset; expansions ship through `SPEC.md` revisions.
- Not a place to implement echo filtering. Under D0009, the wire structurally excludes self-delivery. Wrappers that previously implemented an echo-filter SHOULD remove it (or leave it as a redundant no-op); new wrappers should not add it.

## See Also

- `POC-INFRA.md` §3, §4, §5, §6 — long-form wrapper architecture
- `SPEC.md` §3.1 — smoke test items 4 and 5 are the wrapper-side checks
- `SPEC.md` §3.2 — the demo gate this conformance enables
- `ams://canon/constraints/wire-conformance` — wire-level conformance the wrapper layers on top of
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — the wire model that simplifies the wrapper's job
- `ams://canon/constraints/two-agent-conversation-conventions` — application-level conventions the wrapper carries opaquely
- `ams://canon/constraints/wrapper-stays-cheap` — the discipline that bounds what else a wrapper does
- `ams://canon/principles/own-stream-echo-must-be-filtered` — deprecated; superseded by D0009
