---
uri: ams://encodes/2026-05-06/open-core-enterprise-pricing-market-data
title: "Learning — Open-Core Enterprise Pricing Market Data (2026)"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: provisional
tags: ["ams", "tincan", "encode", "learning", "market-research", "pricing", "enterprise", "open-core", "comp-data"]
epoch: E0008.5
date: 2026-05-06
type: L
status: observed
proposed_by: operator-architect-session-2026-05-06
needs_canon_decision: false
needs_validation: false
quality_score: 4
quality_max: 4
governance_uri: klappy://canon/definitions/dolcheo-vocabulary
---

# Learning — Open-Core Enterprise Pricing Market Data (2026)

> Six-tier pattern is consistent across every open-core enterprise vendor surveyed. Smallest credible enterprise contract floor is $10K–$50K ARR. Compliance gates the price jumps, not features. Self-managed pricing typically equals SaaS pricing — customer absorbs infra cost on top.

## The six-tier pattern

Every open-core vendor surveyed (Posthog, Supabase, GitLab, Mattermost, HashiCorp) follows the same six-tier structure:

1. **Free OSS self-host** — permissive license (MIT/Apache), community support, no enterprise features.
2. **Hosted Pro/Standard** — usage-based or per-seat, $10–$30/user/mo or $25–$100/mo flat.
3. **Hosted Team/Compliance** — flat fee that gates SOC2, HIPAA, SSO, SAML, audit, retention.
4. **Enterprise self-managed** — paid license on customer's infra.
5. **Enterprise dedicated SaaS (single-tenant)** — vendor-hosted but isolated.
6. **On-prem / sovereign / air-gapped** — custom, six figures up.

## Verified comp data points (2026)

### Posthog
- Free tier (1M events/mo, MIT-licensed self-host)
- Pro pay-as-you-go from $25/mo with usage overages
- Boost add-on $250/mo, Scale $750/mo, Enterprise add-on $2,000/mo
- Median enterprise contract: $54,443/year (Vendr verified data, n=3)
- Self-hosting operational overhead estimated $5K–$15K/mo when accounting for DevOps allocation

### Supabase
- Free tier (500 MB DB, 50K MAUs, 2 projects)
- Pro $25/mo per project (8 GB DB, 100K MAUs, real-world cost ~$35–$75/mo with usage)
- Team $599/mo (compliance bundle: SOC2, HIPAA via add-on, SSO, audit, 14-day backup retention)
- Enterprise custom pricing
- Median customer pays ~$1,000/year (n=33 verified purchases)
- $25 → $599 jump = 24× compliance gate

### GitLab
- Free (5-user limit on private namespaces)
- Premium $29/user/mo (annual = $348/user/yr)
- Ultimate $99/user/mo ($1,188/user/yr)
- Ultimate Plus / Dedicated (single-tenant SaaS, custom, "significantly higher" than Ultimate)
- **Self-managed = SAME price as SaaS** (customer absorbs infra on top)
- Median customer: $430/year (n=51 verified purchases, mostly Premium)

### Mattermost
- Entry (free, self-hosted, MIT-equivalent)
- Professional ~$10/user/mo
- Enterprise / Enterprise Advanced custom (defense, intelligence, security, critical infrastructure)
- Open-core with paid license unlocking enterprise features in self-hosted binary

### HashiCorp
- Vault Community Edition (free, self-hosted)
- HCP Vault Dedicated: ~$450/mo for development cluster; 50-client deployments $13K–$51K/yr after negotiation
- Vault Enterprise self-managed: $50K+/yr baseline, low six figures typical
- Terraform Cloud: Free up to 500 resources, then $0.10 / $0.47 / $0.99 per managed resource per month (Essentials / Standard / Premium)
- Terraform Enterprise self-hosted: custom, reaches $300K/yr for large deployments
- HashiCorp Flex bundling: list $41,560 with negotiated deals $10,889–$37,861

## Three structural facts that matter more than the numbers

### 1. The "smallest enterprise contract" floor is $10K–$50K ARR

Below this, sales/contracting/legal/support overhead doesn't pencil — vendors lose money on the deal. This is the actual minimum-bother-with-it number, regardless of customer's usage profile. For TinCan this means: don't offer enterprise contracts under ~$10K ARR even when the consumer-tier math would suggest you could.

### 2. Compliance is the jump, not features

The boundary between Pro and Team isn't "more features" — it's "we'll sign a BAA, we have SOC2 Type II, our SSO works with your IdP, our audit log is exportable, our retention is configurable." That work is real, amortizes across customers, and is genuinely what gets gated. Supabase's $25 → $599/mo jump is a 24× step that isn't 24× more features — it's "you're now in a different conversation about who's accountable for compliance."

### 3. Self-managed pricing = SaaS pricing

GitLab and Mattermost both do this explicitly. Customer absorbs their own infra cost on top of the license. The defensible logic: you're paying for the software and our maintenance/support of it, not for our infra. This pattern is the canonical answer to "but I could run it myself" — yes, and you'd pay the same license fee, plus you'd run it. **This is the directly-applicable pricing principle for TinCan E3 (BYO-CF).**

## Negotiation observations

- HCP products show 0–74% discount variability vs. 10–25% for self-managed editions
- Multi-year contracts typical for floor-pricing locks
- Year 1 pricing usually settles at 60–70th percentile of list with annual increase caps of 5–7%
- Volume discounts kick in around 100+ users for per-seat products

## Implications for TinCan enterprise pricing (encode-06)

The four-tier structure proposed in encode-06 maps cleanly onto this market pattern:

- **E1 Workspace** = Hosted Team/Compliance tier (anchored to Supabase Team $599)
- **E2 Dedicated** = Enterprise dedicated SaaS (anchored to GitLab Ultimate Plus, HCP Vault Dedicated, Posthog $54K median)
- **E3 BYO-CF** = Enterprise self-managed (anchored to GitLab self-managed pricing parity)
- **E4 Sovereign** = On-prem / sovereign (anchored to Mattermost Enterprise Advanced, Terraform Enterprise $300K)

The market pattern validates that this structure is recognizable to enterprise procurement teams — which matters because procurement evaluates vendors against shapes they already know.

## Provenance

- **Source:** web_search 2026-05-06 across vendor pricing pages, Vendr marketplace data, Costbench, CompareTiers, Capterra
- **Status:** observed market data, durable reference for future enterprise pricing decisions
- **No decision required** — this is reference material to be consulted when E1–E4 proposals (encode-06) move toward canon decision
