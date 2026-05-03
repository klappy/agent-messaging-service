---
uri: ams://canon/resonance/anp
title: "Agent Network Protocol (ANP)"
audience: canon
exposure: nav
tier: 3
voice: neutral
stability: stable
tags: ["ams", "canon", "resonance", "anp", "agent-network-protocol", "did", "w3c", "meta-protocol", "envelope-altitude", "divergence"]
epoch: E0008.4
date: 2026-05-02
derives_from: "AMS.md §3 (primitives), AMS.md §11 (positioning), ams://canon/principles/envelope-altitude-consensus, ams://canon/decisions/D0001-tokens-not-messages, ams://canon/constraints/permanent-non-goals, ams://canon/resonance/acp"
governs: "Documents AMS's relationship to the Agent Network Protocol (ANP), the W3C-DID-based, three-layer agent communication protocol with meta-protocol negotiation. ANP is the most architecturally layered entrant in the cluster and the only one with first-class meta-protocol negotiation."
status: active
---

# Agent Network Protocol (ANP) (Resonance)

> Cai et al., *Agent Network Protocol Technical White Paper*, arXiv:2508.00007, July 2025. Open-source reference implementation: AgentConnect framework. W3C TPAC engagement, IETF draft. Three-layer architecture: identity and encrypted communication / meta-protocol negotiation / application protocol.

ANP is the most architecturally layered entrant in the agent-comms cluster surveyed for AMS. It builds a three-layer stack: a W3C-DID-based identity and end-to-end encryption layer at the bottom, a meta-protocol negotiation layer in the middle (where agents negotiate which protocol to speak before speaking it), and an application protocol layer on top (with Agent Description Protocol using JSON-LD for semantic capability description). ANP positions itself as "the HTTP of the Agentic Web era." The AMS divergence is at the layer-count and the meta-negotiation choice, on top of the shared envelope-altitude divergence.

---

## AMS Principle: One Layer, No Negotiation

AMS is one layer: the wire. There is no negotiation phase before tokens flow — subscribers join a conversation and immediately exchange tokens. There is no protocol-of-protocols for agents to agree on what they speak; whatever the subscribers send, the wire carries. Capability declaration lives in metadata as opaque keys; the meaning of those keys is a per-application convention, not a protocol-mediated negotiation.

The cost is that AMS cannot help subscribers reach a shared protocol when they do not already have one. The gain is that subscribers that already speak the same thing pay no negotiation cost, and the wire stays free of opinions about what counts as a successful negotiation outcome.

---

## Convergent Quote (Non-Authoritative)

> "Minimalist yet extensible principles, rapid deployment based on existing infrastructure."
> — ANP Technical White Paper

The minimalism aspiration is shared. The disagreement is what minimalism means — one layer with no negotiation, or three layers with a negotiation step.

---

## Where AMS Aligns

- **Decentralized-by-design.** ANP rejects central authority; AMS rejects central registries (`ams://canon/constraints/permanent-non-goals` item 7). Both treat decentralization as a substrate-level property, not an add-on.
- **Built on existing web infrastructure.** ANP uses HTTPS for DID resolution and HTTP/WebSocket/P2P libraries for transport. AMS uses HTTPS for control plane and WebSocket for the wire. Both decline to invent transport.
- **Open-source reference implementation alongside the spec.** ANP ships AgentConnect; AMS ships the Cloudflare Worker reference. Neither is a spec-only standard.
- **Cross-organization as the design case.** Both treat agents in different organizations as the audience. Neither assumes a single fleet or operator.
- **W3C / IETF / standards-body engagement.** ANP is at W3C TPAC and IETF; AMS is published canon. Different governance shapes, similar institutional posture.

These alignments are mechanical. They are about the audience and the philosophical stance, not about the wire shape.

---

## Where AMS Diverges (Explicit)

The shared root divergence — envelope altitude vs token altitude — is documented at `ams://canon/principles/envelope-altitude-consensus`. ANP picked the envelope altitude across all three of its layers. AMS picked the token altitude with no layering above it. The remainder of this section names the consequences specific to ANP.

- **Three layers vs one.** ANP separates identity-and-encryption, meta-protocol-negotiation, and application-protocol into distinct protocol layers, each with its own specification, conformance rules, and extensibility points. AMS is a single wire layer with everything else (identity, capability, application protocol) declared in metadata or owned by subscribers above the wire. ANP's layering is a feature for its target — composable extensibility through replaceable layers — and a structural commitment AMS does not make.
- **Meta-protocol negotiation as a wire feature.** ANP's middle layer is unique in the cluster: agents negotiate which application protocol they will speak before they start speaking it. The protocol mediates the negotiation. AMS has no analog — subscribers either already speak the same thing or they do not exchange useful tokens. Negotiation, if needed, is application code over the token stream, not a protocol layer.
- **DID-based identity at layer 1.** ANP requires W3C DID-based identity (specifically the `did:wba` method, where each DID corresponds to an HTTPS-hosted DID document). The protocol cannot operate without DIDs. AMS defers identity above account credentials entirely; bearer tokens are the floor and DIDs (or any other scheme) are an application choice.
- **End-to-end encryption mandatory at layer 1.** ANP mandates end-to-end encryption between agents. The protocol cannot operate without it. AMS leaves encryption to TLS at the transport (`wss://`) and to applications above the wire — the wire does not encrypt or sign tokens.
- **Verifiable Credentials and JSON-LD as substrate.** ANP integrates W3C Verifiable Credentials for trust assertions and uses JSON-LD for semantic capability descriptions in the Agent Description Protocol. AMS makes no commitment to either — capability declarations are opaque metadata keys with application-defined shape (`ams://canon/constraints/permanent-non-goals` item 2).
- **"AI-native" as stated philosophy.** ANP's white paper explicitly positions the protocol as AI-native, designed first for AI agents rather than retrofit from human protocols. AMS makes a similar claim in different language ("we are not borrowing from human messaging protocols," `AMS.md` §11.3). The shared instinct lands at different protocol shapes — ANP builds a layered stack with negotiation; AMS strips to a single wire with no negotiation.
- **Human-vs-agent authorization distinction baked in.** ANP introduces a protocol-level distinction between human authorization and agent authorization, with different mechanisms for each. AMS treats every account uniformly at the wire layer; whether the account is human-controlled or agent-controlled is a metadata declaration, not a protocol concept.

---

## Why the Divergence Matters

ANP's three-layer architecture makes a coherent bet: substrate-level identity, substrate-level negotiation, substrate-level encryption, and substrate-level capability semantics produce a stack rich enough to be the "HTTP of the Agentic Web." The bet is well-shaped for the target.

AMS makes the inverse bet across every layer ANP defines: identity, negotiation, encryption, and capability semantics all belong above the wire, never inside it. The wire is a single layer that carries opaque tokens; the rest is for subscribers and applications.

The divergence is the same envelope-altitude divergence that runs through the cluster, expressed at the layer-count level. ANP is altitude 3 across three layers. AMS is altitude 2 in one layer. Both can be coherent. Neither can be both.

A specific point on meta-protocol negotiation: the negotiation step is an interesting feature for the target ANP serves (heterogeneous agents that may not share a vocabulary), and an explicit non-feature in AMS for two reasons. First, negotiation imposes a per-handshake cost that erodes the per-query latency budget defended by `ams://canon/principles/per-query-dynamic-orchestration`. Second, negotiation as a substrate concern commits the protocol to having opinions about what counts as a successful negotiation, which is exactly the layer of opinion AMS refuses to own.

---

## Operationalization in AMS

- `ams://canon/decisions/D0001-tokens-not-messages` rules out the typed-envelope shape ANP uses across all three layers. A token can carry an ANP-encoded payload as opaque bytes; the wire never decodes it.
- `ams://canon/constraints/permanent-non-goals` items 1, 2, 5, and 7 collectively refuse the layers ANP owns: identity scheme (DIDs), capability schema (Agent Description Protocol with JSON-LD), mandated transport, registry shape.
- `ams://canon/principles/per-query-dynamic-orchestration` documents the latency-budget reason AMS does not include negotiation steps at the wire — the negotiation overhead would push AMS out of the dynamic-composition altitude the principle defends.
- An ANP bridge is a plausible future edge-wrapper class (`PATTERNS.md` §2). The bridge would translate between ANP's three-layer stack and AMS token frames, exposing ANP-fluent agents to AMS conversations and vice versa, without AMS adopting any of ANP's layer shapes.

---

## Related Canon

- `ams://canon/principles/envelope-altitude-consensus` — the shared root divergence cited above
- `ams://canon/principles/per-query-dynamic-orchestration` — the latency-budget reason AMS does not host negotiation at the wire
- `ams://canon/decisions/D0001-tokens-not-messages` — the wire-altitude decision ANP's envelopes cannot pass through
- `ams://canon/constraints/permanent-non-goals` — items 1, 2, 5, 7 cover the layers ANP owns and AMS leaves above
- `ams://canon/resonance/acp` — sibling page; ACP also uses DIDs and shares some of the same identity stance, with different envelope shape
- `ams://canon/resonance/a2a` — sibling page; A2A and ANP overlap in audience and differ in layering (A2A's flat JSON-RPC vs ANP's three-layer stack)
- `ams://canon/resonance/nlip` — sibling page; NLIP and ANP both engage standards bodies (Ecma vs W3C/IETF) and differ on the universal-envelope claim
- `PATTERNS.md` §2 — the edge-wrapper pattern that hosts a future ANP bridge
- `klappy://canon/resonance` — the resonance convention this page conforms to
