# AMS Spec / PRD — v1.2 (Observability) — DRAFT

> Token stream routing — production observability via Tail Worker, polymorphic subscriber, and activity-stream-derived totals.

**Version:** 1.2.0-draft (additive minor over v1.1.1; no wire change; no v1 PoC behavior altered; revised 2026-05-03 to drop scheduled jobs entirely after pre-execution operator challenge).
**Status:** Draft for operator review. On acceptance, the changes below merge into SPEC.md proper as v1.2 and this draft is moved to `journal/`. Last updated 2026-05-03.

This is the lock for what AMS commits to ship in the v1.2 minor — the first observability stack that operates the patterns canonized in `ams://canon/decisions/D0010-observability-via-subscriber-not-wire` and refined in `ams://canon/decisions/D0014-tail-worker-and-activity-stream-derived-totals` (which supersedes `ams://canon/decisions/D0015-state-totals-via-snapshot-worker`). The deeper docs (canon overlay + `ARCHITECTURE.md` + `POC-INFRA.md`) are the reference layer. This doc is the contract.

When this doc and a deeper doc disagree, this doc wins until the next revision; deeper docs are then updated to match. Per SPEC §14 forward-compatibility check, every commitment below has been evaluated against `HORIZON.md` and does not foreclose any catalog entry — observability is the first shipping instance of `HORIZON.md` §4 (Governance and Oversight) and enables that whole class of subscribers.

---

## 1. Problem

After the v1 PoC ships, the AMS reference deployment will operate at indeterminate volume on Cloudflare with zero structured visibility. The Cloudflare Workers dashboard shows total request count and nothing else. The maintainer cannot answer who is using the broker, which conversations move the most token volume, what TTFF distribution looks like, whether close-code 4290 (sustained backpressure) is firing, or how many accounts and conversations exist at any given moment.

The upstream sibling project (oddkit) faced the same forcing fault at 514,000 requests per month and resolved it under Epoch 8 (`klappy://docs/appendices/epoch-8`). AMS inherits the doctrine — track structural identifiers, publish the data, never inspect content — and now ships the implementation. The architectural commit was made under `ams://canon/decisions/D0010-observability-via-subscriber-not-wire` on 2026-05-01; v1.2 builds the layers that decision named, using natural CF-platform flows per `ams://canon/decisions/D0014-tail-worker-and-activity-stream-derived-totals` rather than scheduled jobs and inline hooks.

## 2. Goal

Ship the **smallest observability stack** that makes the AMS reference deployment self-knowable along the dimensions the operator named: token volume, latency (TTFF and anchored TTFT), per-account/per-conversation/per-model leaderboards, and the headline state totals (accounts, conversations, live streams). One Analytics Engine dataset. One Tail Worker observing the AMS Worker plus one polymorphic-subscriber observability sink — **no scheduled jobs, no inline telemetry code in the broker.** Dashboards run as separate services that read SQL.

This is infrastructure serving the Maintainability principle. Per `ams://canon/principles/vodka-architecture-applied`, the broker does not grow thicker — it grows *thinner*: the AMS Worker has zero telemetry code under v1.2. Every observability layer is removable without changing wire conformance. Pre-execution operator challenge surfaced and resolved a brittleness pattern (Cron polling + inline hooks) that the v1.2 design now avoids structurally per `ams://canon/decisions/D0014-tail-worker-and-activity-stream-derived-totals`.

## 3. Acceptance — How We Know We Shipped

The v1.2 stack is **done** when all of the following are observable, end-to-end, on the deployed infrastructure.

### 3.1 Smoke Test (mechanical)

Run after the branch deploys via the operator's git-hook deploy. All seven must pass against `ams.klappy.dev` (and identically `ams.truthkit.ai` per D0011).

1. **HMAC secret bound.** `wrangler secret list` (or the Cloudflare dashboard equivalent) shows `AMS_TELEMETRY_HASH_KEY` present in **both** the AMS Worker and the Tail Worker environments. Boot logs confirm the secret is non-empty without printing it.
2. **Tail Worker bound to AMS Worker.** `wrangler.toml` for the AMS Worker contains `tail_consumers = [{ service = "ams-tail" }]`. Deploying the AMS Worker without the Tail Worker existing first fails fast with a clear message.
3. **Tail Worker writes one row per Worker invocation.** `curl -X POST .../v1/accounts -d '{"namespace":"smoke12"}'` returns `201`. Within 60 seconds, a `telemetry_public`-style SQL query returns a row with `event_type='account_created'`, `blob3='smoke12'`, `blob4` matching the HMAC of the returned account ID, `double2 > 0`. The AMS Worker source contains zero references to `writeDataPoint` or to the AE binding name — the Worker is telemetry-free and the row exists nonetheless (the removability proof, run as a smoke test).
4. **Tail Worker handles failure cases.** A `curl ... /v1/.../connect` with a deliberately-invalid magic link returns `4001` close on the WebSocket. Within 60 seconds, a SQL query returns a row with `event_type='connect_failed'`, `blob2='4001'` — written by the Tail Worker observing the failed upgrade response.
5. **State totals derive from activity sums.** With 3 accounts created and 2 conversations minted, the dashboard SQL recipes (`docs/observability-dashboard.md`) for `accounts_total` and `conversations_total` return `3` and `2` respectively, computed via `uniqExact()` over the activity stream. **No `event_type='state_snapshot'` rows are present** (the verification that no Cron job is writing them).
6. **Observability subscriber connects and emits.** The reference observability subscriber (deployed as a separate Worker) joins a freshly-minted conversation, receives the conversation's `joined` frame, declares `role: "observability_sink"` per `ams://canon/principles/observability-as-subscriber`, and after the conversation's stream closes writes one `event_type='stream_token_summary'` row to AE per stream (or per N-minute window for long-running streams) per `ams://canon/principles/token-count-derivation-on-subscribers` — not one row per token frame. Cross-layer state-totals query (`streams_live = SUM(connect_succeeded) - SUM(stream_left)`) returns the expected number for the test conversation.
7. **TTFF measured + token counts non-zero.** With two test agents in a conversation, the observability subscriber records `event_type='stream_first_token'` rows for both `ttff_user` and (when the agent emits a `model_invoked` anchor) `ttft_anchored` per `ams://canon/principles/wire-layer-latency-vocabulary`. A token frame with non-empty `data` produces a `stream_token_summary` row whose metric value (per the D0014-inherited slot-reuse pattern) is greater than zero with `blob2='tokens_estimate'` per `ams://canon/principles/token-count-derivation-on-subscribers`.

### 3.2 Demo Gate (real-world)

The v1.2 stack passes its demo when:

- The reference dashboard (Grafana, Metabase, or any SQL-reader against AE) renders the headline numbers (accounts_total, conversations_total, streams_live, lifetime tokens), the top-20-by-tokens leaderboard for accounts and conversations, the TTFF p50/p95/p99 distribution, and the close-code failure breakdown — all from the SQL recipes in `docs/observability-dashboard.md`, with no hand-edits to the queries.
- A token-count estimate is visible alongside its `(estimate, ~3–4% drift)` honesty footer per `ams://canon/principles/token-count-derivation-on-subscribers`.
- A TTFT (anchored) panel renders the percentiles **plus** the count of anchored conversations the percentiles describe (the principle's anti-fabrication requirement).
- The AMS Worker source contains zero references to `writeDataPoint` and zero AE binding (the structural removability proof D0014 commits to).

### 3.3 Definition of Done (per `klappy://canon/constraints/definition-of-done`)

Same closeout-artifact discipline as v1 — change description, verification performed, observed behavior, evidence produced, self-audit. The v1.2 closeout additionally includes:

- A 24-hour AE-data screenshot showing the headline numbers and at least one leaderboard with real data.
- A SQL transcript proving the activity stream has been continuously populated for ≥ 1 hour without gaps (loud failure mode of D0014: if the stream stops, all queries against it stop returning fresh data simultaneously, not just one card).
- A `grep -r writeDataPoint worker/src/` showing zero matches in the AMS Worker source — the structural removability proof D0014 requires (D0010's removability test, made trivial: unbind the Tail Worker in `wrangler.toml` and the wire stays conformant with no source edits).
- A confirmation that unbinding the Tail Worker (commenting out `tail_consumers` and redeploying) leaves all wire-conformance smoke tests passing.

---

## 4. Scope — IN

What v1.2 commits to ship beyond v1.1.1:

- **Tail Worker (hook layer).** A separate Cloudflare Worker bound to the AMS Worker via `tail_consumers` in `wrangler.toml`. The Tail Worker's `tail()` handler observes every AMS Worker invocation and writes one Analytics Engine row per relevant invocation. Per `ams://canon/decisions/D0014-tail-worker-and-activity-stream-derived-totals`, this is the natural-flow replacement for D0015's inline-hook-call-sites pattern. **The AMS Worker itself contains zero telemetry code** — no `writeDataPoint()` calls, no AE binding. Schema per `ams://canon/constraints/observability-payload-boundary` §"The Hook-Layer Schema" with the HMAC amendment of 2026-05-03 applied. The Tail Worker translates `TailEvent` data into the schema fields.
- **HMAC secret provisioning (both Workers).** `AMS_TELEMETRY_HASH_KEY` bound as a Cloudflare Workers secret on both the AMS Worker (subscribers may reference for self-hash convenience) and the Tail Worker (does the actual hook-layer hashing). Boot guard: if the secret is missing on the Tail Worker, it logs a warning and falls back to unkeyed SHA-256 truncated, per the boundary doc's documented downgrade.
- **Activity-stream-derived state totals.** No snapshot worker. State totals are computed at query time from event sums in Analytics Engine: `accounts_total = uniqExact(blob_account_hash)` over `event_type='account_created'`, `streams_live = SUM(connect_succeeded) - SUM(stream_left)` over a recent window, and so on. Recipes carried by `docs/observability-dashboard.md`. Per D0014, the fidelity gap on `do_evicted` is named and accepted for v1.2.
- **Reference observability subscriber.** A separate Worker (or Node service — implementation choice) that joins each conversation it observes via magic-link + bearer credential, declares `capabilities.ams.convention.v1.role = "observability_sink"` per the principle, applies own-stream filtering and payload-boundary redaction, computes TTFF and (when anchored) TTFT, derives token-count estimates with `cl100k_base`, and writes `stream_token_summary` and `stream_first_token` aggregate rows to the same AE dataset.
- **Dashboard SQL recipes.** The `docs/observability-dashboard.md` recipes are the canonical query set, updated to reflect the activity-stream-derived state-totals approach. The dashboard application (Grafana, Metabase, or custom UI) is operator choice; v1.2 does not bundle one. The recipes are the contract.
- **Convention vocabulary additions.** The `model_invoked` anchor convention in `ams://canon/principles/wire-layer-latency-vocabulary` §"`model_invoked` — convention anchor for agent-side latency" is added to the v1 capabilities convention's recognized metadata keys. No wire frame type is added.
- **README + AGENTS.md updates.** Brief operator-facing additions pointing at the new canon URIs (D0014 + the principles) and the dashboard doc. No content rewrite.

## 5. Scope — OUT (Deferred, Named)

v1.2 explicitly **does not** ship:

| Item | Re-entry signal |
|------|-----------------|
| **Any scheduled job** (Cron Trigger, DO alarm) | Per `ams://canon/decisions/D0014-tail-worker-and-activity-stream-derived-totals`, v1.2 commits to natural-flow only. The fidelity gap on `do_evicted` is named there; re-entry options (hourly DO-health probe, DO-alarm heartbeats, orphan-correction worker) are explicitly v1.next, not v1.2 |
| **Sub-second `streams_live` accuracy** | First operational decision that genuinely requires it; the activity-stream-derived count is bounded by event-stream completeness, which suffices at PoC scale |
| **`dos_active` metric** | Removed from v1.2 scope entirely — not derivable from the activity stream without a probe; re-entry signal is the same as scheduled-jobs above |
| A bundled dashboard UI | First operator who would rather use the AMS-shipped UI than wire up Grafana / Metabase / custom |
| Right-to-be-forgotten purge automation | First account-deletion event in production after `accounts_total` deletion lands as a v1.next capability |
| Per-account observability scoping (subscriber sees only one account's conversations) | First multi-tenant deployment that needs per-tenant observability isolation |
| External tracing (OpenTelemetry / Honeycomb / Tempo) | Phase 4 of the original plan, deferred per planning gate; re-entry signal is "I/O-bounded spans in `debug.trace` prove insufficient for diagnosing a real production issue" |
| Provider-`usage` reconciliation | Cannot ship at the broker layer per `ams://canon/principles/token-count-derivation-on-subscribers` §"What the Subscriber Cannot Compute" — re-entry is "agent-layer instrumentation surfaces it through a separate channel that needs joining against AE data" |
| Alerting on derived metrics (error spike, p99 regression, cost-per-account threshold) | After 30 days of v1.2 data establish baselines worth alerting on |
| Right-to-replay (observability subscriber recovers missed tokens during disconnect) | First operational need; out of scope per D0010's "What Forecloses" item 3 — replay is a SPEC §5 deferred item not reopened by v1.2 |
| Sink alternative beyond AE (e.g., Cloudflare Pipelines + R2 Iceberg, customer-controlled webhook) | First deployment that needs it; v1.2 commits to AE for the reference deployment per D0014 |

## 6. Architecture — One Page

```
                          ┌──────────────────────┐
Agent (Claude Code, etc.)─┤      AMS Worker      │
   │ MCP / WebSocket      │  (control plane +     │
   ▼                      │   SessionDO/          │
   ConversationDO         │   ConversationDO)     │
   (push-native wire)     │   ZERO TELEMETRY CODE │
        ▲                 └──────────┬────────────┘
        │ WebSocket                  │  every invocation observed by ↓
        │                            │
        │              ┌─────────────▼───────────────┐
        │              │     Tail Worker (hook)      │
        │              │  • bound via tail_consumers  │
        │              │  • translates TailEvent →    │
        │              │    hook-layer schema         │
        │              │  • HMAC-hashes identifiers   │
        │              └──────────────┬───────────────┘
        │                             │ writes hook rows
        │                             ▼
        │                   Cloudflare Analytics Engine  ◄─── Dashboard
        │                       (ams_telemetry)              (Grafana / Metabase /
        │                             ▲                       custom UI; reads SQL,
        │ WebSocket                   │ writes activity rows  derives state totals
        │                             │                       from event sums per
        │              ┌──────────────┴───────────────┐       D0014)
        │              │ Observability Subscriber     │
        │              │ (separate Worker / service)  │
        │              │  • joins via magic link      │
        │              │  • declares role=...sink     │
        │              │  • computes TTFF / TTFT      │
        │              │  • cl100k token estimate     │
        │              │  • redacts per boundary      │
        └──────────────┤                              │
                       └──────────────────────────────┘

                       NO Cron Trigger. NO snapshot worker. NO inline writeDataPoint() in AMS Worker.
                       State totals derived at query time per docs/observability-dashboard.md.
```

**Three components, one dataset, zero scheduled jobs.** The Tail Worker is in-Cloudflare-platform but separate from the AMS Worker — bound via `tail_consumers` in the AMS Worker's `wrangler.toml`, removable by removing that one line. The observability subscriber is a separate runtime, joins like any peer, removable without changing anything. All three layers (broker, hook, subscriber) cooperate without overlap; all three write — when they write — to the single `ams_telemetry` Analytics Engine dataset; SQL discriminates by `event_type`. Per D0014 the hook layer (Tail Worker) writes only on events the producer Worker actually handles, and the dashboard derives state cardinalities from event sums via `uniqExact()` and similar — no separate state-totals path to maintain.

## 7. Alternatives Considered (and Why Not)

| Alternative | Why we rejected it (for v1.2) |
|-------------|------------------------------|
| Telemetry as middleware on the hot path | Rejected by D0010 (irreversible). Subscriber pattern keeps the broker dumb. |
| **Inline `writeDataPoint()` calls in the AMS Worker (D0015's original hook approach)** | **Superseded by D0014.** Brittle in two ways: every new handler must remember the call (forgotten = silent invisibility), and the hot path carries telemetry concerns it doesn't need. Tail Worker pattern eliminates both. |
| **Per-minute Cron snapshot worker (D0015's original state-totals approach)** | **Superseded by D0014.** Cloudflare Cron Triggers are best-effort, not SLA'd; missed runs produce silent gaps in headline numbers. Activity-stream-derived totals via `uniqExact()` over event sums eliminate the polling and the gap class entirely. |
| Per-request counter writes for state totals | Drifts upward over time (decrement paths unobservable); conflates lifetime with current; tightens coupling. D0014 §"State Totals Derived From Activity Sums" handles cardinality cleanly via AE's aggregation functions instead. |
| Separate observability data store (D1 table, KV counter) | Breaks the "one dataset, same SQL" property. AE alone holds activity rows; state totals are derived queries against the same dataset. |
| Bundle a UI dashboard with the broker | Rejected by D0010 §"What Forecloses" item 4 — dashboards run as separate services. Operator-choice UI; SQL recipes are the contract. |
| OpenTelemetry from day one | Adds infrastructure surface (collector, ingest, retention) for a question the simpler stack already answers. Deferred to Phase 4 per planning. |
| Cloudflare Pipelines + R2 Iceberg as the v1.2 sink | Pipelines is open beta and shines at high-throughput data-lake patterns (sinks to R2 as Iceberg/Parquet). For AMS PoC volume the AE pattern is simpler — one dataset, one SQL surface, no second backend. Pipelines becomes the right answer when AMS scales past where AE sampling distorts numbers usefully, or when long-term R2 archival becomes a requirement. v1.next consideration. |
| Durable Object alarms for state snapshots | More reliable than Cron Triggers, sub-minute capable. But still a "poll state" pattern; D0014's activity-derived approach removes the poll entirely. |
| Provider-usage block as billing-canonical token source | Not accessible at the AMS layer — agents call providers off-wire. The principle (`token-count-derivation-on-subscribers`) records the correction. v1.2 commits to cl100k_base estimates labeled honestly. |
| Unkeyed SHA-256 as default | Permitted as downgrade per the boundary amendment, but a sink-reader with a candidate `account_id` can confirm matches against a plain SHA. HMAC closes the leak. |
| Aggregating subscriber records on the subscriber and writing per-stream summaries vs writing per-frame | Per-frame writes would explode AE write volume (every token = 1 row). Per-stream summary at stream close (or N-minute window for long-running streams) keeps writes proportional to streams, not tokens. |

## 8. Risks (and Mitigations)

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Tail Worker sampling under high load distorts hook-layer counts** | Low-medium | Tail Workers can sample under load per Cloudflare; verify in production after first month. Mitigation if it bites: reduce Tail Worker work per invocation (write fewer fields), or add a second consumer for redundancy |
| **Activity-stream-derived `streams_live` overcounts when DOs are silently evicted** | Medium (named explicitly in D0014) | Documented as the v1.2 fidelity gap; re-entry signals + remediation options enumerated in D0014 §"The Honest Fidelity Gap (DO Eviction)". The dashboard footer discloses this so operators don't misread |
| Observability subscriber lags during high-fan-out conversations | Medium | Subscriber processes its own runtime; if it falls behind, AMS keeps streaming to other subscribers; lag is a subscriber-side concern. Mitigation: deploy multiple instances behind a fan-out, each watching a partition of conversations |
| AE sampling distorts state-totals derivations under load | Low (open question, named in D0014) | `SUM(_sample_interval)` corrects sums; `uniqExact()` is heavy but exact when low-cardinality; `uniq()` (HyperLogLog) is the fallback at scale. Verify impact with actual production data |
| HMAC secret rotation breaks aggregations | Known-by-design | Documented in the amended boundary doc; rotation is also one mechanism for right-to-be-forgotten; operators rotate intentionally |
| Token-count drift misread as billing-accurate | Medium | Honesty footers in the dashboard doc are explicit; the principle forbids silent labeling; reviewers reject any panel that omits the disclosure |
| Observability subscriber acts as a self-hosted PII leak | High if violated, Low if upheld | Capture allowlist/blocklist in the boundary doc is the safety contract; the subscriber's `redaction: payload-and-metadata-values` declaration is auditable; sink-side schema validator rejects records with blocklist keys |
| **Tail Worker can't observe events outside Worker invocations (DO lifecycle between requests)** | Low for v1.2 | Named in D0014 fidelity gap; v1.2 ships without `do_evicted`/`do_started` event classes. v1.next can add a DO-internal heartbeat pattern if needed |
| Subscriber's cl100k tokenization adds runtime latency on its own runtime | Low | Off the broker hot path by design; subscriber bench (per upstream `klappy://canon/constraints/measure-before-you-object`) shows ~1.3 ms / 50 KB on Workers V8 |

## 9. Reversibility — One-Way vs Two-Way Doors

| Decision | Door type | If we want to reverse |
|----------|-----------|------------------------|
| **Tail Worker as the hook layer (D0014)** | **Two-way** | Remove `tail_consumers` from AMS Worker `wrangler.toml` and unbind. Wire stays conformant. Hook-layer rows stop landing. The structural removability proof. |
| **Activity-stream-derived state totals (D0014)** | **Two-way at the dashboard layer** | Replace dashboard SQL with reads from a re-introduced snapshot dataset. Adds infrastructure that v1.2 explicitly avoided; reverses the D0015→D0014 supersession. The fidelity gap remediation options in D0014 §"The Honest Fidelity Gap" are the preferred path before reverting wholesale. |
| HMAC default for identifier hashing | **Two-way** | Drop the secret; falls back to unkeyed SHA-256 per the documented downgrade. Cross-rotation joins are not supported either way. |
| `cl100k_base` as the reference tokenizer | **Two-way** | Subscriber substitutes another tokenizer; declares the substitution in service docs; honesty footer changes. |
| `model_invoked` anchor convention | **Two-way** | Convention is opt-in; nothing breaks if no agent emits the anchor. TTFT (anchored) panels go empty; TTFF still works. |
| Observability subscriber as the reference deployment | **Two-way** | Stop running the subscriber. Activity-stream rows stop landing for subscriber-class events; hook-layer rows continue. State totals derived from `connect_succeeded` continue; cross-layer `streams_live` derivation breaks (no `stream_left` source). |
| AE as the sink for the reference deployment | **One-way for v1.2**, two-way at v1.3 | Switching sinks (e.g., to Cloudflare Pipelines + R2 Iceberg) requires re-pointing Tail Worker + subscriber + dashboard recipes. Not breaking, but coordinated. |
| Slot reuse for metric values inherited from D0015 | **Two-way until external dashboards bind to it** | Migration cost grows with the number of operator-built dashboards. Add a 7th double in v1.3 if a sixth metric class needs a clean slot. |
| Activity-vs-state SQL split via `event_type` | **One-way** within v1.2 | Dashboards rely on it; collapsing the two would mean re-keying every recipe. The split is the contract. |

## 10. Disconfirmers — What Would Invalidate the Plan

If any of these is observed, v1.2 needs re-thinking, not just re-trying:

- **The Tail Worker's `TailEvent` shape proves insufficient to extract the hook-layer schema fields.** Means an event class the design relies on is not observable from outside the producer Worker; either the AMS Worker must emit a synthetic invocation for it (compromising the zero-telemetry-code goal) or the event class must move to the subscriber layer.
- **Tail Worker reliability is materially worse than producer-Worker invocation reliability under load.** Means the Tail consumer model can't keep up at AMS scale; deferred remediation involves multiple Tail Worker consumers or moving to a different observability path.
- **AE's `uniqExact()` over the activity stream becomes unusably slow at AMS scale.** Means cardinality state-totals must be pre-aggregated; the natural fix is HyperLogLog (`uniq()`) for leaderboards plus periodic snapshots for headline numbers — a partial revert toward D0015's pattern, scoped to specific queries.
- **Observability subscriber cannot keep up with a single conversation's token rate at production fan-out.** Means the subscriber needs partitioning earlier than v1.3, and v1.2 must ship with multi-instance-from-day-one.
- **AE writes from Tail Worker + subscriber exceed the free tier inside the first month at PoC volume.** Means the cost calculus was wrong for AMS specifically and the schema or aggregation cadence needs revisiting.
- **An auditable category of events lands in both the hook layer and the subscriber layer.** Means the non-overlap discipline in `ams://canon/principles/observability-as-subscriber` §"Why the Two Halves Do Not Overlap" was violated and one layer must be cut for that event class.
- **The structural removability proof (§3.3 grep + Tail Worker unbind) cannot be made to pass.** Means the AMS Worker accumulated telemetry code that the design forbids; refactor before merge.

## 11. Open Decisions Still Inside v1.2 Scope

These are decisions inside v1.2 that haven't been forced yet. Each will be made when the implementation forces it, not before:

1. **Tail Worker runtime: standalone Worker vs Worker-in-same-account-different-bundle.** Default: standalone Worker named `ams-tail` deployed as a separate `wrangler.toml`. Alternative: single `wrangler.toml` with multiple entry points if Cloudflare's tooling supports it cleanly.
2. **Observability subscriber runtime: Cloudflare Worker vs separate Node service.** Default: Worker, for operational consistency. Alternative: Node service, if Worker WebSocket-client behavior proves limiting.
3. **Subscriber summary cadence: per-stream-close vs N-minute window.** Default: per-stream-close, simplest. Alternative: 5-minute windows for long-running streams that may not close for hours; switch when the first such stream lands.
4. **`uniqExact` vs `uniq` (HyperLogLog) for state-totals queries.** Default: `uniqExact` for `accounts_total` and `conversations_total` (low cardinality; exact answer matters for headline numbers); `uniq` for high-cardinality leaderboard cardinality counts. Switch at the query level when scale forces it.
5. **AE namespace.** Default: `ams_telemetry`. The dataset name is a deployment convention, not protocol; chosen at first deploy.
6. **Whether to bundle a reference dashboard application.** v1.2 ships SQL recipes. v1.3 may bundle a thin Worker-served HTML dashboard if the operator decides shipping recipes is friction.

## 12. Out-of-Scope, On Horizon

The post-v1.2 roadmap, in rough order:

1. **DO-eviction fidelity remediation** — choose among the three options named in `ams://canon/decisions/D0014-tail-worker-and-activity-stream-derived-totals` §"The Honest Fidelity Gap (DO Eviction)" if the gap proves operationally meaningful: hourly DO-health probe, DO-alarm heartbeats, or orphan-correction worker.
2. **Subscriber partitioning** — multiple observability-subscriber instances each watching a slice of conversations, for fan-out beyond what one runtime handles.
3. **External tracing** — OpenTelemetry to Honeycomb/Tempo/Axiom, when in-Worker `debug.trace` proves insufficient for a real production diagnostic.
4. **Alerting** — anomaly detection on the AE dataset (error spikes, p99 regressions, cost-per-account thresholds), once 30 days of data establish baselines.
5. **Right-to-be-forgotten automation** — when the first account-deletion event ships at the operational layer, automate the boundary doc's purge-by-rehash path.
6. **Bundled dashboard UI** — if shipping SQL recipes proves to be operator friction, ship a thin server-side HTML dashboard reading the same recipes.
7. **Cloudflare Pipelines + R2 Iceberg sink** — when AMS scale grows past where AE sampling distorts numbers usefully, or when long-term R2 archival becomes a requirement. Per D0014 §"What This Is Not" item 6, this is the natural next sink, not a return to Cron snapshots.
8. **Per-account observability scoping** — multi-tenant deployments where each tenant sees only their own observability slice.
9. **Provider-usage agent-layer integration** — when an agent surfaces its provider-usage data through a side channel that can be joined against AE data for billing reconciliation.
10. **Right-to-replay for observability subscribers** — currently blocked by SPEC §5 deferred replay; reopens when replay reopens.

## 13. References

- `SPEC.md` — the v1 lock; v1.2 is additive over v1.1.1.
- `ams://canon/decisions/D0010-observability-via-subscriber-not-wire` — the architectural commit.
- `ams://canon/decisions/D0015-state-totals-via-snapshot-worker` (superseded 2026-05-03) — the prior approach; documents the rejected per-request-hook alternative.
- `ams://canon/decisions/D0014-tail-worker-and-activity-stream-derived-totals` — the canonical replacement; the spec is built against this.
- `ams://canon/constraints/observability-payload-boundary` (amended 2026-05-03) — the safety contract + HMAC default.
- `ams://canon/principles/observability-as-subscriber` — the operating pattern.
- `ams://canon/principles/wire-layer-latency-vocabulary` — TTFF/TTFT discipline.
- `ams://canon/principles/token-count-derivation-on-subscribers` — token-count approximation discipline.
- `docs/observability-dashboard.md` — canonical SQL recipes (updated for activity-derived state totals).
- `klappy://canon/constraints/telemetry-governance` — upstream doctrine.
- `klappy://docs/appendices/epoch-8` — the upstream observability epoch this spec mirrors.
- `klappy://canon/constraints/measure-before-you-object` — bench-first methodology behind the tokenizer choice.
- `HORIZON.md` §4 — the governance-and-oversight catalog v1.2 is the first shipping instance of.
- Cloudflare docs: Tail Workers (`workers/observability/logs/tail-workers/`); Workers Analytics Engine (`analytics/analytics-engine/`).

## 14. Revision Discipline / Diff Against v1.1.1

This draft proposes the following changes to SPEC.md when accepted:

- **Title:** `# AMS Spec / PRD — v1.2`
- **Version line:** `**Version:** 1.2.0 (observability stack — Tail Worker hook layer + activity-stream-derived totals + observability subscriber per D0010 + D0014).`
- **§4 Scope IN:** add the seven IN items from this draft's §4 (Tail Worker, HMAC, activity-derived totals, subscriber, dashboard recipes, capabilities convention, README/AGENTS updates).
- **§5 Scope OUT:** remove the row "DOLCHE journal observability subscriber | After the PoC ships and we want production telemetry" — its re-entry signal has fired; observability is in scope. Add the new OUT items from this draft's §5 (especially the explicit "any scheduled job" deferral).
- **§6 Architecture:** add the v1.2 architecture diagram from this draft's §6 (Tail Worker + activity-derived flow).
- **§7 Alternatives:** add the rows from this draft's §7, including explicit "rejected D0015's inline hooks" and "rejected D0015's per-minute Cron snapshots" as superseded approaches.
- **§8 Risks:** add the rows from this draft's §8.
- **§9 Reversibility:** add the rows from this draft's §9.
- **§10 Disconfirmers:** add the bullets from this draft's §10.
- **§11 Open Decisions:** add the six v1.2 open decisions from this draft's §11.
- **§12 Horizon:** remove "Observability subscriber" (line 216, currently item 9) — it ships in v1.2; replace with the v1.3+ items from this draft's §12 (especially DO-eviction remediation and Pipelines+Iceberg as future sink).
- **§13 References:** add the new canon URIs (D0010, D0015-superseded, D0014, principles, dashboard doc, upstream).
- **§14 Revisions table:** add a row.

Proposed revisions table row:

| Version | Date | Change | Driver |
|---------|------|--------|--------|
| v1.2.0 | (TBD on accept) | Production observability stack: Tail Worker hook layer + activity-stream-derived state totals per `ams://canon/decisions/D0014-tail-worker-and-activity-stream-derived-totals` (which supersedes `ams://canon/decisions/D0015-state-totals-via-snapshot-worker`); reference observability subscriber per `ams://canon/principles/observability-as-subscriber`; HMAC promoted to default per `ams://canon/constraints/observability-payload-boundary` 2026-05-03 amendment; TTFF/TTFT vocabulary per `ams://canon/principles/wire-layer-latency-vocabulary`; token-count derivation discipline per `ams://canon/principles/token-count-derivation-on-subscribers`; dashboard SQL recipes at `docs/observability-dashboard.md`. Zero scheduled jobs; AMS Worker contains zero telemetry code. SPEC §5 row "DOLCHE journal observability subscriber" removed (re-entry signal fired); §12 horizon item 9 removed (ships in v1.2). | Operator request after Day 3: token volume, x-ray timings, account/conversation/stream/subscriber/token totals must be observable. Initial design (Cron snapshots + inline hooks per D0015) flagged by operator during pre-execution review as brittle in two distinct ways. Revised design uses Tail Workers (CF-recommended pattern for aggregated analytics) and activity-stream-derived state totals (no polling, single SQL surface). All four observability gaps canonized 2026-05-03; v1.2 is the implementation contract built against the natural-flow approach. |

**Forward-compat check (per SPEC §14):** Evaluated against `HORIZON.md`. v1.2 observability is the first shipping instance of `HORIZON.md` §4 (Governance and Oversight) — it enables fact-checker subscribers (§4.1), cost monitor subscribers (§4.3), audit logger subscribers (§4.5) by establishing the polymorphic-subscriber observability pattern in production. The Tail Worker pattern leaves the door open for any future hook-class observability without modifying the AMS Worker. Forecloses no catalog entry. Pass.

---

**Pre-build checklist (drives execution after accept):**

- [ ] Provision `AMS_TELEMETRY_HASH_KEY` Cloudflare Workers secret in **both** the AMS Worker and the Tail Worker deployments (both `ams.klappy.dev` and `ams.truthkit.ai`).
- [ ] Create the Tail Worker (separate `wrangler.toml`, e.g. `worker-tail/`); bind the `AMS_TELEMETRY` Analytics Engine dataset.
- [ ] Add `tail_consumers = [{ service = "ams-tail" }]` to the AMS Worker `wrangler.toml`. Verify deploy ordering (Tail Worker must exist before AMS Worker references it).
- [ ] Implement the Tail Worker `tail()` handler: parse `TailEvent` for each AMS Worker invocation, classify by URL/method/status, write hook-layer rows to AE per `observability-payload-boundary`.
- [ ] **Confirm zero `writeDataPoint` references in the AMS Worker source** — `grep -r writeDataPoint worker/src/` must return empty.
- [ ] Implement reference observability subscriber as a separate Worker (default per §11.2).
- [ ] Add `model_invoked` anchor to the v1 capabilities convention in `canon/constraints/two-agent-conversation-conventions.md` (one-line addition under "The Role Vocabulary" or its sibling section).
- [ ] Run smoke test §3.1 (all 7 items); capture evidence per Definition of Done §3.3 (especially the grep proof and the Tail Worker unbind+wire-conformance check).
- [ ] Long-form spec docs (ARCHITECTURE.md §8, POC-INFRA.md, GLOSSARY) updated to reference v1.2 canon URIs in the same PR per `klappy://canon/constraints/release-validation-gate`.
