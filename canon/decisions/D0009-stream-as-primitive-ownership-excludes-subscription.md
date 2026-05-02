---
uri: ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription
title: "D0009 — The Stream Is the Primitive: Ownership Structurally Excludes Subscription"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: stable
tags: ["ams", "canon", "decision", "stream", "ownership", "subscription", "wire", "concurrency", "composition", "vodka-architecture", "irreversible"]
epoch: E0008.4
date: 2026-05-01
derives_from: "first-principles redesign of the AMS wire delivery model; supersedes the echo-and-filter premise inherited from chat-shaped messaging systems. Resolves the open architectural tension between two-agent conversation framing and concurrent multi-stream parallelism."
supersedes: "ams://canon/principles/own-stream-echo-must-be-filtered (entire premise removed)"
governs: "How tokens are delivered. Who receives what. The shape of every subscriber. The wire's broadcast rule. Cannot be reversed without breaking the entire admission and broadcast model."
status: active
---

# D0009 — The Stream Is the Primitive: Ownership Structurally Excludes Subscription

> A stream has exactly one owning account. Ownership and subscription are mutually exclusive: the wire never delivers a stream's tokens to its owning account. Conversation is a convenience grouping that lets streams discover each other through a shared admission token — not a unit of broadcast. The wire delivers stream-by-stream. Concurrency, composition, and downstream re-routing fall out of this primitive without further mechanism.

## Description

AMS is built on streams. A stream is the load-bearing primitive — the thing the wire actually moves tokens for. Everything else (conversations, subscribers, wrappers, observers) is a layer arranged around streams.

Each stream has exactly one owning account. The owner emits; everyone else who has admission to a stream may subscribe to read it. **An owning account cannot subscribe to its own stream.** This is not a behavioral rule for subscribers to follow at runtime — it is a structural property of registration. The wire never delivers a stream's tokens back to its owner. There is no echo to filter, no loop to break, no discipline to maintain.

Conversation is a convenience layer. It is a shared admission token that lets a set of streams find each other and become a coherent multi-party group. Conversation is not the unit of broadcast — the wire does not "broadcast to a conversation." The wire delivers a stream's tokens to that stream's subscribers, full stop. Conversation membership is how subscribers discover which streams they have admission to.

This design choice unlocks three properties at the primitive level:

- **True concurrent emission.** Many streams in a conversation can emit in parallel with no turn-taking, no race conditions, and no self-feedback loops. A thousand streams emitting simultaneously is structurally identical to one stream emitting once.
- **Composition.** Streams can be re-piped, aggregated, chained, and re-routed across conversations downstream. The primitive is composable because subscription is a separate act from ownership.
- **Wrapper simplicity.** Edge wrappers and harnesses do not need to filter, deduplicate, or maintain emit-history state. Their input boundary is exactly what the wire delivers.

## Outline

- The Axiom
- Why Ownership Excludes Subscription
- What Falls Out For Free
- Hard Cases Resolved
- Relationship to Existing Canon
- What This Forecloses
- What This Is Not

---

## The Axiom

> **The stream is the primitive. Ownership and subscription are mutually exclusive states. The wire delivers stream-by-stream and structurally excludes self-delivery. Conversation is a convenience grouping for stream discovery, not a unit of broadcast.**

Every other rule in AMS is downstream of this. If a future canon doc, protocol revision, or implementation behavior contradicts this axiom, the axiom wins.

## Why Ownership Excludes Subscription

The previous canon (`ams://canon/principles/own-stream-echo-must-be-filtered`) treated self-echo as a wire feature with three justifications: uniform buffering, emit confirmation, and polymorphic-subscriber convenience. Each was a real benefit, but each was also a behavioral burden moved onto subscribers — every conversational AI, every wrapper, every harness had to remember to filter on `owner_account_id` before treating a token as input. The principle existed because the design did not.

Moving the constraint from subscriber discipline to wire structure produces a strictly simpler system:

- **Subscribers do not implement filtering logic.** What arrives is what they should act on. There is no class of bug that comes from forgetting to filter; the bug is unrepresentable at the wire layer.
- **Wrappers do not carry filtering state.** No `owner_account_id` comparison, no input-boundary echo defense, no per-frame ownership check.
- **The "naive subscriber" failure mode is eliminated.** A first-time implementer wiring a conversational AI to AMS cannot accidentally create the self-response loop that took down the demo gate before the principle doc existed.
- **The wire's contract gets clearer.** "I deliver to subscribers" is now exhaustively true; there is no asterisk for the owner's reflection.

The benefits the echo previously provided are preserved or replaced cleanly:

- **Uniform buffering** is no longer needed because there is no second case to unify. A subscriber's input buffer holds inbound tokens; an emitter's emit buffer holds tokens it has sent. They are different buffers because they are different things.
- **Emit confirmation** is handled by D0009's emit-confirmation rule (fire-and-forget v1; optional receipts deferred). See "Hard Cases Resolved" below.
- **Polymorphic-subscriber convenience** is handled by allowing accounts to opt into subscribing to streams they own. See "Hard Cases Resolved" below.

## What Falls Out For Free

These properties are no longer features that need separate engineering — they are direct consequences of the axiom:

- **Concurrent emission with no turn-taking.** Two agents (or two thousand) can emit simultaneously. No collision, no ordering hazard at the application layer, no special pattern required. Per-stream ordering is preserved by the wire; cross-stream ordering is whatever the broadcast loop produces — and that is fine, because the streams are distinct logical entities.
- **No self-feedback loops at the wire layer.** The infinite-loop failure mode that the echo-filter principle was preventing cannot occur. A subscriber cannot receive its own emission, so it cannot respond to its own emission.
- **Composition across conversations.** A stream is identified by ownership and admission, not by conversation membership. Future patterns — piping a stream's output into a different conversation, aggregating multiple streams into a derived stream, chaining streams in a pipeline — are unblocked because the primitive does not bind streams to conversations as a hard structural fact.
- **Pluggable subscriber types stay pluggable.** Loggers, observers, replay sinks, audit sinks all work without special-casing. They are accounts that subscribe to streams. The fact that a logger is "watching" a stream is identical, mechanically, to a peer subscribing to it.

## Hard Cases Resolved

The following four cases were surfaced during planning. Each is settled by this decision; future canon revisions inherit these defaults.

### 1. Emit Confirmation

**Decision: Fire-and-forget is the v1 default.** When an account emits a token, the wire accepts it for broadcast and the emitter proceeds without waiting for an acknowledgment. There is no echo to confirm receipt and no separate ack frame in v1.

**Rationale:** Adding mandatory acknowledgment would impose a round-trip latency on every emission and require a new frame type. Fire-and-forget keeps the emit path minimal and matches the throughput needs of streaming token-by-token output.

**Deferred, not foreclosed:** If an orchestration or audit use case surfaces a need for explicit emit confirmation, an optional receipt mechanism may be added later — most likely as an opt-in MAY in wire-conformance, not a MUST. The default remains fire-and-forget.

### 2. Self-Observability

**Decision: Possible but optional. Ownership excludes subscription by default; a subscriber may opt into subscribing to a stream they own if they have a use case for it.**

**Rationale:** Most accounts do not need to read what they emitted — they already have the data in their emit buffer. The default of structural exclusion keeps the common case clean. The optional opt-in preserves the door for legitimate edge cases (debug introspection, certain replay patterns) without making them a wire-level concern.

**What this replaces:** The previous canon defended the wire-level echo specifically because loggers, observers, and replay sinks wanted self-visibility. Under D0009, those subscribers are separate accounts that subscribe to the streams they observe — which is structurally cleaner anyway, because a logger's audit trail should not depend on whether the logger happens to share an account with the producer.

### 3. Subscription Granularity

**Decision: The default is "subscribe to all streams in the conversation except those I own." Optional metadata-driven filtering is supported for subscribers who want finer control.**

**Rationale:** The default matches the common case (two agents plus a human operator, or a small set of peers all consuming each other's output). Metadata on streams (entity name, agent role, IoT device class, arbitrary application-defined fields) lets subscribers selectively attach when they need to — without making selection a mandatory step for the common case.

**Implication:** A subscriber may attach to a conversation and receive every stream it does not own (default), or attach selectively to specific streams by ID or by metadata predicate (optional). Both modes are supported; both produce the same per-stream delivery semantics.

### 4. Multi-Stream Per Account

**Decision: One stream per account per conversation remains the v1 default. The model does not block multi-stream-per-account, and a future revision may introduce it when a use case lands.**

**Rationale:** Single-stream-per-account keeps the v1 mental model simple and matches every use case currently in scope. The axiom (ownership excludes subscription) extends naturally to multi-stream: an account that owns N streams in a conversation does not subscribe to any of those N streams. No special handling required.

**Implication:** This decision does not need to be revisited to enable multi-stream later. The primitive already supports it; the v1 spec just chooses not to expose it yet.

## Relationship to Existing Canon

- **D0003 (Per-Account Stream Ownership) is preserved.** Its emission rule — "only the owning account may emit on a stream" — is untouched and reinforced. Its read-side language ("every other subscriber in the conversation reads it") is *strengthened* into a structural exclusion: the owner is not a subscriber. D0003's `irreversible` tag remains correct; D0009 deepens the model rather than reversing it.
- **The echo-filter principle is superseded.** `ams://canon/principles/own-stream-echo-must-be-filtered` describes a behavioral discipline that becomes unnecessary under D0009. The principle doc is to be deprecated and replaced with a brief note pointing here. Subscribers built before D0009 that filter their own emissions remain correct under D0009 — the filter just becomes a no-op because the wire never sends self-echoes.
- **Wire conformance changes.** `ams://canon/constraints/wire-conformance` MUST #4 currently reads: "Broadcast every token emitted on any stream in a conversation to every connected subscriber on that conversation." Under D0009 this becomes: "Broadcast every token emitted on a stream to every subscriber of that stream, where the stream's owning account is not a subscriber by default." Per-stream ordering guarantees are unchanged.
- **PROTOCOL.md §4.1 changes.** The wire spec must be updated to reflect stream-scoped broadcast and the structural exclusion of self-delivery.
- **Two-agent conversation conventions** (`ams://canon/constraints/two-agent-conversation-conventions`) require revision: the convention layer no longer needs to name echo-filter as a recommendation. The two-agent pattern becomes one specific case of the more general concurrent-multi-stream model.
- **MCP wrapper conformance** (`ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai`) simplifies: the wrapper no longer needs to surface or implement echo filtering. Wrapper responsibilities become strictly translation — wire frames in, model invocations out, model output back to wire emit.
- **Operator-as-subscriber** (`ams://canon/principles/operator-as-subscriber`) is unaffected as a principle. The operator joins as a separate account-stream and reads peer streams; this works identically under D0009.

## What This Forecloses

D0009 is irreversible because reversing it would require:

- Restoring wire-level self-echo, which would re-introduce the entire class of subscriber-discipline failure modes the axiom was designed to eliminate.
- Re-coupling broadcast scope to conversation membership rather than stream subscription, which would foreclose downstream composition (streams across conversations, aggregation, chaining).
- Forcing subscribers to re-implement input filtering, which would re-introduce the wrapper complexity D0009 strips away.

Each of these would cascade through every layer of the implementation. D0009 is a one-way door.

Specifically, AMS will not, within this major version:

- Ship a wire mode that delivers a stream's tokens back to its owning account by default.
- Couple broadcast to conversation membership in a way that prevents streams from being plumbed across conversations later.
- Require subscribers to perform owner-vs-self filtering as a conformance condition.

## What This Is Not

- **Not a constraint on subscribers ever reading their own streams.** A subscriber that has a legitimate use case can opt into subscribing to a stream it owns. The default is exclusion; the door is open.
- **Not a removal of conversation as a primitive.** Conversation remains a first-class concept — it is the admission boundary, the discovery mechanism, and the unit of magic-link addressing. It is just no longer the unit of broadcast.
- **Not a claim that turn-taking is wrong.** Two-agent turn-taking conversation remains a valid and supported pattern. It is now one application of the underlying primitive, not the primitive itself.
- **Not a change to the security model.** D0003's authorization rule (only owners write) is preserved exactly. D0009 strengthens read-side semantics without weakening write-side enforcement.
- **Not an opinion on application-layer conventions.** Loop termination, capability negotiation, turn signaling, and similar patterns remain the responsibility of convention canon and individual applications. D0009 governs the wire; conventions layer on top.

## See Also

- `ams://canon/decisions/D0003-per-account-stream-ownership` — the emission-ownership rule, preserved and reinforced
- `ams://canon/principles/own-stream-echo-must-be-filtered` — superseded; to be deprecated
- `ams://canon/constraints/wire-conformance` — MUST #4 to be revised under D0009
- `ams://canon/constraints/two-agent-conversation-conventions` — to be revised; two-agent becomes one case of the general model
- `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai` — simplifies under D0009
- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` — wire/edge boundary remains as described, with the wire spec revised per this decision
- `PROTOCOL.md` §4.1, §7 — wire spec to be updated
