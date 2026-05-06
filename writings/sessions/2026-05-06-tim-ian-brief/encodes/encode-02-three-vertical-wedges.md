---
uri: ams://encodes/2026-05-06/three-verticals-structurally-locked
title: "Observation — Three Verticals Where Incumbents Are Structurally Pinned"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: stable
tags: ["ams", "encode", "observation", "learning", "constraint", "market-structure", "competitive-positioning", "verticals"]
epoch: E0008.5
date: 2026-05-06
type: O+L+H
status: encoded
quality_score: 4
quality_max: 4
governance_uri: klappy://canon/definitions/dolcheo-vocabulary
---

# Observation — Three Verticals Where Incumbents Are Structurally Pinned

> AMS+TinCan can compete in three verticals where incumbents cannot ship the same product without contradicting their own pricing or positioning. The competitive gap isn't a head start to defend — it's a permanent architectural absence.

## Type classification

Encoded as Observation (factual claim about market structure), Learning (durable strategic knowledge), and Handoff (carry forward to GTM work). Constraint classification was 3/4 — gap noted: "make the constraint explicit." The constraint flavor is implicit in each vertical's structural lock; left explicit in the operational notes below.

## The three verticals

### 1. AI-support handoff (B2B mid-market, $19–49/seat/mo)

**Demand:** Every B2C company runs an AI chatbot. All of them have the same broken handoff: AI fails → customer asks for human → ticket opens → context dies → rep starts from scratch. Customer angry before rep arrives.

**TinCan answer:** Magic-link drops the rep into the existing conversation. Rep sees full agent transcript, takes over OR sits silent and steers AI by injecting messages. Conversation continuity preserved.

**Why incumbents are pinned:**

- Intercom charges $0.99 per Fin AI resolution. Human-co-pilot pattern *reduces* resolution count → economically toxic to ship.
- Zendesk's per-agent licensing locks them into human-only-OR-AI-only mental model.
- AI-native vendors (Decagon, Sierra) compete on agent quality. They want the AI to win, not share the room.

**Build cost on our side:** Landing page + ~5 lines of widget JS to drop into existing chatbot frames.

**Velocity:** Fastest revenue of the three. $50–250K MRR within 6–12 months realistic.

### 2. Stripe-for-agent-conversations (dev infra, $0.001–$0.01/conv)

**Demand:** Every agent startup is rebuilding chat right now and none want to. They want to ship their agent and have someone else run conversation transport.

**TinCan answer:** AMS substrate already does this. Real-time wire + magic-link auth + multi-participant + open protocol at a price below what rebuilding costs them in engineering time.

**Why incumbents are pinned:**

- Pusher / Ably / PubNub have raw pubsub but force every customer to build the agent-conversation pattern. Pivoting alienates a decade of dashboard/IoT/gaming customers.
- OpenAI / Anthropic want devs on their stack, not on a neutral substrate. D0020's open-substrate posture is precisely the thing they cannot offer.
- Slack/Discord can't reach down to dev infra without breaking consumer-product positioning.

**Build cost:** Zero — AMS already does this. Work is positioning + public docs site + sample integrations + one good Hacker News post.

**Velocity:** Slow fuse, dev marketing compounds over months. Once integrated, switching cost is real engineering — retention >95%.

### 3. Watching-room observability (B2B ops, $29–99/viewer-seat/mo)

**Demand:** PMs, ops leads, and execs at companies running 10+ agents have nowhere to *watch* their agents work in real time. Current state: Loom recordings and weekly demo meetings.

**TinCan answer:** Portal in read-only mode + an "inject a message" affordance. Head of CS watches her support agent argue with a refund request, pings "just give them the refund," walks away.

**Why incumbents are pinned:**

- LangSmith / Helicone / Arize positioned and priced for engineers — non-technical UX alienates dev base.
- Slack would need to become an agent-observability product, which it isn't.
- AI-native vendors don't want third parties watching their agents — observability commoditizes them.

**Build cost:** Portal mode flag + inject affordance on existing TinCan UI.

**Velocity:** Highest ARPU but longest education curve — buyers don't yet know this is possible.

## The shared structural fact

The pin in each case isn't temporary. It's a permanent feature of how each incumbent has organized their pricing or positioning. Intercom *cannot* undercut $0.99/resolution without breaking their model. Pusher *cannot* pivot without alienating their base. LangSmith *cannot* go non-technical without losing their dev moat.

This means the competitive gap is not a head start that erodes. It's an absence that persists.

## Operational implication

Pursuing #1 and #2 in parallel is the recommended approach: same infrastructure, same canon, same architecture, but two different ICPs (head of support vs. agent-startup dev) so they don't cannibalize attention. Both have CAC under $100 with sharp landing pages. Both have switching cost >>$0 once integrated.

## Provenance

Encoded from session 2026-05-06. References: D0020 (substrate for third-party VAS), D0026 (TinCan as removable UI layer), wrapper-stays-cheap, participation-replaces-integration, doing-less-enables-more.
