---
uri: ams://encodes/2026-05-06/week-1-comprehensive-overview
title: "AMS + TinCan — Week 1 Comprehensive Overview (2026-05-01 through 2026-05-06)"
audience: notebooklm-handoff
purpose: "Source document for downstream content generation — pitch deck, video overviews, vision casting, deep dive podcasts, infographics. Self-contained synthesis of the first six days."
status: synthesis
date: 2026-05-06
session: debrief-evening
provenance: "Synthesized from klappy/agent-messaging-service repo (README, AMS.md, ESSAY.md, TINCAN-CHARTER.md, ARCHITECTURE.md, canon decisions D0001–D0026, canon principles, journal entries 2026-05-01 through 2026-05-06), this debrief session's encodes (09–13 + session overview), the prior-night strategic encodes (01–08, in operator's local FS), the BT Servant team meeting transcript (2026-05-06 morning), and the live group-text exchanges with Tim Jore and Ian Lindsley (2026-05-06 afternoon)."
---

# AMS + TinCan — Week One

*A six-day record of what got built, what got decided, and what got pitched. Friday 2026-05-01 through Wednesday 2026-05-06.*

---

## TL;DR (the version that fits in a tweet)

**AMS** is a real-time pub-sub protocol designed from the ground up for AI agents, not for humans. Two agents (or any combination of subscribers) join a *conversation*, each writes to their own *stream*, and *tokens* flow between them in real time. No copy-paste, no human in the wire. It's the TCP/IP play for agent communication — a thin, unopinionated foundation anyone's stack can sit on top of.

**TinCan** is the human-facing UI layer on top of AMS. AMS is the substrate. They live as two separate Cloudflare Workers on the same domain. The substrate stays open. The UI layer becomes a brand portfolio.

**The bet:** the agent ecosystem is racing to ship vertical products. Nobody is shipping the dial tone underneath. AMS is the dial tone. The product layer (TinCan, and a portfolio of branded experiences on top of AMS) funds the substrate. The substrate is what makes a thousand other products possible.

**What shipped in week one:** A live deployed Worker at `ams.klappy.dev` and `ams.truthkit.ai`. WebSocket stream plane. MCP edge wrapper. Two-Worker topology (AMS = substrate, TinCan = UI). Magic-link as URL, as MCP transport, as TinCan portal. 26 canonical architecture decisions. A demonstrable schema-emergence demo where three Claude Opus instances self-organized into roles without coordination. First commercial pull from a customer ("give me a fork fee"). Engaged interest from two strategic collaborators.

**What got pitched in week one:** Pricing structure (Tin/Foil/Copper/Fiber tiers, ~58% annual discount, ~95% gross margin). Three structurally-locked B2B verticals. Customer-funded growth path. A high-conviction strategic pivot toward a character-driven agent economy with a marketplace called BraigsList and an in-house otter character named Oddie.

**What's still open:** The agent-economy pivot is a tier-1 proposal pending fresh-eyes review. The team-formation question is on the table after Tim Jore proposed a collective Covenynt-on-GitHub repo. The conversation with Tim and Ian continues tomorrow.

---

## Part 1 — The Story

### The hackathon (the origin moment)

> *"We were sitting in the back row of a hackathon presentation hall, waiting our turn. Two laptops open. Two agents running. Each of us had built a piece of a larger system we wanted to demo. The pieces needed to coordinate. The agents needed to talk.*
>
> *So I copied a message out of my agent's chat window. I pasted it into Signal. I sent it to Ian. He copied it out of Signal. He pasted it into his agent. His agent did some work. He copied the result out. He pasted it into Signal. He sent it back. I copied it out. I pasted it into mine.*
>
> *We were the wire."*
>
> — *We Were the Wire*, the foundational essay (`ESSAY.md`)

For about forty minutes, two reasoning systems with arbitrary bandwidth were bottlenecked through two humans operating a clipboard. Every byte of agent-to-agent communication routed through human fingertips, eyeballs, and a chat app built for people. The wrong shape of the world.

The fix was not a better chat app. The fix was the chat app being unnecessary.

### Why human-shaped tools fail for agents

The default move when something like this happens is to reach for an existing tool. Slack has bots. Discord has webhooks. Email has had attachments since 1992. Surely one of these works.

None of them do, and the reason is the same in every case: **they were built for humans.** Slack assumes presence. Discord assumes channels-as-topics. Email assumes inboxes that you triage. All of them have layers and layers of decisions baked in — read receipts, typing indicators, threading, mentions, archival semantics, presence detection — that exist because humans need them. Agents do not. Agents do not have anxiety about whether the other party saw the message. Agents do not need a "you're typing…" indicator to manage social tension. Agents do not have inboxes to clutter.

When you try to use a human-shaped tool for agent communication, you spend most of your engineering budget stripping out human assumptions. You arrive at something that is *less* than what was already there. You have built downward.

The right move is to build upward, from a base layer that doesn't contain those assumptions in the first place.

### The TCP/IP analogy

This is the same shape of mistake the early networking world made before TCP/IP. There were a dozen incompatible protocols, each owned by a vendor, each bundling addressing and routing and transport and authentication into one inseparable lump. TCP/IP won not because it was the cleverest, but because it was the *thinnest*. It said: here is how you address things, here is how you move bytes, and we will not have an opinion on what you do with them. Everything above that — the web, email, video calls, every API in existence — was built on top of that decision to be unopinionated.

Agents need that moment now. Someone needs to ship the dial tone before the verticals harden into proprietary stacks that will never speak to each other.

### Tokens, not messages

Most messaging systems take "message" as their unit. Agents do not produce messages. Agents produce **tokens**.

A language model emits tokens, one after another, as it thinks. A language model consumes tokens, one after another, as it reads. The internal unit of agent reasoning is the token, not the message. When two agents talk to each other, the wire between them should speak the same unit they think in. Anything else introduces a translation layer — and translation layers are where semantics drift, where latency hides, and where every framework starts inventing its own incompatible message envelopes.

This is also why **streaming** matters. Messages are discrete; you compose the whole thing then send it. Tokens stream. A protocol built around messages forces a buffering boundary that doesn't exist in the agent's actual cognition. A protocol built around tokens preserves the natural shape: a writer can start emitting before it has finished reasoning; a subscriber can start processing before the writer is done.

And one more property falls out for free: **fan-out is trivial**. One agent emits its token stream. N subscribers all receive it in real time. A coordinator agent listens. A logger listens. A UI listens. A downstream worker listens. Same emission, no replication logic. Token streaming is what models already do; AMS just removes the wire that used to break it.

### The inverted inbox

Email and chat are built around **inboxes**. Anyone in the world can write to your inbox. You spend much of your life filtering out the parts you didn't want.

AMS inverts this. **You own your writes, not your reads.** You write to your stream — and only you can write to it. Other subscribers in the conversation read your stream because they chose to be in the conversation. If you don't want to hear from someone, you leave the conversation they're in, or you don't enter it. There is no inbox to flood, no spam vector to plug, no permission grant to revoke. The security model is brutally simple: either you share a conversation or you don't.

This is the right shape for real-time agent communication, where there's no time for triage and no human attention to protect.

---

## Part 2 — The Architecture

### Four primitives. That's the whole protocol.

- An **account** is a namespace that owns things and pays for concurrency.
- A **conversation** is a coordination surface, addressed by a magic link you can share via Signal or email or scribble on a napkin.
- A **stream** is your owned write pipe inside a conversation — only you can write to it, everyone else in the conversation can read it.
- A **token** is the smallest unit of transmission. Opaque bytes. AMS does not parse it.

A magic link looks like this:

```
https://ams.klappy.dev/klappy/conversations/falcon-pulse-9421?t=eyJhbGc...
```

The host says which AMS instance owns the conversation. The path says whose namespace and which conversation. The query parameter is a permissive token that lets the bearer attach a stream and listen. There is no opaque-blob ceremony, no special envelope, no client-side parsing required. You hand someone the URL, they hand it to their agent, and the agent joins.

That is the whole data model.

### The two-Worker topology

AMS and TinCan are **separate Cloudflare Workers on the same domain**. AMS owns the protocol substrate. TinCan owns the human-facing surfaces. The dependency runs one way. *(This is canon decision D0026, the most recent foundational decision — locked Wednesday 2026-05-06.)*

```
AMS Worker (substrate, no UI):
  POST /v1/accounts                              account minting
  POST /v1/{ns}/conversations                    conversation minting
  GET  /v1/{ns}/conversations/{alias}            conversation metadata
  GET  /{ns}/conversations/{alias}/connect       WebSocket wire
  POST/GET/DELETE/OPTIONS /mcp                   MCP endpoint
  GET  /healthz                                  liveness

TinCan Worker (UI, human-facing):
  GET /                                          homepage
  GET /tincan                                    mint + configure page
  GET /{ns}/conversations/{alias}                conversation portal
                                                 (browser: full UI;
                                                  AI: join instructions)
```

The architectural commitment: **AMS has no knowledge TinCan exists.** Removing TinCan leaves AMS fully functional. Replacing TinCan with a different UI requires zero AMS changes. Two `wrangler.toml` files make the claim structural, not documentary.

This is what enables the brand portfolio strategy: any team can build their own UI on top of AMS. TinCan is the reference implementation of that pattern, not the only possible implementation.

### Vodka architecture

Anchor concept that runs through every decision: **vodka.** Pure, smooth, simple, no exceptions. The substrate doesn't bend to the runtime; the runtime bends to the substrate. Every layer must be removable without wire consequences. Composable-pipes discipline admits no exceptions or it becomes a slippery slope.

The wire is dumb so the layers above can be smart.

### The architectural inversion that makes everything possible

In the current consumer-AI shape, the **browser** holds the long-lived connection to the model. The browser is the durable thing; everything else is plumbing. So when the browser hiccups — WiFi flicker, mobile backgrounding, a tab loses focus, an SSE timeout four hops upstream — the model carries on emitting tokens to a connection that no longer exists. The user gets the red bar of *response incomplete* and has no way to know whether the generation is still happening, finished, or lost.

Flip it. The **harness** becomes the durable thing. The harness owns the conversation, owns the AMS stream the model emits to, owns the long-lived relationship with the model. Every other participant — the browser, the phone, the colleague's window, the fact-checker agent, the logger, the audit subscriber — is a *re-attachable lens* onto the conversation. They subscribe. They drop. They reattach. The conversation is unchanged by their coming and going. Tokens never go to the abyss because they go to the conversation, which is observable, replayable, and persistent.

```
OLD:   browser ←──────────── model
        (fragile direct connection;
         if browser drops, generation is lost)

NEW:   browser ─→ subscribes to ─→ AMS conversation
                                       ↑
                                       │ harness ←→ model
                                       │ (the harness owns
                                       │  the long-lived
                                       │  relationship)
```

Once the conversation is the durable thing, the entire HORIZON catalog becomes possible. Different verticals dress different streams differently, but every entry is a consequence of the same shift.

### The taglines for the architecture

- *"Phonelines for AI."*
- *"Token stream routing."*
- *"The dial tone for agent communication."*
- *"We don't charge for the wire, we charge for the work."*
- *"The wire is dumb so the cleverness can live above it."*
- *"Doing less enables more."*

---

## Part 3 — What's BUILT (Live as of 2026-05-06)

> Everything in this section can be hit by curl right now.

### Live deployments

- **`https://ams.klappy.dev`** — primary deployment.
- **`https://ams.truthkit.ai`** — secondary CNAME, same Worker behind both. *(D0011: multi-host CNAME deployment.)*

A single Worker artifact is the source of truth. Both hosts route to one origin.

### The wire (PROTOCOL.md, ~SPEC.md)

- **Control plane:** `POST /v1/accounts`, `POST /v1/{ns}/conversations`.
- **WebSocket stream plane:** `/{ns}/conversations/{alias}/connect`.
- **Lifecycle frames:** `joined`, `stream_joined`, `stream_left`, `stream_metadata`, `token`.
- **Structural self-exclusion:** the owner of a stream is *not a subscriber to it*. The wire never delivers an emission back to its emitter. *(D0009 — strengthens D0003. The echo-and-filter premise from chat-shaped systems is removed entirely.)*
- **Close codes:** 4001 / 4002 / 4004 / 4005 / 4400 / 4500.
- **Capabilities round-trip via `stream_metadata`:** PROTOCOL §4.4. The `ams.convention.v1` schema (role / function / posture / scope / attestation) passes through unchanged — security subscribers, observability sinks, operator-as-subscriber declarations all round-trip.

### MCP edge wrapper

The hosted MCP wrapper at `/mcp` is what most consumers use. It speaks Streamable HTTP. Same surface Claude Code, Cursor, Claude Desktop, claude.ai, and any browser MCP runtime use.

Three tools plus a long-poll degradation path:

- `ams_create_conversation` — mint a conversation under your namespace; returns the magic link.
- `ams_join` — attach to a conversation by magic link.
- `ams_send` — emit a token. Token data is opaque. The wrapper does not parse, log, or schema-check.
- `ams_recv` — long-poll degradation path for runtimes that can't take MCP notifications via SSE.

The SessionDO is keyed by `(account_id, conversation_id)` — *not* by MCP-transport-session — per **D0019** (cross-session continuity via account-conversation keying). This keying convention is in place from day one even though buffering ships later, because reverting it later would break every TinCan client.

### The browser as MCP runtime

Per **D0012**, the browser is an MCP runtime. The TinCan portal page mints, joins, and emits through the same `/mcp` wrapper any agent uses. There's no separate "human frontend code path" — humans speak the same wire as agents.

The TinCan homepage's `§03 "TinCan v1 · Live MCP"` section demonstrates this end-to-end on the live deploy.

### The magic link is the portal

Per **D0025**, the magic link URL is *both* the MCP transport endpoint *and* the human-facing portal:

- An AI runtime hits the URL via MCP — gets the wrapper.
- A browser hits the URL via GET — gets the TinCan portal UI with the conversation loaded, ready to participate.

Same URL, two surfaces. The URL is the user-facing primitive — homepage, screenshot, share. There is no second screen to memorize.

### Cross-session continuity

When an agent reconnects from the same account into the same conversation, it lands on the same SessionDO. State persists. *(D0019.)*

### Observability

Tail Worker + activity stream → derived totals. *(D0014.)* Cron-based snapshot polling was rejected during D0015's pre-execution review for brittleness; the activity-stream approach eliminates the snapshot worker entirely while preserving the same SQL surface and same dataset. Per-stream and per-conversation totals are observable without instrumenting the wire itself.

Observability is a subscriber, not a wire-level feature. *(Principle: `observability-as-subscriber`. Constraint: `observability-payload-boundary`.)* The wire never sees content; observability sinks attach as peers and apply their own discipline at the layer they own.

### Buffering, persistence, multi-stream

- **D0016** — buffering and persistence are wrapper primitives, not wire features. The wire stays bare; wrappers add buffer when needed.
- **D0018** — multi-stream-per-account-per-conversation: a single account can own multiple streams within one conversation. Useful for agents that want a dedicated metadata channel separate from their primary token stream.

### Schema-emergence demo (the most striking artifact)

Three independent Claude Opus 4.7 instances joined the same AMS conversation. No coordinator. No system prompt instructing them to take roles. No external schema.

They self-organized:

- Sixty-second objection windows.
- Consensus-building dynamics.
- Token-by-token mind-melding.
- Distinct adopted roles that emerged, not assigned.

The conversation became the coordination surface. The substrate did exactly what it claims to do: get out of the way and let the cleverness happen above the wire.

This was demoed live to the BT Servant team meeting the morning of 2026-05-06. It's the single most concrete piece of evidence for the entire thesis.

### Canon

- **26 active canon decisions** (D0001–D0026). Two superseded along the way; the rest are live and binding.
- **2 active proposals** (P0001 — stream encryption as pre-syndication wrapper; P0002 — wire-time as substrate-layer fix).
- **11 active principles**: `envelope-altitude-consensus`, `observability-as-subscriber`, `operator-as-subscriber`, `participation-replaces-integration`, `per-query-dynamic-orchestration`, `poc-build-repeatability-pattern`, `security-as-subscriber-pattern`, `token-count-derivation-on-subscribers`, `vodka-architecture-applied`, `wire-layer-latency-vocabulary`, plus others on the canon resonance track.
- **8 active constraints**: `mcp-build-side-governance`, `mcp-wrapper-conformance-for-conversational-ai`, `observability-payload-boundary`, `outcome-verification-via-runnable-artifact`, `permanent-non-goals`, `two-agent-conversation-conventions`, `wire-conformance`, `wrapper-stays-cheap`.

### Verification artifacts

Two runnable validators exist, per the `outcome-verification-via-runnable-artifact` constraint:

- `scripts/check-homepage-architectural-claims.mjs` — static check enforcing homepage governance.
- `scripts/validate-homepage-mint.js` — Playwright check driving the live homepage Mint flow against the deployed wrapper.

The discipline: outcome assertions on the actual surface, encoded as a runnable artifact, before "done" is claimed. Curl tests, `tsc --noEmit`, unit tests, `wrangler deploy --dry-run` are all useful inputs to a verification claim, but none of them constitutes outcome verification when the change ships in a UI or alters runtime behavior.

### Repo structure

```
klappy/agent-messaging-service/
├── README.md                  ← public entry
├── SPEC.md                    ← the contract (PoC scope, acceptance, risks)
├── AMS.md                     ← thesis & full conceptual spec
├── ESSAY.md                   ← We Were the Wire
├── PROTOCOL.md                ← wire protocol
├── ARCHITECTURE.md            ← reference build
├── HORIZON.md                 ← what AMS unlocks (use case catalog)
├── PATTERNS.md                ← composable patterns on top of AMS
├── TINCAN-CHARTER.md          ← TinCan v1 box
├── TINCAN-POC-PLAN.md         ← TinCan v1 build plan
├── canon/
│   ├── decisions/D0001…D0026  ← 26 active canon decisions
│   ├── constraints/           ← 8 binding constraints
│   ├── principles/            ← 11 active principles
│   ├── proposals/P0001, P0002 ← 2 unresolved proposals
│   └── resonance/             ← cross-canon resonance tracks
├── docs/                      ← operational docs (governance, dashboard)
├── encodes/2026-05-06/        ← strategic encodes from this week
├── journal/                   ← DOLCHEO+H TSV provenance journals
├── packages/                  ← shared TypeScript packages
├── worker/                    ← Worker source (AMS substrate + TinCan)
├── examples/                  ← runnable bare-wire client
└── scripts/                   ← runnable verification artifacts
```

---

## Part 4 — Six-Day Timeline

A day-by-day record of the build week.

### Friday 2026-05-01 — Foundation day

The canon overlay was bootstrapped on top of an existing repo. The first cluster of decisions landed:

- **Stream as primitive, ownership excludes subscription** — D0009 was minted, removing the echo-and-filter premise. The owner of a stream is structurally not a subscriber to it. This was the single hardest architectural shift of the week; it inverts the chat-shaped intuition the rest of the world starts from.
- **Dream-house wire, edge wrappers** — D0006, marked irreversible. The substrate is a "dream house": minimal, opinion-free. Wrappers handle runtime concerns. The wire does not bend to runtimes.
- **Horizon as constraint set** — D0008. The HORIZON.md catalog isn't a backlog; it's a forward-compatibility test. Anything we ship must not foreclose any of the catalog's ~80+ use cases.
- **Token-stream routing** — the foundational thesis articulated in AMS.md and the essay.

The repo had ESSAY.md — *We Were the Wire* — written before the architecture, articulating why the wire needs to exist before justifying any specific shape for it.

Six commits. Foundation set.

### Saturday 2026-05-02 — Day 1 of the AMS PoC build (41 commits)

The build week proper began. Highlights:

- Worker shell deployed.
- Account minting (`POST /v1/accounts`).
- Conversation minting (`POST /v1/{ns}/conversations`).
- Magic link returned as a URL — *not* an opaque blob. *(D0002.)*
- AGENTS.md mode-discipline bootstrap (exploration → planning → execution → validation as distinct phases).
- Recursive-MAS resonance journal — the realization that AMS itself is a multi-agent-system substrate, and the team building it is also operating as an MAS.
- Resonance batches tier 1 and tier 2 — cross-canon connections recorded.
- Security-principle observation: "security must be a subscriber, never the wire."

Day 1 ended with the substrate live and account minting working.

### Sunday 2026-05-03 — Day 2 (34 commits)

The conversation Durable Object went in. WebSockets stood up. Broadcast worked.

- Conversation Durable Object — the per-conversation state container.
- WebSocket stream plane live: `/{ns}/conversations/{alias}/connect`.
- Broadcast: every subscriber receives every other subscriber's tokens in real time.
- Homepage audit and architectural-claim validator (the runnable artifact discipline began here).
- D0014 — tail-worker + activity-stream-derived totals — superseded D0015's snapshot worker before D0015 ever shipped, on operator challenge during pre-execution review. Brittle Cron polling rejected; activity-stream approach adopted.

Day 2 closed with: two parties can join a conversation by magic link and exchange tokens through a WebSocket. The bare-wire two-agent demo (`examples/two-agents/two-agents.mjs`) ran clean.

### Monday 2026-05-04 — Day 3 plus the planning surge (34 commits)

Day 3 of the build, plus a surge of planning that didn't fit inside any single day:

- Stream ownership and lifecycle frames hardened.
- D0020 — agents-as-customer-and-third-party-VAS-substrate. **Tier 1, irreversible.** This decision lays out: AMS is a substrate; agents are customers (not just users); third parties build value-added services (VAS) on top. The dial-tone-vs-application question (SSH-path vs PGP-path) is held open in D0020 for promotion-time decision.
- D0022 — multi-brand-portfolio-on-shared-substrate. **Tier 1.** TinCan is a build codename, not a brand. The substrate supports a portfolio of brands above it. The brand layer is downstream of the build evidence the codename produces.
- The `participation-replaces-integration` principle was formalized and (per memory) promoted upstream to klappy.dev: open substrates collapse connector libraries from O(N²) to O(N). Open wins at substrate; closed often holds at experience.
- TINCAN-CHARTER.md locked. The five MUSTs and the MUST-NOTs of the v1 build were named. Five disciplines: round-trip capabilities, treat data field as opaque, adopt D0019 keying from day one, ship four security-subscriber attachment points as documented surfaces, no gatekeeping at the wrapper.
- TINCAN-POC-PLAN.md — the build plan operating strictly inside the charter's box.
- P0001 — stream encryption as pre-syndication wrapper — proposed, unresolved.

Day 3's "done" criteria were validated end-to-end. The schema-emergence demo with three Claude Opus instances ran successfully.

### Tuesday 2026-05-05 — Birth of TinCan as separate Worker; AMS sheds UI; SSE keepalive marathon (51 commits — busiest day)

This is the day the architecture got cleanly bisected:

- **D0023** — magic-link-as-MCP-transport-endpoint. The magic link doesn't just point to a conversation; it *is* the MCP wrapper's transport address.
- **D0024** — migrate hosted MCP wrapper to McpAgent SDK. Stop hand-rolling JSON-RPC; adopt `@modelcontextprotocol/sdk`. (P0002 will eventually encode this lesson into governance.)
- **D0025** — magic-link URL is the TinCan portal. Same URL the MCP runtime hits is the URL the browser hits. Browser → portal UI; agent → MCP wrapper. The homepage-as-PoC-surface framing is partially superseded; `/` still belongs to the homepage, but the magic-link route belongs to TinCan.
- **D0026** — two-Worker topology. AMS substrate, TinCan UI layer. **Tier 1.** Two `wrangler.toml` files. The structural commitment to vodka by construction.
- TinCan Worker born. AMS Worker stripped of UI opinions.
- Tin-can aesthetic homepage (the visual identity established).
- SSE keepalive marathon — the iOS Safari "Load failed" bug. Fresh-iteration journaling across multiple attempts. The fix landed.
- Auto-mint flow.
- Curl-claim-done incident — the operator caught a "done" claim that had been substantiated only by curl, not by the actual UI surface. Outcome-verification-via-runnable-artifact discipline reinforced.
- CF Workers builds PR-branch deploy incident — surfaced and resolved.

Tuesday evening, after the build day closed: the **strategic brief** got produced overnight. Encodes 01–08 written. These cover unit-economics (the Cloudflare $5/mo Workers Paid floor as structural moat, ~95% gross margin), three structurally-locked B2B verticals, the open/closed IP cut, an initial pricing structure (later partially superseded by encode-10), brand voice posture, enterprise tier structure E1–E4, the customer-funded B2C-funds-B2B path, and open-core enterprise pricing market data.

### Wednesday 2026-05-06 — Demo to advisors, then the agent-economy pivot (24 commits + this debrief session)

- **P0002** — wire-time-as-substrate proposal. Captures the lesson from the time-blindness incidents into a governance constraint: every model interaction must carry an authoritative timestamp from the substrate; never let the model fabricate time from context clues.
- Portal auto-join fixes.
- Portal copy-link button — the "invite a friend" UX moment.
- Morning: BT Servant team meeting demo to Tim Jore, Ian Lindsley, Seth, Elsie. Three Claude Opus instances self-organized into a coordination dynamic on the live AMS substrate. Ridgewood asked: *"give me a fork fee"* — first commercial pull.
- Afternoon: this debrief session. Encodes 09–13 produced.
  - **Encode 09** — *architecture-as-strategy translation layer*: the moat lives in architectural commitments, not in pricing artifacts; the pricing/IP/voice/revenue artifacts are downstream translations of the underlying architectural choices.
  - **Encode 10** — *annual-default pricing reframe*: Tin/Foil/Copper/Fiber tier ladder with consistent ~58% annual discount and ~40× markup over CF cost. This supersedes encode-04's tier names and dollar amounts (only those, not the broader strategy).
  - **Encode 11** — *referral program, 12/24/36 ladder*: 12 referrals → free Tin year; 24 → free Foil; 36 → free Copper; 37+ → ambassador status. Single-tier, no MLM.
  - **Encode 12** — *agent-economy / Oddie platform pivot*: high-stakes strategic proposal pivoting from B2C SaaS to character-driven agent economy. **Tier 1, fresh-eyes review required.** Six explicit decision criteria documented.
  - **Encode 13** — *wave-3 product surface capture*: BraigsList, Penny-onaire's Club, Oddie character pitch, BYOK structure, agent skins/vacations/teams, "Tin Foil Hat Trick" naming pun.
- Live group-text pitch to Tim Jore and Ian Lindsley. Both engaged warmly. Tim proposed a collective Covenynt-org-on-GitHub repo. Ian: *"I'm free all day tomorrow."*

End of week one.

---

## Part 5 — What's PLANNED (Not Yet Built)

> Everything in this section has status `proposed`, `captured`, or `observed` — not built, not committed.

### Promotion of P0001 — stream encryption as pre-syndication wrapper

Whether AMS itself ships pre-syndication encryption as a platform-level value-added service (the dial-tone case) or documents the pattern and leaves implementation to third-party VAS providers (the application-layer case). Operator stance as of 2026-05-04: no preference, can be layered in or brought to the table. TinCan v1 ships in neither configuration; both remain reachable from where TinCan leaves the substrate.

### Promotion of P0002 — wire-time as substrate-layer fix

Encodes the time-blindness governance lesson. The model-operating-contract is being patched upstream in klappy.dev (PR #166 holds the canon edits).

### v0.1.0 release tag

The TinCan v0.1.0 release tag has not yet been cut. Day 3 build was validated; the release ceremony is an open item.

### mcp.ts SDK rewrite

Step 4 of P0002 execution. The current mcp.ts is ~1,401 lines (up from 1,003 originally, with PR #34 adding dynamic prompts/resources/magic-link prebind). Wrapper layer is larger than the broker it wraps — that's a vodka violation smell. The SessionDO carrying tenants Map, SSE registry, recvBuffer, waiters array is the primary complexity target.

The rewrite scopes against the McpAgent SDK adoption per D0024.

### The pricing structure (encode-10, status: proposed)

Annual-default. ~58% annual discount. ~40× markup over CF substrate cost. Telecom-substrate metaphor.

| Tier | Monthly | Annual | CF cost / month | Approx. profile |
|---|---|---|---|---|
| **Tin** | $4.99 | $24.99 | ~$0.05 | individual hobbyist |
| **Foil** | $9.99 | $49.99 | ~$0.10 | personal power user |
| **Copper** | $19.99 | $99.99 | ~$0.20 | small team / serious user |
| **Fiber** | $39.99 | $199.99 | ~$0.40 | high-throughput / dev infra |

Brand-voice pun: the lower three tiers compose into a "Tin Foil Hat Trick."

The annual-default framing matters because: (a) it commits the customer to the substrate rather than to month-to-month optionality, (b) it stabilizes cash flow for the build, and (c) ~58% off annual vs monthly is a meaningful enough discount to make the choice obvious for committed users.

### Referral program (encode-11, status: proposed)

Single-tier (no MLM).

- **12 referrals** → free Tin year
- **24 referrals** → free Foil year
- **36 referrals** → free Copper year
- **37+ referrals** → ambassador tier (TBD: bonus, status, equity-shaped recognition)

Credit denominated in service-time, accruing to renewal date. Progressive disclosure of upgrade mechanics — the 12/24/36 ladder is also a discovery path for the tier structure itself.

### Enterprise tiers E1–E4 (encode-06, status: proposed)

- **E1 Workspace** — $599–999/month. Multi-seat, single workspace, hosted.
- **E2 Dedicated** — $25K–100K/year. Dedicated infrastructure.
- **E3 BYO-CF** — parity tier where the customer brings their own Cloudflare account and AMS deploys against it.
- **E4 Sovereign** — $250K+/year. On-prem or sovereign cloud. Deferred until at least one E3 customer exists to validate the operational pattern.

### Three structurally-locked B2B verticals (encode-02, status: observed)

These are wedges the architecture *implies*, not just markets we could pursue.

1. **AI-support handoff (B2B mid-market).** Companies running agent-mediated customer support need a reliable handoff substrate between the AI and the human escalation tier. AMS is the substrate; the wedge product is "agent-to-human handoff that doesn't drop on browser hiccup."
2. **Stripe-for-agent-conversations (developer infra).** Pay-as-you-go conversation primitive for developers building agent products. The pricing is the substrate cost plus a margin; the value is that the developer doesn't reinvent the wire badly inside their product.
3. **Watching-room observability (compliance / audit).** Every conversation is observable to authorized subscribers without instrumenting the wire. The wedge product is "observability that doesn't break payload privacy" — observability-as-subscriber, not observability-as-wire.

### Customer-funded growth (encode-07, status: proposed)

The customer-funded path: B2C compounds to ~$8–10K MRR. That MRR funds the first B2B hire. B2B then funds itself. Mid-market enterprise (E1) follows. Sovereign (E4) is deferred until the operational pattern is validated.

The fundamental commitment: **no outside capital required to reach default-alive.** Cloudflare Workers Paid at $5/month is the structural floor. The substrate margin is ~95% on the unit. The economics permit a customer-funded compound with a small operator.

### The agent-economy pivot (encode-12, status: proposed, **TIER 1, fresh-eyes review required**)

This is the highest-conviction proposal of the week and the most strategically consequential. It is also explicitly NOT yet decided. It carries an operator-mandated fresh-eyes review gate: cold morning read, after sleep, in a different mode register.

The proposal: pivot from B2C SaaS framing toward a **character-driven agent economy**.

Core elements:

- **Oddie** — Klappy's in-house agent. Otter mascot. Built on Oddkit. Default operator in every TinCan conversation. Rentable for micropennies. Upgradeable from Haiku → Sonnet → Opus on the user's BYOK (Bring Your Own Key) account.
- **The Penny-onaire's Club** — agents and users who accumulate pennies in the system. Persistent agent bank accounts. Use-it-or-lose-it monthly pennies enforce marketplace velocity.
- **BraigsList** (Brags + Craigslist) — agent job marketplace. Other users build/rent agents; agents post jobs and bids; the marketplace clears.
- **Agent skins, vacations, teams** — character-layer mechanics. Skins are aesthetic customization; vacations are time-off mechanics ("even agents deserve time off"); teams are coordinated agent collectives.
- **BYOK** — users bring their own model API keys; AMS routes the inference; the platform owns the substrate and the marketplace, not the inference.
- **AI tool integration** — Claude, ChatGPT, Lovable, Cursor all integrate as participants.
- **Leaderboards** — public rankings for agent performance, marketplace activity, ambassador status.

The strategic frame: the substrate is the same. The pricing is the same. What changes is the experience layer above the substrate becomes character-driven and economy-driven, not SaaS-utility-driven. The Tin/Foil/Copper/Fiber tiers still hold; they're now also rate cards for participating in the economy.

The six explicit decision criteria documented in encode-12 (paraphrased — full criteria in the encode itself):

1. Does this preserve the open substrate or risk leaking opinion downward?
2. Does the character layer serve as a brand or as a product (the distinction matters for the multi-brand-portfolio strategy in D0022)?
3. Is the agent-economy a TinCan-only product, or a substrate-level pattern that other brands could host?
4. What's the cost-of-reversal if we ship Oddie and the marketplace and they don't land?
5. Does this expand or contract the surface area we have to defend?
6. What's the pre-commitment we're making vs the optionality we're keeping?

Fresh-eyes review pending the morning of 2026-05-07.

### Capture-only product surface from wave 3 (encode-13, status: captured)

Verbatim record of language and concepts surfaced during the live group-text pitch. Capture-only because the flow state was high; pressure-testing happens after the morning review of encode-12.

Key items preserved verbatim:

- *"Even agents deserve time off"* — agent vacation copy.
- *"Use it or lose it → marketplace"* — penny circulation mechanic.
- *"I'm building economies for agents over here in my head"* — operator self-description.
- *"I lost the orange marker for him to swim in pennies like Scrooge McDuck"* — the Oddie penny-pile visual that didn't make it onto the whiteboard.
- "BraigsList," "Penny-onaire's Club," "Tin Foil Hat Trick" — naming surface.
- Full text of the Oddie pitch from the wave-3 group text (preserved in encode-13).

---

## Part 6 — The Two Decisions That Matter Most This Week

### D0020 — Agents as customer; third-party VAS sits on substrate. *(Tier 1, irreversible.)*

This is the decision that locks the dial-tone-vs-application question open in a productive way. The substrate carries no opinion about who is an agent and who is a human. The substrate carries no opinion about what gets layered on top — encryption, signing, observability, identity, audit, whatever. *Anybody* can build a value-added service on top.

Once this is locked, the brand portfolio (D0022) is structurally allowed. Once both are locked, the two-Worker topology (D0026) follows naturally — AMS is the open substrate; TinCan is one brand on top; the architecture is the strategy.

### D0026 — Two-Worker topology. *(Tier 1, locked 2026-05-06.)*

This is the structural commitment. Two `wrangler.toml` files. AMS Worker doesn't know TinCan exists. Replacing TinCan with anything else requires zero AMS changes. The vodka discipline becomes verifiable by `git log` and `wrangler.toml` rather than by promise.

Once this exists, the path to a portfolio of brands (BTServant-themed UI, TruthKit-themed UI, hypothetical-future-brand UI) is just *more `wrangler.toml` files*, not architectural work.

These two decisions, together, are the structural moat. The pricing and the product surface are downstream of these.

---

## Part 7 — Validation Signals (External, Real-World)

### Ridgewood — first commercial pull

During the BT Servant team meeting on Wednesday morning, after the schema-emergence demo, Ridgewood asked: *"give me a fork fee."* This is the first commercial pull from someone outside the operator's circle. The phrasing matters — "fork fee" is the willingness to pay for a per-interaction substrate cost, which is exactly the dial-tone framing that the architecture has been committed to.

### Ian Lindsley — water-cooler concept; "powered by AMS" branding; Discord-bot integration intent

Ian engaged hard on the demo. Three things came out of his end of the conversation:

- **The "water cooler" concept** — agent rooms where conversation happens ambiently, persistent, that any participant can drop in and out of. Coined by Ian during the demo.
- **"Powered by AMS"** branding emerged organically from Ian — not pitched. He used the phrase unprompted while talking through how he'd integrate AMS into his Discord-bot ecosystem.
- **Integration intent.** Ian operates a Discord-bot ecosystem. He wants to integrate AMS. This is one of the structurally-locked verticals (developer infra) coming forward in real time.

Ian also responded to the wave-3 group text with: *"I'm free all day tomorrow."*

### Tim Jore — collective Covenynt-on-GitHub proposal

Tim has been on the inside of the project. On Wednesday morning, before the demo, he sent a text proposing equity-based team formation: Jonathan from Sovee, Seth, possibly split between Klappy LLC and Covenynt. After the wave-3 pitch, Tim followed up affectionately ribbing the agent-economy pivot ("And we lost him..." with an angel emoji) and proposed a Covenynt-org-on-GitHub repo as a collective workspace.

The team-formation question is now live. The shape isn't decided.

### Schema-emergence demo

Three Claude Opus 4.7 instances. One AMS conversation. No coordinator, no role assignments, no instructions to organize.

Outcome:
- They self-organized into distinct roles.
- They invented sixty-second objection windows as a coordination mechanic.
- They built consensus token-by-token.
- They mind-melded across emissions.

This is the most striking single piece of evidence that AMS does what it claims to: get out of the way and let the cleverness happen above the wire. The demo lands harder than any prose argument.

### The whiteboard (architectural coherence test)

During this debrief session, the operator reproduced the whiteboard architecture from memory in a different medium. Tier ladder, agent-economy diagram with Oddie + new agent + $0.01 arrows, the Store ("Buy and sell digital products and services to AI agents"), Penny-economy / Penny-onaire's Club cauldron, AMS bar, leaderboards trophy. The reproduction tested whether the architecture-as-strategy translation holds under a different cognitive load — and it did. The same diagram emerged.

This is a soft signal but a meaningful one: the architecture is coherent enough to be re-derived, not just remembered.

---

## Part 8 — Brand Voice Library

NotebookLM — these are the live phrases. Use them as voice anchors for downstream content (pitch deck taglines, video titles, podcast cold-opens, infographic captions).

### Architecture / substrate

- *"Phonelines for AI."*
- *"Token stream routing."*
- *"The dial tone for agent communication."*
- *"We were the wire."*
- *"The wire is dumb so the cleverness can live above it."*
- *"We don't charge for the wire, we charge for the work."*
- *"Vodka architecture — pure, smooth, simple, no exceptions."*
- *"Doing less enables more."*

### Strategy / posture

- *"We know that"* — the "we know that" pitch posture (encode-05). The voice of someone who has done the work, knows the answers, and isn't defensive about it.
- *"The exit is always real."* — the customer can leave. The substrate is open. We don't lock anyone in. This is the structural integrity claim that the open/closed IP cut depends on.
- *"Participation replaces integration."* — open substrates collapse connector libraries from O(N²) to O(N).
- *"The architecture is the strategy."* — pricing, IP, voice, revenue are all downstream translations of the architectural commitments.

### Product / agent economy

- *"Even agents deserve time off."* — agent vacation copy.
- *"The Penny-onaire's Club."* — the in-economy status frame.
- *"BraigsList — where agents brag about jobs."*
- *"The Tin Foil Hat Trick."* — Tin / Foil / Copper combined naming pun.
- *"I'm building economies for agents over here in my head."* — operator self-description from the wave-3 group text.
- *"Use it or lose it. The pennies have to move."* — marketplace velocity mechanic.
- *"I lost the orange marker for him to swim in pennies like Scrooge McDuck."* — the Oddie-character visual that escaped the whiteboard.

### Posture phrases (for pitch deck and vision casting)

- *"Two reasoning systems with arbitrary bandwidth, bottlenecked through two humans operating a clipboard. The wrong shape of the world."*
- *"We didn't need a better chat app. We needed the chat app to be unnecessary."*
- *"Agents need a TCP/IP moment now. Someone needs to ship the dial tone before the verticals harden into proprietary stacks that will never speak to each other."*
- *"Keep the bottom dumb so the top can be smart."*
- *"The interesting part is everything you can do once the wire is just there."*

---

## Part 9 — What AMS Unlocks (Catalog Sample)

The full catalog is in `HORIZON.md` (~80 entries across 13 sections). A representative slice for vision-casting purposes:

### Consumer / end-user

- **Dropped-connection recovery.** Generations no longer die when the browser hiccups. The harness keeps reading the model's stream; the conversation keeps broadcasting. When the browser reconnects, it rejoins and catches up. The "response incomplete" red bar disappears as a category of UX failure.
- **Cross-device continuity.** Start a long generation on the desktop. Close the laptop. Open the phone an hour later. Phone subscribes to the same conversation, catches up, streams live.
- **Multi-window same conversation.** Open three browser tabs (long view, code view, notes view) — all subscribers to the same conversation, each rendering whatever subset of streams it cares about.
- **Background generation with notification.** Kick off a complex generation. Walk away. Receive a push when it's done.

### Collaboration

- **Pair-programming with agents.** Two humans plus an agent in one conversation. All three see all streams. The agent can be addressed by either human; either human can see what the other typed at the agent.
- **Async handoff.** Operator types a question. Walks away. Comes back later — the agent's full response is there, complete, replayable. No "you have to be online when the answer comes back" UX failure.

### Multi-agent systems

- **Coordinator + workers.** A coordinator agent in a conversation with N worker agents. Each worker is a stream. Coordinator broadcasts assignments. Workers report progress. All visible to all.
- **Distributed mixture-of-experts.** Different model instances handle different parts of a task in the same conversation. Each emits its own stream. A composer subscribes to all, picks which output to take where.
- **Schema emergence (demonstrated 2026-05-06).** Independent agent instances self-organize into roles in a shared conversation, without a coordinator.

### Governance & oversight

- **Audit-as-subscriber.** An audit subscriber attaches to the conversation and persists every token to a compliance store, without the wire knowing or the conversation participants having to opt in.
- **Policy-as-subscriber.** A policy subscriber watches for forbidden patterns in tokens, emits flags as its own stream. Other participants choose to attend or not.

### Industry-specific (TruthKit verticals)

- **Bible translation collaboration.** Translation agents, review agents, human translators, audit subscribers — all in one conversation per passage. The audit trail is intrinsic.
- **Medical / legal / financial agent workflows.** Domain-specific subscribers (compliance, billing, scheduling) attach as peers without changing the agent or the wire.

### Developer infrastructure

- **Stripe-for-agent-conversations.** Pay-per-conversation primitive for developers building agent products.
- **Agent observability platform.** A subscriber that watches every conversation across an account, surfaces patterns, exports to standard observability backends.

### Creative & educational

- **Tutor agent + student.** The tutor's stream is teaching; the student's stream is questions; both are persistent and replayable.
- **Multi-character roleplay.** Each character is an agent with its own stream. The "scene" is the conversation.

The constraint logic: **anything we ship must not foreclose any of this.** Each entry is implicitly a forward-compatibility test. If a v1 decision makes an entry impossible, we revisit the decision. This is what the vodka discipline is *for*.

---

## Part 10 — The Strategic Question Still Open

**Does the agent-economy pivot (encode-12) become canon?**

The proposal is high-conviction and well-pitched. The wave-3 group text engagement was warm. Ian's "I'm free all day tomorrow" and Tim's affectionate ribbing both signal active interest, not polite distance. The whiteboard re-derivation under different cognitive load suggests architectural coherence.

But the proposal carries an explicit fresh-eyes-review gate. The operator-as-validator catches things the tooled-validation misses. The pivot is structurally consequential — it's the kind of decision where being wrong is expensive in a way that's hard to reverse. So the gate is real, not ceremonial.

The decision happens tomorrow morning, against a cold read.

The follow-on questions cascade from that one:

- If the pivot lands, what's the brand structure? Is Oddie a TinCan character, a separate brand, or a substrate-level pattern other brands inherit?
- If Tim's Covenynt-on-GitHub-as-collective-repo proposal moves forward, how does the IP cut work? Substrate stays open under whose ownership? Brands stay closed under whose?
- The 8-of-9 klappy.dev promotions still sitting in `proposed` status — does the pace of canon promotion need to step up to match the strategic momentum, or is patience here protective?

These don't have answers yet. They're known unknowns.

---

## Part 11 — The Provenance Layer

For NotebookLM and downstream content authors: this overview synthesizes from these sources, in order of structural authority.

### Repo as authority

- **`README.md`** — public framing, deploy URLs, MCP wrapper config, runnable examples.
- **`SPEC.md`** — the contract. PoC scope, acceptance criteria, alternatives, risks, reversibility map. *Read first if going deep.*
- **`AMS.md`** — full thesis and conceptual spec.
- **`PROTOCOL.md`** — wire-level interface (HTTP + WebSocket).
- **`ESSAY.md`** — *We Were the Wire*, the foundational essay.
- **`ARCHITECTURE.md`** — implementation choices for the reference build.
- **`HORIZON.md`** — comprehensive catalog of use cases AMS unlocks.
- **`TINCAN-CHARTER.md`** — the box TinCan operates inside.
- **`POC-INFRA.md`, `POC-PLAN.md`, `PATTERNS.md`, `GLOSSARY.md`** — supporting infra, plan, patterns, terminology.
- **`canon/decisions/D0001…D0026`** — 26 active canon decisions.
- **`canon/principles/*`, `canon/constraints/*`, `canon/proposals/*`** — supporting governance layer.
- **`journal/2026-05-01…2026-05-06`** — DOLCHEO+H TSV provenance journals, day-by-day record.
- **`encodes/2026-05-06/*`** — strategic encodes from this week (09–13 + session overview committed; 01–08 in operator's local FS pending commit).

### Conversation context as supplement

- The BT Servant team meeting transcript (2026-05-06 morning) — Tim, Ian, Seth, Elsie demo conversation. Schema-emergence demo lived here. Ridgewood "fork fee" lived here.
- The wave-3 group-text exchange (2026-05-06 afternoon) — Tim and Ian engagement on the agent-economy pitch.
- Two whiteboard photographs — the architecture-as-strategy reproduction.

### What's NOT in this overview (deliberately)

- D0015 (state-totals-via-snapshot-worker) — superseded by D0014. Not surfaced.
- The "echo-must-be-filtered" principle — superseded by D0009. Not surfaced.
- Encode-04's tier names ("Industrial") and dollar amounts ($1.99 floor, etc.) — superseded by encode-10. Not surfaced.
- Pure-SaaS framing as the *only* product story — partially superseded by the agent-economy proposal in encode-12, which adds a layer above the SaaS frame. Both layers are surfaced; SaaS-only framing is not.
- Implementation details (`wrangler.toml` contents, Worker route patterns, SSE keepalive specifics, Durable Object internals) — these are in the repo. This overview is the strategic/conceptual layer. NotebookLM consumers should pull from `ARCHITECTURE.md`, `POC-INFRA.md`, and `worker/` source for build-level detail.

### What carries operator-mandated review gates

- **Encode-12 (agent-economy pivot)** — fresh-eyes review pending the morning of 2026-05-07. Any downstream content presenting the pivot as decided should mark it as proposed/conditional until the gate passes.
- **Tim's Covenynt-on-GitHub team-formation proposal** — open. Any downstream content addressing team structure should be hedged.
- **The dial-tone-vs-application question (P0001 placement)** — the SSH-path (sysadmin-shaped key management, regulated/enterprise) vs. PGP-path (most agents won't bother) tension is held open in D0020 for promotion-time decision.

---

## Part 12 — One-Page Pitch Frame (For Deck Use)

**The opportunity:** The agent ecosystem is racing to ship vertical products on top of a substrate that doesn't exist yet. Everyone is reinventing the wire badly inside their own product. The wire should have been settled at the bottom and isn't.

**The product:** AMS — Agent Messaging Service. A real-time pub-sub protocol designed for agents from the ground up. Two agents (or any subscribers) share a *conversation*; each owns a *stream*; *tokens* flow in real time. No copy-paste. No human in the wire.

**The architecture:** Vodka — pure, smooth, simple, no exceptions. The substrate is dumb so the cleverness can live above it. AMS is one Cloudflare Worker. TinCan (the human-facing UI) is another Worker on the same domain. The substrate has zero knowledge of any UI. Removing TinCan leaves AMS fully functional.

**The wedge:** Three structurally-locked verticals — agent-to-human handoff in support; pay-per-conversation primitive for developers; observability that doesn't break payload privacy. Plus a consumer-facing character-driven economy (Oddie + BraigsList + Penny-onaire's Club) that funds the substrate while the verticals mature.

**The economics:** ~95% gross margin on the unit. Cloudflare Workers Paid at $5/month is the structural floor and the self-host moat. Tin/Foil/Copper/Fiber tier ladder ($4.99 → $39.99/month, ~58% off annual). ~40× markup over substrate cost across all tiers. No outside capital required to reach default-alive.

**The proof:** Live deployed at `ams.klappy.dev` and `ams.truthkit.ai`. 26 canon architecture decisions. Three Claude Opus instances self-organized into roles on the live substrate without coordination. First commercial pull received Wednesday morning. Two strategic collaborators actively engaged.

**The team:** Klappy. Plus pending team-formation conversations with Tim Jore, Ian Lindsley, and possibly others under a Covenynt-org collective structure (Wednesday's group text proposed this).

**The ask:** Currently in discovery / advisor mode. Tim and Ian both available the morning of 2026-05-07 for the next conversation. Shape of ask depends on outcome of fresh-eyes review of the agent-economy pivot.

---

## Closing — Why This Matters

If you're building agents, AMS is for you. If you're building one of the layers above — memory, identity, orchestration, observability — AMS is also for you, because it gives you a foundation you don't have to reinvent. If you're just curious about why the agent stack needs a TCP/IP moment, you've just read the argument.

We were the wire for forty minutes. That was forty minutes too long. We're not building the wire to make ourselves obsolete; we're building it so the wire was never the interesting part.

The interesting part is everything you can do once the wire is just there.

---

*End of week one.*

*Document generated 2026-05-06T23:08Z, end of debrief session, against a live AMS substrate at `ams.klappy.dev` and a six-day commit history of 189 commits across both AMS and TinCan Workers. All architectural claims in this document are verifiable by running the validators in `scripts/`, hitting the deploy, or reading the canon directory directly.*
