---
uri: ams://canon/resonance/nlip
title: "Natural Language Interaction Protocol (NLIP)"
audience: canon
exposure: nav
tier: 3
voice: neutral
stability: stable
tags: ["ams", "canon", "resonance", "nlip", "ecma-430", "natural-language", "cbor", "envelope-altitude", "divergence"]
epoch: E0008.4
date: 2026-05-02
derives_from: "AMS.md §3 (primitives), AMS.md §3.1 (why tokens not messages), AMS.md §11 (positioning), ams://canon/principles/envelope-altitude-consensus, ams://canon/decisions/D0001-tokens-not-messages, ams://canon/constraints/permanent-non-goals"
governs: "Documents AMS's relationship to the Natural Language Interaction Protocol (NLIP), the Ecma-ratified standard (ECMA-430) for AI-agent and human-agent communication. NLIP is the structural opposite of AMS in the cluster — it claims to BE the universal envelope where AMS refuses to OWN one."
status: active
---

# Natural Language Interaction Protocol (NLIP) (Resonance)

> Ecma TC56, *ECMA-430: Natural Language Interaction Protocol (NLIP)*. Ratified by Ecma International on 10 December 2025. Royalty-free open standard. Reference implementations and ISO submission tracked through 2026.

NLIP is the most institutionally-backed entrant in the cluster — a ratified Ecma standard developed by TC56 with academic and industry contributors, defining "an open envelope protocol replacing hard-coded APIs" for AI agent communication. It supports text, structured data, binary content, and location, with a WebSocket binding that uses CBOR (Concise Binary Object Representation) for compact encoding and falls back to UTF-8 JSON. Of all the envelope-altitude protocols in the cluster, NLIP is the structural opposite of AMS: it explicitly claims to be the universal envelope; AMS explicitly refuses to own one.

---

## AMS Principle: The Wire Carries What Subscribers Send, Without Knowing What It Means

AMS tokens are opaque chunks of bytes. The wire does not parse them, schema them, validate them, or translate them. A token may be a UTF-8 character, a JSON document, a CBOR-encoded NLIP payload, an audio frame, or an image — AMS does not know and does not need to. Meaning is the application's concern, declared in stream metadata if needed and decoded by subscribers.

The cost is that two AMS subscribers cannot use AMS to negotiate what their tokens mean. The gain is that they can negotiate it however they want — including by using NLIP as the message format inside AMS tokens — without the substrate taking a position.

---

## Convergent Quote (Non-Authoritative)

> "An open, secure foundation for AI agents to communicate across organizational boundaries"
> — Ecma International, NLIP standards announcement

The framing is the substrate-layer claim AMS also makes. The disagreement is whether the foundation owns a message format or carries whatever message format the participants already speak.

---

## Where AMS Aligns

- **Both refuse the hard-coded-API status quo.** NLIP exists to replace per-application APIs with a universal envelope. AMS exists to replace human-shaped messaging substrates and per-vendor agent stacks with a common wire. Different layers, same dissatisfaction.
- **Both pick WebSocket as a primary transport.** NLIP's second draft adds a WebSocket binding (with CBOR encoding) as a first-class transport. AMS uses WebSocket as its canonical wire. Same engineering call.
- **Both treat cross-organization communication as the design case.** NLIP's framing centers cross-domain agent communication; AMS's instance-independent magic-link model targets the same.
- **Both are royalty-free open standards.** NLIP under Ecma's IPR rules; AMS targeting open protocol with hosted reference. Both decline the single-vendor product model.

These alignments are mechanical. They are about the audience and the dissatisfaction, not about the answer.

---

## Where AMS Diverges (Explicit)

The shared root divergence — envelope altitude vs token altitude — is documented at `ams://canon/principles/envelope-altitude-consensus`. NLIP picked the envelope altitude in the most explicit way of any entrant: the envelope IS the protocol. AMS picked the token altitude. The remainder of this section names the consequences specific to NLIP.

- **Natural language as wire substrate.** NLIP's defining choice is that the protocol's payloads are natural-language messages with structured wrappers. The protocol assumes participants speak language at the wire and translates through the envelope. AMS makes no assumption about what tokens contain — they may be language, may be code, may be opaque binary. The wire never reads them. NLIP's choice is uniquely high-altitude in the cluster (closer to altitude 4 — semantic content — than the envelope altitude that A2A and ACP land at) and is the inverse of AMS's altitude-2 stance.
- **CBOR encoding mandatory for the WebSocket binding.** NLIP's WebSocket binding requires CBOR (with UTF-8 JSON fallback for non-CBOR-capable peers). The wire knows the encoding and validates against the envelope shape. AMS frames are JSON-text on WebSocket today and explicitly transport-swappable; the wire commits to no payload encoding, only to ordered delivery within a single connection.
- **Standards-body governance vs market.** NLIP is an Ecma standard with a TC56 committee, ISO submission scheduled, formal stakeholder participation, and an institutional change process. AMS is published canon under a single project's governance, evolved per the revision discipline in `ams://canon/decisions/D0007-spec-as-locking-surface`. Different governance shapes serve different adoption strategies; institutional ratification gives NLIP enterprise procurement traction that AMS does not pursue.
- **Roles formalized at the protocol layer.** NLIP's second draft formalizes client, server, proxy, and middle-agent roles, with the protocol mediating between them. AMS has accounts, conversations, streams, and subscribers — and treats subscribers as polymorphic with declared metadata, not as protocol-typed roles. NLIP's role formalization enables routing and orchestration features the protocol can guarantee; AMS's polymorphism enables roles the protocol authors did not anticipate.
- **Multimodality baked in.** NLIP's core specification supports text, structured data, binary, and location as distinct payload types the protocol understands. AMS treats every token as opaque — multimodality is a stream-metadata declaration that subscribers may use to decode appropriately, never a wire-layer type.
- **The "universal envelope" claim itself.** NLIP's positioning is that one envelope can replace the API explosion. AMS's positioning is that no single envelope should — the substrate should carry every envelope without preferring any. The two claims are mutually exclusive at the wire layer and compatible above it (an AMS conversation can carry NLIP-shaped tokens between subscribers that have agreed to use NLIP).

---

## Why the Divergence Matters

NLIP is the cluster's most explicit attempt to make the envelope itself the protocol. The bet is that natural language plus a structured envelope plus institutional ratification produces a substrate broad enough to subsume the API layer. For procurement-bound enterprise adoption and for human-agent interfaces, the bet is well-shaped.

AMS makes the inverse bet: the substrate should be smaller than any envelope, including NLIP's. Subscribers that want NLIP semantics ship NLIP-encoded tokens to each other inside AMS streams; subscribers that want anything else do that without disturbing the NLIP users. The wire stays empty of opinions about what the payloads mean.

The two protocols can coexist without competing: NLIP-over-AMS is structurally possible (a stream metadata declaration of `content-type: nlip+cbor` plus subscribers that decode accordingly). AMS-over-NLIP is not — the envelope, the multimodality typing, and the role formalization would each have to be removed for AMS's substrate role to come back, at which point NLIP has stopped being NLIP.

---

## Operationalization in AMS

- `ams://canon/decisions/D0001-tokens-not-messages` and `AMS.md` §3.1 directly defend the altitude-2 choice against altitude-4 alternatives like NLIP. The wire commits to no payload language.
- `ams://canon/constraints/permanent-non-goals` items 1, 2, 4, and 5 refuse the layers NLIP's envelope owns: identity, capability schema, payload format, mandated transport.
- An NLIP bridge is a plausible future edge-wrapper class. The bridge would translate NLIP's CBOR envelopes into AMS token frames and vice versa for subscribers that need the cross-protocol path. The wire stays unchanged.
- Stream metadata `capabilities` may carry an `nlip` declaration as a convention so subscribers in a mixed conversation know which streams to decode as NLIP. The convention is not a wire feature.

---

## Related Canon

- `ams://canon/principles/envelope-altitude-consensus` — the shared root divergence cited above; NLIP is the cluster's most explicit envelope-altitude commitment
- `ams://canon/decisions/D0001-tokens-not-messages` — the irreversible wire-altitude decision NLIP's envelope cannot pass through
- `AMS.md` §3.1 — the long-form argument for tokens-not-messages, directly engaging the altitude-3-and-above class NLIP belongs to
- `ams://canon/constraints/permanent-non-goals` — items 1, 2, 4, 5 refuse the layers NLIP's envelope owns
- `ams://canon/principles/per-query-dynamic-orchestration` — the latency budget that envelope-validation per hop would erode
- `ams://canon/resonance/recursive-mas` — sibling page; the latent-altitude alternative (altitude 5), opposite end of the altitude axis from NLIP (altitude 4)
- `ams://canon/resonance/a2a` — sibling page; A2A and NLIP are both envelope-altitude entrants with different envelopes
- `PATTERNS.md` §2 — edge-wrapper pattern, including the anticipated NLIP bridge class
- `klappy://canon/resonance` — the resonance convention this page conforms to
