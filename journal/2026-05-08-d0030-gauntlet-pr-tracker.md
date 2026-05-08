# D0030 Gauntlet PR — Step Tracker

This is the live scratchpad updated as each gauntlet step lands. Every step is its own commit on this branch so the PR body reflects observable progress, not narration.

## Plan

Three artifacts in this PR:

1. **D0030 canon decision** — extend D0029's magic-link-as-credential auth path to `ams_send` and `ams_recv`; prescribe SessionDO self-rehydration; explicitly retire D0029's non-extension rationale with empirical evidence.
2. **Journal entry** (DOLCHEO+ TSV) — record the empirical verification that overruled D0029's rationale, the architectural shape of the fix, and the handoff to the next-session implementation against `worker/src/mcp.ts`.
3. **Bootstrap-content patch** — update `canon/constraints/portal-bootstrap-content.md` so ChatGPT-class MCP consumers are instructed to call `ams_join({ magic_link, stream_name })` immediately before any `ams_send` / `ams_recv` burst. This is the no-code workaround that unblocks ChatGPT today against the shipped wrapper.

`worker/src/mcp.ts` implementation is **deferred** to the next session — that is P0002 step-4 scope, sized for fresh context.

## Gauntlet Steps

- [x] Step 0 — orient (oddkit_orient against the plan)
- [ ] Step 1 — challenge (oddkit_challenge at canon-tier-1 mode for D0030's claims)
- [ ] Step 2 — author the journal entry
- [ ] Step 3 — author D0030
- [ ] Step 4 — author the bootstrap-content patch
- [ ] Step 5 — audit (manual URI integrity sweep across the new files; oddkit_audit)
- [ ] Step 6 — validate (oddkit_validate against the artifacts)
- [ ] Step 7 — final PR description sweep

## Verification baseline

- Repo HEAD at branch creation: `cefef3a60fee82267f8583c088993d9292f5f1d9` (the same commit the operator's empirical verification used).
- Operator-confirmed empirical signals (this session, prior turn):
  - `ams_join({ magic_link, stream_name: "chatgpt", self_subscribe: false })` returns `{ ok: true, conversation_id, stream_id, stream_name, peer }`.
  - Subsequent `ams_send` and `ams_recv` fail with `Authorization bearer required for ams_{send,recv}`.
  - Live `worker/src/mcp.ts` confirms: `ams_join` writes synthesized account + prebind into `this.props`; `ams_send` / `ams_recv` schemas do not accept `magic_link`; no binding token is issued; `wireWs` and `joined` are also instance-volatile.
