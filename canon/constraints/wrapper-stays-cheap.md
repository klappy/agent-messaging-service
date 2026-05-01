---
uri: ams://canon/constraints/wrapper-stays-cheap
title: "Wrapper Stays Cheap — A Wrapper That Grows Beyond Translation Has Become a Product"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "constraint", "edge-wrapper", "vodka-architecture", "scope-discipline"]
epoch: E0008.3
date: 2026-05-01
derives_from: "PATTERNS.md §2, POC-INFRA.md §2, ams://canon/decisions/D0006-dream-house-wire-edge-wrappers"
governs: "Every edge wrapper class — the MCP Session DO, future Slack adapters, webhook adapters, SMS adapters, A2A bridges. Where a wrapper stops being a wrapper."
status: active
---

# Wrapper Stays Cheap — A Wrapper That Grows Beyond Translation Has Become a Product

> The edge-wrapper layer must stay narrow. A wrapper that adds caching, rewrites payloads, applies content policy, or accumulates business logic has stopped being a wrapper and gets factored out as a separate service.

## Description

Edge wrappers exist for one job: translate between a runtime's I/O shape and the AMS wire's I/O shape. The job is narrow on purpose. When a wrapper takes on responsibilities beyond translation — caching, content rewriting, policy enforcement, business logic — it has crossed a category boundary and should be factored out into its own service that subscribes to the conversation through a regular wrapper.

This constraint exists because the edge-wrapper layer is the most likely place for vodka discipline to break. A wrapper sits between a runtime that has opinions and a wire that does not. Each useful-looking addition seems local to one wrapper, but the cumulative effect is a shadow product growing inside the protocol layer.

## Outline

- The Translation-Only Rule
- What a Wrapper Carries
- What a Wrapper Does Not Carry
- The Factor-Out Test
- What This Is Not

---

## The Translation-Only Rule

A wrapper:

- **Holds the WebSocket** to the Conversation DO on the runtime's behalf.
- **Buffers wire events** for runtimes that cannot take server pushes.
- **Translates I/O patterns** in both directions: runtime-shaped requests become wire frames; wire frames become runtime-shaped notifications or polls.
- **Implements one well-defined contract over another.** That is the entire job.

Holding a WebSocket plus a buffer plus a translator is the full description. Anything outside that description is a feature, not a translation.

## What a Wrapper Carries

- **Opaque tokens.** Same payload contract as the wire.
- **Opaque metadata.** Same broadcast contract as the wire.
- **Per-session ephemeral state** — buffer, cursor, subscription set. Discarded when the session ends.
- **The runtime's I/O conventions** in whatever way is idiomatic for that runtime. The wrapper exposes whatever the runtime expects (MCP tools, webhook callbacks, Slack events, SMS messages) without imposing AMS-specific shape on the runtime.

## What a Wrapper Does Not Carry

- **Persistent durable state.** No long-lived KV, no per-conversation history beyond the live session.
- **Domain logic.** A wrapper does not parse `data`, schema-validate `metadata`, or branch on payload contents.
- **Content policy.** Filtering, redaction, content-warning injection — these are the responsibility of a downstream subscriber that listens to the conversation, not of the wrapper.
- **Caching of conversation state.** The Conversation DO is the source of truth. A wrapper that caches conversation state has duplicated state and will drift.
- **Business rules of any kind.** "If the message contains X, do Y" is a product, not a wrapper.

## The Factor-Out Test

When a wrapper is about to grow a non-translation responsibility, ask:

1. **Could this responsibility be implemented as its own subscriber that joins the conversation?** If yes, that is the right shape. The new responsibility becomes a separate service that holds its own AMS account, joins the conversation, reads the streams it cares about, and emits its own stream if needed.
2. **Does this responsibility require the wrapper to make decisions about payload contents?** If yes, vodka discipline has been broken. The decision-maker should not be in the wrapper.
3. **Does this responsibility outlive the runtime session?** If yes, the responsibility cannot live in the wrapper at all — wrappers are session-scoped. Persistent responsibilities live in independent subscribers.

If any of these tests fires, factor out. The wrapper goes back to translation; the new responsibility runs as a subscriber.

## What This Is Not

- Not a block on wrappers having internal complexity. A wrapper for a difficult runtime (one that needs careful buffering, retry logic, complex notification fallback) is allowed to be intricate inside the translation contract. Intricate translation is fine; non-translation responsibilities are not.
- Not a block on wrappers exposing custom MCP tools or runtime-specific affordances. A wrapper can offer whatever surface the runtime expects, as long as the surface is a translation of AMS wire concepts and not new domain logic.
- Not a claim that the factor-out test always produces a separate service. Sometimes the answer is "this responsibility belongs in the application that owns the agent, not in any AMS layer at all." That is also a valid factor-out direction.

## See Also

- `PATTERNS.md` §2 — the edge-wrapper pattern as documented surface
- `POC-INFRA.md` §2 — the dream-house-wire / edge-wrapper architectural separation
- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` — the governing architectural decision
- `ams://canon/principles/vodka-architecture-applied` — the discipline this constraint enforces
