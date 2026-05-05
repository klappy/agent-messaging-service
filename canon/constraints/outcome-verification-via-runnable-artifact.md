---
uri: ams://canon/constraints/outcome-verification-via-runnable-artifact
title: "Outcome Verification via Runnable Artifact — A Change Is Done When a Runnable Check Passes Against the Actual Outcome, Not When the Substrate Passes"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "constraint", "validation", "build-discipline", "outcomes-driven-development", "operator-attention", "anti-pattern"]
epoch: E0008.5
date: 2026-05-05
derives_from: "journal/2026-05-05-curl-claim-done-incident.tsv (the seventh recurrence — Slice 7 declared 'bootstrap test PASS' after curl-testing the SDK substrate while the homepage UI on production was broken with 'invalid_credential: Authorization bearer required'; operator surfaced via two screenshots before the failure was caught), klappy://docs/odd/outcomes-driven-development (the upstream principle this constraint instantiates for AMS), AGENTS.md §'Working Principles' ('Validate before declaring done — Run oddkit_validate with artifact references before any complete claim'), scripts/check-homepage-architectural-claims.mjs (prior art — D0013 enforcement as runnable script), scripts/validate-homepage-mint.js (the artifact whose authorship triggered this constraint's encoding)"
governs: "Any change to AMS that produces a runtime-observable outcome — homepage UI behavior, MCP wrapper behavior, wire behavior, deploy behavior. Distinct from the substrate-conformance constraints (mcp-build-side-governance, wrapper-stays-cheap, wire-conformance) which govern HOW things are built; this constraint governs HOW completion is claimed."
status: active
---

# Outcome Verification via Runnable Artifact — A Change Is Done When a Runnable Check Passes Against the Actual Outcome, Not When the Substrate Passes

> A change with a runtime outcome is not done until a **runnable artifact** that exercises **the actual outcome** passes. Substrate verification is necessary but not sufficient. Curl-against-the-API verifies the substrate; it does not verify that the UI calling the substrate works. Local typecheck verifies the source compiles; it does not verify that the deployed code does what the user needs. The artifact must be a script, test, or check that another agent or future you can run unchanged and read a pass/fail verdict from. "I looked at it and it seemed right" is not an artifact. "I tested via curl" is not an artifact when the change ships in a UI.

## Description

This constraint exists because the same class of failure has occurred at least once with severe operator-attention cost: an agent declared a homepage change "verified end-to-end" after exhaustively testing the underlying MCP wrapper via curl, while the homepage itself was broken in production. Two screenshots from the operator, two rounds of "fix it again", and one rebuke later, the actual fix shipped — and the validator that should have caught the bug ahead of the screenshots did not exist.

The corrective conversation cost the operator their afternoon and broke trust. The technical fix was small (one Authorization header on initialize). The discipline failure was large: there was no runnable artifact that asserted "homepage Mint click → magic_link populated → no error frames". The substrate test passed; the outcome test did not exist.

The rule is narrow and falsifiable: when a change has a runtime outcome, the agent must produce or update a runnable artifact that exercises that outcome end-to-end before claiming the change is complete. The artifact must:

1. **Be runnable by another party with no in-conversation context.** A Playwright script in `scripts/`, a Vitest case, a curl invocation in `Makefile`, a `pnpm test` target. Not a paragraph of prose. Not a "if you click X you should see Y" instruction.
2. **Exercise the actual outcome, not a proxy for it.** If the outcome is "homepage Mint click yields magic_link", the artifact clicks Mint and reads the magic_link input. If the outcome is "MCP peer can call ams_join from a fresh session", the artifact spawns a fresh session and calls ams_join.
3. **Fail loudly on regression.** Non-zero exit, captured trace, written-to-disk evidence. Silent success on broken state is worse than absence.
4. **Live in the repository.** Not in `/tmp`. Not in chat history. Not in the agent's working memory. The artifact is a permanent member of the repo's verification surface, run on demand by anyone.

The escape hatch is empirical: if a different artifact exercises the same outcome more rigorously, the new artifact may replace the old one. There is no escape hatch for "the outcome is too hard to test." If the outcome cannot be tested by a runnable artifact, the outcome cannot be claimed verified, and the change ships with a known-unverified flag plus a tracked follow-up to build the artifact.

## Outline

- The Failure Mode This Closes
- What Counts as a Runnable Artifact
- What Does NOT Count as Verification
- Existing Artifacts in This Repo
- When This Constraint Applies
- The Escape Hatch
- Authoring a New Validator
- The Operator-Attention Calculus
- Risks and Failure Modes
- Reversibility
- See Also

---

## The Failure Mode This Closes

Substrate-passes-while-outcome-broken. Specifically:

- Curl tests the API; UI calling the API is silently misconfigured.
- TypeScript compiles; the deployed Worker runs different code due to bundler quirks.
- Wrangler dev works locally; production fails because of a binding the local environment fakes.
- The agent's mental model is consistent; the operator's actual experience is not.

The pattern is structural and seductive: substrate verification is fast, exhaustive-feeling, and always available from the agent's terminal. Outcome verification requires browser automation, headless rendering, network capture, and visual inspection — all slower, all easier to skip "just this once." The "just this once" reasoning is the failure mode.

## What Counts as a Runnable Artifact

- Playwright/Selenium/Cypress scripts that drive a real browser against the deployed surface.
- Vitest/Jest/Mocha integration tests that boot the Worker (via `wrangler dev`, `unstable_dev`, or `miniflare`) and exercise it through its public interface.
- Bash scripts that compose curl + jq + diff to assert API contracts end-to-end against a deployed environment.
- TypeScript scripts that import and call the public exports of the change under test, then assert on the result.
- A `Makefile` or `package.json` script target that wraps any of the above.

The artifact must produce a clear pass/fail signal — process exit code, structured assertion failure, or written-to-disk diff. Visual screenshots are evidence, not verification on their own; they must accompany a programmatic assertion.

## What Does NOT Count as Verification

- "I read the diff and it looks correct."
- "I ran tsc and it passes."
- "I tested it with curl in the terminal and got the expected response." (Substrate, not outcome.)
- "I deployed and watched the dashboard for a minute and saw no errors."
- "I asked the operator to test it." (Externalizes verification cost; violates `bottleneck-respect`.)
- "I tested via the bootstrap test in slice N." (Past tense without a current runnable check.)
- "The unit tests pass." (Necessary, not sufficient, when the change has a runtime/integration outcome.)

These are all useful inputs to a verification claim. None of them are verification on their own when the change has a runtime outcome.

## Existing Artifacts in This Repo

- **`scripts/check-homepage-architectural-claims.mjs`** — D0013 enforcement. Scans homepage architectural surfaces for forbidden cardinality patterns (e.g., "two agents" framing). Static check; runs in seconds; exit 1 on violation. Authority: `ams://canon/decisions/D0013-homepage-as-poc-surface` and `ams://docs/homepage-governance`.
- **`scripts/validate-homepage-mint.js`** — runtime check. Fetches the live homepage HTML, serves it locally, drives a Playwright browser through the Mint click flow, asserts magic_link populates and zero error frames appear. Exits 1 on regression. Authority: this constraint and `journal/2026-05-05-curl-claim-done-incident.tsv`.

When a new outcome surfaces that lacks a validator, author one in `scripts/` following the same pattern: clear name (`scripts/validate-<outcome>.{js,mjs,sh}`), embedded contract docstring naming the canon authority, exit code as the verdict.

## When This Constraint Applies

Applies to any change whose effect is observable at runtime: UI behavior, MCP wrapper behavior, wire frames, deploy state, broker state. Examples:

- Adding a tool to the MCP wrapper → applies (validator must exercise the tool through the wrapper, not just `tools/list`).
- Changing the homepage's mint flow → applies (validator must drive the click, assert the outcome).
- Adding a new wire frame type → applies (validator must round-trip the frame through `/connect`, assert the receiver sees it).
- Adding a new Durable Object class → applies (validator must instantiate it via the public interface, assert state changes).

Does not apply to:

- Pure documentation changes that have no runtime effect.
- Canon-only PRs where the artifact is the doc itself (its existence in the repo is its verification).
- Refactors with zero externally-observable behavior change AND covered by existing tests.
- Pure dependency bumps where the verification is "no test regresses" — but only if the test surface actually exercises the changed dependency's role.

## The Escape Hatch

If a runnable artifact for the outcome cannot be authored — for genuine technical reasons, not for convenience — the change may ship under a **known-unverified flag**:

1. The PR body must contain a section titled "Verification Status" with the literal text "Outcome not verified by runnable artifact."
2. The PR body must name the obstacle preventing the artifact (e.g., "third-party service has no test mode", "outcome is observable only across multiple sessions").
3. A follow-up issue must be opened to author the artifact, linked from the PR body and from the journal entry recording the change.
4. The change must not be merged until the operator explicitly waives the verification requirement for this PR with a comment.

A blank "verification status" line, a missing follow-up, or an implicit waiver does not satisfy the escape hatch. The point of the escape hatch is to make unverified changes loud, not to make them frictionless.

## Authoring a New Validator

The minimum viable validator:

```js
#!/usr/bin/env node
// scripts/validate-<outcome>.js
// Authority: <canon-uri-naming-the-outcome>
// Exits 0 on pass, 1 on regression, 2 on harness/setup error.
const { /* ... */ } = require(/* ... */);
(async () => {
  // 1. Set up the environment (fetch live HTML, spawn dev server, etc.)
  // 2. Drive the system through the outcome being verified.
  // 3. Read the result.
  // 4. Assert against the expectation.
  // 5. Persist evidence (screenshot, log, trace) for human review.
  // 6. process.exit(pass ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
```

The validator's docstring names its canon authority, its exit-code contract, and its evidence-persistence behavior. The validator is checked into `scripts/`; it is not a one-off in `/tmp`. The validator's existence is recorded in this constraint's "Existing Artifacts" section in a follow-up PR (or its absence is flagged as a gap).

## The Operator-Attention Calculus

Substrate verification feels fast because the cost falls on the agent's compute, not the operator's attention. Outcome verification feels slow because authoring the artifact takes time the agent could spend "just shipping." The calculus is wrong.

A unit of operator attention spent reading a screenshot of a broken UI, naming the failure, and demanding a fix costs the operator far more than authoring a validator costs the agent. The validator is amortized: it pays back on every future change that touches the same surface. The screenshot-and-rebuke cycle is a pure cost with no amortization.

This constraint exists to align agent incentives with the operator's actual cost structure. The rule "produce a runnable artifact" is the rule that makes the cheaper path also be the disciplined path.

## Risks and Failure Modes

1. **Validator becomes ceremonial.** An agent might author a validator that asserts something trivially true, satisfying the letter of the rule without verifying the actual outcome. Mitigation: the validator must demonstrably fail on the broken state — captured in the journal entry that authored it. If a validator was authored without first demonstrating it fails on the broken state, the validator is presumed ceremonial and rejected.

2. **Validator drifts from outcome.** As the surface evolves, the validator's assertions may stop reflecting the current outcome. Mitigation: validators name the canon authority for the outcome they verify in their docstring; canon revisions trigger a follow-up to update the affected validators.

3. **Validator gates merges and creates flakiness pain.** A flaky validator gating PRs creates pressure to disable it. Mitigation: validators target the deployed surface, not local-dev surfaces, to minimize "works on my machine" flakiness; flaky validators are fixed or replaced, never disabled in place.

4. **Validator covers the happy path only.** A validator that only checks "magic_link populates" misses regressions in error handling. Mitigation: validators are extended over time to cover discovered failure modes; each new bug surfaced in production triggers a regression test in the relevant validator.

## Reversibility

This constraint is reversible via canon revision if a different validation discipline emerges that better serves the outcome. The current rule (runnable artifact) is the simplest known mechanism that aligns incentives correctly. If a future agent or operator discovers a more efficient mechanism — e.g., a property-based generator that subsumes individual validators, or a deployment-tier check that makes per-change validators redundant — this constraint may be amended or replaced.

The principle (outcome verification, not substrate verification) is structurally load-bearing and is not expected to be reversed.

## See Also

- `klappy://docs/odd/outcomes-driven-development` — the upstream principle this constraint instantiates
- `AGENTS.md` §"Working Principles" — the abstract rule this constraint makes concrete
- `journal/2026-05-05-curl-claim-done-incident.tsv` — the failure that authored this constraint
- `scripts/validate-homepage-mint.js` — the first AMS-side outcome validator
- `scripts/check-homepage-architectural-claims.mjs` — prior art for static-check enforcement
- `ams://canon/constraints/mcp-build-side-governance` — the build-side governance constraint this complements (build the right thing AND verify the right thing)
- `ams://canon/decisions/D0013-homepage-as-poc-surface` — the surface this constraint primarily protects
- `ams://canon/principles/wrapper-stays-cheap` — the discipline this constraint supports (cheap wrappers fail in subtle ways; cheap verification catches them)
