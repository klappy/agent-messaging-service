---
uri: ams://canon/decisions/D0022-multi-brand-portfolio-on-shared-substrate
title: "D0022 — Multi-Brand Portfolio: Independent Reference Implementations on a Shared Substrate"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "decision", "positioning", "brand", "marketing", "go-to-market", "vodka-architecture"]
epoch: E0008.4
date: 2026-05-04
derives_from: "D0020-agents-as-customer-and-third-party-vas-substrate (the substrate-not-application positioning this decision extends to the brand layer); D0006-dream-house-wire-edge-wrappers (the wrapper architecture that makes independent implementations possible); ams://canon/principles/envelope-altitude-consensus (the wire-altitude argument that licenses many surfaces atop one substrate); operator↔Claude planning conversation 2026-05-04 articulating the multi-brand portfolio discipline, the three-product target, the deferred-naming posture, and the iterative build-then-brand sequence anchored on the TinCan PoC"
complements: "D0020-agents-as-customer-and-third-party-vas-substrate, ams://canon/constraints/permanent-non-goals, ams://canon/principles/participation-replaces-integration"
governs: "How the AMS protocol is presented to the world. Whether marketing surfaces share one identity or carry independent ones. Where the protocol name appears, where brand names appear, and the discipline that prevents brand surfaces from becoming product gates."
status: active
---

# D0022 — Multi-Brand Portfolio: Independent Reference Implementations on a Shared Substrate

> AMS is the protocol. The marketing surfaces are independent brands — three product brands as the initial portfolio target, with specific names and axes deferred until product clarity emerges from build. No brand is the lead. The portfolio is shaped like Cloudflare's product family, not P&G's competing detergents: relationships are traceable for anyone who looks, and no brand pretends siblings do not exist. The current PoC, codenamed TinCan, is the first-pass iterative learning vehicle from which the three-product cuts emerge — TinCan is not itself a brand.

## Description

`D0020` commits AMS to substrate-not-application at the product level. This decision extends that commitment to the marketing layer. The protocol — AMS — is the durable artifact: documented, versioned, RFC-shaped, neutral in voice. Around it, a deliberate portfolio of independent brand surfaces is intended to present the same substrate to different audiences, each carrying a different positioning thesis, each free to evolve its voice without dragging the others.

The portfolio approach is a deliberate alternative to the umbrella approach (one brand, one site, several positioning angles A/B-tested under one identity). Both can work. The portfolio choice was made on three grounds: each brand can speak one psychographic without compromise, the differential conversion across surfaces is itself the positioning experiment, and the substrate-vs-application discipline AMS already follows for products generalizes naturally to marketing — the protocol stays opinionated about nothing; the brands are the explicit opinions about who the protocol is for.

**Build-then-brand, not brand-then-build.** The portfolio is intended to consist of three product brands. Specific names, axes, and voices are deliberately deferred until product clarity emerges from build evidence. The current proof-of-concept (codenamed TinCan) is the first-pass iterative learning vehicle — its scope is structurally minimal: prove that the MCP server connects to the wire and two ends can talk. Brand-naming follows product-clarity, not the other way around. The discipline this decision commits to applies to whatever brands eventually emerge; the specific portfolio composition will be locked in a successor decision when build evidence justifies the cuts.

This reverses the pre-commitment temptation. The temptation is to lock four (or three) brand identities up front, build toward them, and force the products to match the brands. The discipline is the opposite: build a PoC, learn what shapes the product wants to take, identify the cuts, then name and brand them. TinCan is the build-side codename for the iterative learning that makes the brand work knowable.

## Outline

- The Portfolio Discipline
- Hero-as-User, Brand-as-Guide
- AMS as Attribution, Not as Brand
- Cloudflare Mode, Not P&G Mode
- The Discipline That Prevents Drift
- One Brand Carries the Thesis
- What This Forecloses
- What This Is Not
- Reversibility and Retraction Triggers
- See Also

---

## The Portfolio Discipline

The portfolio commits to specific structural properties; the specific brands are deferred to a successor decision.

**Three product brands as the initial portfolio target.** Three is the commitment because it is large enough to enable differential conversion as positioning experiment, small enough that each brand can be properly built and maintained, and consistent with the operator's commitment to build three products and learn from the patterns rather than over-reach to all-things-to-all-people. Fewer than three is umbrella mode by another name; more than three is dilution. The "three" is a numerical target, not a four-product set with one removed.

**Each brand owns one psychographic axis.** The axes are mutually exclusive at the voice level even though the substrate underneath is identical. The actual axes are downstream of build learnings about which audiences resonate to which framings. As illustration of the *kind* of axis that may emerge — not as commitments — examples that surfaced during the planning exploration include: minimalism / developer purity, integration craft, operational reliability / enablement. Whichever three the build evidence justifies are the three.

**Each brand exists to make one psychographic feel that AMS was made for them.** Whatever the eventual three are, they are not facets of one product wearing different masks; they are three reference implementations of the same protocol, with sufficiently different voices that a visitor landing on one would not immediately guess at the existence of the others.

The portfolio composition is reversible at the brand level. If a brand fails to find traction, it retires without affecting the substrate or the other brands. If a fourth brand becomes warranted by an audience the three miss (an enterprise buyer brand, a research-community brand), it is added under the same discipline. The substrate is the durable thing; the brands evolve.

## Hero-as-User, Brand-as-Guide

Each brand follows the StoryBrand-style hero/guide structure: the user (human or agent) is the hero of every page; the brand is the guide. "We are the wire" centers us; "Open a wire" centers them. "We connect your calls" centers us; "Dispatch any message, anywhere" centers them. The language test for any brand surface is whether the verb belongs to the user or to the platform. If the platform is the actor, the copy is wrong.

This rules out switchboard-style framings (the brand is the operator who connects calls for the user) and rules in dispatch-style framings (the user dispatches; the brand makes dispatch possible). It applies to every brand in the portfolio and to any future addition. A brand that centers the platform as actor cannot enter the portfolio; the discipline is the price of admission.

## AMS as Attribution, Not as Brand

AMS itself is not a brand surface in the consumer-facing sense. The protocol home (`ams.klappy.dev`) is RFC-shaped: spec, canon, neutral voice, written for implementers and auditors. It is the document of record, not a marketing site.

The brands link to AMS as "the protocol underneath," the way a Mastodon instance links to the ActivityPub spec. A visitor on any one of the brands who clicks through to AMS arrives at the same protocol document. The brands compete for psychographic attention; the protocol is the shared neutral ground.

This is also the integrity floor. A claim that two brands "are independent" is only credible if a third party can audit the substrate and confirm both speak the same wire. AMS being publicly documented and openly implemented is what makes the multi-brand play honest. Without the substrate being open, the portfolio reduces to one company wearing several masks.

## Cloudflare Mode, Not P&G Mode

Two reference points for multi-brand strategies on a shared substrate:

- **P&G Mode** — Tide, Gain, Cheer, Era. All P&G, all detergents, deliberately competing for different psychographics. Relationship is *deliberately obscured*; each brand pretends siblings do not exist.
- **Cloudflare Mode** — Workers, Pages, R2, KV, Durable Objects, Stream. All Cloudflare, all on the same edge. Each product has its own identity, docs, and developer brand. Relationship is *visible to anyone who looks*; siblings are not advertised on the marketing surface but are not hidden from anyone investigating.

AMS picks Cloudflare Mode. Each brand's marketing surface stands on its own — no "from the makers of," no cross-brand banners, no "also try our other brands." But the GitHub orgs, the founder's name, the AMS protocol attribution all make the relationship traceable to anyone who looks. The brands do not pretend to be unrelated; they simply do not sell the relationship. This is the credibility floor for developer audiences, where astroturfing is sniffed out instantly and would damage every surface in the portfolio simultaneously.

## The Discipline That Prevents Drift

The risk of the portfolio approach is that two or more brands collapse into the same voice and the portfolio becomes one brand wearing several wigs — strictly worse than one brand. Three disciplines prevent this:

**Tagline mutual exclusivity.** Each brand's tagline must be one another brand could not credibly use. If two brands' taglines are interchangeable, one of them is wrong. The taglines are written before the rest of the surface; the rest of the surface honors the tagline.

**Aesthetic enforcement.** Each brand has a distinct visual system — typography, color, imagery, layout — owned at the brand level, audited per surface. Two brands sharing a visual language is a lapse, not a feature. The aesthetics are the fastest way visitors disambiguate which brand they are looking at; they do not converge.

**Code-example differentiation.** Each brand's code example demonstrates a different *style* of using the same wire. A substrate-purity brand might show the protocol bare. An integration brand might show the scenario where two pre-existing systems become interoperable. An orchestration brand might show event-driven coordination across multiple participants. The specific cuts are downstream of build evidence; what is locked is that the examples are mutually distinct in shape, not just in cosmetics. If two brands' examples could be swapped without semantic loss, one of them is failing the discipline.

A brand that cannot produce a tagline mutually exclusive with its siblings, an aesthetic distinct from its siblings, and a code example demonstrating a different use shape from its siblings, has not done the work. It does not enter the portfolio until it does, or it retires.

## One Brand Carries the Thesis

The portfolio is three independent surfaces, but the underlying thesis — that connector libraries are an artifact of trapped ecosystems and that an open substrate collapses integration topology from O(N²) to O(N), per `ams://canon/principles/participation-replaces-integration` — is too large to hide. Theses delivered by no one are theses no one hears.

Exactly one brand carries the thesis as a headline claim. Which brand is downstream of voice work and is decided when brand-naming happens, not at this decision. The other two brands demonstrate the thesis without arguing it — their existence on the same wire is the proof; their copy does not need to make the case.

What is locked at this decision: exactly one brand carries the thesis, and the others demonstrate without arguing. A portfolio in which all three shout the thesis is a portfolio in which none have a distinct voice. A portfolio in which none carry it is a portfolio with no backbone.

## What This Forecloses

- **Lead-brand strategy.** No brand is the canonical surface for AMS. AMS itself is the canonical surface; the brands are siblings.
- **Single-domain consolidation.** The portfolio cannot collapse to one site that A/B-tests the three positioning angles. That would be umbrella mode, not portfolio mode, and the experiment would be inside one identity rather than across three.
- **Cross-brand traffic routing.** No brand drives traffic to a sibling. A visitor lands on a brand surface, stays, or leaves. The portfolio's value is in differential resonance, not in funnel chaining.
- **Brand-as-product-gate.** A brand does not own a feature of the protocol. Every brand has access to the full substrate; brands differ in voice, not in what users on them can do.
- **Brand-then-build sequencing.** The portfolio composition is named after the products are clear, not before. Locking brand identities up front and forcing the products to match them is the failure mode this decision rules out.

## What This Is Not

- **Not a pre-committed brand list.** No specific brands are locked at this decision. The discipline applies to whatever brands eventually emerge from build evidence; the names are a successor decision.
- **Not a permanent set of three.** Three is the initial portfolio target. The portfolio composition evolves; the discipline does not.
- **Not a refusal to attribute.** Every brand surface acknowledges the AMS substrate; the relationship is traceable. The discipline is about positioning each brand as standing on its own merits, not about hiding the substrate.
- **Not P&G astroturf.** The brands are not pretending to be unrelated companies. They are independent surfaces with shared origin, and anyone who investigates will find that. The discipline is "do not advertise the relationship," not "lie about it."
- **Not an investment thesis.** The brand portfolio is a marketing strategy on top of the protocol. The protocol's economics (per `D0020`) are independent of how many marketing surfaces sit on top of it.
- **Not a statement about TinCan.** TinCan is the codename of the current proof-of-concept build — the first-pass iterative learning vehicle whose only goal is structural ("the MCP server connects to the wire and two ends can talk"). TinCan is not a brand and is not part of the eventual portfolio. The build-codename and the brand layer are deliberately separate.

## Reversibility and Retraction Triggers

The portfolio is *reversible at the brand level* and *not reversible at the multi-brand commitment level* once any brand surface has acquired a real audience.

Retiring a single brand (one of the three fails to find traction and shuts down) is cheap: the protocol is unchanged, the other brands are unchanged, the audience that liked the retired brand can be pointed to a sibling or to the protocol document directly.

Reversing to a single-brand strategy after multiple brands have audiences would be a brand consolidation event with all the costs that implies: re-platforming users, re-establishing trust under one banner, deprecating brand identities visitors had attached to. This is not catastrophic, but it is expensive, and the decision to do it should be its own canon entry rather than a quiet collapse.

The first brand to launch is the cheapest to walk back from. The expense compounds with each additional brand that gains an audience.

**Concrete retraction triggers.** A strategic decision that cannot be falsified is a preference, not a decision. Specific futures that retract this strategy or one of its components:

- **Brand-level retraction (single brand).** After six months of operation, a brand that has not acquired distinct audience signal — measured by referrer mix, self-reported source on inbound, or any honest qualitative read of who shows up — is failing the differentiation discipline. That brand retires; the others continue.
- **Strategy-level retraction (multi-brand to single).** If after three brands have launched and operated for twelve months, audience signal across them is statistically indistinguishable (similar inbound demographics where measurable, similar conversion rates, indistinguishable response to the same launches), the portfolio's premise — that different psychographics resonate to different framings — is empirically not holding for AMS. The disposition is consolidation: pick the brand with the strongest single-axis signal, retire the others, write the canon decision documenting why.
- **Substrate-attribution failure.** If visitors arrive on a brand surface and do not follow through to AMS — measured by clickthrough on the protocol attribution, by referrer flow, or by inbound questions that show no awareness of the substrate — the substrate-attribution discipline has failed and the portfolio is delivering brand value without delivering protocol value. This calls for a brand-surface revision (clearer attribution; more prominent substrate links) before strategic retraction.
- **Cross-brand confusion at audience level.** If two or more brands are routinely conflated by audiences ("are these the same product?" appears repeatedly in inbound, on social, in reviews, in support requests), the brands have not differentiated and one or both retire.

The strategy is committed-but-falsifiable. These triggers exist so that retraction is recognizable when warranted, rather than postponed by hope or sunk-cost.

## See Also

- `ams://canon/decisions/D0020-agents-as-customer-and-third-party-vas-substrate` — the substrate-not-application positioning at the product level that this decision extends to the brand level
- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` — the architecture that makes independent implementations possible
- `ams://canon/principles/participation-replaces-integration` — the thesis the portfolio communicates; one brand carries it as headline
- `ams://canon/principles/envelope-altitude-consensus` — the wire-altitude argument that licenses many surfaces atop one substrate
- `ams://canon/constraints/permanent-non-goals` — the discipline that keeps the protocol opinion-free, so each brand can carry its own opinions
- `ams://canon/principles/vodka-architecture-applied` — the architectural discipline this generalizes to the brand layer
