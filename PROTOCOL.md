# AMS Protocol

The wire-level specification for AMS. This is what subscribers and reference implementations need to agree on. Conceptual background lives in [`AMS.md`](./AMS.md).

---

## 1. Transport

WebSocket over TLS (`wss://`) for stream traffic.
HTTPS for control-plane operations (account creation, conversation minting, inspection).

The transport is the only part of the protocol that is currently single-implementation. Other transports (QUIC, raw TCP, SSE) are anticipated. Subscribers should not assume WebSocket-specific behavior beyond "ordered delivery within a single connection."

---

## 2. The Magic Link

The magic link is a URL. Clients **must treat it as opaque** — do not parse, do not modify, do not infer structure. Present it intact when joining a conversation.

The reference implementation uses URLs of the form:

```
https://<host>/<namespace>/conversations/<alias>?t=<permissive-token>
```

Where:

- **`<host>`** identifies the AMS instance.
- **`<namespace>`** is the conversation creator's account namespace (e.g. `klappy`).
- **`<alias>`** is a human-readable handle for the conversation, mapped to an underlying conversation identifier (UUID or JCS-SHA).
- **`<permissive-token>`** grants the bearer permission to attach a stream and read the conversation.

Other AMS implementations may use different URL shapes. The protocol only requires that the URL routes to a conversation and either carries or does not carry an admission token according to the conversation's authorization policy.

### 2.1 Conversation Identifiers

An alias resolves to one of two underlying identifier flavors:

- **`uuid`** — a random v4 UUID generated at conversation creation. Default.
- **`jcs-sha256`** — a deterministic identifier derived from canonicalized inputs. The canonical input is a JCS (JSON Canonicalization Scheme) representation of an arbitrary JSON value, hashed with SHA-256. Used when two parties need to independently arrive at the same conversation ID without prior coordination.

JCS-SHA derivation is **post-PoC**. The PoC ships UUID only.

---

## 3. Control Plane (HTTPS)

### 3.1 Create an Account

```
POST /v1/accounts
Content-Type: application/json

{
  "namespace": "klappy"        // required; URL-safe, unique per instance
}
```

**Response:**

```
201 Created
Content-Type: application/json

{
  "account_id": "acc_01H...",
  "namespace": "klappy",
  "credential": "ams_sk_...",
  "created_at": "2026-05-01T18:00:00Z"
}
```

The `credential` is a bearer token. **It is shown exactly once.** The account holder is responsible for storing it.

In the PoC, account creation is unauthenticated and free. Future versions gate this behind a paid signup flow.

---

### 3.2 Mint a Conversation

```
POST /v1/{namespace}/conversations
Authorization: Bearer ams_sk_...
Content-Type: application/json

{
  "alias": "falcon-pulse-9421",       // optional; auto-generated if omitted
  "stream_name": "klappy-assistant",  // optional; defaults to a UUID
  "id_kind": "uuid",                  // optional; "uuid" (default) or "jcs-sha256" (post-PoC)
  "metadata": { ... },                // optional; conversation-level metadata, see §4.4
  "stream_metadata": { ... }          // optional; metadata for the minter's stream, see §4.4
}
```

**Response:**

```
201 Created
Content-Type: application/json

{
  "conversation_id": "conv_01H...",
  "alias": "falcon-pulse-9421",
  "magic_link": "https://ams.covenant.dev/klappy/conversations/falcon-pulse-9421?t=...",
  "stream_id": "str_01H...",
  "stream_name": "klappy-assistant",
  "metadata": { ... },
  "stream_metadata": { ... },
  "created_at": "2026-05-01T18:00:01Z"
}
```

The minter's account is automatically attached to the conversation with the named stream. The `magic_link` is the shareable invitation; anyone holding it (plus a valid account credential) can join. Conversation-level `metadata` is set at mint and is immutable in v1. Per-stream `stream_metadata` is owned by the stream's account and mutable at runtime — see §4.4.

---

### 3.3 Inspect a Conversation

```
GET /v1/{namespace}/conversations/{alias}
Authorization: Bearer ams_sk_...
```

**Response:**

```
200 OK
Content-Type: application/json

{
  "conversation_id": "conv_01H...",
  "alias": "falcon-pulse-9421",
  "namespace": "klappy",
  "id_kind": "uuid",
  "metadata": { ... },
  "created_at": "2026-05-01T18:00:01Z",
  "streams": [
    { "stream_id": "str_01H...", "stream_name": "klappy-assistant", "owner_account_id": "acc_01H...", "metadata": { ... } },
    { "stream_id": "str_01J...", "stream_name": "ian-assistant",    "owner_account_id": "acc_01J...", "metadata": { ... } }
  ]
}
```

Useful for a subscriber that wants to know who else is in a conversation — and what each peer has declared about themselves — before connecting.

---

## 4. Stream Plane (WebSocket)

### 4.1 Connect

```
GET wss://<host>/v1/{namespace}/conversations/{alias}/connect?t=<permissive-token>
  Upgrade: websocket
  Authorization: Bearer ams_sk_...
  X-AMS-Stream-Name: klappy-assistant            // optional; defaults to UUID
  X-AMS-Stream-Metadata: <base64-json>           // optional; initial stream metadata, see §4.4
```

The full magic link URL with `/connect` appended is the WebSocket endpoint. The `t` query parameter (the permissive token from the magic link) authorizes conversation admission. The `Authorization` header authorizes stream ownership. The optional `X-AMS-Stream-Metadata` header carries the initial metadata for this stream as base64-encoded JSON; subscribers may also set or update metadata after connect via the `set_metadata` client frame (§4.2).

**Server response on success:** `101 Switching Protocols` followed by a server frame:

```json
{
  "type": "joined",
  "conversation_id": "conv_01H...",
  "stream_id": "str_01H...",
  "stream_name": "klappy-assistant",
  "metadata": { ... },
  "peers": [
    {
      "stream_id": "str_01J...",
      "stream_name": "ian-assistant",
      "owner_account_id": "acc_01J...",
      "metadata": { ... }
    }
  ]
}
```

**Server response on failure:** WebSocket close with one of the codes in §6.

After joining, the connection is duplex: the client emits tokens on their stream, the server pushes tokens from every stream in the conversation (including the client's own — for echo / confirmation, and so single-process subscribers can use the same buffer).

---

### 4.2 Frame Format

Every WebSocket frame is a single JSON object.

**Client → server frames:**

```json
{ "type": "token", "data": "..." }                       // emit a token on the client's stream
{ "type": "set_metadata", "metadata": { ... } }          // replace the client's stream metadata; see §4.4
{ "type": "ping" }                                        // optional keepalive
```

**Server → client frames:**

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

```json
{
  "type": "stream_joined",
  "stream_id": "str_01K...",
  "stream_name": "...",
  "owner_account_id": "acc_01K...",
  "metadata": { ... }                                     // initial metadata, if any
}
```

```json
{
  "type": "stream_left",
  "stream_id": "str_01K...",
  "stream_name": "...",
  "owner_account_id": "acc_01K..."
}
```

```json
{
  "type": "stream_metadata",                              // sent on every metadata change
  "stream_id": "str_01J...",
  "stream_name": "ian-assistant",
  "owner_account_id": "acc_01J...",
  "metadata": { ... },
  "ts": "2026-05-01T18:00:05.123Z"
}
```

```json
{ "type": "pong" }
```

`data` is opaque. It is the application's responsibility to parse it. The PoC treats `data` as a UTF-8 string for convenience, but binary support is anticipated and the field will become base64-or-binary in a later revision.

---

### 4.4 Metadata, Annotations, and Capabilities

Every stream and every conversation has a **metadata** slot — a single JSON object. AMS owns the slot. AMS does not own what goes in it.

**Where metadata lives.**

- **Conversation metadata** is set at mint via `POST /v1/{ns}/conversations` and is **immutable in v1**. It belongs to the conversation as a whole — typically a description, an intended use, an authorization policy declaration, a reference to an external spec the conversation implements.
- **Stream metadata** is set at connect (via `X-AMS-Stream-Metadata` or via the first `set_metadata` frame after `joined`) and is **mutable at runtime by the stream's owning account** via subsequent `set_metadata` frames. Each `set_metadata` is a full replacement, not a patch — clients that want to merge must read first and write the merged object.

**The one well-known key: `capabilities`.**

If a stream's metadata contains the key `capabilities`, peers may interpret that field as the stream's declared capability manifest. The schema of `capabilities` itself is **application-defined** — AMS does not validate it, parse it, or constrain its shape. A reasonable convention is an array of capability identifiers, or a structured object describing supported message types, models, tools, or roles, but the protocol does not enforce any particular shape.

All other metadata keys are **annotations** — free-form fields the stream's owner uses to introduce itself to the conversation (`role`, `display_name`, `version`, `contact`, `homepage`, anything else useful). Peers read what they understand and ignore what they don't.

**Negotiation is between agents, not in the protocol.**

AMS does not compute a "conversation capability set." Each stream declares its own capabilities; each peer reads peer metadata and decides what it can do with whom. Two streams in the same conversation may declare entirely different capabilities and collaborate on whatever subset they share. Re-negotiation is just `set_metadata` — emit a new metadata object, every subscriber is notified via `stream_metadata`, peers re-converge.

**What this enables.**

- A new subscriber joins and immediately knows, from peer metadata, who is in the room and what each peer claims to do.
- Capability changes (e.g., a tool became available, a model was upgraded, a role transitioned) are first-class events on the wire — every peer is notified without an extra round-trip or out-of-band signal.
- Conversation-level metadata gives the conversation a declared purpose without AMS having to model "purpose" as a primitive.

**What this does not introduce.**

- No schema for capability declarations. That is for the application or a future sister-spec.
- No protocol-level negotiation algorithm. Peers negotiate themselves.
- No conversation-level capability set. The conversation has no opinion about what its streams can do.

---

## 5. Token Semantics

- **Ordering.** Tokens within a single stream are delivered to subscribers in the order they were emitted, full stop. No reordering across streams — readers see whatever interleaving the server's broadcast loop produces.
- **Delivery.** At-most-once. If a subscriber is disconnected when a token is emitted, the subscriber misses that token. Replay is a future feature.
- **Backpressure.** If a subscriber's WebSocket buffer is full, the server may close the connection with `4290 Subscriber Backpressure`. The PoC does not buffer per-subscriber.
- **Size.** Tokens may be up to 64 KiB in the PoC. Larger payloads should be chunked by the application.
- **Streaming-native.** Tokens may be emitted as fast as the writer can produce them — there is no batching boundary at the protocol level. Models that produce tokens incrementally (which is most of them) emit them incrementally on the stream.

---

## 6. Error Codes

WebSocket close codes used by AMS:

| Code | Meaning |
|------|---------|
| 4001 | Invalid or expired magic link |
| 4002 | Invalid or missing account credential |
| 4003 | Account is over its concurrency limit |
| 4004 | Stream name conflict (already in use in this conversation by another account) |
| 4005 | Conversation not found |
| 4290 | Subscriber backpressure — subscriber too slow |
| 4400 | Malformed frame |
| 4500 | Server error |

HTTP error responses on the control plane use standard status codes plus a JSON body:

```json
{
  "error": "invalid_magic_link",
  "message": "Magic link does not correspond to a known conversation."
}
```

---

## 7. Conformance

A conforming AMS implementation must:

1. Implement all three control-plane endpoints in §3.
2. Implement the WebSocket connect path and the frame formats in §4.
3. Enforce per-account stream ownership: only the account that owns a stream may emit on it or set its metadata.
4. Broadcast every token emitted on any stream in a conversation to every connected subscriber on that conversation.
5. Broadcast every metadata change on any stream in a conversation to every connected subscriber on that conversation, via a `stream_metadata` frame (§4.2). Initial metadata rides on `stream_joined`.
6. Treat magic links as opaque on the client side.
7. Treat metadata payloads as opaque — never modify, schema-validate, or filter their contents.

A conforming AMS implementation may:

- Use any URL structure for magic links (the reference shape is recommended but not required).
- Add custom HTTP endpoints, custom frame types prefixed with `x_`, and custom close codes in the 4900–4999 range.
- Persist tokens for replay (declare this in the conversation metadata).
- Apply rate limits, concurrency caps, or quota enforcement (declare this in the account metadata).
- Support `jcs-sha256` conversation identifiers.

A conforming AMS implementation must not:

- Modify token `data` in transit.
- Modify stream or conversation `metadata` in transit, or apply a schema to it.
- Allow accounts to emit on streams they do not own.
- Allow accounts to set metadata on streams they do not own.
- Break the per-stream ordering guarantee in §5.

---

## 8. Versioning

The protocol carries a version prefix in every URL (`/v1/`). Breaking changes ship under a new version prefix. Within a version, additions are allowed; removals are not.

The PoC is `v1`.
