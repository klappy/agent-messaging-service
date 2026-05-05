---
uri: ams://canon/decisions/D0024-migrate-hosted-mcp-wrapper-to-mcpagent-sdk
title: "D0024 — Migrate the Hosted MCP Wrapper from Handroll to Cloudflare agents/mcp McpAgent"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "decision", "mcp", "edge-wrapper", "sdk", "borrow-before-build", "handroll-debt", "rewrite", "vodka-architecture"]
epoch: E0008.5
date: 2026-05-05
derives_from: "ams://canon/constraints/mcp-build-side-governance §'Not retroactive' clause (the binding rule that grants the existing handroll grandfathered status until 'the rewrite ships as its own decision' — this decision IS that one); ams://canon/decisions/D0023-magic-link-as-mcp-transport-endpoint (the surface contracts the rewrite must preserve); ams://canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying (the SessionDO keying the rewrite must preserve); ams://canon/decisions/D0006-dream-house-wire-edge-wrappers (the wrapper-tier commitment); ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai (the surface conformance the rewrite must continue to satisfy); ams://canon/constraints/wrapper-stays-cheap (the discipline the SDK adoption strengthens); journal/2026-05-03-day3-mcp-sdk-migration.tsv (the empirical authority — bug-class elimination evidence from the stdio migration); journal/2026-05-05-mcp-handroll-recurrence-canon-fix.tsv (the recurrence record that authored the constraint); journal/2026-05-05-pr34-mcp-handroll-recurrence-amendment.tsv (the seventh-recurrence record this decision unblocks); klappy://docs/promotions/P0002-borrow-evaluation-before-implementation (the agent-binding generalization)."
complements: "ams://canon/constraints/mcp-build-side-governance (this is the decision that constraint's 'Not retroactive' clause names as the unblocking artifact)"
governs: "The implementation substrate of the hosted Worker /mcp endpoint and the magic-link MCP transport route added in D0023. The migration shape, the surface preservation contract, the acceptance gate, and the rollback plan."
status: active
---

# D0024 — Migrate the Hosted MCP Wrapper from Handroll to Cloudflare agents/mcp McpAgent

> The hosted /mcp wrapper and the magic-link MCP transport route ship today as ~1100 lines of handrolled JSON-RPC dispatch, Streamable HTTP framing, capabilities negotiation, and session resolution. `ams://canon/constraints/mcp-build-side-governance` grandfathered this handroll only until "the rewrite ships as its own decision." This is that decision. The rewrite uses Cloudflare's `agents/mcp` package (`McpAgent` class) and `@modelcontextprotocol/sdk` — every protocol-layer concern delegates to the SDK; AMS-specific code shrinks to translation between the SDK's request handler signature and AMS wire frames. Surface contracts established in D0023 are preserved exactly; D0019 SessionDO keying is preserved exactly; PROTOCOL.md wire frames are unchanged. The Bootstrap Test from D0023 §"The Bootstrap Test" is the acceptance gate.

## Description

Two PRs merged on 2026-05-04 (#33 D0023 canon, #34 D0023 worker code) shipped a working but handrolled MCP wrapper at `/mcp` and a magic-link MCP transport route. PR #34's review surfaced four bug-bot fixes — all session-resolution and transport-layer edge cases — and the homepage's `GET /mcp` SSE leg subsequently exhibited a `session_not_attached` failure the SDK would handle by construction.

The day-3 stdio migration on 2026-05-03 had already established the empirical authority: migrating `examples/two-agents/mcp-server.mjs` from handroll to `@modelcontextprotocol/sdk` v1.29 eliminated four of five Cursor-BugBot-identified structural bug classes by construction (framing, request handler typing, notification dispatch, session lifecycle). The journal Constraint row from that migration named the next-shipping wrapper's substrate explicitly: *"The hosted /mcp endpoint (SessionDO) — when it lands — uses Cloudflare `agents/mcp` McpAgent, NOT a port of this stdio server."* That sentence is the proximate authority for both `mcp-build-side-governance` (the canon constraint authored 2026-05-05) and this decision (which schedules its execution against the existing handroll).

The decision binds the rewrite shape: single PR, complete substrate replacement, surface-preserving. No parallel route at `/mcp-v2`, no progressive migration, no flag-gated cohort. The handroll is replaced atomically because every affordance the handroll provides has an SDK equivalent and split surfaces would create a new debt class (which-substrate-resolves-which-call routing).

## Outline

- The Required Substrate
- The Surface Preservation Contract
- The Migration Shape
- The Acceptance Gate
- Alternatives Considered
- Risks and Failure Modes
- Comparative Positioning
- Success Criteria
- The Rollback Plan
- What This Forecloses
- What This Is Not
- Reversibility
- See Also

---

## The Required Substrate

Per `mcp-build-side-governance`'s authoritative table, the hosted Worker wrapper at `/mcp` uses Cloudflare's `agents/mcp` package (the `McpAgent` class). For shared types, transport primitives, and version constants, the rewrite imports from `@modelcontextprotocol/sdk` directly when the `agents` package re-export is insufficient.

The required dependencies, added to `worker/package.json`:

- `agents` (Cloudflare's package; `agents/mcp` namespace exports `McpAgent`)
- `@modelcontextprotocol/sdk` v1.29 or higher (for SDK types and helpers `agents/mcp` does not re-export)
- `zod` (peer dependency of the SDK for tool input schemas)

The handrolled `JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcNotification` interfaces in `worker/src/mcp.ts` are deleted; replaced by SDK-exported types. The hardcoded `MCP_PROTOCOL_VERSION = "2025-06-18"` literal is deleted; the SDK declares the version it implements. The handrolled `handleInitialize`, `handlePromptsList`, `handlePromptsGet`, `handleResourcesList`, `handleResourcesRead`, `handleToolsList`, `handleToolsCall` dispatch is deleted; replaced by `McpAgent` subclass methods (`agent.prompt(...)`, `agent.resource(...)`, `agent.tool(...)`).

The handrolled session encoding (`mcps_<rand>.<b64url(account_id)>.<b64url(do_name)>`) is replaced by the SDK's session model. The D0019 keying property `(account_id, conversation_id) → SessionDO` is preserved by passing the keying tuple as construction context to the McpAgent subclass; the SDK's session id encoding is opaque to AMS.

## The Surface Preservation Contract

Every surface D0023 added remains observable from the outside, byte-equivalent where the protocol allows and semantically equivalent where it does not. The rewrite is a substrate replacement, not a feature change.

**MCP-spec surfaces preserved:**

- `initialize` returns the same `instructions` field (canon-derived static block + opaque pass-through of `metadata.instructions`); the SDK's protocol-version field replaces the hardcoded `"2025-06-18"`.
- `prompts/list` and `prompts/get` continue to read from conversation `metadata.prompts` and serve verbatim.
- `resources/list` and `resources/read` continue to expose the four resources from D0023 §"The MCP Surface Additions" (snapshot, peers, protocol pointer, conventions pointer).
- `tools/list` continues to expose the four shipped tools (`ams_create_conversation`, `ams_join`, `ams_send`, `ams_recv`).

**AMS-specific surfaces preserved:**

- `notifications/ams/token`, `notifications/ams/stream_metadata` — non-standard MCP method names; emitted via the SDK's `Protocol.notification(...)` escape hatch (exact pattern from the day-3 stdio migration: `server.server.notification(...)`).
- `ams_join` with zero arguments on the magic-link route (the prebind property from D0023). The McpAgent subclass receives the prebind tuple at construction; the `ams_join` tool's input schema accepts `magic_link?` (optional) and resolves from prebind when omitted.

**Routing preserved:**

- `POST /mcp` continues to handle the canonical MCP transport.
- `POST {magic_link}` continues to handle the prebound MCP transport per D0023.
- `GET {magic_link}` with `Accept: text/html` continues to return the tincan UI per D0012.
- `GET {magic_link}` with `Accept: text/event-stream` continues to handle the SSE notification leg (this is the path where the handroll fails today; the SDK fixes it).
- `DELETE {magic_link}` and `DELETE /mcp` continue to handle session termination.

The route handler in `worker/src/index.ts` is rewritten to delegate transport handling to the SDK's HTTP transport adapter, with the prebind tuple threaded as transport context. The handrolled prebind threading through OPTIONS/SSE-GET/DELETE (the four bug-bot fixes from PR #34) becomes a single transport configuration.

## The Migration Shape

**Single PR, atomic substrate replacement.** The PR replaces `worker/src/mcp.ts` entirely (or splits it into `worker/src/mcp/agent.ts` + `worker/src/mcp/transport.ts` if the SDK's idiomatic structure suggests it). The PR modifies `worker/src/index.ts` to delegate route handling. The PR modifies `worker/package.json` and `worker/package-lock.json` to add the SDK dependencies.

**Build by Claude Code with a short prompt.** The prompt is included in this decision's body (see the PR opening D0024). The prompt references this decision as the spec, the existing `worker/src/mcp.ts` as the surface contract to preserve, the four canon constraints (`mcp-build-side-governance`, `mcp-wrapper-conformance-for-conversational-ai`, `wrapper-stays-cheap`, `wire-conformance`), and the Bootstrap Test as the acceptance gate.

**No parallel route.** The PR does not introduce `/mcp-v2` or any flag-gated migration path. Both `/mcp` and the magic-link routes switch substrates atomically when the PR merges and deploys. This is correct because:

- The MCP surface is the contract; consumers depend on the surface, not the substrate.
- Parallel substrates would create a routing decision (which substrate handles which call) that becomes its own debt class.
- The deploy is reversible in production via Cloudflare's per-version rollback (see "The Rollback Plan").

**No deprecation period for the handrolled session id format.** The handrolled session ids (`mcps_<rand>.<b64url(...)>.<b64url(...)>`) are not portable to the SDK's session model. Any in-flight session at deploy time will fail with a session-not-found and the consumer reconnects per MCP transport semantics. This is acceptable because session lifetimes are short (the handroll has no documented session persistence beyond the active transport).

## The Acceptance Gate

The Bootstrap Test from `D0023` §"The Bootstrap Test" is the primary acceptance gate. Specifically:

A fresh Claude.ai session with no project instructions, given only a magic link minted from the homepage with `metadata.instructions` set, must be able to:

1. POST `initialize` to the magic link URL and receive a 200 with `instructions` containing the canon-derived static block followed by the operator-set verbatim text.
2. Call `prompts/list`, `resources/list` (these MAY be empty if the operator did not set them — the surface MUST be present and well-formed).
3. Call `ams_join` with zero arguments and receive a 200 with `structuredContent.ok = true` and a populated `stream_id`.
4. Call `ams_send` and receive a 200 acknowledgment.
5. Either consume `notifications/ams/token` via SSE from `GET {magic_link}` OR poll via `ams_recv` and receive peer tokens.
6. The operator typing into the tincan UI sees the assistant's emission and can reply.

The test is run after deploy, against production. If any step fails, the rewrite is rolled back per "The Rollback Plan" and the PR re-opens for fixes.

**Secondary gates:**

- `worker/src/mcp.ts` and `worker/src/index.ts` together contain zero `interface JsonRpc` declarations and zero hardcoded `"2025-06-18"` protocol version literals (grep verifies).
- `worker/package.json` declares `agents` and `@modelcontextprotocol/sdk` as runtime dependencies.
- The four PR #34 bug-bot fixes are either retired (their fix code deleted because the SDK eliminates the bug class) or explicitly marked "still needed at the SDK boundary" with a comment naming the SDK call site.
- The homepage `GET /mcp` SSE leg returns 200 and streams `notifications/ams/*` events when a peer emits to the bound conversation.

## Alternatives Considered

Four alternatives weighed before settling on atomic single-PR substrate replacement:

1. **Parallel route at `/mcp-v2`, deprecate `/mcp` over time.** Lets consumers migrate at their pace. Rejected because (a) AMS has no stable consumer cohort yet; the deprecation timeline is artificial; (b) split-substrate routing is its own debt class; (c) the SDK adoption is the win, not an A/B test.

2. **Progressive migration: SDK-back the SSE GET leg first (fixes the immediate bug), keep handroll for POST.** Smaller blast radius. Rejected because the SDK's strength is uniform protocol handling — half-SDK + half-handroll loses most of the bug-class-elimination win and creates a worse codebase to maintain than either pure option.

3. **Flag-gated cohort: SDK for new conversations, handroll for existing.** Maximum reversibility. Rejected because session state lives in the SessionDO (D0019 keying), not in the wrapper. The flag would have to be set per Cloudflare deployment, which is the same as the atomic deploy this decision proposes — without the rollback simplicity.

4. **Postpone: keep patching the handroll until consumer count grows enough to justify the migration.** Status quo. Rejected because `mcp-build-side-governance` already binds new modifications, the operator-attention cost has been paid six times across six projects, and the seventh recurrence (PR #34) just happened. The constraint exists precisely to prevent further postponement.

## Risks and Failure Modes

Five risks named explicitly with retraction conditions:

1. **SDK behavior diverges from handroll in ways that break consumers.** The handroll's exact response shapes are observable (e.g. `mcp-session-id` header format); the SDK may format them differently. **Mitigation:** the Bootstrap Test verifies end-to-end consumer-observable behavior; if it passes, response-shape-equivalence is sufficient. **Retraction condition:** if a consumer's existing integration breaks because of an SDK-vs-handroll surface difference the Bootstrap Test missed, file a follow-up PR adding a wire-equivalence test for that surface.

2. **The SDK requires a Durable Object inheritance hierarchy that conflicts with the existing SessionDO topology (POC-INFRA §4).** If `McpAgent` requires extending a base class that conflicts with how SessionDO is wired into AMS today. **Mitigation:** the rewrite inspects `agents/mcp`'s `McpAgent` constructor and topology requirements during planning; if a conflict exists, the decision is amended with a justified-handroll exception per `mcp-build-side-governance` §"The Justified-Handroll Escape Hatch" (criterion: opinionated stack imposition). **Retraction condition:** Claude Code's preflight reading of the SDK source surfaces an irreconcilable topology conflict; this decision is amended with the named justification before any code is written.

3. **The SDK does not expose extension points for AMS-specific notifications (`notifications/ams/token`, `notifications/ams/stream_metadata`).** The SDK might only emit standard MCP notifications. **Mitigation:** the day-3 stdio migration documented the escape hatch (`server.server.notification(...)`); the same pattern applies to `McpAgent`'s underlying `Server` instance. **Retraction condition:** if the escape hatch does not exist on `McpAgent`, the rewrite uses `@modelcontextprotocol/sdk` directly without the `agents/mcp` wrapper, applying the same SDK-first principle one layer down.

4. **The SDK's session model breaks D0019 keying.** D0019 commits to `(account_id, conversation_id)` as the SessionDO key, surviving across MCP transport sessions. The SDK may key sessions by transport id alone. **Mitigation:** the McpAgent subclass receives `(account_id, conversation_id)` as construction context and uses it for SessionDO addressing; the SDK's session id is internal to the transport. The two layers don't interfere. **Retraction condition:** if `McpAgent` cannot accept construction context (e.g. only accepts an environment binding), the rewrite uses `@modelcontextprotocol/sdk` directly.

5. **Deploy-time session loss harms an active consumer.** Any in-flight handrolled session at deploy time fails with session-not-found. **Mitigation:** session lifetimes are short; reconnect is part of MCP transport semantics; deploy at low-traffic time. **Retraction condition:** if a long-lived session pattern emerges between this decision and the deploy, schedule a maintenance window.

## Comparative Positioning

The closest prior art in this repo is the **day-3 stdio migration** (`journal/2026-05-03-day3-mcp-sdk-migration.tsv`). That migration's empirical findings are this decision's load-bearing evidence: SDK eliminated four of five bug classes by construction; the fifth became a single try/catch. This decision applies the same pattern at the Worker tier instead of the Node stdio tier.

The closest prior art outside this repo is **Cloudflare's published `agents/mcp` examples** (the `McpAgent` documentation and reference implementations). The rewrite is canonical use of the package; AMS-specific code is in the McpAgent subclass body and the route delegation in `index.ts`.

The handroll D0024 retires has a documented six-project recurrence pattern across `klappy/aquifer-mcp`, `klappy/oddkit`, and four others enumerated in `klappy://docs/promotions/P0002-borrow-evaluation-before-implementation`. This decision is the AMS-local execution of the upstream P0002 promotion; the binding form has different scope (this is canon-active for AMS; P0002 is canon-pending in klappy.dev).

## Success Criteria

The decision is implemented correctly when:

1. **Bootstrap Test (primary):** D0023 §"The Bootstrap Test" passes against the new implementation, with the additional requirement that the magic link is minted from the homepage UI (not curl) with `metadata.instructions` set via the textarea (Slice 0, PR #36).
2. **Substrate replacement complete:** zero handrolled JSON-RPC interfaces, zero hardcoded protocol version literals, `agents` and `@modelcontextprotocol/sdk` in `worker/package.json`.
3. **Bug-bot fixes audit:** the four PR #34 bug-bot commits' fix code is either deleted (SDK eliminates the bug class) or accompanied by a comment naming the SDK call site that requires the boundary handling.
4. **SSE leg works:** `GET {magic_link}` with `Accept: text/event-stream` returns 200 and streams notifications. The homepage's "SSE error · Load failed" frame disappears.
5. **No wire change:** `PROTOCOL.md` `wire-conformance` test suite passes unchanged. The Conversation DO source diff for this work is empty.
6. **Surface preserved:** every JSON-RPC method that worked before the rewrite continues to return semantically equivalent responses. (Byte-equivalence is not required where MCP allows variation.)
7. **Backward-compatible routing:** existing `POST /mcp` callers using `ams_join({ magic_link })` continue to work unchanged. Existing `POST {magic_link}` callers continue to work with zero-arg `ams_join`.

## The Rollback Plan

If the Bootstrap Test fails post-deploy, or if a previously-working consumer integration breaks:

1. **Immediate**: Cloudflare per-version rollback via `wrangler rollback` or the Workers dashboard. The previous version (the handrolled implementation that's running today) is one click away. Time-to-rollback target: under 5 minutes.
2. **Investigation**: open a GitHub issue against the rewrite PR with the failure mode, run a fresh Bootstrap Test, identify the surface delta.
3. **Fix-forward or revert-and-amend:** if the failure is a small surface fix, fix-forward in a new PR. If the failure indicates a structural problem with the SDK adoption (e.g. one of the named risks fires), revert to the handroll, amend this decision with the named justification per `mcp-build-side-governance` §"The Justified-Handroll Escape Hatch", and re-plan.

The rollback path is the reason the migration is atomic single-PR rather than progressive: a single deploy is a single rollback boundary.

## What This Forecloses

- The handrolled MCP implementation cannot be modified again. From the moment the rewrite PR opens, the handroll is in retirement; any bug-bot fix or feature request against the handroll is rejected with reference to this decision.
- The four PR #34 bug-bot fixes' specific code patterns (prebind threading through OPTIONS/SSE-GET/DELETE, augmented session header context, DELETE forwarding) are not preserved as patterns. The SDK's transport handles these uniformly; the patterns become artifacts of the obsolete substrate.
- The MCP wrapper's source code count cannot grow before the rewrite. New MCP affordances (additional tools, additional resources) wait for the SDK substrate.

## What This Is Not

- **Not a feature change.** The rewrite preserves every D0023 surface; new features (`ams_set_metadata`, `ams_leave`, additional prompts) are out of scope.
- **Not a wire-tier change.** PROTOCOL.md, the Conversation DO, and the wire frames are unchanged.
- **Not a homepage change.** Slice 4 (the homepage two-section split) runs in parallel with this work; the homepage's interaction with `/mcp` is unchanged in terms of interface, only fixed in terms of behavior.
- **Not a permanent commitment to `agents/mcp` specifically.** If Cloudflare deprecates `agents/mcp` or the MCP SDK landscape shifts, `mcp-build-side-governance` covers the substrate selection going forward. This decision binds the current substrate; future migrations can supersede it via standard canon revision.

## Reversibility

**Two-way at the deploy boundary, one-way at the source-code boundary.** Cloudflare's per-version rollback makes the deploy reversible in under 5 minutes. The source code reversal is harder — once the handroll is deleted, restoring it from git is technically possible but creates a third source-of-truth (handroll vs SDK vs reverted handroll); the better path post-rollback is fix-forward or amend-this-decision, not source-code revert.

The decision itself is reversible via canon revision if the SDK proves to be a net negative for AMS over time, named in `mcp-build-side-governance` §"Risks, Tensions, and Reversibility" Risk 1.

## See Also

- `ams://canon/constraints/mcp-build-side-governance` — the binding constraint this decision unblocks the "Not retroactive" clause for
- `ams://canon/decisions/D0023-magic-link-as-mcp-transport-endpoint` — the surface contracts the rewrite preserves
- `ams://canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying` — the SessionDO keying the rewrite preserves
- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` — the wrapper-tier commitment
- `ams://canon/decisions/D0012-browser-is-an-mcp-runtime` — the precedent for "runtime impedance is wrapper-tier"
- `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai` — the surface conformance the rewrite continues to satisfy
- `ams://canon/constraints/wrapper-stays-cheap` — the discipline the SDK adoption strengthens
- `ams://canon/constraints/wire-conformance` — the wire contracts unchanged by this work
- `journal/2026-05-03-day3-mcp-sdk-migration.tsv` — the empirical authority (bug-class elimination)
- `journal/2026-05-05-mcp-handroll-recurrence-canon-fix.tsv` — the recurrence record that authored the constraint
- `journal/2026-05-05-pr34-mcp-handroll-recurrence-amendment.tsv` — the seventh-recurrence record this decision unblocks
- `klappy://docs/promotions/P0002-borrow-evaluation-before-implementation` — the upstream agent-binding generalization
- Cloudflare `agents/mcp` documentation — the canonical SDK reference
- `@modelcontextprotocol/sdk` v1.29+ — the protocol-level SDK

---

## Appendix: Claude Code Build Prompt

Paste the following prompt into Claude Code in the `~/agent-messaging-service` working directory after this PR merges:

```
Implement the worker rewrite specified in canon/decisions/D0024-migrate-hosted-mcp-wrapper-to-mcpagent-sdk.md.

Read first (in this order):
- canon/decisions/D0024-migrate-hosted-mcp-wrapper-to-mcpagent-sdk.md  (the spec)
- canon/constraints/mcp-build-side-governance.md  (why we're doing this)
- canon/decisions/D0023-magic-link-as-mcp-transport-endpoint.md  (the surfaces to preserve)
- canon/constraints/mcp-wrapper-conformance-for-conversational-ai.md  (the surface conformance)
- canon/constraints/wrapper-stays-cheap.md  (the discipline)
- canon/constraints/wire-conformance.md  (the wire contracts not to touch)
- canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying.md  (the SessionDO keying to preserve)
- worker/src/mcp.ts  (the handroll being replaced — read for the surface contract, not the implementation)
- worker/src/index.ts  (the route delegation to rewrite)

Build:
1. Add `agents` and `@modelcontextprotocol/sdk` (v1.29+) and `zod` to worker/package.json.
2. Replace worker/src/mcp.ts with a McpAgent subclass implementation. Delete the
   handrolled JsonRpc interfaces, the hardcoded "2025-06-18" version literal, and
   the handrolled handleInitialize/handlePromptsList/handlePromptsGet/
   handleResourcesList/handleResourcesRead/handleToolsList/handleToolsCall dispatch.
3. AMS-specific notifications (notifications/ams/token, notifications/ams/stream_metadata)
   use the SDK's escape hatch: `agent.server.notification(...)` per the day-3 stdio
   migration pattern.
4. Update worker/src/index.ts to delegate transport handling to the SDK's HTTP transport
   adapter. Pass the prebind tuple (ns, alias, permissive) as transport context for the
   magic-link route. The SDK handles OPTIONS/GET-SSE/DELETE uniformly; the four PR #34
   bug-bot fix patterns become a single transport configuration.
5. SessionDO keying per D0019 is preserved by passing (account_id, conversation_id) as
   McpAgent construction context. The SDK's mcp-session-id is internal to the transport.

Constraints to honor:
- mcp-build-side-governance: NO new handrolled JSON-RPC framing, dispatch, or capabilities
  negotiation. If the SDK doesn't expose what you need, use the documented escape hatch.
  If the escape hatch doesn't exist, STOP and surface a justified-handroll proposal with
  P0002 criterion before writing the code.
- wrapper-stays-cheap: translation only. Opaque carriage of all payloads.
- wire-conformance: zero changes to PROTOCOL.md, the Conversation DO, or wire frames.
- D0023 surface preservation contract: every method, route, and field in D0024
  §"The Surface Preservation Contract" must remain semantically equivalent.

Acceptance gate (Bootstrap Test, primary success criterion in D0024 §"The Acceptance Gate"):
A fresh Claude.ai session with no project instructions, given only a magic link minted
from the HOMEPAGE UI (not curl) with metadata.instructions set via the Slice 0 textarea,
must be able to call initialize, read instructions including operator pass-through,
optionally prompts/get, ams_join with zero args, ams_send, ams_recv, and emit a token
that reaches the operator's tincan UI within 60 seconds. The homepage GET /mcp SSE leg
must return 200 and stream notifications without the "session_not_attached" error.

Secondary gates per D0024 §"The Acceptance Gate":
- worker/src/mcp.ts and worker/src/index.ts together contain zero `interface JsonRpc`
  declarations (grep verifies).
- worker/src/mcp.ts contains zero hardcoded "2025-06-18" protocol version literals
  (grep verifies).
- worker/package.json declares `agents` and `@modelcontextprotocol/sdk` as runtime deps.
- The four PR #34 bug-bot fix patterns are either deleted or comment-annotated with the
  SDK call site they correspond to.

Open the PR as a separate code-only PR (per the canon/code separation rule).
Title prefix: "worker: D0024 — ..."  Reference D0024 and PRs #36, #37 in the body.

Do not edit canon. Do not edit the journal. Those go through their own PRs.
Do not touch worker/src/homepage.ts (Slice 4 owns homepage).
```

The prompt is verbatim — copy and paste, no editing required.
