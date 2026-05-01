---
uri: ams://canon/constraints/observability-payload-boundary
title: "Observability Payload Boundary — What Observers May Capture, Ship, and Persist"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: stable
tags: ["ams", "canon", "constraint", "observability", "privacy", "safety", "payload-opacity"]
epoch: E0008.3
date: 2026-05-01
derives_from: "PROTOCOL.md §4.1, PROTOCOL.md §4.4, PROTOCOL.md §7 (must not modify or schema-validate metadata in transit), ARCHITECTURE.md §8 (PoC does not log token contents), klappy://canon/constraints/telemetry-governance"
complements: "ams://canon/decisions/D0009-observability-via-subscriber-not-wire, ams://canon/principles/observability-as-subscriber"
governs: "Every observability subscriber on AMS, every infrastructure hook on the broker, and every sink that receives data from either. Defines the safety floor for what may be captured at the wire and what must never leave the broker."
status: active
---

# Observability Payload Boundary — What Observers May Capture, Ship, and Persist

> AMS preserves payload privacy by default. Observability inherits this default and tightens it where the upstream telemetry doctrine is more restrictive. Capture the shape of activity. Discard the substance. If a captured value reveals what someone was thinking rather than what they were doing, it is outside the boundary.

## Description

The wire treats token `data` and metadata payloads as opaque (`PROTOCOL.md` §7). The PoC broker logs no token contents (`ARCHITECTURE.md` §8). Observability extends this opacity into every sink that receives data from a subscriber or a hook.

Two failure modes drive the constraint. First, an observability sink that captures payload contents becomes a single point of compromise for every conversation it observes. Second, a subscriber that captures payload contents while declaring `role: "observability_sink"` violates the trust other peers extended when joining the same conversation. The boundary names what observers may take and what they must leave on the wire.

The upstream telemetry constraint (`klappy://canon/constraints/telemetry-governance`) is the source of the philosophy and the authoritative reference for the hook layer's sink shape. This article is the AMS-specific extension that covers the subscriber layer and the additional fields the wire exposes.

## Outline

- The Capture Allowlist
- The Capture Blocklist
- The Hook-Layer Schema
- The Subscriber-Layer Schema
- Hashing and Pseudonymization
- Retention and Sink Hygiene
- What This Is Not

---

## The Capture Allowlist

An observability subscriber or broker hook may capture and ship the following fields. Every other field is excluded by default.

### Identifiers (structural)

- `account_id` — the owning account of a stream, or the calling account on a control-plane request
- `namespace` — the URL-safe namespace owning a conversation
- `conversation_id` — the conversation identifier
- `stream_id` — the stream identifier
- `stream_name` — the human-readable stream handle, when present in the broadcast frame
- `alias` — the human-readable conversation handle

### Lifecycle and timing

- `event_type` — the wire frame type (`token`, `stream_joined`, `stream_left`, `stream_metadata`) or hook event class (`account_created`, `conversation_minted`, `connect_attempted`, `connect_failed`, `do_started`, `do_evicted`, etc.)
- `ts` — server timestamps as carried on the wire frame, or hook-recorded UTC timestamps for broker events
- `close_code` — WebSocket close codes (4001–4005, 4290, 4400, 4500, custom 4900–4999) and the matched reason name from `PROTOCOL.md` §6
- `error_code` — control-plane error identifiers from the JSON error body when present

### Shape, not substance

- `bytes_in` / `bytes_out` — UTF-8 byte length of payloads, never the payloads themselves
- `token_count` — count of tokens emitted on a stream within an aggregation window, never the tokens themselves
- `metadata_keys` — the top-level keys present in a metadata object (e.g., `["capabilities", "annotations"]`), never their values
- `capabilities_convention_name` — the sub-key name under `capabilities` (e.g., `ams.convention.v1`), if present, never the convention's contents
- `peer_count_at_event` — number of streams in the conversation at the moment of the event
- `do_concurrency_at_event` — DO concurrency budget consumed at the event, when the hook layer can read it

### Self-declared identifiers

- The values of stream metadata fields the subscriber explicitly declares as observable in its own `capabilities` block, scoped to the subscriber's own stream. A subscriber may volunteer its own `display_name`, `version`, `contact`, `homepage`. It may not volunteer them for peers.

## The Capture Blocklist

The following are excluded from every observability sink under every circumstance:

- **Token `data` contents.** Never captured, never hashed, never sampled. The byte count is captured; the bytes are not.
- **Metadata values.** Keys are observable; values are not. A peer's declared `capabilities` schema, `display_name`, `contact`, or any annotation value remains private to the conversation. The presence of the key is recordable; its content is not.
- **Account credentials.** The bearer token returned by `POST /v1/accounts` and presented in `Authorization` headers. The credential is shown exactly once at issuance (`PROTOCOL.md` §3.1) and never appears in any sink.
- **Permissive tokens.** The `?t=` value in the magic link. Never captured. The presence of a permissive token on a connect attempt is recordable; the token's value is not.
- **Magic links.** The full URL including the permissive token. The conversation `alias` and `namespace` are recordable; the assembled magic link is not.
- **IP addresses and connection metadata.** Source IPs, geo-derived locations, fingerprintable connection details. The Cloudflare colo or region of a DO is recordable as infrastructure shape; the originating IP of a peer is not.
- **Peer identity above the account ID.** Whatever identity scheme an account chooses to attach to itself (real names, organization affiliation, OIDC claims, signed agent specs) lives in metadata or out-of-band. The account_id is the identifier observability uses; richer identity does not flow into the sink.
- **Out-of-band material.** Anything carried out-of-band between peers (Signal messages sharing a magic link, external coordination chats, harness-private state) is invisible to AMS by design and remains invisible to observability.

The principle is the upstream phrasing: if a captured value reveals what someone was thinking rather than what they were doing, it does not belong in the sink.

## The Hook-Layer Schema

The hook layer mirrors the upstream telemetry schema (`klappy://canon/constraints/telemetry-governance` §"What Is Tracked") with substitutions for AMS-specific dimensions. The recommended Cloudflare Analytics Engine shape:

### Blobs (categorical)

| Slot | Field | Example |
|------|-------|---------|
| 1 | `event_type` | `account_created`, `conversation_minted`, `connect_failed`, `do_started` |
| 2 | `endpoint_or_close_code` | `POST /v1/accounts`, `4001`, `4290` |
| 3 | `namespace` | `klappy` |
| 4 | `account_id_hash` | first 12 hex chars of SHA-256 of `account_id` |
| 5 | `conversation_id_hash` | first 12 hex chars of SHA-256 of `conversation_id`, or `none` |
| 6 | `error_code` | `invalid_magic_link`, `bad_credential`, or `none` |
| 7 | `worker_version` | `0.1.0` |
| 8 | `region` | Cloudflare colo identifier |

### Doubles (numeric, all SUM-aggregable)

| Slot | Field | Notes |
|------|-------|-------|
| 1 | `count` | always 1, for SUM aggregation |
| 2 | `duration_ms` | wall-clock at the worker edge |
| 3 | `bytes_in` | UTF-8 length of request body |
| 4 | `bytes_out` | UTF-8 length of response body |
| 5 | `peer_count_at_event` | streams in conversation at event time, or 0 for control plane |
| 6 | `do_concurrency_at_event` | when readable; 0 otherwise |

The schema is a recommendation, not a wire requirement. Other deployments may choose a different sink and a different shape provided they respect the capture allowlist and blocklist above.

## The Subscriber-Layer Schema

A subscriber records one event per server-pushed frame it observes. The recommended record shape:

```json
{
  "kind": "token" | "stream_joined" | "stream_left" | "stream_metadata" | "joined",
  "conversation_id": "conv_01H...",
  "stream_id": "str_01J...",
  "owner_account_id": "acc_01J...",
  "stream_name": "klappy-assistant",
  "ts": "2026-05-01T18:00:05.123Z",
  "bytes": 1024,
  "metadata_keys": ["capabilities", "annotations"],
  "capabilities_convention_name": "ams.convention.v1",
  "peer_count_at_event": 3
}
```

For `token` events, `bytes` is the UTF-8 length of the token's `data` field. The `data` field itself is not recorded. For `stream_metadata` events, `metadata_keys` is the top-level key list; values are not recorded.

A subscriber that needs to record additional fields adds them under a clearly-namespaced prefix (e.g., `x_orgname_`) and remains responsible for verifying that every added field stays inside the boundary.

## Hashing and Pseudonymization

The hook layer hashes `account_id` and `conversation_id` before they leave the broker. The subscriber layer is permitted to record the raw identifiers because subscribers already know them through their own conversation membership. The asymmetry is deliberate: the hook layer aggregates across all conversations on the broker and is the higher-trust position; the subscriber layer sees only what its conversations broadcast and is the lower-trust position by virtue of scope.

Sinks that aggregate data from multiple subscribers across multiple conversations (e.g., a hosted DOLCHE journal serving several operators) treat the aggregated view as hook-equivalent and apply hashing on ingest.

The hash is unkeyed SHA-256 truncated to 12 hex characters. Truncation prevents trivial reversal while preserving aggregation cardinality. Operators that need stronger pseudonymization apply a keyed HMAC with a sink-local secret; the secret stays out of the sink.

## Retention and Sink Hygiene

- **Default retention.** Cloudflare Workers Analytics Engine retains 3 months by default (`klappy://canon/constraints/telemetry-governance` §"Storage and Infrastructure"). Subscriber-layer sinks set their own retention; the recommendation is no longer than what the operator can defend on inspection.
- **Aggregation snapshots.** Long-term trend data is kept as aggregates, not raw events. A snapshot is computed from the raw sink before retention expires and stored in a durable location (KV, R2, a canon article) that does not contain raw identifiers.
- **Right to be forgotten.** When an account is deleted (post-PoC capability), the hook layer purges hashed records by recomputing the hash and deleting matches. The subscriber layer's records are the operator's responsibility; the boundary recommends a similar purge path.
- **No payload accidents.** Sinks that accept arbitrary record shapes (e.g., a generic log forwarder) are configured with a schema validator that rejects records carrying any key in the blocklist. The validation is the last line of defense; the first line is never capturing the payload at all.

## What This Is Not

- Not a wire-level enforcement. The wire echoes payloads to every subscriber by design (`PROTOCOL.md` §4.1). The boundary is a discipline observers commit to, not a guarantee the broker provides.
- Not a substitute for application-level encryption. A subscriber that wants its tokens to be unreadable to other subscribers (including observers) encrypts at the application layer. The boundary protects against well-meaning observers exceeding their scope; it does not protect against hostile peers.
- Not a refusal to support content-aware observability for specific use cases. A conversation may be operated under a metadata declaration that licenses content capture (e.g., a public-canon conversation explicitly marked as logged in full). The boundary is the default; declared exceptions live in conversation metadata and are the operator's call.
- Not a permanent block on richer hook-layer capture. If an operational need surfaces (e.g., capturing the close-reason text on 4500 server errors for debugging), the boundary is amended through SPEC §14 revision discipline. The default tightens, never silently loosens.

## See Also

- `klappy://canon/constraints/telemetry-governance` — upstream telemetry doctrine, authoritative for the hook-layer sink shape
- `PROTOCOL.md` §4.1 — the wire's broadcast rule
- `PROTOCOL.md` §7 — the wire's payload-opacity rule
- `ARCHITECTURE.md` §8 — the PoC observability staging
- `ams://canon/decisions/D0009-observability-via-subscriber-not-wire` — the architectural commit this constraint enforces
- `ams://canon/principles/observability-as-subscriber` — how subscribers operate under this constraint
- `ams://canon/principles/own-stream-echo-must-be-filtered` — observability subscribers are explicitly named as a class that must filter
- `ams://canon/constraints/permanent-non-goals` — item 1 (identity) and item 2 (metadata schema) frame why this constraint is needed
