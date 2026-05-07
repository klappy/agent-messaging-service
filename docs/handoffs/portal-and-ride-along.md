# Handoff — Portal Bootstrap + Ride-Along Implementation

> **STATUS (2026-05-07): Both tasks shipped. Document retained for historical reference.**
>
> - **Task A (`packages/tincan/src/portal.ts` + `bootstrap.ts`)** shipped in PR [#61](https://github.com/klappy/agent-messaging-service/pull/61) and refactored in PR [#64](https://github.com/klappy/agent-messaging-service/pull/64). PR #61 implemented Task A as written below — `raw.githubusercontent.com` fetch + handrolled markdown blockquote extraction + frozen-prose fallback. Operator-flagged brittleness on the merged PR led to PR #64 superseding the fetch mechanism with the **oddkit MCP client** alternative explicitly named in step A1.2 of this document. Six parallel `oddkit_get` tools/calls; section addressing delegated to oddkit; no markdown parser; no frozen prose; 503 on canon-unreachable. Rationale and DOLCHE+H trail in [`journal/2026-05-07-bootstrap-via-oddkit-mcp-rewrite.tsv`](../../journal/2026-05-07-bootstrap-via-oddkit-mcp-rewrite.tsv).
> - **Task B (`worker/src/mcp.ts` ride-along)** shipped in PR #61 as written. `withRideAlong` per `D0027 §Mechanism`, `RIDE_ALONG_BUDGET = 64`, `ams_recv` correctly un-wrapped, two-way-door reversibility intact.
>
> New work in this area should fetch current canon directly via `oddkit_get` per the doc's Posture preface — **not** treat this handoff as authoritative going forward.

---

> **Canon governs this work. This document is a roadmap, not a spec.** When canon and this handoff disagree, canon wins. When the handoff is silent, fetch the relevant canon and let it speak.

PR [#60](https://github.com/klappy/agent-messaging-service/pull/60) merged the canon. Two implementation tasks follow. They are independent — each can ship in its own PR — but they compose to deliver one-prompt magic for AI-agent-to-AI-agent collaboration via magic link.

---

## Posture (read once, hold throughout)

- **Mode discipline.** Declare `exploration → planning → execution → validation` as distinct phases. The canon has answered the design questions; you are mostly in execution. If an unknown forces reversion, name the reversion with one specific question — do not collapse modes.
- **Verify, don't infer.** Empirical evidence for every behavioral claim. Trust nothing that hasn't been observed against a deployed worker.
- **Canon-first.** If implementation surfaces a need canon does not cover, write canon first (or refine existing canon) before code. Same PR is fine; canon section at the top of the diff.
- **Operator approval gate.** Hold PRs for operator review. Do not self-merge. PR #60 was self-merged after explicit operator direction; that is the exception, not the rule.
- **Vodka discipline.** Wire stays unchanged. No new tools. No new wire frames. No new metadata keys. `wrapper-stays-cheap` is the constraint these tasks honor.
- **Prompt over code.** Where canon prescribes text, the code fetches and renders. No hardcoded prose. The portal is a renderer of governance, not a repository of governance.

---

## Canon to load at session start

Fetch each via `oddkit_get` against `https://github.com/klappy/agent-messaging-service`. Re-fetch whenever the implementation surfaces a question.

```
ams://canon/decisions/D0023-magic-link-as-mcp-transport-endpoint
ams://canon/decisions/D0024-migrate-hosted-mcp-wrapper-to-mcpagent-sdk
ams://canon/decisions/D0025-magic-link-url-is-the-tincan-portal
ams://canon/decisions/D0026-two-worker-topology-ams-substrate-tincan-ui-layer
ams://canon/decisions/D0027-inbound-delivery-is-transport-adaptive
ams://canon/constraints/portal-bootstrap-content
ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai
ams://canon/constraints/wrapper-stays-cheap
```

D0025 + portal-bootstrap-content govern Task A. D0027 + the wrapper-conformance constraint govern Task B. The wire conformance and wrapper-stays-cheap apply throughout.

---

## Task A — Refactor `packages/tincan/src/portal.ts`

**Authoritative canon:** `ams://canon/decisions/D0025-magic-link-url-is-the-tincan-portal`, `ams://canon/decisions/D0026-two-worker-topology-ams-substrate-tincan-ui-layer`, `ams://canon/constraints/portal-bootstrap-content`.

> **Reality check:** D0026's two-worker split has shipped. The portal lives in `packages/tincan/src/portal.ts` (499 lines), not in `worker/src/`. TinCan is its own Cloudflare Worker with a service binding to AMS (`env.AMS`). The route `/{ns}/conversations/{alias}` is already dispatched to `portalResponse` by `packages/tincan/src/index.ts`. **This task is a refactor, not a create.**

### Current state (read before designing)

- `packages/tincan/src/portal.ts` exports `portalResponse(p: PortalParams): Response` returning an HTML response.
- It includes a function `buildJoinInstructions(p)` (lines 23-52) that produces the AI-readable bootstrap content as a **hardcoded string in source**. This is the precise violation of `portal-bootstrap-content §Render-Time Composition` that the constraint was written to fix.
- The hardcoded version predates the consent UX and failure-recovery prescriptions — it has no "Required before joining" section, no "If joining doesn't work" section.
- HTML is the only response path; no Accept negotiation.
- Protocol version in the hardcoded instructions is `2024-11-05`; canon uses `2025-03-26`.
- TinCan's `wrangler.toml` declares deployment to `tincan.truthkit.ai` and `tincan.klappy.dev` and a service binding `binding = "AMS"` to the AMS Worker.

### What to do

**Phase A1 — replace hardcoded prose with canon-fetched composition (priority):**

1. Delete `buildJoinInstructions()`. Its content moves to canon — already there in `portal-bootstrap-content`.
2. Add `fetchPortalBootstrapContent(env)` that fetches `https://raw.githubusercontent.com/klappy/agent-messaging-service/main/canon/constraints/portal-bootstrap-content.md` at render time. Cache in-memory for 1 hour (recommended starting freshness budget per the constraint). Acceptable alternative mechanisms: build-time bundled snapshot with a refresh job, or oddkit MCP client embedded in the worker.
3. Add `parsePrescribedSections(constraintMarkdown)` that extracts the prescribed-text sections by markdown heading. The headings to extract: `Prescribed Text — Identity`, `Prescribed Text — How to Join`, `Prescribed Text — Pre-bound Conversation`, `Prescribed Text — Required Before Joining`, `Prescribed Text — If Joining Doesn't Work`, `Prescribed Text — For Humans`. Each section's body is rendered between the heading and the next `## ` heading; strip the leading `## ` heading itself and any "Rationale (not rendered)" subsections (those are commentary in canon, not rendered output).
4. Add `composeAiReadableBootstrap({sections, params})` that substitutes template variables — `{namespace}`, `{alias}`, `{conversation_id}`, `{tincan_url}`, `{operator_metadata_instructions_if_present}` — from `PortalParams` and the conversation record, and concatenates sections in canon order to produce the rendered markdown.
5. Update `portalResponse(p)` to branch on `Accept`:
   - `Accept: text/markdown` or `Accept: text/plain` (or non-browser default) → return the composed markdown directly with `Content-Type: text/markdown; charset=utf-8`.
   - `Accept: application/json` → structure as `{ instructions: <composed markdown>, pre_bound: { namespace, alias, conversation_id, metadata }, post_endpoint: <amsMagicLink>, tincan_url: <magicLink> }`. Return `Content-Type: application/json; charset=utf-8`.
   - `Accept: text/html` (or browser-shaped User-Agent) → existing HTML response, **but** embed the composed markdown rendering as a visible plain-text section adjacent to the conversation UI per `D0025 §What the Portal Provides`.

**Phase A2 — sharpen the HTML portal:** keep the existing chrome but ensure the AI-readable section is visible to a tool that strips JS or renders source. Out of scope for A1 if it overscopes; A1 ships independently.

### What you do NOT need to do

- **Do not create `worker/src/portal.ts`.** It does not exist and should not. The portal lives in TinCan per D0026.
- **Do not edit `worker/src/index.ts`** for routing. The substrate worker no longer handles the magic-link GET path; TinCan does. Verify by reading `worker/src/index.ts` — the magic-link route comment at line ~106 already acknowledges D0026.
- **Do not strip homepage.ts conversation-specific code.** Check whether `worker/src/homepage.ts`'s `homepageResponseForConversation` is still wired anywhere — it likely isn't, given the routing has moved. Confirm before any cleanup.

### Validation for Task A

```bash
# Markdown path
curl -i 'https://tincan.<deploy>/<ns>/conversations/<alias>?t=<token>'
# Expect: 200, Content-Type: text/markdown, body contains all six prescribed sections

# JSON path
curl -i -H 'Accept: application/json' '...'
# Expect: 200, Content-Type: application/json, structured body with instructions field

# HTML path
curl -i -H 'Accept: text/html' '...'
# Expect: 200, Content-Type: text/html, AI-readable section visible adjacent to UI
```

End-to-end: paste the magic link into a fresh Claude.ai session with no project context. Expect: model fetches, summarizes accurately, asks "Connect to this AMS conversation?" before doing anything else, joins on confirmation.

When done: `oddkit_validate` against `ams://canon/constraints/portal-bootstrap-content` with artifact references (deployed URL, transcript).

---

## Task B — Ride-Along Wrapper in `worker/src/mcp.ts`

**Authoritative canon:** `ams://canon/decisions/D0027-inbound-delivery-is-transport-adaptive`, `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai`.

Drain buffered peer frames onto active POST tool-call response streams using the SDK's `extra.sendNotification` primitive, so non-SSE consumers receive inbound transparently.

**File:** **EDIT** `worker/src/mcp.ts`.

**Mechanism (per D0027 §Mechanism):**

```ts
// Conceptual; exact shape lands in implementation.
private static readonly RIDE_ALONG_BUDGET = 64;

private withRideAlong<TArgs, TResult>(
  handler: (args: TArgs, extra: ExtraT) => Promise<TResult>
): (args: TArgs, extra: ExtraT) => Promise<TResult> {
  return async (args, extra) => {
    const result = await handler(args, extra);
    const drain = this.recvBuffer.splice(0, AmsMcpAgent.RIDE_ALONG_BUDGET);
    for (const frame of drain) {
      await extra.sendNotification({
        method: frame.method,
        params: frame.params,
      } as never);
    }
    return result;
  };
}
```

**Apply to three tools, NOT four.** Wrap the registered handlers for `ams_create_conversation`, `ams_join`, and `ams_send`. **Do not wrap `ams_recv`** — it owns the buffer explicitly and a wrapped version would double-drain.

**Symmetry invariants (per D0027 §Echo Filter and Truncation, conformance constraint §The Echo-Filter Recommendation):**

- **Echo filter is applied at buffer-push time, not at drain time.** Verify the current code path that pushes to `recvBuffer` honors the consumer's `self_subscribe` posture. If a self-echo currently enters the buffer when `self_subscribe: false`, that is a bug and should be fixed at the push site, not worked around at the drain site.
- **Truncation surfacing.** When the per-session buffer overflows (current cap is implementation-defined; verify against the conformance constraint's recommended default), the next drain across all three paths must surface truncation. Push and ride-along paths emit a `notifications/ams/truncated` frame; `ams_recv` already surfaces `truncated: true`. Add the truncated-notification emit at the same place the buffer eviction happens, so all three paths inherit it.

### Validation for Task B

The pre-decision empirical we ran earlier:

```bash
# Mint test account
ACCOUNT=$(curl -sS -X POST 'https://ams.<deploy>/v1/accounts' \
  -H 'Content-Type: application/json' \
  --data '{"namespace":"ride-along-validation"}')
BEARER=$(echo "$ACCOUNT" | python3 -c "import sys,json;print(json.load(sys.stdin)['credential'])")

# Initialize
SID=$(curl -sS -D - -X POST 'https://ams.<deploy>/mcp' \
  -H "Authorization: Bearer $BEARER" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"validation","version":"0"}}}' \
  | grep -i '^mcp-session-id:' | awk '{print $2}' | tr -d '\r')

# Skipping the create/join/send/tools-list sequence — see the empirical run earlier in
# canon-tier-2 challenge of D0027. Run the same sequence; expect the tools/list response
# to contain the prior peer's notifications/ams/token frame as an event:message block
# before the result. Pre-change: 1 event:message block; post-change: 2 or more.
```

Other validation:
- A consumer holding the SSE GET leg open sees no behavior change. Test by opening GET `/mcp` with the session ID in a separate connection while making POST tool calls; frames should arrive on the GET leg as before, and ride-along should drain only when the GET leg is absent.
- A consumer calling `ams_recv` immediately after a ride-along drain sees an empty buffer.
- `RIDE_ALONG_BUDGET` cap holds: send more than 64 peer frames in quick succession, observe that the next tool call drains 64 and the remainder stays for the following call.

When done: `oddkit_validate` against `ams://canon/decisions/D0027-inbound-delivery-is-transport-adaptive` with artifact references (the deployed URL, the test transcript showing the 1→2 event-block delta).

---

## Anti-patterns (don't)

- **Don't hardcode prescribed text in `portal.ts`.** Violates `portal-bootstrap-content §Render-Time Composition`. The constraint owns the words; the code fetches and renders.
- **Don't enumerate vendor-specific UI instructions.** The *If Joining Doesn't Work* section is deliberately tool-agnostic. Future canon revisions may sharpen it; do not add per-vendor strings in code.
- **Don't filter self-echoes at drain time.** Violates the conformance constraint's path-symmetry invariant. Filter at buffer-push time so all three delivery paths inherit consistent semantics.
- **Don't wrap `ams_recv` with `withRideAlong`.** It already drains the buffer explicitly; double-drain is incorrect.
- **Don't add new tools or wire frames.** No new MCP methods, no new notification types, no new metadata keys. The frames delivered via ride-along are the existing `notifications/ams/token` and `notifications/ams/stream_metadata`.
- **Don't self-merge.** Hold each implementation PR for operator review.
- **Don't collapse modes.** If validation fails, declare reversion to planning with a specific question; do not silently adjust scope mid-execution.

---

## Sequencing recommendation

Two PRs, in this order:

1. **Task A Phase A1** — portal.ts with markdown + JSON paths. The bigger user-visible win, smaller surface, lower risk. Phase A2 (HTML portal) and A3 (homepage cleanup) can ship as follow-up PRs.
2. **Task B** — ride-along wrapper. Smaller surface, can ship in parallel with A1 or after.

Each PR references the canon URIs it implements in the description. Each PR includes the validation transcript. Each PR holds for operator review.

---

## Open questions for canon refinement

If implementation surfaces these and canon is silent or unclear, write canon first:

- **TinCan URL composition rule.** D0026 mentions the two-worker topology but I do not see a canon doc that specifies how the substrate computes the TinCan URL for the *For Humans* section. If the implementation needs to make a choice (env-var, host substitution, hardcoded host map), capture the decision as a small principle or constraint before coding it.
- **Canon-fetch mechanism for `portal.ts`.** The constraint allows direct fetch / build-time snapshot / oddkit MCP client. The mechanism choice is implementation latitude per the constraint, but a canon principle naming the chosen mechanism (and its freshness budget) would be useful for future portal forks. Capture as a small constraint or principle if you make a non-trivial choice.
- **`RIDE_ALONG_BUDGET` value.** D0027 mentions the cap exists but does not pin a number. Default of 64 is a reasonable starting point; if observed behavior suggests a different value, capture the rationale.

---

## Closing posture

Be ruthless about canon-first. Be honest about what is observed vs. inferred. Hold the operator-review gate. The canon does most of the thinking; the code does the rendering and the routing. When in doubt, fetch canon and let it speak.
