---
uri: ams://canon/constraints/permanent-non-goals
title: "Permanent Non-Goals — What AMS Refuses to Own, Forever"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: stable
tags: ["ams", "canon", "constraint", "non-goals", "vodka-architecture", "scope"]
epoch: E0008.3
date: 2026-05-01
derives_from: "AMS.md §8 (Non-Goals — Forever, Not Just Week One), AMS.md §11 (Positioning)"
governs: "Every proposed addition to the protocol or the reference implementation. The contract that keeps AMS vodka."
status: active
---

# Permanent Non-Goals — What AMS Refuses to Own, Forever

> Some things AMS will never have an opinion on. They are layers above the wire. Owning any of them turns AMS from a foundation into a vertical, and the foundation play collapses.

## Description

This is the permanent non-goals list. Each item is something AMS deliberately refuses to take a stance on. The list is the contract that keeps AMS unopinionated at the layers it cares about. Every time someone proposes adding something to AMS, the proposal is checked against this list. If accepting the proposal would put AMS on the wrong side of any item below, the answer is no — that capability belongs in a layer above.

The deferred items in `SPEC.md` §5 are different: those are things v1 does not ship but might in v2 or v3. The list below is for things AMS will never ship, regardless of version. Deferred is "not yet"; non-goal is "not ever."

## Outline

- The Permanent Non-Goals
- Why Each One Matters
- The Test for New Proposals
- What This Is Not

---

## The Permanent Non-Goals

AMS does not and will not have an opinion on:

1. **What identity scheme accounts use above the account ID itself.** AMS carries identity declarations in metadata. It does not validate the upper schemes.
2. **What schema stream metadata or declared capabilities take.** AMS carries the metadata slot and broadcasts changes. The shape of `capabilities` and any other annotation is application-defined.
3. **What authorization policy a conversation enforces beyond the two-door minimum.** Magic link plus account ownership is the floor. Anything richer (invite lists, role hierarchies, conditional admission) is declared in conversation metadata; AMS does not interpret it.
4. **What format tokens take.** Opaque bytes. Up to the application.
5. **What transport layer is "correct."** WebSocket today, in the reference implementation. The protocol is transport-swappable — QUIC, raw TCP, SSE, anything that preserves ordered delivery within a single connection — and AMS does not crown a winner.
6. **What queue or coordinator sits above it.** Job coordination is not in the protocol. AMS feeds queues; AMS is not a queue.
7. **Whether the registry is centralized, federated, or distributed.** The PoC has no registry beyond DNS. Production deployments can pick.
8. **What pricing dimension applies.** Hosted instances bill on whatever dimension makes sense (concurrency-tiered is a likely default). The protocol itself is free.
9. **What URL structure other AMS implementations use.** The reference impl picks one. Conformance only requires that the magic link route to a conversation and authorize stream attachment.

## Why Each One Matters

Every item on the list is a layer where opinionated stacks usually start owning the whole vertical. Mem Zero owns memory. Other vendors own identity, observability, orchestration. Each one bundles their slice with assumptions that lock customers in.

AMS's bet is that the foundation should be unopinionated about all of these so that any opinion can sit on top. The dial-tone metaphor only holds if AMS does not pick a phone for you.

The non-goals list is also defensive. The most common drift pattern in protocol design is "we have to make this decision somewhere; it might as well be us." That sentence is the start of every vertical that bundles. The list is the antidote: these decisions are made above us, by the application, by the operator, by the ecosystem.

## The Test for New Proposals

When someone proposes a new capability for AMS, the test is:

1. **Does this proposal commit AMS to an opinion on any of items 1–9 above?** If yes, the proposal is asking AMS to become opinionated where it has chosen not to be. The default answer is no.
2. **Could the same outcome be achieved by a subscriber, a wrapper, or an application convention?** If yes, that is the right place. AMS provides the wire; the outcome belongs in the layer above.
3. **Would adding this capability foreclose any HORIZON entry?** Run the forward-compatibility check from `ams://canon/decisions/D0008-horizon-as-constraint-set`.

A proposal that fails the first test is rejected. A proposal that passes the first test but fails the second gets redirected to the right layer. A proposal that passes both but fails the third gets revisited or pairs with a deliberate retirement of the foreclosed entry.

## What This Is Not

- Not a claim that the listed items are unimportant. They are critical. They are critical *somewhere else*. AMS is choosing where to own and where to defer.
- Not a permanent block on documenting conventions for these layers. AMS canon may publish recommended conventions (for capability schemas, identity declarations, termination signals) without making those conventions wire-required. Conventions are documented, not enforced.
- Not exhaustive. If a new layer emerges (post-quantum identity, decentralized registry semantics, novel transport types), it gets added to the list when the principle applies.
- Not a refusal to host opinionated layers operationally. Covenant may run hosted services that include opinionated identity, an opinionated capability schema, or an opinionated job coordinator — those services run *on top of* AMS as products, not as wire features.

## See Also

- `AMS.md` §8 — the source list with surrounding rationale
- `AMS.md` §11 — positioning that makes the non-goals coherent
- `ams://canon/principles/vodka-architecture-applied` — the discipline this list enforces
- `ams://canon/decisions/D0008-horizon-as-constraint-set` — the forward-compatibility check that complements this list
