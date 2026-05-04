---
uri: ams://canon/decisions/D0016-buffering-and-persistence-as-wrapper-primitive
title: "D0016 — Buffering and Persistence as a Wrapper-Layer Primitive"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: stable
tags: ["ams", "canon", "decision", "architecture", "persistence", "buffering", "edge-wrapper", "vodka-architecture", "irreversible"]
epoch: E0008.4
date: 2026-05-04
derives_from: "D0006-dream-house-wire-edge-wrappers (wrappers absorb runtime impedance; persistence is one such concern); D0009-stream-as-primitive-ownership-excludes-subscription (the broadcast unit the buffer captures); SPEC.md §5 (lifting the 'Replay / per-stream history' and 'Spill-to-storage for SessionDO buffer' deferrals); POC-INFRA.md §6.1 (the per-session ring buffer this generalizes); PATTERNS.md §2 (the wrapper pattern this instantiates); HORIZON.md §25 (the persistence-as-fabric reframe motivating the harness use case); operator↔Claude planning conversation 2026-05-04 establishing that no major model API server-buffers tokens for resumption and that production stacks rebuild the buffer-and-fan-out layer one-off (Anthropic Messages docs; Convex stack)."
complements: "D0006-dream-house-wire-edge-wrappers, D0009-stream-as-primitive-ownership-excludes-subscription, D0010-observability-via-subscriber-not-wire, D0017-selective-subscription, D0018-multi-stream-per-account-per-conversation, D0019-cross-session-continuity-via-account-conversation-keying"
governs: "Where buffering, replay, and resume capabilities live in the AMS architecture. Why the wire never persists. How wrapper classes compose with a single shared buffering primitive instead of each reinventing it. The shape of the primitive's parameters (TTL, size cap, per-stream sharding, account-gated activation) and the separation between the architectural commitment and the v1 product configuration."
status: active
---

# D0016 — Buffering and Persistence as a Wrapper-Layer Primitive

> Real-time line resilience — surviving network blips, brief reconnects, momentary subscriber disconnects — is a wrapper-layer concern, not a wire concern. The wire stays push-native, opaque, ephemeral. A single composable buffering primitive (TTL + size, per-stream sharded, account-gated) is built once and reused across every wrapper class that needs it. Long-term storage is not this primitive's job; it is a separate composable subscriber.

## Description

No major model API buffers tokens server-side. Anthropic's Messages API documents stream "resume" as a client-side reconstruct-and-re-prompt pattern (capture partial output, send it back as the seed of a continuation request). OpenAI's streaming responses behave the same way; once the client disconnects, the inflight response is gone from the client's view. Every production stack that needs resumability, multi-viewer fan-out, or refresh-survives-disconnect rebuilds the buffer-and-fan-out layer one-off — Convex documented one such build for OpenAI, Vercel ships another in its AI SDK, and every chat product that survives a browser reload has a hand-rolled equivalent.

AMS has the opportunity to make that layer a primitive instead of forcing N independent reimplementations. The decision is to do so — but to keep the layer in the wrapper tier per `D0006`, never in the wire. The Conversation DO does not learn about persistence; it broadcasts to whatever subscribes, including the persistence wrapper that captures and serves catchup.

This is a one-way door at the architectural level. Persistence is now a documented wrapper-layer primitive; new wrapper classes inherit access to it; the wire stays opaque. Reversing this would force the wire to absorb persistence semantics, breaking the dream-house abstraction `D0006` defends.

## Outline

- Why the Wire Cannot Persist
- The Primitive's Shape
- Account Gating
- Where the Primitive Lives — The `StreamBufferDO`
- How Wrappers Consume It
- Discontinuity Without a New Frame Type
- The v1 Configuration vs the Architectural Commitment
- Long-Term Storage Is a Separate Subscriber
- What This Forecloses
- What This Is Not
- Reversibility
- See Also

---

## Why the Wire Cannot Persist

`D0006` settled the layering: the wire (Conversation DO) is push-native, broadcast-only, runtime-agnostic. Adding persistence to the wire would mean the broker grows storage opinions, eviction rules, query surfaces, and tier semantics. Each of those is a runtime concern dressed up as wire infrastructure. The slippery slope `D0006` rejects activates the moment the broker learns about durability.

The alternative is the one this decision adopts: persistence is a subscriber's job. A subscriber that listens to a stream and writes what it sees to a bounded buffer is, structurally, no different from a subscriber that translates languages, redacts PII, or forwards to Slack. It is a wrapper. It composes. The wire stays unchanged.

## The Primitive's Shape

A buffering primitive has exactly four properties:

- **Per-stream sharding.** One buffer per stream. Storage is partitioned by `stream_id`. One stream's volume cannot affect another's retention.
- **TTL bound.** A configured time window. Entries older than the window are evicted FIFO as the window slides.
- **Size bound.** A configured byte cap. Once the cap is reached, oldest entries are evicted FIFO regardless of TTL.
- **Both bounds enforced.** Whichever evicts first wins. The TTL bound gives the product its semantic ("you can catch up on the last N seconds"); the size bound is a hard safety against pathological bursts.

All other behavior is opaque. The buffer captures `token` frames and `stream_metadata` frames as they flow on the wire; it serves them back, in original order, on read. It does not parse `data`, schema-validate `metadata`, branch on payload contents, or add fields. Vodka discipline holds at this layer exactly as it does at the wire layer.

## Account Gating

The buffering primitive is opt-in by account, not by conversation. A bearer credential's account is what unlocks access. A subscriber connecting without an account credential — i.e., the no-account demo path — gets no buffering at all. A subscriber connecting with an account credential gets buffering at whatever configuration the account has activated for the relevant `(account, conversation, stream)` scope. The activation source — tier subscription, ad-hoc per-stream purchase via Stripe Shared Payment Tokens, capability handed down from a parent account, or any other mechanism a future product surface introduces — is product, not architecture. The primitive does not care; it reads its parameters and enforces them.

This makes the trust boundary explicit: buffered state is account-scoped. An account's buffered data is never visible to another account. Account-level access controls (rate limits, quotas, capability provisioning) are the same controls that govern persistence access. There is no separate "persistence ACL."

The `(account_id, conversation_id)` pairing — formalized in `D0019` — is the persistent unit. A single conversation may have buffered state for many accounts simultaneously, each invisible to the others.

## Where the Primitive Lives — The `StreamBufferDO`

The reference implementation is a `StreamBufferDO`: one Durable Object per `(account_id, stream_id)` pairing where buffering is enabled. Each `StreamBufferDO`:

- Subscribes to the wire as a normal account-credentialed subscriber to the conversation containing the stream.
- Receives every `token` and `stream_metadata` frame for that stream as the wire broadcasts.
- Stores them in a ring with TTL + size eviction.
- Exposes a small read API to wrappers for catchup (`since_ts`, `last_n`, plus a cursor handed back for pagination).

This is the canonical implementation, not the only one. A different deployment substrate (a Postgres-backed service, a Redis-backed cache, an in-memory broker) could implement the same primitive contract with different storage characteristics. The pattern — per-stream subscriber that captures and serves — is the architectural commitment. The substrate is incidental.

The Conversation DO does not know `StreamBufferDO` exists. From its perspective, a `StreamBufferDO` is one more WebSocket-holding subscriber, identical to any other.

## How Wrappers Consume It

Wrappers that want catchup behavior issue a single read against the `StreamBufferDO` at attach time, then open their normal wire connection. The pattern is two-step, with no Conversation DO routing change:

1. Wrapper reads from `StreamBufferDO` with `since_ts` or `last_n`. Receives buffered events.
2. Wrapper opens the wire WebSocket per `PROTOCOL.md` §4.1. Receives live events from that point.

A cursor is handed back at the end of the buffered read; the wrapper deduplicates by cursor at the join point in case any events arrived between the buffered read and the wire connect. A small overlap is preferred over a small gap. The cursor format is `<unix_ms>-<stream_local_seq>`: plain text, sortable, debuggable, no opaque encoding.

The MCP edge wrapper (`POC-INFRA.md` §4) is the first consumer. `ams_join` accepts optional `since_ts` and `last_n` parameters that drive a `StreamBufferDO` read before the WebSocket opens. The read happens once per join; live events flow through the existing notification channel. No new tools are added; the existing surface is parameterized.

## Discontinuity Without a New Frame Type

When a wrapper detects an upstream interruption — for example, a model-adapter harness whose connection to Anthropic dropped mid-completion — it does not emit a new wire frame type. It calls `set_metadata` per `PROTOCOL.md` §4.4 with a metadata document that announces the discontinuity (e.g. `{ "upstream_state": "interrupted", "recovery_attempt": 1, "last_clean_ts": "..." }`), and another `set_metadata` when recovery succeeds (`{ "upstream_state": "active" }`). Subscribers see normal `stream_metadata` frames and decode their semantics application-side.

The wire learns nothing new. Every "wrapper wants to announce something about itself" use case — discontinuity, rate-limited, model-switched, paused, capability-changed — uses this same primitive. We do not grow a frame type per concept.

The buffering primitive captures `stream_metadata` frames alongside `token` frames, so a subscriber catching up after a window of activity sees the discontinuity announcements in the order they occurred relative to the tokens.

## The v1 Configuration vs the Architectural Commitment

This decision commits to the primitive. The configuration of the primitive — what TTL and size cap to ship with — is a separate concern that lives outside canon, in `POC-INFRA.md` or a configuration document.

The v1 configuration is intentionally conservative: **1 minute TTL, 1 MB size cap, per stream**. This is aimed, not pinched. The buffer is for real-time line resilience (network blip, brief reconnect, wifi handoff), not for asynchronous catchup across long gaps. At a 1-minute window, that target is met. Use cases requiring longer windows are deferred to future tier definitions; if and when they materialize, the configuration parameters change without canon edits.

The product reasoning behind starting tight: it is harder to retract a generous offering than to extend a conservative one. Tier expansion is a credible path; tier contraction is a community-trust event. Start where the cost ceiling is known and the use case is provable; grow as demand pulls.

Tier definitions, concurrency caps (conversations per account, streams per conversation per account, subscribers per stream), and pricing-model choice (subscription vs metered) are all explicitly out of scope for this decision and out of scope for canon at this stage. They are market-research questions to be resolved by product evidence, not architectural fiat. The primitive is shaped to accommodate whatever tier structure eventually wins.

## Long-Term Storage Is a Separate Subscriber

This primitive is real-time, time-bounded, and ephemeral by design. The TTL ceiling at any tier is on the order of hours, not days or months. Anyone needing forever-persistence attaches an archive subscriber: a separate wrapper class that joins the conversation, captures everything to its own durable backend (R2, S3, Postgres, the operator's choice), and exposes whatever query surface its operator builds.

The archive subscriber is a separate composable concern. It does not depend on the buffering primitive for ongoing ingest (it subscribes to the live wire). It MAY use the buffering primitive's catchup window when it first attaches to recover the recent past, then becomes a normal live subscriber. Two pipes, independently composed, neither knows about the other.

`PATTERNS.md` §3 documents the archive-subscriber pattern as a sibling to this primitive. The two together cover real-time resilience (this decision) and durable archival (the archive subscriber pattern), without either layer growing the other's responsibilities.

## What This Forecloses

- The Conversation DO cannot grow buffering, replay, or persistence semantics within a major version. Doing so would compromise its purity and break the wrapper-pattern abstraction.
- The wire cannot adopt structured frame types for upstream discontinuity, recovery state, rate-limit signaling, or other wrapper-level announcements. These all use `set_metadata`.
- Persistence is not a wire-layer feature. Subscribers without account credentials see no buffering. The wire's broadcast remains stateless.
- Long-term storage (durations beyond the configured TTL ceiling) is not this primitive's responsibility. Archive subscribers handle that.

## What This Is Not

- **Not long-term storage.** The primitive is a real-time resilience buffer.
- **Not asynchronous messaging.** Tokens are not delivered to subscribers who weren't connected when they were emitted; they are available for catchup by subscribers who reconnect within the TTL window. A subscriber that has never connected sees nothing.
- **Not a substitute for client-side resilience.** Subscribers that want guarantees beyond the TTL ceiling, or that need to survive AMS-side outages, must implement their own client-side capture or attach a personal archive subscriber.
- **Not a feature of the wire.** A conformant AMS implementation per `PROTOCOL.md` §7 may ship without the buffering primitive at all. The primitive is a documented wrapper-layer pattern, not a protocol obligation.

## Reversibility

**One-way door at the architectural level.** Once the wrapper boundary holds buffering, runtime authors expect it to keep holding it; reversing would force the wire to absorb the concern.

**Two-way door at the configuration level.** TTL, size cap, account tier mappings are all configuration values. They can be tuned upward or downward without canon edits, governed by product policy and operational signals.

The asymmetry matters: the architectural commitment is a load-bearing wall; the configuration is a knob.

## See Also

- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` — the parent architectural commitment this implements
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — the broadcast unit the buffer captures
- `ams://canon/decisions/D0017-selective-subscription` — the wire feature that lets wrappers attach to specific streams; composes with this primitive
- `ams://canon/decisions/D0018-multi-stream-per-account-per-conversation` — the deferral lifting that makes per-stream buffering scale across multi-instance agent topologies
- `ams://canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying` — the Session DO re-keying that lets buffered state outlive any individual MCP transport session
- `PROTOCOL.md` §4.4 — the `set_metadata` primitive used for discontinuity announcements
- `PATTERNS.md` §2 — the wrapper pattern this instantiates
- `PATTERNS.md` §3 — the archive subscriber pattern (companion, not contained)
- `POC-INFRA.md` §4, §6.1 — the MCP edge wrapper, first consumer of this primitive
- `SPEC.md` §5 — the deferred items this lifts ("Replay / per-stream history", "Spill-to-storage for SessionDO buffer")
- `HORIZON.md` §25 — the harness-as-fabric reframe motivating persistent streams as a substrate
