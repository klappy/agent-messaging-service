---
uri: ams://canon/constraints/wire-conformance
title: "Wire Conformance — The MUST and MUST-NOT Checklist for AMS Implementations"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: stable
tags: ["ams", "canon", "constraint", "wire", "protocol", "conformance", "implementation"]
epoch: E0008.4
date: 2026-05-01
derives_from: "PROTOCOL.md §7 (Conformance), PROTOCOL.md §3 §4 §5 §6, ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription"
governs: "Any implementation that claims to be AMS-conformant. Any wrapper, broker, or alternative-transport experiment that wants to interop with the reference deployment."
status: active
---

# Wire Conformance — The MUST and MUST-NOT Checklist for AMS Implementations

> An implementation conforms to AMS if and only if it satisfies every MUST in this list and avoids every MUST-NOT. The MAYs are licenses, not requirements.

## Description

This is the canon mirror of `PROTOCOL.md` §7. The long-form spec is the source of the rules; this file restates them as a checklist so an implementer can verify conformance against a single addressable URI rather than reading the full protocol document. When the protocol changes, this file changes with it; the protocol is the authority.

Every rule below is a wire-level commitment. Application-level conventions (turn semantics, capability schemas, termination) live in separate canon and are not part of conformance.

## Outline

- MUST
- MUST NOT
- MAY
- How to Use This Checklist
- What Conformance Does Not Imply

---

## MUST

A conforming AMS implementation must:

1. **Implement the three control-plane endpoints** in `PROTOCOL.md` §3:
   - `POST /v1/accounts` (account creation, returns a credential exactly once).
   - `POST /v1/{namespace}/conversations` (conversation minting, returns a magic link).
   - `GET /v1/{namespace}/conversations/{alias}` (conversation inspection).
2. **Implement the WebSocket connect path and the frame formats** in `PROTOCOL.md` §4. Both client→server frames (`token`, `set_metadata`, `ping`) and server→client frames (`joined`, `token`, `stream_joined`, `stream_left`, `stream_metadata`, `pong`) are required.
3. **Enforce per-account stream ownership.** Only the account that owns a stream may emit on it or set its metadata. (Restated as `ams://canon/decisions/D0003-per-account-stream-ownership`.)
4. **Broadcast every token emitted on a stream to every subscriber attached to that stream, except the stream's owning account.** Per-stream ordering is preserved; cross-stream ordering is whatever the broadcast loop produces. Conversation membership is the admission boundary; broadcast is per-stream within that boundary. (Established by `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`.)
5. **Broadcast every metadata change on a stream to every subscriber attached to that stream, except the stream's owning account**, via a `stream_metadata` frame. Initial metadata rides on `stream_joined`.
6. **Structurally exclude self-delivery by default.** The wire MUST NOT deliver a stream's `token` or `stream_metadata` frames to the stream's owning account unless the owner has explicitly opted into self-subscription via the opt-in path in `PROTOCOL.md` §4. The exclusion is a property of subscription registration, not a runtime filter.
7. **Treat magic links as opaque on the client side.** Do not parse, do not modify, do not infer structure. Present intact when joining.
8. **Treat metadata payloads as opaque** — never modify, schema-validate, or filter their contents.

## MUST NOT

A conforming AMS implementation must not:

1. **Modify token `data` in transit.** The broker is a router, not an editor.
2. **Modify stream or conversation `metadata` in transit, or apply a schema to it.** Same router-not-editor rule.
3. **Allow accounts to emit on streams they do not own.** Reject with a malformed-frame close or equivalent.
4. **Allow accounts to set metadata on streams they do not own.** Same enforcement.
5. **Break the per-stream ordering guarantee** in `PROTOCOL.md` §5. Tokens within a single stream are delivered to subscribers in emission order, full stop.
6. **Deliver a stream's tokens to its owning account by default.** Self-delivery is opt-in only; the wire's default is structural exclusion. A broker that echoes own-stream tokens by default is non-conformant under D0009.

## MAY

A conforming AMS implementation may:

- **Use any URL structure for magic links.** The reference shape is recommended but not required. Conformance only requires that the URL routes to a conversation and either carries or does not carry an admission token according to the conversation's authorization policy.
- **Add custom HTTP endpoints**, custom frame types prefixed with `x_`, and custom WebSocket close codes in the `4900–4999` range. Custom additions must not collide with the reserved namespace.
- **Persist tokens for replay.** If replay is offered, declare it in the conversation metadata so subscribers know to expect catch-up.
- **Apply rate limits, concurrency caps, or quota enforcement.** Declare these in the account metadata where useful.
- **Support `jcs-sha256` conversation identifiers** (post-PoC; UUID is the v1 default).
- **Offer opt-in self-subscription.** The wire MAY expose a registration option that lets an account subscribe to a stream it owns. Default behavior remains structural exclusion. If an implementation supports opt-in self-subscription, it should declare the capability in the conversation or account metadata so peers and tooling can detect it.
- **Offer optional emit receipts.** The wire MAY expose an acknowledgment frame returned to the emitter when a token has been accepted for broadcast. Fire-and-forget remains the v1 default; receipts are an opt-in extension. Per D0009 §"Hard Cases Resolved" #1.

## How to Use This Checklist

When building or auditing an implementation, walk the MUSTs in order. Each MUST has a corresponding wire-observable behavior; pair it with a smoke test that proves the behavior. Walk the MUST-NOTs next; each is a security or correctness invariant whose violation is a conformance failure even when nothing visibly breaks.

The MAYs are not test items. They are licenses that allow implementations to differ in shape without losing conformance. An implementation that exercises a MAY should declare it (typically in conversation or account metadata) so peers can adapt.

## What Conformance Does Not Imply

- **Not a quality bar.** Conformance is a wire-level minimum. An implementation can conform and still be slow, fragile, or operationally bad.
- **Not a feature parity claim.** Two conforming implementations may differ on every MAY and still interop on the wire.
- **Not a security claim.** Conformance enforces authorization at the per-stream level, not at the conversation policy level. Conversation-level admission policy beyond the magic-link-plus-account minimum is implementation-defined.
- **Not a replacement for the convention canon.** Conversational AI subscribers, harnessed agents, observability subscribers, and other patterns layer their own conventions on top. Conformance covers the wire; the convention canon covers what runs over it.

## See Also

- `PROTOCOL.md` §7 — the authoritative source
- `PROTOCOL.md` §6 — error and close codes referenced by the rules above
- `ams://canon/decisions/D0003-per-account-stream-ownership` — the ownership rule expanded
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — the structural-exclusion rule that MUSTs #4, #5, #6 derive from
- `ams://canon/constraints/two-agent-conversation-conventions` — application-level conventions that sit above conformance
