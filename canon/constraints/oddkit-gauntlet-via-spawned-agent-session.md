---
uri: ams://canon/constraints/oddkit-gauntlet-via-spawned-agent-session
title: "The Oddkit Gauntlet for Canon and Doc PRs Is Run by a Spawned Agent Session, Not Wished Into Existence"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: draft
tags: ["ams", "canon", "constraints", "audit-gate", "spawned-agent-sessions", "oddkit", "gauntlet", "canon-authoring", "uri-integrity", "validator", "vodka-architecture"]
epoch: E0008.5
date: 2026-05-13
derives_from: "klappy://canon/constraints/audit-gates-are-spawned-agent-sessions, klappy://canon/methods/persona-shaped-agent-runtime, klappy://canon/methods/spawned-agent-session-runtime-contract, klappy://canon/methods/reference-integrity-audit, klappy://canon/constraints/oddkit-prompt-pattern, klappy://canon/voice/oddie-the-river-guide"
complements: "klappy://canon/methods/governance-validation-via-agents, ams://canon/constraints/canon-code-sync-via-spawned-agent-session, ams://canon/constraints/output-artifact-format-validation-via-spawned-agent-session"
governs: "The audit gate that runs the oddkit gauntlet (oddkit_challenge + oddkit_audit) on canon and doc PRs in AMS. The gauntlet is dispatched by a spawned-agent-session so the audit can read canon, pressure-test claims, walk URI references, and report findings in plain language — not buried in a script's exit code."
status: proposed
---

## Summary — The Gauntlet Was Always a Person's Job; Now It's a Persona's Job

The "oddkit gauntlet" is the sequence operators have been running by hand before opening canon PRs: call `oddkit_challenge` to pressure-test claims against canon constraints, then call `oddkit_audit` to walk URI references and surface dead links and supersession drift. Whoever wrote the canon ran the gauntlet before pushing; if they forgot, drift landed and was caught later — usually too late.

The same substrate that catches code-canon drift (`ams://canon/constraints/canon-code-sync-via-spawned-agent-session`) and output-artifact format drift (`ams://canon/constraints/output-artifact-format-validation-via-spawned-agent-session`) can run the gauntlet automatically on every canon or doc PR. The audit invokes `oddkit_challenge` and `oddkit_audit` as MCP tools through the persona's `mcp_servers.operational: [oddkit]` wiring, receives their results, and posts a verdict comment in Oddie's voice.

This constraint defines the audit. The persona that hosts it is `ams://canon/personas/ams-oddkit-gauntlet-runner`.

## The Drift Surfaces in AMS

For any PR that modifies canon docs, writings, or journal markdown, the auditor runs the gauntlet against the changed files and reports findings.

| Surface | What's audited | Tool |
|---|---|---|
| **Claim coherence** | Each substantive claim in the changed docs is pressure-tested against the canon constraints that govern its claim type (principle-extraction, pattern-coinage, observation, comparative-positioning, assumption, strong-claim) | `oddkit_challenge` mode-appropriate |
| **URI integrity** | Every `klappy://` and `ams://` URI referenced in changed docs is walked: does the target exist, is it superseded, are anchor fragments resolvable | `oddkit_audit` |
| **Cross-doc references** | Links to other docs in the same repo (relative paths, internal markdown anchors) are checked for resolvability — drift in repo structure shows up here | Agent-side traversal using `oddkit_get` |

The gauntlet runs against the **changed files in the PR diff**, not the whole repo. Repo-wide gauntlet sweeps are a separate concern handled by scheduled jobs, not PR-time audits.

Files outside `canon/`, `writings/`, and `journal/` are not in scope for this audit. The output-artifact validator handles format-shaped concerns; the canon-code-sync auditor handles code-canon drift; this audit handles canon-authoring quality.

## How the Audit Runs

Same invocation shape as the other AMS spawned-agent-session audits. A GitHub Actions workflow mints an OIDC token, POSTs to `/audit-gate-test` on the AMS Worker with `{persona_uri: ams://canon/personas/ams-oddkit-gauntlet-runner, pr_number, github_token?}`, and posts the verdict as a non-gating PR comment.

For each PR:

1. The runtime resolves the persona profile via `oddkit_get`, confirms `role: validator`, and fetches the PR diff (head+tail-capped per the canon-code-sync §Current Implementation).
2. The runtime assembles the system prompt by fetching this constraint and prepending the persona identity.
3. The agent session is spawned with `mcp_servers.operational: [oddkit]` wired through Anthropic's native MCP connector. The agent has `oddkit_get`, `oddkit_search`, `oddkit_challenge`, and `oddkit_audit` as tool surface.
4. The agent identifies which paths in the diff are in scope (canon, writings, journal markdown). For each changed file, the agent:
   - Reads the file from the diff (the canonical post-change content)
   - Calls `oddkit_challenge` against the file's substantive claims with the appropriate `mode` for the doc's frontmatter tier (`canon-tier-1`, `canon-tier-2`, `peer-review-ready`, etc.)
   - Calls `oddkit_audit` on the file's URI references
   - Records whether each call surfaced tensions / missing prerequisites / dead URIs
5. The agent emits a single fenced JSON block matching the output contract.

**Output contract.** JSON `{verdict, summary, comment_body_b64}` matching the canon-code-sync output contract. `verdict` is `PASS` if no findings (or only ⚠️ non-blocking advisories) surfaced; `FAIL` if any blocking finding surfaced. A blocking finding is: a tension `oddkit_challenge` marked `block_until_addressed: true`, a dead URI from `oddkit_audit`, or a broken supersession chain.

**Voice and surface.** The agent speaks as Oddie per `klappy://canon/voice/oddie-the-river-guide`. The upstream voice canon is authoritative for register, banned moves, signature moves, and emoji discipline; this constraint does not restate it. The functional status palette (✅ pass / 🟢 clean / ⚠️ finding / 🔴 blocker / ⏳ pending / 🟡 caveat) carries the verdict alongside Oddie's 🦦 signature. River vocabulary maps directly onto this audit's surfaces and may appear when genuinely live: 🪵 driftwood for dead URIs surfaced by `oddkit_audit`; 🌀 eddies for circular claim coherence surfaced by `oddkit_challenge`; 🪨 kept-rock for evidence the agent pulls from canon to back a finding; 🌿 banks for the canon constraints being tested against. Per the upstream density rule, persona emoji are one-per-paragraph maximum. Per the machine-surface ban, the verdict JSON's `verdict` and `summary` fields are clean text — persona emoji live only in `comment_body_b64`'s markdown body. The body groups findings by file, then by surface within file; quote canon constraints when reporting tensions; quote URIs when reporting dead refs.

## Current Implementation (Substitutable per Project Decision)

This section records the AMS substrate choice for this audit. It is an operating note, not governance. Substrate switches do not require canon edits to this constraint — only updates to this section.

- **Substrate**: same `AuditGateDO` that hosts the canon-code-sync and output-artifact-validator runtime gates. Adding this audit required one line in `ALLOWED_PERSONA_URIS` and a new caller workflow.
- **Beta header**: `anthropic-beta: mcp-client-2025-11-20`.
- **Model**: `claude-sonnet-4-6`.
- **Trigger surface**: `POST /audit-gate-test` on `ams.klappy.dev`, OIDC-authenticated, with `persona_uri: ams://canon/personas/ams-oddkit-gauntlet-runner` in the body.
- **Caller workflow**: `.github/workflows/oddkit-gauntlet-runtime-probe.yml`. Fires on PR events touching `canon/**`, `writings/**`, `journal/**`. Runs alongside the canon-code-sync and output-artifact probes.
- **Probe / not-gating**: initial deployment posts a non-gating comment. Promotion to gating is a workflow edit once parity with operator expectations is established.

## What This Forbids in AMS

- **Hand-running the gauntlet before every PR.** The point of moving the gauntlet to a spawned-agent-session is that no human (or AI) has to remember to run it. If you're tempted to write a checklist saying "run `oddkit_challenge` before opening a canon PR," the answer is to ship this audit instead.
- **Calling oddkit's HTTP API directly from a CI script.** The gauntlet must run inside a persona-shaped-agent-runtime session. A bash script that POSTs to `oddkit.klappy.dev` and greps the JSON would get the tool output but miss the judgment layer — the agent's job is to read the gauntlet results in context (which claims actually matter, which URIs are intentionally placeholder, which advisories are noise) and write a verdict a canon author can engage with.
- **Gauntlet-failure-as-merge-block on day one.** Initial deployment is probe-only. Promotion to gating happens after the operator has read 2–3 PRs' worth of verdicts and confirmed the audit's calibration is reasonable. Premature gating creates a bad first impression and trains people to ignore the audit.
- **Editing canon to make the gauntlet pass.** Tensions that `oddkit_challenge` surfaces are signal. The fix is to address the tension (improve the canon claim, add the missing prerequisite, name the disconfirmer) — not to remove the claim or tune the gauntlet's strictness. The audit is allowed to be wrong; the canon is not allowed to be quietly silenced.

## What This Does Not Forbid

- **The auditor making judgment calls.** Not every `oddkit_challenge` result is a blocker. The agent decides what to surface and how — that's the point of using a persona, not a script. If `block_until_addressed: false`, the agent may decide to silence the finding or note it as ⚠️ depending on context.
- **Auditing fewer files than the diff touches.** If the diff has 30 changed canon docs, the agent may prioritize the substantive changes and skip near-trivial edits, naming this choice in the verdict. Budget discipline matters; exhaustive coverage at the cost of quality coverage is the wrong trade.
- **The audit suggesting fixes.** A `validator`-role persona doesn't write code, but it can describe the canonical shape of a fix in its verdict. "This URI `<canon-uri-from-pr>` doesn't resolve; the closest existing URI is `<closest-real-canon-uri>`, possibly intended."
- **Gauntlet expansion.** Adding new gauntlet steps (e.g., `oddkit_orient`-based mode-coherence check) is a canon edit to this constraint plus matching prompt updates in the persona's system prompt. The persona doesn't change.

## Naming

`oddkit-gauntlet-via-spawned-agent-session.md`. "Gauntlet" because that's what operators have called this sequence informally; the canon picks up the operator's vocabulary. The `-via-spawned-agent-session` suffix mirrors the other audit-gate constraints in this family.

The persona is `ams-oddkit-gauntlet-runner` (not `ams-canon-author-validator` or similar) to keep the naming semantically explicit: the persona runs the oddkit gauntlet. If the gauntlet's composition changes substantially (e.g., loses `oddkit_challenge`, gains a new tool), the persona is renamed too.

## Relationship to Other Canon

- **Upstream parent**: `klappy://canon/constraints/audit-gates-are-spawned-agent-sessions` — Tier-1 family this audit is part of.
- **Gauntlet tool definitions**: `klappy://canon/constraints/oddkit-prompt-pattern` — the prompt-pattern guidance the agent uses when running `oddkit_challenge`. `klappy://canon/methods/reference-integrity-audit` — the canonical method for URI integrity audits via `oddkit_audit`.
- **Sibling audits**: `ams://canon/constraints/canon-code-sync-via-spawned-agent-session`, `ams://canon/constraints/output-artifact-format-validation-via-spawned-agent-session` — same substrate family.
- **Persona profile**: `ams://canon/personas/ams-oddkit-gauntlet-runner`.
- **Runtime contract**: `klappy://canon/methods/spawned-agent-session-runtime-contract`.

## See Also

- `klappy://canon/methods/persona-shaped-agent-runtime` — substrate this audit runs on.
- `klappy://canon/methods/governance-validation-via-agents` — broader agents-as-governors pattern.
- `klappy://canon/principles/dry-canon-says-it-once` — why running the gauntlet matters: silent drift between canon claims undermines the "say it once" discipline.
