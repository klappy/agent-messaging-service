---
uri: ams://canon/principles/envelope-altitude-consensus
title: "The Envelope-Altitude Consensus — What the 2025–2026 Agent-Comms Cluster Picked, and What AMS Declined"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "principle", "wire-altitude", "envelope", "resonance", "non-goals", "vodka-architecture", "protocol-positioning"]
epoch: E0008.4
date: 2026-05-02
derives_from: "AMS.md §3.1 (Why Tokens, Not Messages), AMS.md §11 (Positioning), ams://canon/constraints/permanent-non-goals, ams://canon/decisions/D0001-tokens-not-messages, ams://canon/resonance/recursive-mas"
complements: "klappy://canon/resonance, klappy://canon/principles/dry-canon-says-it-once"
governs: "Resonance pages comparing AMS to any envelope-altitude protocol (A2A, MCP, ACP, NLIP, AMP, ANP, and successors). Provides the shared divergence root so each page documents only its entrant-specific consequences."
status: active
---

# The Envelope-Altitude Consensus — What the 2025–2026 Agent-Comms Cluster Picked, and What AMS Declined

> Every serious agent-comms protocol that shipped between mid-2024 and mid-2026 chose the envelope altitude for its wire. AMS chose the token altitude. This is the load-bearing divergence between AMS and the cluster, written once here so each per-entrant resonance page can cite it instead of re-deriving it.

## Description

A structural pattern emerged across the wave of agent-communication protocols that shipped between 2024 and 2026: each one bundled transport, identity, authentication, signing, capability schema, and routing into a single typed envelope and called that envelope the substrate layer for agent collaboration. AMS reached the same diagnosis as the cluster — that human-shaped messaging is the wrong substrate — and arrived at a different remedy. Where the cluster picked envelopes, AMS picked opaque tokens. Where the cluster picked altitude 3 (typed structure on the wire), AMS picked altitude 2 (chunks the wire never parses).

This article names that pattern so that resonance pages comparing AMS to any individual entrant in the cluster do not have to re-litigate the shared root. The per-entrant pages document the consequences specific to each entrant; this principle documents the shape they all share.

## Outline

- The Cluster
- What Wire Altitude Means
- Why the Cluster Converged on Envelopes
- Why AMS Declined
- Operationalization in Resonance Pages
- What This Is Not

---

## The Cluster

The agent-comms protocols that landed as v0.x or v1 between late 2024 and mid-2026, each with a different envelope:

| Protocol | Origin | Envelope | What the Envelope Owns |
|----------|--------|----------|------------------------|
| **MCP** | Anthropic, 2024 | JSON-RPC tool calls | Tool invocation, resource reads, agent ↔ tool semantics |
| **A2A** | Google → Linux Foundation, April 2025 | JSON-RPC + SSE; Agent Cards | Capability discovery, peer task delegation, cross-vendor routing |
| **ACP** | IBM/BeeAI → Linux Foundation, 2025 | REST + MIME multipart | Sessions, DIDs, RBAC, sync/async invocation |
| **NLIP** | Ecma TC56 → Ecma-430, December 2025 | Natural-language envelope; CBOR over WebSocket | Multimodal message format; client/server/proxy/middle-agent roles |
| **AMP** | 23blocks, 2026 | Signed Ed25519 envelope: `from\|to\|subject\|priority\|in_reply_to\|SHA256(payload)` | Federated addressing, mandatory signing, trust annotations |
| **ANP** | Open project, 2025+ | DID-based envelope | DID-anchored agent addressing |

Six protocols, six envelopes, one altitude. The list will grow; the shape will not.

## What Wire Altitude Means

Altitude describes how much the wire knows about its payload. The ladder, lowest to highest:

1. **Bytes.** Opaque octets. The wire frames and forwards; nothing else.
2. **Tokens.** Opaque chunks the wire neither parses nor schemas. AMS sits here.
3. **Envelopes.** Typed fields the wire validates: `from`, `to`, `subject`, `payload`, `id`, `signature`, `capability_card`, etc. The cluster sits here.
4. **Semantic content.** The wire knows what the payload means and may route, summarize, transform, or filter based on meaning.
5. **Latent representations.** The wire carries model-internal vectors. RecursiveMAS sits here (`ams://canon/resonance/recursive-mas`).

Each step up commits the wire to one more opinion the wire layer cannot remove later without breaking every implementation built against it. Each step down preserves more freedom for the layers above.

## Why the Cluster Converged on Envelopes

Three forces, all rational, push toward altitude 3 the moment a protocol commits to handling agent comms end-to-end:

**Discovery needs structure.** Two agents that have never met and need to negotiate capabilities cannot do so over opaque chunks. Every entrant in the cluster solved this with a typed shape: Agent Cards in A2A, capability manifests in ACP, tool descriptions in MCP, agent metadata in AMP. The "what can you do" question lands at altitude 3 by default.

**Authentication needs structure.** Signed messages require a canonical form to sign over. AMP's signing format and A2A's signed JSON-RPC and ACP's signed REST envelopes differ in syntax and agree on altitude. You cannot sign opaque tokens at the wire layer without inventing an envelope around them, which is the same move.

**Cross-organization routing needs structure.** Agent addresses (`agent@tenant.provider`), DIDs (ACP, ANP), Agent Cards (A2A) all answer the same question: how does the wire know which other party the payload is for? At altitude 3, the answer is a typed routing field. At altitude 2, the answer is "the wire does not."

Given these three forces, altitude 3 is the natural landing if you accept the premise that discovery, authentication, and routing all belong inside the protocol. The cluster accepts that premise.

## Why AMS Declined

AMS does not. The permanent non-goals list (`ams://canon/constraints/permanent-non-goals`) refuses each layer the cluster's envelopes own:

| Cluster owns | AMS non-goal item |
|--------------|-------------------|
| Identity scheme above the address | #1: no identity scheme above account ID |
| Capability schema | #2: no metadata schema |
| Authorization model | #3: no authorization beyond two-door minimum |
| Payload envelope | #4: no opinion on token format |
| Transport coupling | #5: no mandated transport |
| Routing/coordinator | #6: no queue or coordinator |
| Registry / discovery directory | #7: no registry shape |

Each "no" is a yes inside the cluster's envelope. AMS bets that all of them belong above the wire — declared in metadata, owned by the application, negotiated by subscribers, never enforced by the protocol.

This is the dial-tone bet (`ams://canon/principles/vodka-architecture-applied`). The envelope altitude is the right answer for one protocol to handle agent comms end-to-end. The token altitude is the right answer for a substrate that any number of envelope-altitude protocols can sit on top of. AMP-over-AMS is structurally possible; A2A-over-AMS is structurally possible; an ACP session can be a single AMS conversation. AMS-over-any-of-them is not — the envelope blocks token streaming, the addressing model has no notion of a shared conversation context, the push model has no fan-out (`ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`).

The two answers serve different goals. Both can be coherent. They cannot both occupy the same layer.

## Operationalization in Resonance Pages

This principle exists so that the resonance pages under `canon/resonance/` (e.g. `agent-messaging-protocol.md`, `a2a.md`, `mcp.md`, `acp.md`, `nlip.md`) do not each re-derive the shared divergence. Per `klappy://canon/principles/dry-canon-says-it-once`, the load-bearing argument lives once and is referenced.

Each per-entrant resonance page should:

1. **Cite this principle** in its "Where AMS Diverges" section as the shared root.
2. **Name the entrant's envelope** specifically — what fields, what serialization, what the envelope commits the protocol to.
3. **Surface entrant-specific divergences** beyond the shared one. SSE vs WebSocket (A2A). DIDs and RBAC (ACP). Natural language as substrate (NLIP). Mandatory Ed25519 (AMP). Tool-call semantics vs subscriber semantics (MCP).
4. **Honor the divergence-mandatory rule** from `klappy://canon/resonance`. A resonance page that cites only this principle and adds no entrant-specific detail has not done the work.

A reusable sentence the resonance pages can borrow:

> The cited protocol picked the envelope altitude documented in `ams://canon/principles/envelope-altitude-consensus`. AMS picked the token altitude. The remainder of this section names the consequences specific to this entrant.

## What This Is Not

- Not a claim that envelope-altitude protocols are wrong. They answer a different question and answer it well within their scope. AMS's positioning relative to them is below, not against.
- Not a forecast that AMS will outcompete the cluster. The cluster has industry consensus, standards-body backing, well-funded sponsors. AMS's bet is structural placement, not adoption velocity.
- Not a static catalog. New entrants ship in this space on a monthly cadence; the table under "The Cluster" will grow. Growth does not change the load-bearing argument; it strengthens it.
- Not a license to skip per-entrant work in resonance pages. The shared divergence is the root; page-specific divergences are the leaves. A page with only this citation has cited but not compared.
- Not a principle that supersedes `ams://canon/decisions/D0001-tokens-not-messages`. D0001 is the irreversible wire decision. This principle is the framing that makes D0001 legible against the cluster.

## See Also

- `ams://canon/constraints/permanent-non-goals` — the non-goals list this principle puts in context
- `ams://canon/principles/vodka-architecture-applied` — the discipline that produces the altitude choice
- `ams://canon/decisions/D0001-tokens-not-messages` — the irreversible wire-altitude decision this principle defends
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — the load-bearing pub-sub rule that altitude 3 protocols cannot match without rebuilding the wire
- `ams://canon/resonance/recursive-mas` — the latent-altitude alternative; same divergence pattern, opposite direction (altitude 5 vs altitude 2)
- `AMS.md` §3.1 — the long-form argument for tokens-not-messages
- `AMS.md` §11 — the existing positioning notes that this principle generalizes
- `klappy://canon/resonance` — the resonance convention this principle anchors
- `klappy://canon/principles/dry-canon-says-it-once` — why this principle exists upstream of the resonance pages
