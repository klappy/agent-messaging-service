---
uri: ams://canon/decisions/D0005-conversation-not-room
title: "D0005 — Conversation, Not Room (Vocabulary Lock)"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: stable
tags: ["ams", "canon", "decision", "vocabulary", "naming", "do-not-use"]
epoch: E0008.3
date: 2026-05-01
derives_from: "AMS.md, GLOSSARY.md (Conversation; Terms We Deliberately Do Not Use), journal/2026-05-01-ams-foundation.tsv (D: AMS uses Conversation — not Room)"
governs: "All AMS-authored documentation, code identifiers, and external communication. The vocabulary the protocol commits to."
status: active
---

# D0005 — Conversation, Not Room (Vocabulary Lock)

> The coordination surface in AMS is a **conversation**, not a room. Room is spatial and static; the actual primitive is temporal and dialogical.

## Description

The bound set of streams sharing a magic link is named **conversation** in every AMS document, type, identifier, and externally-visible string. Synonyms — room, channel, topic, lobby, space — are deliberately not used. This is a vocabulary lock: changing the name later would create either drift across docs or breakage across implementations that already typed the wire shapes against the current names.

## Outline

- The Three Forbidden Substitutes
- Why the Word Matters
- Where the Lock Applies
- What This Is Not

---

## The Three Forbidden Substitutes

These appear in early drafts or in adjacent protocols. AMS does not use them:

- **Room.** Spatial and static. A room is somewhere you go; a conversation is something that happens. The actual primitive is the latter.
- **Channel.** Overloaded with Slack, Discord, IRC, and broadcast media. Each of those embeds assumptions (presence, persistent membership, archived history) that AMS does not own.
- **Topic.** Used in Kafka, NATS, and pub-sub literature. The ownership model is fundamentally different — Kafka topics are broker-owned, AMS conversations are account-owned at the namespace boundary and carry per-stream ownership semantics.

Two further "do not use" words inherited from the inbox-inversion stance:

- **Inbox.** AMS has streams subscribers choose to read, not inboxes writers push into.
- **Message.** Reserved as a do-not-use because AMS carries tokens, not messages. See `ams://canon/decisions/D0001-tokens-not-messages`.

## Why the Word Matters

A conversation is dialogical: it has participants, directionality, and unfolds in time. A room is none of those things — it is a container that exists whether or not anyone is talking. Calling the AMS coordination surface a room invites the implementation's mental model to drift toward the room shape: persistent membership rosters, "you are in the room" presence indicators, room-level history archives. None of those belong in AMS, and none of them are worth fighting once the wrong word is in code.

The cost of fixing the name later (find/replace across docs, types, error messages, URLs) compounds with every additional implementation. Locking the word now keeps that cost at zero.

## Where the Lock Applies

- **Documentation prose.** Every AMS doc says "conversation" everywhere. Anywhere "room" appears it is a residue from an early draft and gets corrected on contact.
- **Code identifiers.** `conversation_id`, `ConversationDO`, `/v1/{ns}/conversations/...`. No `room_id`, no `RoomDO`, no `/v1/rooms`.
- **Wire frames.** All server-pushed frames refer to the conversation by `conversation_id`.
- **Error messages and close codes.** Human-readable errors say "conversation," not "room" or "channel."
- **External communication.** Talks, blog posts, social media — all use the locked vocabulary.

## What This Is Not

- Not a claim that "conversation" is a uniquely correct word for every multi-party messaging primitive. It is the word AMS commits to, for the reasons above.
- Not a block on adding new vocabulary as new primitives emerge. Patterns built on AMS may name their own concepts (instance, harness, edge wrapper, observer subscriber) without conflict.
- Not retroactive on the words already shipped. If something old leaks "room" or "channel," the fix is to update the document, not to reopen the decision.

## See Also

- `GLOSSARY.md` — full vocabulary, including the explicit "Terms We Deliberately Do Not Use" section
- `AMS.md` §3 — the primitives in the locked vocabulary
- `ams://canon/decisions/D0001-tokens-not-messages` — the parallel vocabulary lock for the wire unit
