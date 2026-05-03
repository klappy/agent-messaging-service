---
uri: ams://canon/principles/poc-build-repeatability-pattern
title: "PoC Build Repeatability — The Three-Day Pattern AMS Used"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "principle", "process", "poc", "repeatability", "next-vertical"]
epoch: E0008.5
date: 2026-05-03
derives_from: "POC-PLAN.md §2 (the day-by-day plan that worked), SPEC.md §3 (the contract surface that locked the work), the AMS Day 1 / Day 2 / Day 3 build journals, ams://canon/decisions/D0007-spec-as-locking-surface, ams://canon/principles/vodka-architecture-applied"
complements: "klappy://canon/bootstrap/model-operating-contract (the upstream operating contract this pattern composes with)"
governs: "How the next AMS-style vertical (ClearWriter, the help-desk-PR pipeline, anything else where the goal is 'a foundation primitive shipped end-to-end in days, not weeks') should structure its first three sessions."
status: active
---

# PoC Build Repeatability — The Three-Day Pattern AMS Used

> AMS shipped a working two-agent token-stream broker — control plane, WebSocket stream plane, structural self-exclusion, MCP-tool surface, two-host CNAME deployment — in three numbered build days plus three closeout sessions. The pattern that produced that velocity is repeatable. This article captures it for the next vertical so day 1 starts from a known shape rather than another scramble.

## Description

The goal is a foundation primitive — small surface, large blast radius — shipped end-to-end fast enough that the next vertical can layer on top of it inside the same week. The AMS PoC hit that bar in three build days. The pattern was not improvised mid-week; it was implicit in `POC-PLAN.md` §2 and explicit in the `journal/2026-05-02-day*-validation-closeout.tsv` handoffs. This article makes the pattern explicit so the next operator can run it directly.

## Outline

- The Three-Day Shape
- The Closeout Discipline Between Days
- What the Pattern Requires Up Front
- What the Pattern Refuses
- When to Re-run This Pattern Versus When Not To

---

## The Three-Day Shape

| Day | Output | Definition of Done |
|-----|--------|--------------------|
| **Day 1 — Control plane** | The HTTPS surface that mints durable identifiers (accounts, conversations, magic links). No real-time wire yet. | `curl POST /accounts` and `curl POST /{ns}/conversations` round-trip a credential and a magic link against the deployed Worker. |
| **Day 2 — Wire plane** | The WebSocket / push transport. Two `wscat` clients on the same magic link exchange tokens; D0009 self-exclusion holds. | Two clients see each other's frames; neither sees its own. Live on the deployed Worker, both hosts. |
| **Day 3 — Surface plane** | Lifecycle frames, close codes, the runnable two-agent example, the MCP tool surface in stdio form, README + governance + tag. | The smoke test items 4 + 5 (or their per-vertical equivalent) pass against the deployed Worker; the example clones-and-runs from a fresh checkout. |

The split is not random. Each day is the smallest meaningful slice that produces something deployable on its own. Day 1's output is useful (identifiers + magic links) even before Day 2 exists. Day 2's output is useful (real-time exchange) even before Day 3 exists. Day 3's output is the demo gate.

A vertical that conflates these into one day produces a half-built monolith with no checkpoint. A vertical that spreads them across two weeks loses the throughput that justified the foundation play.

## The Closeout Discipline Between Days

Each day ends with a **build journal** (`journal/YYYY-MM-DD-day{N}-{topic}.tsv`) containing DOLCHEO+ artifacts: what was decided, what was observed, what was learned, what was constrained, what was handed off. Each day-N+1 starts with a **fresh-session validator** that reads the day-N build journal and runs the day-N acceptance criteria against the deployed Worker independently. The validator produces its own `journal/YYYY-MM-DD-day{N}-validation-closeout.tsv` with disposition (ACCEPT / ITERATE / PIVOT).

This is `klappy://canon/principles/verification-requires-fresh-context` applied to a fast build cadence. The build session and the validation session share a Worker URL, a SPEC file, and a journal directory — they share nothing else. The validator's lenses are independent of the builder's lenses; bugs that the builder is blind to (because they were the bugs' author) get caught.

The pattern only works because the loop is short:

1. Build session writes code, runs local tests, pushes to deploy branch.
2. Build session encodes the day's DOLCHEO+ to a build journal and ends with an explicit handoff (`H` artifact) naming the next-session scope.
3. Fresh validator session opens cold, reads the journal, runs the acceptance, encodes a closeout journal with disposition.
4. Next build session opens cold, reads both the prior build journal and the validation closeout, starts the next day.

If validation surfaces a regression, the loop returns to the builder with a single-issue patch PR — not a vague "redo Day N." The validator's `O` (Observation) entries are the spec of what to fix.

## What the Pattern Requires Up Front

Before Day 1 starts, the following must already exist:

- A locked **`SPEC.md`** with §3 acceptance criteria (smoke test + demo gate). The day-by-day plan slices the spec; if the spec is moving, the slices are unstable. Per `ams://canon/decisions/D0007-spec-as-locking-surface`, the spec is the lock.
- A **deploy mechanism that is one push** — for AMS, the operator's git-hook branch deploy. The pattern collapses if "ship code" requires a human step beyond `git push`.
- A **canon overlay** with at minimum the load-bearing decisions (D0007, D0008, plus any vertical-specific irreversibles like D0009 / D0011 / D0012 for AMS). Subsequent decisions surface in the build journals; foundational ones must precede Day 1.
- A **two-host or two-environment target from the start.** AMS chose dual-CNAME (`ams.klappy.dev` + `ams.truthkit.ai`) to force host-portability into Day 1. Any vertical that ships single-host PoCs and tries to add the second host later pays for that shortcut twice.

## What the Pattern Refuses

The non-work list (`POC-PLAN.md` §3 in AMS) is half the discipline. AMS refused, on purpose, to ship in v1: magic-link expiry, per-stream read scopes, end-to-end encryption, federation, replay, billing, a web UI, identity beyond bearer-as-account, JCS-SHA conversation IDs, multi-stream-per-account-per-conversation, and any client SDK beyond the example scripts.

The next vertical's non-work list will look different. What matters is that it exists, that each item names the "re-entry signal" that would re-introduce it, and that the operator and the agent both refuse to slip into any of them mid-week. Every week is one week. Adding a second axis of work doubles the scope and halves the velocity.

## When to Re-run This Pattern Versus When Not To

Run this pattern when:

- The artifact is a **foundation primitive** other things will build on top of (a wire protocol, a storage primitive, a coordination layer). The cost of doing it badly compounds.
- The acceptance criteria are **observable end-to-end** in days, not weeks. If the demo gate requires a human evaluator over a week of usage, this pattern is too short.
- The team is **one operator and one agent.** The pattern depends on the operator-as-bottleneck (`klappy://canon/constraints/mode-discipline-and-bottleneck-respect`) being respected. With more humans, more coordination overhead, the pattern's throughput advantage diminishes.

Do not run this pattern when:

- The artifact's acceptance criteria are not yet falsifiable. Spend the time on the spec first; the lock has to exist before the slice does.
- The deploy mechanism is more than one push. Fix the deploy mechanism first.
- The vertical is a product feature inside an existing system, not a foundation primitive. The day-by-day shape over-indexes on shipping deployable atoms; product features ship inside CI and feature flags, on a different cadence.

## See Also

- `ams://canon/decisions/D0007-spec-as-locking-surface` — the spec lock the day plan depends on.
- `ams://canon/principles/vodka-architecture-applied` — the four review questions every proposed change runs through.
- `klappy://canon/principles/verification-requires-fresh-context` — the upstream principle the closeout discipline applies.
- `klappy://canon/constraints/mode-discipline-and-bottleneck-respect` — the bottleneck-respect rule that makes one-operator-one-agent sustainable.
- `POC-PLAN.md` §2 — the AMS day-by-day plan this article extracts the pattern from.
- `journal/2026-05-02-day1-validation-closeout.tsv`, `journal/2026-05-02-day2-validation-closeout.tsv`, the Day 3 build + closeout journals — the evidence that the pattern produced what it claimed.
