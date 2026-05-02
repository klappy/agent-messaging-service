---
uri: ams://canon/principles/observability-as-subscriber
title: "Observability as Subscriber — Watchers Join the Conversation, They Are Not the Wire"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "principle", "observability", "subscriber-pattern", "polymorphic", "hooks", "infrastructure"]
epoch: E0008.3
date: 2026-05-01
derives_from: "AMS.md §3 (polymorphic subscribers), GLOSSARY.md (Polymorphic subscriber, DOLCHE journal), PATTERNS.md §3 (Observability sink), ARCHITECTURE.md §8"
complements: "ams://canon/decisions/D0010-observability-via-subscriber-not-wire, ams://canon/constraints/observability-payload-boundary, ams://canon/principles/operator-as-subscriber, ams://canon/principles/own-stream-echo-must-be-filtered"
governs: "How an observability service participates in AMS conversations and where broker-side hooks fill what subscribers cannot see. Recommended convention; observability sinks may operate under different conventions if they declare them."
status: active
---

# Observability as Subscriber — Watchers Join the Conversation, They Are Not the Wire

> An observability service joins each conversation it watches as a polymorphic subscriber, with a magic link and an account credential, exactly like an agent peer. The wire's existing broadcast hands it the structural-identifier set the upstream telemetry doctrine asks for. Broker hooks fill in only what no subscriber can see. The two layers cooperate without overlapping.

## Description

`PATTERNS.md` §3 names the observability sink as a future pattern. `ARCHITECTURE.md` §8 stages it as a post-PoC layer that subscribes to conversations and emits metadata into a journal store. The polymorphic-subscriber decision in `AMS.md` §3 makes it a first-class participant rather than a privileged role. This principle documents how that pattern operates.

The pattern has two cooperating halves. The bolt-on half is a subscriber that joins conversations and ships frame-shaped records to a sink. The built-in half is a thin telemetry hook in the Worker and ConversationDO that records control-plane and DO-lifecycle events the subscriber cannot see. Together they cover everything the operator needs to know about activity on the broker. Apart they each do their own job and remain individually removable.

The principle is convention. Observability services may operate under different conventions if they declare them in their stream metadata. The convention here is the recommended default for the v1 use case.

## Outline

- The Recommended Subscriber Pattern
- The Recommended Hook Pattern
- Why the Two Halves Do Not Overlap
- The Observability Subscriber's Capabilities Declaration
- Failure Modes the Pattern Prevents
- What This Is Not

---

## The Recommended Subscriber Pattern

An observability subscriber operates as follows.

1. The operator provisions the subscriber with an AMS account credential. The credential identifies the subscriber to the broker; it does not authorize cross-conversation access.
2. The subscriber receives magic links for the conversations it should observe. Magic links arrive through whatever channel the operator chooses: a configuration file, a control plane the operator runs, conversation creators directly invoking the subscriber's intake API. The wire takes no opinion on the discovery mechanism.
3. For each magic link, the subscriber connects via WebSocket like any other peer. It sets stream metadata declaring `role: "observability_sink"` and a `posture` describing what it intends to do (see schema below).
4. The subscriber emits no tokens. Its stream stays silent for the conversation's lifetime.
5. The subscriber consumes every server-pushed frame, applies own-stream filtering per `ams://canon/principles/own-stream-echo-must-be-filtered`, redacts payload contents per `ams://canon/constraints/observability-payload-boundary`, and ships frame-shaped records to its configured sink.
6. When a conversation closes (last subscriber leaves, or the observability subscriber's session is terminated), the subscriber records the close as the final event for that conversation and disconnects.

The pattern works without modification for an observability service watching one conversation, a thousand conversations, or every conversation an operator owns. Scaling is a property of the subscriber's runtime, not of the wire.

## The Recommended Hook Pattern

The Worker and the ConversationDO call a single telemetry primitive (in the reference implementation, `env.AMS_TELEMETRY.writeDataPoint()`) at events that produce no broadcast frame. The recommended event set:

- **Account creation** at `POST /v1/accounts` — succeeded and failed.
- **Conversation minting** at `POST /v1/{ns}/conversations` — succeeded and failed.
- **Conversation inspection** at `GET /v1/{ns}/conversations/{alias}` — succeeded and failed.
- **WebSocket upgrade attempts** — succeeded, and failed with each close code from `PROTOCOL.md` §6.
- **DO lifecycle** — created, hibernated, evicted, when the runtime exposes these.
- **Sustained backpressure** — when a `4290` close fires.

Each call writes the structural-identifier set described in `ams://canon/constraints/observability-payload-boundary` §"The Hook-Layer Schema" to the configured sink. The call is asynchronous, non-blocking, and adds no latency to the path it instruments. The hook is removable; deleting every call leaves the wire conformant and the subscriber layer fully functional.

## Why the Two Halves Do Not Overlap

The split assigns each event class to exactly one layer:

- A `token` arrives on a stream → the subscriber records it. The hook does nothing.
- A subscriber successfully joins → the wire emits `joined` and `stream_joined` frames; the subscriber records both. The hook records the WS-upgrade-success at the control plane, but the upgrade record carries no conversation-lifecycle meaning — it captures only the broker-side fact that an HTTPS request was upgraded.
- A subscriber's join is rejected for a bad credential → the wire emits nothing; the hook records a `connect_failed` with close code 4002. The subscriber sees nothing because no broadcast happens.
- A conversation's metadata is set at mint → the conversation creator sees nothing on the wire (the conversation is empty); the hook records the mint as a control-plane event. When the first subscriber joins, the wire emits `joined` carrying that conversation metadata; that subscriber records it.
- A DO is evicted under load → no subscriber sees this directly; the hook records the eviction. When connections re-establish to the rebuilt DO, subscribers see new `joined` frames and record those.

The non-overlap test runs in both directions. If a proposed observability event would be recorded only by the hook for an event that produces a wire broadcast, the broadcast was forgotten. If a proposed event would be recorded by both layers, one layer is redundant and must be cut.

## The Observability Subscriber's Capabilities Declaration

An observability subscriber declares itself in stream metadata via the `capabilities` well-known key (`PROTOCOL.md` §4.4). The recommended schema:

```json
{
  "capabilities": {
    "ams.convention.v1": {
      "role": "observability_sink",
      "posture": "passive",
      "scope": ["lifecycle", "structural"],
      "redaction": "payload-and-metadata-values",
      "sink": "external"
    },
    "annotations": {
      "display_name": "klappy DOLCHE Journal",
      "operator": "ops@klappy.dev",
      "policy_url": "https://klappy.dev/observability-policy"
    }
  }
}
```

Field meanings:

- **`role: "observability_sink"`** — signals to peers that this subscriber consumes the broadcast for observation purposes and does not participate in the conversation's dialogue.
- **`posture`** is one of:
  - `passive` — the sink receives, redacts, ships. It will not emit tokens.
  - `participant` — the sink may emit a small set of operator-defined tokens (e.g., a final `end_of_conversation` from a moderator-attached observer). Rare; declared explicitly when used.
- **`scope`** declares what the sink ships, drawn from:
  - `lifecycle` — `joined`, `stream_joined`, `stream_left`
  - `structural` — `token` records as `{stream_id, owner_account_id, ts, bytes}`, no `data`
  - `metadata-shape` — `stream_metadata` records as `{keys, capabilities_convention_name}`, no values
- **`redaction`** declares the payload-handling commitment:
  - `payload-and-metadata-values` — recommended default; matches `ams://canon/constraints/observability-payload-boundary`
  - any other value names a custom redaction policy that must be linked from `policy_url`
- **`sink`** declares where data goes:
  - `external` — operator-controlled sink off-broker
  - `in-broker` — Cloudflare Analytics Engine instance bound to the same Worker (the hook layer pattern, but operated as a subscriber)
- **`policy_url`** — link to the operator's observability policy, mirroring the upstream `x-oddkit-policy-url` pattern

Peers that recognize the `observability_sink` role may adapt their behavior. A conversational AI may choose to ignore the observability subscriber for turn-taking purposes (the subscriber will not emit, so it does not take turns). A moderator-posture operator may choose to inform peers of the observer's presence as a dialogue convention rather than a wire requirement.

## Failure Modes the Pattern Prevents

- **Wire-feature creep.** Without the subscriber pattern, the natural drift is to add observability frames to the wire. That commits AMS to an opinion on what to observe and forces every implementation to support frames most subscribers do not need. The subscriber pattern keeps the wire clean.
- **Subscriber-only blind spots.** Without the hook layer, failed admissions, control-plane activity, and DO health become invisible. An operator looking at the subscriber sink alone would conclude the broker is healthy when it is dropping a quarter of its connection attempts.
- **Dual-recording inflation.** Without the non-overlap discipline, the same event lands in both sinks and aggregations double-count. The discipline assigns each event class once and keeps the math honest.
- **Unannounced observers.** Without the `role: "observability_sink"` declaration, peers cannot adapt their behavior or audit who is in the room. The declaration is convention, not enforcement, but it is the difference between a known watcher and a hidden one.
- **Payload leaks through observers.** Without the boundary in `ams://canon/constraints/observability-payload-boundary`, an observer that captures `data` becomes a single point of compromise for every conversation it watches. The boundary is the safety contract observers commit to.
- **Observer self-loops.** An observability subscriber that re-emits redacted versions of received tokens (e.g., for downstream consumers) without filtering own-stream echo creates a loop with itself. `ams://canon/principles/own-stream-echo-must-be-filtered` names this case explicitly.

## What This Is Not

- Not a requirement that every conversation be observed. A conversation may run with no observability subscriber at all and remains conformant. The pattern documents how to observe, not whether to.
- Not a wire-level role assignment. The wire does not check the `role` value in metadata. Peers that ignore the role and treat the observability subscriber as a regular peer remain conformant; the convention exists for well-behaved interop, not enforcement.
- Not specific to two-agent conversations. The pattern works for many-agent conversations, harnessed-agent setups, and conversations with no agents at all (e.g., a webhook adapter relaying tokens between two non-AI services).
- Not a replacement for application-level audit logs. A subscriber that needs cryptographic audit guarantees beyond what the broadcast provides builds them on top, typically by signing each emitted token at the application layer. The pattern provides observation, not attestation.
- Not a replacement for the hook layer. Subscribers and hooks are complements; either alone is incomplete. An operator that ships only one half is recording only half of what is happening.

## See Also

- `AMS.md` §3 — polymorphic subscriber definition
- `ARCHITECTURE.md` §8 — the PoC observability staging this principle formalizes
- `PATTERNS.md` §3 — observability sink as a future pattern
- `GLOSSARY.md` — "Polymorphic subscriber", "DOLCHE journal"
- `ams://canon/decisions/D0010-observability-via-subscriber-not-wire` — the architectural decision this principle operates under
- `ams://canon/constraints/observability-payload-boundary` — the safety contract
- `ams://canon/principles/operator-as-subscriber` — the cousin pattern for human operators (different role, same polymorphic-subscriber base)
- `ams://canon/principles/own-stream-echo-must-be-filtered` — observability subscribers are named as a filter-required class
- `ams://canon/constraints/two-agent-conversation-conventions` — where the `observability_sink` role registers in the convention's role enum
- `klappy://canon/constraints/telemetry-governance` — upstream telemetry doctrine; the hook layer mirrors its schema
