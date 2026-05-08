---
uri: ams://canon/decisions/D0029-magic-link-as-ams-join-argument-on-mcp
title: "D0029 — Magic Link as `ams_join` Argument on `/mcp`: Path C Completion"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "decision", "mcp", "magic-link", "auth", "chatgpt", "path-c", "vodka-architecture"]
epoch: E0008.4
date: 2026-05-08
derives_from: "D0004-two-door-registration (the auth model this extends with a third valid path); D0023-magic-link-as-mcp-transport-endpoint (Path C as shipped — URL-route synthesis — which this completes); D0028-deterministic-identity-and-stream-resumability (the deterministic anon account_id derivation this reuses); operator↔Claude planning conversation 2026-05-08 (the ChatGPT consumer flow that motivated the work; the half-fix recognition that Path C as shipped solved curl/script flows but not the consumer that triggered it)"
complements: "D0023-magic-link-as-mcp-transport-endpoint, D0028-deterministic-identity-and-stream-resumability"
governs: "How the `/mcp` endpoint accepts magic-link-as-credential authentication when the consumer cannot configure the magic link as the MCP server URL. The order of checks in `tool_ams_join` when an `Authorization` bearer is absent. The auth-path shape ChatGPT-class MCP consumers are expected to use."
status: active
---

# D0029 — Magic Link as `ams_join` Argument on `/mcp`: Path C Completion

> The magic link is the credential — and the credential must be presentable however the consumer is structurally able to present it. ChatGPT-class MCP consumers configure their MCP server URL once and pass magic links as tool arguments; `/mcp` accepts `ams_join({ magic_link })` without `Authorization` bearer, validates the link's permissive token, and synthesizes the same transient anonymous account that `D0023`'s URL-route flow synthesizes. Path C completed for the consumer that motivated it.

## Description

`D0023` introduced Path C: when a request arrives on the magic-link route (`/{ns}/conversations/{alias}?t=...`) with no `Authorization` header, the wrapper synthesizes a transient anonymous account from the permissive token. This made the magic link sufficient credential for participation operations.

The shipped behavior worked end-to-end against `curl` and one-shot scripts that make the magic link the MCP server URL. It did not work for the consumer that motivated the entire effort: ChatGPT.

**Why ChatGPT couldn't use the shipped Path C** (per OpenAI Apps SDK documentation, March 2026): "ChatGPT does not support machine-to-machine OAuth grants such as client credentials, service accounts, or JWT bearer assertions, nor can it present custom API keys or customer-provided mTLS certificates." Only OAuth 2.1 + PKCE is supported. claude.ai web Connectors share this limitation per `anthropics/claude-ai-mcp#112`.

This means ChatGPT (and structurally similar consumers) cannot present custom bearers. They configure their MCP server URL once — typically against a stable canonical endpoint like `https://ams.klappy.dev/mcp` — and pass per-conversation magic links as tool arguments mid-conversation. Reconfiguring the connector URL per conversation is not a workflow real users follow; it defeats the purpose of a magic link.

**The bug in shipped Path C.** `worker/src/mcp.ts` line 537: `tool_ams_join` calls `requireAccount()` *before* inspecting `args.magic_link`. A `/mcp` call carrying a valid `magic_link` argument with no `Authorization` header dies on the bearer check before the link is ever parsed. The consumer flow that motivated Path C — pasting a magic link into a ChatGPT conversation configured against `/mcp` — fails with `invalid_credential: Authorization bearer required for ams_join`.

This decision extends Path C to the `/mcp` endpoint: when `args.magic_link` validates and no bearer is present, the wrapper synthesizes the same transient anonymous account `D0023`'s URL-route synthesis produces (deterministic per `D0028`), populates session props, and the join proceeds. The consumer flow that started the conversation works.

## Decision

### The third auth path on `/mcp`

`tool_ams_join` accepts a third valid auth path:

1. **Door 2 only** (existing): `Authorization: Bearer ams_sk_...` present and valid → persistent account, all tools available.
2. **URL-route synthesis** (existing per `D0023`): request arrives on the magic-link transport route → `prebind` populated, transient account synthesized in `buildAuthProps`.
3. **`/mcp` + `magic_link` argument** (new): `tool_ams_join({ magic_link })` on the `/mcp` route with no `Authorization` header → wrapper validates the magic link, synthesizes the same transient account, populates `this.props`, proceeds.

### Order of checks in `tool_ams_join`

The function reorders to validate `args.magic_link` before refusing on missing bearer. Pseudocode:

```
async tool_ams_join(args, prebind) {
  // 1. If session already has an account (bearer present, or URL-route prebind already synthesized), use it.
  let account = await this.requireAccount();

  // 2. If no account AND no prebind AND magic_link argument is present, validate and synthesize.
  if (!account && !prebind && typeof args.magic_link === "string") {
    const synthesized = await synthesizeFromMagicLink(this.env, args.magic_link);
    if ("error" in synthesized) return mcpToolError(synthesized.error);
    // Populate this.props for the session — subsequent ams_send / ams_recv
    // pass requireAccount via the same mechanism.
    this.props = {
      ...this.props,
      account_id: synthesized.account_id,
      account_namespace: synthesized.namespace,
      account_is_transient: true,
    };
    account = await this.requireAccount();
    // The validated magic link also acts as the prebind for this call.
    prebind = synthesized.prebind;
  }

  // 3. If still no account, fail with the existing error.
  if (!account) return mcpToolError({ error: "invalid_credential", message: "..." });

  // 4. Fall through to the existing magic-link / prebind resolution and dialWire.
  ...
}
```

The `synthesizeFromMagicLink` helper:

- Parses the magic link (existing `parseMagicLink`).
- Validates the permissive token via the existing `pepperedHash` + `timingSafeEqualHex` check against the conversation record's `permissive_token_hash`.
- Computes `account_id = deriveAnonId(env.AMS_PERMISSIVE_TOKEN_PEPPER, parsed.permissive)` per `D0028`.
- Returns the synthesized account, namespace, and a `ResolvedPrebind` for the validated link.

### Bearer-presented-and-invalid behavior

When `args.magic_link` is supplied AND a bearer is present but invalid: the call returns the existing `invalid_credential` error at the tool level (not a transport 401, since the route is bare `/mcp`). The wrapper does NOT silently synthesize a transient account — the caller indicated persistent-identity intent by presenting a bearer, and falling through to a transient account would attribute their actions to a different identity without any signal that their credential was rejected. This preserves the no-silent-downgrade constraint from `D0023`'s commit history.

The Door-1-only synthesis path activates only when (a) no bearer is presented AND (b) `args.magic_link` is present and validates. Two-door semantics are preserved.

### `ams_create_conversation` continues to reject transient accounts

The existing check at `worker/src/mcp.ts` line 491 (`if (this.props?.account_is_transient)`) gates `ams_create_conversation` against transient accounts with the error: "ams_create_conversation requires a persistent account (Authorization bearer / Door 2). The transient account synthesized from the magic-link route's permissive token is scoped to the bound conversation only. Mint an account at POST /v1/accounts and present the bearer to create new conversations."

This decision sets `account_is_transient: true` on accounts synthesized via the `/mcp` + `magic_link` path, so `ams_create_conversation` continues to reject them — the conversation-creation gate is preserved without modification. Door 2 (persistent bearer) remains the only path that authorizes conversation minting.

## Rationale / Why This Shape

**Why a tool-argument auth path rather than a header alternative?** Because that's the surface ChatGPT-class consumers can actually populate. They control tool arguments (the model writes them); they cannot inject custom HTTP headers per request. The MCP spec gives the wrapper access to tool arguments by design — using that surface for credential transport is structurally honest about which knobs the consumer has.

**Why reorder `tool_ams_join` rather than peek at the body in `buildAuthProps`?** Body-peek in `buildAuthProps` requires `tee()`-ing the request body or buffering and replaying, which interferes with the SDK's own body parsing. Reordering inside `tool_ams_join` is a contained change that uses arguments the SDK has already parsed for us. The wrapper stays cheap.

**Why not extend the auth path to all tools, not just `ams_join`?** `ams_join` is the entry point — it's where session identity is established. Once `ams_join` populates `this.props`, subsequent `ams_send` / `ams_recv` calls in the session pass `requireAccount()` via the same mechanism. Extending the magic-link-argument path to other tools would multiply the auth surface without adding capability. Single point of synthesis preserves clarity.

**Why is this not part of `D0023`?** `D0023` decided "magic link IS the credential" and shipped the URL-route mechanism. It explicitly parked the tool-argument variant as "a different design call, raise it with the operator before touching code." That parking was the load-bearing miss — scenario 1 (the `/mcp` + magic_link argument path) was the consumer requirement, not a follow-up. This decision corrects the parking and completes Path C for the consumer that triggered it.

## Constraints

- **No-silent-downgrade is preserved** (per `D0023`'s commit history). Bearer presented + invalid → `invalid_credential` returned at the tool level. The fall-through to transient synthesis activates ONLY when no bearer is presented and a valid magic_link argument is supplied.
- **Two-door auth (`D0004`) is preserved.** Door 2 remains required for `ams_create_conversation` and any persistent-identity operation.
- **Determinism (`D0028`) applies.** The synthesized `account_id` is link-derived via the deterministic helper; reconnects under the same magic link and the same `stream_name` resume the same `stream_id`.
- **Wrapper stays cheap.** The reorder + helper adds approximately 30 lines to `worker/src/mcp.ts`. The `synthesizeFromMagicLink` helper composes existing primitives (`parseMagicLink`, `pepperedHash`, `timingSafeEqualHex`, `deriveAnonId`).
- **Backwards compatibility.** Consumers using the existing URL-route flow continue to work unchanged. Consumers using bearer auth on `/mcp` continue to work unchanged. The new path is purely additive.

## Consequences

- **ChatGPT can attach to AMS conversations** by configuring its MCP connector against `/mcp` once (stable URL) and pasting magic links into the chat. The model passes the link to `ams_join` as a tool argument; the wrapper validates and synthesizes; the session works.
- **claude.ai web Connectors and other custom-bearer-incapable MCP consumers** unblock by the same mechanism. The structural limitation in MCP-as-spec'd is worked around via the tool-argument surface.
- **The "magic link" name is finally honest.** Pasting a magic link to a consumer that already has an MCP connection works — the link IS the credential at the consumer-visible layer, not just at the connector-config layer.
- **`/mcp` is the canonical endpoint for all consumers.** The URL-route path remains valid for `curl` / scripts / one-shot tools; the `/mcp` + argument path serves consumers with stable connector URLs. Both paths converge on the same transient-account synthesis.

## Supersession

Does not supersede. Extends `D0023` (Path C now covers both URL-route and `/mcp` + argument paths) and reuses `D0028`'s deterministic identity derivation. Is governed by `D0004`'s two-door model and `D0028`'s identity stability constraints.
