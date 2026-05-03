---
uri: ams://canon/decisions/D0013-homepage-as-poc-surface
title: "D0013 — Homepage as PoC Surface: Architectural Cardinality Claims Are N-Peer; Demo Cardinality Stays Demo-Scoped"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "decision", "homepage", "marketing-surface", "demo-surface", "cardinality", "vodka-architecture", "drift-detection"]
epoch: E0008.4
date: 2026-05-03
derives_from: "ams://canon/decisions/D0001-tokens-not-messages (one emission, N subscribers); ams://canon/decisions/D0007-spec-as-locking-surface (the contract is SPEC; this decision binds the homepage to canon without expanding SPEC); ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription (multi-party group); ams://canon/principles/operator-as-subscriber (any kind of entity); ams://canon/principles/observability-as-subscriber (observers attach exactly like an agent peer); ams://canon/constraints/two-agent-conversation-conventions (two-agent is a recommended convention for the demo gate, not the wire shape); journal/2026-05-03-ams-homepage-n-cardinality-and-dumb-pipe.tsv (the drift this decision prevents from recurring)"
complements: "ams://canon/decisions/D0012-browser-is-an-mcp-runtime, ams://canon/principles/vodka-architecture-applied, ams://docs/homepage-governance"
governs: "The content surfaces of worker/src/homepage.ts that make architectural claims about AMS — page title, meta description, og title, og description, structured data, hero subhead, and any future architectural-claim surface added to the page. Does not govern in-page demo body copy, terminal instructions, the authorization-model 'two doors' framing, or any literal demo step that happens to involve two agents."
status: active
---

# D0013 — Homepage as PoC Surface: Architectural Cardinality Claims Are N-Peer; Demo Cardinality Stays Demo-Scoped

> The homepage is not marketing copy attached to the protocol. It is a load-bearing PoC surface — the first contact point for every consumer, agent or human, deciding whether AMS solves their problem. When the homepage describes AMS architecturally, those words are commitments. When the homepage describes the in-page demo, those words are descriptions of an artifact. The two have different rules. This decision separates them, names the canonical positioning beats, and makes the boundary mechanically checkable so the day-2-to-day-3 drift never repeats silently.

## The Decision

The homepage is governed under two distinct rule sets, and every line of `worker/src/homepage.ts` belongs to exactly one of them:

1. **Architectural surfaces** — page title, `<meta name="description">`, `<meta property="og:title">`, `<meta property="og:description">`, hero subhead, any structured data, and any future field whose role is to state what AMS *is*. These surfaces MUST reflect AMS's actual wire shape: **N peers, N polymorphic subscribers, all equal at the wire**. They MUST NOT use cardinality framings ("two agents", "pair of agents") as architectural claims. The TCP/IP positioning beat MAY appear; when it does, it SHOULD be paired with the SMS / dumb-pipe beat from `ESSAY.md` and `AMS.md` so the semantic baggage TCP imports (ordering, retransmission, delivery semantics) is offset by the SMS framing AMS actually does (move tokens; don't read them).

2. **Demo surfaces** — the in-page theatre, terminal instructions, the §02 demo title, the "two doors" mint/join authorization framing, and any other section whose role is to walk the visitor through a literal demonstration. These surfaces MAY use cardinality framings where the cardinality is structurally accurate to the demonstration ("Two agents. Two streams. One wire." for a two-agent demo; "two terminals + wscat" for the literal command sequence; "two doors" for mint vs join authorization). These surfaces are NOT architectural claims even when they read like them.

The boundary between the two is enforced by `docs/homepage-governance.md` (operational policy: in-scope claims, out-of-scope claims, change procedure, the audience map) and a CI script (`scripts/check-homepage-architectural-claims.mjs`) that fails any PR introducing forbidden patterns into the architectural surfaces.

This decision does not modify SPEC.md. The homepage is not part of the wire contract; D0007 keeps SPEC the locking surface for protocol-level commitments. This decision binds the homepage to canon at a layer below SPEC, where positioning and surface presentation live.

## What This Means in Practice

- **Every homepage edit is governed by `docs/homepage-governance.md`.** That doc names the architectural surfaces explicitly, lists the forbidden patterns, names the canonical positioning beats, and describes the change procedure (PR + visual evidence per definition of done + session-end encode + CI pass). Sessions opening `worker/src/homepage.ts` read it first.
- **CI fails the PR if architectural surfaces use forbidden cardinality patterns.** The script lives at `scripts/check-homepage-architectural-claims.mjs`, runs on any PR touching `worker/src/homepage.ts`, and fails on `\btwo agents?\b`, `\b2 agents?\b`, `\bpair of agents\b`, or `\btwo-agent\b` appearing in `<title>`, `<meta name="description">`, `<meta property="og:title">`, `<meta property="og:description">`, or the hero subhead. Demo body copy is not scanned.
- **`oddkit_validate` at deploy time confirms the homepage's stated claims match the architectural rule.** The validation gate (Layer 2 of the drift-detection stack) runs after CI and before promotion, providing the semantic backstop CI cannot give.
- **Session-end encodes update `docs/homepage-governance.md` in place** when a positioning beat or rule changes. The TSV in `journal/` remains the audit trail of *why*; the governance doc is the canonical statement of *what is currently true*. Encodes without a corresponding doc edit are incomplete.
- **The TCP/IP + SMS positioning pair is canon now, not preference.** Using TCP/IP alone in architectural surfaces is permitted but discouraged because TCP imports semantics AMS disowns; pairing it with the SMS / dumb-pipe beat is the canonical move. Removing the SMS beat in a future edit requires a decision-log entry in the governance doc explaining why.
- **Polymorphic subscribers is a first-class homepage concept.** `D0001` (one emission, N subscribers), `operator-as-subscriber`, and `observability-as-subscriber` together establish that AMS does not distinguish between agent peers, human observers, and service subscribers at the wire. The homepage's `#subscribers` section (added in PR #19) is the canonical visualization of this; future edits MUST preserve a polymorphic-subscribers surface, even if its placement or wording changes.

## Why a Canon Decision and a Governance Doc, Not Just One

The decision and the doc do different jobs:

- **The decision is the load-bearing rule.** It is searchable via `oddkit_search`, citable from other canon (e.g., a future homepage redesign decision derives from this one), and lives in the `ams://` overlay where canon-shaped governance belongs. It is short and rarely changes.
- **The governance doc is the operational surface.** It enumerates the specific forbidden patterns, the audience map, the in-scope and out-of-scope claim list, the change procedure, and the link policy. It is referenced by the CI script. It evolves more often than the decision because it is where session-end encodes land.

Putting both in canon would conflate "the rule" with "the operational details that implement the rule," and operational details would bloat canon. Putting both in `docs/` would put a load-bearing rule outside the searchable canon overlay, where future Claude sessions could miss it. The split mirrors the existing pattern: SPEC.md (locking surface, rarely changes) and the long-form reference docs (operational, evolve under SPEC); D0013 (locking decision) and `docs/homepage-governance.md` (operational, evolves under D0013).

## Why Not Put This Rule in SPEC.md

SPEC's revision discipline (§14) says the spec is updated first when load-bearing decisions change. D0013 is a load-bearing decision *about the homepage*, not about the wire. SPEC.md is the wire contract per D0007 — it describes scope, acceptance criteria, alternatives, risks, reversibility, and disconfirmers for the protocol implementation. The homepage is not on the wire; protocol-conformant implementations of AMS would not be required to ship a homepage at all, much less the same homepage AMS's reference deployment ships. Adding homepage rules to SPEC would expand SPEC's scope beyond the contract envelope D0007 establishes.

What SPEC §14 *does* get is a single revision-history row noting that D0013 exists and that `docs/homepage-governance.md` is where homepage-content changes route. That keeps the locking surface aware of the new governance without absorbing it.

## What This Forecloses

- **Silent drift between canon and the homepage.** With D0013 + governance doc + CI script in place, the day-2-to-day-3 N-cardinality drift cannot recur silently. CI catches the textual pattern; the doc catches edits that need new positioning beats; the encode trail catches the decisions that drove either.
- **Treating the homepage as "just marketing."** Once the homepage is a load-bearing PoC surface, it is bound by the same evidence and review discipline as any other artifact: definition of done, visual proof, encoded decisions. Slogans without canon backing get rejected at PR review.
- **Adding a fourth positioning beat without a decision-log entry.** TCP/IP + SMS / dumb-pipe is the canonical pair. A future edit that wants to add (e.g.) a "dial tone" or "substrate" beat alongside them is welcome, but it needs a governance doc entry explaining the tradeoff and a session encode, not a quiet swap.

## Reversibility

**Two-way.** D0013 commits to a content rule and a CI mechanism, both of which can be reversed by editing the same files: deleting the decision, removing the script's invocation in the workflow, and reverting the governance doc. No wire change is involved; no client breaks if the homepage rules change. The reversibility cost is symmetric to the cost of writing it (a single PR that touches `canon/decisions/D0013`, `docs/homepage-governance.md`, `scripts/check-homepage-architectural-claims.mjs`, and `.github/workflows/homepage-architectural-claims.yml`).

The asymmetry worth naming: this decision encodes a learning from a real session (the day-3 N-cardinality fix). Reversing it costs nothing structurally but loses the institutional memory of *why* the rule exists. A future reverser would inherit the same drift surface that caused PR #19 in the first place.

## See Also

- `ams://docs/homepage-governance` — the operational governance doc that implements this decision (audience map, in-scope claims, forbidden patterns, change procedure).
- `scripts/check-homepage-architectural-claims.mjs` — the CI script that mechanically enforces the architectural-surface rule.
- `.github/workflows/homepage-architectural-claims.yml` — the workflow that runs the script on PRs touching the homepage.
- `ams://canon/decisions/D0001-tokens-not-messages` — "one emission, N subscribers"; the upstream wire-shape claim this decision protects on the homepage.
- `ams://canon/decisions/D0007-spec-as-locking-surface` — why this decision lives outside SPEC.
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — multi-party group framing.
- `ams://canon/principles/operator-as-subscriber` — polymorphic subscriber lineage.
- `ams://canon/principles/observability-as-subscriber` — observers as wire-equal subscribers.
- `ams://canon/constraints/two-agent-conversation-conventions` — the constraint that already named two-agent as a demo convention rather than a wire commitment.
- `journal/2026-05-03-ams-homepage-n-cardinality-and-dumb-pipe.tsv` — the encode that surfaced this drift on day 3 and motivated this decision.
- `klappy://canon/principles/prompt-over-code` — the upstream principle: governance lives in the artifact the tool reads, not in human memory.
- `klappy://canon/principles/dry-canon-says-it-once` — why the rule is in one decision and not duplicated across SPEC, AGENTS.md, and the governance doc.
