---
uri: ams://canon/decisions/D0008-horizon-as-constraint-set
title: "D0008 — HORIZON.md Is a Constraint Set, Not a Backlog"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: stable
tags: ["ams", "canon", "decision", "governance", "horizon", "forward-compatibility", "scoping"]
epoch: E0008.3
date: 2026-05-01
derives_from: "HORIZON.md (opening framing), SPEC.md §14 (forward-compatibility check), journal/2026-05-01-ams-horizon-as-constraint-set.tsv"
governs: "How the use-case catalog relates to spec revisions. The forward-compatibility test every v1 decision must pass."
status: active
---

# D0008 — HORIZON.md Is a Constraint Set, Not a Backlog

> The catalog is two-sided. The dream half names what becomes possible; the constraint half names what must remain possible. Anything v1 ships must not foreclose any catalog entry.

## Description

`HORIZON.md` enumerates the use cases AMS unlocks. The list is comprehensive and most entries will never be built by us. The natural reading is "this is a backlog." That reading is wrong. The list functions as a **constraint set on v1**: every proposed v1 decision is evaluated against every catalog entry, and any decision that forecloses an entry is either revisited or paired with a deliberate, named retirement of the entry it forecloses.

This decision exists to encode the reframe explicitly so future spec revisions cannot quietly slip into "the catalog is aspirational, ignore it for now" reasoning. The catalog has work to do at every revision.

## Outline

- Why a Comprehensive Catalog Helps Scoping
- The Forward-Compatibility Check
- The Two Outcomes
- What This Forecloses
- What This Is Not

---

## Why a Comprehensive Catalog Helps Scoping

The intuition is that listing every dream produces overwhelm and paralysis. The opposite happens. Listing every dream produces decisive scoping, because the scope question changes from "what should we ship?" to "what is the smallest first slice that does not foreclose any of these?"

The smallest first slice is `SPEC.md`'s scope. The catalog is what protects that slice from accidentally over-committing. Without the catalog, every v1 decision is checked against the immediate use case alone, and quiet foreclosures accumulate.

## The Forward-Compatibility Check

For every proposed change to `SPEC.md` and every implementation choice it permits, the check is:

> Does this decision make any HORIZON entry impossible in a future version?

If the answer is yes for any entry, the decision is either:

- **Revised** so it no longer forecloses, or
- **Paired with a deliberate retirement** of the foreclosed catalog entry, with a named reason recorded in the catalog.

The check is part of revision discipline (`SPEC.md` §14) and is non-skippable.

## The Two Outcomes

When the check fires:

- **Decision survives, catalog survives.** The proposal is shaped so it ships v1 capability without closing the door to the catalog entry. This is the default outcome for most decisions; the catalog is rarely a true blocker, but it forces explicitness about which doors stay open.
- **Decision survives, catalog entry retires.** The team decides the catalog entry is genuinely worth foreclosing — perhaps because its assumptions no longer hold, or because the value is not worth the constraint cost. The retirement is recorded in the catalog with the foreclosing decision named, so future reviewers can see the trade.

There is no "decision survives, catalog ignored" path. That is the path the constraint-set framing exists to prevent.

## What This Forecloses

- Spec revisions cannot quietly skip the HORIZON check. Every dated revision in `SPEC.md` §14 implicitly attests the check was performed.
- The catalog cannot be silently pruned. Removing an entry requires naming the decision that retired it.
- The catalog cannot be relegated to "post-PoC roadmap" reading. It governs every revision now, not just future planning sessions.

## What This Is Not

- Not a commitment to build any specific catalog entry. The catalog is what becomes possible; building is a separate set of decisions made when forcing functions arrive.
- Not a claim that the catalog is exhaustive. New entries land as they are recognized. The check applies to entries present at the time of the revision; future additions only constrain future revisions.
- Not a substitute for the disconfirmers in `SPEC.md` §10. The HORIZON check defends against foreclosure; disconfirmers defend against the plan being wrong on its own terms. Both checks are needed; they answer different questions.

## See Also

- `HORIZON.md` opening — the two-sided framing in the catalog itself
- `SPEC.md` §14 — revision discipline including the forward-compatibility check
- `ams://canon/decisions/D0007-spec-as-locking-surface` — the surface the check protects
- `journal/2026-05-01-ams-horizon-as-constraint-set.tsv` — the encoding of the reframe
