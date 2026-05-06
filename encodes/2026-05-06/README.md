# Encodes — 2026-05-06 session batch

This directory contains DOLCHEO+H artifacts from the 2026-05-06 strategy and debrief session(s). Status is mixed — see individual encodes for `status:` field.

## What's in this commit (wave 3 from debrief session)

These were produced or refined during a debrief session on the afternoon of 2026-05-06, in collaboration with a Claude conversation. All files were copied from that session's outputs directory at commit time.

- `encode-09-architecture-as-strategy-translation-layer.md` — Insight (H, observed). Claude-authored observation about the relationship between architectural commitments and strategy artifacts.
- `encode-10-annual-default-pricing-reframe.md` — Proposal (D, proposed). Annual-default pricing with Tin/Foil/Copper/Fiber tier ladder. Supersedes encode-04's Stripe-fee section, tier dollar amounts, and tier names.
- `encode-11-referral-program-12-24-36-ladder.md` — Proposal (D, proposed). Single-tier referral program (12 referrals → free Tin year, etc.) with ambassador post-cap.
- `encode-12-agent-economy-oddie-platform-pivot.md` — Proposal (D, proposed, **tier 1**). High-stakes strategy pivot from B2C SaaS to character-driven agent economy. Explicitly flagged for fresh-eyes review before commitment.
- `encode-13-agent-economy-product-surface-wave-3.md` — Capture (O, captured). Verbatim record of BraigsList, Penny-onaire's Club, Oddie character pitch, BYOK structure, and other product surface introduced during a live group-text pitch with Tim Jore and Ian Lindsley. Capture-only; not pressure-tested.
- `SESSION-OVERVIEW-2026-05-06.md` — v3 session overview synthesizing all three waves of the debrief.
- `exec-summary-tim-ian.md` — Operator's exec summary from the prior-night session (2026-05-05), provided as session input. Originally generated alongside encodes 01-08.

## Where encodes 01–08 live

Yesterday's encodes (01–08), produced during the 2026-05-05 strategy session, were committed by the operator (commit `af729c2`) in a different directory:

```
journal/sessions/2026-05-06-tim-ian-brief/
├── encodes/
│   ├── encode-01-unit-economics-moat.md
│   ├── encode-02-three-vertical-wedges.md
│   ├── encode-03-open-closed-ip-cut-proposal.md
│   ├── encode-04-tincan-tier-structure-proposal.md
│   ├── encode-05-brand-voice-posture.md
│   ├── encode-06-enterprise-tier-structure-e1-e4-proposal.md
│   ├── encode-07-customer-funded-b2c-funds-b2b-strategy.md
│   └── encode-08-open-core-enterprise-pricing-market-data.md
├── exec-summary-tim-ian.md
└── README.md
```

The wave-3 encodes here (09–13) reference 01–08 by URI (`ams://encodes/2026-05-06/{slug}`). The URI namespace is logical, not file-path, so cross-references resolve regardless of physical location.

Note: this directory contains a copy of `exec-summary-tim-ian.md` that duplicates the one in `journal/sessions/2026-05-06-tim-ian-brief/`. Operator may want to consolidate to one location; flagged for cleanup.

## Status of the batch

Nothing in this batch is canon yet. All proposals carry status `proposed` and are pending canon decision documents. Encode-12 specifically carries an explicit fresh-eyes-review decision gate — the agent-economy pivot it proposes is not committed to until the operator reviews it cold (next morning, ~2026-05-07).

The session overview brief (SESSION-OVERVIEW-2026-05-06.md) is the synthesis document that ties everything together. Read that first if reading the batch fresh.

## Provenance note

This commit was created by a Claude debrief session at the operator's direction, on a branch (`claude/2026-05-06-debrief-encodes-wave3-{slug}`). No PR was opened; the operator may merge, branch off, amend, or discard at their discretion after fresh-eyes review.
