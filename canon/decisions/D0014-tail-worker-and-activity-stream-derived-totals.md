---
uri: ams://canon/decisions/D0014-tail-worker-and-activity-stream-derived-totals
title: "D0014 — The Hook Layer Is a Tail Worker; State Totals Are Derived from the Activity Stream, Not Polled"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: stable
tags: ["ams", "canon", "decision", "observability", "tail-worker", "activity-stream-derived", "no-cron", "vodka-architecture"]
epoch: E0008.3
date: 2026-05-03
supersedes: "ams://canon/decisions/D0015-state-totals-via-snapshot-worker"
derives_from: "ams://canon/decisions/D0010-observability-via-subscriber-not-wire, ams://canon/constraints/observability-payload-boundary, klappy://canon/constraints/telemetry-governance"
complements: "ams://canon/principles/observability-as-subscriber, ams://canon/principles/wire-layer-latency-vocabulary, ams://canon/principles/token-count-derivation-on-subscribers, ams://canon/principles/vodka-architecture-applied"
governs: "How the AMS reference deployment implements the hook layer named in D0010 and how it answers state-total questions (how many accounts, conversations, live streams). Recommended convention; deployments that need different fidelity may add a periodic state probe documented as a deliberate exception."
status: active
---

# D0014 — The Hook Layer Is a Tail Worker; State Totals Are Derived from the Activity Stream, Not Polled

> The AMS Worker carries no telemetry code. A Tail Worker bound to it observes every invocation and writes the hook-layer rows D0010 names. State totals (accounts, conversations, live streams) are computed from sums of activity-stream events at query time in the dashboard's SQL, not by a scheduled poll. Three components, one dataset, zero scheduled jobs. The brittleness sources of D0015 — per-request inline hooks and per-minute Cron — are eliminated by replacing each with a natural CF-platform flow.

## Description

D0010 commits AMS observability to a two-layer pattern: a subscriber layer for wire-visible events and a hook layer for broker-internal events. D0015 implemented the hook layer as inline `writeDataPoint()` calls in the Worker and the state-totals problem as a per-minute Cron snapshot worker. Both choices were brittle in different ways:

- **Inline hooks** required every new control-plane handler to remember to call `writeDataPoint()`. A forgotten call site produced a silently-invisible event class. The hot path also carried telemetry concerns it didn't need.
- **Per-minute Cron snapshots** depended on Cloudflare Cron Triggers' best-effort delivery. A missed run produced a silent gap in headline numbers. The dashboard's "current accounts" displayed stale data that looked fresh.

D0014 replaces both with natural-flow CF primitives. The hook layer becomes a **Tail Worker** bound to the AMS Worker — the producer-Worker observation pattern Cloudflare's docs explicitly recommend for "aggregated analytics rather than individual log events." State totals become **activity-stream-derived SQL** — every state-changing event already produces an Analytics Engine row, and AE's aggregation functions can derive `accounts_total`, `conversations_total`, and `streams_live` from event sums at query time without any pre-computation step.

The result is fewer moving parts, no scheduled jobs, no inline telemetry code in the broker, and a single SQL surface that answers both activity and state questions. D0014 keeps the schema D0015 specified (8 blobs + 6 doubles per `observability-payload-boundary`) and inherits D0015's slot-reuse pattern.

## Outline

- The Three Components
- The Hook Layer as Tail Worker
- State Totals Derived From Activity Sums
- The Honest Fidelity Gap (DO Eviction)
- Door Type, Confidence, and Retraction
- What Forecloses
- What This Is Not

---

## The Three Components

The reference v1.2 deployment runs three observability components plus the dashboard:

1. **The AMS Worker (the broker)** — Has zero telemetry code. The Worker is the subject of observation, not the source of telemetry rows. Removing every observability dependency does not require touching the Worker.
2. **The Tail Worker (hook layer)** — A separate Worker bound to the AMS Worker via `tail_consumers` in `wrangler.toml`. Receives a `TailEvent` after every AMS Worker invocation, including the request URL, method, response status, console logs, and exception. Translates the event into the hook-layer schema and writes one row to Analytics Engine per relevant invocation.
3. **The observability subscriber (subscriber layer)** — Unchanged from `ams://canon/principles/observability-as-subscriber`. Joins each conversation as a polymorphic peer, applies own-stream filtering and payload-boundary redaction, writes activity-stream rows to the same Analytics Engine dataset.

The dashboard reads Analytics Engine via SQL. State totals are derived from activity sums; leaderboards from event aggregation; latency distributions from subscriber-layer rows; everything from one dataset distinguished by `event_type`.

## The Hook Layer as Tail Worker

A Tail Worker invokes its `tail()` handler every time the producer Worker (AMS Worker) is invoked. The handler receives:

- The `TailEvent` containing scriptName, outcome, eventTimestamp, logs, exceptions, diagnosticsChannelEvents
- For HTTP-triggered invocations: the original `Request`-shaped event (URL, method, headers — not body)
- The response outcome (success, exception, exceededCpu, etc.)

The Tail Worker translates this into hook-layer rows:

- `POST /v1/accounts` → `event_type='account_created'` (success) or `event_type='account_create_failed'` (4xx/5xx)
- `POST /v1/{ns}/conversations` → `event_type='conversation_minted'` or `event_type='conversation_mint_failed'`
- `GET /v1/{ns}/conversations/{alias}` → `event_type='conversation_inspected'` or `event_type='conversation_inspect_failed'`
- WebSocket upgrade attempts → `event_type='connect_attempted'` plus `connect_succeeded` or `connect_failed` with the close code (4001/4002/4003/4004/4005/4290) extracted from the response shape

Schema is exactly the existing `observability-payload-boundary` §"The Hook-Layer Schema" — same 8 blobs, same 6 doubles. The Tail Worker computes the field values from the TailEvent rather than receiving them from inline calls.

**Why this is more vodka than D0015's inline hooks:**

- The AMS Worker has zero telemetry imports, zero `writeDataPoint()` calls, zero awareness of observability. Pure broker.
- D0010's removability test (delete the hook layer, wire stays conformant) becomes trivial: unbind the Tail Worker in `wrangler.toml`. No code edits required.
- New endpoints get observed automatically. The Tail Worker watches every invocation; adding a route to the AMS Worker doesn't require remembering to add a hook call.
- Telemetry crashes can't affect the broker. Tail Workers run in their own isolate; an exception in the Tail handler does not propagate to the producer.
- The Tail Worker can apply filtering, sampling, and aggregation logic in one place rather than spread across handlers.

## State Totals Derived From Activity Sums

State totals are computed at query time from the activity stream. Examples:

```sql
-- Total accounts (lifetime; in v1.2 scope account deletion is out of scope, so lifetime = current)
SELECT uniqExact(blob4) AS accounts_total
FROM ams_telemetry
WHERE event_type = 'account_created'

-- Total conversations
SELECT uniqExact(blob5) AS conversations_total
FROM ams_telemetry
WHERE event_type = 'conversation_minted'

-- Live streams (as observed by the broker hook + subscriber wire-layer cooperation)
SELECT
  sumIf(_sample_interval, event_type = 'connect_succeeded')
    - sumIf(_sample_interval, event_type = 'stream_left') AS streams_live
FROM ams_telemetry
WHERE event_type IN ('connect_succeeded', 'stream_left')
```

The `streams_live` query is cross-layer by design: `connect_succeeded` is a hook-layer row (Tail Worker writes it on WS upgrade success); `stream_left` is a subscriber-layer row (the observability subscriber writes it on receiving the wire frame). The cross-layer math is honest because D0010's non-overlap discipline assigns each event class to exactly one layer — no double-counting.

The dashboard recipes in `docs/observability-dashboard.md` carry the canonical forms.

**Why this is more vodka than D0015's snapshot worker:**

- Zero polling. Zero scheduled jobs. Zero Cron exposure.
- The same rows that power leaderboards and latency distributions also power state totals. One dataset, one query surface, no separate path to maintain.
- Recovering from gaps is automatic: when activity resumes, totals self-correct from the resumed event flow.
- No "snapshot worker died and the dashboard shows stale numbers" failure mode. If the activity stream stops, all queries against it stop returning fresh data simultaneously — failure is loud, not silent.

## The Honest Fidelity Gap (DO Eviction)

D0014 has one fidelity loss compared to D0015, and it is named explicitly here so future readers can decide whether it deserves remediation.

**`do_evicted` is not observable through the Tail Worker.** Durable Object eviction happens between invocations, often without firing any Worker request the Tail Worker would observe. A DO that holds N stream registrations and is silently evicted causes those registrations to disappear from the broker's view. The activity stream sees no `stream_left` events for the orphaned streams (the DO didn't get to fire them on its way out). `streams_live` derived from `(connect_succeeded - stream_left)` will overcount until each affected client either reconnects (firing a new `connect_attempted` to a fresh DO) or times out at the network layer.

This is acceptable for the v1.2 PoC and the operational scale AMS will see early. The fidelity gap is bounded — re-connections eventually correct the count, and the broker's actual operational truth (the live DOs themselves) is unaffected by the observability gap.

**Re-entry signals that would reopen this:**

- Production operations require sub-minute accuracy on `streams_live` for capacity decisions.
- A regulatory or auditor requirement names "currently active streams" as a number that must be exact.
- DO eviction frequency at AMS production scale produces dashboard noise that misleads operators about real conversation activity.

If any of those fire, the remediation is **not** to bring back D0015's per-minute Cron. The remediation is one of:

- An hourly DO-health probe (single Cron at 1/60 the rate, dramatically less brittle than per-minute, snapshots only `dos_active` and `streams_live`).
- A DO alarm pattern where each ConversationDO writes a "still alive" heartbeat to AE on a periodic alarm, and the dashboard derives `streams_live` from the most recent heartbeat per DO.
- An explicit `streams_orphaned_correction` event that a separate health-check Worker emits when it detects orphaned registrations.

The choice among these is a v1.next decision. v1.2 ships without any of them.

## Door Type, Confidence, and Retraction

**Door type:** Two-way. Removing the Tail Worker leaves the AMS Worker fully functional and wire-conformant. State-totals SQL recipes can be replaced with snapshot reads if a future version reverses to D0015's pattern — though doing so reopens the brittleness this decision exists to eliminate. Per `SPEC.md` §9 vocabulary, this is a low-cost reversible commitment.

**Confidence:** Strong. The Tail Worker pattern is Cloudflare's documented recommendation for exactly this use case (writing aggregated analytics to AE from observed Worker invocations). The activity-stream-derived approach is ClickHouse-native (Analytics Engine inherits ClickHouse's aggregation functions, including `uniq()` for HyperLogLog approximate distinct and `uniqExact()` for exact counts). Both choices were verified against current Cloudflare documentation as of 2026-05-03 before D0014 landed.

**Retraction conditions:** D0014 is retracted or amended if (a) the Tail Worker's `TailEvent` shape proves insufficient to extract the hook-layer schema fields (e.g., a critical event class is not observable from outside the producer Worker); (b) Tail Worker reliability or sampling under AMS production volume distorts the hook-layer event counts beyond acceptable; (c) the activity-stream-derived state totals produce dashboard noise that misleads operators in real operational decisions, and the fidelity gap named above proves more than nominal; (d) a regulatory environment requires a single exact-cardinality source of truth for "currently active resources" that the activity-derived approach cannot satisfy. In any of these cases the remediation is the v1.next options listed in §"The Honest Fidelity Gap (DO Eviction)", not a return to D0015.

## What Forecloses

- The reference deployment cannot answer state-total queries about a moment in time before the first row of the relevant `event_type` landed in the dataset. Operators activating observability later than they wished will have a gap before the first event of each class.
- The activity-stream-derived `streams_live` cannot account for silently-evicted DOs. Per the fidelity gap above, this is named and accepted.
- The Tail Worker cannot observe events that do not produce a Worker invocation visible to the binding. Hook-class events that fire entirely inside a DO between requests (e.g., a hibernation cycle that completes without an external trigger) are invisible to the Tail layer. v1.2 does not commit to observing these.
- AMS deployments that require pre-computed state totals (e.g., for off-AE dashboards that cannot run aggregation queries efficiently) cannot use D0014's pattern unmodified. Such deployments compute the aggregation in a separate scheduled job that reads AE and writes back a snapshot row — re-implementing D0015's pattern as a layer on top of D0014's data, not as a replacement for D0014's hook strategy.
- The reference deployment cannot present observability data as a built-in dashboard route on the broker hosts. Dashboards remain separate services per `D0010` §"What Forecloses" item 4.

## What This Is Not

- Not a refusal to ever schedule anything. v1.2 ships without scheduled jobs; v1.next may add an hourly DO-health probe if the fidelity gap proves operationally meaningful. The decision is "no scheduled jobs in v1.2," not "no scheduled jobs ever."
- Not a wire feature. Tail Workers and activity-stream-derived totals are infrastructure choices; the wire is unchanged.
- Not specific to any particular dashboard tool. Grafana, Metabase, custom UIs, or direct SQL all read the same dataset.
- Not opinionated about which `uniq()` variant. `uniq()` is HyperLogLog-approximate (cheaper, fine for leaderboard cardinality); `uniqExact()` is exact (heavier, better for headline state totals at low cardinality). The dashboard recipes specify which is appropriate per query.
- Not a deprecation of the snapshot pattern in general. The pattern remains valid for projects whose state genuinely cannot be derived from event sums (e.g., systems where state mutations bypass the observable event surface entirely). For AMS, the event surface is sufficient.
- Not a commitment to AE forever. If AMS scale grows past where AE sampling distorts state-total derivations meaningfully, the natural migration is to Cloudflare Pipelines + R2 Iceberg (the data-lake pattern), not back to Cron snapshots. That migration is a v1.next decision.

## See Also

- `ams://canon/decisions/D0015-state-totals-via-snapshot-worker` (superseded) — the prior approach this decision replaces; documents the rejected per-request-hook alternative.
- `ams://canon/decisions/D0010-observability-via-subscriber-not-wire` — the architectural commit this decision implements.
- `ams://canon/constraints/observability-payload-boundary` — the schema this decision uses unchanged (amended 2026-05-03 for HMAC default).
- `ams://canon/principles/observability-as-subscriber` — the subscriber-layer pattern that handles wire-visible activity, complementary to D0014's hook layer.
- `ams://canon/principles/wire-layer-latency-vocabulary` — TTFF/TTFT discipline; the latency metrics this decision's data backs.
- `ams://canon/principles/token-count-derivation-on-subscribers` — token-count discipline; the token metrics this decision's data backs.
- `ams://canon/principles/vodka-architecture-applied` — the four-question test this decision passes more cleanly than D0015.
- `klappy://canon/constraints/telemetry-governance` — upstream telemetry doctrine; the schema source.
- Cloudflare docs: Tail Workers (`workers/observability/logs/tail-workers/`); Workers Analytics Engine (`analytics/analytics-engine/`); Analytics Engine SQL Reference for `uniq()` and `uniqExact()`.
