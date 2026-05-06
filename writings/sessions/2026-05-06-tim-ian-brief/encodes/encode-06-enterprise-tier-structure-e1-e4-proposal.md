---
uri: ams://encodes/2026-05-06/enterprise-tier-structure-e1-e4-proposal
title: "Proposal — Candidate Enterprise Tier Structure (E1–E4)"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: provisional
tags: ["ams", "tincan", "encode", "proposal", "decision-candidate", "enterprise", "pricing", "tiers", "discrete-deployment", "byo-cloud", "sovereign"]
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

# Proposal — Candidate Enterprise Tier Structure (E1–E4)

> Four enterprise tiers above the consumer ladder, spanning mid-market SaaS through sovereign deployment. Anchored against open-core market comps (Posthog, Supabase, GitLab, Mattermost, HashiCorp). E4 deferred until headcount exists.

## Status

**Proposed**, not decided. Needs operator commitment, market validation, and a D-series canon document before binding.

## The four tiers

### E1 — Workspace — $599–$999/mo (or $7K–$12K/yr)

Mid-market SaaS, flat fee on top of consumer tiers. Bundles SSO/SAML, SOC2 Type II, audit logs, 24/7 support, 99.9% SLA, BAA available, configurable retention. Up to ~100 paid seats, custom namespace, multi-team admin. Self-serve checkout but a real enterprise contract on the back end. The floor for "we're a real company, can't be on your shared infra."

**Anchored to:** Supabase Team ($599/mo), Posthog Enterprise add-on ($2K/mo), Slack Business+ at scale.

### E2 — Dedicated — $2K–$10K/mo or $25K–$100K/yr

Single-tenant SaaS — dedicated CF account or isolated Workers/DOs in our org. Data residency choice (CF region selection), custom retention, priority SLA, dedicated support engineer. Sales-assisted, talk-to-us pricing.

**Anchored to:** GitLab Ultimate Plus / Dedicated, HCP Vault Dedicated, Posthog Enterprise typical contract size (~$54K median).

### E3 — BYO-CF — same license as E2 plus customer's own CF bill

Customer's own Cloudflare account, we deploy and maintain it there. Customer signs the BAA with CF directly; we sign one with the customer for the software. License + support contract; customer pays CF separately for compute. Pricing parity with E2 (not a discount) because we're not subsidizing their infra.

**Anchored to:** GitLab self-managed pricing parity, Mattermost Enterprise self-hosted, Vault Enterprise.

### E4 — Sovereign — custom, $100K+/yr

Non-CF substrate path (OpenWorkers + Hetzner, or AWS Lambda + API Gateway as fallback). Air-gapped, on-prem, or sovereign-cloud deployments. Real engineering cost — porting AMS off CF Workers is non-trivial and pricing reflects that. Compliance-driven verticals: defense, intelligence, healthcare-at-scale, regulated finance, government.

**Anchored to:** Mattermost Enterprise Advanced, Terraform Enterprise self-hosted (~$300K), Vault Enterprise floor.

## Critical caveat on E4

E4 violates the implicit assumption in D0006 and D0026 that AMS runs on CF Workers + DOs. Porting to OpenWorkers + Hetzner, or AWS Lambda + ElastiCache + API Gateway as a substrate, is real engineering work and changes the architectural story.

Solo-founder reality means E4 should be priced as "$250K+ minimum, 6-month engagement" so the buyers who really need it self-select out — or deferred entirely until headcount exists to deliver without compromising the other tiers. Treating E4 as aspirational rather than available is the honest posture until a team can support it.

## What stays the same as the consumer pitch

The brand voice posture (encode-05) extends to enterprise unchanged. Buyers at E1–E3 are told explicitly that the substrate is open, the repo is right there, and the exit is real. They are paying for labor, accountability, and compliance work — not for rent on the wire. This is what makes the same posture scale from $1.99 to six figures without sounding like two different companies.

## Provenance

- **Author:** operator-architect (Klappy) + research synthesis, session 2026-05-06
- **Quality (oddkit_encode, type=D):** 5/5 strong
- **Quality (oddkit_encode, type=L):** 4/4 strong
- **Comp data sources:** Posthog public pricing + Vendr median; Supabase pricing page; GitLab pricing + Vendr; Mattermost docs + market research; HashiCorp HCP Vault Dedicated + Terraform Cloud + Vendr (web_search 2026-05-06)
- **Status:** proposed, awaiting D-series canon decision and market validation before binding
