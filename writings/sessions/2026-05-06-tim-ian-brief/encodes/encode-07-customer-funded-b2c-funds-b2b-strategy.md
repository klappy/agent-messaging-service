---
uri: ams://encodes/2026-05-06/customer-funded-b2c-funds-b2b-strategy
title: "Proposal — Customer-Funded Growth: B2C Funds B2B Hires"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: provisional
tags: ["ams", "tincan", "encode", "proposal", "decision-candidate", "strategy", "go-to-market", "funding", "no-funders", "solo-founder", "customer-funded"]
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

# Proposal — Customer-Funded Growth: B2C Funds B2B Hires

> Solo founder, no external funders. Ship consumer tiers first, distribute, compound to ~$8–10K MRR, then fund first B2B hire from accumulated MRR plus their first 2–3 enterprise contracts. Subsequent hires funded by contracts the previous hire closed.

## Status

**Proposed**, operator-leaning-toward-committed but proposal status preserved pending sanity-check from external advisors (Tim, Ian) and pressure-testing of the consumer-launch distribution risk.

## Operator constraint

Declared 2026-05-06: solo founder with capacity to recruit and train a small team but no current headcount. Strategic decision: do not raise from VCs or general-purpose funders.

## Why no funders

1. **No dilution preserves architectural discipline** that VC pressure would erode. The vodka thesis and the open-substrate positioning don't survive contact with growth-rate metrics designed for normal SaaS.
2. **Board obligations would impose** quarterly metrics that don't fit substrate-positioning. A board would push for hiring before product-market fit signals are clear, which means burning the structural margin advantage to look like normal SaaS.
3. **Customer-funded means customer-validated.** Every hire justified by revenue already in bank. Can't be wrong about product-market fit because the contracts are the proof.
4. **Optionality preserved.** Can raise later from a position of revenue and proof if a swing-for-the-fences moment emerges. Give up nothing by waiting; give up a lot by raising early.

## Phased sequencing

**Phase 1 — months 0–2 (solo):** Ship consumer tiers (Free / $1.99 Tin / $4.99 Foil / $9.99 Industrial per encode-04). Stripe billing, tier-limit enforcement in TinCan, homepage rewrite, open-source-with-clear-license framing. Mostly billing integration; product is built.

**Phase 2 — months 2–4 (still solo):** Distribution. One good HN post, X thread, dev newsletter mentions. Goal: several thousand free signups, 5–15% paid conversion because price floor is so low it doesn't trigger evaluation. Revenue: $500–$3K MRR by end of phase.

**Phase 3 — months 4–8 (still solo):** Compound. Product is in market, integrations being built by users, revenue grows from $3K toward $10K MRR. Around the $8–10K MRR mark, first hire is credibly fundable with a margin of safety from existing run rate plus small cash buffer.

**Phase 4 — month 8+:** First B2B hire (sales-engineer / customer-success hybrid at remote/international rates ~$80–110K all-in). They take over the AI-support handoff vertical landing page, run discovery, close the first 2–3 enterprise contracts in months 9–12. Each contract $25K–$100K ARR. Now B2B revenue funds hire #2; B2C revenue is the stable floor underneath the whole thing.

## Why this is structurally feasible

Architecture supports the path because:

- **Consumer tiers scale solo.** Stripe handles billing, async email handles support given good docs, even at 100K accounts the work is bounded.
- **B2B verticals stay manageable until ~$1M ARR.** Landing pages, async sales, async support; 24/7 on-call rotation only matters once contracts have SLA backing, which is hire-#2 territory.
- **The canon itself is onboarding material.** Operating contract, oddkit, mode discipline, DOLCHEO+H, supersession chains — a new hire reads the canon and can hold their own without the founder being present in every decision. Recruiting filter: people who don't want to read 60 canon documents before contributing self-select out.

## Acknowledged risks and mitigations

- **Consumer launch may underperform.** If the HN post gets 5 upvotes instead of 500, funnel timeline slides 6–12 months. *Mitigation:* sequence of distribution shots not single-launch bet (soft launch, integration-of-the-month posts, agent-startup outreach, content marketing).
- **$1.99 floor may not convert.** Perceived value too low ("if it's that cheap it can't be real") or pulls in low-effort users who clog support. *Mitigation:* A/B test entry tier ($1.99 vs $4.99 vs $9.99 as lead) early, watch conversion ratios, adjust before commitment hardens.
- **Churn at $1.99 is real.** Net revenue retention 50–70% typical at this floor. Steady-state subscriber count plateaus at ~3× monthly net adds, not at cumulative signups. *Mitigation:* timeline buffer; plan for 12 months to first hire instead of 6 if churn is high.
- **Solo support volume scales with signups.** Some non-zero fraction will email regardless of self-serve docs. *Mitigation:* ruthless docs, route through help center, decline email support on consumer tiers (with kindness, in the FAQ), community channel for peer-to-peer.
- **Time-to-first-B2B-hire is 6–9 months — slowest of the three paths.** If a competitor ships the AI-handoff product in month 4, we're behind. *Mitigation:* keep B2B landing pages live in background to preserve optionality; accept demo requests but don't actively pursue until hire is funded.

## Tradeoffs

**vs raising:** slower but no dilution, no positioning compromise, no growth-pressure that breaks vodka discipline.

**vs enterprise-prepay-first:** lower concentration risk (lose 50 small accounts vs. one big customer, very different impact), stronger trust signal when enterprise motion does start (real install base to point at during procurement review), builds viral distribution that becomes B2B inbound.

## Provenance

- **Author:** operator-architect (Klappy), session 2026-05-06
- **Quality (oddkit_encode, type=D):** 5/5 strong
- **Quality (oddkit_encode, type=H):** 4/4 strong
- **Quality (oddkit_encode, type=L):** 4/4 strong
- **Status:** proposed, operator-leaning-toward-committed, awaiting Tim+Ian sanity-check and consumer-launch pressure-test before binding
