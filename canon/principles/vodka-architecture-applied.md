---
uri: ams://canon/principles/vodka-architecture-applied
title: "Vodka Architecture, Applied to AMS"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "principle", "vodka-architecture", "discipline"]
epoch: E0008.3
date: 2026-05-01
derives_from: "AMS.md §2, AMS.md §11, PATTERNS.md, GLOSSARY.md (Vodka architecture)"
complements: "klappy://canon/principles/vodka-architecture (upstream)"
governs: "How vodka discipline shows up in AMS specifically. The lenses to use when reviewing a proposed change."
status: active
---

# Vodka Architecture, Applied to AMS

> Generic, unopinionated, swappable. The opposite of "flavored." This principle is upstream canon; this article documents how it manifests in AMS specifically and what discipline it produces in everyday review.

## Description

Vodka architecture is upstream canon. The general principle — that foundational layers should be domain-agnostic and that opinions belong above them — is documented at the program level and applies to many things. AMS is a vodka system at every layer it owns: wire, conformance rules, edge wrappers, conversation primitives, metadata slot.

This article does not restate the upstream principle; it documents how vodka shows up in AMS, how to recognize when AMS is drifting away from it, and what review questions to use on a proposed change. The principle is the fence; this article is the gate operator who knows what to look at when something approaches.

## Outline

- The Three Layers Vodka Holds At
- The Drift Signals
- The Review Questions
- What This Is Not

---

## The Three Layers Vodka Holds At

**The wire is vodka.** Tokens are opaque. Metadata is opaque. AMS does not parse, validate, schema, or interpret payload contents. The token is whatever the application says it is. This is the most load-bearing place for vodka discipline; if it breaks here, every subscriber is forced to adopt AMS's opinion.

**The wrapper layer is vodka.** Edge wrappers translate I/O patterns. They do not own domain logic, content policy, or business rules. The wrapper-stays-cheap constraint (`ams://canon/constraints/wrapper-stays-cheap`) is the operational test. A wrapper that grows beyond translation has stopped being vodka.

**The conformance rules are vodka.** What an implementation must do is the minimum needed to interop on the wire. What it may do is everything else. The MAYs in `ams://canon/constraints/wire-conformance` are deliberately permissive so that implementations can differ without losing conformance.

## The Drift Signals

Vodka discipline drifts in recognizable patterns. The signals to watch for during review:

- **"While we're here, AMS could just…"** — A proposal that adds a capability to AMS because it would be convenient to have at the wire layer rather than in the application. The convenience is real; the convenience is also why the upstream principle exists.
- **"Most subscribers will want…"** — A proposal that universalizes an application convention into a wire requirement. If most subscribers want it, they can build it once above the wire and share it as a library; AMS does not need to bake it in.
- **"It's a small addition…"** — A proposal that argues from the size of the change rather than the location of it. Small additions at the wire layer are not small if they commit AMS to an opinion forever.
- **A capability appearing in two wrappers in similar but slightly different forms.** The temptation is to "lift it into the wire so both wrappers can share it." The right response is the opposite: factor it out as a subscriber both wrappers can talk to.

## The Review Questions

When reviewing a proposed change to AMS, the questions are:

1. **What layer does this opinion live at?** If the answer is "the wire," check whether it could live above the wire instead.
2. **Could a subscriber implement this without protocol support?** If yes, the subscriber should.
3. **Does this commit AMS to an opinion on any of the permanent non-goals** (`ams://canon/constraints/permanent-non-goals`)? If yes, the proposal is asking AMS to become a vertical.
4. **Does this make any HORIZON entry harder to ship later?** Run the forward-compatibility check (`ams://canon/decisions/D0008-horizon-as-constraint-set`).

Four questions, in this order. A proposal that survives all four is vodka-compatible. A proposal that fails any one is reshaped or rejected.

## What This Is Not

- Not a claim that all software should be vodka. Most software should not be. Vodka discipline is appropriate for foundations that other layers will commit to forever; it is the wrong discipline for products that need to make sharp opinionated calls to be useful.
- Not a block on AMS having strong design choices. AMS has many strong choices — tokens-not-messages, magic-link-as-URL, per-account stream ownership, two-door registration. These are choices about the wire's *shape*, not opinions about the application's behavior.
- Not a substitute for the upstream principle. The principle in `klappy://canon/principles/vodka-architecture` is the source; this article is the AMS-specific application of it.

## See Also

- `klappy://canon/principles/vodka-architecture` — upstream principle (authoritative)
- `AMS.md` §2 — the long-form thesis
- `AMS.md` §11 — positioning that the principle implies
- `ams://canon/constraints/wrapper-stays-cheap` — the operational test for wrappers
- `ams://canon/constraints/permanent-non-goals` — the layers vodka discipline keeps AMS out of
