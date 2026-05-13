---
uri: ams://canon/constraints/output-artifact-format-validation-via-spawned-agent-session
title: "Output-Artifact Format Validation Is Audited by a Spawned Agent Session, Not a Linter"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: draft
tags: ["ams", "canon", "constraints", "audit-gate", "spawned-agent-sessions", "output-validation", "format-compliance", "dolcheo", "validator", "vodka-architecture"]
epoch: E0008.5
date: 2026-05-13
derives_from: "klappy://canon/constraints/audit-gates-are-spawned-agent-sessions, klappy://canon/methods/persona-shaped-agent-runtime, klappy://canon/methods/spawned-agent-session-runtime-contract, klappy://odd/encoding-types/serialization-format, ams://canon/constraints/canon-code-sync-via-spawned-agent-session, klappy://canon/voice/oddie-the-river-guide"
complements: "klappy://canon/methods/governance-validation-via-agents, klappy://canon/methods/spawned-agent-session-substrate-options"
governs: "Validation that files matching governed format patterns in any AMS PR diff conform to their canonical format definitions. The validator runs as a spawned-agent-session — not a schema linter — so the same audit substrate that catches code-canon drift catches format drift. Scope is bounded by an explicit allow-list of format patterns. Initial scope: journal/**/*.tsv against the Dolcheo+ serialization-format canon."
status: proposed
---

## Summary — Formats Have Canon Too

A canonical format definition is a kind of canon. Drift between a governed output file and its canonical definition is the same shape of problem as drift between code and canon: someone wrote something that contradicts the canon, the canon and the artifact disagree, and a reader can't trust either without checking. The AMS canon-code-sync audit gate catches the first kind. This constraint adds the second.

Output-artifact format validation is **not a schema linter**. A linter knows one schema, fires on syntactic mismatch, and emits line-numbered errors. A spawned-agent-session validator reads the canonical format definition fresh on every audit, applies it with judgment to the files in the diff, and emits a verdict comment that names the canonical rule and the drift in plain language. The substrate is the same persona-shaped-agent-runtime the canon-code-sync audit uses (`klappy://canon/methods/persona-shaped-agent-runtime`). The persona that hosts this audit is `ams://canon/personas/ams-output-artifact-validator`.

This separation matters for the same reason `klappy://canon/constraints/audit-gates-are-spawned-agent-sessions` argues for the canon-code path: a script that hardcodes a format check ages badly. A persona-shaped agent session can refer to the canon definitively, accept new format types via canon updates, and explain its findings in terms the canon author can engage with.

## The Drift Surfaces in AMS

The auditor audits the diff of every PR against an allow-list of format-pattern → canon-definition pairs. The initial pairs are below; future pairs land via canon updates to this constraint plus matching allow-list entries in the validator persona's task description.

| Pattern | Canonical format definition |
|---|---|
| `journal/**/*.tsv` | `klappy://odd/encoding-types/serialization-format` (Dolcheo+ tab-separated rows; no header; first column is the type letter; field count varies by type) |

Files outside the allow-list are not audited by this validator. A different persona may govern them, or they may not yet have a canonical format definition. Both states are acceptable — the audit's scope is what it has canon for, not what it imagines should exist.

Note that the auditor reads the canonical format definition via the oddkit MCP server at audit time, not from an embedded copy. Updates to the format canon propagate to the next audit without a code change.

## How the Audit Runs

The audit is invoked the same way every persona-shaped audit gate is invoked: a GitHub Actions workflow mints an OIDC token, POSTs to `/audit-gate-test` on the AMS Worker with `{persona_uri, pr_number, github_token?}`, and posts the verdict as a non-gating PR comment alongside the other audits.

For each PR:

1. The runtime resolves `ams://canon/personas/ams-output-artifact-validator` via `oddkit_get`, parses the profile, and confirms `role: validator`.
2. The runtime fetches the PR's diff (60 KiB head + tail per `ams://canon/constraints/canon-code-sync-via-spawned-agent-session §Current Implementation`).
3. The runtime assembles the system prompt by fetching this constraint via `oddkit_get` and prepending the persona identity header.
4. The agent session is spawned with the assembled system prompt and the persona's `mcp_servers.operational: [oddkit]` wired through the Anthropic Messages API native MCP connector. The agent has `oddkit_get` and `oddkit_search` as tool surface.
5. The agent identifies which paths in the diff match the allow-list patterns. For each matched file, the agent fetches the canonical format definition via `oddkit_get` and audits the file's content against it.
6. The agent emits a single fenced JSON block at the end of its response matching the output contract.

**Output contract.** The verdict is JSON `{verdict, summary, comment_body_b64}` matching the canon-code-sync output contract. `verdict` is `PASS` if every audited file conforms to its canonical definition; `FAIL` if any audited file has drift. `summary` is a one-line plain summary. `comment_body_b64` is base64-encoded markdown for the PR comment. **No files matching the allow-list patterns** means `verdict: PASS` with a summary noting nothing was in scope.

**Voice and surface.** The agent speaks as Oddie per `klappy://canon/voice/oddie-the-river-guide`. The upstream voice canon is authoritative for register, banned moves, signature moves, and emoji discipline; this constraint does not restate it. The functional status palette (✅ pass / 🟢 clean / ⚠️ finding / 🔴 blocker / ⏳ pending / 🟡 caveat) and Oddie's 🦦 signature carry the verdict; river vocabulary (🪵 driftwood for superseded format URIs, 🌿 banks for format definitions that channel acceptable output) appears only when its mapped concept is the genuine subject. Per the upstream brand guide's density rule, persona emoji are one-per-paragraph maximum. Per the machine-surface ban, the verdict JSON's `verdict` and `summary` fields are clean text — persona emoji live only in `comment_body_b64`'s human-readable markdown.

## Current Implementation (Substitutable per Project Decision)

This section records the AMS substrate choice for this audit. It is an operating note, not governance. Substrate switches do not require canon edits to this constraint — only updates to this section.

- **Substrate**: same Cloudflare Durable Object (`AuditGateDO`) that hosts the canon-code-sync runtime gate. Adding this audit to the substrate required one line in `worker/src/runtime/audit-gate.ts` (`ALLOWED_PERSONA_URIS` array) and a new caller workflow. No new code path, no new DO class, no new deployment.
- **Beta header**: `anthropic-beta: mcp-client-2025-11-20`.
- **Model**: `claude-sonnet-4-6`.
- **Trigger surface**: `POST /audit-gate-test` on `ams.klappy.dev`, OIDC-authenticated, with `persona_uri: ams://canon/personas/ams-output-artifact-validator` in the request body.
- **Caller workflow**: `.github/workflows/output-artifact-validation-runtime-probe.yml`. Fires on the same PR triggers as the canon-code-sync probe, runs alongside it, posts an independent verdict comment.
- **Probe / not-gating**: this audit is in initial deployment. Like the canon-code-sync runtime probe, it posts a clearly-labeled non-gating comment until parity with operator expectations is established. Promotion to gating is a workflow edit, not a substrate change.

## What This Forbids in AMS

- **Hand-rolled format checks in CI scripts.** A `tools/validate-journal-tsvs.py` written in Python that parses TSVs and asserts a column count is the wrong shape — it ages with the format, drifts from canon, and emits errors a canon author can't reason about. If you find yourself writing a format linter, you're working at the wrong level; write canon for the format instead.
- **Embedded format definitions in the validator's code.** The validator must resolve format definitions via `oddkit_get` at audit time. Hardcoding format rules inside `audit-gate.ts` (or anywhere else in the worker) defeats the canon-as-source-of-truth design — the next format update would require a worker deploy rather than a canon PR.
- **Format checks that modify files.** This persona is `role: validator` per `klappy://canon/methods/spawned-agent-session-runtime-contract §Role`. It reports drift; it does not auto-fix. Auto-fixing is a different role with different fresh-context requirements.
- **Format checks that depend on diff size.** The audit must run on PRs of any size. Diff capping per `ams://canon/constraints/canon-code-sync-via-spawned-agent-session §Current Implementation` (150 KiB head+tail) applies; for very large diffs that exceed the cap, the audit's scope is what it can see in the capped window, not silently nothing.

## What This Does Not Forbid

- **Format definitions evolving.** Canon is allowed to change. The audit reads canon fresh each invocation; format updates propagate to the next audit.
- **Multiple format types per audit.** The allow-list table above is initial scope. Adding `canon/personas/**/*.md` (validate persona YAML profile blocks against `klappy://canon/methods/persona-shaped-agent-runtime §The Persona Profile`) or `**/frontmatter` validation is a canon edit to this constraint plus matching prompt updates — not a new persona.
- **Cosmetic findings.** The auditor may surface non-drift notes (e.g., "this TSV row is technically valid but ordering looks unusual") as ⚠️ items. These are advisory and do not affect the verdict.
- **Scope expansion to other repos.** When the same substrate is used by `klappy/klappy.dev` PRs, this persona can be added to that repo's allow-list. The canon is portable; the trigger wiring is per-repo.

## Naming

The file is named for what the audit *does* and *how* it runs: validates output artifacts against canonical formats, via a spawned-agent-session. The "-via-spawned-agent-session" suffix mirrors `canon-code-sync-via-spawned-agent-session.md` and signals the substrate family: any new audit gate in this family follows the same naming convention so the canon directory reads coherently.

## Relationship to Other Canon

- **Upstream parent**: `klappy://canon/constraints/audit-gates-are-spawned-agent-sessions` — Tier-1 constraint this AMS-side adoption inherits.
- **Sibling**: `ams://canon/constraints/canon-code-sync-via-spawned-agent-session` — same substrate, different drift surface (code vs. format).
- **Format canon (initial scope)**: `klappy://odd/encoding-types/serialization-format` — the canonical Dolcheo+ TSV format the auditor checks journal files against.
- **Persona profile**: `ams://canon/personas/ams-output-artifact-validator` — declares the runtime configuration for this audit.
- **Runtime contract**: `klappy://canon/methods/spawned-agent-session-runtime-contract` — defines validator/role semantics, fresh-context guarantee, output-contract shape.

## See Also

- `klappy://canon/methods/persona-shaped-agent-runtime` — the substrate this audit runs on.
- `klappy://canon/methods/governance-validation-via-agents` — the broader pattern (agents-as-governors) this audit implements.
- `klappy://canon/principles/cache-fetches-and-parses` — the caching discipline the runtime applies when resolving format canon.
- `ams://canon/personas/ams-canon-code-auditor` — sibling persona on the same substrate.
