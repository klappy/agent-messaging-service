---
uri: ams://canon/decisions/D0017-selective-subscription
title: "D0017 — Selective Subscription on Connect"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: stable
tags: ["ams", "canon", "decision", "protocol", "subscription", "composable-pipes", "wire-additive", "deferral-lifted"]
epoch: E0008.4
date: 2026-05-04
derives_from: "D0006-dream-house-wire-edge-wrappers (composable wrapper chains motivate the use case); D0009-stream-as-primitive-ownership-excludes-subscription (the per-stream broadcast model this filters); SPEC.md §5 deferred 'Selective subscription'; operator↔Claude planning conversation 2026-05-04 articulating composable-pipes routing through middleware nodes as the re-entry trigger."
complements: "D0009-stream-as-primitive-ownership-excludes-subscription, D0016-buffering-and-persistence-as-wrapper-primitive"
governs: "How a subscriber declares which streams within a conversation it wants to read. Why default behavior (subscribe-to-all-except-own) is preserved and the new control is opt-in. The wire-level surface for the filter."
status: active
---

# D0017 — Selective Subscription on Connect

> Composable wrapper chains require subscribers to attach to specific streams within a conversation, not all of them. The wire grows an optional `X-AMS-Subscribe-Streams` header at connect; the default behavior — subscribe to every peer stream — is preserved unchanged. Existing clients see no difference; pipeline-shaped clients gain the precision they need.

## Description

`D0009` establishes that the conversation is the admission boundary and the broadcast unit is the per-stream loop. Today, a subscriber attached to a conversation is registered as a reader of every stream in that conversation except those it owns. This is correct for the terminal case — agents in a chat, observers reading all activity, loggers capturing everything — and wrong for the pipeline case.

Composable wrapper chains (translator → redactor → fan-out, model-adapter harness → persistence subscriber → terminal agent) need each link to subscribe to specific upstream streams without being attached to every other middleware node's emissions. Without selective subscription, three wrappers chained in a conversation each receive the other two's traffic, producing redundant work, fan-out loops, and pathological backpressure.

`SPEC.md` §5 named this as a deferred item with re-entry signal: *"First use case where reading every peer stream is operationally prohibitive."* The composable-pipes commitment surfaces that use case directly. This decision lifts the deferral.

## Outline

- The Default Stays Right
- The New Control
- Filter Semantics
- Wire Surface
- Backwards Compatibility
- What This Forecloses
- What This Is Not
- Reversibility
- See Also

---

## The Default Stays Right

Today's behavior — subscribe to all peer streams except those you own — is correct for the majority of subscribers. Agents in a chat want to see every other participant. Observers and loggers want everything. Audit subscribers want everything. The default is not changing.

The new control is opt-in. A subscriber that does not pass the new header gets exactly the behavior `D0009` describes. A subscriber that passes the header gets the filtered subscription set it requested.

## The New Control

The new control is a request header on the WebSocket connect:

```
X-AMS-Subscribe-Streams: <comma-separated-stream-id-list>
```

When present, the broker constructs the subscriber's read set as the intersection of (a) streams the subscriber is admitted to read (which excludes its own under `D0009` unless `X-AMS-Self-Subscribe: true` is also passed) and (b) streams whose `stream_id` appears in the header.

When absent, the broker constructs the read set as it does today: every stream in the conversation except those owned by the subscriber's account (modulo `X-AMS-Self-Subscribe`).

## Filter Semantics

The filter is by `stream_id`, not by `stream_name`. Stream IDs are unique and stable; stream names are labels (per `D0018`) and may collide within an account. Subscribers that want to filter by some other attribute — by `stream_name`, by metadata predicate, by owner account — must inspect the conversation via the inspect endpoint (`PROTOCOL.md` §3.3) before connecting and resolve to a `stream_id` list.

This keeps the wire's filter contract simple: the broker matches stream IDs and that is all. No metadata evaluation at the broker, no predicate language, no schema. Vodka discipline at the filter layer.

If a subscriber wants to expand its filter mid-session, it disconnects and reconnects with the new header. The wire does not grow a runtime filter-mutation frame. Filter changes are a connection-level concern, not a per-message concern.

## Wire Surface

The change to `PROTOCOL.md` §4.1 is additive:

- A new optional header `X-AMS-Subscribe-Streams` is documented at connect.
- The `joined` server frame echoes the effective filter so the subscriber knows which streams the broker accepted into its read set. A new field `subscribed_streams` is added to the `joined` frame, listing the resolved set of `stream_id` values the broker registered the subscriber as a reader of.
- No new client-to-server frames. No new server-to-client frame types. No changes to existing frame shapes.

Conformance per `PROTOCOL.md` §7 grows one entry: a conformant implementation MUST honor `X-AMS-Subscribe-Streams` if present, intersecting the requested set with the subscriber's admitted set. An implementation MAY reject a request that names a stream not in the conversation; alternatively, it MAY silently drop unknown stream IDs (the produced read set is the same in both cases).

## Backwards Compatibility

Every existing client continues to work. Existing clients do not pass the new header; the broker behaves exactly as before. The `joined` frame gains a field that existing parsers ignore.

There is no migration path required. The change is purely additive at the wire layer.

## What This Forecloses

- A more elaborate filter language at the wire layer. This is intentional — predicate filtering, regex on names, metadata-based subscription would each require the broker to grow opinions about token-adjacent semantics. Any such filtering belongs in a wrapper, not in the wire.
- Mid-connection filter mutations. A subscriber that wants to change its filter reconnects.
- Wildcard subscriptions ("subscribe to all streams whose name starts with X"). Same reason: the broker stays vodka.

## What This Is Not

- Not a security mechanism. The conversation's admission boundary is what governs read access. A filter narrows what the subscriber receives; it does not grant access to streams the subscriber would otherwise be denied.
- Not a fan-out optimization for the broker. The broker still iterates the per-stream subscriber set per emit; the filter just shrinks the per-subscriber read set.
- Not selective emission. A subscriber's emissions are still broadcast to every reader of its stream per `D0009`. This decision narrows reads, not writes.

## Reversibility

**Two-way door.** The change is additive at the wire layer; clients can ignore the new header. If a future use case demonstrates the filter is harmful or insufficient, the header can be deprecated without breaking existing clients (those that did not pass it). The asymmetry is the typical "additive feature becomes load-bearing once adopted" caveat — once pipeline subscribers depend on the filter, removing it breaks them — but compared to most wire decisions this is among the safer to revisit.

## See Also

- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — the broadcast model this filters
- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` — the wrapper pattern that motivates the use case
- `ams://canon/decisions/D0016-buffering-and-persistence-as-wrapper-primitive` — composes with selective subscription so a wrapper can buffer only the streams it cares about
- `PROTOCOL.md` §4.1 — the connect handshake this extends
- `PROTOCOL.md` §3.3 — the inspect endpoint subscribers use to resolve names to IDs before connecting
- `SPEC.md` §5 — the deferred item this lifts
