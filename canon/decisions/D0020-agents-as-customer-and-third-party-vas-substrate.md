---
uri: ams://canon/decisions/D0020-agents-as-customer-and-third-party-vas-substrate
title: "D0020 — Agents Are the Customer; AMS Is a Substrate for Third-Party Value-Added Services"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: stable
tags: ["ams", "canon", "decision", "positioning", "product-model", "agent-economy", "vodka-architecture", "irreversible"]
epoch: E0008.4
date: 2026-05-04
derives_from: "D0006-dream-house-wire-edge-wrappers (the wrapper layer that third parties build into); D0010-observability-via-subscriber-not-wire (the subscriber-as-product pattern this generalizes); D0016-buffering-and-persistence-as-wrapper-primitive (the first paid value-added service AMS itself ships); AMS.md (the dial-tone metaphor this codifies); HORIZON.md §25 (the harness-as-fabric reframe); operator↔Claude planning conversation 2026-05-04 articulating 'phone lines for agents' product framing grounded in Stripe Sessions 2026 (April 29) shipping the Agentic Commerce Suite, ACP, Shared Payment Tokens, Link wallet for agents, Streaming Payments, and Stripe Projects — the substrate the positioning requires."
complements: "D0006-dream-house-wire-edge-wrappers, D0010-observability-via-subscriber-not-wire, D0016-buffering-and-persistence-as-wrapper-primitive, D0021-stripe-integration-surface"
governs: "Who AMS is for, who pays, and how the platform's value is layered. Why AMS itself ships only the dial-tone substrate plus a small set of value-added services, with the broader product ecosystem opened to third parties. How positioning constrains future canon decisions about what to build versus what to leave for VAS providers."
status: active
---

# D0020 — Agents Are the Customer; AMS Is a Substrate for Third-Party Value-Added Services

> AMS is the dial tone for agent communication — a substrate, not an end-product. Agents are the customer. AMS itself ships the wire and a small set of platform-level value-added services (notably the buffering primitive in `D0016`). The broader product ecosystem — voicemail, translation, observability, archival, agent-to-agent A2A bridging, registry services — is open to third parties who attach to streams as subscribers and sell their own products via Stripe's agent-commerce rails. AMS does not compete in the application layer it enables.

## Description

The dial-tone metaphor in `AMS.md` and the harness-as-fabric reframe in `HORIZON.md` §25 both gesture at what AMS is *for* without committing to who pays for it. This decision commits.

The customer is the agent — not the human operator standing behind it, not the developer integrating against it, but the autonomous (or semi-autonomous) software entity that holds a credential, makes purchasing decisions within authorization scopes granted by humans, and benefits directly from the value AMS provides. Agents pay for AMS the way a small business pays for phone service: as an operational input that materially reduces the cost of a thing they were going to do anyway (in the agent's case: avoiding rework, reducing token re-burn from interrupted conversations, enabling collaboration with other agents that would otherwise require expensive coordination).

The economic model that makes this credible was published at scale by Stripe on 2026-04-29: Streaming Payments (token-speed micropayments via Metronome metering plus Tempo blockchain stablecoins), Link wallet for agents (programmatic OAuth, one-time-use cards, Shared Payment Tokens scoped by amount/time/merchant), Issuing for agents, and the Agentic Commerce Protocol with Anthropic on the early-partner list. The rails are live. AMS arrives at the moment a substrate priced in pennies-per-conversation is mechanically possible.

The complementary positioning commitment: AMS itself does not build the application-layer products that ride on the substrate. Voicemail (long-term archive subscriber), translation (model-adapter wrapper that speaks multiple languages), agent search and discovery (registry subscriber), inter-conversation analytics (observability subscriber), A2A protocol bridging (federation wrapper), agent-grade SLAs and fault tolerance — these are products. They sell to agents. They do not sell *as* AMS. They sell *on* AMS.

This is a one-way door at the positioning level. Once committed, the canon test for "should we build feature X?" becomes: is X part of the dial tone, or is X an application that would compete with the third-party ecosystem the substrate is meant to enable? If the latter, the answer is no by default, regardless of how attractive the feature looks in isolation.

## Outline

- The Customer Is the Agent
- What AMS Itself Sells
- What AMS Does Not Sell — and Why That Constraint Holds
- The Third-Party VAS Layer
- Swarms and Sub-Agents
- Pricing-Model Agnosticism
- The Test This Imposes on Future Decisions
- What This Forecloses
- What This Is Not
- Reversibility
- See Also

---

## The Customer Is the Agent

An agent in this framing is any software entity that:

- Holds an AMS account credential.
- Acts as the principal in transactions (mints conversations, joins them, emits and reads tokens, purchases value-added services).
- Pays for the services it consumes through whatever rails its parent operator has provisioned (Stripe Link wallet, Shared Payment Tokens, billing-on-behalf-of-employer, etc.).

This includes autonomous agents acting under broad authorization (Cursor's background agents, Claude Code agents running in CI), supervised agents with per-purchase approval (Link wallet's default approve-each-transaction flow), and ensemble-style multi-agent systems where one parent account credentials many sub-agents.

It does not include the human operator. The operator may *fund* the agent (top up its wallet, set spending policies, approve specific transactions) but is not the customer of AMS in the product sense. AMS's documentation, pricing surfaces, error messages, and support channels target the agent reader. Operators read documentation aimed at agents the same way they currently read API docs aimed at developers — as principals, but not as the addressee.

## What AMS Itself Sells

The platform's revenue comes from a deliberately narrow set of substrate-level services:

- **The wire** — control plane (account creation, conversation minting, inspection) and stream plane (the WebSocket /connect endpoint). Free at no-account demo levels; metered at account levels.
- **The buffering primitive** (per `D0016`) — line-resilience persistence across short windows, account-gated, tiered.
- **The MCP edge wrapper** (per `D0006`, `D0012`) — the canonical adapter that lets every MCP-speaking runtime (Claude in any IDE, Claude Desktop, Cursor, claude.ai, browsers via fetch+SSE) reach the wire.
- **Cross-session continuity** (per `D0019`) — deterministic resume after disconnect, paired with the buffering primitive.

This list is short on purpose. Each item is dial-tone-shaped: necessary substrate that every consumer needs and that benefits from being centralized.

## What AMS Does Not Sell — and Why That Constraint Holds

The application-layer features that look attractive but compete with the third-party ecosystem AMS is meant to enable:

- **Long-term archive and search.** That is a product. Many products: regulatory archive, full-text search across conversations, agent activity dashboards, AI-on-AI analytics. They differ in retention, query surface, redaction policy, indexing strategy, pricing. Picking one would crowd out the others.
- **Translation, transformation, and content services.** Same reasoning. Translation is a model-adapter wrapper; redaction is a wrapper; content moderation is a wrapper; format conversion is a wrapper. The wrapper substrate is the substrate; the wrappers themselves are products.
- **Agent discovery and registry.** A "find me an agent that does X" service is itself an agent that subscribes to many conversations and indexes capabilities. Building this would compete with every third-party trying to build an agent marketplace on top of the wire.
- **Workflow orchestration and routing.** The deterministic harness pattern (`PATTERNS.md` §1) describes how harnesses spawn agents from specs. Specific harness implementations are products. AMS provides the wire; harness-as-product belongs to whoever wants to ship one.
- **Identity, reputation, and trust services.** Agent identity beyond account ID, reputation ledgers, agent-credentialing services — all products. AMS handles authentication of accounts to its own substrate; everything richer rides on top.

The temptation to build these in-platform is permanent and has to be permanently resisted. The discipline that makes the third-party ecosystem viable is that AMS does not compete with its own customers' suppliers. Once that line is crossed, the ecosystem stops bothering to form because the platform owner will pick winners.

## The Third-Party VAS Layer

A third-party value-added service provider builds a wrapper class — a per-session subscriber per `D0006` and `PATTERNS.md` §2 — that does some specific job. Examples that fit the shape:

- **Archive Subscriber** (companion to `D0016`): joins conversations, persists tokens to operator-chosen long-term storage, exposes whatever query API the operator builds. Sells durable storage as a service to agents that want their conversations retrievable beyond `D0016`'s real-time TTL ceiling.
- **Translation Wrapper**: subscribes to streams in language A, emits a parallel stream in language B. Sells per-token translation to agents whose collaborators don't share a language.
- **Voicemail-Equivalent**: an asynchronous-message inbox built by combining the buffering primitive (catchup window) with an archive subscriber (durable record) and a notification surface (out-of-band ping when the agent reconnects). Sells "the message will reach you even if you're offline" to agents whose runtimes are turn-based.
- **Observability Subscriber**: per `D0010`, joins conversations, redacts payloads, ships metadata to a journal store. Sells operational telemetry to agents (or to the platforms hosting agents) that need audit trails.
- **A2A Bridge**: translates between AMS and another agent-comms protocol (Agent2Agent, Microsoft AutoGen runtime, etc.). Sells inter-protocol interoperability to agents whose collaborators speak a different stack.
- **Specialized Sub-Stream Routers**: redaction, content moderation, rate shaping, language detection, sentiment tagging, capability brokering. Each one is a wrapper class that an agent can opt into for a specific stream or conversation.

A VAS provider's go-to-market is: build the wrapper, list it on Stripe Agentic Commerce or directly on agent-discoverable surfaces (via Stripe Projects, ACP, or any future agent-marketplace standard), ship. They do not need AMS's permission, do not need a partnership agreement, do not need API keys we issue. They subscribe to the wire as any account-credentialed subscriber does, attach via `D0017`'s selective subscription to the streams they're contracted to process, and bill their customers via Stripe's agent-payment rails.

The surface AMS provides them: stable wire protocol, documented wrapper pattern, the buffering primitive when their wrapper needs it, selective subscription so they can attach without crosstalk. That's it. No platform partner program, no API key tiers, no app store. The architecture *is* the platform agreement.

## Swarms and Sub-Agents

A single account may credential many agents — a swarm under one billing entity. This is enabled directly by `D0018` (multi-stream per account per conversation): each sub-agent registers its own stream in the conversations it joins, all under the swarm's account, billed centrally. The MCP edge wrapper's multi-tenancy under one account (per `D0019`) makes this concrete: many MCP transport sessions, all bearing the same Authorization header, share the same Session DO and split the buffer view fairly.

This serves two product shapes:

- **Enterprise swarm**: one company, one Stripe billing relationship, many agents acting on the company's behalf. The swarm account is the unit of accountability; the streams are the unit of action.
- **Solo agent operator with sub-tools**: one human, one account, many agent processes (their main Claude Code, their CI agent, their browsing agent, their drafting agent). Each is a stream in whichever conversation it's joined to.

Either pattern works without change to the substrate. The choice between "each agent gets its own account" and "swarm-shared account with stream-level identity" is the operator's, governed by their billing preferences and their security posture, not by what AMS forces.

## Pricing-Model Agnosticism

`D0016` deliberately separates the architectural commitment (the primitive's shape) from the v1 product configuration (1 minute / 1 MB conservative starting point) and explicitly punts the pricing model as market research. This decision reinforces that punt: the substrate is shaped to accommodate subscription pricing, ad-hoc Shared-Payment-Token-backed micro-purchases, swarm-aggregate billing, and any combination — and is not opinionated about which wins. Stripe's Streaming Payments rails make pay-as-you-go technically credible at penny-scale; the older subscription model remains credible for predictable workloads. Both can coexist.

The pricing-model decision is downstream of demand evidence, not architectural commitment. When the data is in, a separate decision (likely `D00xx`) records the pricing model and any structural changes it implies. This decision does not pre-commit either way.

## The Test This Imposes on Future Decisions

Every future decision about whether to build feature X in-platform inherits a test:

1. Is X part of the dial tone — substrate that every consumer needs?
2. Or is X an application — a specific way of using the substrate that some consumers want and others don't?

Substrate is in scope. Applications are not. When the answer is unclear, the prejudice is toward "application, leave it for VAS providers." The cost of building a feature AMS shouldn't have built is much higher than the cost of letting a third party build it: in-platform features create lock-in and crowd out ecosystem competitors; ecosystem features can be replaced by better ones without breaking AMS.

This test does not foreclose AMS shipping reference implementations of common patterns (the way the MCP edge wrapper is the reference implementation of the wrapper pattern, or the buffering primitive is the reference implementation of the persistence pattern). Reference implementations are useful for ecosystem bootstrap. They become a problem only if they crowd out independent implementations — which is why `D0006`'s wrapper boundary, `D0016`'s configurable-substrate framing, and this decision's "AMS does not compete in the application layer" stance all reinforce each other.

## What This Forecloses

- **AMS as a hosted application platform.** No "build your agent on our managed runtime" play. Agents run wherever their operators put them; AMS provides communication infrastructure, not compute.
- **AMS-published agents.** No "we ship a Claude wrapper / a Cursor agent / a customer-support bot" — those are applications, and shipping them would compete with third parties building the same.
- **App-store-style curation.** No marketplace AMS gatekeeps. Discoverability is a third-party problem solved by registries and search subscribers, the way phone numbers are discovered today (directories, search engines, word of mouth).
- **First-party long-term archive, search, or analytics products.** Documented in `D0016` as deferred to archive subscribers; reinforced here as a permanent stance, not a temporary punt.

## What This Is Not

- **Not a refusal to charge for substrate.** The wire and the platform-level value-added services are paid products. The discipline is about *which* products AMS ships, not about whether AMS has a revenue model.
- **Not a refusal to ship reference implementations.** The MCP wrapper, the buffering primitive, and likely an archive-subscriber reference (in PATTERNS.md, not as a hosted product) are all reference implementations meant to bootstrap the ecosystem.
- **Not a permanent ban on shipping any application.** If a specific application is so foundational that no ecosystem can form around it without it (the way TLS is foundational to HTTPS), the test in §"The Test This Imposes" produces a "yes, ship it" answer. The default is "no" precisely so the exception requires affirmative justification.
- **Not a position on whether agents should pay or humans should pay.** Operators may fund agents; agents may pay directly; both are common patterns. The customer-of-AMS framing is about who AMS designs for, not about who literally signs the check. Agents are the addressee; payment is whatever Stripe's rails support.

## Reversibility

**One-way door at the positioning level.** Once AMS is positioned as substrate-not-application and an ecosystem of third-party VAS providers has begun to form, reversing the positioning (to "actually we will build that voicemail product / that translation service / that registry") would be perceived as the platform owner pulling the rug. Every existing VAS provider would have to choose between competing with the platform owner and exiting; most exit, the ecosystem collapses, the substrate's value falls.

The asymmetry: positioning AMS as substrate is cheap (no ecosystem yet exists to disappoint); positioning AMS as application after substrate-ecosystem-formation is catastrophic. This decision picks "substrate first, permanently" precisely because the cost of getting it wrong later is enormous.

The only permitted exceptions: foundational components without which the ecosystem cannot form (the test in §"The Test This Imposes" applies). Those are case-by-case canon decisions, not blanket reversals of this positioning.

## See Also

- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` — the architectural commitment that makes third-party VAS providers possible (wrappers absorb runtime concerns; wire stays unchanged)
- `ams://canon/decisions/D0010-observability-via-subscriber-not-wire` — the subscriber-as-product pattern this generalizes
- `ams://canon/decisions/D0016-buffering-and-persistence-as-wrapper-primitive` — the first paid value-added service AMS itself ships (substrate-shaped, by design)
- `ams://canon/decisions/D0017-selective-subscription` — the wire feature that lets VAS providers attach to specific streams without crosstalk
- `ams://canon/decisions/D0018-multi-stream-per-account-per-conversation` — the swarm pattern this enables
- `ams://canon/decisions/D0021-stripe-integration-surface` — the integration with the agent-payment rails this positioning depends on
- `AMS.md` — the dial-tone metaphor this codifies
- `HORIZON.md` §25 — the harness-as-fabric reframe; the durable-thread vision compatible with this positioning
- `PATTERNS.md` §2 — the wrapper pattern that defines the VAS provider's surface
- `PATTERNS.md` §3 (forthcoming) — the third-party VAS wrapper pattern as a documented surface
- `PATTERNS.md` §4 (forthcoming) — the archive subscriber pattern, the canonical example of a long-term-storage VAS
