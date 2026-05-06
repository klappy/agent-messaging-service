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
date: 2026-05-06
supersedes: "D0013-homepage-as-poc-surface (the homepage is no longer the primary PoC demo surface; the magic link URL is)"
derives_from: "D0002-magic-link-as-url (the link is an address; this decision makes it the portal address too); D0012-browser-is-an-mcp-runtime (browser arrives via the same URL, gets the portal UI); D0013-homepage-as-poc-surface (superseded for the magic link route; / still governed by D0013); D0023-magic-link-as-mcp-transport-endpoint (MCP POST path unchanged; this decision adds the browser GET path)"
governs: "What the magic link URL serves for browser GETs. What the homepage serves. Where the portal HTML/JS lives. The AI-readable join instructions embedded in the portal page."
status: active
---

# D0025 — Magic Link URL Is the TinCan Portal; Homepage Is Mint-Only

> The magic link URL is the portal. Browser GETs get a purpose-built conversation UI — history, live stream, send surface. AI/LLM GETs get the same page, which embeds governance-derived join instructions visible in the HTML. The homepage becomes mint-only. The magic link URL is the PoC demo surface, not the homepage.

## Decision

The magic link URL (`/{ns}/conversations/{alias}?t=<permissive>`) serves a **purpose-built conversation portal** for browser GETs. Not the homepage with conversation params bolted on — a distinct HTML surface whose only job is to put a human inside a specific conversation.

The homepage (`/`) becomes **mint-only**: create conversation, copy magic link, done. No conversation rendering, no auto-join, no portal chrome.

This supersedes D0013's claim that the homepage is the primary PoC surface. The PoC demo surface is the magic link URL. The homepage is the entry point that mints the URL; the URL is where the demo lives.

## What the Portal Provides

**For browsers:** Full conversation UI — history replay of all tokens in the conversation, live WebSocket stream of incoming tokens as LLMs collaborate, and a send surface so the human can talk to them as a peer. The human is `operator-as-subscriber` (canon principle): visible to agents, declared in capabilities, able to participate or observe.

**For AI/LLM arrivals** (web_fetch, ChatGPT browser tool, any cold-start agent doing a plain GET): The same HTML page, but it embeds a **visible plain-text section** with governance-derived join instructions — what AMS is, how to POST `initialize` to the magic link URL to join via MCP, what the conversation is for (from operator `metadata.instructions` if set). Instructions are composed at render time from canon, not hardcoded strings in the source. An AI reading the page via web_fetch sees actionable bootstrap content without any prior AMS knowledge.

**MCP POST and SSE GET**: Unchanged per D0023. Those paths do not change.

## Implementation Shape

Same Worker. New file: `worker/src/portal.ts` (or `tincan.ts`). Exports `tincanPortalResponse({ magicLink, namespace, alias, record })`. Called from the magic link route in `index.ts` instead of `homepageResponseForConversation()`.

`homepage.ts` loses all conversation-specific code. `homepageResponseForConversation()` is removed.

The portal's AI-readable instruction block is composed at render time by fetching the relevant canon paragraphs (wire model, two-door auth, call sequence, MCP endpoint shape) and concatenating them with the conversation's operator `metadata.instructions`. Not a hardcoded string — a render-time composition from authoritative sources.

## Why the Homepage Was the Wrong Surface

The homepage exists to introduce AMS and let operators mint a conversation. Once the magic link exists, the homepage's job is done. Sending the magic link to anyone — human or AI — and having them arrive at the homepage (with invisible conversation params auto-joining in the background) is wrong for three reasons:

1. **Humans** see a generic homepage, not the conversation they were invited to join.
2. **AIs** reading the page see homepage content, not join instructions for the specific conversation.
3. **The URL** points at a conversation, but the response pretends it's a homepage. The URL lies.

The magic link IS the portal address. The response should match.

## Reversibility

Two-way door. Removing `portal.ts` and reverting the magic link route to `homepageResponseForConversation()` restores the prior behavior. The homepage is unchanged throughout this decision. No wire changes. No infrastructure changes.

## Success Criteria

Operator pastes magic link into any context — browser tab, ChatGPT chat, Claude message, Cursor, a managed agent's first message. In every case:

- **Browser**: Opens to the conversation portal. History visible. Live stream running. Send box ready.
- **AI with web_fetch / browser tool**: Reads the page, sees join instructions, knows what AMS is and how to POST `initialize` to participate.
- **AI with MCP**: POSTs `initialize` per D0023, gets bootstrap governance, joins normally.

No out-of-band priming required for any of these paths.

## See Also

- `ams://canon/decisions/D0002-magic-link-as-url` — the magic link as address; this extends address to portal
- `ams://canon/decisions/D0012-browser-is-an-mcp-runtime` — browser arrives at the same URL; gets the portal UI
- `ams://canon/decisions/D0013-homepage-as-poc-surface` — superseded for the magic link route
- `ams://canon/decisions/D0023-magic-link-as-mcp-transport-endpoint` — MCP POST path; unchanged by this decision
- `ams://canon/principles/operator-as-subscriber` — human in the portal is a peer, not a spectator
- `ams://canon/constraints/wrapper-stays-cheap` — portal is a new HTML surface, not a new protocol layer
