---
uri: ams://canon/constraints/audit-gate-prompts-follow-oddkit-prompt-pattern
title: "Audit-Gate Prompts Follow the oddkit Prompt Pattern — Governance Fetched at Runtime, Not Hardcoded"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "constraint", "audit-gate", "spawned-agent-sessions", "prompt-architecture", "oddkit", "governance", "voice", "brand-discipline", "anti-pattern"]
epoch: E0008.5
date: 2026-05-13
derives_from: "klappy://canon/constraints/oddkit-prompt-pattern (Tier-1 upstream constraint this is the AMS-side adoption of), klappy://canon/voice/oddie-the-river-guide (the specific brand_discipline canon every AMS audit persona points at), ams://canon/constraints/canon-code-sync-via-spawned-agent-session, ams://canon/constraints/output-artifact-format-validation-via-spawned-agent-session, ams://canon/constraints/oddkit-gauntlet-via-spawned-agent-session"
complements: "klappy://canon/methods/persona-shaped-agent-runtime, klappy://canon/methods/spawned-agent-session-runtime-contract"
governs: "Every AMS audit-gate persona's system prompt (system_prompt_uri canon body + runtime wrapping). Names the rule that governance is fetched from canon at runtime, never hardcoded into the prompt or pre-fetched into the prompt body; names the imperative phrasing the task-definition canons must use to instruct the agent to dereference brand_discipline before emitting voice-sensitive output."
status: active
---

# Audit-Gate Prompts Follow the oddkit Prompt Pattern — Governance Fetched at Runtime, Not Hardcoded

> The agent that runs an AMS audit gate has oddkit available as an MCP tool. Voice, register, emoji palette, and the rest of the brand discipline canon are reachable by a single `oddkit_get` call. Hardcoding that canon into the system prompt — or pre-fetching it into the system prompt body at session-assembly time — is the God Prompt anti-pattern that `klappy://canon/constraints/oddkit-prompt-pattern` forbids. AMS audit gates follow upstream. Governance lives in canon. Prompts point and instruct; the agent fetches.

## Description

`klappy://canon/constraints/oddkit-prompt-pattern` is the Tier-1 upstream constraint on prompt architecture for every oddkit-powered application. Its summary: "the prompt is not the constitution; oddkit is." System prompts carry the Identity of Integrity creed, the four axioms, a declaration that oddkit tools are available, and a short task framing. **All governance — voice, relational sensitivity, author identity, guide posture, writing canon — is fetched from canon at runtime, never hardcoded.** Hardcoding governance creates stale forks that drift from canon, and the system prompt should be under 500 words; growth beyond that is governance leaking in.

AMS audit-gate prompts are oddkit-powered (each persona declares `mcp_servers.operational: [oddkit]` and the runtime wires oddkit via the Anthropic native MCP connector). They are therefore governed by the upstream constraint without restatement. This document is the AMS-side adoption pointer: it names which knobs the audit-gate family must turn to comply, and it forbids the specific anti-patterns the audit-gate family is at risk of falling into.

## What the Audit-Gate Prompts Must Do

Each audit-gate persona's `system_prompt_uri` resolves to a canon constraint doc (e.g., `ams://canon/constraints/canon-code-sync-via-spawned-agent-session`). The runtime composes the system prompt by wrapping that doc's body with persona identity headers. The wrapped body is what the agent sees as its system prompt.

Within that body, the §Voice and surface section (or equivalent) must:

1. **Name the brand_discipline URI explicitly.** Currently `klappy://canon/voice/oddie-the-river-guide`. Future personas may point at different voice canons; the URI is the pointer, the canon is the truth.
2. **Instruct the agent imperatively to dereference the URI before emitting voice-sensitive output.** Not "this constraint does not restate the voice canon" (descriptive, passive); but "before emitting any verdict markdown that contains emoji, river vocabulary, or stylistic register choices, call `oddkit_get` on `<brand_discipline URI>` and follow its canonical palette and discipline." Imperative phrasing is load-bearing; the agent must know it is required to fetch, not invited to.
3. **Forbid improvisation.** "Do not improvise emoji or register choices that are not derivable from the brand_discipline canon" is the explicit guard against training-time-prior leakage. Without this line, agents fill in palette gaps from their priors, which produces off-canon emoji like anger glyphs as bullets or arbitrary box-drawing characters in place of river vocabulary (observed on PR #90 verdict comments).

These three obligations are the §Voice and surface section's contract under this constraint. They are short — three sentences total — and they encode the upstream pattern without duplicating its content. The brand_discipline canon body never appears in the system prompt; only its URI and the imperative to fetch it.

## What the Runtime Must NOT Do

The audit-gate runtime (`worker/src/runtime/audit-gate.ts` `assembleSystemPrompt`) must NOT:

- **Pre-fetch the brand_discipline canon and inject its body into the system prompt.** This was the proposed fix that surfaced this constraint. It was retracted on review because it directly violates the upstream Tier-1 constraint (governance fetched at runtime, not hardcoded — pre-injection at session-assembly time is hardcoding-with-extra-steps; the stale-fork failure mode applies the same way).
- **Bake voice palette tables, banned-moves lists, or river-vocabulary tables into the task-definition canon body itself.** That is the same anti-pattern, displaced one layer; the task-definition canon doc is the system prompt body, so embedding voice canon content there hardcodes it just as surely as embedding it in TypeScript.
- **Add a persona profile field (`agent_voice`, `voice_strict`, etc.) whose effect is to pre-fetch governance.** A field that turns on hardcoding is still hardcoding. If the runtime ever grows a "speed up the agent by pre-fetching" feature, it must target latency without bypassing the imperative-instruction pattern.

The runtime is permitted to fetch the persona profile and the `system_prompt_uri` canon at session-assembly time — those are persona definition and task definition, not governance. Governance is what the persona points at via `brand_discipline` and what oddkit holds at the URIs the canon references; the agent reaches it via tool calls during the session.

## Why This Distinction Matters

The same DRY argument that forbids hardcoding governance into a Lovable-spec system prompt forbids hardcoding it into an AMS-runtime-injected system prompt. The mechanism (file-baked vs. pre-fetched-and-concatenated) is different; the result (the canon at session-time becomes a snapshot frozen at session-assembly-time) is identical. When the upstream voice canon evolves — when emoji palette entries are added, when banned moves are extended, when the density rule is tightened — every audit gate that pre-fetched the body holds a stale copy until its next deployment. Audit gates that follow the upstream pattern hold a pointer and resolve it fresh per session; the canon evolution propagates instantly.

The case for pre-fetching looks like an optimization: "the agent will fetch this every session anyway, why not save the round trip." That framing is the trap. Pre-fetching is not an optimization of the upstream pattern; it is a different pattern that happens to share the surface ("the canon body ends up in the prompt"). The patterns diverge on the question of "what is the source of truth at execution time," and that question is the entire point of the upstream constraint.

## Provenance

This constraint was surfaced 2026-05-13 during investigation of off-palette emoji in PR #90's audit-gate verdict comments (anger glyph as bullet, box-drawing characters in place of river vocabulary). Initial diagnosis was that the runtime fetched the persona profile but never dereferenced the `brand_discipline` URI, leaving the agent with passive instruction ("speaks as Oddie per X") and training-time priors to fill the gap. The proposed fix added an `agent_voice: strict` persona field that would pre-fetch and inject the brand_discipline canon body inline.

The proposed fix was retracted on review against `klappy://canon/constraints/oddkit-prompt-pattern` (Tier-1, stable, since E0006). That constraint explicitly forbids hardcoding governance into prompts; pre-fetching at session-assembly time is a mechanical variant of the same anti-pattern. The correct fix is the imperative-instruction tighten described in §What the Audit-Gate Prompts Must Do, which makes the existing pointer load-bearing without duplicating the canon body.

The retraction itself is the evidence base for this constraint: an AMS-internal optimization that looked locally correct was caught against an upstream Tier-1 governance pattern. Encoding the AMS-side adoption pointer prevents the same coinage attempt from recurring.

## See Also

- `klappy://canon/constraints/oddkit-prompt-pattern` — the Tier-1 upstream constraint this is the AMS-side adoption of. Authoritative for the prompt-architecture rule; this document is the AMS-specific pointer at it.
- `klappy://canon/voice/oddie-the-river-guide` — the brand_discipline canon every AMS audit persona currently points at. The §Brand Guide — Emoji Discipline section is what the agent must dereference before emitting voice-sensitive output.
- `klappy://canon/principles/prompt-over-code` — the broader principle that prompts are governance surfaces and the canon is the source of truth, not the prompt body.
- `klappy://canon/methods/persona-shaped-agent-runtime` — the upstream method for persona-profile-driven agent sessions; this constraint operates within its envelope.
- `ams://canon/constraints/canon-code-sync-via-spawned-agent-session` §Voice and surface — the §Voice paragraph that this constraint tightens from passive to imperative.
- `ams://canon/constraints/output-artifact-format-validation-via-spawned-agent-session` §Voice and surface — same tightening applies.
- `ams://canon/constraints/oddkit-gauntlet-via-spawned-agent-session` §Voice and surface — same tightening applies.
