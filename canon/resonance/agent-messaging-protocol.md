---
uri: ams://canon/resonance/agent-messaging-protocol
title: "Agent Messaging Protocol (AMP)"
audience: canon
exposure: nav
tier: 3
voice: neutral
stability: stable
tags: ["ams", "canon", "resonance", "agent-messaging-protocol", "amp", "federation", "ed25519", "envelope-altitude", "divergence"]
epoch: E0008.4
date: 2026-05-02
derives_from: "AMS.md §3 (primitives), AMS.md §11 (positioning), ams://canon/principles/envelope-altitude-consensus, ams://canon/decisions/D0001-tokens-not-messages, ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription, ams://canon/constraints/permanent-non-goals"
governs: "Documents AMS's relationship to the Agent Messaging Protocol (AMP), the federated email-shaped agent-comms protocol from 23blocks. Establishes the explicit divergence required by the resonance convention so the AMS posture is legible against the closest contemporary federated alternative."
status: active
---

# Agent Messaging Protocol (AMP) (Resonance)

> 23blocks, *Agent Messaging Protocol (AMP) — the open standard for secure AI agent communication*. Apache-2.0, spec v0.1.2-draft, 2026.

AMP shipped while AMS was being designed. Same diagnosis: agents proliferating across providers cannot talk to each other. Different remedy. AMP picks federated email-shaped messaging with mandatory cryptographic identity. AMS picks token-stream pub-sub with deferred identity. The two designs answer different questions about what the substrate is for.

---

## AMS Principle: The Wire Owns Routing, Not Identity

AMS routes opaque tokens between subscribers admitted to a conversation. Identity above the account-credential level is application-defined and lives in metadata. Discovery, signing, capability negotiation, and trust annotations are layers above the wire, not properties of it.

The cost is that two parties cannot find each other or verify each other through AMS alone. The gain is that any identity scheme — including cryptographic ones — composes on top without the wire taking a position.

---

## Convergent Quote (Non-Authoritative)

> "AI agents are proliferating across every platform... but they can't talk to each other securely."
> — agentmessaging/protocol README

The diagnosis lands in the same place AMS lands. The work is what the two protocols do next.

---

## Where AMS Aligns

- **Both reject human-shaped envelopes.** AMP's README rules out Slack/Discord/email as substrate-grade choices. AMS rules out the same set in `AMS.md` §11.3. Mechanical rejection of the same alternative space.
- **Both treat cross-organization as the design case.** AMP's federation across providers (`crabmail.ai`, `lolainbox.com`, self-hosted AI Maestro) and AMS's cross-instance magic-link addressing both assume agents in different orgs need to coordinate as the default, not the edge.
- **Both use REST + WebSocket as the pragmatic transport.** Same engineering call under different motivations.
- **Both ship reference implementations and call themselves open standards.** AMP under Apache 2.0; AMS targeting the same.

These alignments are mechanical. They are about the shape of the problem, not about shared design choices.

---

## Where AMS Diverges (Explicit)

The shared root divergence — envelope altitude vs token altitude — is documented at `ams://canon/principles/envelope-altitude-consensus`. AMP picked the envelope altitude. AMS picked the token altitude. The remainder of this section names the consequences specific to AMP.

- **Address shape: persistent identity vs conversation URL.** AMP addresses agents as `agent@tenant.provider` — an email-shaped persistent identity assumed to be discoverable across providers. AMS addresses *conversations* via magic-link URLs (`https://<host>/<namespace>/conversations/<alias>?t=<token>`). AMP commits the substrate to solving the agent-directory problem; AMS lets identity float to the application and uses URLs as the only thing that needs to route.
- **Push vs pub-sub.** AMP delivers a message from one sender to one or more named recipients via the provider. There is no native fan-out beyond an explicit recipient list, and no notion of a subscriber that joined the conversation rather than being addressed. AMS broadcasts streams; ownership and subscription are mutually exclusive (`ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`); fan-out is the trivial default.
- **Mandatory signing vs deferred identity.** AMP requires Ed25519 signatures on every message, with a canonical signing format (`from|to|subject|priority|in_reply_to|SHA256(payload)`). AMS defers identity above account credentials entirely in v1, and refuses to mandate any signing scheme at the wire layer — bearer credentials are the floor, anything richer is application-declared.
- **Provider model.** AMP federates between providers as the unit of cross-org reach: a conversation crosses provider boundaries via inter-provider routing. AMS instances are independent; cross-instance interop happens because the magic link IS the address (the URL routes to whichever instance hosts the conversation).
- **Trust annotations as wire feature.** AMP's external-message trust annotations are part of the protocol envelope, intended for prompt-injection defense at the wire layer. AMS does not annotate payloads at all; trust posture is whatever subscribers declare in metadata or infer from `owner_account_id`.

The divergence-mandatory rule from `klappy://canon/resonance` is satisfied by any one of these; together they describe a coherent contrasting position.

---

## Why the Divergence Matters

AMP's address model commits the substrate to solving identity and discovery as protocol problems. That commitment makes AMP a complete answer for the use case it targets — secure asynchronous message-passing between cryptographically-named agents across providers — and forecloses the use case AMS targets, which is many subscribers (humans, agents, observers, devices) sharing real-time token streams in a conversation that is itself the addressable unit.

You can ship AMP-shaped messages as token frames inside an AMS stream. You cannot ship AMS streams inside AMP messages without losing fan-out, conversation-as-context, and stream ownership semantics. The dependency direction is one-way: AMS sits below AMP at the substrate altitude, not against it.

---

## Operationalization in AMS

- `ams://canon/decisions/D0001-tokens-not-messages` fixes the wire altitude at tokens, not messages. AMP's envelope cannot fit through D0001 without ceasing to be AMP.
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` makes pub-sub the structural default. AMP's push-to-recipient model has no native equivalent.
- `ams://canon/constraints/permanent-non-goals` items 1, 2, 3, 5, and 7 collectively refuse the layers AMP's envelope owns: identity scheme above account ID, capability schema, authorization beyond two-door minimum, mandated transport, registry shape.
- `ams://canon/principles/per-query-dynamic-orchestration` explains why the wire stays this thin: the per-query latency budget for dynamic orchestration cannot afford the overhead of validating, signing, and routing typed envelopes per hop.

---

## Related Canon

- `ams://canon/principles/envelope-altitude-consensus` — the shared root divergence cited above
- `ams://canon/decisions/D0001-tokens-not-messages` — the irreversible wire-altitude decision
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — the load-bearing pub-sub rule AMP cannot match without rebuilding the wire
- `ams://canon/constraints/permanent-non-goals` — the layers AMP owns and AMS refuses to
- `ams://canon/principles/vodka-architecture-applied` — the discipline that produces the divergence
- `ams://canon/resonance/recursive-mas` — the latent-altitude alternative; sibling page in the resonance directory
- `klappy://canon/resonance` — the resonance convention this page conforms to
