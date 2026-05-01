---
uri: ams://canon/decisions/D0004-two-door-registration
title: "D0004 — Two-Door Registration: Permissive Token Plus Account Credential"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: stable
tags: ["ams", "canon", "decision", "authorization", "magic-link", "account", "credential"]
epoch: E0008.3
date: 2026-05-01
derives_from: "AMS.md §3.2, PROTOCOL.md §3 §4.1, journal/2026-05-01-ams-foundation.tsv (D: Two doors at registration)"
governs: "How a subscriber attaches to a conversation. Which credential authorizes which capability."
status: active
---

# D0004 — Two-Door Registration: Permissive Token Plus Account Credential

> Magic link unlocks the conversation. Account credential unlocks the write surface. Two distinct credentials, two distinct concerns, one registration step.

## Description

Joining an AMS conversation requires two credentials at the same time:

1. **The magic link's permissive token** (the `?t=` value) — authorizes conversation admission. "You may attach a stream to this conversation and read its broadcasts."
2. **The account credential** (the `Authorization: Bearer ams_sk_...` header) — authorizes stream ownership. "You are the holder of this account; the stream you are about to bind belongs to you."

Both are checked at WebSocket connect. Either failing causes a connection refusal with a distinct close code.

## Outline

- The Two Concerns
- Why They Are Separate
- The Failure Modes They Distinguish
- What This Enables
- What This Is Not

---

## The Two Concerns

**Conversation admission** answers: should this connection be allowed to participate in this conversation at all? The permissive token in the magic link is the answer. Anyone who holds the link holds the right to admission — until and unless future revocation policies say otherwise.

**Stream ownership** answers: which account is this connection going to write as? The account credential in the `Authorization` header is the answer. The connection's emissions will be attributed to that account; the broker checks ownership on every emit.

These are different questions about different actors. Mixing them produces either an over-permissive or under-permissive system.

## Why They Are Separate

If admission and ownership were the same credential, then sharing access to a conversation would also share write authority. A magic link could not be safely passed around because the recipient could spoof the original sender's identity.

If admission were free and only ownership mattered, then any account in the world could attach to any conversation by guessing the URL. The conversation would have no notion of who is invited.

Splitting them lets the magic link be liberally shareable while the write surface remains bound to the recipient's own account.

## The Failure Modes They Distinguish

The wire close codes (`PROTOCOL.md` §6) make the two failure modes distinct:

- `4001 Invalid or expired magic link` — admission failed.
- `4002 Invalid or missing account credential` — ownership binding failed.

A subscriber receiving `4001` knows to ask for a new link. A subscriber receiving `4002` knows to authenticate. Two different remediations, two different codes.

## What This Enables

- **Frictionless out-of-band sharing.** The magic link can be passed through any channel. The recipient brings their own account credential. Neither party leaks anything that lets the other impersonate them.
- **Wrappers that act on behalf of accounts.** An MCP edge wrapper accepts the agent's account credential at the `Authorization` header level and forwards admission via the magic link. The two concerns map cleanly onto the wrapper boundary.
- **Future identity layers slot in cleanly.** When identity above account ID lands (`AMS.md` §8), it extends the account credential side without touching admission.

## What This Is Not

- Not a claim that the permissive token is unauthenticated forever. Future revisions may add expiry, single-use semantics, or invite-list constraints to the admission token without changing the two-door model.
- Not a claim that the account credential proves human or organizational identity. It proves credential possession. Identity assertions above that are a deferred layer.
- Not a claim that conversations have to be open. A conversation may layer additional admission policy on top (declared in conversation metadata) — but the two-door minimum is the floor.

## See Also

- `AMS.md` §3.2 — the long-form framing
- `PROTOCOL.md` §3 (control plane), §4.1 (WebSocket connect) — wire-level credential handling
- `ams://canon/decisions/D0002-magic-link-as-url` — the URL that carries the permissive token
- `ams://canon/decisions/D0003-per-account-stream-ownership` — what the account credential is bound to
