---
uri: ams://docs/homepage-governance
title: "Homepage Governance — What the Homepage Is For, Who It Speaks To, What It Can Claim"
audience: docs
exposure: nav
tier: 2
voice: neutral
stability: evolving
tags: ["ams", "docs", "homepage", "governance", "marketing-surface", "demo-surface", "drift-detection", "change-procedure"]
epoch: E0008.4
date: 2026-05-03
derives_from: "ams://canon/decisions/D0013-homepage-as-poc-surface (the load-bearing rule); ams://canon/decisions/D0001-tokens-not-messages; ams://canon/decisions/D0007-spec-as-locking-surface; ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription; ams://canon/principles/operator-as-subscriber; ams://canon/principles/observability-as-subscriber; ams://canon/constraints/two-agent-conversation-conventions"
governs: "Every change to worker/src/homepage.ts and any future site surface AMS publishes. Names what the homepage is for, names its audiences, names the in-scope and out-of-scope claim list, names the architectural surfaces (CI-checked) and demo surfaces (not CI-checked), names the canonical positioning beats, and prescribes the change procedure that PRs follow."
status: active
---

# Homepage Governance — What the Homepage Is For, Who It Speaks To, What It Can Claim

> The homepage at `worker/src/homepage.ts` is a load-bearing PoC surface (D0013), not marketing collateral. It is the first contact point for every consumer — agent or human — deciding whether AMS solves their problem. This document is the governance layer that sits between the canonical decision (D0013) and the source file: it names the audiences, enumerates what the homepage may and may not claim, lists the architectural surfaces CI mechanically guards, and describes the change procedure that every PR follows. Read this before opening `homepage.ts`.

## Purpose

The homepage exists to do exactly three things, in this order:

1. **Tell the right reader, in under fifteen seconds, whether AMS solves their problem.** That reader is anyone evaluating real-time agent communication — a developer wiring two agents, a team running a multi-agent product, an operator looking at the integration surface. The hero, meta description, and og description carry the weight here. If those surfaces fail, nothing else matters.

2. **Demonstrate the protocol live.** The in-page theatre, the live `/healthz` polling, the bearer-mint flow, and the wscat hand-off make the page itself a working artifact. A visitor who reads "real-time pub-sub for agents" and sees the same page produce a working magic link in seven seconds has both the claim and the evidence in one screen.

3. **Hand the visitor the next step.** Documentation pointers, the example client repo path, the MCP wrapper config — the homepage is not the docs, it is the on-ramp to the docs. Every section that doesn't directly serve (1) or (2) should be doing (3).

Anything the homepage does that is not (1), (2), or (3) is scope creep and should be challenged in PR review.

## Audiences

The homepage serves three audiences, mapped to three rhetorical registers. Sections should be readable as "who is this for" before "what does it say."

- **Marketing audience** — someone deciding whether to invest fifteen more minutes in AMS. They read the title, the meta description, the hero subhead, the polymorphic-subscribers section, and bounce. Their ask of the page: "What is this and why should I care?" Surfaces that serve them: `<title>`, `<meta name="description">`, `<meta property="og:*">`, hero, the SMS/dumb-pipe positioning beat, the `#subscribers` section.
- **Demo audience** — someone who has decided AMS sounds plausible and wants to see it work. They read the in-page theatre, the live status row, the door (i)/(ii) mint+join flow, the wscat command. Their ask: "Show me the wire moving." Surfaces that serve them: §02 demo title, the in-page SIM, the live `/healthz` row, the bearer-mint button, the wscat inset.
- **Docs audience** — someone who is convinced and wants to start building. They read the "Documents" pointer block in `README.md` (linked from the homepage), the `examples/two-agents/` path, the MCP config snippet. Their ask: "How do I integrate?" Surfaces that serve them: any "next step" pointer to `SPEC.md`, `PROTOCOL.md`, `examples/`, the MCP wrapper.

A section that does not cleanly map to one of these audiences is unfocused and should be rewritten or removed.

## In-Scope Claims

The homepage may make these claims, in these forms:

- **Wire shape:** AMS is real-time pub-sub for agents. N peers join a conversation. Each owns a stream. Tokens fan out to every subscriber.
- **Polymorphic subscribers:** Subscribers may be agents, humans, observers, services, or any other entity that can listen. They are wire-equal (D0001, operator-as-subscriber, observability-as-subscriber).
- **Positioning — TCP/IP play:** AMS is the thin, unopinionated foundation that anyone's stack can sit on top of. Permitted in architectural surfaces; SHOULD be paired with the SMS / dumb-pipe beat to offset semantic baggage.
- **Positioning — SMS / dumb-pipe:** The "AMS" acronym is a deliberate echo of SMS. Carriers move bytes; they don't read them. AMS moves tokens; it doesn't parse them. (`ESSAY.md:67`, `AMS.md:306`)
- **Live demo claims:** The page itself mints accounts and conversations against the live Worker. The /connect WebSocket is live (Day 2 evidence in `journal/evidence-day2-wscat.txt`). The in-page WebSocket theatre is a faithful in-browser SIM until the MCP wrapper ships (D0012).
- **Multi-host:** Both `ams.klappy.dev` and `ams.truthkit.ai` resolve to one Worker (D0011). Magic links are host-portable.
- **Status:** PoC. The control plane and stream plane are live; the hosted MCP wrapper is the next slice. (Source of truth: `README.md` "Status" section.)

## Out-of-Scope Claims

The homepage MUST NOT claim:

- **Anything not in `SPEC.md`.** The contract envelope is fixed by D0007; the homepage cannot make commitments deeper than the spec it implements. If the homepage wants to claim a feature, the feature must already be in SPEC's accepted scope or the SPEC change must land first.
- **Pricing, SLAs, support tiers, or terms.** The PoC is a hosted public instance with no commercial commitments. License is TBD (per `README.md`).
- **Comparisons to specific competitor products by name.** Positioning is permitted ("the TCP/IP play for agent communication"); side-by-side claims against named services are not.
- **Roadmap dates.** "Soon," "Q2," "next month" are forbidden. `HORIZON.md` lists what becomes possible; it does not promise when.
- **Architectural cardinality framings that contradict the wire.** No "two agents" as architectural claim; no "one-to-one messaging"; no "agent pair." See "Forbidden Patterns" below for the mechanical list.

## Architectural Surfaces (CI-Checked)

These specific surfaces in `worker/src/homepage.ts` are governed by the cardinality rule and scanned by `scripts/check-homepage-architectural-claims.mjs`:

- The `<title>` element's text content
- The `<meta name="description">` `content` attribute
- The `<meta property="og:title">` `content` attribute
- The `<meta property="og:description">` `content` attribute
- The hero subhead — currently the `<span class="small">` containing `<strong>AMS · Agent Messaging Service.</strong>` and the immediately following sentence

If a future homepage edit moves the hero subhead to a different element, the CI script's hero-subhead matcher MUST be updated in the same PR so the surface stays scanned.

## Demo Surfaces (Not CI-Checked)

These surfaces are explicitly NOT scanned by the CI script because the cardinality language is structurally accurate to the demonstration:

- The in-page theatre body copy and labels
- The §02 demo title (`Two agents. Two streams. One wire.`) — the demo literally is two agents
- The "two doors" mint/join authorization framing — "two" refers to the authorization model (mint vs join), not agent count
- The terminal command examples (`two terminals + wscat`) — literal demo step
- Any walkthrough copy whose subject is a specific demonstration with a specific subscriber count

When in doubt, the test is: *if AMS shipped without this demo, would the claim still be true?* If yes, the surface is architectural. If no, it is demo-scoped.

## Forbidden Patterns (in Architectural Surfaces Only)

The CI script fails any PR that introduces any of these patterns into the architectural surfaces listed above. Patterns are case-insensitive regular expressions:

- `\btwo agents?\b`
- `\b2 agents?\b`
- `\bpair of agents\b`
- `\btwo[- ]agent\b` (when not immediately followed by `convention`, `demo`, or `instruction`)

The list is intentionally short. The principle is "architectural cardinality claims are N-peer." New forbidden patterns are added to this list and to the script in the same PR; the CI check and this doc are kept in lockstep.

## Canonical Positioning Beats

Two positioning beats are canon as of D0013:

1. **TCP/IP play.** "A thin, unopinionated foundation that anyone's stack can sit on top of." Permitted in architectural surfaces. Imports semantic baggage (ordering, retransmission, delivery semantics) AMS disowns; SHOULD be paired with the SMS beat.
2. **SMS / dumb-pipe.** "A deliberate nod to SMS — a primitive, ubiquitous, dumb-pipe substrate that nobody thinks about because it just works. SMS does not know what your text means. Neither does AMS." (`ESSAY.md:67`, `AMS.md:306`) Vodka-checks cleanly because SMS is famously dumb about payload, which is exactly what AMS does.

Adding a third beat (e.g., dial-tone, substrate, per-query orchestration) requires a Decision Log entry below explaining the tradeoff and a session-end encode.

## Change Procedure

Every PR touching `worker/src/homepage.ts` follows this sequence:

1. **Read this doc** before opening the file. If the change touches an architectural surface, re-read the In-Scope and Out-of-Scope sections.
2. **Make the edit** in a feature branch.
3. **Run CI locally:** `node scripts/check-homepage-architectural-claims.mjs`. The script must exit zero before the PR is opened.
4. **Capture visual evidence per Definition of Done.** Before/after screenshots of any architectural surface or visible demo region; saved as `journal/evidence-<date>-homepage-<slug>.png`.
5. **Open the PR.** GitHub Actions runs the script again as part of the workflow; failure blocks merge.
6. **Encode at session end:** produce a TSV in `journal/<date>-<slug>.tsv` capturing decisions, observations, learnings, constraints, handoff. Per `ams://canon/principles/poc-build-repeatability-pattern`.
7. **Update this doc in the same PR** if the change introduced or modified a positioning beat, an in-scope claim, an out-of-scope claim, or a forbidden pattern. Doc edits without code edits are valid; code edits without doc edits, when the change touched governed content, are not.
8. **Update D0013** only if the load-bearing rule itself changed. Adding a beat or tightening a forbidden pattern is a doc change; changing what makes a surface architectural is a decision change.

## Decision Log

| Date | Change | Driver |
|------|--------|--------|
| 2026-05-03 | Initial governance doc landed alongside D0013, the CI script, and the GitHub Actions workflow. Codifies the cardinality rule, the TCP/IP + SMS positioning pair, the architectural-vs-demo surface split, and the change procedure. | Day 3 N-cardinality drift (`journal/2026-05-03-ams-homepage-n-cardinality-and-dumb-pipe.tsv`) survived two days because there was no governance surface to constrain or detect it. The governance pattern proposed in the website-governance planning conversation was tested retrospectively against day 3 and found to be the missing piece. This doc + D0013 + CI + workflow are the four artifacts that close the loop. |

## See Also

- `ams://canon/decisions/D0013-homepage-as-poc-surface` — the load-bearing decision this doc operationalizes.
- `worker/src/homepage.ts` — the source file governed.
- `scripts/check-homepage-architectural-claims.mjs` — the CI script.
- `.github/workflows/homepage-architectural-claims.yml` — the workflow.
- `journal/2026-05-03-ams-homepage-n-cardinality-and-dumb-pipe.tsv` — the originating drift encode.
- `klappy://canon/constraints/definition-of-done` — visual evidence and test-output requirements referenced by the change procedure.
- `klappy://canon/principles/dry-canon-says-it-once` — why the cardinality rule appears in D0013 and is referenced (not duplicated) here.
- `klappy://canon/principles/prompt-over-code` — why the rule is enforced by a CI script reading this doc, not by reviewer memory.
