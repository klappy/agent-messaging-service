# AMS Reference Architecture

How the PoC is built. The protocol in [`PROTOCOL.md`](./PROTOCOL.md) is implementation-agnostic; this document describes the specific reference implementation shipping under Covenant.

---

## 1. Stack Choice

The PoC ships on **Cloudflare Workers + Durable Objects + KV**.

| Component | Cloudflare Primitive | Why |
|-----------|---------------------|-----|
| HTTP / WebSocket edge | Worker | Already hosting the rest of the Covenant stack here. Zero cold start. Global edge. |
| Per-room state and broadcast loop | Durable Object | One DO per room. Holds the WebSocket connections, the stream registry, the broadcast loop. Naturally serialized — no concurrency hell. |
| Account directory | KV | Read-heavy, write-rare. KV's eventual consistency is acceptable because credentials are immutable once issued. |
| Account credential issuance | Worker (no storage) | Hash the credential, store the hash in KV. Return the credential exactly once. |

This is the cheapest path that gets us a real, globally-deployable AMS instance with no infrastructure to babysit. Switching to a different deployment target later is a Worker-level concern, not a protocol concern.

---

## 2. Topology

```
                         ┌─────────────────────┐
   POST /v1/accounts     │                     │
   POST /v1/rooms    ───►│   AMS Worker        │
   GET  /v1/rooms/:link  │   (HTTP edge)       │
                         │                     │
                         └──────────┬──────────┘
                                    │
                                    │ routes by magic_link
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │                     │
                         │   Room Durable      │
   wss .../connect ────► │   Object            │
                         │   (one per room)    │
                         │                     │
                         │   - stream registry │
                         │   - WS connections  │
                         │   - broadcast loop  │
                         └─────────────────────┘

                         ┌─────────────────────┐
                         │                     │
                         │   AMS Accounts KV   │
                         │   (credential       │
                         │    hashes,          │
                         │    metadata)        │
                         │                     │
                         └─────────────────────┘
```

---

## 3. Worker Responsibilities

The Worker is thin. It handles:

- **Account creation** — generate `account_id` and `credential`, hash the credential, write `{account_id, hash, handle, created_at}` to KV, return the credential.
- **Account auth** — every authenticated request: parse the bearer token, hash it, look up in KV, attach `account_id` to the request context. Reject with 401 on miss.
- **Room minting** — generate `room_id`, generate `magic_link` (an opaque token containing the `room_id` and a verifier), call into the appropriate Durable Object to register the minter's stream, return the link.
- **Room inspection** — call into the DO to list streams.
- **WebSocket upgrade** — validate magic link and account, hand the connection off to the DO.

The Worker holds no per-room state. All room state lives in the Durable Object.

---

## 4. Durable Object Responsibilities

One Durable Object per room. The DO is the only thing that knows who is connected to a given room and what tokens are flowing.

State held by the DO:

- **Stream registry** — map of `stream_id` → `{stream_name, owner_account_id, ws_connection}`. Multiple stream_ids may belong to the same account if the account has joined multiple times (e.g. one agent process, one debugging tab).
- **Active WebSocket connections** — handles to every open connection in the room.
- **Room metadata** — `room_id`, `created_at`, optional admission policy (PoC: open).

Operations the DO handles:

- `register_stream(account_id, stream_name)` → `stream_id`. Called by the Worker when a new WebSocket joins.
- `emit_token(stream_id, account_id, data)` → broadcasts to all connected sockets. Verifies that `account_id` owns `stream_id`.
- `disconnect(stream_id)` → removes the stream from the registry, broadcasts a `stream_left` lifecycle event to remaining subscribers.

The broadcast loop is straightforward: each token frame is serialized once and pushed to every WebSocket in the room. No per-subscriber buffering in the PoC.

---

## 5. Magic Link Format

A magic link is an opaque string from the protocol's perspective. The reference implementation uses:

```
ams://link/<base64url(JWT)>
```

…where the JWT payload contains:

```json
{
  "room_id": "rm_01H...",
  "issued_at": "2026-05-01T18:00:01Z",
  "v": 1
}
```

…signed with a Worker-side secret. This means the Worker can validate a magic link without a database lookup and route directly to the appropriate Durable Object.

Future versions may add expiry, single-use semantics, or invite-list constraints inside the JWT payload. The opaque-string assumption in the protocol is preserved — clients should never parse the link.

---

## 6. Concurrency and Limits (PoC)

- **Per-account concurrent streams:** 10 (PoC default; configurable per account in KV later).
- **Per-room concurrent subscribers:** 100 (PoC default; raised as needed).
- **Per-token size:** 64 KiB.
- **Per-stream throughput:** unmeasured in the PoC. Cloudflare Worker / DO limits will dominate before AMS-imposed limits kick in.

These are intentionally conservative to avoid runaway costs during the PoC. They become a real metering and billing surface in the post-PoC roadmap.

---

## 7. Observability (PoC)

- **Worker logs:** every control-plane request and every WebSocket lifecycle event logged via `console.log`. Surfaced via Cloudflare's standard log tail or Logpush.
- **Durable Object logs:** every stream registration, disconnect, and broadcast count logged similarly.
- **No DOLCHE journal yet.** That's a post-PoC layer.

The PoC does not log token contents. Even at this stage, AMS preserves payload privacy by default.

---

## 8. Repository Layout

```
ams/
├── README.md
├── AMS.md
├── PROTOCOL.md
├── ARCHITECTURE.md         (this file)
├── POC-PLAN.md
├── GLOSSARY.md
├── worker/
│   ├── wrangler.toml
│   ├── src/
│   │   ├── index.ts        (Worker entrypoint, control plane)
│   │   ├── room.ts         (Room Durable Object)
│   │   ├── auth.ts         (account credential handling)
│   │   ├── magic_link.ts   (mint / validate)
│   │   └── types.ts
│   └── test/
└── examples/
    ├── two-agents/         (the hackathon-replay demo)
    ├── wscat-human/        (curl + wscat manual play)
    └── worker-subscriber/  (a Cloudflare Worker as a subscriber)
```

---

## 9. Deployment

```
wrangler deploy --env production
```

…to `ams.covenant.dev` (or wherever we land DNS).

KV namespace and Durable Object binding declared in `wrangler.toml`. No other infrastructure required.

---

## 10. Known Limitations of the Reference Implementation

- **Single Cloudflare account.** No federation. A second AMS instance somewhere else in the world cannot route into our rooms (or vice versa). Federation is a future protocol layer.
- **Eventual consistency on KV.** Account credentials may take a few seconds to propagate globally after creation. Acceptable for the PoC.
- **Durable Object location.** A room's DO lives wherever the first request hit. Not a problem for two-agent rooms; will need attention if rooms with subscribers in many regions become common.
- **No replay.** Tokens emitted before a subscriber connects are lost.
