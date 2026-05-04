---
uri: ams://canon/decisions/D0018-multi-stream-per-account-per-conversation
title: "D0018 — Multi-Stream Per Account Per Conversation"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: stable
tags: ["ams", "canon", "decision", "protocol", "account-model", "multi-stream", "deferral-lifted"]
epoch: E0008.4
date: 2026-05-04
derives_from: "D0003-per-account-stream-ownership (the ownership model this expands without breaking); SPEC.md §5 deferred 'Multi-stream-per-account-per-conversation'; PROTOCOL.md §6 close code 4004 (the conflict semantic this narrows); operator↔Claude planning conversation 2026-05-04 establishing that agent orchestration scaling, harness composition, and tool-instance addressing all require this lift."
complements: "D0003-per-account-stream-ownership, D0009-stream-as-primitive-ownership-excludes-subscription, D0016-buffering-and-persistence-as-wrapper-primitive, D0019-cross-session-continuity-via-account-conversation-keying"
governs: "Whether one account may own multiple streams in a single conversation. The semantics of stream name uniqueness. The narrowed scope of close code 4004. Client conventions for distinguishing streams owned by the same account."
status: active
---

# D0018 — Multi-Stream Per Account Per Conversation

> A single account may own multiple streams in the same conversation. The deferral in `SPEC.md` §5 is lifted. Stream identity is `stream_id` (always unique); `stream_name` is a label and may collide within an account. Close code 4004 narrows from "name unique within conversation" to "name unique within (conversation, account)."

## Description

The original `SPEC.md` §5 conservatively reserved "Multi-stream-per-account-per-conversation" with re-entry signal: *"First valid use case (e.g. one account running parallel agent processes in one conversation)."* That signal has fired in multiple shapes simultaneously — agent orchestration patterns spawning sub-agents, harness instances each emitting on their own stream, tool-call addressability requiring per-tool stream identity, multi-process clients running concurrent contexts under a single bearer.

The single-stream-per-account-per-conversation cap was never load-bearing in the wire's design — `D0003` (per-account stream ownership) requires only that streams have a single writing account, not that an account own at most one stream per conversation. The cap was a conservatism, not an architectural commitment.

This decision lifts the cap.

## Outline

- What Was Reserved and Why
- What Changes
- Stream Identity vs Stream Label
- Close Code 4004 Narrows
- Client Convention
- Reader Implications
- What This Forecloses
- What This Is Not
- Reversibility
- See Also

---

## What Was Reserved and Why

`SPEC.md` §5 reserved this lift to avoid premature elaboration of the account model in v1. The conservative read of `D0003` left an ambiguity: per-account stream ownership says streams are owned by accounts; it did not say accounts may own multiple streams in one conversation. The default assumption — one account, one stream per conversation — was easier to reason about and matched the typical chat-shaped conversation between distinct human or agent participants.

The reservation was correct for v1's primary chat-shaped use cases. It is wrong for the use cases v1's primary uses are now being asked to compose into.

## What Changes

The wire-level change is small. `D0003` does not break; it expands. An account may now register multiple streams in a single conversation, each with its own `stream_id` and own metadata, each emitting independently.

`PROTOCOL.md` §3.2 (mint a conversation) and §4.1 (connect to a conversation) already accommodate multiple streams per conversation; they did not enforce single-stream-per-account at the protocol layer. The enforcement was implied through close code 4004's stream-name conflict semantic. That semantic narrows.

## Stream Identity vs Stream Label

`stream_id` is the stream's identity. It is unique within the conversation, generated at registration, and never collides. Subscribers that need to address a specific stream must use `stream_id`.

`stream_name` is the stream's label. It is human-readable, may be repeated, and is intended for display and informal addressing. After this decision, `stream_name` may collide between streams owned by the same account. It may not collide between streams owned by different accounts (see Close Code 4004 below).

The implication for spec authors and client implementers: anywhere `stream_name` was treated as an identifier, it must now be treated as a label. The `peers` array in the `joined` frame already keys by `stream_id`, so most existing readers are correct by accident.

## Close Code 4004 Narrows

`PROTOCOL.md` §6 close code 4004 today reads: *"Stream name conflict (already in use in this conversation by another account)."* The wording already points to the narrower semantic — *"by another account"* — which makes the lift textually small.

The narrowed reading: 4004 fires when an account attempts to register a stream with a `stream_name` already in use by a different account in the same conversation. It does not fire when the same account registers two streams with the same `stream_name`. Same-account same-name streams are permitted but discouraged (see Client Convention below).

The rationale for keeping the cross-account conflict: cross-account name collisions create ambiguity in human-facing displays and in any application code that uses names as identifiers despite this decision's clarification. Reserving names per-account-per-conversation gives accounts a stable namespace for their own streams without forcing readers to disambiguate names across owners.

## Client Convention

When an account spawns multiple streams in one conversation, the client SHOULD pick distinguishing names. Examples:

- A harness running multiple model-adapter instances: `claude-instance-{short_id}`, `claude-instance-{short_id_2}`.
- A tool-call address space: `tool-grep-{run_id}`, `tool-edit-{run_id}`.
- A multi-process client: `claude-pid-{pid}`, `claude-pid-{pid_2}`.

This is a SHOULD, enforced by humans and convention, not by the protocol. Two streams with the identical name owned by the same account remain valid; consumers are responsible for telling them apart by `stream_id`.

## Reader Implications

Subscribers that aggregate, log, or display stream activity must use `stream_id` as the primary key when grouping events by stream. Using `stream_name` as a key produces conflated streams when the same account spawns multiple streams with shared names.

Subscribers that filter by `stream_name` (e.g., "show me only the harness output") must accept that the filter may match multiple streams from the same account. This is usually the desired behavior in such cases; if it is not, the filter must be expressed in terms of `stream_id` (resolved via the inspect endpoint per `PROTOCOL.md` §3.3) instead.

## What This Forecloses

- Stream-name uniqueness as a global constraint within a conversation. After this decision, `stream_name` is unique within `(conversation, account)`, not within `conversation`.
- Reading `stream_name` as an identity field. Spec text and client documentation must be reviewed for places that treat name as identity; those should be updated to use `stream_id`.

## What This Is Not

- Not a change to per-account stream ownership. `D0003` still holds: each stream has exactly one owning account, and only that account may emit on it.
- Not a change to authorization. An account that is admitted to a conversation may register multiple streams in it; an account that is not admitted may register zero. The admission gate is unchanged.
- Not a feature of the wire that requires negotiation. There is no opt-in; multi-stream-per-account is the default behavior of every conformant implementation after this decision lands.

## Reversibility

**Two-way door at the protocol level**, but with a wrinkle. The lift itself can be reversed (re-tightening 4004 to fire on same-account same-name conflicts) without breaking single-stream clients. However, after lift, clients will rely on multi-stream behavior; reversing would break those clients. The asymmetry is the typical "additive feature becomes load-bearing once adopted."

In practice this should be treated as a one-way door at the ecosystem level. The wire mechanic can be reversed; the consequences of reversal grow with adoption.

## See Also

- `ams://canon/decisions/D0003-per-account-stream-ownership` — the unchanged ownership model this expands within
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — the broadcast model that determines self-subscription semantics for multi-stream cases
- `ams://canon/decisions/D0016-buffering-and-persistence-as-wrapper-primitive` — the per-stream buffering primitive whose sharding model assumes this lift
- `ams://canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying` — the Session DO keying that handles concurrent same-account sessions, each potentially registering its own streams
- `PROTOCOL.md` §3.2, §4.1, §6 — the wire surfaces this affects
- `SPEC.md` §5 — the deferred item this lifts
