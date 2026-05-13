---
uri: ams://canon/constraints/validators-cannot-self-validate-their-own-fix-prs
title: "Validators Cannot Self-Validate Their Own Fix PRs — Validation Lands on the Next PR"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "constraint", "validation", "ci-cd", "deployment-gap", "audit-gate", "operator-attention", "anti-pattern", "honesty-discipline"]
epoch: E0008.5
date: 2026-05-13
derives_from: "klappy://canon/methods/governance-validation-via-agents (the upstream pattern of validating canon and code via agents at PR time), klappy://canon/constraints/release-validation-gate (the upstream Tier-1 binding rule on release validation; this constraint is its specific instantiation for the case where the validator itself is being released), klappy://canon/principles/verification-requires-fresh-context (the broader principle that creators cannot validate themselves; this constraint is its CI-CD-deployment-specific corollary), ams://canon/constraints/outcome-verification-via-runnable-artifact (the AMS sibling constraint on what 'done' means — a runnable check passing against the actual outcome), journal/2026-05-13-canon-promotion-and-first-probe-firing.tsv (the fifth recurrence, where PR #87's three runtime probes returned HTTP 524 against the still-undeployed streaming fix that PR #87 itself contained)"
complements: "ams://canon/constraints/canon-code-sync-via-spawned-agent-session, ams://canon/constraints/oddkit-gauntlet-via-spawned-agent-session, ams://canon/constraints/output-artifact-format-validation-via-spawned-agent-session"
governs: "Any AMS PR that modifies a production-bound validator (audit gate, runtime probe, deploy-time check, scheduled drift detector). Names the structural validation gap, prescribes the minimum honesty discipline for PR descriptions, and surfaces optional better mitigations without prescribing which to adopt — the architectural fix depends on context the operator owns."
status: active
---

# Validators Cannot Self-Validate Their Own Fix PRs — Validation Lands on the Next PR

> When a validator is hosted in production code that only deploys on merge-to-main, a PR that modifies that validator cannot exercise its own fix. The PR runs against the **old** production validator; only the **next** PR opened after merge runs against the fixed one. This is a structural property of merge-bound deployment, not a bug in any specific validator. The first time it happens it is a surprise. The fifth time it happens it is canon.

## Description

AMS runs validator workflows on every PR — the legacy Managed Agents canon-code-sync gate, the three runtime probes for canon-code-sync, oddkit-gauntlet, and output-artifact-format-validation, the cloudflare-workers preview deploy. Most of these validators are not hosted *in* the PR's code; they call out to a production endpoint (`https://ams.klappy.dev/audit-gate-test`, the upstream `oddkit.klappy.dev` MCP server, Anthropic's Messages API) that runs whatever code is currently on `main`. When a PR modifies *that endpoint's code*, the PR's own validator runs are against the pre-fix code. The fix only becomes live on merge-to-main, which triggers Cloudflare Workers Git integration auto-deploy.

The result: every PR that fixes a production-bound validator ships with at least one validator run that **cannot exercise the fix it contains**. The validation gap is structural. The PR appears to be either failing its own gate (if the unfixed validator catches the existing bug it's being shipped to fix) or passing without testing the fix (if the bug only manifests under conditions the legacy validator doesn't reach). Both produce the same operator experience: the gates run, the operator merges blind, and the fix is validated — for the first time — on whatever PR opens next.

This is not a problem to be solved by trying harder on the current PR. It is a property of merge-bound deployment that the discipline around it has to accept.

## The Recurring Failure Mode

As of 2026-05-13, this pattern has surfaced in at least five distinct PRs across this project. The cleanest recent example is PR #87 (the canon promotion + journal TSV that also fixed the worker dispatcher to use streaming SSE): the three runtime probes returned `anthropic_api_failed: 524` against the same code's still-undeployed streaming fix. The legacy Managed Agents gate passed (the canon contradiction it had caught earlier was fixed in the same PR), the streaming code typechecked clean and was reviewed by a second agent before merge, but the *probes themselves could not validate the probe-substrate fix*. The operator merged with explicit acknowledgment that validation would land on the next PR.

Prior recurrences have followed the same shape: a fix to a Managed Agents prompt, a fix to an oddkit endpoint, a fix to a workflow that runs against deployed code — each one shipping with the validator gap unsurfaced or surfaced too late. The shape is consistent enough that further accumulation does not need to be enumerated row-by-row; the pattern is the constraint.

## Why It Happens

The shape is the same every time:

- **Validator V is hosted in production code at endpoint E.**
- **PR P modifies V.** The fix lives in the PR branch's code.
- **CI runs validator workflows on P.** Those workflows call E.
- **E still runs the pre-fix code** because the merge-to-main auto-deploy hasn't fired.
- **The PR's validator runs against the wrong version** of V — either silently passing or visibly erroring, but in neither case validating the fix.

The structural cause is the gap between *where the fix lives* (in the PR branch) and *where the validator runs* (against the production endpoint). Closing this gap requires either deploying the PR branch's code to a non-production URL the validator can target, or running the validator's logic locally inside the PR's CI without hitting the production endpoint. Both are mitigations, not prescriptions — the right choice depends on the validator and the cost of false negatives.

## The Honesty Discipline (Minimum, Required)

**Every PR that modifies a production-bound validator MUST name the validation gap in the PR description.** The required content:

1. **Which validator is being modified.** Name the specific gate, probe, or check.
2. **Why this PR cannot exercise the fix.** State that the validator runs against production code that only deploys on merge.
3. **What the gates on this PR will actually run against.** The pre-fix version.
4. **When the fix actually validates.** On whatever PR opens after this one merges and auto-deploys.
5. **What success looks like on the next PR.** State the expected verdict shape — full verdict comments instead of timeout errors, parity with the legacy gate, no `anthropic_api_failed`, etc.

A PR that ships a validator fix without naming this gap is dishonest about what it has tested. The dishonesty is mechanical, not moral — the gates *appear* to validate the fix because they ran and reported, but they validated the old code. Without the discipline, the operator merges believing more was tested than was, and the next failure becomes harder to diagnose because the expected-vs-actual diverges silently. The PR description is the only place where the gap is reliably visible at merge time.

This discipline is required because the pattern has recurred five-plus times. Each recurrence cost real operator attention and a frustrated cycle of "you said you fixed it, but the gates failed again." The operator's attention is the system bottleneck per `klappy://canon/constraints/mode-discipline-and-bottleneck-respect`; shipping a fix without naming its validation gap externalizes the cost of that gap onto the bottleneck.

## Optional Better Mitigations (Not Prescribed)

Three architectural mitigations exist. None is mandated by this constraint — the choice belongs to the operator and depends on the cost of false negatives for the specific validator. The list is here so readers know the design space without being forced through it.

- **Staging URL with workflow override.** The reusable workflow `audit-gate-runtime-probe.yml` already accepts `audit_gate_url` as an input with `https://ams.klappy.dev/audit-gate-test` as the default. A PR's runtime probe workflow could temporarily point at a per-branch preview deployment (one exists per push, per `cloudflare-workers-and-pages` bot evidence in PR #87) and exercise the fix in the same PR. The cost is the workflow surface (a per-PR override is not currently wired) and the test environment isolation (preview deployments share state with production for some bindings).

- **Local execution of the validator's logic.** The validator's internal logic — diff capping, persona resolution, SSE parsing, output-format scanning — can be exercised by unit tests in the PR's own CI without touching the production endpoint. This catches bugs in the *logic* of the fix but does not catch bugs in *how the logic runs inside the deployed substrate* (DO hibernation, MCP transport, Anthropic-side rate limits, network paths). Useful as a first defense, insufficient as the only one.

- **Canary deploy with rollback.** Merge to main triggers auto-deploy; the next-PR validation event lands within minutes. If the validation fails, revert the fix and the rollback also auto-deploys. The window of bad-validator exposure is bounded. This is the lowest-effort mitigation and is what AMS currently does implicitly; the discipline above just names the window honestly so the operator sees it.

The right choice is context-dependent. A validator whose false negatives are cheap (post-merge probe errors as non-gating comments) can live with the canary pattern indefinitely. A validator whose false negatives are expensive (a gating gate that mis-passes a destructive change) needs at least one of the first two. This constraint does not prescribe which.

## What This Is Not

**Not a prescription that AMS must adopt staging or local-test mitigations.** Both are valid; neither is required by this constraint. The discipline of naming the gap is required because it is cheap and the recurrence rate justifies it. The architectural mitigations are decisions the operator makes per validator.

**Not a substitute for the actual testing one can do.** The honesty discipline does not replace typecheck, code review, local logic tests, or any other in-PR validation. It supplements them by being honest about what they don't catch.

**Not specific to one validator class.** Audit gates, runtime probes, cloudflare deploy checks, scheduled drift detectors, and any future production-bound validator the operator adds inherits this constraint. The pattern is structural, not specific.

**Not a defense for sloppy PRs.** A PR that genuinely could have validated its fix locally but did not is not excused by citing this constraint. The discipline names a gap the operator cannot close; it does not excuse gaps the author chose not to close.

## Confidence and Retraction Conditions

**Confidence: high.** Five-plus recurrences across distinct PRs constitute a pattern, not a coincidence. The structural cause is well-understood. The honesty discipline is cheap and falsifiable — the operator can audit any future validator-fix PR's description and confirm whether the gap is named.

**Retraction conditions:**

- If AMS deployment architecture changes such that production-bound validators routinely run against PR-branch code without operator intervention (e.g., preview deployments become first-class for validator endpoints), the structural cause is removed and the constraint is retracted in favor of "validators run against the code that triggers them."
- If the discipline produces false friction — operators routinely naming the gap on PRs where no production-bound validator was modified, or skipping the naming on PRs where one was — the wording of the trigger condition needs refinement, not the constraint itself.
- If a sixth-plus recurrence happens *after* this constraint is in place and the PR description *did* name the gap, the constraint is working as intended. The recurrence is not a failure of the constraint; the constraint exists to surface the gap, not to close it.

## See Also

- `ams://canon/constraints/outcome-verification-via-runnable-artifact` — the sibling constraint on "done means a runnable check passes against the actual outcome." This constraint is its CI-CD-deployment-specific corollary.
- `ams://canon/constraints/canon-code-sync-via-spawned-agent-session` — the legacy Managed Agents audit gate; the gate most often affected by this pattern.
- `ams://canon/constraints/oddkit-gauntlet-via-spawned-agent-session` — the oddkit-gauntlet runtime probe; modifications to its dispatcher hit this gap.
- `ams://canon/constraints/output-artifact-format-validation-via-spawned-agent-session` — the output-artifact validator runtime probe; same.
- `klappy://canon/methods/governance-validation-via-agents` — the upstream pattern of validating canon and code via agents at PR time.
- `klappy://canon/constraints/release-validation-gate` — the upstream Tier-1 binding rule on release validation; this constraint is its specific instantiation for the case where the validator itself is being released.
- `klappy://canon/principles/verification-requires-fresh-context` — the broader epistemic principle on validation requiring structural separation from creation.
- `klappy://canon/constraints/mode-discipline-and-bottleneck-respect` — why externalizing the validation gap onto the operator's attention is a throughput regression.
- `journal/2026-05-13-canon-promotion-and-first-probe-firing.tsv` — the fifth recurrence in full Dolcheo+ form, including the parity scorecard and the streaming-SSE fix that this constraint's authoring journal entry validates against.
