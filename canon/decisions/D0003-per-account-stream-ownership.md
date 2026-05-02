---
uri: ams://canon/decisions/D0003-per-account-stream-ownership
title: "D0003 — Per-Account Stream Ownership (the Inverted Inbox)"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: stable
tags: ["ams", "canon", "decision", "stream", "ownership", "subscription", "authorization", "inverted-inbox", "irreversible"]
epoch: E0008.4
date: 2026-05-01
derives_from: "AMS.md §3 (primitives), PROTOCOL.md §4 §7 (conformance), GLOSSARY.md (Inverted inbox), journal/2026-05-01-ams-foundation.tsv"
complements: "ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription"
governs: "Who can write what, and who can read what. The central security and addressing simplification of AMS. Cannot be reversed without breaking the admission and broadcast model."
status: active
---

# D0003 — Per-Account Stream Ownership (the Inverted Inbox)

> A stream is owned by exactly one account. Only the owning account may emit on it. Every other admitted account in the conversation may subscribe to read it. The owning account is structurally not a subscriber to its own stream — the wire never delivers a stream's tokens to its owner. Writers do not push into anyone else's inbox; readers choose what to listen to.

## Description

Inside a conversation, every stream has exactly one owner — the account that created it. The owning account is the only entity that may emit tokens on that stream or set its metadata. Other admitted accounts in the same conversation read streams they have subscribed to, and cannot write to streams they do not own.

Crucially, **ownership and subscription are mutually exclusive states**. The wire structurally does not deliver a stream's tokens back to its owning account. There is no echo, no self-delivery, and no need for the owner to filter their own emissions on the input side. This property is established more fully in `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`; D0003 carries the ownership rule, D0009 carries the structural-exclusion rule, and together they define the read/write semantics of a stream.

This inverts the inbox model that email and chat assume. Email and chat let writers push into your inbox and you sort the clutter. AMS lets you own your output stream and others choose to listen. There is no inbox to clutter because there is no push surface for writers to push into; there are only streams that subscribers attach to.

This is a one-way door. The whole authorization model collapses if a stream can be written by more than one account, and the broadcast model collapses if owners receive their own emissions back at the wire layer.

## Outline

- The Three Constraints
- Why the Inversion Matters
- What This Enables in the Reference Implementation
- What This Forecloses
- What This Is Not

---

## The Three Constraints

A conforming AMS implementation **must** enforce all three:

1. **Emission ownership.** Only the account that owns a stream may emit tokens on it. A `token` frame from a different account is rejected.
2. **Metadata ownership.** Only the account that owns a stream may set its metadata. A `set_metadata` frame from a different account is rejected.
3. **Subscription exclusion.** The wire never delivers a stream's tokens to its owning account by default. The owner is structurally not a subscriber to its own stream. (See D0009 for the full rationale, opt-in behavior, and the wire-level commitment.)

All three rules appear in `PROTOCOL.md` §7 as MUST-NOTs and MUSTs.

## Why the Inversion Matters

**Authorization simplifies to ownership.** AMS does not need an ACL system, role assignments, or permission matrices to settle who can write what. Every write is checked against a single fact: does this account own this stream?

**There is no shared mailbox.** No-one can spoof a stream because no-one else can write to it. A subscriber receiving a token already knows which account emitted it; the broadcast loop attached the `owner_account_id` at emit time.

**There is no self-feedback loop.** Combined with D0009's structural exclusion, an account cannot accidentally treat its own emissions as input. The class of bug that previously required subscriber-side discipline (filter-on-`owner_account_id` before acting) is unrepresentable at the wire layer.

**Provenance is built into the wire.** Every server-pushed `token` frame carries the emitting `stream_id`, `stream_name`, and `owner_account_id`. Readers do not have to trust an envelope for sender identity; the broker attests it.

**The harness pattern works.** A harnessed agent emits on its instance's stream; the harness's account ID is the provenance. Many instances of the same spec running in parallel are unambiguously distinguishable because each instance owns its own stream.

## What This Enables in the Reference Implementation

- **No per-conversation ACL.** The Conversation DO checks `owner_account_id` matches `account_id` on every emit. That is the entire authorization check at the broadcast layer.
- **No subscriber-side echo filter required.** Combined with D0009, the wire never delivers self-echoes. Subscribers do not implement filtering logic; what arrives is what they should act on.
- **Stream-level audit by construction.** The journal observability pattern (deferred to post-PoC) gets clean per-account attribution for free.
- **Polymorphic subscribers stay polymorphic.** A wrapper, a Worker, a webhook adapter, an SMS adapter all get the same write-ownership semantics. A wrapper acts on behalf of the account it represents; it cannot act on behalf of another account.

## What This Forecloses

- AMS cannot ship multi-writer streams within a major version. A pattern like "two agents collaborating on one output stream" must be implemented as two streams plus a downstream merger, not as shared write access.
- AMS cannot ship a "post on behalf of" model. Every emit is bound to the emitting account.
- Stream renames cannot transfer ownership. A stream's owning account is fixed at registration.
- AMS cannot ship a wire mode that delivers a stream's tokens back to its owner by default. Self-observability is opt-in only (see D0009).

## What This Is Not

- Not a constraint on subscribing to *other* accounts' streams. Read access to streams you do not own is governed by conversation admission (the magic link's permissive token plus any conversation-level policy), not by per-stream ACLs.
- Not a constraint on opt-in self-subscription. An account that has a legitimate reason to read its own stream may opt into subscribing to it. The default is structural exclusion; the door is open if an application needs it (see D0009 §"Self-Observability").
- Not a constraint on how many streams an account can own in a conversation. The PoC enforces one stream per account per conversation, but the protocol allows multi-stream ownership when the use case lands (`SPEC.md` §5 deferred items). The exclusion rule extends naturally: an account that owns N streams in a conversation does not subscribe to any of those N by default.
- Not a claim that account identity is verified. Account credentials prove "you are the holder of this credential," not "you are the human or organization the credential was issued to." Identity above the account ID is a deferred-not-foreclosed layer (`AMS.md` §8).

## See Also

- `AMS.md` §3 — the primitives (Account → Conversation → Stream → Token)
- `PROTOCOL.md` §4, §7 — wire-level enforcement
- `GLOSSARY.md` "Inverted inbox" — the metaphor in plain language
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — the structural-exclusion rule that pairs with D0003's ownership rule
- `ams://canon/decisions/D0004-two-door-registration` — the credential model that makes ownership checkable
