---
uri: ams://canon/decisions/D0002-magic-link-as-url
title: "D0002 — The Magic Link Is a URL, Not an Opaque Blob"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: stable
tags: ["ams", "canon", "decision", "magic-link", "addressing", "discovery", "irreversible"]
epoch: E0008.3
date: 2026-05-01
derives_from: "AMS.md §3.2, PROTOCOL.md §2, ARCHITECTURE.md §6, journal/2026-05-01-ams-foundation.tsv (D: The magic link is a URL, not an opaque blob)"
governs: "How conversations are addressed and shared. How clients treat the link. How implementations choose URL structure."
status: active
---

# D0002 — The Magic Link Is a URL, Not an Opaque Blob

> A conversation's address is a URL. Discovery is solved by the URL itself. Clients treat the URL as opaque from the protocol's perspective; URL structure is a deployment-side choice.

## Description

The magic link that addresses a conversation is shaped as a URL, not as a custom token format, JWT, or opaque envelope. The URL routes to a conversation and either carries or does not carry an admission token according to the conversation's authorization policy. This decision settles addressing, discovery, and out-of-band sharing in one move.

The URL shape used by the reference implementation is `https://<host>/<namespace>/conversations/<alias>?t=<permissive-token>`, but conformance does not require this exact shape. Other AMS implementations may use different URL structures.

## Outline

- Why a URL Won
- The Two-Door Reading
- What Clients Must Do
- What This Forecloses
- What This Is Not

---

## Why a URL Won

**Discovery is solved trivially.** The URL is the address. There is no separate registry to query, no DNS-like resolution layer, no broker introspection step. Any AMS instance is reachable by the URL it issues.

**Account-scoped paths make ownership visible.** The `<namespace>` segment names whose conversation it is. Anyone reading the link knows the owning account without parsing further. The global-namespace collision problem disappears because every conversation lives inside an account namespace.

**Out-of-band sharing is unconstrained.** The URL fits into Signal, email, a QR code, a voice memo, a sticky note, a printed page. Any channel a human or an agent can move text through is a channel the magic link works on. There is no required vendor-specific share surface.

## The Two-Door Reading

The URL also encodes the two-door registration model:

1. **Magic link presented** → AMS knows which conversation to attach to. The permissive token in the query parameter authorizes admission.
2. **Account credentials presented in the `Authorization` header** → AMS knows whose stream is being bound.

Magic link unlocks the conversation. Account credential unlocks the write surface. Two distinct credentials, two distinct concerns, one URL.

## What Clients Must Do

- **Treat the URL as opaque.** Do not parse it. Do not modify it. Do not infer structure. Present it intact when joining a conversation.
- **Pass it through unchanged.** Out-of-band channels (Signal, email, etc.) must not normalize, rewrite, or strip query parameters.

## What This Forecloses

- AMS cannot retroactively become an opaque-blob protocol within a major version without breaking every client that already treats the link as a URL for sharing.
- Implementations that want richer admission semantics (expiry, revocation, single-use, invite list) must do so by replacing the bearer token in `?t=` with a richer token format, not by changing the URL shape itself.

## What This Is Not

- Not a commitment to the reference URL shape across all implementations. The reference shape is recommended; conformance only requires that the URL routes to a conversation and carries (or does not carry) an admission token.
- Not a stance on which token format the `?t=` parameter should use. Random bytes, JWT, signed envelope — those are deployment choices.
- Not a guarantee that magic links live forever. Revocation and expiry are deferred-not-foreclosed (see `SPEC.md` §5).

## See Also

- `AMS.md` §3.2 — full long-form argument including the two-door framing
- `PROTOCOL.md` §2 — wire-level treatment of the URL
- `ARCHITECTURE.md` §6 — reference implementation's URL minting
- `ams://canon/decisions/D0004-two-door-registration` — the credential split this URL enables
