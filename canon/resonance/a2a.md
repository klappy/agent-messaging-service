---
uri: ams://canon/resonance/a2a
title: "Agent2Agent Protocol (A2A)"
audience: canon
exposure: nav
tier: 3
voice: neutral
stability: stable
tags: ["ams", "canon", "resonance", "a2a", "agent2agent", "linux-foundation", "agent-cards", "envelope-altitude", "divergence"]
epoch: E0008.4
date: 2026-05-02
derives_from: "AMS.md §3 (primitives), AMS.md §11 (positioning), ams://canon/principles/envelope-altitude-consensus, ams://canon/decisions/D0001-tokens-not-messages, ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription, ams://canon/constraints/permanent-non-goals"
governs: "Documents AMS's relationship to the Agent2Agent Protocol (A2A), the Google-originated, Linux-Foundation-stewarded agent interoperability standard. Establishes the explicit divergence required by the resonance convention. A2A is the consensus standard in this space; legibility against it is the highest-priority resonance work for AMS."
status: active
---

# Agent2Agent Protocol (A2A) (Resonance)

> Agent2Agent Project (Linux Foundation; originally Google Cloud, donated June 2025), *Agent2Agent (A2A) Protocol Specification*, v0.x → ongoing. Apache-2.0. Backed by AWS, Cisco, Google, Microsoft, Salesforce, SAP, ServiceNow, and 100+ partners.

A2A is the industry consensus pick for the agent-comms layer. It was launched by Google in April 2025 and donated to the Linux Foundation in June 2025 as a vendor-neutral project. JSON-RPC 2.0 over HTTP, server-sent events for real-time streaming, Agent Cards as the capability discovery surface, and a peer task-delegation model designed for cross-vendor interop. AMS's positioning relative to A2A is below it, not against it — but the divergence at the wire layer is sharp enough that AMS-on-A2A is structurally not buildable.

---

## AMS Principle: The Substrate Has No Opinion on Tasks

AMS does not model "tasks," "delegation," "capabilities," or "discovery" at the wire layer. The wire moves opaque tokens between subscribers. Whether a token represents a delegated task, a streaming response, a heartbeat, a capability declaration, or something the protocol authors never imagined is decided by the application above the wire, declared in metadata if it needs to be, and agreed between subscribers without protocol involvement.

The cost is that two A2A-fluent agents on AMS would have to re-invent task delegation in the application layer. The gain is that an A2A subscriber and a non-A2A subscriber can join the same AMS conversation without one of them rebuilding to match the other.

---

## Convergent Quote (Non-Authoritative)

> "The definitive common language for agent interoperability"
> — a2a-protocol.org documentation

The diagnosis is shared: agents built by different teams on different stacks need a common substrate. The work is whether that substrate owns the language or carries whatever language the agents already speak.

---

## Where AMS Aligns

- **Both treat opacity as the design case.** A2A is explicit that agents may be opaque to each other — internal state, prompts, model architecture all stay private. AMS makes payload opacity structural: the wire never parses tokens.
- **Both are cross-vendor by construction.** A2A's framing ("opaque agentic applications across frameworks and vendors") and AMS's instance-independent magic-link model both treat heterogeneity as the case.
- **Both ship real-time streaming.** A2A uses Server-Sent Events; AMS uses WebSocket frames. Both refuse the polling-only model.
- **Both have institutional governance posture.** A2A under Linux Foundation; AMS targeting open protocol with hosted reference. Neither is positioning as a single-vendor product.

These alignments are mechanical. They are about the shape of the audience, not about shared design choices.

---

## Where AMS Diverges (Explicit)

The shared root divergence — envelope altitude vs token altitude — is documented at `ams://canon/principles/envelope-altitude-consensus`. A2A picked the envelope altitude with JSON-RPC as the framing and Agent Cards as the capability schema. AMS picked the token altitude with no envelope and no capability schema at the wire layer. The remainder of this section names the consequences specific to A2A.

- **Agent Cards as wire-layer capability schema.** A2A defines Agent Cards as the canonical "what can this agent do" representation, with a typed shape the protocol validates and routes against. AMS deliberately defers the capability schema (`ams://canon/constraints/permanent-non-goals` item 2): the metadata slot carries `capabilities` as an opaque key, with the schema decided per application, never by the protocol.
- **SSE not WebSocket.** A2A streaming is server-to-client only via Server-Sent Events. Bidirectional streaming requires either two SSE channels or a transport upgrade. AMS uses full-duplex WebSocket as the canonical wire (D0006); a single connection carries both writer emissions and subscriber feedback. SSE is a fine pragmatic choice for HTTP-only environments and a structural ceiling on what a single A2A connection can do.
- **Task delegation model vs subscriber model.** A2A's primary verb is task delegation: agent A sends a task to agent B, B works on it, B returns results. The model is RPC-shaped at altitude, even though SSE makes the response asynchronous. AMS has no notion of "task" or "delegation" at the wire — there are streams, owners, and subscribers. Many-to-many fan-out, dormant subscribers waking on token arrival, and observer-as-subscriber are all trivial in AMS and require structural addition in A2A.
- **Discovery as a protocol concern.** A2A treats agent discovery as a first-class problem the protocol helps solve (Agent Cards, registries, well-known endpoints). AMS treats discovery as out of scope: the magic link IS the address, and how that link reaches the second party is the application's problem. Discovery solved at the substrate layer is more powerful for the use cases A2A targets and forecloses the use cases where the conversation is itself the addressable unit.
- **JSON-RPC envelope vs no envelope.** A2A's wire is structured: `method`, `params`, `id`, `result`, `error` per JSON-RPC 2.0. Every payload commits to this shape. AMS's wire frames are minimal (`type`, `data`) and opaque past that point. A subscriber that wants JSON-RPC semantics can ship JSON-RPC payloads inside AMS tokens; the reverse forces every AMS token through the JSON-RPC shape.

---

## Why the Divergence Matters

A2A's choices are coherent for its target: agents that need to discover each other, negotiate capabilities, and delegate well-formed tasks across organizational boundaries with the heaviest enterprise backing in the field. The Agent Card + JSON-RPC + SSE stack is precisely shaped for that.

AMS's choices are coherent for a different target: a substrate where conversations are the addressable unit, subscribers are polymorphic, fan-out is the default, and the application owns every opinion above the wire. The two targets do not collide; they stack. An AMS conversation can carry A2A-shaped payloads as tokens. The reverse forces AMS to inherit A2A's altitude, which collapses the substrate role.

Industry adoption matters here. A2A has seven hyperscaler backers and 100+ partners. The right AMS posture is not opposition; it is precise positioning as the layer below — the dial tone that A2A messages can ride on when an AMS subscriber needs to bridge into the A2A ecosystem.

---

## Operationalization in AMS

- `ams://canon/decisions/D0001-tokens-not-messages` fixes the wire below the JSON-RPC envelope altitude. An A2A bridge would be an edge wrapper (D0006) translating between A2A method calls and AMS token frames, not a wire protocol change.
- `ams://canon/constraints/permanent-non-goals` item 2 explicitly refuses to define the capabilities schema at the wire, preserving AMS's right to carry Agent Cards as opaque metadata when an application wants A2A interop.
- `PATTERNS.md` already names "A2A bridge" as an anticipated edge-wrapper class. The bridge is the right place for A2A semantics to live in AMS deployments — not the wire.
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` gives AMS the fan-out semantics A2A would need to add structurally to match.

---

## Related Canon

- `ams://canon/principles/envelope-altitude-consensus` — the shared root divergence cited above
- `ams://canon/decisions/D0001-tokens-not-messages` — the wire-altitude decision A2A's envelope cannot pass through
- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` — the architectural pattern that hosts A2A as a bridge, not as the wire
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — the pub-sub default A2A would need to add structurally
- `ams://canon/constraints/permanent-non-goals` — items 2 (capability schema) and 7 (registry) most directly relevant to A2A
- `ams://canon/principles/per-query-dynamic-orchestration` — the latency budget that envelope-validation per hop would erode
- `ams://canon/resonance/agent-messaging-protocol` — sibling page; AMP picks signed envelopes where A2A picks Agent Cards
- `PATTERNS.md` §2 — edge-wrapper pattern, including the anticipated A2A bridge class
- `klappy://canon/resonance` — the resonance convention this page conforms to
