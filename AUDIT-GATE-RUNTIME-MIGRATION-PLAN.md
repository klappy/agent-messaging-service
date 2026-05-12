---
title: "Audit-Gate Runtime Migration Plan"
audience: docs
exposure: nav
tier: 3
voice: neutral
stability: draft
type: plan
tags: ["ams", "plan", "audit-gate", "agent-runtime", "migration", "canon-code-sync", "epoch-8.5"]
epoch: E0008.5
date: 2026-05-12
derives_from: "klappy://canon/methods/persona-shaped-agent-runtime, klappy://canon/methods/spawned-agent-session-runtime-contract, klappy://canon/methods/trigger-source-taxonomy, klappy://canon/methods/dispatch-paths, klappy://canon/methods/spawned-agent-session-substrate-options, ams://canon/constraints/canon-code-sync-via-spawned-agent-session"
governs: "Migration sequence for moving the AMS canon-code-sync audit gate from the current Anthropic Managed Agents substrate to a persona-shaped runtime instance on Cloudflare Durable Objects + Agents SDK + Project Think. Produces the first concrete impl of the runtime contract."
status: draft
---

# Audit-Gate Runtime Migration Plan

> The AMS audit gate currently runs on Anthropic Managed Agents via `tools/audit-via-agent.py`. This plan migrates it to a persona-shaped runtime instance — autonomous-trigger dispatch path, validator role, audit surface, agent engagement — running on Cloudflare Durable Objects with the Agents SDK and Project Think harness. The migration is the first concrete impl of all four canon docs landed this session: persona-shaped-agent-runtime (existing), runtime-contract (existing), trigger-source-taxonomy (PR #198), dispatch-paths (PR #201). The first impl is the proof; canon was scoped to be unblocked by this work, and this work in turn produces the signal that promotes canon from `proposed` to `accepted`.

## What Exists Today

- **`tools/audit-via-agent.py`** — Python dispatcher. Spawns a Managed Agent, hands it the audit task with PR coordinates, watches for a fenced JSON verdict, returns `{verdict, comment_body, summary, session_id, agent_id, duration_s}`.
- **`.github/workflows/canon-code-sync-audit.yml`** — GitHub Actions trigger. Fires on PRs touching governance surfaces. Runs the dispatcher, posts the comment, exits on verdict.
- **`ams://canon/constraints/canon-code-sync-via-spawned-agent-session`** — the canon constraint specifying *what* the audit checks. Substrate-neutral; explicitly says "Substrate switches do not require canon edits."
- **Current substrate**: Anthropic Managed Agents, `claude-sonnet-4-6`, `agent_toolset_20260401`, oddkit MCP, `always_allow` permission policy.

The migration target is to keep the constraint and workflow shape intact while replacing the substrate plumbing with the canon-shaped runtime.

## What the Migration Produces

### A persona profile

`canon/personas/ams-canon-code-auditor.md` (new). Authored against the schema from `klappy://canon/methods/persona-shaped-agent-runtime#the-persona-profile`. Fields:

```yaml
persona: ams-canon-code-auditor
version: 1
system_prompt_uri: ams://canon/constraints/canon-code-sync-via-spawned-agent-session  # the audit task definition
role: validator           # mode-bound: validation; read-only on artifact under test
mcp_servers:
  operational: [oddkit]   # canon read access at runtime
  task_relevant: []       # GitHub access lives in the trigger layer, not the persona
knowledge_bases:
  - klappy://
  - ams://
surface_profiles:
  audit:
    density: medium
    structured_output: required
    output_schema: ams://canon/constraints/canon-code-sync-via-spawned-agent-session#output-contract
brand_discipline: null    # this auditor has no brand voice; output is structured JSON
```

The persona has one surface (audit) and one role (validator). No mode toggles. The output contract is the existing `{verdict, summary, comment_body_b64}` JSON shape.

### A runtime instance

`worker/src/runtime/audit-gate.ts` (new). A Durable Object class implementing the persona-shaped-agent-runtime contract for this one persona. Responsibilities per `klappy://canon/methods/persona-shaped-agent-runtime#the-runtimes-job`:

1. **Resolve profile.** Fetch the persona profile from AMS canon, assemble the system prompt, register the operational MCP set.
2. **Enforce role.** Validator role: read-only tools, fresh-context guarantee (each invocation is a new DO instance keyed by PR SHA), structured deliverable required.
3. **Apply surface post-processing.** Validate output JSON against the schema, base64-decode `comment_body_b64`, return `{verdict, comment_body, summary}` to the trigger.
4. **Honor engagement.** `engagement=agent`: no clarifying questions; stuck sessions terminate with named failures.
5. **Session type**: `one_shot` per audit invocation. The DO spawns, runs the audit, returns, hibernates, eventually dies.

### A trigger wiring

`worker/src/index.ts` adds an `/audit-gate` HTTP endpoint that accepts PR coordinates and dispatches to the DO. Per `klappy://canon/methods/trigger-source-taxonomy`, this is an HTTP webhook trigger with static dispatch resolution — the endpoint config declares the full invocation tuple `(persona=ams-canon-code-auditor, role=validator, surface=audit, engagement=agent)`. The payload becomes the task.

Per `klappy://canon/methods/dispatch-paths`, this is the **autonomous-trigger** path — no assistant in the loop, errors emit to the configured target (the PR comment).

### A revised workflow

`.github/workflows/canon-code-sync-audit.yml` is rewired. Replaces `python3 tools/audit-via-agent.py` with `curl https://ams.klappy.dev/audit-gate -d '{...PR coordinates...}'`. The workflow becomes a thin trigger; the runtime is the substrate. The `ANTHROPIC_API_KEY` secret moves from a GitHub Actions secret to a Worker secret.

### Retirement candidates (kept but unwired)

- `tools/audit-via-agent.py` — kept in the repo as historical artifact + emergency fallback during migration. Marked deprecated in a `STATUS` header.
- Anthropic Managed Agents API access — kept active until the runtime path has accumulated two weeks of green audits on production PRs. Then the secret is rotated and the Managed Agents subscription is reviewed.

## Migration Sequence

Five phases, each producing a merge-ready PR. Each phase is independently revertable.

**Phase 1 — Persona profile authored.** Write `canon/personas/ams-canon-code-auditor.md` referencing the existing canon constraint as the system_prompt_uri. No code changes. PR is canon-only. ~half a day.

**Phase 2 — Runtime DO scaffolded.** Implement `worker/src/runtime/audit-gate.ts` as a Durable Object with the five responsibilities sketched above. Wire it to a local-only test endpoint. No production traffic yet. Includes a wrangler.toml DO binding and durable-object migration. ~2-3 days.

**Phase 3 — Side-by-side validation.** Add an HTTP endpoint `/audit-gate-canary` (separate from `/audit-gate`) that runs the new runtime in parallel with the Managed Agents path. Workflow runs both, compares verdicts, posts only the Managed Agents verdict but logs the canary outcome to a structured table. Run for two weeks across all PRs. ~1 day to wire, two weeks elapsed time.

**Phase 4 — Cutover.** Workflow swaps the dispatch path: `/audit-gate` becomes the runtime endpoint, the Python dispatcher is unwired (but kept). Managed Agents secret stays warm for one more week. ~half a day.

**Phase 5 — Cleanup.** After one week of green runtime audits post-cutover: deprecate `tools/audit-via-agent.py` with a STATUS header, retire the Managed Agents secret, retire the cloud environment. ~half a day. Total elapsed time: ~3-4 weeks; total engineering effort: ~5 days.

## What This Plan Exercises

The first impl exercises (and produces signal on):

- **Persona profile schema** — first AMS-side profile authored. Schema needs additions or not.
- **Validator role enforcement** — read-only tool restriction works structurally.
- **Audit surface** — structured-output requirement enforces JSON schema mechanically.
- **Agent engagement** — autonomous-trigger semantics. No clarifications. Failure modes terminate with named errors.
- **One-shot session type** — DO instance per audit, hibernate between, no subscribed-session machinery needed.
- **Autonomous-trigger dispatch path** — HTTP webhook with static resolution. First end-to-end production wire of the dispatch model.
- **Substrate composition** — DO + Agents SDK + Project Think on Cloudflare. First production composition of the CF Agents Week stack.

What it explicitly does **not** exercise: subscribed sessions (Phase 2 of persona-shaped-agent-runtime deployment per its own §First Worked Examples), multi-role workflows, parallelism, operator override, handoff-insufficiency signaling. Those are deferred to the next two persona impls (Oddie-on-TinCan, multi-role build workflow).

## Open Questions

These are explicit and decided during impl, not resolved up front:

- **MCP authentication.** oddkit MCP currently runs with `always_allow` against Managed Agents. The DO-side wiring may need a different auth model (the MCP runs in a sandboxed isolate; bearer tokens vs request signing TBD).
- **Cold-start latency.** Managed Agents has its own warmup. DOs hibernate; the first audit per PR may see cold-start time. Acceptable threshold: <30s end-to-end. If breached, persistent DO instances per PR-author or per-repo become a fallback.
- **Cost shape on real volume.** Per `klappy://canon/methods/spawned-agent-session-substrate-options#cloudflare-durable-objects-with-the-agents-sdk`, expected substrate runtime is ~$0.0005 per audit + inference. Real volume signal lands in Phase 3 (side-by-side).
- **Persona profile location.** The persona profile lives in `canon/personas/` per persona-shaped-agent-runtime's profile-location option (1) or (2). Picking option (2) — separate canon doc — because option (1) (frontmatter on the voice canon) doesn't apply here (this auditor has no voice canon; it has the constraint doc).

## Confidence and Retraction

**Working belief, zero implementations.** The plan composes canon-named primitives, but none of them has shipped in production yet. The plan's biggest risk is that one of the four pieces of canon being unblocked here — persona-shaped-runtime, runtime-contract, trigger-source-taxonomy, dispatch-paths — has a flaw the impl will surface.

**Retraction conditions:**

- If Phase 2 reveals the persona profile schema is missing fields the audit gate needs (e.g., per-invocation timeout config, retry policy), persona-shaped-agent-runtime gains the field via a follow-up klappy.dev PR, and Phase 2 unblocks.
- If Phase 3's side-by-side run shows the runtime path is materially worse than Managed Agents on either accuracy or latency, the cutover is paused while the gap is diagnosed.
- If Phase 5 cleanup reveals operational dependencies on Managed Agents the plan didn't surface, the substrate is kept warm for an extended window rather than retired hard.

The retraction conditions are loose because the plan is a first impl by design. Concrete signal arrives during execution; the plan is the runway, not the verdict.

## See Also

- [Canon-Code Sync Is Audited by a Spawned Agent Session, Not a Script](ams://canon/constraints/canon-code-sync-via-spawned-agent-session) — what the audit checks (substrate-neutral)
- [Persona-Shaped Agent Runtime](klappy://canon/methods/persona-shaped-agent-runtime) — the runtime contract this plan instantiates
- [Spawned Agent Session Runtime Contract](klappy://canon/methods/spawned-agent-session-runtime-contract) — the per-session spec
- [Trigger-Source Taxonomy](klappy://canon/methods/trigger-source-taxonomy) — the dispatch-routing layer for the HTTP webhook trigger
- [Dispatch Paths](klappy://canon/methods/dispatch-paths) — the autonomous-trigger path this audit gate exemplifies
- [Substrate Options](klappy://canon/methods/spawned-agent-session-substrate-options) — DO + Agents SDK + Project Think section is the substrate fit
