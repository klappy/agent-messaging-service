---
uri: ams://canon/resonance/mcp
title: "Model Context Protocol (MCP)"
audience: canon
exposure: nav
tier: 3
voice: neutral
stability: stable
tags: ["ams", "canon", "resonance", "mcp", "model-context-protocol", "anthropic", "edge-wrapper", "envelope-altitude", "divergence"]
epoch: E0008.4
date: 2026-05-02
derives_from: "AMS.md §11.4 (vs. MCP), AMS.md §3 (primitives), ams://canon/principles/envelope-altitude-consensus, ams://canon/decisions/D0006-dream-house-wire-edge-wrappers, ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai"
governs: "Documents AMS's relationship to the Model Context Protocol (MCP), the Anthropic-originated agent-to-tool protocol that AMS uses as its canonical edge wrapper. Establishes the explicit divergence at the protocol-shape level even as AMS structurally depends on MCP for its primary runtime door."
status: active
---

# Model Context Protocol (MCP) (Resonance)

> Anthropic, *Model Context Protocol Specification*, 2024 → ongoing. Open spec, JSON-RPC 2.0 base, multi-vendor adoption.

MCP is unusual in this resonance directory. Every other entrant in the agent-comms cluster is an alternative AMS positions against. MCP is the protocol AMS uses — the canonical edge wrapper at `ams.klappy.dev/mcp` is an MCP server, and `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` makes MCP the first-class adaptation layer for conversational AI runtimes joining AMS conversations. The resonance is structural cooperation, and the divergence is at the layer each protocol occupies.

---

## AMS Principle: Wires Compose; They Don't Compete

MCP and AMS sit at different altitudes and answer different questions. MCP gives a single agent a structured way to call tools and read resources. AMS gives many subscribers a way to share token streams in a conversation. An agent that uses both treats MCP as the inward channel (this agent's tools and resources) and AMS as the outward channel (this agent's conversation with peers). The two protocols compose because neither tries to occupy the other's altitude.

The cost is that AMS has to ship an MCP wrapper as an edge concern rather than getting agent-to-tool mechanics for free. The gain is that AMS does not inherit MCP's request-response shape at the wire, which would foreclose pub-sub.

---

## Convergent Quote (Non-Authoritative)

> "MCP is how a single agent calls tools and reads resources. AMS is how multiple agents talk to each other."
> — `AMS.md` §11.4

The compositional framing is already in AMS canon at the long-form layer. This resonance page promotes the framing into the addressable canon surface so other resonance pages can cite the relationship cleanly.

---

## Where AMS Aligns

- **JSON-RPC base for the wrapper layer.** AMS's MCP edge wrapper inherits JSON-RPC for the wrapper's I/O surface. The wrapper layer adopts MCP's shape because that is the runtime contract; the AMS wire underneath keeps its own shape.
- **Polymorphic transport.** MCP supports stdio, HTTP, SSE, and WebSocket transports. AMS supports WebSocket today and is transport-swappable per `ams://canon/constraints/permanent-non-goals` item 5. Both treat transport as a choice rather than a defining property.
- **Open spec, multi-vendor.** Both are open specifications with multi-vendor adoption rather than single-vendor products. Both frame themselves as standards in service of an ecosystem.
- **Capability declaration as first-class.** MCP servers declare tools, resources, and prompts at initialization. AMS subscribers declare per-stream `capabilities` in metadata. Different shapes, same intent: the protocol surfaces what each party offers without dictating the schema.

These alignments are mechanical. AMS deliberately chose to cooperate with MCP at the wrapper layer; the alignments are downstream of that choice.

---

## Where AMS Diverges (Explicit)

The shared root divergence — envelope altitude vs token altitude — is documented at `ams://canon/principles/envelope-altitude-consensus`. MCP picked the envelope altitude with JSON-RPC tool calls as the framing. AMS picked the token altitude. The remainder of this section names the consequences specific to MCP.

- **One-to-one vs many-to-many.** MCP is a single agent talking to a single MCP server. The connection is bidirectional but bilateral. AMS conversations are inherently many-to-many: one writer per stream, N subscribers per stream, M streams per conversation, structurally fan-out by default (`ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`). MCP cannot host an observer-as-subscriber, an operator-as-subscriber, or a logger that joins after the fact without re-architecting.
- **Request-response vs streaming pub-sub.** MCP tool calls follow the request-response shape: caller invokes, server returns a result (which may stream chunks, but those chunks are scoped to the single call). AMS streams have no notion of "call" or "response" — a writer emits tokens; subscribers read them; emission and subscription are independent.
- **Typed tool schemas vs opaque payloads.** MCP tools have JSON Schema for inputs and structured return shapes. The protocol validates against the schema. AMS tokens are opaque: the wire does not parse, validate, or schema them. An MCP wrapper on AMS must validate against the schema in the wrapper, not in AMS.
- **Agent ↔ tool semantics vs subscriber ↔ stream semantics.** MCP frames participants as "client" (the agent) and "server" (the tool host). The asymmetry is baked in. AMS frames participants as polymorphic subscribers — agents, operators, observers, devices — symmetrically. The MCP wrapper translates between these framings; AMS itself does not import MCP's asymmetry.
- **Direction of dependency.** MCP is a runtime door *into* AMS, not an alternative to it. `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` codifies this: the wire stays push-native and unchanged regardless of which runtimes consume it; runtime adaptation lives in per-session edge wrappers. The MCP wrapper is the canonical instance.

The divergence at the wire layer does not compete with MCP at the runtime layer. The two layers compose precisely because they diverge.

---

## Why the Divergence Matters

If AMS adopted MCP's shape at the wire, AMS would inherit request-response semantics, bilateral connections, and typed envelopes — all the properties that make MCP good at agent-to-tool and that make pub-sub structurally impossible. The divergence preserves the layering: MCP stays the right protocol for what an agent does inwardly with its tools; AMS stays the right substrate for what agents (and other subscribers) do outwardly with each other.

The alternative — putting MCP semantics at the wire — is what several entrants in the cluster did (ACP explicitly extends MCP; A2A uses JSON-RPC at altitude). Those choices are coherent for their goals. They commit the substrate to a shape that AMS deliberately does not.

---

## Operationalization in AMS

- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` makes the MCP wrapper a first-class edge concern, with the wire kept push-native underneath.
- `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai` defines what the MCP wrapper must surface to conversational AI runtimes — the operational contract for the wrapper class MCP defines.
- `ams://canon/constraints/wrapper-stays-cheap` keeps the MCP wrapper from accumulating non-wrapper logic. The wrapper translates I/O patterns; it does not host MCP's content opinions on the AMS wire.
- The MCP wrapper is one of an open class of wrappers (Slack, webhook, SMS, A2A bridge) — `PATTERNS.md` §2. Treating MCP as one wrapper class among many is what keeps MCP from becoming AMS's protocol shape.

---

## Related Canon

- `ams://canon/principles/envelope-altitude-consensus` — the shared root divergence cited above
- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` — the architectural separation that hosts MCP as a wrapper rather than as the wire
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — the pub-sub model MCP cannot match without re-architecting
- `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai` — the operational contract for the canonical MCP wrapper
- `ams://canon/constraints/wrapper-stays-cheap` — keeps the wrapper from drifting into the wire
- `ams://canon/constraints/permanent-non-goals` — the layers MCP defines that AMS leaves to the wrapper or above
- `AMS.md` §11.4 — the long-form positioning this resonance page promotes
- `PATTERNS.md` §2 — the edge-wrapper pattern, of which the MCP wrapper is the canonical instance
- `ams://canon/resonance/acp` — sibling page; ACP explicitly extends MCP into agent-to-agent territory, taking the path AMS deliberately did not
- `klappy://canon/resonance` — the resonance convention this page conforms to
