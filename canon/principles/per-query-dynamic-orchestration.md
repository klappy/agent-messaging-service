---
uri: ams://canon/principles/per-query-dynamic-orchestration
title: "Per-Query Dynamic Orchestration as the Design Forcing Function — Why AMS Looks the Way It Does"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "principle", "dynamic-orchestration", "latency-budget", "sovee-inversion", "substrate", "vodka-architecture", "design-rationale"]
epoch: E0008.4
date: 2026-05-02
derives_from: "AMS.md §2 (the dial-tone thesis), AMS.md §3.1 (why tokens, not messages), ams://canon/decisions/D0001-tokens-not-messages, ams://canon/decisions/D0006-dream-house-wire-edge-wrappers, ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription, ams://canon/decisions/D0010-observability-via-subscriber-not-wire, ams://canon/principles/vodka-architecture-applied"
complements: "ams://canon/constraints/permanent-non-goals, ams://canon/constraints/wire-conformance"
governs: "Why AMS's wire-layer choices look the way they do. The substrate guarantee AMS makes to consumers that compose orchestration topologies dynamically per-query rather than declaring them in advance. Recommended frame for evaluating any proposed wire change: does it preserve or erode the per-query latency budget."
status: active
---

# Per-Query Dynamic Orchestration as the Design Forcing Function — Why AMS Looks the Way It Does

> AMS exists to be the substrate for orchestration topologies that are built per-query from indexed primitives, executed in milliseconds, then dissolved. The dial-tone thesis, the token-not-message wire, the dream-house architecture, the polymorphic-subscriber model, and the structural ownership-excludes-subscription rule are all in service of one design forcing function: keeping the per-query latency budget low enough that dynamic composition stays cheaper than pre-orchestration.

## Description

AMS's wire-layer canon — D0001 (tokens not messages), D0006 (dream-house wire, edge-wrapped reality), D0009 (stream-as-primitive, ownership-excludes-subscription), D0010 (observability as subscriber not wire) — reads as a sequence of independent design choices. Each is correct on its own merits. Their coherence is not an accident.

The unifying principle is the design forcing function: AMS exists to enable orchestration topologies that are composed per-query from indexed primitives, executed in milliseconds, then dissolved. The lineage for this pattern is the Sovee inversion of statistical machine translation — instead of training a global model offline (years of CPU time, then cheap inference), Sovee indexed the corpus and reverse-percolated each translation query against it to build the right corpus subset on demand, then trained, tuned, and decoded in 250ms at higher quality than the global models. Dynamic composition per query, against indexed substrate, beat pre-trained universal capability.

Apply that inversion to agent orchestration: instead of declaring the workflow topology in advance (the orchestrator-centric pattern — orchestrator owns the chain, runtime walks it), index the participants and let the topology emerge per-query from who subscribes to which streams. The orchestration is built, executed, and dissolved within the latency budget of the query itself. AMS is the substrate that makes this cheap enough to be the default rather than the exception.

This principle does not introduce new wire decisions. It explains why the existing ones look the way they do, and gives canon a forcing function to evaluate future wire changes against: does the proposed change preserve the per-query latency budget, or does it erode it.

## Outline

- The Forcing Function
- How the Existing Wire Choices Serve It
- The Latency Budget as a Concrete Number
- What This Forecloses
- What This Preserves
- The Substrate Guarantee
- What This Is Not

---

## The Forcing Function

The forcing function is one sentence: **the wire's per-query overhead must be small enough that composing orchestration topologies dynamically per query is cheaper than declaring them in advance.**

Concretely, if a Sovee-shaped query needs five to ten stream hops to build a per-query agent topology, and the end-to-end budget is sub-second (Sovee landed at 250ms), then AMS needs to add no more than a small handful of milliseconds per hop. Anything more, and the inversion is no longer cheaper than pre-orchestration, and consumers fall back to the orchestrator-centric pattern AMS exists to make obsolete.

The forcing function is the lens for any proposed addition to the wire. A feature that makes individual conversations more capable but adds 20ms per hop is a regression — it makes individual conversations richer at the cost of making the dynamic-composition pattern infeasible. The wire's job is to be cheap, not to be capable. Capability lives in subscribers.

## How the Existing Wire Choices Serve It

- **D0001 (tokens, not messages).** Token streaming preserves writer-side concurrency: the writer can emit while still reasoning, and subscribers can begin processing before the writer is done. Message-framing would force pre-buffering that adds end-to-end latency every hop.
- **D0006 (dream-house wire, edge-wrapped reality).** The wire stays substrate-agnostic so the implementation can swap to whichever runtime hits the latency budget on the deployed substrate. The reference impl ships on Cloudflare Durable Objects; if a substrate change is needed to make budget, the wire does not need to change with it.
- **D0009 (stream-as-primitive, ownership-excludes-subscription).** Concurrent multi-stream parallelism is the trivial case, not a special feature. A per-query topology fanning out across N owners runs in parallel by default; nothing in the wire serializes participants who write to different streams.
- **D0010 (observability as subscriber, not wire).** Observability does not add wire features that would be paid by every query. Subscribers who care about observability join as polymorphic subscribers; queries that do not need observation pay nothing for the option.
- **The vodka discipline overall.** Every opinion the wire refuses to grow (identity scheme, schema, queue semantics, registry, transport correctness) is one less decision a query has to wait on at runtime. The wire's emptiness is the latency story.

The principle does not introduce new constraints. It names the throughline that connects the constraints already in canon.

## The Latency Budget as a Concrete Number

The Sovee precedent gives a concrete budget: 250ms end-to-end for a complete query, including any dynamic composition work done at request time.

For AMS as substrate inside that budget, the guidance is:

- **Per-hop wire overhead** — owner emit to subscriber receive on warm broker resources — should be small enough that five to ten hops fit inside the budget with room for actual subscriber work. A working ceiling is sub-15ms per hop on warm resources; the actual number is empirical and impl-specific.
- **Conversation lifecycle cost** — creating and tearing down a conversation per query — should not dominate the budget. If conversation setup is hundreds of milliseconds, conversations have to be reused or pooled across queries, which pushes a pooling concern into the consumer.
- **Stream lifecycle cost** — same shape, smaller scale. Each query may spin up several short-lived streams; setup and teardown overhead per stream compounds across the query.
- **Cross-region cost** — when participants are globally distributed, wire-layer overhead is dominated by WAN latency. The dream-house design preserves the option of globally distributed brokers; the cut for reality may use single-region brokers initially, but should not foreclose the global-routing pattern that brings consumers to their nearest broker.

These numbers are guidance, not contracts. The contract is the forcing function: dynamic composition per query is cheaper than pre-orchestration. The numbers operationalize that contract for the current substrate.

## What This Forecloses

Once the forcing function is named, certain proposals become structurally incompatible without further argument:

- **Wire-level orchestration features.** A "workflow," "chain," or "graph" primitive at the wire level pre-orchestrates topology, which is the pattern this forcing function exists to invert. Such features belong in subscribers, not the wire.
- **Mandatory per-query preprocessing.** Any wire feature that requires schema validation, content inspection, or transformation of tokens in transit pays a per-hop cost on every query, including the queries that do not need the feature. Such features live above the wire (in subscribers or wrappers), not in the broker.
- **Synchronous wire-layer auth checks beyond the two-door minimum.** Each additional auth step at the wire is a per-hop latency cost. Richer authorization belongs in subscribers (which can apply per-query policy) or in the magic-link mint path (which runs once per conversation, not per token).
- **Heavy state per stream or per conversation that must be touched per token.** Per-token state lookup is the hot path; anything that lives there is paid by every query. Aggregations and observations live in subscribers or hooks (D0010), not in the broadcast path.

## What This Preserves

The forcing function explicitly preserves:

- **Polymorphic subscribers.** Any service may attach as a subscriber and participate in a per-query topology without prior coordination with the broker.
- **Per-query topology emergence.** The broker does not know what shape a query's orchestration takes; it routes streams, and the topology is a property of who happens to subscribe to which streams.
- **Consumer choice over composition pattern.** A consumer that wants pre-orchestrated workflows can still build them as long-lived subscriber topologies. The forcing function does not require dynamic composition; it makes it cheap enough to be the default for consumers that want it.
- **The substrate-swap option (D0006).** If the chosen substrate cannot meet the latency budget at scale, the wire is portable to one that can.

## The Substrate Guarantee

The principle commits AMS to one guarantee to its consumers:

**The wire's per-query latency overhead is small enough that composing topologies dynamically per query is a viable default for consumers that want it.**

The guarantee is bounded by the chosen substrate. The reference impl ships on the substrate the operator has chosen for it; the wire-layer design does not foreclose a different substrate if the chosen one cannot deliver. Consumers may rely on the guarantee. Implementations that cannot deliver it should either change substrate or document the regression honestly so consumers can choose.

## What This Is Not

- **Not a performance specification with hard numbers in the wire spec.** The wire spec defines the protocol; performance is an implementation property. The 250ms reference comes from the Sovee precedent and the Truthkit endgame; it is the design target, not a wire-layer SLA.
- **Not a requirement that all consumers compose dynamically per query.** The forcing function makes per-query composition viable. It does not require it. Consumers that prefer pre-orchestrated topologies remain first-class.
- **Not a positioning claim about competitors.** Contrasts with orchestrator-centric workflow tools explain the inverted-orchestration pattern; they do not commit AMS to a market positioning. Marketing and positioning live above the wire.
- **Not a substitute for benchmarks.** The principle gives the forcing function; consumers and implementers verify it with measurement, not with reasoning.

## See Also

- `AMS.md` §2 — the dial-tone thesis
- `AMS.md` §3.1 — why tokens, not messages
- `ams://canon/decisions/D0001-tokens-not-messages` — irreversible wire choice this principle relies on
- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` — the substrate-swap option that protects the forcing function under substrate constraints
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — the structural concurrency this principle requires
- `ams://canon/decisions/D0010-observability-via-subscriber-not-wire` — model for keeping cross-cutting concerns out of the per-token path
- `ams://canon/principles/vodka-architecture-applied` — the discipline that keeps the wire empty enough to meet the budget
- `ams://canon/constraints/permanent-non-goals` — the contract that prevents wire-layer accretion
- `ams://canon/constraints/wire-conformance` — the MUST-NOT checklist this principle reinforces
