---
uri: ams://canon/decisions/D0028-deterministic-identity-and-stream-resumability
title: "D0028 — Deterministic Identity and Stream Resumability"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "decision", "identity", "stream", "magic-link", "anonymous-account", "wire", "resumability", "vodka-architecture"]
epoch: E0008.4
date: 2026-05-08
derives_from: "D0004-two-door-registration (the auth model whose Door-1-only synthesis path this stabilizes); D0009-stream-as-primitive-ownership-excludes-subscription (the wire model whose stream_id is now deterministic); D0018-multi-stream-per-account-per-conversation (the multi-stream model this preserves); D0019-cross-session-continuity-via-account-conversation-keying (the SessionDO keying that becomes correct for transient accounts only after this decision); D0023-magic-link-as-mcp-transport-endpoint (the Door-1-only synthesis whose drift bug this fixes); operator↔Claude planning conversation 2026-05-08 (gauntlet run with encode/challenge/preflight; explicit operator concern: stability for subscribers, no thousands of orphaned streams cluttering logs)"
complements: "D0019-cross-session-continuity-via-account-conversation-keying, D0023-magic-link-as-mcp-transport-endpoint, D0029-magic-link-as-ams-join-argument-on-mcp"
governs: "How acc_anon_* account_ids are derived for transient (Door-1-only) accounts. How stream_ids are derived from join payloads. The lifecycle behavior of the Conversation DO when a stream_name conflict occurs on reconnect. The optional peer_identity wire shape for human-readable participant metadata."
status: active
---

# D0028 — Deterministic Identity and Stream Resumability

> The transient anonymous `account_id` is derived from the magic-link's permissive token, not minted fresh per request. The `stream_id` is derived from `(account_id, stream_name, conversation_id)`, not minted fresh per WebSocket. A reconnect with the same `(account_id, stream_name)` displaces the prior connection and resumes the same `stream_id` rather than orphaning it. `peer_identity` ({kind, model, client}) carries human-readable metadata alongside the opaque identifiers. Subscribers see stable peers, the wire stays vodka.

## Description

Two latent bugs and one product gap, surfaced together by a planning conversation about getting ChatGPT to attach to a real conversation:

**Bug 1 (latent ULID drift)**: `worker/src/mcp.ts` line 1090 (`buildAuthProps`) calls `acc_anon_${ulid()}` on every invocation. Because `buildAuthProps` runs per HTTP request, a single MCP session that does `initialize → ams_join → ams_send → ams_recv` generates four distinct `acc_anon_*` identifiers — all stored in `this.props.account_id` at session establishment, but freshly minted each time the route handler runs. Subscribers don't notice today only because the wire WebSocket dialed at `ams_join` carries frames under whatever `account_id` was passed at dial time; subsequent `ams_send`/`ams_recv` don't re-thread `account_id` to the wire. But this is structural drift: any feature that reads `this.props.account_id` mid-session sees a different value per call, and `D0019`'s `(account_id, conversation_id)` SessionDO keying is effectively broken for transient accounts because the key changes every request.

**Bug 2 (stream orphans on reconnect)**: `worker/src/conversation.ts` line 86 mints `str_${ulid()}` per WebSocket attach, and line 78 rejects reconnects with the same `stream_name` via `wsClose(4004, "stream_name_conflict")`. A consumer whose connection drops cannot reconnect under the same identity — they must use a different `stream_name`, which mints a fresh `stream_id`, leaving the prior stream as an orphan in storage and subscriber views. Reconnect storms multiply streams unboundedly.

**Product gap (subscribers can't read peers)**: The wire identifies peers with opaque `acc_*` and `str_*` identifiers. A human watching a TinCan UI, an audit log, or any observability surface cannot tell what kind of peer is connected — agent vs. human, which model, which client — without out-of-band context. `stream_name` alone helps but is unstructured.

This decision establishes a deterministic identity model at three layers and a resume-on-reconnect lifecycle for streams, and adds a typed peer-metadata field for subscriber readability.

## Decision

### 1. Anonymous `account_id` is derived from the permissive token

For accounts synthesized from a magic-link's permissive token (Door-1-only auth per `D0023`'s URL route, or via `D0029`'s `magic_link` argument on `/mcp`):

```
account_id = `acc_anon_${pepperedHash(env.AMS_PERMISSIVE_TOKEN_PEPPER, "anon-account|" + permissive_token).slice(0, 26)}`
```

The domain separator (`"anon-account|"`) prevents collision with any other peppered-hash use of the same secret. Same magic link → same `account_id`, every request, every session. Stateless. No DO storage. No SDK-behavior dependency. Replaces the existing `acc_anon_${ulid()}` call site in `buildAuthProps`.

Persistent (Door-2) accounts continue to use their existing minting flow at `POST /v1/accounts`. This decision does not affect persistent-account derivation.

### 2. `stream_id` is derived from the join identity tuple

Stream identity is a pure function of the join payload:

```
stream_id = `str_${pepperedHash(env.AMS_PERMISSIVE_TOKEN_PEPPER, "stream|" + conversation_id + "|" + account_id + "|" + stream_name).slice(0, 26)}`
```

Same `(conversation_id, account_id, stream_name)` tuple → same `stream_id`, always. The Conversation DO computes `stream_id` from the join payload via the `deriveStreamId` helper in `worker/src/conversation.ts` instead of minting a fresh ULID. Reconnect with the same tuple resumes the same `stream_id` rather than orphaning the prior one.

### 3. Reconnect resumes the existing stream when the account_id matches

When a join arrives at the Conversation DO with a `stream_name` that already maps to an active stream on the conversation:

- **Same `account_id` → displace and resume**: gracefully close the prior WebSocket (`wsClose(4001, "stream_displaced")`), attach the new WebSocket to the same `stream_id`, retain the stream's participant record. Subscribers see continuous stream identity with a transient WebSocket transition. The buffer (when D0016 is active) is preserved.
- **Different `account_id` → reject**: return `wsClose(4004, "stream_name_owner_conflict")` (distinct close code from the prior `stream_name_conflict`). The `stream_name` is owned by the prior account; a different account cannot take it over. This preserves the existing security property that streams are per-account-owned (per `D0003`).

Replaces the unconditional `wsClose(4004, "stream_name_conflict")` at `worker/src/conversation.ts` line 78.

### 4. `peer_identity` is the wire-level human-readability layer

`ams_join` accepts a new optional argument:

```
peer_identity?: {
  kind: "agent" | "human";   // required when peer_identity is present
  model?: string;             // e.g. "claude-opus-4-7", "gpt-4o"
  client?: string;            // e.g. "ChatGPT Apps", "Claude Code", "TinCan UI", "curl"
}
```

The Conversation DO records `peer_identity` in its participant tracking (existing `participants` map, extended) and includes it in participant frames so late subscribers and observability tools see human-readable identity alongside opaque IDs. `peer_identity` is set at join time and not mutable mid-session — identity drift is its own form of bug.

When `peer_identity` is omitted, participant frames continue to carry only the existing fields. The wire is additive; no existing consumer breaks.

### 5. `stream_name` auto-generation uses peer_identity + MCP session id

When `stream_name` is not supplied to `ams_join` and `peer_identity` IS supplied:

```
stream_name = `${slugify(peer_identity.client ?? peer_identity.kind)}-${shortHash(mcp_session_id)}`
```

where `shortHash` is the first 4 hex characters of `pepperedHash(AMS_PERMISSIVE_TOKEN_PEPPER, "auto-stream-name|" + mcp_session_id)` — 2 bytes of entropy, 65,536 distinct values per slug, sufficient for in-conversation discrimination of simultaneous consumers under the same magic link. Examples (hex character set, 0–9 a–f): `chatgpt-7f3a`, `claude-code-9c2e`, `tincan-1d8b`.

Properties:

- **Stable within an MCP session**: same `mcp_session_id` → same auto-generated `stream_name`. Reconnect within the session resumes the existing stream via the rule above.
- **Distinct across sessions**: each fresh `initialize` mints a new `mcp_session_id`, yielding a different auto-generated `stream_name` even on the same magic link. Two simultaneous ChatGPT consumers get distinct streams.
- **Operator-typed `stream_name` bypasses the formula**: explicit `stream_name = "klappy"` is used verbatim, providing the cross-session-stable escape hatch for users who want their identity to persist across app restarts.

When neither `stream_name` nor `peer_identity` is supplied, auto-generation falls back to the existing random `stream-NNNNNN` pattern (no behavior change for legacy callers).

**Discriminator fallback.** When `mcp_session_id` is unavailable in props (non-standard invocations such as in-process tests or future transports that do not expose a session id header), the wrapper falls back to `account_id` as the discriminator input to `shortHash`. Effect: two consumers under the same magic link in such a non-standard environment would collapse to the same `stream_name` and therefore the same `stream_id`. The fallback exists so the auto-name path is total (never throws) and so the standard MCP-over-Streamable-HTTP flow — where `mcp-session-id` is always populated by the SDK — works without special-casing. Production consumers should not encounter the fallback.

### 6. Cross-session continuity for transient accounts becomes correct

Per `D0019`, the SessionDO is keyed by `(account_id, conversation_id)` to enable buffer continuity across MCP transport sessions. Under the prior fresh-ULID-per-request behavior of bug 1, this keying was effectively broken for transient accounts — every request re-derived a different `account_id`, so the SessionDO was re-keyed every request. Deterministic `account_id` derivation makes `D0019`'s keying actually work for the transient/anonymous case: a ChatGPT-class consumer holding a magic link gets the same SessionDO across connection drops, app restarts, and new MCP sessions, as long as they hold the same magic link.

This is the load-bearing reason the deterministic-account-id rule cannot be deferred — it's a `D0019` correctness fix, not just a hygiene improvement.

## Rationale / Why This Shape

**Why deterministic over stateful for `account_id`?** The magic link IS the identity capability per `D0023`. Hashing the permissive token derives an identity that is a pure function of the capability — no DO storage, no SDK-behavior dependency, no cross-request state to manage. Two consumers holding the same magic link become the same anon identity by design; the per-peer discriminator is `stream_name`, not `account_id`. This is consistent with AMS's existing layered identity model (`D0009`: stream is the participation primitive; account is the identity layer).

**Why deterministic over stateful for `stream_id`?** The dominant orphan source is reconnect storms — network blips, transient WebSocket drops, app refreshes that preserve the MCP session. A pure function from `(conversation_id, account_id, stream_name)` to `stream_id` collapses the entire reconnect class to "resume," eliminating the orphan path without requiring TTL infrastructure. Path #2 (genuine abandon orphans) and per-account stream caps remain deferred to a separate decision; this decision bounds the orphan rate to "sessions genuinely opened and abandoned," which is a vastly smaller signal than reconnect noise.

**Why `peer_identity` separate from `stream_name`?** `stream_name` is a single textual label; `peer_identity` is structured metadata with a typed discriminator. Subscribers building dashboards, audit logs, or filtering UIs need machine-readable kind/model/client to render meaningfully — searching for "all human peers" or "all gpt-4o agents" requires schema, not free-form strings. Keeping them separate respects DRY (`stream_name` continues to mean what it meant) while adding the discoverable identity surface.

**Why account_id-gated reconnect rather than session-id-gated?** Session ids change across MCP transport sessions by design (turn-based clients open a fresh transport per turn). Account-id-gated displacement preserves stream identity across the natural lifecycle of stateless MCP consumers, while still preventing one consumer from displacing another's stream — the security property `D0003` (per-account-stream-ownership) is preserved.

## Constraints

- **Two-door auth model (`D0004`) is preserved.** Door 2 (persistent bearer) remains required for `ams_create_conversation` and any conversation-creation operation. Transient accounts (Door-1-only) authorize participation only.
- **Stream ownership (`D0003`) is preserved.** Streams remain per-account-owned. Reconnect-resume requires the same `account_id` as the prior owner; cross-account takeover is rejected.
- **Wire conformance (`canon/constraints/wire-conformance`) is preserved.** All changes are additive (new optional `peer_identity` field; deterministic vs. random ID derivation is opaque to subscribers). No existing subscriber breaks.
- **Wrapper stays cheap (`canon/constraints/wrapper-stays-cheap`).** Identity derivation reuses existing primitives (`pepperedHash`, magic-link parsing). No new auth modules. The `mcp.ts` line count grows by approximately 50 lines; the Conversation DO grows by approximately 40 lines. Both stay well under the wrapper-mass thresholds the prior canon flagged.
- **`stream_name` uniqueness within a conversation is preserved**, now extended to be account-id-gated for ownership.
- **No new secrets.** `AMS_PERMISSIVE_TOKEN_PEPPER` is reused with explicit domain separators (`"anon-account|"`, `"stream|"`).

## Consequences

- **Reconnect orphans (path #1) are eliminated.** A single client cannot multiply streams by reconnecting. Log clutter from this source goes to zero.
- **Cross-session continuity works for ChatGPT-class consumers.** ChatGPT app restart / new chat thread on the same magic link gets the same `account_id` (link-derived) and re-keys to the same SessionDO per `D0019` — buffer and history follow the consumer across what looks like a "new session" from the MCP transport's perspective.
- **Subscribers see human-readable peer metadata.** `peer_identity` propagates to participant frames, enabling readable observability, audit trails, and UI surfaces.
- **Two simultaneous consumers on the same magic link get distinct streams** when each `initialize` mints a different `mcp_session_id`, distinct auto-generated `stream_name`s, and therefore distinct `stream_id`s.
- **Operator-typed `stream_name` is the cross-session-stable escape hatch.** A user who types `stream_name = "chatgpt-pet"` once and again on each fresh ChatGPT session resumes the same stream forever — no orphan from the abandon side either, because the stream is being reused by design.
- **Path #2 (abandon orphans) and per-account stream caps remain deferred.** Their TTL/reap logic is its own focused work item with its own canon decision, its own DO storage scheme, and its own measured complexity. This decision bounds the orphan rate but does not eliminate it; explicit lifecycle work follows in a separate session.

## Supersession

Does not supersede. Extends `D0019` (cross-session continuity actually works for transient accounts), `D0023` (transient-account synthesis is now stable across requests), and `D0009` (stream identity is now deterministic). Is extended by `D0029` (which uses the same deterministic anon-account derivation for the `/mcp` + magic_link argument path).
