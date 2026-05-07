---
uri: ams://canon/constraints/canon-implementation-path-integrity
title: "Canon Implementation Path Integrity — Documents That Reference Code Must Match Reality"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "constraint", "hygiene", "drift", "ci", "prompt-over-code"]
epoch: E0008.5
date: 2026-05-07
derives_from: "ams://canon/decisions/D0024-migrate-hosted-mcp-wrapper-to-mcpagent-sdk (impl-ahead-of-canon precedent that motivated this constraint); ams://canon/decisions/D0026-two-worker-topology-ams-substrate-tincan-ui-layer (impl-ahead-of-canon precedent: packages/tincan landed before D0025's worker/src reference was updated); ams://canon/constraints/wrapper-stays-cheap (the discipline this constraint complements)"
governs: "Canon documents, handoffs, proposals, and writings that reference implementation paths. The PR-time validation that paths exist or do not exist as claimed. The drift findings that block merge. The author posture toward path references."
status: active
---

# Canon Implementation Path Integrity — Documents That Reference Code Must Match Reality

> Documents that reference implementation paths are making claims about the repo. Claims that don't match reality are bugs. This constraint specifies the validation discipline that catches them at PR time and the author posture that prevents them from landing in the first place.

## Description

Canon documents — decisions, constraints, handoffs, proposals — frequently reference implementation paths: file locations, package names, function names, configuration files. When code structure changes, those references can drift from reality. Drift creates two failure modes:

- **Agents acting on stale paths produce broken work.** A handoff that says "create `worker/src/portal.ts`" when the topology has shipped as `packages/tincan/src/` sends the implementation agent to the wrong place. The cost compounds because handoffs cite canon, canon cites canon, and one stale reference propagates.
- **Human readers lose trust in canon as a source of truth.** Once canon is wrong about something verifiable, every other claim becomes suspect. Trust is expensive to rebuild.

This constraint specifies the discipline that catches drift at PR time and names what authors should do to prevent it.

## The Three Drift Modes

Canon and implementation can drift in three directions:

1. **Canon → impl drift** — canon describes future state, code follows. Healthy. Aspirational paths in tier-1 decisions are normal and expected. D0027's references to `withRideAlong` before the helper exists are correct usage.
2. **Impl → canon drift** — code shipped, canon stale. A bug. Canon describes a world that has been refactored. D0025's reference to `worker/src/portal.ts` after `packages/tincan/` landed is the motivating example.
3. **Handoffs/proposals → reality drift** — docs trust canon without grounding. Inherits drift mode #2. The handoff doc that cited D0025's path is the cascading example.

Mode #1 is intentional. Modes #2 and #3 are this constraint's target.

## The Validation Rules

When a PR touches `canon/`, `writings/`, `docs/handoffs/`, or `proposals/`, every path reference in the changed files MUST satisfy one of:

- The path's claim type matches reality:
  - Marked `**NEW**` or "new file" / "create at" → path MUST NOT exist in the target branch
  - Marked `**EDIT**`, `**REPLACE**`, `**DELETE**`, or referenced as current state → path MUST exist
- The path is inside an explicitly-annotated aspirational block (a fenced code block with the language tag `aspirational` or `future`, or a section explicitly titled `Future Work` / `Aspirational`).

A path reference that satisfies neither is a **drift finding** that fails the PR check.

## Enforcement

A CI check runs on every PR matching the path filters above. The implementation lives at `.github/workflows/canon-drift-check.yml` and `scripts/check-canon-drift.py`. Drift findings produce a non-zero exit code and block merge.

The check is intentionally aggressive:
- **False positives** (paths flagged that the author intended as aspirational) are a small cost — the author adds an `aspirational` annotation or wraps the section appropriately.
- **False negatives** (drift that slips through) are an expensive cost — drift propagates from canon into handoffs into agent work, and the cascade is hard to unwind.

The check fails fast. Authors fix and re-push.

## The Author Posture

Authors of canon, handoffs, proposals, and writings SHOULD:

- **Ground every path reference against current main before writing.** If the doc says "new file at X," verify X does not exist on main right now. If the doc says "edit Y," verify Y exists on main right now. The grep takes ten seconds; saves hours of cascading damage.
- **Annotate aspirational paths explicitly.** When a tier-1 decision describes a future-state file structure, wrap the relevant block in an aspirational fence or section heading so the validator knows to skip it.
- **Treat drift findings as canon-quality issues, not CI noise.** A drift flag is the system telling you canon and reality have diverged. Either fix the canon (it's wrong) or fix the code (it's behind). Don't bypass.

Authors MUST NOT:

- Override drift findings to merge. The CI check is non-negotiable — if it fails, the PR doesn't merge.
- Mark stale paths as aspirational to bypass validation. Aspirational is for genuine future-state, not retroactive cover for impl-behind-canon claims.
- Trust canon's path references without verifying against current main. Canon hygiene is an active discipline, not a passive trust.

## What This Is Not

- **Not a substitute for canon-first discipline.** Canon should be written against reality from the start; this constraint catches the slips, not the deliberate choice to write canon last.
- **Not a quality bar.** A document can pass path-integrity and still be wrong about everything else. This constraint covers a narrow, mechanically-checkable slice of correctness.
- **Not a permanent commitment to a specific tooling path.** The current implementation uses a Python script and a GitHub Action. The discipline persists across tool swaps; the implementation is replaceable. When `oddkit_audit` gains canon-path-integrity coverage upstream (see `docs/upstream/oddkit-audit-canon-paths.md`), the AMS-side script becomes a thin wrapper or is removed entirely.
- **Not coverage of every drift class.** Path integrity is one slice. Semantic drift (canon describes implementation behavior that has changed without the path changing) is harder to catch mechanically and is left to the bot-prompt review layer (`docs/bot-prompts/canon-drift-review.md`).

## See Also

- `.github/workflows/canon-drift-check.yml` — the CI workflow that enforces this constraint
- `scripts/check-canon-drift.py` — the drift-detection script the workflow runs
- `docs/bot-prompts/canon-drift-review.md` — the human-review layer for semantic drift the script can't catch
- `docs/upstream/oddkit-audit-canon-paths.md` — tracking note for upstreaming path-integrity into oddkit
- `ams://canon/decisions/D0025-magic-link-url-is-the-tincan-portal` — canon that drifted (`worker/src/portal.ts` referenced post-D0026's `packages/tincan/` split)
- `ams://canon/decisions/D0026-two-worker-topology-ams-substrate-tincan-ui-layer` — the topology shift that produced the drift in D0025
- `ams://canon/constraints/wrapper-stays-cheap` — the discipline this constraint complements at the documentation layer
