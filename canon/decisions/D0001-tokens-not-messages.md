---
uri: ams://canon/decisions/D0001-tokens-not-messages
title: "D0001 — Tokens, Not Messages, as the Wire Unit"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: stable
tags: ["ams", "canon", "decision", "wire", "tokens", "vodka-architecture", "irreversible"]
epoch: E0008.3
date: 2026-05-01
derives_from: "AMS.md §3.1, journal/2026-05-01-ams-foundation.tsv (D: AMS adopts tokens — not messages — as the unit of transmission)"
governs: "Every layer of AMS that touches the wire. The choice cannot be reversed without breaking every subscriber."
status: active
---

# D0001 — Tokens, Not Messages, as the Wire Unit

> AMS carries tokens. Tokens are the smallest unit of transmission. AMS does not parse, validate, schema, or interpret the contents.

## Description

The wire unit of AMS is the **token**, not the **message**. A token is opaque bytes (currently capped at 64 KiB per `PROTOCOL.md` §5). AMS does not know what a token contains, does not enforce a framing on top of it, and does not assume it represents any kind of complete utterance. Subscribers compose whatever envelope they need — message, frame, chunk, control signal — on top of the token stream.

This is a one-way door. Reversing it would require every existing subscriber to change at the wire boundary, breaking the foundation play.

## Outline

- The Three Reasons
- What This Forecloses
- What This Enables
- What This Is Not

---

## The Three Reasons

**Cognition.** Language models emit and consume tokens. The internal unit of agent reasoning is the token, not the message. When two agents talk to each other, the wire between them speaks the same unit they think in. Anything else introduces a translation layer, and translation layers are where semantics drift, where latency hides, and where every framework reinvents an incompatible envelope.

**Streaming.** Messages are discrete: compose the whole thing, then send. Tokens stream. A writer can start emitting before reasoning is done. A subscriber can start processing before the writer is done. The protocol shape matches the cognition shape.

**Layering.** Bytes are too low — AMS would have to reinvent serialization on top of them, and every implementation would do it slightly differently. Messages are too high — committing to an envelope means committing to framing, schemas, ordering, delivery semantics, and every other opinion the protocol should not own. Tokens land at the right altitude. Bigger than a byte, smaller than a message, exactly the unit agents already produce.

## What This Forecloses

- AMS cannot define a "message format" later without becoming a different protocol.
- AMS cannot ship message-shaped guarantees (atomic delivery, message IDs, message acknowledgments, message-level retry). Subscribers that need those build them above the token layer.
- AMS cannot validate token content. It cannot reject tokens that look malformed by some application schema, because there is no application schema.

These are accepted costs of the choice.

## What This Enables

- **Trivial fan-out.** One emission, N subscribers, no replication logic. The model emits a token stream; everyone who is listening gets it in real time.
- **Multiple envelope conventions can coexist.** Two subscribers in the same conversation can frame their outputs differently if their peers know how to read both.
- **The protocol does not need to evolve when applications change.** New use cases ship as new conventions on top, not as wire revisions.

## What This Is Not

- Not a stance against having message-shaped abstractions. Subscribers are welcome to compose them. The wire just does not own them.
- Not a claim that tokens-as-bytes is the correct abstraction for every protocol. It is the correct abstraction for AMS's specific bet that the foundation should be unopinionated.
- Not a permanent block on changing token size limits, transport encoding, or wire framing within a major version. Those are in scope; the unit definition is not.

## See Also

- `AMS.md` §3.1 — full long-form argument
- `PROTOCOL.md` §5 — token semantics on the wire
- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` — the architectural separation that protects this choice
- `ams://canon/constraints/permanent-non-goals` — the surrounding non-goals that make tokens-not-messages coherent
