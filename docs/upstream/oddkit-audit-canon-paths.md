# Upstream Tracking — Path-Integrity in `oddkit_audit`

> The AMS-side CI hook + script + bot prompt cover this repo. The discipline is general — every project governed by oddkit faces the same drift problem. This note tracks the upstream change that would absorb the AMS-side script into a first-class oddkit capability.

## Status

Open. AMS ships the local implementation in the immediate term; upstream work is a follow-up.

## What we want from oddkit

`oddkit_audit` currently scans `writings/` for URI integrity (per `klappy://canon/constraints/oddkit-audit-scope`, or equivalent). We want to extend the audit's scope to include canon-side implementation-path integrity:

- **New audit mode:** `canon-implementation-paths` (or extend existing `canon` mode).
- **Scope:** Scans `canon/`, `writings/`, `docs/handoffs/`, `proposals/` (configurable) for path references using the same patterns as the AMS-side script:
  - `**NEW**` / `**EDIT**` / `**REPLACE**` / `**DELETE**` annotations
  - Prose patterns ("new file: `path`", "located at `path`", etc.)
  - Aspirational-block exclusions (`aspirational` and `future` fence languages, named sections)
- **Validation:** Each path is checked against the repo state at the audit-time HEAD. The audit runs in the consumer repo's context — oddkit knows the repo URL from `knowledge_base_url`, and the consumer's worktree provides the ground truth.
- **Output:** Drift findings as part of the audit response, with the same finding shape as URI-integrity findings (file, line, claim, error message).

## Why upstream

Every repo governed by oddkit faces this drift problem:

- `klappy/klappy.dev` itself — canon docs reference each other and reference governance tooling paths.
- Other projects that adopt oddkit governance — they inherit the discipline but lack the tooling unless we build it locally each time.

Solving it once at oddkit:

- Concentrates the implementation in one place.
- Lets governance evolve at the toolchain layer rather than per-project.
- Aligns with prompt-over-code: the path-integrity discipline is canon at klappy.dev; the implementation is rendered by oddkit at audit time.

## How it ties to AMS-side work

The AMS-side artifacts (`scripts/check-canon-drift.py`, `.github/workflows/canon-drift-check.yml`, the bot prompt) are immediate. They run on AMS PRs without depending on upstream changes.

When `oddkit_audit` gains the path-integrity capability, the AMS-side script can be replaced by a thin wrapper that calls `oddkit_audit` with the appropriate mode and the AMS knowledge-base URL. That swap is small, reversible, and net-removes code from this repo.

## Sketch of the upstream change

Conceptually (not a final spec):

```
oddkit_audit({
  mode: "canon-implementation-paths",
  knowledge_base_url: "https://github.com/klappy/agent-messaging-service",
  scope_dirs: ["canon", "writings", "docs/handoffs", "proposals"],
}) →
{
  status: "ok" | "findings",
  findings: [
    { file: "canon/decisions/D0025-...md", line: 42, path: "worker/src/portal.ts", claim: "must_not_exist", error: "..." },
    ...
  ]
}
```

The implementation walks the consumer repo's filesystem (which oddkit already does for URI audits), runs the same regex+annotation logic the AMS-side script uses, and returns findings.

## Action

When the AMS-side implementation has stabilized (a few PRs against this repo, real findings caught, false-positive rate measured), open a discussion or proposal at `klappy/klappy.dev` (or the oddkit repo) to spec the upstream addition. Reference this tracking note and the AMS-side artifacts as the prior art.

## See Also

- `ams://canon/constraints/canon-implementation-path-integrity` — the discipline this would generalize
- `scripts/check-canon-drift.py` — the AMS-side implementation that would become a reference for the upstream version
- `.github/workflows/canon-drift-check.yml` — the AMS-side enforcement
- `docs/bot-prompts/canon-drift-review.md` — the human-review layer (semantic drift) that complements the regex-checkable upstream audit
