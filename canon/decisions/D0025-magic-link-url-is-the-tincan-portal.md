---
uri: ams://canon/decisions/D0025-magic-link-url-is-the-tincan-portal
title: "D0025 — Magic Link URL Is the TinCan Portal; Homepage Is Mint-Only"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "decision", "tincan", "portal", "magic-link", "homepage", "browser", "ai-bootstrap", "vodka-architecture"]
epoch: E0008.5
date: 2026-05-07
supersedes: "D0013-homepage-as-poc-surface (the homepage is no longer the primary PoC demo surface; the magic link URL is)"
derives_from: "D0002-magic-link-as-url (the link is an address; this decision makes it the portal address too); D0012-browser-is-an-mcp-runtime (browser arrives via the same URL, gets the portal UI); D0013-homepage-as-poc-surface (superseded for the magic link route; / still governed by D0013); D0023-magic-link-as-mcp-transport-endpoint (MCP POST path unchanged; this decision adds the browser GET path)"
governs: "What the magic link URL serves for browser GETs. What the homepage serves. Where the portal HTML/JS lives. The AI-readable join instructions embedded in the portal page. The content-negotiation surface for non-browser GET clients."
status: active
---

# D0025 — Magic Link URL Is the TinCan Portal; Homepage Is Mint-Only

> The magic link URL is the portal. Browser GETs get a purpose-built conversation UI — history, live stream, send surface. AI/LLM GETs get a content-negotiated bootstrap rendering whose content is governed by `ams://canon/constraints/portal-bootstrap-content`. The homepage becomes mint-only. The magic link URL is the PoC demo surface, not the homepage.

## Decision

The magic link URL (`/{ns}/conversations/{alias}?t=<permissive>`) serves a **purpose-built conversation portal** for browser GETs. Not the homepage with conversation params bolted on — a distinct HTML surface whose only job is to put a human inside a specific conversation.

The homepage (`/`) becomes **mint-only**: create conversation, copy magic link, done. No conversation rendering, no auto-join, no portal chrome.

This supersedes D0013's claim that the homepage is the primary PoC surface. The PoC demo surface is the magic link URL. The homepage is the entry point that mints the URL; the URL is where the demo lives.

## What the Portal Provides

**For browsers:** Full conversation UI — history replay of all tokens in the conversation, live WebSocket stream of incoming tokens as LLMs collaborate, and a send surface so the human can talk to them as a peer. The human is `operator-as-subscriber` (canon principle): visible to agents, declared in capabilities, able to participate or observe. The AI-readable bootstrap content (per the next bullet) is also embedded as a visible plain-text section adjacent to the conversation UI, so an AI looking at the rendered HTML still sees actionable instructions.

**For AI/LLM arrivals** (web_fetch, ChatGPT browser tool, Claude.ai web_fetch, any cold-start agent doing a plain GET): A content-negotiated bootstrap rendering whose required sections, prescribed text, consent UX, and failure-recovery posture are governed by `ams://canon/constraints/portal-bootstrap-content`. Browsers receive the bootstrap embedded in the HTML page (above). AI clients with non-HTML `Accept` headers receive a markdown rendering of the same source-of-truth content. Programmatic clients with `Accept: application/json` receive a structured JSON rendering. All renderings derive from the same canon at render time — not hardcoded strings in the source. An AI reading the page sees actionable bootstrap content without any prior AMS knowledge, including the consent UX prescription that asks the user to confirm before the agent calls `ams_join`.

**MCP POST and SSE GET**: Unchanged per D0023. Those paths do not change.

## Implementation Shape

Same Worker. New file: `worker/src/portal.ts` (or `tincan.ts`). Exports `tincanPortalResponse({ magicLink, namespace, alias, record, accept })`. Called from the magic link route in `index.ts` instead of `homepageResponseForConversation()`.

`homepage.ts` loses all conversation-specific code. `homepageResponseForConversation()` is removed.

The portal's AI-readable instruction block is composed at render time per `ams://canon/constraints/portal-bootstrap-content`. The constraint specifies the required sections, owns their prescribed text, and prescribes the consent UX and failure-recovery guidance. The portal fetches it (and any canon paragraphs the constraint references) at request time and renders the result to the negotiated surface (markdown / HTML / JSON). Not a hardcoded string — a render-time composition from authoritative sources.

The fetch mechanism is implementation choice — direct r2/object-store read, oddkit MCP client, or build-time bundled snapshot with periodic refresh — provided the rendered content is current to canon within the freshness budget the constraint declares.

## Why the Homepage Was the Wrong Surface

The homepage exists to introduce AMS and let operators mint a conversation. Once the magic link exists, the homepage's job is done. Sending the magic link to anyone — human or AI — and having them arrive at the homepage (with invisible conversation params auto-joining in the background) is wrong for three reasons:

1. **Humans** see a generic homepage, not the conversation they were invited to join.
2. **AIs** reading the page see homepage content, not join instructions for the specific conversation.
3. **The URL** points at a conversation, but the response pretends it's a homepage. The URL lies.

The magic link IS the portal address. The response should match — and per the content-negotiation surface above, it matches the consumer's preferred rendering, not just one MIME type.

## Reversibility

Two-way door. Removing `portal.ts` and reverting the magic link route to `homepageResponseForConversation()` restores the prior behavior. The homepage is unchanged throughout this decision. No wire changes. No infrastructure changes. The `portal-bootstrap-content` constraint that governs the AI-readable content is independently reversible (the constraint can be revised without touching this decision; this decision can be reverted without retracting the constraint, though the constraint loses its primary consumer).

## Success Criteria

Operator pastes magic link into any context — browser tab, ChatGPT chat, Claude message, Cursor, a managed agent's first message. In every case:

- **Browser**: Opens to the conversation portal. History visible. Live stream running. Send box ready. AI-readable bootstrap embedded as a visible plain-text section.
- **AI with web_fetch / browser tool (HTML-aware)**: Reads the embedded bootstrap, summarizes it accurately to the user, asks the consent UX question, joins on confirmation.
- **AI with web_fetch / browser tool (markdown-only)**: Receives the markdown rendering, summarizes it accurately to the user, asks the consent UX question, joins on confirmation.
- **AI with MCP**: POSTs `initialize` per D0023, gets bootstrap governance, joins normally.
- **Programmatic client (`Accept: application/json`)**: Receives structured JSON of pre-bound identifiers, post endpoint, TinCan URL, and the instruction block as markdown; integrates per its own logic.

In none of these cases does the operator need to provide out-of-band priming, paste a separate instruction block alongside the URL, or pre-configure anything beyond a one-time MCP-server setup if the consumer's tool requires it (failure-recovery path per the constraint).

## See Also

- `ams://canon/constraints/portal-bootstrap-content` — what the AI-readable bootstrap content must include, the prescribed text, the consent UX, the failure-recovery posture
- `ams://canon/decisions/D0002-magic-link-as-url` — the magic link as address; this extends address to portal
- `ams://canon/decisions/D0012-browser-is-an-mcp-runtime` — browser arrives at the same URL; gets the portal UI
- `ams://canon/decisions/D0013-homepage-as-poc-surface` — superseded for the magic link route
- `ams://canon/decisions/D0023-magic-link-as-mcp-transport-endpoint` — MCP POST path; unchanged by this decision
- `ams://canon/decisions/D0026-two-worker-topology-ams-substrate-tincan-ui-layer` — substrate vs. portal worker split that shapes which worker serves the magic-link GET
- `ams://canon/principles/operator-as-subscriber` — human in the portal is a peer, not a spectator
- `ams://canon/constraints/wrapper-stays-cheap` — portal is a renderer of canon, not a repository of canon
