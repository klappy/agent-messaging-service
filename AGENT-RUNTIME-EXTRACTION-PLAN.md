# Agent-Runtime Extraction Plan

**Status:** planning closed, awaiting execution session
**Revision:** v1 (initial)
**Mode authored under:** planning
**Date:** 2026-05-14
**Author session partners:** klappy, claude-opus-4-7
**Supersedes:** `AUDIT-GATE-RUNTIME-MIGRATION-PLAN.md` (stale; references retired `worker/src/runtime/audit-gate.ts` path) — that doc is to be revised in the AMS post-extraction PR per §6 below

## Change Summary

v1 (initial) — Plans the extraction of `packages/agent-runtime/` from AMS into the standalone `klappy/agent-runtime` repo. Replaces the AMS-resident audit-gate-migration framing (which placed the runtime inside `worker/src/runtime/audit-gate.ts` on CF Agents SDK + Project Think) with a substrate-stack-aligned L4 extraction. Three operator decisions locked: repo name, repo shape (single hosted Worker), Truthkit positioning (no brand split). Twelve other decisions inferred from canon with named sources. 6B evaluation produces `inspected-and-adopted` for Bide — canon's two-roles trigger condition is met (Oddie + TinCan observer / R2-ESE pipeline). Sequencing: 5 PRs across 2 repos, dependency-ordered, reversible until terminal PR-5.
**Derives from:**
- `klappy://canon/methods/persona-shaped-agent-runtime` (Tier-1, Epoch 9)
- `klappy://canon/methods/spawned-agent-session-runtime-contract` (Tier-2)
- `klappy://canon/methods/dispatch-paths`
- `klappy://canon/methods/trigger-source-taxonomy`
- `klappy://canon/architecture/substrate-stack` (Tier-1)
- `klappy://docs/derivative-works` (graduation precedent)
- `klappy://odd/ledger/2026-05-11-agent-runtime-exploration`
- `klappy://canon/constraints/borrow-evaluation-before-implementation`
- `klappy://canon/constraints/mode-transitions-require-encoded-handoff`
- `klappy://docs/appendices/epoch-9` (substrate becomes the wire)

---

## 1. Problem Statement

Extract the L4 persona-shaped agent runtime — currently `packages/agent-runtime/` in `klappy/agent-messaging-service` via PR #93 — into a standalone canon-governed repository, so the runtime serves the dozen-plus L4 personas, L2 adapters, and L5 applications canon enumerates, without forcing each consumer to fork AMS or wire its own substrate. AMS retains L1 (wire) responsibilities only.

The trigger condition canon set in `klappy://canon/architecture/substrate-stack` §Open Questions has been met: *"Once two roles ship, the shared abstraction becomes the next vodka layer."* Role #1 is Oddie (canon-named L4 role); role #2 is one of TinCan observer, R2/ESE ingest-encoder, or another canon-named persona. PR #93 ships the substrate.

## 2. Operator Decisions (locked)

| ID | Decision | Value |
|----|----------|-------|
| D1 | Repo name | `klappy/agent-runtime` |
| D4 | Repo shape | Single hosted Worker at `runtime.klappy.dev` (matches `oddkit.klappy.dev` derivative-works precedent) |
| D6 | Truthkit positioning | Generic L4 runtime that *can* host Truthkit-derived roles when they materialize; do NOT split runtime by brand at extraction time. D0022 brand cuts remain deferred until two role-level implementations show divergent runtime needs. |

## 3. Inherited Decisions (from canon, not requiring operator input)

| ID | Decision | Inference source |
|----|----------|------------------|
| D2 | Subdomain → `runtime.klappy.dev` | `klappy://docs/derivative-works` precedent |
| D3 | License → same as AMS / klappy.dev (MIT unless operator overrides) | Repo precedent |
| D5 | Persona profiles live in new repo's `canon/personas/` directory; voice canon stays at klappy.dev; profile YAML references voice URI | `klappy://canon/methods/persona-shaped-agent-runtime` §"Where Profiles Live" option 2 |
| D7 | AMS↔Think frame adapter stays AMS-side as Tier-2 constraint; promotes to klappy.dev only if a non-AMS system consumes Think-via-AMS | `klappy://odd/ledger/2026-05-11-agent-runtime-exploration` Bide-cut item 6 |
| D8 | Profile discovery mechanism deferred until second consumer ships | `klappy://canon/methods/persona-shaped-agent-runtime` §Open Questions |
| D9 | Versioning: consumers pin, profile authors emit deprecation notices | Same source |
| D10 | Subscribed-session backpressure policy deferred to TinCan observer first deployment | Same source |
| D11 | CI/CD: Cloudflare Workers Git integration auto-deploys `main`; PR gates use `claude-code-action@v1` per cost-reframe thread | Cost-reframe thread + derivative-works precedent |
| D12 | The journal `2026-05-13-agent-runtime-scaffold.tsv` travels with the code into the new repo | Implementation journals belong with their code |

## 4. The 6B Evaluation Table

For the extraction itself — the act of standing up a new repo and migrating the L4 abstraction. Required per `klappy://canon/constraints/borrow-evaluation-before-implementation`.

| Step | Verdict | Justification |
|------|---------|---------------|
| **Borrow** | `applied` | (a) `klappy://docs/derivative-works` graduation pattern (oddkit, odd, klappy.dev, apocrypha precedents); (b) PR #93's full source tree — substrate (`@anthropic-ai/sdk` v0.96.0), MCP wiring (`agents/mcp` v0.12.3, `@modelcontextprotocol/sdk` v1.29.x), Worker config; (c) klappy.dev canon for runtime abstraction (Tier-1 persona-shaped, Tier-2 runtime-contract, dispatch-paths, trigger-source-taxonomy). |
| **Bend** | `applied` | Three bends: (i) `packages/agent-runtime/src/*` lifts to repo root `src/*`; (ii) `wrangler.toml` Worker name changes to `agent-runtime` with route at `runtime.klappy.dev`; (iii) `canon.ts` knowledge_base_url already substrate-agnostic per commit `692f09b` (drops `ams://` hardcoding) — confirm in execution. |
| **Break** | `none-yet` | No friction observed in the borrowed pieces themselves. Friction will surface when (a) a second consumer hits the Worker (multi-tenancy concerns appear); (b) the persona-profile schema needs extending for a non-Oddie persona; (c) the engagement contract's `assistant` mode is exercised for the first time. None block extraction. |
| **Beget** | `skipped` | Reason: no upstream component is being delegated to a third party. The runtime layer is owned by Klappy; CF Workers and Anthropic SDK are upstream substrates already accounted for in the Borrow row. |
| **Bide** | `inspected-and-adopted` | Inspection target: canon's "wait for two roles to ship" trigger condition (`klappy://canon/architecture/substrate-stack` §Open Questions). Criterion: Oddie = role #1 in canon; TinCan observer or R2/ESE ingest-encoder = role #2 with concrete plans. Both shipped at canon level; PR #93 ships the substrate. Adoption is justified. |
| **Build** | `minimal` | What's built: (a) the new repo skeleton (README, LICENSE, .github/, branch protection); (b) the AMS post-extraction pointer doc; (c) a `canon/personas/oddie.yaml` reference profile in the new repo (canon-defined schema, first concrete instance). Everything else is migration, not new code. |

**Reversibility:** forward = medium (migrating consumers back into AMS would require git-history surgery and consumer rewiring); backward = high (the terminal AMS PR is the one-way door; until it lands, all motion is reversible by reverting individual PRs).

## 5. Canon-Split Register

| Doc | Current location | Destination | Rationale |
|-----|------------------|-------------|-----------|
| `klappy://canon/methods/persona-shaped-agent-runtime` (Tier-1) | klappy.dev | **stays** | Upstream pattern canon |
| `klappy://canon/methods/spawned-agent-session-runtime-contract` (Tier-2) | klappy.dev | **stays** | Upstream pattern canon |
| `klappy://canon/methods/spawned-agent-session-substrate-options` | klappy.dev | **stays** | Upstream pattern canon |
| `klappy://canon/methods/dispatch-paths` | klappy.dev | **stays** | Upstream pattern canon |
| `klappy://canon/methods/trigger-source-taxonomy` | klappy.dev | **stays** | Upstream pattern canon |
| `klappy://canon/architecture/substrate-stack` | klappy.dev | **stays + edit** | Resolve §"L4 runtime abstraction" Open Question — name (`klappy/agent-runtime`) and home (`runtime.klappy.dev`) now decided. Add canonical pointer; update Layer Assignments table. |
| `ams://canon/constraints/canon-code-sync-via-spawned-agent-session` | AMS | **stays** | AMS-specific consumer canon (what the audit checks) |
| `ams://canon/personas/ams-canon-code-auditor` | AMS | **stays** | AMS's persona profile (consumer canon) |
| `ams://canon/personas/ams-output-artifact-validator` | AMS | **stays** | AMS's persona profile |
| `ams://canon/personas/ams-oddkit-gauntlet-runner` | AMS | **stays** | AMS's persona profile |
| `ams://canon/constraints/audit-gate-prompts-follow-oddkit-prompt-pattern` | AMS | **stays** | AMS's adoption of upstream rule |
| `journal/2026-05-13-agent-runtime-scaffold.tsv` | AMS (PR #93 branch) | **moves to new repo** | Implementation journal travels with code |
| `AUDIT-GATE-RUNTIME-MIGRATION-PLAN.md` | AMS root | **revised in place + new deployment doc in runtime repo** | AMS keeps the consumer-side migration plan (revised); runtime repo adds its own README/deployment doc |
| Future `runtime-repo://canon/decisions/D00xx` (e.g., "@anthropic-ai/sdk as substrate", "knowledge_base_url-driven canon resolution") | (new) | **runtime repo** | Implementation-specific canon |
| `canon/personas/oddie.yaml` (first canonical profile) | (new) | **runtime repo** | Concrete profile; references klappy.dev voice canon |

## 6. Sequencing Plan — 5 PRs Across 2 Repos

```
PR-1  [klappy/agent-messaging-service]
      Merge PR #93 to main.
      Effect: locks the consumer-agnostic snapshot of packages/agent-runtime/.
        ↓ gate: PR #93 merged

PR-2  [klappy/agent-runtime] (new repo)
      Initial commit. Source tree exported from packages/agent-runtime/ via
      git filter-repo with history preserved. Adds README, LICENSE, .github/,
      branch protection. Wrangler.toml updated to deploy at runtime.klappy.dev.
      First deploy gated on Cloudflare Workers Git integration.
        ↓ gate: new repo exists; runtime.klappy.dev returns 200 on /v1/health
                (or equivalent shape per existing src/index.ts)

PR-3  [klappy/klappy.dev]
      Resolve klappy://canon/architecture/substrate-stack §"L4 runtime abstraction"
      Open Question. Update Layer Assignments table to point "Oddie the role"
      and "Truthkit-derived roles" rows at klappy/agent-runtime. Add a "See Also"
      entry pointing canon/methods/persona-shaped-agent-runtime at the runtime
      repo as the canonical implementation.
        ↓ gate: canon-only PR; passes oddkit_audit + standard validator gauntlet

PR-4  [klappy/agent-runtime]
      Add canon/personas/oddie.yaml — first concrete profile per the schema in
      klappy://canon/methods/persona-shaped-agent-runtime §"The Persona Profile".
      References klappy://canon/voice/oddie-the-river-guide for voice canon.
      Includes audit, real_time_stream, mentorship, strategic_translation surface
      profiles. Verified by smoke test: runtime.invoke(persona="oddie", ...) resolves.
        ↓ gate: profile resolves successfully via canon.ts

PR-5  [klappy/agent-messaging-service]
      Post-extraction PR. Deletes packages/agent-runtime/ entirely. Adds a
      pointer doc (suggested: replace packages/agent-runtime/ with a README.md
      that points at https://github.com/klappy/agent-runtime). Revises
      AUDIT-GATE-RUNTIME-MIGRATION-PLAN.md to reference runtime.klappy.dev as
      the substrate target. Updates project AGENTS.md / CLAUDE.md if they
      mention the local runtime path.
        ↓ terminal: extraction complete
```

**Critical path:** PR-1 → PR-2 → PR-5. PR-3 (klappy.dev canon update) and PR-4 (Oddie profile) can land in parallel after PR-2.

**Broken-intermediate-state check:** Between PR-2 and PR-5, both AMS (with `packages/agent-runtime/`) and the new repo exist. AMS does not depend on the new repo until PR-5. No broken intermediate state.

**Rollback:** Each PR independently revertible. PR-5 is the one-way door — once AMS deletes its local copy, restoration requires reverting PR-5. Until PR-5 merges, all motion is reversible.

## 7. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| PR #93 keeps evolving; extraction snapshot drifts | Lock at PR #93 merge (PR-1). Post-merge AMS-side changes to runtime code become a deprecation PR in AMS, not extracted. |
| Truthkit launches before runtime stabilizes, forces multi-brand split mid-flight | D6 explicitly defers brand split. If Truthkit needs its own runtime, fork at that point — no work in this extraction locks against that. |
| Cloudflare account / wrangler config delays new-repo deploy | Reuse existing Klappy Cloudflare account; runtime.klappy.dev is just another Worker; minimal new ops. |
| `git filter-repo` history extraction loses commits or breaks blame | Run on a clone first; verify commit count and blame samples before pushing to new repo. Operator override: acceptable to start with shallow history if `filter-repo` proves brittle. |
| New repo's canon goes stale because nobody updates it | oddkit_audit running in CI against `canon/` (matches AMS pattern). |
| Cost-reframe thread concludes audit-gate stays on Worker substrate (contradicting current direction) | Extraction is robust to either outcome — audit-gate is one of many potential consumers, not load-bearing on extraction. |
| First non-Oddie persona profile reveals schema gap | Schema is illustrative per canon §"The Persona Profile"; refinement is expected, not a blocker. Add canon-decision in runtime repo to record the gap. |
| Subscribed session type not yet supported (PR #93 only does one_shot) | TinCan observer deployment will need this; treat as runtime-repo backlog item, not an extraction blocker. |

## 8. Out of Scope / Deferred

- Runtime functional completeness beyond PR #93's surface (responsibilities #5 subscribed sessions, #6 engagement enforcement, #7 parallelism + override, #8 handoff-insufficiency signaling per persona-shaped-agent-runtime §The Runtime's Job)
- Multi-tenant security/auth model — deferred until first non-AMS consumer arrives
- Profile discovery / registry endpoint — deferred per canon
- Subscribed-session backpressure policy — deferred to TinCan
- AMS↔Think frame adapter promotion — stays AMS-side
- Truthkit multi-brand split (D0022) — deferred
- Cost-reframe (audit-gate → GHA + claude-code-action) — handled in separate thread; does not block extraction
- Beyond-Oddie persona profiles (audit-reviewer, docs-writer, research-scout, etc.) — added per consumer demand, not pre-built

## 9. Handoff to Execution Session

The execution session reads:

1. **This plan** — scope, sequencing, decision register, 6B table.
2. **`klappy://canon/architecture/substrate-stack`** — particularly §Open Questions for the resolution wording.
3. **`klappy://canon/methods/persona-shaped-agent-runtime`** §"The Persona Profile" — schema for `canon/personas/oddie.yaml`.
4. **`klappy://canon/constraints/release-validation-gate`** — applies before merging PR-2.
5. **PR #93's final state at merge** — the source of the extraction.
6. **`klappy://canon/constraints/mode-transitions-require-encoded-handoff`** §"Planning → Execution" — minimal handoff content this plan satisfies.

The execution session is **a fresh-context follow-up session**, not a continuation of this one. Per `klappy://canon/principles/verification-requires-fresh-context`, the planner does not implement.

## 10. Definition of Done — Planning

- [x] Problem statement articulated (§1)
- [x] Constraints reviewed (gate input)
- [x] Three repo-shape alternatives weighed (planning conversation §2)
- [x] 6B table complete with reversibility note (§4)
- [x] Decision register lists every fork with status (§2, §3)
- [x] Canon-split per-doc decided (§5)
- [x] Sequencing dependency-ordered with rollback story (§6)
- [x] Risks named with mitigations (§7)
- [x] Out-of-scope explicit (§8)
- [x] Operator confirmed D1, D4, D6 (§2)
- [x] This durable artifact written and surfaced for review

## 11. Open Questions Carried Forward

These are NOT planning-blockers — they belong to the next phase of work and are explicitly named for visibility:

- **What deploys runtime.klappy.dev?** Cloudflare account + DNS record + Workers project. Operator-owned; execution session confirms existence before PR-2.
- **First profile beyond Oddie?** Canon names audit-reviewer, docs-writer, research-scout, release-validator, release-resolver, governance-author, ingest-encoder. None of these block extraction; first one ships when the consumer demands it.
- **AMS pointer-doc location after PR-5.** Likely `packages/agent-runtime/README.md` (file replacing the directory) pointing at the runtime repo, but the exact path is execution-session detail.

---

**Status:** ready for execution session. The extraction is canon-aligned, vodka-disciplined, and reversible at every step until PR-5's merge.
