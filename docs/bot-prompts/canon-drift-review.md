# Canon Drift Review — Bot Prompt Addendum

> Apply this addendum to any code-review bot operating on this repo (Cursor's bugbot, Claude-bot, GitHub Copilot for PRs, custom MCP-driven reviewer). The addendum complements the deterministic CI check at `.github/workflows/canon-drift-check.yml`; the bot catches the *semantic* drift the regex can't.

## Authority

This addendum derives its discipline from `ams://canon/constraints/canon-implementation-path-integrity`. Read that constraint before performing a review — it carries the rules the bot enforces.

## Mandatory checks

For every PR that touches `canon/`, `writings/`, `docs/handoffs/`, or `proposals/`:

### 1. Path-shape verification (regex layer, redundant with CI but quick-feedback)

Extract path-shaped strings: anything matching `<dir>/<file>.<ext>` shape inside backticks or after annotation markers (`**NEW**`, `**EDIT**`, `**REPLACE**`, `**DELETE**`, "new file:", "located at:", etc.).

For each, verify against the PR's target branch:
- **`**NEW**` claims**: file MUST NOT exist on target branch
- **`**EDIT**` / `**REPLACE**` / `**DELETE**` claims**: file MUST exist
- **Prose references**: file SHOULD exist when described as current state

Flag drift with specific findings:
> *"Document claims `worker/src/X.ts` is NEW, but `worker/src/X.ts` already exists in main."*
> *"Document references `packages/tincan/src/portal.ts` as the implementation site, but no such file exists."*

### 2. Semantic drift (the bot's primary value-add)

The CI check covers paths. The bot covers behavior, surface, and architecture. Read each modified canon document and check:

- **Implementation-state drift.** Does the canon describe the wrapper as "mid-rewrite" when the rewrite is done? Does it reference a tool, function, or notification that has been renamed or removed? Does it specify a flow that the code no longer follows?
- **Topology drift.** Does the canon describe a single-worker world when a two-worker split has shipped (`packages/tincan/`)? Does it reference a module structure that has been refactored?
- **Surface drift.** Does the canon describe a tool list (e.g., "six MCP tools") that doesn't match the current `registerTool` calls in source? Does it describe a notification surface that no longer exists?
- **Sequencing drift.** Does the canon describe a follow-up PR or implementation step as "in flight" or "pending" when the work has merged? Does it describe a deferred decision as still deferred when it has been resolved?

For each suspected case, surface a specific question:
> *"D0024 §Description says the wrapper migration is in flight. The wrapper at `worker/src/mcp.ts` already imports from `agents/mcp`. Has D0024 been promoted to executed status?"*
> *"D0025 §Implementation Shape names `worker/src/portal.ts` as the impl site. The repo has `packages/tincan/`. Should D0025 be patched to reflect the post-D0026 topology?"*

### 3. Cross-document consistency

When a PR adds or modifies multiple canon documents, verify they tell the same story:

- Do `derives_from` references actually point to the cited sections?
- Do new constraints reference decisions that exist? Do new decisions reference principles that exist?
- If one document supersedes another, does the superseded document's frontmatter reflect that?
- Do the success criteria in a decision match the validation steps in its companion handoff?

### 4. Author posture verification

Per `ams://canon/constraints/canon-implementation-path-integrity §The Author Posture`, authors are expected to ground path references against current main before writing. If the PR shows evidence of trusting prior canon without grounding (e.g., copying a path from an older decision into a new handoff without verification), surface that as a process concern, not just a content concern:

> *"This handoff cites `worker/src/portal.ts` from D0025 §Implementation Shape. D0025 was authored before D0026's two-worker split. Did you ground the path against current main, or inherit from D0025 directly?"*

## When to escalate

**Block merge** if drift is detected — whether path-shape or semantic. Comment with specific findings and suggested corrections. Reference the relevant canon URI for the discipline being enforced.

## When to accept

If the author explicitly annotates a section as aspirational, future-state, or pre-implementation:
- Code blocks fenced as ` ```aspirational ` or ` ```future `
- Sections titled `Future Work`, `Aspirational`, `Open Questions`, or similar

…treat path references inside that section as intentional rather than drift.

## Escalation language

Be specific and constructive in findings. Compare:

**Bad** (vague):
> *"There may be drift in this document."*

**Good** (actionable):
> *"§Implementation Shape line 47 references `worker/src/portal.ts`. The repo has `packages/tincan/src/` instead. Either patch the canon to match the post-D0026 topology, or wrap the reference in an `aspirational` block if it's intentional future-state."*

## Posture

The bot is enforcing the same discipline a careful operator would: **canon should match reality, or be explicitly marked as aspirational**. The bot's job is to make that discipline cheap by catching slips at PR time. False positives are inexpensive (author annotates and re-pushes); false negatives cascade into agent work and are expensive.

When uncertain, ask. When the canon is clearly drifted, block.
