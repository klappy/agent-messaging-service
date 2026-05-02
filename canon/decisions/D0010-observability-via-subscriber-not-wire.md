---
uri: ams://canon/decisions/D0010-observability-via-subscriber-not-wire
title: "D0010 — Observability Lives as a Subscriber Pattern, Not as a Wire Feature"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: stable
tags: ["ams", "canon", "decision", "observability", "subscriber-pattern", "vodka-architecture", "irreversible"]
epoch: E0008.3
date: 2026-05-01
derives_from: "SPEC.md §5 (Deferred: DOLCHE journal observability subscriber), SPEC.md §12.9 (Observability subscriber on horizon), ARCHITECTURE.md §8 (Observability — PoC), PATTERNS.md §3 (Future patterns: Observability sink), klappy://canon/constraints/telemetry-governance"
complements: "ams://canon/principles/observability-as-subscriber, ams://canon/constraints/observability-payload-boundary, ams://canon/constraints/permanent-non-goals"
governs: "Where observability lives in the AMS architecture. The choice cannot be reversed without violating the polymorphic-subscriber model and the wire's vodka discipline."
status: active
---

# D0010 — Observability Lives as a Subscriber Pattern, Not as a Wire Feature

> AMS observability is split across two layers. Wire-visible activity is captured by polymorphic subscribers that join conversations like any other peer. Broker-internal activity that no subscriber can see is captured by infrastructure hooks in the Worker and Durable Object. Neither layer adds opinions to the wire. The two layers do not overlap.

## Description

Three earlier docs already commit AMS to keeping observability out of the wire. `SPEC.md` §12.9 lists the observability subscriber as a post-PoC roadmap item. `ARCHITECTURE.md` §8 stages observability as `console.log` at PoC and a journal subscriber later. `PATTERNS.md` §3 names the observability sink as a future pattern. This decision canonicalizes the architectural commit those docs imply: observability is never a wire feature. It is always either a subscriber consuming the existing broadcast or an infrastructure hook on the Worker and DO that records what no subscriber can see.

This is a one-way door. Adding observability to the wire would compromise the polymorphic-subscriber model (`AMS.md` §3), violate `ams://canon/constraints/permanent-non-goals` item 6 (queue/coordinator above the wire), and force every subscriber to adopt AMS's opinion about what should be observed. Reversing this decision would require every existing subscriber to accommodate new wire frames it did not request.

## Outline

- The Two Layers
- Why Subscriber, Not Wire
- Why Hooks IN, Not Just Subscribers
- Why the Layers Do Not Overlap
- What Forecloses
- What This Is Not

---

## The Two Layers

**Bolt-on subscriber layer.** A subscriber joins a conversation with a magic link and an account credential, exactly like any agent peer. It receives every server-pushed frame in `PROTOCOL.md` §4.2: `joined`, `token`, `stream_joined`, `stream_left`, `stream_metadata`, `pong`. It ships structural identifiers and lifecycle events to a sink of its choice. It never inspects token `data` or metadata values beyond the structural shape required to record them.

**Built-in hook layer.** The Worker and the ConversationDO call a thin telemetry primitive at events no subscriber can observe: control-plane requests (`POST /v1/accounts`, `POST /v1/{ns}/conversations`, `GET /v1/{ns}/conversations/{alias}`), WebSocket upgrade attempts including failures (close codes 4001–4005, 4290), and DO lifecycle (creation, hibernation, eviction). The hook layer writes structural identifiers to a separate sink and is removable without changing wire conformance.

The reference deployment uses Cloudflare Workers Analytics Engine for the hook layer, mirroring the upstream pattern in `klappy://canon/constraints/telemetry-governance`. Other deployments may use any sink they prefer; the decision commits to the split, not to the specific sink.

## Why Subscriber, Not Wire

Three reasons, in order of weight.

**Polymorphic subscribers stay polymorphic.** AMS treats every connected entity as a subscriber. Carving out a privileged "observability" role at the protocol layer would compromise that uniformity for the convenience of one subscriber type. Every other observability use case — security audit, compliance archive, replay capture, debug capture, behavioral analytics — would also want privileged treatment, and the slope is unrecoverable.

**The wire already broadcasts the structural-identifier set.** Every `token`, `stream_joined`, `stream_left`, and `stream_metadata` frame the wire emits already includes `stream_id`, `stream_name`, `owner_account_id`, and (for tokens) `ts`. A subscriber that consumes these and ships their shape to a sink has the structural-identifier set the upstream telemetry doctrine asks for. Adding a wire feature to publish what is already published would be redundant and noisy.

**Observability conventions evolve faster than the wire should.** Policy questions (what to redact, how long to retain, which events warrant alerts, which subscribers see which dashboards) change with operator needs and regulatory environments. Pinning these to the wire would force protocol revisions for every operational shift. Pinning them to a subscriber lets them iterate freely.

## Why Hooks IN, Not Just Subscribers

A subscriber sees only what reaches a conversation it has joined. Several categories of activity never reach any subscriber:

- **Failed admission attempts.** `PROTOCOL.md` §6 close codes 4001 (invalid magic link), 4002 (bad credential), 4003 (over concurrency), 4004 (stream-name conflict), 4005 (conversation not found). These fail at WebSocket upgrade. The DO never registers them.
- **Account creation.** `POST /v1/accounts` runs against KV without involving any DO.
- **Conversation minting.** `POST /v1/{ns}/conversations` registers the minter's stream in a fresh DO. The minter is the only subscriber that exists at that moment.
- **Inspection calls.** `GET /v1/{ns}/conversations/{alias}` is a control-plane read. It produces no broadcast.
- **Worker and DO health.** Cold starts, KV latency, DO concurrency, region placement. None of these are conversation events.

A subscriber-only observability strategy is silent on these. The hook layer fills the gap. It writes one telemetry record per event at the Worker boundary, asynchronously, and never inspects payload contents.

## Why the Layers Do Not Overlap

The split assigns each event class to exactly one layer. Wire-visible events go through the subscriber layer. Broker-internal events go through the hook layer. An event that appears in both — for example, a successful `connect` that produces both a subscriber-visible `stream_joined` and a hook-visible WS-upgrade-success record — is recorded in the layer that owns its category, not in both. The hook records the upgrade as a control-plane success; the subscriber records the stream's join as a conversation event.

The non-overlap test is the design check. If a proposed observability feature would record the same event in both layers, the design has drifted and one layer must be cut.

## What Forecloses

- AMS cannot ship a wire frame that says "this is an observability event" without breaking the polymorphic-subscriber rule.
- AMS cannot grant subscribers privileged access to events outside their joined conversations. Cross-conversation observability is built by holding many magic links and joining each, not by a wire-level subscription firehose.
- AMS cannot persist tokens for replay as part of the wire (replay is `SPEC.md` §5 deferred work). Observability subscribers that miss tokens during disconnect cannot recover them through the protocol.
- The reference deployment cannot present observability data as a built-in dashboard route on `ams.covenant.dev`. Dashboards run as separate services that consume the hook sink and the subscriber sink, not as broker features.

## What This Is Not

- Not a stance against observability as a hosted product. Covenant may run a hosted DOLCHE journal subscriber as a paid service. The service is a subscriber and a sink consumer, not a wire feature.
- Not a refusal to add the hook layer. The hook layer is in scope from the moment AMS ships beyond `console.log`. The decision distinguishes hooks from wire features, not hooks from nothing.
- Not a requirement that every deployment ship observability. A self-hosted AMS instance is conformant with no observability at all. The decision commits to where observability lives when it does ship.
- Not a block on subscribers using their own ephemeral diagnostic channels. A subscriber may hold a side channel to its own logging service for its own purposes; that is the subscriber's concern, not the wire's.

## See Also

- `SPEC.md` §5 — the deferred-items table that named the observability subscriber
- `SPEC.md` §12.9 — the post-PoC roadmap entry
- `ARCHITECTURE.md` §8 — the PoC observability staging this decision formalizes
- `PATTERNS.md` §3 — the observability sink as a future pattern
- `ams://canon/principles/observability-as-subscriber` — how subscribers operate under this decision
- `ams://canon/constraints/observability-payload-boundary` — the safety contract for what observers may capture and ship
- `ams://canon/constraints/permanent-non-goals` — the non-goals this decision keeps AMS clear of
- `ams://canon/principles/vodka-architecture-applied` — the four review questions this decision survives
- `klappy://canon/constraints/telemetry-governance` — upstream telemetry pattern the hook layer mirrors
