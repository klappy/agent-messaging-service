---
uri: ams://canon/principles/wire-layer-latency-vocabulary
title: "Wire-Layer Latency Vocabulary — TTFF Is Not LLM TTFT and the Wire Says So Out Loud"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: stable
tags: ["ams", "canon", "principle", "observability", "latency", "ttft", "ttff", "naming-honesty", "vodka-architecture"]
epoch: E0008.3
date: 2026-05-03
derives_from: "ams://canon/decisions/D0010-observability-via-subscriber-not-wire, ams://canon/constraints/observability-payload-boundary §'The Subscriber-Layer Schema', PROTOCOL.md §4.2 (server-pushed frames), AMS.md §3 (polymorphic subscribers), klappy://canon/constraints/telemetry-governance"
complements: "ams://canon/decisions/D0015-state-totals-via-snapshot-worker, ams://canon/principles/token-count-derivation-on-subscribers, ams://canon/principles/observability-as-subscriber"
governs: "Naming and measurement of latency metrics at the AMS wire layer. Recommended convention; deployments that name metrics differently document the discrepancy and the conversion."
status: active
---

# Wire-Layer Latency Vocabulary — TTFF Is Not LLM TTFT and the Wire Says So Out Loud

> The AMS wire emits `token` frames whose `data` is opaque bytes. A frame may carry one LLM token, a chunk of LLM output, a complete utterance, or bytes that have nothing to do with an LLM at all. Latency metrics named at the wire layer must reflect what the wire actually transports, not what the operator hopes the bytes represent. **Time to first frame (TTFF)** is the wire-layer metric. **Time to first LLM token (TTFT)** is an agent-layer metric the wire cannot honestly compute. The principle names the distinction, gives both metrics anchor frames, and forbids silently substituting one for the other.

## Description

The upstream telemetry schema (`klappy://canon/constraints/telemetry-governance` §"What Is Tracked") collects `duration_ms` as full request wall-clock at the worker edge — appropriate for a request-response service. AMS is push-native (`PROTOCOL.md` §4.1) and streams tokens for the duration of a conversation. A single `duration_ms` does not describe a streaming session; multiple latency metrics are needed and they are not interchangeable.

The naming question is load-bearing. Calling a wire-layer metric "TTFT" imports a meaning the wire cannot guarantee — that the byte payload is one LLM token from a model with a measurable invocation point. AMS makes no such guarantee. A `token` frame may carry an entire JSON document, a chat message, a sensor reading, or a base64-encoded image. A subscriber that receives one of these and reports "TTFT = 130ms" has measured the time to the first emission on the wire, which is honest, while labeling it as something else.

This principle separates the two and forbids the conflation. It also names a pair of optional anchor frames that subscribers may rely on when an emitter is willing to declare them, without requiring the wire to mandate either.

## Outline

- The Two Metrics, Stated Plainly
- The Anchor Frame Pattern
- What the Subscriber Can and Cannot Compute
- Schema Slot Allocation
- Why Naming This Matters
- What This Is Not

---

## The Two Metrics, Stated Plainly

**TTFF — Time To First Frame.** The wall-clock interval between an anchor event and the first server-pushed `token` frame on a particular stream within a conversation. This metric is always computable by an observability subscriber from frames it directly receives; the only choice is the anchor.

**TTFT — Time To First (LLM) Token.** The wall-clock interval between the moment an LLM agent invoked its model provider and the moment the model's first generated token arrived at the agent. This metric is **not** computable at the AMS wire layer. The model invocation happens off-wire, between the agent and its provider. Subscribers can approximate TTFT only when an agent voluntarily emits an anchor frame at model invocation; even then, the approximation is bounded by the agent's own honesty about when it invoked.

The first metric measures what the wire transports. The second measures what an agent does with a model. They are different quantities with different truth conditions. Reporting them under one name misleads the dashboard reader.

## The Anchor Frame Pattern

A subscriber that wants to compute either metric needs a `T0` anchor. The wire provides one anchor for free and recognizes a convention for the second.

### `request_received_at` — free anchor for user-facing latency

`request_received_at` is the timestamp the broker accepted the WebSocket upgrade or the control-plane request that initiated activity. The hook layer already records it for control-plane events per `observability-payload-boundary` §"The Hook-Layer Schema". A subscriber that joins as the conversation forms can read this from the hook-layer dataset by `account_id_hash` + `conversation_id_hash` and compute:

```
TTFF_user = first_token_frame_ts - request_received_at
```

This is the metric that answers "how long after my client connected did the first byte arrive?" — the user-perceived experience. It does not depend on any voluntary emission from the agent.

### `model_invoked_at` — convention anchor for agent-side latency

The optional `model_invoked_at` anchor is a convention an agent peer may opt into by emitting an empty `token` frame with metadata declaring the anchor. The recommended shape:

```json
{
  "type": "token",
  "stream_id": "str_01J...",
  "ts": "2026-05-03T13:14:22.005Z",
  "data": "",
  "metadata": {
    "ams.convention.v1": {
      "anchor": "model_invoked",
      "model": "claude-opus-4-7",
      "provider": "anthropic"
    }
  }
}
```

A subscriber that recognizes `anchor: "model_invoked"` records the timestamp and computes:

```
TTFT_approximation = first_non_anchor_token_frame_ts - model_invoked_anchor_ts
```

The approximation has two error sources. First, the agent decides when to emit the anchor; if it emits before the actual provider call, the metric overstates latency. Second, the wire round-trip from agent to broker to subscriber adds delivery delay to both the anchor and the first non-anchor frame, but that delay is not quite identical for both, so the difference is approximate.

The convention is opt-in. An emitter that does not emit the anchor cannot have TTFT approximated. An observability subscriber that does not recognize the anchor falls back to TTFF. Neither failure breaks the wire.

### Why anchors live in metadata, not in new frame types

`PROTOCOL.md` §4.2 enumerates the server-pushed frame types. Adding a `model_invoked` frame type would expand the wire surface for an observability convention — exactly the failure mode `ams://canon/decisions/D0010-observability-via-subscriber-not-wire` rejects. The metadata slot on `token` frames is the existing extension surface. Conventions ride there; the wire does not change.

## What the Subscriber Can and Cannot Compute

| Metric | Computable from wire? | Anchor source | Honesty class |
|--------|-----------------------|---------------|---------------|
| TTFF (user-anchor) | Yes | Hook-layer `request_received_at` joined by hashed identifiers | Direct measurement |
| TTFF (within-stream) | Yes | First frame on stream A as anchor for first frame on stream B (e.g., agent A's first token to agent B's first response) | Direct measurement |
| TTFT (LLM, with anchor) | Approximation | Voluntary `anchor: "model_invoked"` frame | Approximation, bounded by emitter honesty |
| TTFT (LLM, without anchor) | **No** | (none) | Not measurable; reporting any number under this name is fabrication |
| Inter-frame intervals (within a stream) | Yes | Successive `ts` values on the stream | Direct measurement; useful for "tokens per second" when frame rate roughly tracks LLM token rate |
| End-to-end model latency | **No** | (none — happens entirely off-wire) | Not measurable at AMS layer; agent-side instrumentation only |

The "no" rows are the load-bearing part. A dashboard that displays "TTFT" for every conversation regardless of whether anchors were emitted is showing a number some of whose values are fiction. The honest dashboard either splits the column into "TTFF" and "TTFT (anchored)" or shows TTFF only and labels TTFT as "anchored conversations only."

## Schema Slot Allocation

The hook-layer schema in `observability-payload-boundary` is preserved unchanged. Latency metrics live in the **subscriber-layer** record and are computed by the subscriber from frames it receives. The recommended subscriber-layer extension:

```json
{
  "kind": "stream_first_token",
  "conversation_id": "conv_01H...",
  "stream_id": "str_01J...",
  "owner_account_id": "acc_01J...",
  "ts": "2026-05-03T13:14:22.140Z",
  "ttff_user_ms": 1235,
  "ttff_within_conversation_ms": 230,
  "ttft_anchored_ms": 132,
  "ttft_anchor_source": "ams.convention.v1.model_invoked"
}
```

`ttff_user_ms` requires a hook-layer join the subscriber may or may not perform. `ttff_within_conversation_ms` requires the subscriber to have observed an earlier anchoring frame in the same conversation. `ttft_anchored_ms` is null when no `model_invoked` anchor was observed. Subscribers that aggregate to the hook-layer-shaped Analytics Engine dataset use the existing `peer_count_at_event` slot for the latency value (consistent with the snapshot pattern in D0015) and use `event_type='stream_first_token'`, with the variant named in `endpoint_or_close_code` (e.g., `ttff_user`, `ttft_anchored`).

## Why Naming This Matters

Three failure modes the principle prevents.

**Dashboard fabrication.** A column labeled "TTFT" that is computed from "first frame on the wire minus connection time" is mislabeled when no agent invocation marker exists. The dashboard reader assumes the metric describes the model's responsiveness. The number describes the broker's responsiveness plus whatever the agent did before emitting. Two very different operational signals collapse into one column.

**Cross-deployment comparison error.** Operators comparing AMS deployments to non-streaming model APIs with native TTFT see the same name and assume the same definition. They will rank deployments incorrectly. Naming the wire metric distinctly removes the false equivalence.

**Optimization target drift.** Engineers asked to "reduce TTFT" make different changes than engineers asked to "reduce TTFF." The first targets model selection, prompt length, provider region. The second targets WebSocket handshake, DO cold start, broker-side queueing. Confusing the two sends optimization effort to the wrong place.

## What This Is Not

- Not a refusal to display LLM TTFT in any dashboard. Dashboards may display TTFT for conversations whose agents emitted the anchor and label them as such. The principle forbids silent substitution, not honest disclosure.
- Not a wire protocol change. The `model_invoked` anchor rides existing metadata. No frame types are added; no clients are required to emit anchors.
- Not a commitment to one anchor source over the other. Operators may prefer the user-facing TTFF, the anchored TTFT, or both. The principle commits to naming them honestly, not to ranking them.
- Not specific to LLM agents. A non-LLM agent (a webhook adapter, a function caller, an IoT relay) emits frames without anchors and is measured by TTFF only. The vocabulary is wire-layer general.
- Not a deprecation of `duration_ms`. The hook-layer `duration_ms` continues to mean what it means — wall-clock at the worker edge for a request-response transaction. Streaming sessions are not request-response and need the metrics this principle defines.

## See Also

- `ams://canon/decisions/D0010-observability-via-subscriber-not-wire` — the architectural commit that puts latency measurement on subscribers
- `ams://canon/decisions/D0015-state-totals-via-snapshot-worker` — sister gap-fill, same observability cluster
- `ams://canon/principles/token-count-derivation-on-subscribers` — sister gap-fill on token-count honesty
- `ams://canon/constraints/observability-payload-boundary` — the schema this principle extends
- `PROTOCOL.md` §4.2 — server-pushed frames the latency metrics observe
- `PROTOCOL.md` §4.4 — token metadata, where the anchor convention rides
- `klappy://canon/constraints/telemetry-governance` — upstream `duration_ms` definition
