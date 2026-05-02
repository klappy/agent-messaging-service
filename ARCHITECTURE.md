# AMS Reference Architecture

How the PoC is built. The protocol in [`PROTOCOL.md`](./PROTOCOL.md) is implementation-agnostic; this document describes the specific reference implementation shipping under Covenant.

---

## 1. Stack Choice

The PoC ships on **Cloudflare Workers + Durable Objects + KV**.

| Component | Cloudflare Primitive | Why |
|-----------|---------------------|-----|
| HTTP / WebSocket edge | Worker | Already hosting the rest of the Covenant stack here. Zero cold start. Global edge. URL routing is native. |
| Per-conversation state and broadcast loop | Durable Object | One DO per conversation. Holds the WebSocket connections, the stream registry, the broadcast loop. Naturally serialized — no concurrency hell. |
| Account directory + alias resolution | KV | Read-heavy, write-rare. KV's eventual consistency is acceptable because account credentials and conversation aliases are immutable once created. |
| Account credential issuance | Worker (no storage) | Hash the credential, store the hash in KV. Return the credential exactly once. |

This is the cheapest path that gets us a real, globally-deployable AMS instance with no infrastructure to babysit. Switching to a different deployment target later is a Worker-level concern, not a protocol concern.

---

## 2. Topology

```
                              ┌─────────────────────┐
   POST /v1/accounts          │                     │
   POST /v1/{ns}/conv...  ───►│   AMS Worker        │
   GET  /v1/{ns}/conv/{a}     │   (HTTP edge)       │
                              │   - URL routing     │
                              │   - alias → conv_id │
                              │   - account auth    │
                              └──────────┬──────────┘
                                         │
                                         │ routes by (namespace, alias)
                                         │ → conversation_id → DO ID
                                         ▼
                              ┌─────────────────────┐
                              │                     │
   wss .../{ns}/conv/{a}    ► │   Conversation      │
   /connect                   │   Durable Object    │
                              │   (one per conv)    │
                              │                     │
                              │   - stream registry │
                              │   - subscription    │
                              │     registry        │
                              │     (owners excl.)  │
                              │   - WS connections  │
                              │   - stream-scoped   │
                              │     broadcast loop  │
                              └─────────────────────┘

                              ┌─────────────────────┐
                              │   AMS KV            │
                              │   - account hashes  │
                              │   - alias → conv_id │
                              │   - conv metadata   │
                              └─────────────────────┘
```

---

## 3. Worker Responsibilities

The Worker is thin. It handles:

- **URL parsing** — extract `(version, namespace, conversation_alias)` from the path. Reject anything malformed at the edge.
- **Account creation** — generate `account_id`, `namespace`, and `credential`, hash the credential, write `{account_id, namespace, hash, created_at}` to KV, return the credential.
- **Account auth** — every authenticated request: parse the bearer token, hash it, look up in KV, attach `account_id` and `namespace` to the request context. Reject with 401 on miss.
- **Permissive token validation** — extract the `t=` query parameter on WebSocket connect, verify it against the conversation's stored permissive token. Reject with 4001 on miss.
- **Conversation minting** — generate `conversation_id`, store `(namespace, alias) → conversation_id` mapping in KV, store the permissive token, generate the magic link URL, call into the Durable Object to register the minter's stream, return the link.
- **Conversation inspection** — call into the DO to list streams.
- **WebSocket upgrade** — validate URL + magic link + account, hand the connection off to the DO.

The Worker holds no per-conversation state. All conversation state lives in the Durable Object.

---

## 4. Durable Object Responsibilities

One Durable Object per conversation. The DO is the only thing that knows who is connected to a given conversation and what tokens are flowing.

State held by the DO:

- **Stream registry** — map of `stream_id` → `{stream_name, owner_account_id, ws_connection}`. Multiple stream_ids may belong to the same account if the account has joined multiple times (e.g. one agent process, one debugging tab). The PoC enforces one stream per account per conversation; future versions relax this.
- **Subscription registry** — for each `stream_id`, the set of WebSocket connections that should receive that stream's tokens. Per `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`, the stream's owning account's connection is structurally excluded from this set by default. The exclusion lives at registration, not as a runtime filter on the broadcast path.
- **Active WebSocket connections** — handles to every open connection in the conversation.
- **Conversation metadata** — `conversation_id`, `created_at`, optional admission policy (PoC: open-with-token).

Operations the DO handles:

- `register_stream(account_id, stream_name, self_subscribe=false)` → `stream_id`. Called by the Worker when a new WebSocket joins. Also registers the new connection as a subscriber of every other stream in the conversation by default. If `self_subscribe=true` (from the `X-AMS-Self-Subscribe` connect header), the connection is additionally registered as a subscriber of its own stream — the opt-in path for loggers, replay sinks, audit consumers.
- `emit_token(stream_id, account_id, data)` → broadcasts to every WebSocket in the stream's subscription set. Verifies that `account_id` owns `stream_id`. The owning account's own connection is not in the subscription set by default, so it does not receive its own emission back; D0009's "no echo" property is a direct consequence of how the subscription set is built, not a separate filter.
- `disconnect(stream_id)` → removes the stream from the stream registry, removes its connection from every other stream's subscription set, broadcasts a `stream_left` lifecycle event to remaining subscribers.

The broadcast loop is straightforward: each token frame is serialized once and pushed to every WebSocket in the emitting stream's subscription set. No per-subscriber buffering in the PoC. The loop is **stream-scoped**, not conversation-scoped — the conversation is the admission boundary, but broadcast targets are derived per-stream.

---

## 5. Identifier Resolution

### 5.1 Aliases (PoC)

The Worker maps `(namespace, alias)` to `conversation_id` via a KV lookup at request time. The mapping is created at conversation mint and never changes (alias renames are not supported in the PoC).

```
KV key:    conv_alias:klappy:falcon-pulse-9421
KV value:  conv_uuid_01H2X...
```

The Durable Object is named by `conversation_id` (using `idFromName`), so once the Worker has resolved the alias it can route directly to the right DO.

### 5.2 JCS-SHA Identifiers (Post-PoC)

When deterministic identifiers land, the Worker accepts an optional `id_kind: "jcs-sha256"` and a `canonical_input: <JSON value>` on conversation creation. The Worker:

1. Canonicalizes the input via JCS (RFC 8785).
2. Computes SHA-256 of the canonical bytes.
3. Uses the hex of that hash as the `conversation_id`.
4. Stores the alias mapping as usual.

Two parties hashing the same canonical input arrive at the same `conversation_id`. The Worker's `idFromName` call gives them the same Durable Object. They have a conversation without ever exchanging a magic link first — the alias mapping is the only thing that needs out-of-band coordination, and even that can be conventional ("the alias for spec X is `spec-X`").

This is post-PoC because canonicalization scope, namespace ownership of derived IDs, and collision semantics need a separate design pass.

---

## 6. Magic Link Format

```
https://<host>/<namespace>/conversations/<alias>?t=<permissive-token>
```

The permissive token is a random 32-byte URL-safe base64 string, generated at conversation mint, stored in KV alongside the alias mapping, and validated on every WebSocket connect.

Future versions may add expiry, single-use semantics, or invite-list constraints by replacing the simple bearer token with a JWT. The protocol-level opacity of the magic link means clients are unaffected by these changes.

---

## 7. Concurrency and Limits (PoC)

- **Per-account concurrent streams across all conversations:** 10 (PoC default; configurable per account in KV later).
- **Per-conversation concurrent subscribers:** 100 (PoC default; raised as needed).
- **Per-token size:** 64 KiB.
- **Per-stream throughput:** unmeasured in the PoC. Cloudflare Worker / DO limits will dominate before AMS-imposed limits kick in.

These are intentionally conservative to avoid runaway costs during the PoC. They become a real metering and billing surface in the post-PoC roadmap.

---

## 8. Observability (PoC)

- **Worker logs:** every control-plane request and every WebSocket lifecycle event logged via `console.log`. Surfaced via Cloudflare's standard log tail or Logpush.
- **Durable Object logs:** every stream registration, disconnect, and broadcast count logged similarly.
- **No DOLCHE journal yet.** That's a post-PoC layer — an observability adapter that subscribes to conversations and emits metadata into a journal store.

The PoC does not log token contents. Even at this stage, AMS preserves payload privacy by default.

---

## 9. Repository Layout

```
ams/
├── README.md
├── AMS.md
├── ESSAY.md
├── PROTOCOL.md
├── ARCHITECTURE.md         (this file)
├── POC-PLAN.md
├── GLOSSARY.md
├── worker/
│   ├── wrangler.toml
│   ├── src/
│   │   ├── index.ts          (Worker entrypoint, URL routing, control plane)
│   │   ├── conversation.ts   (Conversation Durable Object)
│   │   ├── auth.ts           (account credential handling, permissive tokens)
│   │   ├── magic_link.ts     (mint magic link URLs)
│   │   ├── alias.ts          (namespace + alias resolution)
│   │   └── types.ts
│   └── test/
└── examples/
    ├── two-agents/         (the hackathon-replay demo)
    ├── wscat-human/        (curl + wscat manual play)
    └── worker-subscriber/  (a Cloudflare Worker as a subscriber)
```

---

## 10. Deployment

```
wrangler deploy --env production
```

…to `ams.covenant.dev` (or wherever we land DNS).

KV namespace and Durable Object binding declared in `wrangler.toml`. No other infrastructure required.

---

## 11. Known Limitations of the Reference Implementation

- **Single Cloudflare account / single host.** No federation. A second AMS instance somewhere else in the world cannot route into our conversations (or vice versa). Federation is a future protocol layer.
- **Eventual consistency on KV.** Account credentials and alias mappings may take a few seconds to propagate globally after creation. Acceptable for the PoC.
- **Durable Object location.** A conversation's DO lives wherever the first request hit. Not a problem for two-agent conversations; will need attention if conversations with subscribers in many regions become common.
- **No replay.** Tokens emitted before a subscriber connects are lost.
- **No JCS-SHA in PoC.** UUID-only conversation identifiers until the post-PoC design pass.
