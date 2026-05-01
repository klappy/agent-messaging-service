---
uri: ams://canon/decisions/D0007-spec-as-locking-surface
title: "D0007 — SPEC.md Is the Locking Surface; Deeper Docs Are the Reference Layer"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: stable
tags: ["ams", "canon", "decision", "governance", "spec", "revision-discipline"]
epoch: E0008.3
date: 2026-05-01
derives_from: "SPEC.md (opening framing, §14 revision discipline), journal/2026-05-01-ams-gauntlet-and-spec-lock.tsv"
governs: "Where load-bearing decisions are committed. How disagreements between docs are resolved. The order in which docs get updated."
status: active
---

# D0007 — SPEC.md Is the Locking Surface; Deeper Docs Are the Reference Layer

> One doc holds the contract. The rest are reference. When they disagree, the contract wins until the next dated revision.

## Description

`SPEC.md` is the single locking surface for what AMS commits to ship and how shipping is verified. The deeper docs (`PROTOCOL.md`, `ARCHITECTURE.md`, `POC-INFRA.md`, `POC-PLAN.md`, `AMS.md`, `PATTERNS.md`, `HORIZON.md`) are the reference layer underneath. When `SPEC.md` and a deeper doc disagree, `SPEC.md` wins until the next revision; the deeper doc is then updated to match.

This decision exists because earlier in the project's life, load-bearing decisions were spread across six docs without a single locking surface. The oddkit gauntlet pass surfaced the missing-contract problem; the consolidation followed.

## Outline

- The Locking Rule
- The Revision Order
- What Goes in SPEC, What Goes in the Reference Layer
- The Forward-Compatibility Check
- What This Is Not

---

## The Locking Rule

When two documents disagree on a load-bearing matter — scope, acceptance criteria, what is in the PoC, what is deferred, what counts as done — `SPEC.md` is the truth and the other doc is wrong. Wrong is fixed by updating the other doc, not by re-debating the lock.

This rule cuts work in two ways: it stops the implementation from drifting toward whichever deeper doc was read most recently, and it stops the deeper docs from becoming load-bearing under the table.

## The Revision Order

When a load-bearing decision changes, the order is:

1. **Update `SPEC.md` first.** The lock moves before anything else.
2. **Update the affected deeper docs.** Bring them into alignment with the new lock.
3. **Add a dated entry to `SPEC.md` §14.** The change log is part of the discipline; undated revisions are not allowed.

This order is non-optional. If implementation reveals a problem with the protocol, `PROTOCOL.md` does not get updated first — `SPEC.md` does, then `PROTOCOL.md`. Otherwise the lock is no longer the lock.

## What Goes in SPEC, What Goes in the Reference Layer

**SPEC.md owns:**

- Scope IN and Scope OUT (with named re-entry signals for the OUTs).
- Acceptance criteria — the falsifiable conditions for "shipped."
- Alternatives considered and why rejected.
- Risks with severity and mitigations.
- Reversibility map — one-way vs two-way doors.
- Disconfirmers — what would invalidate the plan, not just delay it.
- Open decisions still inside scope (decisions awaiting forcing function).
- The forward-compatibility check against `HORIZON.md`.
- The dated change log.

**The reference layer owns:**

- Long-form thesis, primitives, vocabulary (`AMS.md`, `GLOSSARY.md`, `ESSAY.md`).
- Wire-level specification (`PROTOCOL.md`).
- Reference implementation architecture (`ARCHITECTURE.md`, `POC-INFRA.md`).
- Day-by-day execution detail (`POC-PLAN.md`).
- Patterns built on AMS (`PATTERNS.md`).
- The use-case catalog and constraint set (`HORIZON.md`).

The split is not by file size or topic depth. It is by load-bearingness. If a sentence settles a commitment about what AMS will ship, it belongs in `SPEC.md`.

## The Forward-Compatibility Check

`SPEC.md` §14 commits the project to a forward-compatibility check against `HORIZON.md` on every revision: every proposed change to the spec is evaluated against every catalog entry in `HORIZON.md`. If the change would foreclose any catalog entry, the change is wrong (or the catalog entry is deliberately retired with a named reason).

This check is what keeps v1 from painting future versions into a corner. It is encoded separately at `ams://canon/decisions/D0008-horizon-as-constraint-set` because the check is itself a decision about how the project relates to its own dream catalog.

## What This Is Not

- Not a claim that `SPEC.md` is the only doc anyone needs to read. The reference layer carries the long-form reasoning that makes the lock comprehensible. Reading the lock without the reference layer produces a thin understanding.
- Not a block on the deeper docs evolving on their own when the lock has not changed. Editorial improvements, examples, clarifications — these land in the deeper docs without going through `SPEC.md`.
- Not a guarantee that the lock is right. The disconfirmers in `SPEC.md` §10 acknowledge that the plan can be wrong and would force re-thinking, not just re-trying.

## See Also

- `SPEC.md` opening framing — declares itself the contract
- `SPEC.md` §14 — revision discipline and the dated change log
- `ams://canon/decisions/D0008-horizon-as-constraint-set` — the catalog as forward-compatibility constraint
- `klappy://canon/principles/contract-governs-handoff-drift` — upstream principle on contracts overriding session-level shortcuts
