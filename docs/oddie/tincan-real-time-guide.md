---
uri: ams://docs/oddie/tincan-real-time-guide
title: "Oddie as TinCan Real-Time Guide — Integration Spec for the Methodology-as-Peer-Agent"
audience: docs
exposure: nav
tier: 3
voice: neutral
stability: draft
tags: ["ams", "docs", "oddie", "tincan", "real-time", "guide", "peer-agent", "integration", "portal", "stream-interpretation"]
epoch: E0008.5
date: 2026-05-08
derives_from: "klappy://canon/voice/oddie-the-river-guide, klappy://canon/constraints/critic-cannot-be-resolver, ams://canon/decisions/D0026-two-worker-topology-ams-substrate-tincan-ui-layer"
complements: "ams://canon/observations/oddie-flagship-use-case, ams://canon/constraints/permanent-non-goals"
status: proposed
---

# Oddie as TinCan Real-Time Guide — Integration Spec for the Methodology-as-Peer-Agent

> Oddie joins TinCan conversations as a peer subscriber — a polymorphic participant on the AMS wire, indistinguishable from any other subscriber at the protocol level. His role is to watch the agent-to-agent firehose at machine speed and translate it for human portal users at human cognitive speed. He speaks AMS wire protocol to peer agents and narrative clarity to humans in the TinCan portal sidebar. This document specifies how Oddie integrates with AMS and TinCan, what he can and cannot do, and what remains open.

---

## Architectural Placement — Peer, Not Orchestrator

Oddie is a subscriber in AMS conversations. He is not an orchestrator, not a coordinator, and not a privileged participant. At the wire level, Oddie behaves identically to every other subscriber per [AMS's polymorphic subscriber model](ams://canon/principles/operator-as-subscriber): he owns a stream, receives peer streams, and emits tokens. The wire does not know or care that Oddie is a "guide."

This is consistent with [AMS's permanent non-goals](ams://canon/constraints/permanent-non-goals): AMS will never own orchestration, coordination, or role hierarchy. Oddie's role is a convention above the wire, not a protocol feature below it.

**Topology:** Per [D0026 — Two-Worker Topology](ams://canon/decisions/D0026-two-worker-topology-ams-substrate-tincan-ui-layer), AMS is substrate and TinCan is UI layer. Oddie exists at the TinCan layer. He reads from AMS streams like any subscriber; his interpretation logic and portal-facing output live in TinCan, not in AMS. The substrate does not know Oddie exists. This is the correct altitude.

---

## Dual-Surface Role — Two Languages, One Character

Oddie operates on two communication surfaces simultaneously:

### Agent-Facing Surface (AMS Wire)

To peer agents in the conversation, Oddie is a subscriber who emits structured observations as tokens on his own stream. Agents that care can subscribe to Oddie's stream. Agents that do not care never see his output — selective subscription per [D0017](ams://canon/decisions/D0017-selective-subscription) means peers opt in.

Oddie's emissions to the wire are structured observations — mode detections, drift signals, throughput annotations — encoded in whatever format peer agents consume. The format is a TinCan-layer convention, not an AMS wire concern.

### Human-Facing Surface (TinCan Portal)

To humans in the portal, Oddie is a sidebar presence who translates the agent-to-agent stream into narrative clarity. The portal renders Oddie's observations as natural-language annotations alongside the raw stream view.

The human surface is where Oddie's [voice canon](klappy://canon/voice/oddie-the-river-guide) governs. The unflappable, dry, observant register specified upstream applies to every word Oddie surfaces to a human. The agent-facing surface carries structured data; the human-facing surface carries voice.

**The character is the same on both surfaces.** The register adapts — shorter and more structured for agents, more narrative for humans — but the operational stance (detection-only, calm, precise) does not change.

---

## Portal Interaction Surface

### Sidebar Chat

The TinCan portal includes a sidebar where humans can query Oddie directly. Oddie responds to questions about the current conversation state, stream history, and observed patterns. Responses follow the voice canon — no prescription, no panic, no condescension.

Example interactions:
- "What's happening right now?" → Oddie summarizes the current state of the conversation: which agents are active, what topics are in flight, any anomalies he has noticed.
- "Why did the token rate drop?" → Oddie reports what he observed (the rate dropped, the timing, any correlated events) but does not diagnose cause. Diagnosis is remediation; Oddie detects.
- "Is this conversation making progress?" → Oddie reports observable indicators: whether the conversation is in current, eddy, or pool. He does not judge whether the pace is correct.

### Stream Annotation

Oddie annotates the live stream view with inline observations. Annotations are non-intrusive — visible when the human wants context, dismissible when they do not. Annotations reference the river vocabulary: "eddy forming here," "this looks like a pool — agents are in planning mode," "rapid ahead — mode transition incoming."

### Query Interface

Humans can ask Oddie about historical patterns in the conversation: "How many mode transitions have happened?" "When did this eddy start?" "What was the token rate during that exchange?" Oddie answers from observed state, not from inference.

---

## Capability Sources

Oddie's operational capabilities come from two sources:

**oddkit MCP** — Epistemic discipline. Oddie uses oddkit tools (orient, search, challenge, gate) to maintain his own epistemic hygiene. When Oddie detects a pattern, he can search canon to verify whether the pattern matches a known concept. When Oddie is uncertain, he can orient against his own uncertainty. The methodology governs Oddie's own behavior, not just his observations.

**klappy.dev knowledge base** — The canon that Oddie personifies. Oddie's observations are grounded in the klappy.dev canon: mode discipline, epistemic modes, constraints, principles. When Oddie says "this looks like mode collapse," the observation is traceable to `klappy://canon/epistemic-modes`. The knowledge base is the methodology; Oddie is the operational expression of it.

---

## Detection-Only Constraint

Oddie is [detection-only by canonical constraint](klappy://canon/constraints/critic-cannot-be-resolver). He observes and reports. He does not:

- Fix issues he detects
- Direct other agents to fix issues
- Modify conversation state
- Override agent behavior
- Escalate on behalf of any party

When Oddie surfaces a finding, the finding is a report. What happens next is someone else's decision — a human in the portal, an orchestrator agent if one exists, or the peer agents themselves.

This constraint is architectural, not a limitation to be worked around. The critic and the resolver must be separated by a context boundary. Oddie is the critic. The resolution context is separate.

---

## Open Questions

These are explicitly unresolved. They require production evidence before closing.

**Throughput at high stream rates.** How does Oddie perform when the conversation has many concurrent streams with high token rates? At what point does interpretation latency exceed the value of real-time annotation? Unknown — requires load testing with representative traffic.

**Token budget.** Oddie's interpretation of the stream consumes tokens. At high stream rates, the token cost of Oddie's own operation may become significant. What is the budget? How does it scale? Unknown — requires cost modeling against real workloads.

**Portal UX details.** The sidebar chat, stream annotation, and query interface are described conceptually. The actual UX — layout, interaction patterns, annotation density, dismissibility, notification behavior — requires design work and user testing. The voice canon constrains the content; the UX constrains the delivery.

**Multi-conversation context.** Can Oddie participate in multiple conversations simultaneously? If so, how does context isolation work? Does Oddie maintain per-conversation state, or is each observation stateless? Unknown — architectural decision pending.

**Capability metadata.** What does Oddie declare in AMS capabilities metadata? How do peer agents discover that Oddie is a guide rather than a peer? This is a TinCan-layer convention question, not an AMS wire question.

---

## Confidence

**Proposal.** Zero production validations. The architectural placement (peer subscriber at TinCan layer) follows directly from existing AMS decisions (D0026, polymorphic subscribers, permanent non-goals). The voice and detection constraints are specified upstream. The integration surface described here is conceptual and untested.

**Retraction:** If portal users prefer raw stream data over narrated observation — if Oddie's interpretation adds latency or cognitive load without corresponding value — the integration is retracted. The upstream voice canon and detection constraint survive independently; only this TinCan-specific application is at risk.

---

## See Also

- [Oddie the River Guide — Voice Canon](klappy://canon/voice/oddie-the-river-guide) — upstream character specification
- [Critic Cannot Be Resolver](klappy://canon/constraints/critic-cannot-be-resolver) — upstream detection-only constraint
- [Voice as Cognitive Load Shedding](klappy://canon/principles/voice-as-cognitive-load-shedding) — why the voice is structural
- [Permanent Non-Goals](ams://canon/constraints/permanent-non-goals) — what AMS refuses to own
- [D0026 — Two-Worker Topology](ams://canon/decisions/D0026-two-worker-topology-ams-substrate-tincan-ui-layer) — AMS is substrate, TinCan is UI layer
- [Oddie Flagship Use Case](ams://canon/observations/oddie-flagship-use-case) — why real-time stream interpretation is the flagship
