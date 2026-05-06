---
uri: ams://encodes/2026-05-06/referral-program-12-24-36-ladder
title: "Proposal — Referral Program with Stacked-Tier Free-Year Ladder"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: provisional
tags: ["ams", "tincan", "encode", "proposal", "decision-candidate", "referral", "growth", "single-tier", "no-mlm", "ambassador-tier", "supersedes-none"]
epoch: E0008.5
date: 2026-05-06
type: D
status: proposed
proposed_by: operator-architect-debrief-session-2026-05-06
needs_canon_decision: true
needs_validation: true
target_decision_doc: D-series TBD
quality_score: 5
quality_max: 5
governance_uri: klappy://canon/definitions/dolcheo-vocabulary
---

# Proposal — Referral Program with Stacked-Tier Free-Year Ladder

> Single-tier referral program (no MLM): each paid referral earns the referrer one month of free service. Twelve referrals = a free year at Tin. Twenty-four total = a free year at Foil. Thirty-six total = a free year at Industrial. Beyond that: ambassador status with non-expiring benefits and partner-program economics. Credit denominated in service, not cash. Designed to be repeatable as a sentence ("refer 12, get a year free") and to produce ambassadors-by-behavior at the post-cap.

## Status

**Proposed**, new artifact. The whole referral mechanic depends on encode-04's stream-vs-conversation billing-unit decision (validation gate #2 in encode-04), so this encode cannot ship before that resolves.

## Core mechanic

### The 12 / 24 / 36 ladder

| Milestone | Referrals | Reward |
|---|---|---|
| **Free Tin year** | 12 paid referrals | Renewal date extends by 12 months at Tin tier |
| **Free Foil year** | +12 (24 total) | Renewal date extends by 12 months at Foil tier |
| **Free Industrial year** | +12 (36 total) | Renewal date extends by 12 months at Industrial tier |
| **Ambassador status** | 37+ | Non-expiring badge, founder credits, partner-program rev share |

Each tier costs the same number of referrals (12). The user-facing rule is consistent: "refer 12 to unlock the next free year."

### Implementation: credits accrue to renewal date

Credit ledger is implemented as renewal-date arithmetic, not as a separate balance.

When a referrer earns a free month, their next renewal date extends by one month. No separate phantom-liability ledger. No expiration anxiety. No stacking confusion. The user sees: "Your subscription renews on [date]. Refer one more friend to push it to [date+30 days]."

### Tier upgrade triggers

Once the referrer has banked 12 free Tin months (renewal date is 12 months in the future at Tin tier), the next paid referral begins accruing toward Foil. The referrer's *current* tier doesn't change — they continue using whatever tier they paid for. What changes is which tier their *future free year* will be redeemed at when they stop paying.

This avoids the conversion-confusion failure mode (where users worry their banked Tin months might get "consumed" to pay for Foil months). Free time is earned tier-by-tier, additively.

## Why this structure works

### Single-tier keeps it out of MLM territory

Compensation flows only from people the referrer directly referred. No downstream-tier compensation, no recruitment-of-recruiters incentive. Avoids FTC pyramid-scheme concerns entirely.

### Credit denominated in service, not cash

Avoids regulatory exposure around stored-value or money-transmitter classifications that emerge once credits become cash-equivalent or transferable between users.

### The 12-referral milestone is bumper-sticker shaped

"Refer 12, get a year free" is repeatable as a single sentence. People can tell it to other people without forgetting the rule. Compare with "Refer 12 for a year, then 6 more for a Foil year due to doubling conversion" — that sentence is a flowchart. Bumper stickers spread; flowcharts don't.

### Each milestone reveals the next finish line

The most psychologically valuable moment in the program is referral 13. The user has just won the first game (free Tin year). At that moment, the UI surfaces the next finish line: "Refer 12 more to upgrade your free year to Foil." This converts a one-time referrer into a sustained one. The structure is the same as Duolingo streaks or airline status tiers — reward isn't crossing the line and stopping, it's discovering a bigger line you didn't know existed.

This mechanic only works because the rule is consistent. Every 12 referrals, a new tier-year. Predictable, visible, achievable.

### Ambassador post-cap converts power users into public advocates

By the time someone has referred 36 paying users, they're not just a power user — they're a public advocate by behavior. The structural fact that they reached referral 36 means they already are what the ambassador tier names. Converting them formally into ambassadors at this point requires no new psychology — only recognition of what they've already done.

Ambassador benefits (proposed):
- Non-expiring "Founder" or "Ambassador" badge on their account
- Early access to new features and tiers
- Reserved namespace on the platform
- Optional cash-rev-share on referrals from this point on (transitions from credit to partner-program economics)
- Listed as a community partner on the public site
- Direct line to the operator for product feedback

The ambassador tier is the population that encode-02 vertical #2 says the GTM strategy needs ("three good integrations posting about it"). The referral program *produces* this population structurally — it doesn't have to be recruited separately.

## Sequencing dependencies

### Hard dependency: encode-04 validation gate #2

Encode-04 lists three validation requirements before tier limits commit. Validation gate #2 ("stream vs conversation as billing unit") must resolve before this referral program can ship, because:

- Free-year credit at "Tin tier" requires Tin tier's usage limits to be defined in a unit users understand
- Tier-upgrade reward at "Foil tier" requires the same
- The post-cap ambassador credits (when they convert from time-based to usage-based) need the unit decision resolved

This is a sequencing dependency, not a redesign requirement. Once encode-04 gate #2 resolves, this referral program can ship without modification.

### Soft dependency: encode-10 annual-pricing reframe

This encode assumes the annual-prepay model from encode-10. Free-year credits work cleanly when the underlying subscription is annual ("renewal date extends by 12 months" is a clean operation). With monthly billing, the ledger gets messier — banked months would have to apply against a series of monthly charges rather than a single annual charge.

If encode-10 doesn't canonize, this referral program needs adaptation. If encode-10 canonizes first (as proposed), this program slots in cleanly.

## Validation requirements before commitment

### Anti-gaming: prevent referral farming

Need anti-gaming controls:
- Email/phone verification on referred accounts
- Referral credit not earned until referee has been a paid customer for some minimum period (30 days?)
- Rate limit on referrals per referrer (e.g., max 10 referrals per month tracked toward credit)
- Manual review threshold (e.g., over 50 referrals in a quarter triggers human review)

### UX: progressive disclosure of the upgrade mechanic

The 12/24/36 ladder should not be disclosed all at once at signup. Lead with "refer 12, get a free year." The 24/36 milestones surface progressively:
- After referral 12: "You did it! Free Tin year earned. Want to upgrade to Foil? 12 more referrals."
- After referral 24: "Foil year unlocked. Industrial is the next finish line — 12 more."
- After referral 36: "You're now an Ambassador. Here's what that means."

Disclosing the full ladder upfront produces fine-print fatigue. Progressive disclosure produces delighter moments.

### Cost-of-program math under realistic adoption

If 1% of paid users hit referral 12, what does that cost in foregone revenue vs. acquired in new paid users? If 0.1% hit referral 36, what's the long-tail cost of free Industrial-year cohorts plus ambassador benefits?

Worth modeling before launch. Encode-01's per-user CF cost numbers make the absolute cost negligible at any plausible scale. The interesting math is foregone subscription revenue — which has to be weighed against the new-user acquisition value of the referrals themselves.

## Provenance

- **Author:** operator-architect (Klappy) + Claude (debrief session 2026-05-06), conversational design pass
- **Origin:** Verbal exploration of multilevel-marketing-style growth mechanics, refined into single-tier program through pressure-testing
- **Quality (oddkit_encode, type=D):** 5/5 strong
- **Status:** proposed, depends on encode-04 gate #2 resolution and encode-10 canonization
- **Companion encodes:** encode-01 (cost math at scale), encode-04 (tier structure and validation gates), encode-05 (brand voice), encode-10 (annual-pricing reframe), encode-12 (agent economy — the broader marketplace context that this referral program eventually integrates into)
