# Observability Dashboard — Reference SQL Recipes

> The canonical question set the AMS observability dataset is designed to answer, expressed as Cloudflare Workers Analytics Engine SQL. Each recipe names the question it answers, the canon URI it derives from, the slot allocation it relies on, and any honesty caveats the result inherits. This file is service docs, not canon. Recipes evolve as the dataset evolves; the canon constraints they rely on do not.

## Audience and Scope

Operators of the AMS reference deployment querying the `ams_telemetry` Analytics Engine dataset. The recipes assume the schema defined in `ams://canon/constraints/observability-payload-boundary` §"The Hook-Layer Schema" and the conventions established in:

- `ams://canon/decisions/D0010-observability-via-subscriber-not-wire` — the activity stream
- `ams://canon/decisions/D0015-state-totals-via-snapshot-worker` — the snapshot stream
- `ams://canon/principles/wire-layer-latency-vocabulary` — TTFF and TTFT honesty
- `ams://canon/principles/token-count-derivation-on-subscribers` — token-count approximation

Self-hosted AMS deployments that diverge from the reference schema adapt the column names; the question set is portable.

## SQL Conventions

Cloudflare Workers Analytics Engine uses ClickHouse-compatible SQL. Two operational conventions:

- **Always `SUM(_sample_interval)` for counts.** Analytics Engine sample-rates rows under load. `COUNT(*)` undercounts at scale; `SUM(_sample_interval)` corrects for sampling per Cloudflare's documentation.
- **Time filter on every query.** Unbounded scans run slowly and may hit query limits. The recipes default to `INTERVAL '24' HOUR` or `INTERVAL '7' DAY` and the operator widens as needed.

## The Headline Numbers

The dashboard's top row. Headline state totals are derived from the activity stream — no snapshot rows exist per `ams://canon/decisions/D0014-tail-worker-and-activity-stream-derived-totals`.

### 1. Total accounts (lifetime; in v1.2 scope = current)

```sql
SELECT uniqExact(blob4) AS accounts_total
FROM ams_telemetry
WHERE event_type = 'account_created'
```

`blob4` is the HMAC-SHA-256 truncated `account_id_hash`. Account deletion is out of v1.2 scope (per SPEC.md §5), so lifetime created equals current existing. When deletion ships in a v1.next, this query subtracts an `account_deleted` set.

### 2. Total conversations (lifetime; in v1.2 scope = current)

```sql
SELECT uniqExact(blob5) AS conversations_total
FROM ams_telemetry
WHERE event_type = 'conversation_minted'
```

Same logic: `blob5` is the HMAC-hashed `conversation_id`. Conversation deletion is out of v1.2 scope.

### 3. Live streams (cross-layer derivation)

```sql
SELECT
  sumIf(_sample_interval, event_type = 'connect_succeeded')
    - sumIf(_sample_interval, event_type = 'stream_left') AS streams_live
FROM ams_telemetry
WHERE event_type IN ('connect_succeeded', 'stream_left')
```

`connect_succeeded` is written by the Tail Worker (hook layer, broker-side WS upgrade success). `stream_left` is written by the observability subscriber (subscriber layer, wire-visible frame). Cross-layer math is honest because D0010's non-overlap discipline assigns each event class to exactly one layer.

**Honest disclosure on this card:** per `ams://canon/decisions/D0014-tail-worker-and-activity-stream-derived-totals` §"The Honest Fidelity Gap (DO Eviction)", silently-evicted DOs cause `streams_live` to overcount until each affected client reconnects. Display the disclosure footer.

### 4. Total tokens (lifetime, wire-layer estimate)

```sql
SELECT SUM(double5 * _sample_interval) AS tokens_estimate_total
FROM ams_telemetry
WHERE event_type = 'stream_token_summary'
  AND blob2 = 'tokens_estimate'
```

Per `ams://canon/principles/token-count-derivation-on-subscribers`, this is a `cl100k_base` approximation of language-model tokens, drifting ~3–4% from any specific provider's billing tokenizer. **Display this number with the suffix "(estimate, ~3–4% drift)" or include a tooltip linking to the principle.** Operators who want billing-accurate counts capture them at the agent layer, not here.

## The Leaderboards

"Top N by tokens" cuts. Same query shape, different `GROUP BY` blob.

### Top accounts by token volume (last 7 days)

```sql
SELECT blob4 AS account_id_hash,
       SUM(double5 * _sample_interval) AS tokens_estimate
FROM ams_telemetry
WHERE event_type = 'stream_token_summary'
  AND blob2 = 'tokens_estimate'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY blob4
ORDER BY tokens_estimate DESC
LIMIT 20
```

`blob4` is the HMAC-SHA-256 truncated `account_id_hash` per the amended `observability-payload-boundary` §"Hashing and Pseudonymization". Operators with the HMAC secret may de-hash for their own internal joins; the dashboard does not.

### Top conversations by token volume (last 7 days)

```sql
SELECT blob5 AS conversation_id_hash,
       SUM(double5 * _sample_interval) AS tokens_estimate
FROM ams_telemetry
WHERE event_type = 'stream_token_summary'
  AND blob2 = 'tokens_estimate'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY blob5
ORDER BY tokens_estimate DESC
LIMIT 20
```

Useful for finding runaway conversations and for capacity planning by conversation shape.

### Top namespaces by activity (last 24 hours)

```sql
SELECT blob3 AS namespace,
       SUM(_sample_interval) AS connect_attempts
FROM ams_telemetry
WHERE event_type IN ('connect_attempted', 'connect_succeeded', 'connect_failed')
  AND timestamp > NOW() - INTERVAL '24' HOUR
GROUP BY blob3
ORDER BY connect_attempts DESC
LIMIT 10
```

Reveals which namespaces are driving load; useful before any per-namespace capacity decision.

## Latency

Per `ams://canon/principles/wire-layer-latency-vocabulary`, the column names matter — TTFF and TTFT are different metrics with different truth conditions.

### TTFF distribution (last 24 hours, p50/p95/p99)

```sql
SELECT
  quantile(0.50)(double5) AS ttff_user_p50_ms,
  quantile(0.95)(double5) AS ttff_user_p95_ms,
  quantile(0.99)(double5) AS ttff_user_p99_ms
FROM ams_telemetry
WHERE event_type = 'stream_first_token'
  AND blob2 = 'ttff_user'
  AND timestamp > NOW() - INTERVAL '24' HOUR
```

This is the user-perceived "time from connect to first byte" — what your client app feels. It is not the model's TTFT.

### TTFT (anchored only) distribution

```sql
SELECT
  quantile(0.50)(double5) AS ttft_anchored_p50_ms,
  quantile(0.95)(double5) AS ttft_anchored_p95_ms,
  quantile(0.99)(double5) AS ttft_anchored_p99_ms,
  SUM(_sample_interval) AS anchored_conversation_count
FROM ams_telemetry
WHERE event_type = 'stream_first_token'
  AND blob2 = 'ttft_anchored'
  AND timestamp > NOW() - INTERVAL '24' HOUR
```

**Display the `anchored_conversation_count` next to the percentiles.** If only 12% of conversations emit the `model_invoked` anchor, the percentiles describe 12% of the population, not the system. The principle is explicit that silent extrapolation is fabrication.

### Top accounts by p99 TTFF (worst experience)

```sql
SELECT blob4 AS account_id_hash,
       quantile(0.99)(double5) AS ttff_user_p99_ms,
       SUM(_sample_interval) AS sample_count
FROM ams_telemetry
WHERE event_type = 'stream_first_token'
  AND blob2 = 'ttff_user'
  AND timestamp > NOW() - INTERVAL '24' HOUR
GROUP BY blob4
HAVING sample_count >= 10
ORDER BY ttff_user_p99_ms DESC
LIMIT 20
```

The `HAVING sample_count >= 10` filter excludes accounts with too few samples to support a stable p99. Tune the floor as data accumulates.

## State-Total Trends

Cardinalities over time, derived from activity-stream events. Per D0014, no snapshot rows exist; trends are computed by binning events by time and accumulating cardinality.

### Account growth over the last 30 days

```sql
SELECT
  day,
  runningAccumulate(accounts_state) AS accounts_total
FROM (
  SELECT
    toStartOfDay(timestamp) AS day,
    uniqExactState(blob4) AS accounts_state
  FROM ams_telemetry
  WHERE event_type = 'account_created'
    AND timestamp > NOW() - INTERVAL '30' DAY
  GROUP BY day
  ORDER BY day ASC
)
ORDER BY day ASC
```

A growing line is the adoption signal. The accumulating window function gives you cumulative-by-day instead of daily-new. For "new accounts per day" instead, use `uniqExact(blob4)` without the running accumulator.

### Live-streams trend (last 24 hours, per-minute, derived)

```sql
WITH per_minute AS (
  SELECT
    toStartOfMinute(timestamp) AS minute,
    sumIf(_sample_interval, event_type = 'connect_succeeded') AS joined,
    sumIf(_sample_interval, event_type = 'stream_left') AS left
  FROM ams_telemetry
  WHERE timestamp > NOW() - INTERVAL '24' HOUR
  GROUP BY minute
)
SELECT
  minute,
  SUM(joined - left) OVER (ORDER BY minute) AS streams_live_running
FROM per_minute
ORDER BY minute ASC
```

Daily-rhythm signal; usage shape per timezone; spikes that warrant DO scaling decisions. Caveat per D0014: silently-evicted DOs cause the running total to drift upward; reconnections eventually correct.

## Health and Failure Mode

### Connect-failure rate by close code (last 24 hours)

```sql
SELECT blob2 AS close_code,
       SUM(_sample_interval) AS failures
FROM ams_telemetry
WHERE event_type = 'connect_failed'
  AND timestamp > NOW() - INTERVAL '24' HOUR
GROUP BY blob2
ORDER BY failures DESC
```

Per `PROTOCOL.md` §6, the close codes are `4001` (invalid magic link), `4002` (bad credential), `4003` (over concurrency), `4004` (stream-name conflict), `4005` (conversation not found), `4290` (sustained backpressure). High `4001` is a leaked-link or expired-link signal; high `4290` is a capacity signal.

### Activity-stream liveness

```sql
SELECT MAX(timestamp) AS last_activity_at,
       NOW() - MAX(timestamp) AS staleness
FROM ams_telemetry
WHERE event_type IN ('account_created', 'conversation_minted', 'connect_attempted', 'connect_succeeded', 'connect_failed')
```

If `staleness` exceeds expected idle time (operator judgment), the Tail Worker has stopped writing — the AMS Worker may still be serving but observability is blind. Loud failure mode per D0014: when the activity stream stops, all derived numbers stop refreshing simultaneously, not one card at a time.

### Tail Worker write health (cross-event sanity)

```sql
SELECT
  SUM(_sample_interval) AS hook_writes_24h,
  COUNT(DISTINCT blob1) AS distinct_event_types,
  arraySort(groupUniqArray(blob1)) AS event_types_seen
FROM ams_telemetry
WHERE (event_type LIKE 'account_%'
    OR event_type LIKE 'conversation_%'
    OR event_type LIKE 'connect_%')
  AND timestamp > NOW() - INTERVAL '24' HOUR
```

A drop to zero with subscriber rows still landing means the Tail Worker stopped. A drop in both with the AMS Worker still serving means AE is the broken layer (escalate to Cloudflare).

## Honesty Footers (Recommended on the Dashboard UI)

Per `ams://canon/principles/wire-layer-latency-vocabulary`, `ams://canon/principles/token-count-derivation-on-subscribers`, and `ams://canon/decisions/D0014-tail-worker-and-activity-stream-derived-totals`, the dashboard renders these footers near the relevant cards:

- **Token estimates:** "Token counts are `cl100k_base` approximations of language-model tokens, computed at the wire layer. Drift from provider tokenizers is ~3–4% on English prose. For billing-accurate counts, use agent-layer instrumentation."
- **TTFT (anchored) cards:** "TTFT is computed only for conversations where the agent emits a `model_invoked` anchor frame. The shown percentiles describe N of M conversations in the time window. Conversations without an anchor contribute to TTFF but not TTFT."
- **State totals:** "State totals are derived from activity-stream sums in Analytics Engine. Numbers refresh as new events flow; if the activity stream stalls, all derived state numbers go stale together (loud failure mode)."
- **Live streams:** "Silently-evicted Durable Objects cause this number to overcount until clients reconnect. Per the canon decision (D0014), this fidelity gap is named and accepted for v1.2."
- **Identifier hashes:** "Account and conversation identifiers are HMAC-SHA-256 hashed (truncated to 12 hex chars) before leaving the broker. The HMAC secret is held only by the Tail Worker and not present in this dataset; cross-rotation joins are not supported."

## What This Doc Is Not

- Not a protocol specification. The recipes describe how to read the dataset; the protocol governing what enters the dataset lives in canon.
- Not a complete dashboard build. A dashboard application (Grafana, Metabase, custom UI) implements these queries plus presentation. This file gives the queries; the application chooses the layout.
- Not stable across schema migrations. If the schema in `observability-payload-boundary` changes, every recipe here changes. Update both together; the dashboard breaks loudly when the schema moves silently.
- Not a substitute for `ams://canon/principles/observability-as-subscriber`. Subscribers contribute the activity stream this dashboard reads from; their own per-record schema lives in canon. This doc is the read side; canon is the write side.

## See Also

- `ams://canon/decisions/D0010-observability-via-subscriber-not-wire`
- `ams://canon/decisions/D0015-state-totals-via-snapshot-worker` (superseded 2026-05-03 by D0014)
- `ams://canon/decisions/D0014-tail-worker-and-activity-stream-derived-totals`
- `ams://canon/constraints/observability-payload-boundary` (amended 2026-05-03)
- `ams://canon/principles/observability-as-subscriber`
- `ams://canon/principles/wire-layer-latency-vocabulary`
- `ams://canon/principles/token-count-derivation-on-subscribers`
- `klappy://canon/constraints/telemetry-governance`
- `oddkit://tools/telemetry_public` — upstream pattern for raw-SQL exposure
