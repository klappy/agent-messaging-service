---
uri: ams://canon/constraints/canon-code-sync-via-spawned-agent-session
title: "Canon-Code Sync Is Audited by a Spawned Agent Session, Not a Script"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "constraint", "governance", "audit", "spawned-agent-sessions", "vodka-architecture", "ci"]
epoch: E0008.5
date: 2026-05-07
derives_from: "klappy://canon/constraints/audit-gates-are-spawned-agent-sessions, klappy://canon/methods/governance-validation-via-agents, klappy://canon/methods/reference-integrity-audit, klappy://canon/methods/spawned-agent-session-substrate-options, ams://canon/constraints/wrapper-stays-cheap"
governs: "The merge gate that audits canon ↔ code ↔ deployed-config coherence in klappy/agent-messaging-service. Specifies which surfaces AMS expects the audit to cover and points at the workflow that dispatches the gate."
status: active
---

# Canon-Code Sync Is Audited by a Spawned Agent Session, Not a Script

> AMS canon, the TypeScript implementation, and the `wrangler.toml` deployment configs drift against each other unless something audits them at PR time. The audit's gate is a spawned agent session dispatched per `.github/workflows/canon-code-sync-audit.yml`, in conformance with `klappy://canon/constraints/audit-gates-are-spawned-agent-sessions`. Mechanical scripts do not gate this audit. They never have to in this repo, and they never will. The substrate that hosts the session is implementation, not governance, and may evolve independently of this constraint per `klappy://canon/methods/spawned-agent-session-substrate-options`.

## Summary — AMS Adopts the Upstream Rule

This is a thin adoption pointer. The substantive constraint is upstream:

- **Authoritative governance:** `klappy://canon/constraints/audit-gates-are-spawned-agent-sessions` (Tier-1, klappy.dev). Read it. The rule, the binding conditions, the migration path, the retraction conditions, and the worked anti-pattern that motivated it (this very repo's earlier PR #63) all live there.
- **Method specifications:** `klappy://canon/methods/governance-validation-via-agents` (how the session is configured) and `klappy://canon/methods/reference-integrity-audit` (sibling method) — both Tier-1, klappy.dev.
- **Substrate landscape:** `klappy://canon/methods/spawned-agent-session-substrate-options` (Tier-1, klappy.dev) catalogues current substrate options (Anthropic Managed Agents, Cloudflare Sandboxes with various harnesses, self-hosted) with cost shapes and vendor lock surfaces. AMS picks one substrate per the §Current Implementation section below; the choice is project-level and substitutable.
- **What this AMS-side constraint adds:** the project-specific drift surfaces the gate is expected to cover, a stable pointer to the workflow that runs it, and a record of the current substrate choice.

## The Drift Surfaces in AMS

The spawned agent session audits these surfaces in priority order:

1. **Canon ↔ deployment config.** Does anything in `canon/` contradict the actual contents of `packages/*/wrangler.toml` or `worker/wrangler.toml` on the PR branch? Concrete example from this repo's history: D0026 §Dependency Direction once asserted *"no service binding required for v1"* while `packages/tincan/wrangler.toml` shipped `[[services]] binding = "AMS"` in the same merge. Mechanical scripts cannot catch this — there is no path token to scan for. A session reading both files together catches it in one pass.
2. **Canon ↔ code.** Does any constraint, decision, or charter description still match the TypeScript in `worker/src/` or `packages/*/src/`? When `mcp.ts` grows, does `wrapper-stays-cheap` still describe what's there? When a new wrapper class lands, did the canon constraint list update?
3. **Cross-canon coherence.** Do docs added or edited in this PR contradict adjacent canon already on main? The session uses `oddkit_search` to find sibling constraints/decisions for each touched concept and compares claims.
4. **Handoff and writing supersession.** Does any handoff in `docs/handoffs/` or proposal in `proposals/` recommend an approach the project has since superseded? Evidence of supersession lives in `journal/` entries and in newer canon. Concrete example: the portal-and-ride-along handoff originally recommended fetching `https://raw.githubusercontent.com/...` for canon prose; PR #64 superseded that with the oddkit MCP client. The handoff doc carries a `STATUS (2026-05-07)` header acknowledging the deviation. The session verifies that pattern continues to hold for new supersessions.
5. **Supersession chain integrity.** If a new doc claims to supersede an older one, does the older doc carry the matching `superseded_by` frontmatter? If not, the chain is broken and the audit flags it.

## How the Audit Runs

The audit is split between a thin GitHub Actions trigger and a Python dispatcher; neither encodes audit logic. The dispatcher constructs and supervises the spawned agent session. The session fetches canon at runtime and emits its verdict as structured JSON.

- **`.github/workflows/canon-code-sync-audit.yml`** — the trigger and comment-poster. ~120 lines. Fires on every PR touching governance surfaces (canon, docs, proposals, writings, wrangler files, TypeScript under `worker/` and `packages/`, top-level Markdown, the dispatcher, and the workflow itself). Verifies the substrate's auth secret, runs the dispatcher, posts the session's `comment_body` to the PR using the runner's own `GITHUB_TOKEN` (which never leaves the runner), and exits on the session's verdict.
- **`tools/audit-via-agent.py`** — the dispatcher. Spawns the agent session on the configured substrate, configured with the foundation system prompt from the operating contract plus the AMS auditor role. Creates the session, dispatches the audit task with PR coordinates, and watches the session's events stream for a terminal sentinel — a fenced JSON block in the agent's final message.
- **Output contract.** The session's final message is a single fenced `json` block with shape `{"verdict": "PASS"|"FAIL", "summary": "<one-line>", "comment_body_b64": "<base64(UTF-8 markdown), no whitespace>"}`. The base64 encoding sidesteps JSON-string-escape failures on markdown that contains double-quotes (a common shape when the session quotes canon prose verbatim). The dispatcher decodes the base64 and prints `{verdict, comment_body, summary, session_id, agent_id, duration_s}` JSON to stdout. The workflow then extracts `comment_body` with `jq` and posts it verbatim. The legacy `comment_body` field (raw markdown inline) is still accepted for backward compatibility, but `comment_body_b64` is what the system prompt instructs the session to produce.
- **Fail-closed defaults.** If the session's JSON is malformed or missing, the dispatcher emits `verdict: FAIL` with a diagnostic comment naming the session ID. If the session reaches terminal status without emitting the contract'd JSON, the dispatcher fails closed rather than waiting out the full timeout. If the dispatcher itself fails before producing a verdict (network, API, timeout, account-level error like exhausted credits), it emits `verdict: ERROR`. In every case the gate fails; the silent green pre-incident is the failure mode this guards against.

The session's task scope and reporting shape are specified in the dispatcher's system prompt. The substrate, model, and toolset reference are configured in the §Current Implementation section below; the task scope evolves as canon evolves, since the session fetches canon at runtime via `oddkit_get` rather than reading hardcoded copies.

## Current Implementation (Substitutable per Project Decision)

This section records AMS's current substrate choice and dispatcher configuration. It is **not** governance; it is an operating note. Substrate switches do not require canon edits to this constraint — only updates to this section.

The audit gate is in transition between two substrates as of 2026-05-12. Both currently run; the workflow dispatches the Managed Agents path, and the runtime path is callable as a side-by-side probe via `/audit-gate-test` on `ams.klappy.dev`. The transition is staged per `AUDIT-GATE-RUNTIME-MIGRATION-PLAN.md`; this section will collapse to the runtime path once parity is observed across 2–3 real PRs.

### Production gate (currently dispatched by the workflow)

- **Substrate**: Anthropic Managed Agents (public beta, `managed-agents-2026-04-01` beta header).
- **Model**: `claude-sonnet-4-6` for the audit task (review-shaped per `klappy://canon/methods/governance-validation-via-agents`).
- **Toolset**: `agent_toolset_20260401` (bash, file ops, web fetch).
- **MCP**: oddkit at `https://oddkit.klappy.dev/mcp` with `permission_policy.always_allow` for canon read access.
- **Environment**: reusable cloud environment per the managed-agents skill.
- **Dispatcher**: `tools/audit-via-agent.py`.

### Runtime gate under side-by-side test (Phase 3 of the migration plan)

- **Substrate**: Cloudflare Durable Object (`AuditGateDO` in `worker/src/runtime/audit-gate.ts`) calling the Anthropic Messages API at `https://api.anthropic.com/v1/messages` directly.
- **Beta header**: `anthropic-beta: mcp-client-2025-11-20` (native MCP connector; previous version `mcp-client-2025-04-04` is deprecated).
- **Model**: `claude-sonnet-4-6` for the audit task (matches the production gate's model; the substrate is what's changing, not the model).
- **Toolset**: tools surface comes through the native MCP connector — `mcp_servers` and `tools: [{type: mcp_toolset, mcp_server_name: oddkit}]` together expose oddkit's tools to the agent. No separate substrate toolset.
- **MCP**: oddkit at `https://oddkit.klappy.dev/mcp` wired via the persona's `mcp_servers.operational: [oddkit]` declaration. The runtime resolves the short name `oddkit` to the URL through a substrate-side allow-list.
- **Persona profile**: `ams://canon/personas/ams-canon-code-auditor`. Resolved at runtime via `oddkit_get` per `klappy://canon/principles/cache-fetches-and-parses` (content-hash-keyed cache in DO storage).
- **Environment**: one DO instance per audit invocation, keyed by PR `head_sha` for the fresh-context guarantee per `klappy://canon/methods/spawned-agent-session-runtime-contract` §Composition Rules (`session_type=one_shot`). DO hibernates after the verdict returns.
- **Trigger surface**: `POST /audit-gate-test` on `ams.klappy.dev`, guarded by `Authorization: Bearer $AMS_AUDIT_GATE_TEST_SECRET`. The endpoint is the Phase 2/3 PoC surface; the Phase 4 cutover collapses to `/audit-gate` and the workflow swaps dispatchers in one place.

A substrate switch (for example to Cloudflare Sandboxes with a Claude Code or OpenCode harness, motivated by cost shape, multi-vendor portability, or security posture) is a project-level decision recorded in an AMS D-decision. The substrate change updates this section; it does not require amending the upstream Tier-1 constraint or the AMS-side governance.

## What This Forbids in AMS

In conformance with the upstream rule, this repo will not ship:

- A regex/AST/lint script that audits AMS canon prose against repo state and gates merge on its own findings.
- A Tier-2 constraint that prescribes such a script as the authoritative validation mechanism.
- A "Layer 2 — bot prompt" advisory pattern where the agent session is positioned as supplementary commentary while a mechanical Layer 1 actually gates merge. The agent session is the gate.
- Author-format requirements (e.g., requiring canon edits to use `**NEW** \`path\`` markers) imposed to make the audit mechanical. Canon shape is governed by `klappy://canon/meta/writing-canon`, not by what a parser can scan for.
- Hardcoding a specific vendor substrate as the canonical requirement. The §Current Implementation section names AMS's current choice; the constraint above remains substrate-agnostic.

The earlier shape (PR #63, retired in PR #65) demonstrated each of the first four forbidden patterns. The retirement is recorded in PR #65's commit history and in the §Worked Anti-Pattern section of the upstream constraint.

## What This Does Not Forbid

Mechanical CI checks for genuinely structural concerns continue to run as gates of their own:

- Build success (`tsc --strict --noUncheckedIndexedAccess`)
- Test pass
- Frontmatter schema validation (if added in the future)
- TypeScript type checks
- Lint of code style

These do not require LLM-grade judgment and are explicitly out of scope for this constraint per the upstream rule's §What This Does Not Forbid.

## Naming History

This constraint was originally drafted under the name "Canon-Code Sync Is Audited by a Managed Agent, Not a Script" and shipped on 2026-05-07 as `ams://canon/constraints/canon-code-sync-via-managed-agent`. The name treated Anthropic's Managed Agents product (the substrate AMS happened to be using) as if it were the abstract requirement. The upstream Tier-1 was renamed on 2026-05-09 to remove the same vendor-lock smell; this AMS adoption pointer follows.

The rename is not a supersession of a stable constraint; it is a delayed correction to the original review, with the substantive arguments unchanged.

## Relationship to Other Canon

- `klappy://canon/constraints/audit-gates-are-spawned-agent-sessions` — the Tier-1 upstream constraint this adopts. Substantive reasoning lives there; this doc is the AMS-specific surface map.
- `klappy://canon/methods/governance-validation-via-agents` — how the session is configured and dispatched. The workflow follows this method.
- `klappy://canon/methods/spawned-agent-session-substrate-options` — substrate landscape and cost shapes. AMS's choice is recorded in §Current Implementation above.
- `klappy://canon/methods/reference-integrity-audit` — sibling method for cross-reference integrity audits in canon corpora.
- `klappy://canon/principles/vodka-architecture` — the principle this operationalizes. Governance fetched at runtime, not hardcoded in the launcher.
- `ams://canon/constraints/wrapper-stays-cheap` — example of an AMS canon claim the session must compare against `mcp.ts` line count and structure on every PR that touches the wrapper.
- `ams://canon/decisions/D0026-two-worker-topology-ams-substrate-tincan-ui-layer` — example of a canon doc whose §Dependency Direction claim must continue to match the actual `wrangler.toml` deployment shape.

## See Also

- `tools/audit-via-agent.py` — the dispatcher (spawns the agent session, supervises it, parses the JSON output).
- `.github/workflows/canon-code-sync-audit.yml` — the trigger and comment-poster.
- `klappy://canon/constraints/audit-gates-are-spawned-agent-sessions` — the upstream rule.
- `klappy://canon/methods/spawned-agent-session-substrate-options` — substrate options catalog.
- `journal/` — the supersession evidence trail the session walks for handoff/writing audits.
