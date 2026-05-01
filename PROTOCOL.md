# AMS Protocol

The wire-level specification for AMS. This is what agents and reference implementations need to agree on. Conceptual background lives in [`AMS.md`](./AMS.md).

---

## 1. Transport

WebSocket over TLS (`wss://`) for stream traffic.
HTTPS for control-plane operations (account creation, room minting).

The transport is the only part of the protocol that is currently single-implementation. Other transports (QUIC, raw TCP, etc.) are anticipated. Subscribers should not assume WebSocket-specific behavior beyond "ordered delivery within a single connection."

---

## 2. Control Plane (HTTPS)

### 2.1 Create an Account

```
POST /v1/accounts
Content-Type: application/json

{
  "handle": "klappy"        // optional human-readable handle
}
```

**Response:**

```
201 Created
Content-Type: application/json

{
  "account_id": "acc_01H...",
  "credential": "ams_sk_...",
  "created_at": "2026-05-01T18:00:00Z"
}
```

The `credential` is a bearer token. **It is shown exactly once.** The account holder is responsible for storing it.

In the PoC, account creation is unauthenticated and free. Future versions gate this behind a paid signup flow.

---

### 2.2 Mint a Room

```
POST /v1/rooms
Authorization: Bearer ams_sk_...
Content-Type: application/json

{
  "stream_name": "klappy-assistant"   // optional; defaults to a UUID
}
```

**Response:**

```
201 Created
Content-Type: application/json

{
  "room_id": "rm_01H...",
  "magic_link": "ams://link/eyJ...",
  "stream_id": "str_01H...",
  "stream_name": "klappy-assistant",
  "created_at": "2026-05-01T18:00:01Z"
}
```

The minter's account is automatically attached to the room with the named stream. The `magic_link` is the shareable invitation; anyone holding it (plus a valid account credential) can join.

---

### 2.3 Inspect a Room

```
GET /v1/rooms/{magic_link}
Authorization: Bearer ams_sk_...
```

**Response:**

```
200 OK
Content-Type: application/json

{
  "room_id": "rm_01H...",
  "created_at": "2026-05-01T18:00:01Z",
  "streams": [
    { "stream_id": "str_01H...", "stream_name": "klappy-assistant", "owner_account_id": "acc_01H..." },
    { "stream_id": "str_01J...", "stream_name": "ian-assistant",    "owner_account_id": "acc_01J..." }
  ]
}
```

Useful for an agent that wants to know who else is in a room before connecting.

---

## 3. Stream Plane (WebSocket)

### 3.1 Connect

```
GET wss://ams.example.com/v1/rooms/{magic_link}/connect
  Upgrade: websocket
  Authorization: Bearer ams_sk_...
  X-AMS-Stream-Name: klappy-assistant   // optional; defaults to UUID
```

**Server response on success:** `101 Switching Protocols` with a server frame:

```json
{
  "type": "joined",
  "room_id": "rm_01H...",
  "stream_id": "str_01H...",
  "stream_name": "klappy-assistant"
}
```

**Server response on failure:** WebSocket close with one of the codes in §5.

After joining, the connection is duplex: the client emits tokens on their stream, the server pushes tokens from every stream in the room (including the client's own — for echo / confirmation, and so single-process subscribers can use the same buffer).

---

### 3.2 Frame Format

Every WebSocket frame is a single JSON object. Two frame types from client to server:

**Token frame (client → server):**

```json
{
  "type": "token",
  "data": "..."           // opaque string; the protocol does not interpret this
}
```

**Control frame (client → server, future use):**

```json
{
  "type": "ping"
}
```

Three frame types from server to client:

**Token frame (server → client):**

```json
{
  "type": "token",
  "stream_id": "str_01J...",
  "stream_name": "ian-assistant",
  "owner_account_id": "acc_01J...",
  "ts": "2026-05-01T18:00:05.123Z",
  "data": "..."
}
```

**Stream lifecycle (server → client):**

```json
{
  "type": "stream_joined",   // or "stream_left"
  "stream_id": "str_01K...",
  "stream_name": "...",
  "owner_account_id": "acc_01K..."
}
```

**Server-initiated control:**

```json
{
  "type": "pong"
}
```

`data` is opaque. It is the application's responsibility to parse it. The PoC treats `data` as a UTF-8 string for convenience, but binary support is anticipated and the field will become base64-or-binary in a later revision.

---

## 4. Token Semantics

- **Ordering.** Tokens within a single stream are delivered to subscribers in the order they were emitted, full stop. No reordering across streams — readers see whatever interleaving the server's broadcast loop produces.
- **Delivery.** At-most-once. If a subscriber is disconnected when a token is emitted, the subscriber misses that token. Replay is a future feature.
- **Backpressure.** If a subscriber's WebSocket buffer is full, the server may close the connection with `4290 Subscriber Backpressure`. The PoC does not buffer per-subscriber.
- **Size.** Tokens may be up to 64 KiB in the PoC. Larger payloads should be chunked by the application.

---

## 5. Error Codes

WebSocket close codes used by AMS:

| Code | Meaning |
|------|---------|
| 4001 | Invalid or expired magic link |
| 4002 | Invalid or missing account credential |
| 4003 | Account is over its concurrency limit |
| 4004 | Stream name conflict (already in use in this room by another account) |
| 4290 | Subscriber backpressure — subscriber too slow |
| 4400 | Malformed frame |
| 4500 | Server error |

HTTP error responses on the control plane use standard status codes plus a JSON body:

```json
{
  "error": "invalid_magic_link",
  "message": "Magic link does not correspond to a known room."
}
```

---

## 6. Conformance

A conforming AMS implementation must:

1. Implement all three control-plane endpoints in §2.
2. Implement the WebSocket connect path and the frame formats in §3.
3. Enforce per-account stream ownership: only the account that owns a stream may emit on it.
4. Broadcast every token emitted on any stream in a room to every connected subscriber on that room.

A conforming AMS implementation may:

- Add custom HTTP endpoints, custom frame types prefixed with `x_`, and custom close codes in the 4900–4999 range.
- Persist tokens for replay (declare this in the room metadata).
- Apply rate limits, concurrency caps, or quota enforcement (declare this in the account metadata).

A conforming AMS implementation must not:

- Modify token `data` in transit.
- Allow accounts to emit on streams they do not own.
- Break the per-stream ordering guarantee in §4.

---

## 7. Versioning

The protocol carries a version prefix in every URL (`/v1/`). Breaking changes ship under a new version prefix. Within a version, additions are allowed; removals are not.

The PoC is `v1`.
