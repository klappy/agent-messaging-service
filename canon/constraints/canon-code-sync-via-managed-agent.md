---
uri: ams://canon/constraints/canon-code-sync-via-managed-agent
title: "Canon-Code Sync Is Audited by a Managed Agent, Not a Script"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "constraint", "governance", "audit", "managed-agents", "vodka-architecture", "ci"]
epoch: E0008.5
date: 2026-05-07
derives_from: "klappy://canon/constraints/audit-gates-are-managed-agents, klappy://canon/methods/governance-validation-via-agents, klappy://canon/methods/reference-integrity-audit, ams://canon/constraints/wrapper-stays-cheap"
governs: "The merge gate that audits canon ↔ code ↔ deployed-config coherence in klappy/agent-messaging-service. Specifies which surfaces AMS expects the audit to cover and points at the workflow that dispatches the gate."
status: active
---

# Canon-Code Sync Is Audited by a Managed Agent, Not a Script

> AMS canon, the TypeScript implementation, and the `wrangler.toml` deployment configs drift against each other unless something audits them at PR time. The audit's gate is a Managed Agent dispatched per `.github/workflows/canon-code-sync-audit.yml`, in conformance with `klappy://canon/constraints/audit-gates-are-managed-agents`. Mechanical scripts do not gate this audit. They never have to in this repo, and they never will.

## Summary — AMS Adopts the Upstream Rule

This is a thin adoption pointer. The substantive constraint is upstream:

- **Authoritative governance:** `klappy://canon/constraints/audit-gates-are-managed-agents` (Tier-1, klappy.dev). Read it. The rule, the binding conditions, the migration path, the retraction conditions, and the worked anti-pattern that motivated it (this very repo's earlier PR #63) all live there.
- **Method specifications:** `klappy://canon/methods/governance-validation-via-agents` and `klappy://canon/methods/reference-integrity-audit` (both Tier-1, klappy.dev) describe how the agent is configured and dispatched.
- **What this AMS-side constraint adds:** the project-specific drift surfaces the gate is expected to cover, and a stable pointer to the workflow that runs it.

## The Drift Surfaces in AMS

The Managed Agent gate audits these surfaces in priority order:

1. **Canon ↔ deployment config.** Does anything in `canon/` contradict the actual contents of `packages/*/wrangler.toml` or `worker/wrangler.toml` on the PR branch? Concrete example from this repo's history: D0026 §Dependency Direction once asserted *"no service binding required for v1"* while `packages/tincan/wrangler.toml` shipped `[[services]] binding = "AMS"` in the same merge. Mechanical scripts cannot catch this — there is no path token to scan for. An agent reading both files together catches it in one pass.
2. **Canon ↔ code.** Does any constraint, decision, or charter description still match the TypeScript in `worker/src/` or `packages/*/src/`? When `mcp.ts` grows, does `wrapper-stays-cheap` still describe what's there? When a new wrapper class lands, did the canon constraint list update?
3. **Cross-canon coherence.** Do docs added or edited in this PR contradict adjacent canon already on main? The agent uses `oddkit_search` to find sibling constraints/decisions for each touched concept and compares claims.
4. **Handoff and writing supersession.** Does any handoff in `docs/handoffs/` or proposal in `proposals/` recommend an approach the project has since superseded? Evidence of supersession lives in `journal/` entries and in newer canon. Concrete example: the portal-and-ride-along handoff originally recommended fetching `https://raw.githubusercontent.com/...` for canon prose; PR #64 superseded that with the oddkit MCP client. The handoff doc carries a `STATUS (2026-05-07)` header acknowledging the deviation. The agent verifies that pattern continues to hold for new supersessions.
5. **Supersession chain integrity.** If a new doc claims to supersede an older one, does the older doc carry the matching `superseded_by` frontmatter? If not, the chain is broken and the audit flags it.

## How the Audit Runs

`.github/workflows/canon-code-sync-audit.yml` triggers on every PR touching governance surfaces (canon, docs, proposals, writings, wrangler files, top-level Markdown, and the workflow itself). For each PR, the workflow:

1. Verifies `ANTHROPIC_API_KEY` is set as a repo secret.
2. Builds a Managed Agent (`claude-sonnet-4-6`, oddkit MCP at `https://oddkit.klappy.dev/mcp` with `permission_policy.always_allow`, `agent_toolset_20260401`) configured with the foundation system prompt from the managed-agents skill plus the AMS auditor role.
3. Dispatches the audit task with PR context (number, head SHA, base ref, repo coordinates, ephemeral `GITHUB_TOKEN` for clone + comment).
4. Polls the Anthropic API for completion (~10 minute ceiling).
5. Reads the agent's final message; parses the verdict marker (`<<<VERDICT: PASS>>>` / `<<<VERDICT: FAIL>>>`) on its own line.
6. Exits 0 on PASS, 1 on FAIL. The agent itself posts the structured findings as a PR comment with its own credentials — the workflow does not parse and re-post.

The agent's task scope and reporting shape are specified in the workflow's inline system prompt. The model, the MCP server, and the toolset reference are stable; the task scope evolves as canon evolves, since the agent fetches canon at runtime via `oddkit_get` rather than reading hardcoded copies.

## What This Forbids in AMS

In conformance with the upstream rule, this repo will not ship:

- A regex/AST/lint script that audits AMS canon prose against repo state and gates merge on its own findings.
- A Tier-2 constraint that prescribes such a script as the authoritative validation mechanism.
- A "Layer 2 — bot prompt" advisory pattern where the agent is positioned as supplementary commentary while a mechanical Layer 1 actually gates merge. The agent is the gate.
- Author-format requirements (e.g., requiring canon edits to use `**NEW** \`path\`` markers) imposed to make the audit mechanical. Canon shape is governed by `klappy://canon/meta/writing-canon`, not by what a parser can scan for.

The earlier shape (PR #63, retired in this PR) demonstrated each of these forbidden patterns. The retirement is recorded in this PR's commit history and in the §Worked Anti-Pattern section of the upstream constraint.

## What This Does Not Forbid

Mechanical CI checks for genuinely structural concerns continue to run as gates of their own:

- Build success (`tsc --strict --noUncheckedIndexedAccess`)
- Test pass
- Frontmatter schema validation (if added in the future)
- TypeScript type checks
- Lint of code style

These do not require LLM-grade judgment and are explicitly out of scope for this constraint per the upstream rule's §What This Does Not Forbid.

## Relationship to Other Canon

- `klappy://canon/constraints/audit-gates-are-managed-agents` — the Tier-1 upstream constraint this adopts. Substantive reasoning lives there; this doc is the AMS-specific surface map.
- `klappy://canon/methods/governance-validation-via-agents` — how the agent is configured and dispatched. The workflow follows this method.
- `klappy://canon/methods/reference-integrity-audit` — sibling method for cross-reference integrity audits in canon corpora.
- `klappy://canon/principles/vodka-architecture` — the principle this operationalizes. Governance fetched at runtime, not hardcoded in the launcher.
- `ams://canon/constraints/wrapper-stays-cheap` — example of an AMS canon claim the agent must compare against `mcp.ts` line count and structure on every PR that touches the wrapper.
- `ams://canon/decisions/D0026-two-worker-topology-ams-substrate-tincan-ui-layer` — example of a canon doc whose §Dependency Direction claim must continue to match the actual `wrangler.toml` deployment shape.

## See Also

- `.github/workflows/canon-code-sync-audit.yml` — the workflow that runs the gate.
- `klappy://canon/constraints/audit-gates-are-managed-agents` — the upstream rule.
- `journal/` — the supersession evidence trail the agent walks for handoff/writing audits.
