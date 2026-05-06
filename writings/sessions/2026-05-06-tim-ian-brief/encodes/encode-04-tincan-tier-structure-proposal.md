---
uri: ams://encodes/2026-05-06/tincan-tier-structure-proposal
title: "Proposal — Candidate TinCan Tier Structure"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: provisional
tags: ["ams", "tincan", "encode", "proposal", "decision-candidate", "pricing", "tiers", "monetization", "vodka-architecture"]
epoch: E0008.5
date: 2026-05-06
type: D
status: proposed
proposed_by: operator-architect-session-2026-05-06
needs_canon_decision: true
needs_validation: true
target_decision_doc: D-series TBD
quality_score: 5
quality_max: 5
governance_uri: klappy://canon/definitions/dolcheo-vocabulary
---

# Proposal — Candidate TinCan Tier Structure

> Free-to-Industrial ladder calibrated for super-small-per-seat + small-usage anchored against verified Cloudflare unit costs. Designed so any user with TinCan bill under $5/mo is strictly worse off self-hosting due to CF Workers Paid floor.

**Status: proposed. Needs market validation, load measurement under realistic agent traffic, and canon decision document before binding.**

## The structure

| Tier | Price | Bundle | Raw CF cost | Markup |
|---|---|---|---|---|
| **Free** | $0 | ~5 concurrent conversations + 100 messages/mo | <$0.001 | n/a — loss leader |
| **Tin** | $1.99/mo (annual $23.88) | ~100 conversations + 5K messages | ~$0.005–$0.01 | ~200–400× |
| **Foil** | $4.99/mo (annual $59.88) | ~1,000 conversations + 50K messages + custom namespace + longer retention | ~$0.10 | ~50× |
| **Industrial** | $9.99/mo (annual $119.88) | ~10,000 conversations + 500K messages + multi-namespace + priority | ~$1.00 | ~10× |

**Overage above bundle:** $0.001 per message OR $0.01 per conversation (operator picks the unit during canonization). Either reads as "free" to user — literal pennies — and yields 30–300× markup depending on which unit and engagement profile.

## Tier names — proposed but optional

"Tin / Foil / Industrial" follows TinCan-as-brand metaphor. Not load-bearing for the structure; can replace with anything.

## Stripe fee accommodation

Monthly $1.99 charges lose ~18% to Stripe processing fees ($0.36 on $1.99 = 2.9% + $0.30 fixed). This eats more margin than acceptable.

**Mitigation:** Annual prepay default. $23.88 charged once per year takes ~4% in fees. Monthly available but priced punitively at $2.99 to nudge users toward annual. Free trial is monthly; commitment converts to annual.

## Self-host defense — structural, not constructed

Cloudflare's Workers Paid plan has a $5/mo subscription floor — applied whether the user consumes $0.01 or $4 of compute. Anyone whose TinCan bill is under $5/mo is strictly worse off self-hosting before counting time to maintain wrangler/canon/governance.

That's everyone on Tin. Everyone on Foil. Most of Industrial.

The moat does not require feature-gating cleverness. CF's own pricing model defends it for free.

## Validation requirements before commitment

### 1. Hibernation effectiveness under real load

The cost model assumes the WebSocket Hibernation API actually fires when agents go idle. If chatty agents keep DOs awake (worst case: agents that ping every few seconds), duration cost dominates and the per-conversation number warps by 10–50×.

**Action:** measure DO duration billing under realistic agent traffic profiles before committing tier limits.

### 2. Stream vs conversation as billing unit

D0018 (multi-stream per account per conversation) means pricing-per-stream and pricing-per-conversation produce very different unit economics. A conversation with 5 streams has 5× the WS work but 1× the conversation count.

**Action:** decide which unit aligns with how users *think* about their TinCan usage, not how the wire works underneath. This is a UX-pricing alignment question, not a math question.

### 3. Willingness-to-pay validation

$1.99/mo is anchored on Discord Nitro Basic ($2.99) and on what the cost model can absorb. Neither is willingness-to-pay evidence. The architecture supports much lower (free + usage-only) or much higher (per-seat at $5–10) just as well.

**Action:** smoke test with real users in the AI-support handoff vertical (highest-velocity wedge per ams://encodes/2026-05-06/three-verticals-structurally-locked) before committing the consumer-facing tier numbers.

## Margin profile across scale

At every plausible scale tested (1M to 200M accounts), gross margin sits north of 95%. Vodka architecture + scale-to-zero + Hibernation API + the substrate-vs-VAS split (D0020) are the architectural facts producing this margin. None require feature-gating to defend.

## Provenance

Encoded from session 2026-05-06 during pricing exploration with operator. References: D0006 (dream-house wire-edge-wrappers), D0018 (multi-stream per account per conversation), D0020 (agents-as-customer / substrate for VAS), D0026 (two-worker topology), wrapper-stays-cheap, doing-less-enables-more. Cost model verified against Cloudflare published pricing as of 2026-05-06.

Companion encode: ams://encodes/2026-05-06/unit-economics-self-host-defense-moat (the underlying cost model and self-host defense argument).
