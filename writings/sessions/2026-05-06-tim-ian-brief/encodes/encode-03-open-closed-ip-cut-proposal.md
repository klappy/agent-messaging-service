---
uri: ams://encodes/2026-05-06/open-closed-ip-cut-proposal
title: "Proposal — Open/Closed IP Cut for AMS+TinCan"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: provisional
tags: ["ams", "encode", "proposal", "decision-candidate", "ip", "open-source", "licensing", "vodka-architecture", "open-substrate"]
epoch: E0008.5
date: 2026-05-06
type: D
status: proposed
proposed_by: operator-architect-session-2026-05-06
needs_canon_decision: true
target_decision_doc: D-series TBD
quality_score: 5
quality_max: 5
governance_uri: klappy://canon/definitions/dolcheo-vocabulary
---

# Proposal — Open/Closed IP Cut for AMS+TinCan

> Substrate stays open because that's the literal positioning bet. Reference UI stays open because it's the proof of D0026. Verticalized productizations stay closed because that's where revenue lands and shipping them open lets competitors clone in a weekend.

**Status: proposed. Not binding until canonized as a D-series decision document.**

## The cut

### Open under permissive license (Apache 2.0 or MIT)

- **AMS Worker** — protocol routes, ConversationDO, magic-link minting, MCP endpoint, healthz
- **AMS SPEC.md** and protocol docs — the wire format itself
- **Reference TinCan** — deliberately bare, plain, unbranded. Exists to prove D0026 ("TinCan is one removable UI layer, not the only possible one")
- **MCP server, SDKs, client libraries** — anyone building on AMS needs these
- **Sample integrations and tutorials** — distribution
- **klappy.dev canon** — already open, stays open
- **oddkit toolchain** — already open, stays open
- **Governance methodology** — operating contract, mode discipline, DOLCHEO+H, supersession chains, audit patterns

### Closed under commercial license

- **Productized verticals** — AI-support handoff product, watching-room observability product, branded TinCan SaaS
- **Hosted SLA-backed AMS service** — anyone can self-deploy AMS open source; they pay us to *not have to*
- **Brand and trademarks** — "TinCan" the product name, marks, look. Anyone can ship AMS-compatible UI; they cannot call theirs TinCan
- **Customer dashboards, billing integrations, admin tooling**
- **Production-tuned configurations, observability dashboards, runbooks**
- **Enterprise features** — SSO, SCIM, audit log export, data residency, custom retention, SLA contracts, on-prem deploy assistance

### Developer SKU model

Recommend **Posthog/Supabase open-core**: code stays fully open, paid product is the hosted service. Reasoning:

1. Coherent with D0020's open-substrate posture
2. Better viral story ("entire wire is open, here's the repo, run it yourself or pay us")
3. Easier to defend — moat is operational excellence rather than secret code
4. Open-core with closed feature gating tends to degrade — every closed feature is a tax on the open story, and engineers smell it
5. Posthog/Supabase have demonstrated the pure-hosted model works at hundreds of millions of ARR

## The test

For any new feature decision, the question is:

> **"Does this prove the substrate is removable, or does it productize it?"**

Open if the former. Closed if the latter.

This test is the operational form of the cut. Without it, every feature decision relitigates the open/closed line implicitly, and accumulated drift moves productization into the public repo where competitors can clone it.

## Critical structural action — fork the public TinCan from the productized TinCan

Today the TinCan that ships at `klappy/agent-messaging-service` is a single artifact that is both:

1. The reference implementation (proves D0026)
2. The proto-product (what end users see)

These need to fork the moment branding, billing, or feature-gating land. Public repo gets a deliberately-bare reference TinCan. Private repo gets the productized TinCan with branding, billing, and the surfaces that make it a SKU.

The fork is structural, not aesthetic. Every productization feature accumulated in the public repo is a feature given away to competitors.

## Three judgment calls worth flagging for the canon decision

1. **Where does the line for MCP enhancements fall?** Base MCP server is open. MCP-specific value-adds (custom prompt templates, agent-management tooling, multi-tenant orchestration patterns) — open or closed? Watch wrapper-stays-cheap canon: if mcp.ts is already 1,401 lines and growing, the test is whether each new feature *belongs in the wrapper* or *belongs in a closed product layer above it*.

2. **Operating-contract docs.** Model-operating-contract, canon methodology, oddkit — open and public, part of the credibility pitch. But specific GTM docs, sales playbooks, customer lists, internal financial models — closed. The "how we work" is open; the "what we sell and to whom" is not.

3. **Reference TinCan visual baseline.** The bare reference UI should be visually plain and obviously not the productized SaaS. If it looks too polished, every clone is one CSS file away from competing. If it looks too sparse, it doesn't prove the substrate-can-power-real-product claim. Calibration question for the eventual canon decision.

## Why this should canon now, not later

The argument for now: revenue work hardens implicit choices into accidental policy. Reversing them later is expensive — committed customers, deployed code, contractual commitments.

The argument for waiting: writing the cut prematurely commits to a specific revenue strategy before market signals come in.

Operator-architect note (2026-05-06): leaning "now" but not obvious. Decision document drafting is the next concrete action if the answer is "now."

## Provenance

Encoded from session 2026-05-06 during pricing and positioning exploration. References: D0020 (agents-as-customer / substrate for third-party VAS), D0026 (two-worker topology — AMS substrate, TinCan UI layer), wrapper-stays-cheap, participation-replaces-integration, doing-less-enables-more.
