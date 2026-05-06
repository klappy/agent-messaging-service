---
uri: ams://encodes/2026-05-06/annual-default-pricing-reframe
title: "Proposal — Annual-Default Pricing with Commitment-as-Discount Framing"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: provisional
tags: ["ams", "tincan", "encode", "proposal", "decision-candidate", "pricing", "annual", "stripe-fees", "brand-voice", "supersedes-encode-04"]
epoch: E0008.5
date: 2026-05-06
type: D
status: proposed
proposed_by: operator-architect-debrief-session-2026-05-06
needs_canon_decision: true
needs_validation: true
target_decision_doc: D-series TBD
supersedes_section: ams://encodes/2026-05-06/tincan-tier-structure-proposal#stripe-fee-accommodation
quality_score: 5
quality_max: 5
governance_uri: klappy://canon/definitions/dolcheo-vocabulary
---

# Proposal — Annual-Default Pricing with Commitment-as-Discount Framing

> Headline price is what the product is worth. Annual prepay is what loyalty earns, at ~58% off across all tiers. Monthly is available for users who genuinely need flexibility, priced honestly at the headline. The reframe replaces encode-04's "punitive monthly to nudge annual" with "honest monthly, generously-discounted annual." Doubling-headline / consistent-discount ladder produces clean, predictable pricing across four tiers (Free, Tin, Foil, Copper, Fiber). Tier names follow telecom-substrate progression coherent with AMS-as-phonelines positioning. Cleaner brand voice; better cash flow for solo founder; structurally consistent across the ladder.

## Status

**Proposed**, supersedes the Stripe-fee-accommodation section of encode-04 *and* the specific dollar amounts in encode-04's tier table *and* the tier names in encode-04 (Industrial → Copper rename in wave 3). The tier name pattern (Tin / Foil / Copper / Fiber) replaces encode-04's (Tin / Foil / Industrial). Wave 3 added Fiber as a fourth real tier rather than a "future" placeholder, completing the ladder from telecom-substrate-progression metaphor.

## The reframe

### Pricing structure (wave 3)

| Tier | Headline (monthly) | Annual prepay | Annual-equivalent monthly | Discount |
|---|---|---|---|---|
| **Free** | $0 | n/a | n/a | n/a |
| **Tin** | $4.99/mo | $24.99/yr | $2.08/mo | ~58% off |
| **Foil** | $9.99/mo | $49.99/yr | $4.17/mo | ~58% off |
| **Copper** | $19.99/mo | $99.99/yr | $8.33/mo | ~58% off |
| **Fiber** | $39.99/mo | $199.99/yr | $16.67/mo | ~58% off |

Pattern: headline monthly doubles at each tier, annual prepay roughly doubles at each tier, discount ratio is consistent. The annual numbers all use $X9.99 endings for SaaS-pricing-convention readability.

**Whiteboard rounding alternative.** Operator wave 3 whiteboard used round numbers: $25/yr, $50/yr, $100/yr, $200/yr. Either choice is structurally valid:
- $X9.99 endings: standard SaaS pricing-page convention, reads as "deal" psychology
- Round numbers: cleaner, simpler, more honest, fewer characters on a marketing page

Reconciliation deferred to canon decision. The structural model (doubling headline, ~58% discount) is invariant to which rounding convention is chosen.

### Tier name rationale

The Tin / Foil / Copper / Fiber ladder follows telecom-substrate progression:
- **Tin** — tin can on a string (cheapest comms, the brand metaphor)
- **Foil** — tin foil hat (slightly better, still hobbled together — completes the "Tin Foil Hat Trick" pun for the bottom three tiers)
- **Copper** — actual telecommunications wire (the substrate becomes real)
- **Fiber** — modern high-bandwidth (top tier, enterprise-feeling without sounding cold-corporate)

Each step is "the line got better materially." Maps to AMS-as-phonelines positioning. Reads as a progression people understand intuitively (everyone knows fiber is better than copper).

The previous tier name "Industrial" was deprecated in wave 3 because it sounded enterprise-shaped despite being positioned as top consumer tier — a naming mismatch that the Copper/Fiber rename resolves. The actual enterprise tiers (E1 Workspace through E4 Sovereign in encode-06) remain unchanged.

### Brand-voice framing

> "Here's what we think it's worth ($4.99/mo for Tin). Here's what loyalty earns ($24.99/yr if you commit a year — ~58% off). Here's monthly for users who genuinely need flexibility. Free tier is for everyone who wants to taste it first."

Coherent with encode-05's "we know that" voice. The discount is now evidence of the architectural claim ("we run cheap, we'd rather have you for a year than churn you in two months") rather than a Stripe-fee workaround.

The consistent ~58% discount across all tiers means the same brand-voice sentence works at every tier — only the dollar amounts change.

## Why this is structurally better than encode-04's framing

### Defuses the perceived-value risk

Encode-07 risk #2: "$1.99 floor may not convert. Perceived value too low ('if it's that cheap it can't be real')." A $4.99 anchor with $1.99 commitment-equivalent doesn't trigger the cheap-equals-fake reflex. The $4.99 is what the product signals it's worth; the $1.99 is what loyalty earns. Different psychological frame entirely.

### Cash flow lands upfront

For solo founder with no cash on hand, $24 in the bank today beats $1.99 × 12 months stretched out over a year that may or may not happen. Encode-07 phase 2 targets "$500–$3K MRR by end of phase." Annual prepay isn't MRR — it's cash, banked, available to fund work now. The cash-flow shape of annual-default is materially different from monthly-default and better suited to the solo-founder runway problem encode-07 acknowledges.

### Stripe fee math works cleanly as a default, not a tactic

- $4.99 × 12 monthly = $2.94 in Stripe fees on $59.88 = ~4.9% (if user pays monthly all year)
- $24.99 charged once annually = ~$1.02 in fees = ~4.1%

The fee delta narrows but is still cleaner with annual. More importantly, annual prepay produces $24.99 in cash today vs. $4.99 in cash today + 11 months of collection risk. For solo founder with no cash on hand, that asymmetry is the load-bearing benefit, not the fee math.

Encode-04 already noted the fee math. What changes: it's no longer a defensive footnote, it's the load-bearing pricing model alongside cash-flow timing.

### Churn becomes annual-cohort, not monthly-attrition

Encode-07 risk #3: "Net revenue retention 50–70% typical at this floor." If most users are on annual, you don't have monthly churn — you have annual renewal events. Renewal events are easier to forecast, easier to recover with a renewal nudge, and produce a population of users who've already committed to a year of usage. Different dynamic from $1.99/mo gym-membership churn.

### Brand-voice coherence

Encode-04's monthly-priced-punitively-at-$2.99 reads as adversarial. The user who chose monthly because they couldn't commit blind is being penalized for honest hesitation. That's inconsistent with encode-05's "we know that" posture, which respects the buyer's reasoning. Annual-default with honest monthly inverts this: monthly users pay the headline price (which is fair), annual users earn a discount (which is generous). Both feel respected.

## What stays the same as encode-04

- The Free tier (loss leader, ~5 conversations + 100 messages/mo)
- The tier-name structure (Tin / Foil / Industrial — TinCan-as-brand metaphor)
- The included usage at each tier (~100 conv / ~1K conv / ~10K conv)
- The structural self-host defense (CF $5/mo Workers Paid floor — anyone whose TinCan bill is below $5/mo is strictly worse off self-hosting)
- All three validation gates from encode-04 (Hibernation effectiveness, stream-vs-conversation billing unit, willingness-to-pay smoke test)

## Per-tier CF cost-to-serve — refinement from operator whiteboard 2026-05-06 (wave 3)

Operator whiteboard sketch showed per-tier CF cost-to-serve estimates (these are operator's rough estimates of average CF cost per tier, not overage rates):

- Tin tier average user: ~$0.05/mo CF cost to serve
- Foil tier average user: ~$0.10/mo CF cost to serve
- Copper tier average user: ~$0.20/mo CF cost to serve
- Fiber tier average user: ~$0.40/mo CF cost to serve

These refine encode-01's flat ~$0.005–$0.01/mo number by showing how cost scales with tier usage. Higher tiers have higher engagement (more conversations, more agents, more activity), so per-account CF cost rises — but only to ~$0.40/mo at the top consumer tier.

### Markup ratio is consistent across tiers

Cross-checked against encode-10 pricing:

| Tier | CF cost/mo | Annual price | Annual-equivalent monthly | Markup ratio |
|---|---|---|---|---|
| Tin | $0.05 | $24.99 | $2.08 | ~40× |
| Foil | $0.10 | $49.99 | $4.17 | ~40× |
| Copper | $0.20 | $99.99 | $8.33 | ~40× |
| Fiber | $0.40 | $199.99 | $16.67 | ~40× |

The markup ratio holds at ~40× across all four tiers. This is a stronger validation of vodka margins than encode-01's single-point estimate — it shows the margin profile is *structurally consistent* across the engagement spectrum, not just at the low end. Higher-engagement users cost more to serve and pay more, in proportion. The architecture's margin structure is invariant to user engagement profile.

### Implication for overage pricing

The whiteboard did not specify overage rates separately. Overage rates remain an open question dependent on encode-04 validation gate #2 (stream-vs-conversation billing unit). When that gate resolves, overage should be priced to:

1. Stay above CF cost-to-serve for any plausible usage profile (i.e., overage at Tin should be more than $0.05 per overage unit's marginal CF cost)
2. Encourage users approaching tier limits to upgrade to the next tier rather than pay overage indefinitely
3. Maintain the brand-voice posture: honest pricing, not punitive

Encode-04's original $0.001/msg or $0.01/conv flat overage is still the placeholder. The tiered structure may or may not extend to overage; that's a deliberate design decision pending gate #2.

## Implementation note — funnel design

A potential concern: "pay $24.99 upfront for a service you've never tried" is a different psychological purchase than "pay $4.99/mo and cancel any time." Some users won't commit blind to the annual even though it's cheaper over the year. The funnel should accommodate this rather than fight it.

Suggested funnel:
1. **Free tier** for users who want to taste it first
2. **Monthly at headline price** ($4.99 Tin) for users who need flexibility before committing
3. **Annual prepay** ($24.99 Tin) as the marketed deal for users ready to commit
4. **Renewal nudge** at month 11 of annual: "Lock in another year at the same rate"
5. **Monthly-to-annual upgrade** path with prorated credit for users who tried monthly first

Punitive monthly pricing is rejected. Honest monthly pricing at the headline value is the default.

## Provenance

- **Author:** operator-architect (Klappy), debrief session 2026-05-06
- **Origin:** verbal reframe during exploration of encode-04 pricing structure
- **Quality (oddkit_encode, type=D):** 5/5 strong — supersedes a clear section of an existing encode with a cleaner mechanism
- **Status:** proposed, supersedes encode-04's Stripe-fee-accommodation section pending canon decision
- **Companion encodes:** encode-04 (tier structure, retains all other content), encode-05 (brand voice — this proposal extends the voice posture into pricing mechanics), encode-07 (customer-funded growth — this proposal materially improves the cash-flow timing of phase 1)
