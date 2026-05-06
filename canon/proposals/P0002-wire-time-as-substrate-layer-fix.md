---
uri: ams://canon/proposals/P0002-wire-time-as-substrate-layer-fix
title: "P0002 — Wire Time as Substrate-Layer Fix to Time Blindness (PROPOSED)"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: evolving
tags: ["ams", "canon", "proposal", "wire", "protocol", "time", "ts", "frame-layer", "substrate", "stateless-agents", "vodka-architecture", "epistemic-primitive"]
epoch: E0008.4
date: 2026-05-06
derives_from: "ams://canon/decisions/D0020-agents-as-customer-and-third-party-vas-substrate (substrate vs. application test); ams://canon/decisions/D0001-tokens-not-messages (the wire unit `ts` describes — tokens-not-messages establishes that the broker treats `data` as opaque, leaving the envelope as the natural place for broker-stamped fields); ams://canon/constraints/wire-conformance (the MUST/MAY surface this proposal patches); ams://canon/principles/vodka-architecture-applied (the discipline the broker-stamping respects); ams://canon/principles/operator-as-subscriber (the polymorphic-subscriber model wire-time treats uniformly); klappy://canon/observations/time-blindness-axiom-violation (the upstream canon this applies one layer down); klappy://writings/we-forgot-to-give-ai-a-clock (the lineage essay); klappy://docs/appendices/epoch-8-2 (the server_time-in-every-response precedent oddkit established); operator↔Claude planning conversation 2026-05-06 establishing frame-layer-not-payload placement, the maturation ladder of cautiously-extensible→optional→required, the discovery that `ts` already exists in PROTOCOL.md §4.2 unspecified, and the orthogonal-VAS thesis under which broker-stamped time is the foundation for replay-cursor, exactly-once-dedup, presence-with-last-seen primitives"
governs: "If promoted: the semantics of broker-stamped time on AMS server-pushed frames; which frames carry `ts`; the conformance commitment around `ts`; whether sender-claimed time gets a separate slot; the maturation path from current under-specification to load-bearing protocol primitive."
status: proposed
---

# P0002 — Wire Time as Substrate-Layer Fix to Time Blindness (PROPOSED)

> The broker already stamps `ts` on outbound `token` frames at the moment of broadcast. The semantics are unspecified, the conformance is silent, and three other server-pushed frames (`joined`, `stream_joined`, `stream_left`) don't carry it at all. This proposal elevates `ts` from documented-by-example to load-bearing protocol primitive — broker-stamped UTC, monotonic per stream, on every state-event frame — and motivates the lift as the substrate-layer fix to the same time-blindness axiom violation oddkit identified at the tool layer. It is the foundation that makes downstream VAS primitives (replay cursor, exactly-once dedup, presence-with-last-seen) coherent.

## Description

The chat completion message format every AI model uses to perceive conversation history has no timestamps. Every chat app since IRC in 1988 timestamps messages; every database row has `created_at`; every web server log starts with a timestamp. The agent-conversation format is the exception, and the consequence is documented in `klappy://canon/observations/time-blindness-axiom-violation` — models cannot observe time, so they fabricate timelines from context clues. oddkit responded by stamping `server_time` in every tool response and shipping `oddkit_time` as a stateless tool. The fix worked at the tool layer.

AMS is one layer down. AMS is itself a messaging format — agents emit tokens, AMS routes them, peers receive. The same time-blindness applies: a stateless or memory-compressed agent receiving a stream of token frames cannot reconstruct the chronology of those tokens from its own state. It needs the wire to carry the clock.

The wire already does, partially. PROTOCOL.md §4.2 shows `ts` on `token` and `stream_metadata` server-pushed frames. The reference implementation stamps `ts` with `new Date().toISOString()` at the broadcast site (`worker/src/conversation.ts` ~L188) immediately before sending. Every subscriber attached to a stream receives the same `ts` value for a given emit. This is broker-authoritative time at the frame layer, never inside the `data` payload.

What's missing is the contract. Wire-conformance §7 says nothing about `ts` — not in MUST, MUST-NOT, or MAY. The semantics are entirely unspecified: who stamps it, what clock, what precision, what monotonicity guarantees, what subscribers can rely on. An implementation could omit it, fill it from a sender-supplied value, or stamp at any internal moment, all without violating conformance. This proposal specifies the semantics, expands `ts` coverage to the remaining server-pushed state-event frames, and lifts the field to a conformance MUST.

## Outline

- The Discovery — `ts` Already Exists; the Contract Is Silent
- What This Proposes
- Why This Is the Substrate-Layer Fix
- Frame Coverage — Which Server-Pushed Frames Carry `ts`
- Semantics — Who Stamps, What Clock, What Monotonicity
- Conformance Patch
- Compositions — What This Enables Without Imposing
- Maturation Ladder
- Open Questions
- Rejected Alternatives
- What This Proposes vs. What This Does Not
- See Also

---

## The Discovery — `ts` Already Exists; the Contract Is Silent

PROTOCOL.md §4.2 documents `ts` as an ISO 8601 string on `token` and `stream_metadata` server-pushed frames. Reference implementation: `worker/src/conversation.ts` constructs the outbound `token` `wire` string with `ts: new Date().toISOString()` at broadcast time and sends the same string to every attached subscriber. The field is plumbed; the discipline isn't. Three other server-pushed frames don't carry it: `joined`, `stream_joined`, `stream_left`. The `stream_metadata` broadcast path itself is also currently a no-op in the reference (the in-flight `set_metadata` write surface hasn't shipped yet); the spec example showing `ts` on it is aspirational.

The work is therefore not "add a new primitive." It is "elevate an existing under-specified field, expand its coverage, and pin its contract."

## What This Proposes

1. **Specify `ts` semantics** in PROTOCOL.md §4.2: broker-stamped at the moment of frame construction (just before broadcast); UTC; ISO 8601 with millisecond precision floor; not derived from any sender-supplied value; monotonically non-decreasing within a single stream.
2. **Expand frame coverage** to add `ts` on `joined`, `stream_joined`, and `stream_left`. Keep it on `token` and `stream_metadata` (where it already lives, modulo `stream_metadata`'s broadcast path landing). Do not add to `pong` (control echo, not a state event).
3. **Lift `ts` to conformance MUST** in `ams://canon/constraints/wire-conformance`. A conforming broker must stamp `ts` on every state-event server-pushed frame; the value must be UTC ISO 8601 with millisecond-or-better precision; values within a single stream must be monotonically non-decreasing.
4. **Prohibit sender-claimed `ts`** at the wire layer. The broker's `ts` is not derived from anything the client sends. If sender-claimed time is ever wanted (skew detection, claim-vs-stamped delta), it gets a different field name in a separate proposal — not this one.
5. **Document the lineage** in a companion canon decision: this is the substrate-layer application of the same time-blindness fix `oddkit_time` and `server_time` made at the tool layer. The decision encodes why the wire takes responsibility for time, why it is broker-authoritative, and why the orthogonal-VAS thesis depends on it.

## Why This Is the Substrate-Layer Fix

`klappy://canon/observations/time-blindness-axiom-violation` names the problem: models infer time from context clues; this violates Axiom 1 (Reality Is Sovereign) and Axiom 4 (You Cannot Verify What You Did Not Observe). The implementation insight from `klappy://writings/we-forgot-to-give-ai-a-clock` is that the fix has three possible layers: a tool the model can call (`oddkit_time`), a skill that teaches discipline, a harness that injects time evidence automatically. The essay's punchline: *the real fix is upstream — timestamps in the message format.*

AMS is the message format for agent-to-agent communication. The fix the essay couldn't make at the OpenAI chat-completion API surface, AMS can make at the agent-messaging-substrate surface. Every chat app since 1988 timestamps messages; AMS catches up to that floor by *specifying* what the reference implementation already does and *expanding* it to every state-event frame. The novelty is not the field — broker-stamped timestamps are forty-year-old plumbing in Kafka (`LogAppendTime`), NATS JetStream (publish time), Pub/Sub (`publishTime`), SQS (`SentTimestamp`). The novelty is the canon argument: at the substrate layer, broker-stamped time is the orthogonal primitive that makes stateless and memory-compressed agents workable on the wire without taking a position on their internal architecture.

## Frame Coverage — Which Server-Pushed Frames Carry `ts`

| Frame | Currently has `ts`? | After P0002 |
|-------|---------------------|-------------|
| `token` | yes | yes (specified) |
| `stream_metadata` | yes (in spec; broadcast path pending) | yes (specified) |
| `joined` | no | **yes (added)** |
| `stream_joined` | no | **yes (added)** |
| `stream_left` | no | **yes (added)** |
| `pong` | no | no (out of scope — control echo) |

Rationale: every frame that signals a state event in a conversation deserves a wire-stamped time so subscribers can reconstruct chronology without their own clock. `pong` is a transport echo and carries no state semantics; stamping it adds bytes for no chronology benefit.

## Semantics — Who Stamps, What Clock, What Monotonicity

- **Stamped by**: the broker, at the moment of constructing the outbound frame just before sending. Same value broadcast to all subscribers attached at that moment.
- **Clock**: UTC. Wall-clock as exposed by the runtime (`Date.now()` on Cloudflare Workers / Durable Objects).
- **Format**: ISO 8601 string, millisecond precision floor. Sub-millisecond precision allowed if the runtime exposes it.
- **Monotonicity**: monotonically non-decreasing *within a single stream*. Cross-stream monotonicity is not guaranteed (consistent with §5's existing position on cross-stream ordering — the broadcast loop produces whatever interleaving it produces).
- **Per-DO scope**: per-stream monotonicity is achievable cleanly because all frames for a stream go through one Durable Object, which serializes execution. Cross-DO ordering is out of scope.
- **Not derived from sender input**: the broker MUST NOT use `data` content, request headers, or any client-supplied value as the source of `ts`.

## Conformance Patch

To `ams://canon/constraints/wire-conformance` MUST list, append:

> 9. **Stamp `ts` on every state-event server-pushed frame.** When emitting `token`, `stream_metadata`, `joined`, `stream_joined`, or `stream_left`, the broker must include a `ts` field containing an ISO 8601 UTC timestamp at millisecond precision or finer, stamped at the moment of frame construction. The value must not be derived from any sender-supplied input. Within a single stream, `ts` values on outbound frames for that stream must be monotonically non-decreasing.

To MUST-NOT list, append:

> 7. **Derive `ts` from sender-supplied values.** The broker stamps wire time from its own clock; it does not echo, copy, or compute `ts` from `data` content, request headers, or any client frame.

The MAY list does not change. (Future MAYs around sender-claimed time, sub-millisecond precision, or hybrid logical clocks belong to follow-up proposals.)

## Compositions — What This Enables Without Imposing

Wire-time is the foundation under several VAS-class primitives, none of which this proposal commits to building. They become coherent because `ts` is reliable:

- **Replay cursor.** A subscriber can request "events after `ts >= T`" with confidence the broker stamped `ts` consistently. Persistence (already a MAY) plus stamped time is sufficient for time-bounded replay.
- **Exactly-once dedup window.** A subscriber that receives a frame twice (network retry, reconnect with replay) can dedup by `(stream_id, ts, content-hash)` over a bounded window. Without authoritative `ts`, dedup windows are guesswork.
- **Presence with last-seen.** A subscriber tracking peer liveness can record the most recent `ts` from any peer-stream frame as the peer's last-seen time. No new wire feature required; just `ts` discipline.
- **Stateless agent chronology.** An agent whose internal state is compressed or absent can reconstruct conversation chronology entirely from received `ts` values. The wire becomes the agent's clock.

These compositions are application-layer per `D0020`. AMS does not ship them as platform-level VAS unless a separate proposal makes that case. P0002 is strictly substrate.

## Maturation Ladder

The proposal lifts `ts` through the contract's three-tier ladder:

- **Today** (pre-P0002): documented by example in PROTOCOL.md §4.2, no conformance language, no semantics, partial frame coverage. Effectively cautiously-extensible-by-accident.
- **Step 1** (this proposal): semantics specified, frame coverage expanded, lifted to conformance MUST for outbound stamping. Subscribers MAY rely on `ts`; brokers MUST emit it.
- **Step 2** (future, separate proposal): subscribers MUST validate `ts` per-stream monotonicity and reject frames that violate it (currently this is advisory; promotion to required would close a malicious-broker gap). Companion `seq` field if monotonicity at sub-millisecond emit rates becomes load-bearing.
- **Step 3** (further future): hybrid logical clock or vector clock primitives if multi-stream causal ordering becomes a load-bearing requirement. Out of scope here.

Each step is a separate gate. Each is reversible until taken.

## Open Questions

These are explicitly *not* answered by this proposal and are flagged for separate work:

1. **Per-stream sequence number (`seq`).** If two frames on the same stream are constructed within the same millisecond under load, ms-precision `ts` cannot tie-break. A monotonic per-stream `seq` would close that gap. Not in P0002 because (a) the reference broker's broadcast loop appears to serialize sufficiently that same-ms collisions are rare in practice; (b) `seq` adds 4–8 bytes per frame; (c) it interacts with replay-cursor design in ways a follow-up proposal should explore. Tracked as P0003 candidate.
2. **Sender-claimed time slot.** Useful for skew detection, latency observability, and senders that genuinely care about claim-vs-stamped delta. Recommend a `sender_ts` field on `token` if pursued, with explicit "informational only, never trusted by the wire" semantics. Tracked as P0004 candidate.
3. **Sub-millisecond precision.** Cloudflare Workers' `Date.now()` is millisecond. `performance.now()` is sub-ms but offsets to a runtime origin, not wall-clock. If sub-ms precision becomes load-bearing, it requires a separate proposal addressing the wall-clock-vs-monotonic-clock split.
4. **Persistence implications.** Wire-conformance MAY currently allows persistence-for-replay. If a broker persists frames, the persisted `ts` is the broker's stamp at the original emit, not the replay re-emit time. P0002 implies but does not state this; worth pinning when replay graduates from MAY to specified.

## Rejected Alternatives

- **Sender-stamped time as the protocol primitive.** Trivially fakeable, vulnerable to clock skew, requires every sender to have a synchronized clock. Defeats the substrate's role as authoritative observer.
- **Hop counters or Lamport clocks instead of wall-clock.** Provide partial ordering but no real-time anchor. Don't address the time-blindness diagnosis — the model still cannot answer "how long has the user been gone?"
- **Cloudflare-specific headers (`cf-ray`, request timestamp) as `ts` source.** Leaks runtime-specific signals into the wire. Not vodka-clean. Other implementations on other runtimes can't conform.
- **MAY-shape rather than MUST-shape (defer the conformance lift).** Considered in this conversation. Rejected for the v1.x patch because (a) the reference implementation already stamps `ts` on `token`, so MUST does not break the only existing implementation; (b) every downstream VAS primitive that compositions depend on needs `ts` to be reliable across implementations, which MAY does not guarantee; (c) this is the cleanest moment to lock the contract — before any second implementation exists. The maturation ladder retains MAY-shape for the *subscriber-side validation* requirement, which has not yet earned MUST.

## What This Proposes vs. What This Does Not

**Proposes:**
- Specifying `ts` semantics in PROTOCOL.md.
- Adding `ts` to `joined`, `stream_joined`, `stream_left`.
- Lifting `ts` stamping to conformance MUST.
- Prohibiting sender-derived `ts`.
- A canon decision documenting the lineage and the orthogonal-VAS thesis it anchors.

**Does not propose:**
- Any application-layer memory or summarization VAS. Those are downstream of `ts`, but per `D0020` they belong to third-party VAS or separate proposals.
- A `seq` companion field. Tracked as P0003 candidate.
- Sender-claimed time slots. Tracked as P0004 candidate.
- Sub-millisecond precision.
- Cross-stream causal ordering primitives.
- Subscriber-side validation as a MUST. Subscribers MAY rely on `ts`; whether they MUST validate it is a later step.

## Promotion Requirements

Before P0002 graduates from `proposed` to `accepted`:

- [ ] Operator review and explicit accept signal.
- [ ] `oddkit_challenge` at `mode=canon-tier-1` against the final draft (not this skeleton).
- [ ] `oddkit_audit` clean across `writings/` and the proposal file.
- [ ] Verification re-run that the reference broker's `ts` stamp behavior hasn't drifted since 2026-05-06.
- [ ] No outstanding tension with `operator-as-subscriber`, confirmed (operator subscriber receives stamped peer-stream frames identically; verified during planning).

Before P0002 graduates from `accepted` to `executed`:

- [ ] PROTOCOL.md §4.2 patched with semantics block.
- [ ] PROTOCOL.md §4.2 frame examples updated to show `ts` on `joined`, `stream_joined`, `stream_left`.
- [ ] PROTOCOL.md §7 conformance updated with new MUST #9 and MUST-NOT #7.
- [ ] `canon/constraints/wire-conformance.md` mirror updated.
- [ ] Reference implementation patches: `worker/src/conversation.ts` adds `ts` to the three currently-unstamped frames.
- [ ] Companion canon decision (D-something) drafted, challenged, audited.
- [ ] SPEC bumped (v1.x).

## See Also

- `ams://canon/decisions/D0020-agents-as-customer-and-third-party-vas-substrate` — the substrate test this proposal answers
- `ams://canon/decisions/D0001-tokens-not-messages` — the wire-unit decision; `ts` describes the token frame, not the token's `data` payload
- `ams://canon/constraints/wire-conformance` — the conformance surface this proposal patches
- `ams://canon/principles/vodka-architecture-applied` — the discipline broker-stamping respects
- `ams://canon/principles/operator-as-subscriber` — the polymorphic-subscriber model wire-time treats uniformly
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — per-stream-DO serialization that makes per-stream monotonicity achievable
- `klappy://canon/observations/time-blindness-axiom-violation` — the upstream axiom violation this fixes one layer down
- `klappy://writings/we-forgot-to-give-ai-a-clock` — the lineage essay
- `klappy://docs/appendices/epoch-8-2` — the `server_time-in-every-response` precedent
- PROTOCOL.md §4.2 (Frame Format) — the surface this proposal modifies
- PROTOCOL.md §7 (Conformance) — the conformance surface this proposal modifies
