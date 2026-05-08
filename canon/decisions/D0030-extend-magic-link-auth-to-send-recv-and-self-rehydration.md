---
uri: ams://canon/decisions/D0030-extend-magic-link-auth-to-send-recv-and-self-rehydration
title: "D0030 — Extend Magic-Link Auth to `ams_send` / `ams_recv`; SessionDO Self-Rehydration"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "decision", "mcp", "magic-link", "auth", "chatgpt", "session-rehydration", "vodka-architecture"]
epoch: E0008.5
date: 2026-05-08
derives_from: "D0029-magic-link-as-ams-join-argument-on-mcp (the predecessor whose 'non-extension' rationale this decision retires with empirical evidence); D0028-deterministic-identity-and-stream-resumability (the deterministic anon account_id + stream_id derivation this generalizes); D0019-cross-session-continuity-via-account-conversation-keying (the SessionDO keying that makes per-call rehydration findable; the canon source for the turn-based-MCP-client transport behavior D0029 failed to integrate); D0023-magic-link-as-mcp-transport-endpoint (Path C, URL-route synthesis); D0004-two-door-registration (the auth model preserved); operator↔Claude verification session 2026-05-08 (the empirical evidence that overruled D0029's non-extension rationale; live worker/src/mcp.ts at commit cefef3a6 confirmed)"
complements: "D0029-magic-link-as-ams-join-argument-on-mcp, D0028-deterministic-identity-and-stream-resumability, D0019-cross-session-continuity-via-account-conversation-keying, D0023-magic-link-as-mcp-transport-endpoint"
governs: "How `ams_send` and `ams_recv` accept magic-link-as-credential authentication when no `Authorization` bearer is presented. The order of checks in `tool_ams_send` and `tool_ams_recv` when an `Authorization` bearer is absent. The SessionDO's self-rehydration semantics when `wireWs` is closed or `joined` is false on an authenticated send/recv arrival. The retirement of D0029's 'non-extension' rationale."
status: active
---

# D0030 — Extend Magic-Link Auth to `ams_send` / `ams_recv`; SessionDO Self-Rehydration

> The magic link is the credential — and it must remain the credential at every participation surface, not just the entry point. ChatGPT-class MCP consumers open a fresh transport session per tool call (per `D0019`); `this.props` mutated during `ams_join` does not survive that. `ams_send` and `ams_recv` accept `magic_link` as an optional argument, mirroring `D0029`'s reorder for `tool_ams_join`. The SessionDO self-rehydrates `wireWs` and `joined` when an authenticated send/recv arrives without them. D0029's "non-extension" rationale is explicitly retired by the empirical evidence below.

## Description

`D0029` extended Path C to the `/mcp` endpoint by accepting `magic_link` as an argument to `tool_ams_join`, synthesizing a transient anonymous account in `this.props` when no bearer was presented. It explicitly declined to extend the same auth path to other tools, on this rationale (quoted directly from D0029's "Why not extend the auth path to all tools, not just `ams_join`?" sub-section):

> Once `ams_join` populates `this.props`, subsequent `ams_send` / `ams_recv` calls in the session pass `requireAccount()` via the same mechanism. Extending the magic-link-argument path to other tools would multiply the auth surface without adding capability. Single point of synthesis preserves clarity.

That rationale assumed `this.props` carry-through across MCP tool calls — i.e., that "in the session" referred to a context that survived from `ams_join` to subsequent `ams_send` / `ams_recv`. **For ChatGPT-class consumers, this assumption is empirically false.** The verification artifact (operator session 2026-05-08, journal entry `journal/2026-05-08-d0030-extend-magic-link-auth-to-send-recv.tsv`) recorded:

- `ams_join({ magic_link, stream_name: "chatgpt", self_subscribe: false })` succeeded, returning concrete identifiers (`conv_01KR2STR424357ANQKWS`, `str_6876b1ad12d5462003a8ab3ad0`).
- The very next `ams_send` call returned `Authorization bearer required for ams_send`.
- `ams_recv` returned `Authorization bearer required for ams_recv`.
- Live `worker/src/mcp.ts` at commit `cefef3a60fee82267f8583c088993d9292f5f1d9` confirmed: D0029's reorder shipped (the synthesized account is correctly written into `this.props`); `tool_ams_send` schema accepts only `{ data }`; `tool_ams_recv` schema accepts only `{ wait_ms }`; no binding token is issued; `wireWs` and `joined` are also instance-volatile per file comments.

The structural reason was already canon when D0029 was authored: `D0019` named explicitly that *"Turn-based MCP clients open a fresh MCP transport session per turn or per process restart."* ChatGPT is one such client. D0029's non-extension stance did not integrate D0019's already-canonized observation.

This decision retires D0029's non-extension rationale and prescribes the consistent auth path across all participation tools, plus the SessionDO self-rehydration semantics required to make that path actually work.

## Outline

- The Three-Part Decision
- Why This Is Not "Multiplying the Auth Surface"
- The SessionDO Self-Rehydration Contract
- Alternatives Considered
- Constraints Preserved
- Risks Acknowledged
- Reversibility
- Retraction Conditions
- Consequences
- Supersession Relationship to D0029
- See Also

---

## The Three-Part Decision

### Part 1 — `ams_send` and `ams_recv` accept `magic_link` as optional argument

The schemas of `tool_ams_send` and `tool_ams_recv` add `magic_link` as an optional string property, mirroring `D0029`'s reorder for `tool_ams_join`. The order of checks in each tool reorders to validate `args.magic_link` before refusing on missing bearer. Pseudocode (matches `D0029`'s shape):

```
async tool_ams_send(args, prebind) {
  let account = await this.requireAccount();

  if (!account && !prebind && typeof args.magic_link === "string") {
    const synthesized = await synthesizeFromMagicLink(this.env, args.magic_link);
    if ("error" in synthesized) return mcpToolError(synthesized.error);
    this.props = {
      ...this.props,
      account_id: synthesized.account_id,
      account_namespace: synthesized.namespace,
      account_is_transient: true,
    };
    account = await this.requireAccount();
    prebind = synthesized.prebind;
  }

  if (!account) return mcpToolError({ error: "invalid_credential", message: "..." });

  // Existing send path (now possibly into a self-rehydrating SessionDO; see Part 3).
  ...
}
```

Identical structure for `tool_ams_recv`. The `synthesizeFromMagicLink` helper introduced by D0029 is reused, not duplicated. The synthesized `account_id` is deterministic per `D0028` (`deriveAnonId(env.AMS_PERMISSIVE_TOKEN_PEPPER, parsed.permissive)`), so the resulting SessionDO key `(account_id, conversation_id)` is stable across MCP transport sessions per `D0019`.

### Part 2 — SessionDO self-rehydrates `wireWs` and `joined` when needed

Validating the magic link and locating the SessionDO does not, by itself, give `ams_send` and `ams_recv` a usable session — the SessionDO instance fields `wireWs` (the WebSocket to the wire) and `joined` (whether the wire-level subscription is established) are also volatile. Per the live source comments at commit `cefef3a6`, `wireWs` is re-dialed on first `ams_join` and not persisted.

When `ams_send` or `ams_recv` arrives at a SessionDO that has authenticated identity (from Part 1's synthesis or from a held bearer) but observes `joined === false` or `wireWs` is closed, the SessionDO **transparently re-dials the wire and re-binds the stream**. The re-bind uses `D0028`'s deterministic `stream_id = deriveStreamId(account_id, stream_name, conversation_id)`, so the re-attached subscriber identity at the Conversation DO is the same as the original `ams_join`'s subscriber identity. The wire sees one subscriber across the disconnect, not two.

Self-rehydration is idempotent at the wire level. Concurrent send/recv calls that arrive during a rehydration coalesce on a single re-dial. A failed re-dial returns the existing `transport_error` shape; the consumer can retry.

Self-rehydration is bounded by `D0019`'s lifecycle rules. If the SessionDO has been torn down per the idle-timeout / buffer-expiration rules, the next send/recv with a valid `magic_link` reaches a fresh DO that performs the equivalent of `ams_join` semantics during rehydration — same deterministic identifiers, same stream binding. The consumer experiences this as the wire being "always available" while their `magic_link` is valid; the operator experiences it as bounded resource usage per `D0019`.

### Part 3 — `ams_join` becomes a recommended-but-not-required entry point for participation bursts

With Parts 1 and 2 in place, a consumer that calls `ams_send({ magic_link, stream_name, data })` directly — without a prior `ams_join` in the same transport session — gets a working send. The wrapper validates the link, synthesizes the account, locates (or creates) the SessionDO, rehydrates the wire, and emits the token. This is the participation surface ChatGPT-class consumers actually use, independently of whether their MCP runtime preserves any per-session continuity.

Existing flows continue to work unchanged. Consumers that hold a bearer and attach via `ams_join` once per transport session still hit the original path. Consumers on the URL-route Path C (per `D0023`) still hit the URL-route synthesis. Part 1's synthesis activates only when (a) no bearer is presented AND (b) `args.magic_link` is present and validates — preserving the no-silent-downgrade contract from `D0029`.

## Why This Is Not "Multiplying the Auth Surface"

D0029's non-extension rationale named the cost as "multiplying the auth surface." The empirical correction: there is no multiplication, because the auth surface is the magic link itself, applied in each tool that accepts a credential. Today, `ams_create_conversation` requires Door 2 (persistent bearer); `ams_join` accepts Door 2 OR Door 1 (magic link, per D0029); `ams_send` / `ams_recv` accept Door 2 OR — under this decision — Door 1 (magic link). The shape is uniform, not multiplied.

The "single point of synthesis" preserves clarity argument inverted under the empirical evidence: a single point of synthesis that does not propagate is a single point of failure for the consumer it was named to serve. Distributing the synthesis check across the participation tools, with shared helper code, gives ChatGPT-class consumers a working path without restructuring the auth model.

## The SessionDO Self-Rehydration Contract

The SessionDO's self-rehydration semantics are normative under this decision. A wrapper that ships Parts 1 and 2 of the auth-path extension but omits self-rehydration ships a half-fix: ChatGPT can authenticate but the wire connection is not durable. Self-rehydration is the bridge between "auth survives across transport sessions" (which D0019 + D0028 already gave us) and "the wire connection survives across transport sessions" (which D0019 explicitly called out as instance-volatile and which D0029 did not address).

The contract is:

- A SessionDO that observes `joined === false` or `wireWs.readyState !== OPEN` on an authenticated send/recv arrival re-dials the wire before serving the call.
- The re-bind uses `D0028`'s deterministic `stream_id` derivation to present the same subscriber identity to the Conversation DO.
- If the SessionDO holds prebind state (`prebind_record_json`) from a prior synthesis, that state is reused; otherwise the wire's `register_stream` is replayed using the synthesized account.
- Failures during rehydration return `transport_error` to the consumer; partial-success states (account synthesized but wire dial failed) MUST NOT be presented as successful.
- Self-rehydration MUST NOT be conflated with re-creating a stream that the consumer explicitly left via `ams_leave`. A `left` state on the SessionDO suppresses self-rehydration; the consumer must re-join explicitly to re-participate.

## Alternatives Considered

Three architectural alternatives were considered before settling on the auth-path extension + self-rehydration shape:

**Alternative A — Issue an opaque binding token from `ams_join`, require it on subsequent calls.** Functionally equivalent to the magic-link argument path: the consumer carries a credential per call, the wrapper validates and locates the SessionDO. Rejected because token issuance adds a new surface (lifecycle, validation, rotation, expiry, revocation) for a problem `D0028`'s deterministic identity primitive already solves. The magic link IS the credential per `D0029`'s framing; tokens duplicate that.

**Alternative B — Require explicit `ams_join` before each participation burst (no schema changes).** The consumer always calls `ams_join({ magic_link, stream_name })` before any `ams_send` / `ams_recv` burst, on a fresh transport session. Works against the shipped wrapper because `ams_join` is idempotent on identity (per `D0028`'s deterministic derivation). Adopted as the **immediate no-code workaround** (see the bootstrap-content patch shipping in this PR) but rejected as the durable fix because (a) it pushes orchestration burden onto the consumer, (b) it doubles the per-burst tool-call count for the most chatty consumers, and (c) it does not address the wire-level rehydration question — a subsequent `ams_join` on the same SessionDO key resets the join and re-dials the wire as a side effect, but that is incidental, not contractual.

**Alternative C — Wait for the McpAgent migration (`D0024`) to deliver cross-transport-session `this.props` persistence.** Rejected because (a) McpAgent's session-state model is presumably transport-session-scoped by default — which is `D0019`'s broken-keying case for transient accounts, requiring explicit re-keying regardless of SDK choice; (b) the shipped problem blocks a working ChatGPT demo today, and the McpAgent migration is implementation work whose timing is independent; (c) D0030's prescribed semantics are themselves SDK-agnostic — they apply to the handroll baseline and to a McpAgent-based wrapper equally. D0024 and D0030 are independent decisions.

## Constraints Preserved

- **`D0004`'s two-door auth model.** Door 2 (persistent bearer) remains required for `ams_create_conversation` and any persistent-identity operation. The transient-account check at `worker/src/mcp.ts` line 491 (per D0029's commit history) is unchanged; `ams_send` / `ams_recv` setting `account_is_transient: true` during synthesis preserves the conversation-creation gate.
- **No-silent-downgrade.** A bearer presented but invalid returns `invalid_credential` at the tool level. Fall-through to transient synthesis activates only when no bearer is presented AND `args.magic_link` is present and validates.
- **`D0028`'s determinism.** All synthesized identifiers (`account_id`, `stream_id`) are derived per `D0028`'s helpers. Reconnects under the same magic link and the same `stream_name` resume the same `stream_id`.
- **`D0019`'s SessionDO lifecycle rules.** Self-rehydration is bounded by idle-timeout, buffer-expiration, and account-deletion rules. No new lifetime semantics.
- **Wrapper-stays-cheap (`ams://canon/constraints/wrapper-stays-cheap`).** The schema additions and tool-handler reorders are O(20–40 lines per tool); the self-rehydration logic lives in the SessionDO and reuses existing primitives (`registerStreamOnWire`, `dialWire`).
- **Backwards compatibility.** All three existing auth paths (URL-route synthesis, bearer auth on `/mcp`, bearer auth on the magic-link transport route) continue to work unchanged. Part 1 is purely additive at the auth surface.

## Risks Acknowledged

- **Auth-surface chattiness.** ChatGPT-class consumers will carry the `magic_link` on every `ams_send` / `ams_recv` call. The wrapper will validate the link on every call. This is the cost of structural-bearer-incapability on the consumer side. Mitigation: the validation is fast (peppered hash + `timingSafeEqualHex`); the cost dominates the existing `requireAccount()` cost on every call already.
- **SessionDO state lifecycle exposure.** Self-rehydration that re-creates a SessionDO from scratch (after the previous one was idle-timed-out per D0019) silently absorbs a buffer-loss event. Mitigation: the SessionDO emits `notifications/ams/truncated` on next drain when buffer state was lost across a rehydration boundary, matching `mcp-wrapper-conformance-for-conversational-ai`'s backpressure contract.
- **Concurrent rehydration races.** Multiple `ams_send` calls arriving in parallel against a not-yet-rehydrated SessionDO must coalesce on a single wire dial. Implementation MUST hold a per-DO rehydration lock or in-flight promise to prevent duplicate dials. Bug surface here did not exist under D0029's non-extension stance.
- **Magic-link logging hazard.** Carrying `magic_link` in tool arguments puts the credential in MCP's tool-call logs more often than it would otherwise appear. Mitigation: this is a property of the credential model itself (per `D0029`'s "the magic link IS the credential" framing) — magic-link rotation policies should already account for it. Not a new attack surface; a more frequent presentation of an existing one.

## Reversibility

**Two-way door at the auth surface.** The optional `magic_link` argument on `ams_send` / `ams_recv` is additive. Removing it removes the new path; existing flows are unchanged. Consumers that adopted the new path lose the path; they revert to the workaround in the bootstrap-content patch (explicit `ams_join` per burst).

**One-way door once self-rehydration ships.** Consumers will rely on the SessionDO maintaining the wire for them across transport-session boundaries. Reverting self-rehydration would silently break that reliance; consumers that called `ams_send` on a prior SessionDO instance after a wire blip would suddenly get `transport_error` where previously the call self-healed. The reversibility window for self-rehydration closes the moment the first ChatGPT-class demo depends on it.

This decision can be reversed at the auth-surface layer before any consumer adopts the new path. Self-rehydration should be flagged as one-way-door from the day it ships.

## Retraction Conditions

This decision is retracted if any of the following hold:

- The MCP specification evolves to allow MCP consumers to present per-call custom bearers without OAuth 2.1 + PKCE flows (eliminating the structural-bearer-incapability that motivated D0029 and D0030 in the first place). In that future, the magic-link-as-argument shape becomes a transitional accommodation, deprecated in favor of per-call custom bearers carrying account identity directly.
- The MCP SDK ecosystem (Cloudflare `agents/mcp` McpAgent in particular, per `D0024`) delivers a session-state model that explicitly persists `this.props` across distinct MCP transport sessions for transient accounts, AND that persistence is durable enough to satisfy `D0019`'s buffered-tier resume guarantees. In that future, Part 1's per-call magic-link argument becomes redundant for SDK-shape consumers, though the bootstrap-content workaround would continue to apply for any handroll wrapper or non-McpAgent runtime.

Neither condition is foreseeable at decision time. Both would represent significant ecosystem evolution.

## Consequences

- **ChatGPT can fully participate in AMS conversations** — not just attach. The consumer flow that motivated `D0023` and `D0029` finally completes end-to-end.
- **claude.ai web Connectors and other OAuth-only MCP consumers unblock by the same mechanism.** The structural limitation in MCP-as-spec'd is worked around at the participation surface, not just the entry surface.
- **Wire-level resilience improves for all consumers.** SessionDO self-rehydration is a primitive that benefits Door-2 (bearer) consumers experiencing brief network blips just as much as Door-1 consumers experiencing fresh-transport-session-per-turn behavior. The latter is the motivating case; the former is a free win.
- **`ams_join` becomes a "soft" entry point.** Calling it remains the cheapest way to attach when the consumer can hold a transport session, but it is no longer architecturally privileged. The participation surface is uniformly self-authenticating.
- **Implementation lands in the `worker/src/mcp.ts` rewrite** scoped under P0002 step-4. This decision does not specify implementation timing; it specifies semantics. The implementation session validates D0030's prescriptions against the live wrapper and lands code + tests against a separate PR.

## Supersession Relationship to D0029

This decision **complements** `D0029` and explicitly **retires** the "Why not extend the auth path to all tools" sub-section's rationale.

- `D0029`'s URL-route Path C remains correct and operational.
- `D0029`'s `tool_ams_join` reorder remains correct and operational.
- `D0029`'s `synthesizeFromMagicLink` helper is reused (and called more often).
- `D0029`'s "Why not extend" sub-section's rationale ("Once `ams_join` populates `this.props`, subsequent `ams_send` / `ams_recv` calls in the session pass `requireAccount()` via the same mechanism") is **retired** — empirically false for the consumer class `D0029` was named after.
- `D0029`'s frontmatter is updated by this PR to add `extended_by: "D0030 — extends the magic-link-as-argument auth path to ams_send and ams_recv after the non-extension rationale was empirically falsified."`

Bidirectional frontmatter pointers per `klappy://canon/methods/supersession` Constraints ("Graduation MUST use explicit bidirectional frontmatter pointers. Implicit supersession — inferred from content similarity, recency, or scope — is prohibited"). D0030 *extends* rather than *supersedes* D0029, so the discipline is applied analogously: the forward link (`derives_from` → D0029) is in this file's frontmatter; the back-link (`extended_by` → D0030) is added to D0029 by the same commit. This makes the relationship traceable in both directions even though it is not a full graduation event.

## See Also

- `ams://canon/decisions/D0029-magic-link-as-ams-join-argument-on-mcp` — the predecessor whose non-extension rationale this decision retires
- `ams://canon/decisions/D0028-deterministic-identity-and-stream-resumability` — the deterministic identity primitive D0030 reuses for both `account_id` and `stream_id`
- `ams://canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying` — the SessionDO keying that makes per-call rehydration findable; the canon source for the turn-based-MCP-client transport behavior D0029 failed to integrate
- `ams://canon/decisions/D0023-magic-link-as-mcp-transport-endpoint` — Path C origin (URL-route synthesis); unchanged by this decision
- `ams://canon/decisions/D0024-migrate-hosted-mcp-wrapper-to-mcpagent-sdk` — independent SDK migration; D0030's prescriptions apply to handroll and McpAgent equally
- `ams://canon/decisions/D0004-two-door-registration` — the two-door auth model D0030 preserves
- `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai` — the conformance checklist this decision shapes (the participation tools' auth surface is now uniformly self-authenticating)
- `ams://canon/constraints/wrapper-stays-cheap` — the discipline that bounds the implementation surface
- `ams://canon/constraints/portal-bootstrap-content` — the constraint patched by this PR to ship the no-code workaround
- `journal/2026-05-08-d0030-extend-magic-link-auth-to-send-recv.tsv` — the OLDC+H verification artifact this decision rests on
