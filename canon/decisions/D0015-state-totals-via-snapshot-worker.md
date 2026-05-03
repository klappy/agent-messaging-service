---
uri: ams://canon/decisions/D0015-state-totals-via-snapshot-worker
title: "D0015 — State Totals Are Captured by a Snapshot Worker, Not Inferred from the Activity Stream"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: stable
tags: ["ams", "canon", "decision", "observability", "cardinality", "snapshot-worker", "analytics-engine", "vodka-architecture"]
epoch: E0008.3
date: 2026-05-03
derives_from: "ams://canon/decisions/D0010-observability-via-subscriber-not-wire, ams://canon/constraints/observability-payload-boundary §'Retention and Sink Hygiene', klappy://canon/constraints/telemetry-governance, ARCHITECTURE.md §8, SPEC.md §12.9"
complements: "ams://canon/principles/observability-as-subscriber, ams://canon/principles/wire-layer-latency-vocabulary, ams://canon/principles/token-count-derivation-on-subscribers"
governs: "How the AMS reference deployment computes and exposes 'how many accounts / conversations / live streams exist right now' alongside the activity stream from D0010. Recommended convention; deployments may compute state totals differently provided the activity-vs-state split is preserved."
status: superseded
superseded_by: "ams://canon/decisions/D0014-tail-worker-and-activity-stream-derived-totals"
superseded_date: 2026-05-03
superseded_reason: "Operator challenge during pre-execution review surfaced the brittleness of Cron-based polling. The activity-stream-derived approach in D0014 eliminates the snapshot worker entirely while keeping the same SQL surface and same dataset. D0015 retains documentary value for capturing the rejected per-request-hook alternative and the slot-reuse pattern (which D0014 inherits)."
---

# D0015 — State Totals Are Captured by a Snapshot Worker, Not Inferred from the Activity Stream

> **SUPERSEDED 2026-05-03 by `ams://canon/decisions/D0014-tail-worker-and-activity-stream-derived-totals`.** Operator challenge during pre-execution review of the v1.2 spec surfaced the brittleness of Cron-based polling. D0014 derives state totals from the activity-stream sums in Analytics Engine, eliminating the per-minute Cron worker and the per-request inline hook calls in one move. D0015 retains documentary value for the rejected per-request-hook alternative (which D0014 also rejects, on the same grounds) and the slot-reuse pattern (which D0014 inherits). The text below stands as historical record; bindings on this decision should be migrated to D0014.

> AMS observability captures activity from D0010 plus state totals from a snapshot worker. The two layers cooperate without overlapping. State totals (accounts that exist, conversations that exist, streams currently registered) are cardinalities of a current set and cannot be reconstructed from event sums without drift. The reference deployment captures state totals by a per-minute Cron worker that reads the operational stores and writes one snapshot row per metric to the same Analytics Engine dataset the hook layer writes to.

## Description

D0010 establishes the subscriber-vs-hook split for observability and commits the AMS reference deployment to Cloudflare Workers Analytics Engine for the hook layer. `observability-payload-boundary` defines the hook-layer schema (8 blobs, 6 doubles) and mentions long-term aggregation snapshots in passing as a retention-window practice. Neither addresses the question this decision answers: **how does the operator know how many accounts currently exist, how many conversations currently exist, and how many streams are currently registered, with the same SQL surface and time-series shape as the activity dataset?**

Three inadequate answers were considered and rejected. The first — `SELECT uniqExact(blob_4) FROM ams_telemetry` to derive cardinality from the activity stream — is wrong because activity is sampled (Analytics Engine sampling kicks in at scale) and silent (an account that exists but has no recent activity is invisible). The second — a separate state store (KV counter, dedicated D1 table) — adds a sink the dashboard would have to join against and breaks the "same SQL, one dataset" property the upstream telemetry doctrine values. The third — a synchronous read inside every dashboard query — turns every dashboard refresh into a `COUNT(*)` against the operational KV, which is operationally hostile and rate-limit-sensitive.

The snapshot-worker pattern keeps the activity-vs-state split clean while keeping the dataset count at exactly one. A scheduled worker runs every minute, reads the operational stores once, and emits one snapshot row per metric. Dashboards query the same dataset for both activity sums and state cardinalities, distinguished by `event_type`.

## Outline

- The Snapshot Schema
- Why a Worker, Not a Per-Request Hook
- Why Per-Minute, and What "Per-Minute" Costs
- The Activity-vs-State Split, in SQL Terms
- Door Type, Confidence, and Retraction
- What Forecloses
- What This Is Not

---

## The Snapshot Schema

A snapshot row uses the existing hook-layer slot allocation from `observability-payload-boundary` §"The Hook-Layer Schema" with three constants and one varying double per row:

### Blobs

| Slot | Field | Snapshot value |
|------|-------|----------------|
| 1 | `event_type` | `state_snapshot` |
| 2 | `endpoint_or_close_code` | the metric name: `accounts_total`, `conversations_total`, `streams_live`, `dos_active` |
| 3 | `namespace` | the namespace the snapshot scopes to, or `*` for cross-namespace counts |
| 4 | `account_id_hash` | `none` (snapshots are not per-account) |
| 5 | `conversation_id_hash` | `none` |
| 6 | `error_code` | `ok` if the snapshot read succeeded, otherwise an error identifier (`kv_timeout`, `do_list_failed`) |
| 7 | `worker_version` | the snapshot worker's version |
| 8 | `region` | the Cloudflare colo the Cron ran in |

### Doubles

| Slot | Field | Snapshot value |
|------|-------|----------------|
| 1 | `count` | always `1` (the row counts as one snapshot event for SUM-of-snapshots queries) |
| 2 | `duration_ms` | wall-clock the snapshot read took |
| 3 | `bytes_in` | `0` |
| 4 | `bytes_out` | `0` |
| 5 | `peer_count_at_event` | the cardinality being reported (the headline number) |
| 6 | `do_concurrency_at_event` | `0` |

The `peer_count_at_event` slot carries the metric value because it is the only existing double that means "a count at this moment in time." Reusing it avoids a schema slot expansion and stays inside the established 6-double allocation. Dashboards that read this column under `event_type='state_snapshot'` interpret it as the named metric in `endpoint_or_close_code`. No new slot is introduced.

### The metric set

The reference deployment ships four metrics:

- `accounts_total` — `SELECT COUNT(*) FROM accounts_kv` (or its equivalent — the operational store of provisioned accounts)
- `conversations_total` — count of conversations registered in KV (alias-to-id mappings)
- `streams_live` — count of stream registrations currently held across all ConversationDOs that respond to the snapshot worker's enumeration call
- `dos_active` — count of ConversationDOs that responded to enumeration within the snapshot's timeout

Other deployments may add metrics (e.g., `subscribers_live`, `accounts_active_24h`) by following the same shape: one row per metric per snapshot tick.

## Why a Worker, Not a Per-Request Hook

A per-request hook that increments a counter on every account/conversation/stream creation appears simpler but fails three tests.

**It cannot decrement honestly.** Streams leave when their DO evicts, when a WebSocket drops, or when a hibernation cycle completes. Most of these paths do not call back to a centralized counter — they unwind locally. A counter incremented on every create and decremented only on observable-close drifts upward over time and is silently wrong.

**It conflates lifetime and current.** A counter incremented per create captures lifetime cumulative count; that is `accounts_lifetime_created`, not `accounts_total`. The two answer different questions and the wire-as-source-of-truth doesn't distinguish them. The activity stream from D0010 already has lifetime cumulative covered (`SUM(_sample_interval) WHERE event_type='account_created'`); `accounts_total` is a different metric that requires reading the operational store.

**It tightens coupling between the hot path and the observability dataset.** D0010's hook layer is removable without changing wire conformance. A counter mutation embedded in every create path makes telemetry a precondition for the operation rather than a side effect. The snapshot worker keeps the hot path untouched.

The snapshot worker is the only place that holds the operational read. Adding it does not add a sink (it writes to the existing AE dataset), does not add a query surface (the same SQL reads it), and does not couple any hot path to telemetry success.

## Why Per-Minute, and What "Per-Minute" Costs

Per-minute is the cadence the AMS reference deployment commits to. The cost calculus:

- 60 snapshots × 4 metrics = 240 rows per hour = ~175,000 rows per month.
- Cloudflare Workers Analytics Engine free tier accepts 100,000 writes per day. Snapshot writes consume ~5,800 per day, well under the floor.
- Cron Triggers on the Workers paid plan run at one-minute granularity at no additional charge beyond the plan baseline.
- One Cron invocation per minute does up to four KV reads and one DO enumeration. KV read latency is single-digit ms at the edge; DO enumeration is bounded by the count of ConversationDOs and is acceptable at PoC scale (the SPEC §8 budget is ~100 subscribers per conversation, no enumeration ceiling stated for conversation count itself).

Cadences slower than per-minute (5-minute, hourly) are valid choices for cost-sensitive deployments and require no schema change — they just emit fewer rows. Faster than per-minute (sub-minute) is not supported by Cron Triggers and would require a Durable Object alarm pattern, which adds infrastructure surface this decision does not commit to.

## The Activity-vs-State Split, in SQL Terms

Both layers live in the same `ams_telemetry` dataset. The split is enforced by `event_type` and is the operator's mental model when querying:

```sql
-- Activity totals (sums of events from D0010 hook layer)
SELECT SUM(_sample_interval) AS accounts_lifetime_created
FROM ams_telemetry
WHERE event_type = 'account_created'
  AND timestamp > NOW() - INTERVAL '30' DAY

-- State totals (latest snapshot from this decision)
SELECT double5 AS accounts_total
FROM ams_telemetry
WHERE event_type = 'state_snapshot'
  AND blob2 = 'accounts_total'
ORDER BY timestamp DESC
LIMIT 1

-- State trend (timeseries of a state total)
SELECT timestamp, double5 AS accounts_total
FROM ams_telemetry
WHERE event_type = 'state_snapshot'
  AND blob2 = 'accounts_total'
  AND timestamp > NOW() - INTERVAL '24' HOUR
ORDER BY timestamp ASC
```

The two query shapes never combine in a single statement and never disagree about each other. Activity rows carry per-event facts; state rows carry point-in-time cardinalities. A dashboard that needs both displays them as separate panels.

## Door Type, Confidence, and Retraction

**Door type:** Two-way. Removing the snapshot worker leaves the wire conformant, the activity stream functional, and the operational stores intact. State totals stop being queryable through Analytics Engine; they remain queryable directly against the operational stores. The decision can be reversed with no schema migration and no wire change. Per `SPEC.md` §9 vocabulary, this is a low-cost reversible commitment.

**Confidence:** Working belief grounded in the upstream telemetry pattern (`klappy://canon/constraints/telemetry-governance`) and the AMS observability split (`ams://canon/decisions/D0010-observability-via-subscriber-not-wire`). The pattern has not been operated at AMS scale; the per-minute cadence and slot-reuse choices are recommendations until contact with reality forces revision.

**Retraction conditions:** The decision is retracted or amended if (a) Cron Trigger reliability proves insufficient and snapshot gaps make the dataset operationally untrustworthy; (b) a fifth metric requires a 7th double slot, at which point the slot-reuse pattern is reopened; (c) AMS scale grows to the point where Analytics Engine sampling distorts state-snapshot rows distinguishably (sampling is keyed on consumer label per upstream and snapshot rows have no consumer-label semantics, so sampling behavior under load is an open question); or (d) a sink-divergence pattern emerges where multiple deployments need different state-total semantics and a single canonized shape blocks adaptation.

## What Forecloses

- The reference deployment cannot answer "how many accounts existed at T" without a snapshot in the dataset for some t ≤ T. Snapshots that did not happen cannot be back-filled (the operational stores no longer hold the historical state). Operators starting later than they wished will have a gap.
- The deployment cannot derive `accounts_total` from the activity stream alone with confidence; the snapshot is the source of truth, the activity stream is the source of motion.
- Adding a fifth or sixth snapshot metric is additive and free, but each metric the snapshot worker reads adds latency to the snapshot run. A snapshot worker that exceeds its execution budget loses tail metrics. The metric set is a budget conversation, not a feature conversation.
- Cron Trigger reliability is the upper bound on snapshot completeness. A missed Cron run produces a one-minute gap in the time series; the dashboard interpolates or shows the gap, but the gap is real.

## What This Is Not

- Not a commitment to AE-as-state-store. The snapshot reads the operational stores; AE holds the readout. Authoritative state continues to live in KV (and in the future, whichever store replaces it). Deleting the entire AE dataset deletes observability history; it does not delete the system's truth.
- Not a wire feature. Snapshots are infrastructure hooks under D0010's hook layer, not subscriber-visible events. No `state_snapshot` frame is added to the wire.
- Not a replacement for activity tracking. Lifetime sums (total tokens, total streams ever created) live in the activity stream from D0010. State totals answer a different question and complement, never substitute.
- Not a per-account observability surface. Snapshots are cross-cutting cardinality reads; per-account drilldowns use the activity stream's hashed identifiers per the boundary doc. Mixing the two would re-introduce the dual-recording inflation D0010 forbids.
- Not opinionated about which store backs `accounts_total` etc. The decision commits to "read the operational store"; the operational store is implementation, not protocol.

## See Also

- `ams://canon/decisions/D0010-observability-via-subscriber-not-wire` — the architectural commit this decision extends
- `ams://canon/constraints/observability-payload-boundary` — the hook-layer schema this decision reuses
- `ams://canon/principles/observability-as-subscriber` — the subscriber-layer pattern that handles wire-visible activity
- `ams://canon/principles/wire-layer-latency-vocabulary` — TTFF/TTFT distinction, sister gap-fill in the same observability cluster
- `ams://canon/principles/token-count-derivation-on-subscribers` — token-count approximation on the subscriber, sister gap-fill
- `klappy://canon/constraints/telemetry-governance` — upstream telemetry doctrine, schema source
- `SPEC.md` §12.9 — observability subscriber on horizon (the activity-stream side)
- `ARCHITECTURE.md` §8 — observability staging
