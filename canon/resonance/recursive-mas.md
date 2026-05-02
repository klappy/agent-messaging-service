---
uri: ams://canon/resonance/recursive-mas
title: "Recursive Multi-Agent Systems"
audience: canon
exposure: nav
tier: 3
voice: neutral
stability: stable
tags: ["ams", "canon", "resonance", "recursive-mas", "latent-communication", "tokens-not-messages", "vodka-architecture", "divergence"]
epoch: E0008.3
date: 2026-05-02
derives_from: "AMS.md §3.1, ams://canon/decisions/D0001-tokens-not-messages, ams://canon/constraints/permanent-non-goals, ams://canon/principles/vodka-architecture-applied, klappy://canon/resonance"
governs: "Documents AMS's relationship to RecursiveMAS (Yang et al., 2026) and the broader 2025–2026 latent-communication research cluster. Establishes the explicit divergence required by the resonance convention so the AMS posture is legible against the strongest contemporary alternative."
status: active
---

# Recursive Multi-Agent Systems (Resonance)

> Yang, Zou, Pan, Qiu, Lu, Diao, Jiang, Tong, Zhang, Buehler, He, Zou. *Recursive Multi-Agent Systems.* arXiv:2604.25917, 28 April 2026.

The paper appeared the day after the hackathon that originated AMS. Same diagnosis. Opposite remedy. The contemporaneity is the reason this page exists: the divergence between the two designs is not historical but live.

---

## AMS Principle: The Wire Is Smaller Than the Model

AMS moves opaque tokens between subscribers and refuses to own anything above that altitude. Two agents in a conversation remain intelligible to each other regardless of model architecture, training history, or organizational boundary. The wire never holds a representation that requires the wire to know what an agent is.

The cost of this stance is that the wire cannot share gradients, latent state, or any model-internal value. The gain is that any two agents anywhere can talk without coordination above the protocol.

---

## Convergent Quotes (Non-Authoritative)

> "Can agent collaboration itself be scaled through recursion?"
> — Yang et al., *Recursive Multi-Agent Systems*

The paper opens on a question whose framing AMS shares: the existing wire between agents is the wrong shape. The work is what the two systems do next.

---

## Where AMS Aligns

- **Text-shaped messaging is the wrong substrate.** Both works refuse to model agent-to-agent communication on top of human-shaped envelopes (Slack, Discord, email, Kafka, MCP). The diagnosis is shared at the wire layer.
- **The natural unit is finer than the message.** AMS lands on tokens. RecursiveMAS lands on continuous hidden states. Both reject the discrete-message buffer-and-send pattern as the right abstraction for two reasoning systems exchanging output.
- **Streaming is the cognition shape.** AMS makes "writer can emit before reasoning is done, subscriber can process before the writer is done" a wire property. RecursiveMAS bases its efficiency claim on step-by-step latent passing rather than full-message turn-taking. Both shapes track how models actually generate.
- **Heterogeneous agents are the assumed case.** Neither work pretends a homogeneous fleet is realistic. Both treat heterogeneity as the design problem rather than as an edge case.

These alignments are mechanical. They are about the shape of the wire, not about shared values.

---

## Where AMS Diverges (Explicit)

- **Wire altitude.** AMS chooses tokens deliberately as the right altitude: bigger than a byte so serialization is not reinvented, smaller than a message so envelope opinions are not committed. RecursiveMAS goes one altitude lower, to continuous hidden-state vectors. Latent vectors are not legible to anything that has not been trained to read them. Tokens are.
- **Coupled versus decoupled.** RecursiveMAS only works when a single party controls all endpoints, trains the bridge between them, and unrolls one computation graph across the loop. AMS is the substrate for agents in different organizations, on different stacks, behind different model providers, with no shared training. The two designs answer different questions about who owns what.
- **What the protocol owns.** RecursiveMAS bundles transport, an implicit identity scheme (the trained projection target), an implicit authorization model (gradient access through the loop), and a learned message format (the embedding distribution) into one trained system. AMS's permanent non-goals list refuses to own any of those. The bundling in RecursiveMAS is not incidental; it is the source of the gains.
- **Pub-sub fan-out versus closed loop.** AMS broadcasts streams: one writer, many subscribers, no replication logic, ownership and subscription mutually exclusive at the wire layer. RecursiveMAS is a chain or loop with no notion of an observer outside the gradient path. A logger or operator-as-subscriber is the default in AMS and a structural addition in RecursiveMAS.
- **Inspectable versus opaque-by-construction.** AMS streams tokens that any subscriber can read, replay, audit, or filter. RecursiveMAS's intermediate states are continuous vectors with no defined human semantics until the final agent decodes. Cross-organization governance, audit, and operator presence rely on the inspectable property.
- **Asynchronous versus unrolled.** AMS subscribers can be dormant; tokens wake them. RecursiveMAS requires each agent to be loaded and ready in the same forward pass. Real-time means structurally different things in each system.
- **The protocol does not optimize agents.** AMS does not make agents better. RecursiveMAS's central claim is that the protocol does make agents better, but only because the protocol is the training target. The two works answer different questions, and both can be coherent answers.

If this section feels uncomfortable, that is the convention working: the divergence is exactly where the citation earns its place.

---

## Why the Divergence Matters

RecursiveMAS belongs to a 2025–2026 research cluster (Du et al. on latent-space communication, Fu et al. on cache-to-cache semantic transfer, Zheng et al. on thought communication, Zou et al. on latent collaboration) all pushing toward richer model-internal channels between agents. The cluster's premise is that closer coupling between agents yields meaningful efficiency and accuracy gains inside controlled systems. The cluster is correct about this.

What the cluster does not address is the substrate problem. Closer coupling forecloses cross-organization composition, observer presence, audit, asynchronous wake-up, and the substitution of one agent for another without retraining. AMS occupies the position the cluster vacates: the layer that has to exist underneath any of those systems if any two of them are to talk to each other across an organizational boundary.

The contemporaneity is the proof. RecursiveMAS was published on 28 April 2026; the AMS canon foundation was committed on 1 May 2026. Two parallel attempts to solve a different version of the same problem, with mirror-image opinions about coupling, arriving inside the same week. RecursiveMAS is not a precursor that AMS rejects, and it is not a successor that supersedes AMS. Both can be right. Neither can be both.

---

## Operationalization in AMS

- D0001 fixes the wire altitude at tokens, not latents. The decision is one-way; reversing it would break every existing subscriber.
- The permanent non-goals list refuses to own transport, identity, authorization, capability schema, coordinator, registry, URL structure, or pricing dimension. The list is the contract that keeps the substrate unopinionated.
- Streams broadcast; ownership and subscription are mutually exclusive (D0009). The wire structurally supports operator-as-subscriber and observability-as-subscriber, neither of which has a clean analog inside a closed gradient loop.
- The magic link is a URL across instances (D0002, D0011). Cross-instance interoperation is the design pressure for AMS, where single-system optimization is the design pressure for RecursiveMAS.
- Metadata declares per-stream capabilities; the conversation has no canonical capability set. Heterogeneity is resolved by application-level negotiation, not by a learned cross-model projection.

---

## Related Canon

- [`ams://canon/decisions/D0001-tokens-not-messages`](../decisions/D0001-tokens-not-messages.md) — the irreversible wire-unit decision this page reflects against
- [`ams://canon/constraints/permanent-non-goals`](../constraints/permanent-non-goals.md) — the non-goals list that codifies what AMS refuses to own
- [`ams://canon/principles/vodka-architecture-applied`](../principles/vodka-architecture-applied.md) — the underlying design pattern that grounds the unopinionated stance
- [`ams://canon/principles/operator-as-subscriber`](../principles/operator-as-subscriber.md) — the subscriber-shaped operator model that closed loops cannot host
- [`ams://canon/principles/observability-as-subscriber`](../principles/observability-as-subscriber.md) — observability without breaking the wire, structurally absent inside trained latent loops
- [`ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`](../decisions/D0009-stream-as-primitive-ownership-excludes-subscription.md) — the load-bearing rule that makes pub-sub the default behavior
- [`ESSAY.md`](../../ESSAY.md) — *We Were the Wire*, the foundational AMS essay that defines the diagnosis this page reflects against
- [`klappy://canon/resonance`](https://klappy.dev/canon/resonance) — the resonance index in ODD canon, source of this convention
