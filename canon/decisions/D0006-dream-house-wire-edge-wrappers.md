---
uri: ams://canon/decisions/D0006-dream-house-wire-edge-wrappers
title: "D0006 — Dream-House Wire, Edge-Wrapped Reality"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: stable
tags: ["ams", "canon", "decision", "architecture", "wire", "edge-wrapper", "vodka-architecture", "irreversible"]
epoch: E0008.4
date: 2026-05-01
derives_from: "POC-INFRA.md §2 §3 §4, PATTERNS.md §2, journal/2026-05-01-ams-dream-house-edge-wrappers.tsv"
governs: "Where the wire ends and runtime adaptation begins. Why the Conversation DO never grows a runtime opinion. How new runtimes are added without protocol revision."
status: active
---

# D0006 — Dream-House Wire, Edge-Wrapped Reality

> The wire spec is push-native, WebSocket, opaque, stream-scoped broadcast — the dream house. Most agent runtimes are not. The wire does not bend to runtimes; per-session edge wrappers absorb the impedance mismatch. The wire stays the same shape regardless of which runtimes consume it.

## Description

The AMS wire (`PROTOCOL.md`) is designed for what AMS wants to be when nothing is in the way: WebSocket-first, server-push, real-time, opaque tokens, stream-scoped delivery with structural exclusion of self-echo (per `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`). Most agent runtimes (Claude Code, Claude Desktop, Cursor, claude.ai, MCP clients in general) are request/response or notification-with-fallback shaped. They cannot sit on a WebSocket waiting for events.

The decision is to **not** reshape the wire to fit the runtimes. Instead, every runtime gets its own thin, single-purpose **edge wrapper** that holds the wire WebSocket on the runtime's behalf and translates I/O patterns in both directions. The wrapper is the disposable layer; the wire is the permanent layer.

This is a one-way door at the architectural level. Once the wrapper boundary exists, runtimes are expected to plug in via wrappers, not via wire revisions. Reversing it would force the wire to absorb every runtime's quirks and the foundation play would collapse.

## Outline

- The Two Layers
- What Stays in Each Layer
- Why the Boundary Holds
- The Canonical Instance
- What This Forecloses
- What This Is Not

---

## The Two Layers

**Wire (the dream house)** lives in the Conversation Durable Object. Push-native. WebSocket-only. Knows nothing about MCP, webhooks, Slack, SMS, or any other runtime. Its only subscribers are WebSocket-holding entities. It speaks AMS frames and only AMS frames.

**Edge wrappers (per-session adapters)** live one-per-runtime-session, outside the Conversation DO. Each wrapper:

- Holds the long-lived WebSocket to the Conversation DO on behalf of one runtime session.
- Buffers wire events for the runtime's notification/poll model.
- Translates I/O patterns in both directions: runtime-shaped requests become wire frames; wire frames become runtime-shaped notifications or poll responses.

The MCP Session DO in the reference deployment is the canonical example.

## What Stays in Each Layer

**In the wire / Conversation DO:**

- Stream registry (who owns what stream).
- Subscription registry (who reads what stream; owners structurally excluded by default per D0009).
- Connected WebSocket list.
- Stream-scoped broadcast loop (token + metadata frames delivered per-stream, not per-conversation).
- Per-stream ordering guarantee.
- Authorization checks (D0003).

**In the edge wrapper:**

- Session state (buffer, cursor, subscription set).
- Runtime-specific I/O translation.
- Notification fallback to long-poll where the runtime cannot take server pushes.
- Whatever per-session adaptation the runtime forces.

The wrapper holds **no persistent durable state**. Its lifetime is the session's lifetime. When the session ends, the buffer is discarded.

## Why the Boundary Holds

**The Conversation DO does not learn about MCP.** A new MCP version, a new MCP transport quirk, a new MCP client behavior — none of these reach the wire. They are absorbed in the wrapper.

**Adding a new runtime is a new wrapper, not a wire revision.** A Slack adapter, a webhook adapter, an SMS gateway, an A2A bridge — each is its own per-session wrapper class. The wire spec does not change to accommodate them.

**The wrapper does not inherit responsibilities the wire already handles.** Under D0009, the wire structurally excludes self-delivery; wrappers do not implement echo filters. Subscriber-side filtering, deduplication, and emit-history state are not wrapper responsibilities because the wire does not surface anything that requires them.

**Vodka discipline survives at both layers.** The wire is opaque about token contents. The wrapper is opaque about token contents. Neither layer interprets, validates, or schemas application data. Per the wrapper-stays-cheap rule (`ams://canon/constraints/wrapper-stays-cheap`), a wrapper that grows beyond translation has stopped being a wrapper and gets factored out.

## The Canonical Instance

The MCP edge wrapper is the reference deployment's first wrapper. It surfaces AMS as six MCP tools, two notification streams, and one resource (per `SPEC.md` §4). The Session DO holds the WebSocket to the Conversation DO, buffers wire events, and exposes the AMS surface to whatever MCP client is connected. The Conversation DO does not know MCP exists.

This is the minimum proof that the wrapper boundary works. The second wrapper class — likely a webhook adapter — proves the pattern is general (`SPEC.md` §10, disconfirmer #3).

## What This Forecloses

- The Conversation DO cannot grow MCP-aware code paths within a major version. Doing so would compromise its purity and break the wrapper-pattern abstraction.
- The wire cannot adopt request/response semantics. It is push-only by design; runtimes that need request/response get it from their wrappers.
- A wrapper cannot replace another wrapper's responsibilities. Each is single-purpose.

## What This Is Not

- Not a claim that the MCP wrapper is the only wrapper that will ever exist. It is the first; others are expected (Slack, webhook, SMS, A2A bridges).
- Not a claim that wrappers must be Durable Objects. The reference impl uses DOs because the deployment target is Cloudflare; other implementations may use different per-session execution models. The pattern is "per-session subscriber that translates"; the substrate is incidental.
- Not a permanent block on improving the wire. Within-version additions to the wire (new frame types, new control plane endpoints) are allowed; what is forbidden is letting runtime-specific concerns shape those additions.

## See Also

- `POC-INFRA.md` §2, §3, §4 — long-form architecture and MCP-specific application
- `PATTERNS.md` §2 — the edge-wrapper pattern as a documented surface
- `ams://canon/constraints/wrapper-stays-cheap` — the rule that prevents wrappers from accreting domain logic
- `ams://canon/decisions/D0001-tokens-not-messages` — the wire unit the wrapper translates around
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — the wire delivery model that simplifies wrapper responsibilities
