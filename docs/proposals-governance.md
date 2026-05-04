---
uri: ams://docs/proposals-governance
title: "Proposals Governance — How Ideas Become Canon"
audience: docs
exposure: nav
tier: 2
voice: neutral
stability: evolving
tags: ["ams", "docs", "governance", "proposals", "canon", "lifecycle", "change-procedure"]
epoch: E0008.4
date: 2026-05-04
derives_from: "ams://canon/decisions/D0007-spec-as-locking-surface (the locking-surface discipline this complements at the decision-record layer); ams://canon/decisions/D0008-horizon-as-constraint-set (HORIZON catalogs constraints; proposals catalog candidate decisions); ams://docs/homepage-governance (the precedent for governance docs in docs/); knowledge-base.md (overlay placement and oddkit URI conventions)"
governs: "How ideas that may eventually become irreversible architectural decisions are captured, reviewed, and either promoted to active canon or rejected. Where proposals live, what they must contain, the difference between status: proposed and status: active, the promotion procedure, and the numbering scheme that keeps proposals separable from decisions until the gate has been crossed."
status: active
---

# Proposals Governance — How Ideas Become Canon

> Active canon is for decisions that have been made. A `D00xx` document under `canon/decisions/` is a load-bearing commitment — `irreversible` at the architectural level in many cases. Ideas that are still being weighed do not belong in that directory, even with a `status: proposed` field, because every reader of `canon/decisions/` is entitled to assume the contents are settled. Proposals get their own directory, their own numbering scheme (`P00xx`), and an explicit promotion procedure. When a proposal graduates, it is renumbered into the `D00xx` series and moves directories. When it doesn't, the proposal stays as a durable record of why it was set aside.

## Description

The AMS canon distinguishes between **decisions** (settled, in `canon/decisions/`, `status: active`, often `irreversible`) and **proposals** (under review, in `canon/proposals/`, `status: proposed`). The two directories carry different reading contracts:

- A reader of `canon/decisions/` may treat every document as load-bearing. The system depends on it. Reversing it is expensive.
- A reader of `canon/proposals/` is reading the working set of ideas. Each is a structured argument, not a commitment. The system does not depend on it. Some will become decisions; some will be rejected; some will be merged into other proposals.

This separation matters because canon is read by future Claude sessions, third parties evaluating the substrate, and the operator at moments when context is thin. Mixing settled and unsettled material in one directory destroys the signal.

## Outline

- Where Proposals Live
- Numbering
- Required Frontmatter
- Required Content Sections
- Lifecycle
- Promotion Procedure
- Rejection and Withdrawal
- Branch and PR Conventions
- What This Is Not

---

## Where Proposals Live

All proposals live under `canon/proposals/` with filename `PNNNN-{kebab-case-slug}.md`. The URI scheme is `ams://canon/proposals/PNNNN-{slug}`. Index entries (in catalogs, search results, and any future canon ToC) flag them with their `status` field — readers should never have to guess whether a document is settled.

A proposal may reference and derive_from any document under `canon/decisions/`, `canon/principles/`, `canon/constraints/`, or any baseline document under the `klappy://` overlay. A proposal MAY reference other proposals; when it does, it must acknowledge that the parent is also unsettled. A `canon/decisions/` document MUST NOT derive_from a proposal — that direction would mean an unsettled idea is load-bearing for a settled commitment, which inverts the contract.

## Numbering

Proposals are numbered `P0001`, `P0002`, ... in the order they are first opened, independent of the `D00xx` series. A proposal keeps its `P` number for its entire life as a proposal. If it is promoted to a decision, it receives a new `D` number assigned at promotion time (the next available in the decisions series), and the proposal file is removed from `canon/proposals/` in the same PR that lands the decision file under `canon/decisions/`. The promoted decision's `derives_from` field credits the originating proposal by its old `P` number for traceability.

Numbering does not skip. Withdrawn or rejected proposals keep their `P` number; the file remains in place with `status: rejected` or `status: withdrawn` and a brief rationale section explaining why.

## Required Frontmatter

Every proposal file MUST carry frontmatter with at minimum:

- `uri` — the canonical `ams://canon/proposals/PNNNN-{slug}` URI
- `title` — including the `PNNNN —` prefix and an explicit `(PROPOSED)` suffix in the visible title until promotion
- `audience` — `canon`
- `exposure` — `nav`
- `tier` — the tier the proposal would inherit if promoted (1, 2, or 3)
- `voice` — `neutral`
- `stability` — `evolving` (proposals are by definition not stable)
- `tags` — must include `ams`, `canon`, `proposal`, plus any decision-relevant tags
- `epoch` — the epoch in which the proposal was opened
- `date` — the date the proposal was opened (updated only on substantive content changes, not on every edit)
- `derives_from` — full citations of every parent canon document, in the same prose-with-rationale format used throughout `canon/decisions/`
- `governs` — what the proposal *would* govern if promoted (i.e., scope of the eventual decision); written in the conditional voice
- `status` — exactly one of: `proposed`, `accepted` (transient state during promotion PR), `rejected`, or `withdrawn`

A proposal MUST NOT carry `status: active`. That value is reserved for `canon/decisions/` and `canon/principles/`.

## Required Content Sections

Modeled on the shape used in `canon/decisions/`, with adjustments for the unsettled state:

1. **Description** — the proposal in its own words, framed as a question the project is being asked to answer.
2. **Outline** — section list, same convention as decisions.
3. **The Substantive Sections** — whatever the proposal needs to make its case (typically: the architectural shape proposed, the primitive choices, the rejected alternatives, the relationship to existing canon).
4. **What This Proposes** — explicit, bulleted list of the commitments the proposal would make if promoted. Readers must be able to scan this section and know exactly what would change in canon.
5. **What This Does Not Propose** — explicit list of what stays out of scope. Prevents scope creep during review and makes the bounded shape clear.
6. **The Open Question(s)** — the specific questions the operator (or whoever holds the gate) must answer to promote, reject, or split the proposal. Every proposal SHOULD name at least one open question; a proposal with no open questions is almost certainly ready to be a decision and should be promoted rather than reviewed.
7. **What Promotion Would Require** — a checklist of artifacts, evidence, or downstream changes that promotion would entail. This makes the promotion cost legible at proposal time.
8. **See Also** — same convention as decisions.

## Lifecycle

A proposal moves through these states:

- **Drafted** — the file is being authored on a branch. Not yet on `main`.
- **Proposed** — the proposal has landed on `main` with `status: proposed`. It is live for review. Other work may reference it but not depend on it.
- **Accepted (transient)** — the promotion PR is open. The proposal file still exists at `canon/proposals/PNNNN-{slug}.md` with `status: accepted`; the new decision file exists at `canon/decisions/DNNNN-{slug}.md` with `status: active`. This state lasts only as long as the promotion PR.
- **Promoted** — the promotion PR has merged. The proposal file has been removed; the decision file is live. The decision's `derives_from` retains the `P` number for traceability.
- **Rejected** — the proposal was reviewed and the answer is "no." The file stays at `canon/proposals/PNNNN-{slug}.md` with `status: rejected` and a `## Rejection Rationale` section appended at the bottom. The number is not reused.
- **Withdrawn** — the proposer withdrew before review concluded. Same file disposition as rejected, with `status: withdrawn` and a `## Withdrawal Rationale` section.

A rejected or withdrawn proposal MAY be replaced by a new proposal at a later date with a new `P` number. The new proposal SHOULD reference the predecessor in its `derives_from`.

## Promotion Procedure

The mechanics of moving from `status: proposed` to active canon:

1. The operator (or the gate-holder for the canon track in question) signals "promote." This is the gate event that locks scope.
2. A promotion PR is opened with these changes in a single atomic commit:
   - The proposal file at `canon/proposals/PNNNN-{slug}.md` has its `status` changed to `accepted` for the duration of the PR.
   - A new decision file is created at `canon/decisions/DNNNN-{slug}.md` (next available `D` number) with `status: active`. The decision's content MAY be the proposal's content adapted, or a fresh draft — the proposal is the case for the decision, not necessarily the decision itself.
   - The decision's `derives_from` includes the originating proposal: `ams://canon/proposals/PNNNN-{slug} (the originating proposal capturing the case for this decision)`.
3. Cross-references are updated: any `canon/decisions/` documents whose `complements` or `governs` fields would now mention this decision are updated in the same PR. Any unrelated proposals that referenced the proposal are updated to reference the decision.
4. On merge, the proposal file at `canon/proposals/PNNNN-{slug}.md` is deleted. The decision is now the canonical record.

The promotion PR title convention: `canon: promote PNNNN → DNNNN-{slug}`. The promotion PR description must include a one-paragraph statement of why the gate was crossed (the answer to whatever open question the proposal raised).

## Rejection and Withdrawal

Rejection is a real outcome. Proposals that don't survive review are not failures; they are signal. A rejected proposal that articulates clearly *why* it was rejected is a durable record that prevents the same idea from circling back through canon repeatedly without new evidence.

The rejection rationale section MUST name:

- Which canon constraint, principle, or decision the proposal violated, OR
- Which architectural property the proposal would have foreclosed, OR
- Which open question(s) the proposal could not answer at the time of review, AND
- Whether the rejection is permanent or whether a future proposal with new evidence could revisit the question.

Withdrawal is a softer outcome — the proposer chose to stop the review without forcing a decision. Withdrawal rationale is briefer; it typically says "the question was wrong" or "this was subsumed by P00xx" or "the work shifted scope and this no longer fits."

## Branch and PR Conventions

- **New proposal**: branch named `claude/proposal-PNNNN-{topic}-{4char}` (or `proposal/PNNNN-{topic}` if a human is opening it). PR title convention: `canon: open PNNNN — {short title}`.
- **Edit to a proposal under review**: branch named `proposal/PNNNN-{topic}-edit-{4char}`. PR title convention: `canon: edit PNNNN — {short summary of edit}`.
- **Promotion**: as described in §"Promotion Procedure" above.
- **Rejection or withdrawal**: branch named `proposal/PNNNN-{topic}-reject-{4char}` or `-withdraw-{4char}`. PR title convention: `canon: reject PNNNN — {one-line reason}` or `canon: withdraw PNNNN — {one-line reason}`.

PRs that mix proposal work with unrelated decision or code changes are out of scope per the project's PR-independence convention.

## What This Is Not

- **Not an RFC process.** AMS proposals are local to this repository and gated by the operator. They do not require external community review, voting, or comment periods. The operator is the gate.
- **Not a substitute for ad-hoc canon edits.** Small clarifications, typo fixes, link updates, and `derives_from` corrections to existing canon do not need to go through the proposals track. They are direct PRs against the relevant decision file.
- **Not a backlog.** A proposal is an active argument under review. Ideas that are not yet ready to be argued belong in `HORIZON.md` (per `D0008`, the constraint catalog) or in journal observations, not in `canon/proposals/`. The bar for opening a proposal is "I am ready to defend this in writing today and I want a decision soon."
- **Not a guarantee of promotion.** Opening a proposal does not commit anyone to promoting it. The default disposition is "stays proposed until the gate is crossed or the proposer withdraws." Most proposals should resolve within weeks, not months.

## See Also

- `ams://canon/decisions/D0007-spec-as-locking-surface` — the locking-surface discipline this complements at the decision-record layer
- `ams://canon/decisions/D0008-horizon-as-constraint-set` — HORIZON as the catalog of constraints; proposals as the catalog of candidate decisions
- `ams://docs/homepage-governance` — the precedent for governance docs living under `docs/`
- `knowledge-base.md` — overlay placement and oddkit URI conventions
- `canon/proposals/P0001-stream-encryption-as-pre-syndication-wrapper.md` — the first proposal opened under this governance
