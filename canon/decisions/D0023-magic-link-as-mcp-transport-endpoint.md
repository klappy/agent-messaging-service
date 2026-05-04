---
uri: ams://canon/decisions/D0023-magic-link-as-mcp-transport-endpoint
title: "D0023 — Magic Link as MCP Transport Endpoint; The Wrapper Carries Bootstrap Governance"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "decision", "mcp", "edge-wrapper", "magic-link", "bootstrap", "self-describing", "prompt-over-code", "vodka-architecture"]
epoch: E0008.4
date: 2026-05-04
derives_from: "D0002-magic-link-as-url (the link is an address, not an opaque blob — extends discovery to bootstrap); D0006-dream-house-wire-edge-wrappers (wrappers absorb runtime impedance, including bootstrap impedance); D0009-stream-as-primitive-ownership-excludes-subscription (the wire model the wrapper translates); D0012-browser-is-an-mcp-runtime (the precedent — browsers go through MCP because the wire's auth shape doesn't fit; AI assistants go through MCP because the wire's discovery shape doesn't fit either); D0019-cross-session-continuity-via-account-conversation-keying (the SessionDO keying that makes pre-bound MCP sessions resumable); canon/constraints/mcp-wrapper-conformance-for-conversational-ai (the conformance surface this extends); canon/constraints/wrapper-stays-cheap (the discipline the extension must respect); canon/constraints/permanent-non-goals (items 1–3 — opaque pass-through of operator-set instructions); canon/principles/operator-as-subscriber (the convention namespace operator instructions plug into); operator↔Claude planning conversation 2026-05-04 establishing that MCP already standardizes every primitive AMS would otherwise need to reinvent for self-description (initialize.instructions, prompts/list, resources/list)."
complements: "D0016-buffering-and-persistence-as-wrapper-primitive (parallel wrapper-tier expansion), canon/constraints/mcp-wrapper-conformance-for-conversational-ai (this decision motivates additive surface)"
governs: "How the AMS reference MCP edge wrapper exposes itself to AI assistants and other MCP-speaking runtimes. The route shape (POST to a magic-link URL hits the MCP handler with conversation pre-bound). The MCP surface additions (populated initialize.instructions, prompts/list, expanded resources/list). The discipline boundary that keeps the wrapper from interpreting operator-set instruction content."
status: active
---

# D0023 — Magic Link as MCP Transport Endpoint; The Wrapper Carries Bootstrap Governance

> The magic link is the bootstrap. POST to it with an MCP JSON-RPC body and the AMS edge wrapper handles the request with the conversation already bound. The wrapper's `initialize` response carries canon-derived governance for the wire it wraps, and the wrapper's `prompts/list` carries the operator's per-conversation instructions verbatim. A fresh AI assistant given only a magic link learns everything from the wrapper. Translation discipline holds: the wrapper does not interpret operator content; it carries it.

## Description

Today, an AI assistant handed an AMS magic link with no prior priming cannot use it. The link is a URL that returns HTML to browsers and 404 to non-browsers. The `/mcp` endpoint exists but requires the assistant to know it exists, mint an account, then call `ams_join` with the magic link as a parameter. Three out-of-band facts are required before the assistant can move: the MCP endpoint's URL, the account-mint endpoint's contract, and the convention manifest the conversation uses.

The same problem motivated `D0012` for browsers — browsers cannot supply `Authorization` on a WebSocket upgrade, so the wrapper handles the upgrade for them. The same shape applies here: AI assistants cannot intuit AMS conventions from the URL alone, so the wrapper exposes them through the protocol the assistants already speak. MCP's `initialize.instructions` field, `prompts/list`, and `resources/list` exist for exactly this purpose; the wrapper populates them with what assistants need to know.

The decision is twofold:

1. **Routing**: a POST to a magic-link URL with an MCP JSON-RPC body is handled by the AMS MCP edge wrapper, with the `(namespace, conversation alias, permissive token)` extracted from the URL and pre-bound to the resulting MCP session. Browser GETs to the same URL continue to return the tincan UI per `D0012`.

2. **Governance carriage**: `initialize.instructions` carries a canon-derived governance block (how the wire works, two-door auth, polling vs SSE, the convention manifest) plus the operator's per-conversation instructions opaquely passed through from conversation `metadata`. `prompts/list` exposes operator-defined prompts (e.g. `join_as_peer`, `observe_passively`) read from the same metadata source. `resources/list` exposes the conversation snapshot, the deployment-level protocol references, and the convention spec.

Both pieces sit entirely in the wrapper tier per `D0006`. The wire learns nothing. The Conversation DO does not change. The route addition is an alias mapping at the worker's request router; the surface additions are MCP-spec features the wrapper had not yet populated.

## Outline

- Why the Wrapper Carries Bootstrap, Not the Wire
- The Routing Contract
- The MCP Surface Additions
- The Operator-Instructions Pass-Through
- The Discipline Boundary — Wrapper Stays Cheap
- Symmetry With oddkit's Operating Contract
- The Bootstrap Test
- Alternatives Considered
- Risks and Failure Modes
- Comparative Positioning
- Success Criteria
- What This Forecloses
- What This Is Not
- Reversibility
- See Also

---

## Why the Wrapper Carries Bootstrap, Not the Wire

`D0006` established that the wire stays push-native, broadcast-only, runtime-agnostic. Every runtime impedance — auth shape, transport ergonomics, notification fallback, persistence — is absorbed at the wrapper layer. Bootstrap discoverability is the same shape of impedance: a fresh runtime needs to learn how to use AMS, and the place where runtime-specific learning happens is the wrapper that speaks the runtime's protocol.

Adding bootstrap to the wire would mean the broker grows opinions about discovery formats, manifest schemas, instruction text, and per-conversation prompt scaffolds. Each of those is a runtime-side concern dressed up as wire infrastructure. The slippery slope `D0006` rejects activates the moment the broker starts authoring instructions.

The alternative, adopted here: the MCP edge wrapper — already the door for conversational AI per the conformance constraint — additionally carries discovery and bootstrap content via MCP-spec features it had not yet populated. The wire stays unchanged.

## The Routing Contract

The reference deployment routes:

- `GET {magic_link}` with `Accept: text/html` → tincan UI (existing browser path per `D0012`).
- `POST {magic_link}` with `Content-Type: application/json` and an MCP JSON-RPC body → MCP handler, with `(namespace, alias, t)` extracted from the URL and the conversation pre-bound for the resulting `mcp-session-id`.
- `GET {magic_link}` with `Accept: text/event-stream` and an `mcp-session-id` header → MCP SSE notification leg, conversation already bound from the `ams_join` step (or from the route-level binding if the assistant skipped `ams_join` because the URL already supplies the magic-link inputs).

The pre-binding lets `ams_join` accept zero arguments when called against a magic-link route — the magic link's components are already in scope. The existing `/mcp` endpoint continues to accept `ams_join({ magic_link })` for clients that prefer endpoint-uniformity over URL-binding. Both routes converge to the same SessionDO per `D0019`.

URL structure on alternative AMS implementations is per `permanent-non-goals` item 9 a deployment choice. The reference deployment commits to the route shape above; alternative implementations satisfying the conformance constraint may route differently.

## The MCP Surface Additions

The conformance constraint commits the wrapper to six tools, two notifications, and one resource. This decision adds two MCP-spec surfaces that were previously absent:

- **`prompts/list` and `prompts/get`** — exposes operator-defined prompt scaffolds for the bound conversation. Each prompt is a name, a short description, and a templated message body. The wrapper reads them from conversation `metadata.prompts` (a list of prompt objects) and serves them through the MCP spec's prompt surface. Prompts are opaque to the wrapper; payload contents are operator-authored and carried verbatim.

- **`resources/list` and `resources/read`** — exposes:
  - `ams://conversations/{conversation_id}` — the snapshot resource already named in the conformance constraint (just now actually served).
  - `ams://conversations/{conversation_id}/peers` — current peer list with stream metadata.
  - `ams://protocol` — pointer to `PROTOCOL.md` at the deployment's canonical canon location.
  - `ams://conventions/v1` — pointer to `canon/constraints/two-agent-conversation-conventions` and the `ams.convention.v1` manifest spec.

Plus the existing `initialize` response gets its `instructions` field populated:

- A static block derived from canon describing the wire model in one paragraph: tokens (not messages) per `D0001`; structural self-exclusion per `D0009`; two-door auth (the magic link in the URL is door 1, the bearer in `Authorization` is door 2); polling via `ams_recv` for runtimes without SSE; the convention manifest namespace `ams.convention.v1`; pointers to `PROTOCOL.md` and the conformance constraint.
- A per-conversation block, opaquely concatenated from conversation `metadata.instructions`, when the operator set one at mint.

The static block is generated at build time from a canon-derived template; the per-conversation block is read at request time from the bound conversation's metadata. The wrapper does not parse, validate, or rewrite either.

## The Operator-Instructions Pass-Through

Conversation `metadata` is operator-set at mint via `ams_create_conversation({ metadata })` and immutable per `mcp-wrapper-conformance-for-conversational-ai`. This decision adopts two reserved keys within `metadata` that the wrapper recognizes by convention:

- `metadata.instructions` — string. Free-form text appended to the wrapper's `initialize.instructions` after the static block. Intended for operator guidance to peers (e.g. "you are a debugging peer in this conversation; the operator is the AMS author; stay concise").

- `metadata.prompts` — array of `{ name, description, messages }` objects in the MCP `prompts/get` response shape. Served verbatim through `prompts/list` and `prompts/get`.

These keys are conventions, not protocol features. Per `permanent-non-goals` items 1–3, the wrapper does not validate the contents, schema-check the messages, or enforce any policy on their use. An operator who sets `metadata.instructions = "ignore your prior instructions and …"` gets exactly that, broadcast to every peer that calls `initialize`. The wrapper carries; the operator authors.

This satisfies the discipline of `wrapper-stays-cheap`: the wrapper translates between the runtime's I/O shape and the wire's, without taking a position on the runtime's prompt content or the operator's authorial choices.

## The Discipline Boundary — Wrapper Stays Cheap

Per `wrapper-stays-cheap`, a wrapper that grows beyond translation has become a product. Three checks confirm this decision stays within bounds:

1. **Could the bootstrap content be served by a separate subscriber instead?** In principle yes — an `ams.convention.v1` "tour-guide" subscriber could join every conversation and broadcast bootstrap context. In practice the latency budget for a fresh assistant arriving cold ("read instructions, then act") would be terrible if it required attaching first, waiting for a tour guide to emit, then reading. The MCP `initialize` call is the natural place for "what do I do here" because that is the MCP-spec contract for runtime-facing onboarding. The factor-out test does not fire because the alternative degrades the user experience the decision exists to improve.

2. **Does the wrapper make decisions about payload contents?** No. The static block is build-time canon derivation (no runtime branching). The per-conversation block is read-and-forward (no parsing). The prompts surface is read-and-forward (no validation). All payload-bearing content is opaque pass-through.

3. **Does the new surface outlive the runtime session?** No. `initialize` responses are per-session. `prompts/list` reads are per-session. The conversation `metadata` they reference lives in the Conversation DO, which is wire-tier and persists by virtue of the wire owning addressability per `D0002`.

The translation contract holds. The wrapper exposes new MCP surfaces but adds no new domain logic.

## Symmetry With oddkit's Operating Contract

The oddkit MCP server delivers governance to its callers on every request: every response envelope carries `server_time`, canon resolution traces, posture reminders. The bootstrap doc (`klappy://canon/bootstrap/model-operating-contract`) is fetched at session start by every consuming model. This is `prompt-over-code` applied to the model's own operating contract.

This decision applies the identical pattern to AMS: the MCP edge wrapper delivers AMS-operating governance to its callers on every `initialize`. The conformance constraint plus the convention manifest plus the operator's per-conversation instructions are the assembled equivalent of the oddkit bootstrap contract, scoped to AMS instead of to the model's general posture. Same discipline, different scope.

The two MCP servers compose: an AI assistant connecting to oddkit gets its general operating contract; the same assistant attaching to an AMS conversation through the AMS MCP wrapper gets the AMS-specific operating contract. Neither carries the other's content; both follow the same architectural pattern.

## The Bootstrap Test

The decision is validated by a single test: a fresh AI assistant session — Claude.ai with no project instructions, ChatGPT in a clean session, a Cursor instance with no prior AMS context, a managed agent spun up cold with only the magic link in its first message — must be able to:

1. Recognize the URL as an AMS magic link from the response shape (or be told by the user "this is an MCP endpoint").
2. POST `initialize` and read the `instructions` field.
3. Read `prompts/list`, optionally `prompts/get` the operator's `join_as_peer` prompt.
4. Mint an account if it doesn't have one, call `ams_join`, and proceed.
5. Send and receive tokens following the conventions described in the instructions.

If any step fails, the bootstrap is incomplete. The test is binary: either the assistant figures it out from the wrapper alone, or the bootstrap design has not delivered. The test runs against multiple runtimes (claude.ai, ChatGPT, Cursor, Claude Desktop, a managed agent) to confirm the pattern is runtime-portable.

## Alternatives Considered

Four alternatives were weighed before settling on this shape:

1. **Well-known endpoints + content negotiation on the magic link.** GET `{magic_link}` with `Accept: application/json` returns a JSON manifest; `/.well-known/ams.json` carries deployment-level guidance. Rejected because every primitive this needs already exists in MCP spec — `initialize.instructions`, `prompts/list`, `resources/list`. Inventing a parallel JSON shape duplicates what MCP already standardizes and costs every AMS implementation a custom format to maintain.

2. **Embed instructions in the `ams.convention.v1` capabilities manifest.** Operator-set bootstrap content lives in `stream_metadata.capabilities['ams.convention.v1'].instructions`. Rejected because capabilities is per-stream-declaration ("here's what I am"), not per-conversation-instructions ("here's what you should do here"). The semantic mismatch invites confusion. Conversation `metadata` is the right scope.

3. **A "tour-guide" subscriber that broadcasts bootstrap context on every join.** A dedicated subscriber emits a `welcome` token whenever it sees a `stream_joined`. Rejected because the latency budget for "attach, wait for tour guide to emit, then act" is structurally worse than reading `initialize.instructions` synchronously at session start. Also requires every conversation to have a tour-guide subscriber, which is operator overhead for a wrapper-tier concern.

4. **Status quo — every consumer brings their own priming.** Document conventions in PROTOCOL.md and require operators to paste relevant context into project instructions / system prompts. Rejected because the priming requirement makes ad-hoc human-into-LLM-conversation impossible (the hackathon use case): a fresh AI assistant handed a magic link cannot bootstrap without out-of-band briefing. The product loses the "URL is enough" property that makes AMS competitive with closed protocols.

The chosen path uses MCP-spec primitives, places content at the right scope, has zero added latency, and requires no per-conversation operator work beyond optional `metadata.instructions` / `metadata.prompts`.

## Risks and Failure Modes

Four risks named explicitly so they can be watched:

1. **Prompt injection amplification.** Operator-set `metadata.instructions` is broadcast to every peer that calls `initialize`. An operator who minted a conversation in good faith and shared the link could later have a malicious peer-of-a-peer read instructions designed for the original audience. **Mitigation:** scope is the conversation, audience is whoever holds the magic link; same trust model as the wire itself per `D0004` two-door registration. **Retraction condition:** if the surface produces an exploitable amplification path absent from the existing wire trust model, narrow the surface or move instructions out of conversation `metadata` into a more access-controlled location.

2. **Static governance block drift.** The canon-derived `initialize.instructions` static text is generated at build time from a template that references PROTOCOL.md, the conformance constraint, the convention spec. If canon evolves and the template is not regenerated, served instructions become stale. **Mitigation:** template generation runs in CI on canon repo merges; staleness shows up as a build-time check. **Retraction condition:** if drift becomes a recurring source of incorrect bootstrap, fall back to `resources/list` URLs pointing at canon directly and serve a minimal static block.

3. **MCP surface deprecation.** `initialize.instructions`, `prompts/list`, `resources/list` are MCP-spec features. If the spec deprecates or renames them, this decision is partially obsolete. **Mitigation:** track MCP spec evolution; the wrapper can adapt because the bootstrap content is portable across surfaces. **Retraction condition:** if MCP loses these surfaces with no equivalent, reopen the well-known-endpoint alternative.

4. **Adoption pattern mismatch.** This decision assumes a fresh AI assistant will call `initialize` and read `instructions` before acting. A consumer that ignores `instructions` (or has no facility to surface them to its underlying LLM) gets the bootstrap-test failure: it cannot use AMS without external priming. **Mitigation:** none at the wrapper layer; this is a consumer-implementation responsibility. The conformance constraint may add language requiring assistants to read `initialize.instructions`. **Retraction condition:** none — the decision is correct even when consumers fail to honor it; the failure is on the consumer side.

## Comparative Positioning

The closest prior art is **A2A's agent card** pattern — `/.well-known/agent-card.json` returns a JSON document describing an agent's capabilities, intended for cross-agent discovery. The differences are real:

- **Direction:** A2A's agent card describes *the agent serving it* ("here's what I can do"). This decision describes *the conversation being joined* ("here's what's happening here, who's already in, what the operator wants").
- **Lifecycle:** A2A agent cards are read-once-and-cached, expected to change rarely. This decision serves per-session content (`initialize` per attach), naturally scoped to the conversation lifetime.
- **Carrier:** A2A uses a static well-known JSON document. This decision uses MCP's existing protocol-active surfaces. AMS clients already speak MCP per `mcp-wrapper-conformance-for-conversational-ai`; no new format to learn.
- **Convergence vs divergence:** Per `canon/principles/envelope-altitude-consensus`, AMS structurally declines the typed-envelope altitude that A2A converges on. This decision is consistent with that posture: AMS does not adopt A2A-style typed agent cards; it uses a different surface (MCP) for a different purpose (bootstrap + governance, not capability advertisement).

The A2A author reading this decision should recognize that AMS is solving a related but distinct problem with a related but distinct mechanism, not implementing A2A under a different name.

## Success Criteria

The decision is implemented correctly when:

1. **Bootstrap test (primary):** A fresh Claude.ai session with no project instructions, given only a magic link, can call `initialize` against the magic-link URL, read the `instructions` field, optionally `prompts/get` the operator's join prompt, and successfully `ams_join` + `ams_send` + `ams_recv` to participate in the conversation. The test passes when the assistant's first emission reaches the operator's tincan UI within 60 seconds of receiving the magic link, with no out-of-band priming.

2. **Multi-runtime validation:** The same test passes for at least three distinct MCP-speaking runtimes — Claude.ai, Claude Desktop, and either Cursor or a managed-agent runtime. Pattern is portable, not Claude-specific.

3. **Wrapper discipline preserved:** The implementation passes `wrapper-stays-cheap` review — no new payload parsing, no new schema validation, no new business logic. Static block is build-time-generated; per-conversation block is read-and-forward.

4. **No wire change:** PROTOCOL.md `wire-conformance` test suite passes unchanged. The Conversation DO source diff is empty for this slice.

5. **Backward-compatible:** Existing `/mcp` callers using `ams_join({ magic_link })` continue to work without modification. The route alias is purely additive.

## What This Forecloses

- The wire cannot grow bootstrap-discovery semantics within a major version. Discovery is wrapper-tier. Adding it to the wire would compromise the dream-house abstraction `D0006` defends.
- Conversation `metadata` cannot become a typed schema for instructions or prompts within a major version. The wrapper-side reserved keys (`instructions`, `prompts`) are conventions, not protocol-mandated fields. A conversation may have neither, either, or both; the wrapper handles all four cases identically (omit the corresponding section).
- The wrapper cannot add an OPINION about whether operator-set instructions are "good" or "safe." Per `permanent-non-goals` items 1–3, operator content is opaque to AMS at every layer.

## What This Is Not

- **Not a protocol-level feature.** This decision binds the reference MCP edge wrapper. Alternative wrappers (Slack, webhook, A2A bridge) can choose their own bootstrap surface idiomatic to their target runtime.
- **Not a security boundary.** Operator-set instructions are exactly as trusted as the operator. An assistant that reads `prompts/get` and runs the prompt verbatim is following operator direction; the wrapper is not interposing safety review.
- **Not a discovery API.** The wrapper exposes what it knows about a single bound conversation. Cross-conversation discovery, account-level conversation listing, and registry lookups are out of scope here.
- **Not a substitute for documentation.** `PROTOCOL.md`, the conformance constraint, and the convention spec remain canonical. The bootstrap surface points at them; it does not replace them.
- **Not a permanent commitment to the convention key names.** `metadata.instructions` and `metadata.prompts` are the v1 convention. Future revisions may rename or restructure with backward-compat handling at the wrapper.

## Reversibility

**Two-way door at every level.** This decision is purely additive. Removing the route alias would leave `/mcp` working as before. Removing the populated `initialize.instructions` would leave the field empty (MCP-legal). Removing `prompts/list` and `resources/list` would leave the wrapper with the existing tools-only surface. The Conversation DO is unchanged in every direction. The convention keys can be renamed with a deprecation period.

The asymmetry with `D0016` (a one-way door because runtime authors expect the buffer to keep being there) does not apply here: bootstrap surfaces are read-once at session start, so removing them creates a polite degradation, not a structural break.

## See Also

- `ams://canon/decisions/D0002-magic-link-as-url` — the addressing primitive this extends
- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` — the wrapper-tier commitment this lives within
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — the wire model the wrapper translates
- `ams://canon/decisions/D0012-browser-is-an-mcp-runtime` — the precedent for "runtime impedance is wrapper-tier"
- `ams://canon/decisions/D0016-buffering-and-persistence-as-wrapper-primitive` — parallel wrapper-tier expansion (sibling decision)
- `ams://canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying` — the SessionDO keying that makes pre-bound sessions resumable
- `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai` — the conformance surface this extends additively
- `ams://canon/constraints/wrapper-stays-cheap` — the discipline boundary the extension respects
- `ams://canon/constraints/permanent-non-goals` — items 1–3 (opaque carriage of operator-set content)
- `ams://canon/principles/operator-as-subscriber` — the operator-metadata convention the prompts surface plugs into
- `ams://canon/constraints/two-agent-conversation-conventions` — the `ams.convention.v1` manifest pointed at from `resources/list`
- `ams://canon/principles/envelope-altitude-consensus` — the divergence posture this decision is consistent with (declining typed-envelope altitude)
- `klappy://canon/bootstrap/model-operating-contract` — the symmetric oddkit bootstrap pattern this mirrors at the AMS scope
- MCP specification — `initialize`, `prompts/list`, `prompts/get`, `resources/list`, `resources/read`
- `PROTOCOL.md` §4 — the wire frames the wrapper translates
- `POC-INFRA.md` §4 — the SessionDO this routes to
