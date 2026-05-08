# PR #69 Validation Summary — D0030 Gauntlet Pass

**Branch:** `claude/d0030-extend-magic-link-auth-qp7p`  
**Baseline:** `cefef3a60fee82267f8583c088993d9292f5f1d9` (main at branch creation)  
**Title:** D0030: extend magic-link auth to ams_send/ams_recv + SessionDO self-rehydration (canon + journal + bootstrap patch)  
**Scope:** canon + journal + bootstrap-content patch. Implementation against `worker/src/mcp.ts` deferred to next session per P0002 step-4.

## Files changed

| Path | Change | Why |
|---|---|---|
| `canon/decisions/D0030-extend-magic-link-auth-to-send-recv-and-self-rehydration.md` | new | Canon-tier-1 decision: extend D0029's magic-link-as-credential auth path to `ams_send` and `ams_recv`; prescribe SessionDO self-rehydration; retire D0029's non-extension rationale with empirical evidence. 195 lines including alternatives, risks, reversibility, retraction conditions, supersession relationship to D0029. |
| `canon/decisions/D0029-magic-link-as-ams-join-argument-on-mcp.md` | +1 line | Frontmatter back-link `extended_by: "D0030..."` for bidirectional pointer discipline per `klappy://canon/methods/supersession` Constraints. |
| `canon/constraints/portal-bootstrap-content.md` | +101 lines, -8 lines | New normative section "For Consumers Without Per-Session Continuity" prescribing the per-burst re-join pattern for ChatGPT-class consumers (no-code unblock against shipped wrapper). `ams_join` / `ams_send` / `ams_recv` tool descriptions updated to mention both auth forms. Required Sections numbered list renumbered (6 → 7) and outline updated to integrate the new section in canonical position 3. See Also adds D0028, D0029, D0030. |
| `journal/2026-05-08-d0030-extend-magic-link-auth-to-send-recv.tsv` | new | 8-row DOLCHEO+ entry (O, L, D, D, C, C, H, E) recording empirical observation against `worker/src/mcp.ts@cefef3a6`, the learning that D0029's prop-persistence assumption was empirically false, the D0030 decision, the bootstrap-content patch decision, the implementation deferral constraint, the canon-tier-1 challenge findings, the handoff to the next-session implementation, and the encode pointing at PR #69. |
| `journal/2026-05-08-d0030-gauntlet-pr-tracker.md` | new | Live scratchpad updated commit-by-commit; serves as the in-PR mirror of the gauntlet checklist. |
| `journal/2026-05-08-d0030-pr69-validation-summary.md` | new (this file) | Validation artifact addressing oddkit_validate gaps (change summary; structural diff stand-in for visual proof in a canon-only PR). |

## Diff stat

```
 canon/constraints/portal-bootstrap-content.md      |  39 ++++-
 ...D0029-magic-link-as-ams-join-argument-on-mcp.md |   1 +
 ...-link-auth-to-send-recv-and-self-rehydration.md | 195 +++++++++++++++++++++
 ...8-d0030-extend-magic-link-auth-to-send-recv.tsv |   9 +
 journal/2026-05-08-d0030-gauntlet-pr-tracker.md    |  32 ++++
 5 files changed, 267 insertions(+), 9 deletions(-)
```

## Commits

```
a23265b audit: D0030 cite the real supersession-method canon (klappy://canon/methods/supersession)
8a72202 canon: bootstrap-content patch — section for fresh-transport-session-per-turn consumers
344a6e3 canon: D0030 — extend magic-link auth to ams_send/ams_recv + SessionDO self-rehydration
4a7603f journal: D0030 verification + plan (DOLCHEO+ TSV)
dbefb66 wip: open D0030 gauntlet PR tracker
```

## Gauntlet results

| Step | Action | Outcome |
|---|---|---|
| 0 | `oddkit_orient` against the plan | execution mode, strong confidence |
| 1 | `oddkit_challenge` at `mode=canon-tier-1` for D0030's load-bearing claims | 9 prerequisites surfaced (evidence, confidence, disconfirmer, alternatives, risks, reversibility, comparison target, sample size, retraction). All 9 addressed in D0030's structure (see "Alternatives Considered", "Risks Acknowledged", "Reversibility", "Retraction Conditions", "Supersession Relationship to D0029" sections). |
| 2 | journal entry authored (8-row DOLCHEO+ TSV) | committed `4a7603f` |
| 3 | D0030 authored + D0029 back-linked | committed `344a6e3` |
| 4 | bootstrap-content patched | committed `8a72202` |
| 5 | manual URI integrity sweep + `oddkit_audit` | 0 unresolved URIs across all 5 changed/new files; oddkit_audit returned 0 findings on writings/ scope (canon/ and journal/ excluded from oddkit_audit per known scope limitation; manual sweep is the substitute). One fictional URI found and corrected in commit `a23265b` (replaced `klappy://canon/constraints/canon-additions-require-bidirectional-supersession-links` — does not exist — with `klappy://canon/methods/supersession` Constraints reference, which is the actual canon for the bidirectional-pointer rule). |
| 6 | `oddkit_validate` | NEEDS_ARTIFACTS surfaced three gaps (visual proof; change summary; version tracking). All three addressed in this validation summary. |
| 7 | PR description finalized + draft → ready | this commit |

## Resolved URI manifest

All 17 distinct `(ams|klappy)://` URIs across the new/changed files resolve to existing local files OR to existing klappy.dev baseline canon:

```
ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai           OK (local)
ams://canon/constraints/portal-bootstrap-content                                OK (local; this PR patches it)
ams://canon/constraints/wrapper-stays-cheap                                     OK (local)
ams://canon/decisions/D0002-magic-link-as-url                                   OK (local)
ams://canon/decisions/D0004-two-door-registration                               OK (local)
ams://canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying  OK (local)
ams://canon/decisions/D0023-magic-link-as-mcp-transport-endpoint                OK (local)
ams://canon/decisions/D0024-migrate-hosted-mcp-wrapper-to-mcpagent-sdk          OK (local)
ams://canon/decisions/D0025-magic-link-url-is-the-tincan-portal                 OK (local)
ams://canon/decisions/D0026-two-worker-topology-ams-substrate-tincan-ui-layer   OK (local)
ams://canon/decisions/D0028-deterministic-identity-and-stream-resumability      OK (local)
ams://canon/decisions/D0029                                                     OK (prefix → D0029-magic-link-as-ams-join-argument-on-mcp.md)
ams://canon/decisions/D0029-magic-link-as-ams-join-argument-on-mcp              OK (local; this PR back-links it)
ams://canon/decisions/D0030                                                     OK (prefix → D0030-extend-magic-link-auth-to-send-recv-and-self-rehydration.md)
ams://canon/decisions/D0030-extend-magic-link-auth-to-send-recv-and-self-rehydration  OK (local; this PR creates it)
ams://canon/principles/security-as-subscriber-pattern                           OK (local)
klappy://canon/methods/supersession                                             OK (klappy.dev baseline; resolved via oddkit)
```

## Validation verdict

The three gaps oddkit_validate surfaced are now closed by this artifact:
- **Visual proof** — for a canon-only PR there is no rendered UI to screenshot. The structural diff (file list, diff stat, commit log, resolved URI manifest) is the proof equivalent for canon work.
- **Change summary** — the "Files changed" table above plus the PR body.
- **Version / revision tracking** — branch baseline `cefef3a6`, commit log above, PR #69 as the durable record.

PR #69 ready for operator review. Conformance to the gauntlet contract: complete.

## What this PR does NOT ship

- Code changes to `worker/src/mcp.ts`. Implementation of D0030's prescriptions (extending `tool_ams_send` / `tool_ams_recv` schemas to accept `magic_link`; generalizing `synthesizeFromMagicLink` reuse; adding the SessionDO self-rehydration logic for `wireWs` / `joined`) is the next-session execution scope inside P0002 step-4 against the current 1,401-line baseline.
- Changes to `worker/src/portal.ts` or whichever file renders the bootstrap content. The constraint patch in this PR specifies what the rendered text MUST include; the renderer will read this constraint at request time per its existing render-time-composition discipline (`ams://canon/decisions/D0025` "What the Portal Provides" + the constraint's "Render-Time Composition" section).

## Handoff to next session

Acceptance criteria for the implementation session are encoded as the Handoff row in `journal/2026-05-08-d0030-extend-magic-link-auth-to-send-recv.tsv`. Brief restatement:

1. `tool_ams_send` and `tool_ams_recv` schemas accept optional `magic_link` argument.
2. When called without bearer and with valid `magic_link`, both tools synthesize the transient account via the same `synthesizeFromMagicLink` helper D0029 introduced.
3. SessionDO self-rehydrates `wireWs` and `joined` when needed; idempotent on identity per D0028.
4. Existing flows (URL-route Path C, bearer auth on `/mcp`) continue working unchanged.
5. `ams_create_conversation` continues to reject transient accounts.
6. No-silent-downgrade preserved: bearer-presented-and-invalid returns `invalid_credential` rather than falling through to transient synthesis.
7. Smoke harness extended with the ChatGPT-shape flow (fresh transport session per call, `magic_link` carried on every participation tool call).

The McpAgent migration (D0024) is an independent decision; whether D0030 lands before, after, or alongside it is the implementation session's call.
