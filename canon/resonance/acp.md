---
uri: ams://canon/resonance/acp
title: "Agent Communication Protocol (ACP)"
audience: canon
exposure: nav
tier: 3
voice: neutral
stability: stable
tags: ["ams", "canon", "resonance", "acp", "beeai", "ibm", "linux-foundation", "envelope-altitude", "divergence"]
epoch: E0008.4
date: 2026-05-02
derives_from: "AMS.md §3 (primitives), AMS.md §11 (positioning), ams://canon/principles/envelope-altitude-consensus, ams://canon/decisions/D0001-tokens-not-messages, ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription, ams://canon/constraints/permanent-non-goals, ams://canon/resonance/mcp"
governs: "Documents AMS's relationship to the Agent Communication Protocol (ACP), the IBM/BeeAI-originated, Linux-Foundation-stewarded agent communication standard. ACP is the closest competitor to A2A and is positioned by its authors as an MCP extension; the AMS divergence is at the wire-altitude level."
status: active
---

# Agent Communication Protocol (ACP) (Resonance)

> IBM Research / BeeAI Project (Linux Foundation, 2025), *Agent Communication Protocol*, pre-alpha → ongoing. REST-based, MIME multipart, extends MCP's JSON-RPC base. Apache-2.0.

ACP was introduced by IBM Research as part of the BeeAI Project and donated to the Linux Foundation. Its authors describe it as "the HTTP of agent communication" and position it as the agent-to-agent layer that picks up where MCP leaves off. ACP is REST-based with MIME-typed multipart messages, supports both synchronous and asynchronous interactions, and integrates with role-based access control and decentralized identifier (DID) systems. The diagnosis converges with AMS at the substrate-fragmentation level. The remedy diverges sharply at altitude.

---

## AMS Principle: The Substrate Has No Notion of "Agent"

AMS does not model agents at the wire. It models accounts, conversations, streams, subscribers, and tokens. An "agent" in AMS is whatever an account chooses to run — there is no protocol-level concept of agent identity, agent lifecycle, agent capability set, or agent task. ACP makes "agent" a first-class wire concept; AMS deliberately does not.

The cost is that AMS cannot offer agent-aware features at the protocol layer. The gain is that any account can be an agent, a service, an operator, an observer, or something the protocol authors never imagined, with no special-casing required.

---

## Convergent Quote (Non-Authoritative)

> "Our goal is to build the HTTP of agent communication."
> — Kate Blair, Director of Product Incubation, IBM Research

The aspiration is the substrate-layer claim AMS also makes. The disagreement is about what altitude that substrate sits at.

---

## Where AMS Aligns

- **Both target cross-framework reuse.** ACP exists to let agents built in different frameworks talk to each other; AMS exists for the same audience. Both treat heterogeneity as the design case.
- **Both ship local-first reference implementations.** BeeAI runs locally (Ollama-friendly, laptop-runnable). AMS's reference deployment is small enough to run on a single Cloudflare Worker. Both refuse the "cloud-only" assumption.
- **Both compose with MCP rather than competing.** ACP explicitly extends MCP's JSON-RPC base. AMS uses MCP as its canonical edge wrapper (`ams://canon/resonance/mcp`). Both treat MCP as a building block, but the building goes in different directions.
- **Both have institutional governance.** ACP under Linux Foundation; AMS targeting open protocol with a hosted reference. Neither is a single-vendor product.

These alignments are mechanical. They are about audience and posture, not about wire choices.

---

## Where AMS Diverges (Explicit)

The shared root divergence — envelope altitude vs token altitude — is documented at `ams://canon/principles/envelope-altitude-consensus`. ACP picked the envelope altitude with REST + MIME multipart as the framing. AMS picked the token altitude. The remainder of this section names the consequences specific to ACP.

- **REST request-response (with async-via-task-id) vs streaming pub-sub.** ACP's primary shape is request-response over HTTP. Asynchronous calls return a `taskId` that callers poll or subscribe against for progress. AMS has no notion of "task" or "callable agent" at the wire — there are streams, owners, and subscribers, with tokens flowing in real time and no request to bind a response to.
- **DIDs as wire-layer identity.** ACP integrates Decentralized Identifiers (DIDs) as a first-class identity scheme at the protocol surface. AMS defers identity above account credentials entirely (`ams://canon/constraints/permanent-non-goals` item 1). DIDs are a coherent identity choice; making the substrate require any specific identity scheme commits the substrate to a layer AMS leaves to applications.
- **RBAC enforcement at the protocol.** ACP includes role-based access control as a protocol concern, with the protocol mediating who can invoke what. AMS's authorization is two-door: account credential plus admission token (the magic link). Anything richer is conversation metadata that subscribers may honor by convention, not protocol-enforced.
- **Sessions as primary unit.** ACP centers "session" as the unit of interaction — a long-running stateful container for multi-turn agent collaboration. AMS centers "conversation" as a convenience grouping for streams that share a coordination context, with the broadcast unit being the individual stream within the conversation, not the session-as-container. Different shapes, different defaults.
- **MIME multipart envelope.** ACP carries MIME-typed multipart messages, making the wire aware of media types and structured-content boundaries. AMS tokens are opaque bytes — the wire does not know whether a token is text, JSON, audio, or anything else. Multimodality in AMS lives in stream metadata and subscriber declaration, not in wire-layer content typing.
- **Lifecycle states at the protocol.** ACP defines agent lifecycle states (`INITIALIZING → ACTIVE → DEGRADED → RETIRING → RETIRED`) emitted as OpenTelemetry spans. AMS has no agent lifecycle because AMS has no agents — accounts join conversations, streams open and close, and the conversation runs as long as any subscriber is attached. Lifecycle as wire feature is one more layer ACP owns and AMS leaves above.

---

## Why the Divergence Matters

ACP makes a complete bet: the substrate should know about agents, sessions, lifecycles, identities, and access policies, and the protocol should mediate all of them. That bet is coherent for ACP's target — enterprise multi-agent systems where the substrate handles governance and applications focus on agent logic.

AMS makes the inverse bet: the substrate should know about none of those things, leaving every governance choice to the application or to subscriber-pattern enforcement (`ams://canon/decisions/D0010-observability-via-subscriber-not-wire`). The two bets diverge in the same direction the cluster generally diverges from AMS, but ACP goes further than most by making lifecycle and RBAC wire-level concerns.

ACP's "HTTP of agent communication" framing is the right altitude metaphor for ACP. AMS's metaphor is dial tone — what HTTP itself rides on, not what HTTP becomes.

---

## Operationalization in AMS

- `ams://canon/decisions/D0001-tokens-not-messages` rules out the MIME multipart envelope at the wire layer. Multipart payloads can be carried as opaque tokens; they cannot be the wire's framing.
- `ams://canon/constraints/permanent-non-goals` items 1, 2, 3, and 4 collectively refuse the layers ACP's envelope owns: identity scheme (DIDs), capability schema, authorization beyond two-door minimum, payload format.
- `ams://canon/decisions/D0010-observability-via-subscriber-not-wire` is the AMS analog to ACP's lifecycle-as-OTLP-span decision: AMS lifecycle observability is a subscriber pattern, not a wire feature.
- An ACP bridge is a possible future edge-wrapper class (`PATTERNS.md` §2 anticipates it). The bridge would translate ACP REST + MIME calls into AMS token frames; the wire stays unchanged.

---

## Related Canon

- `ams://canon/principles/envelope-altitude-consensus` — the shared root divergence cited above
- `ams://canon/decisions/D0001-tokens-not-messages` — the wire-altitude decision ACP's envelope cannot pass through
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — the streaming pub-sub default ACP would need to add structurally
- `ams://canon/decisions/D0010-observability-via-subscriber-not-wire` — the AMS analog to ACP's lifecycle-spans-at-the-wire choice
- `ams://canon/constraints/permanent-non-goals` — items 1, 2, 3, 4 refuse the layers ACP's envelope owns
- `ams://canon/resonance/mcp` — sibling page; ACP extends MCP into agent-to-agent territory, the path AMS deliberately did not take
- `ams://canon/resonance/a2a` — sibling page; ACP and A2A overlap heavily in target and differ in envelope shape (REST + MIME vs JSON-RPC + SSE)
- `PATTERNS.md` §2 — edge-wrapper pattern, including the anticipated ACP bridge class
- `klappy://canon/resonance` — the resonance convention this page conforms to
