---
uri: ams://canon/decisions/D0012-browser-is-an-mcp-runtime
title: "D0012 — Browser Is an MCP Runtime; Live Web Demos Use the Wrapper, Not a Wire Extension"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "decision", "mcp", "edge-wrapper", "browser", "demo-surface", "vodka-architecture"]
epoch: E0008.4
date: 2026-05-03
derives_from: "ams://canon/decisions/D0006-dream-house-wire-edge-wrappers (runtimes get wrappers, not wire revisions); ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai (the wrapper's surface is already the MCP tool set + notifications + resource); ams://canon/constraints/wrapper-stays-cheap (translation only — adding a runtime as a wrapper consumer is exactly that); POC-INFRA.md §3 §4 (the MCP wrapper as the cheapest distribution surface); planning conversation operator↔Claude on 2026-05-03 that asked 'couldn't this be solved once we make the MCP wrapper?'"
complements: "ams://canon/decisions/D0006-dream-house-wire-edge-wrappers, ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai, ams://canon/constraints/wrapper-stays-cheap, ams://canon/constraints/permanent-non-goals"
governs: "How browser-based AMS clients reach the wire — today the homepage's eventual live theatre demo, tomorrow any web-shaped consumer. The choice between extending the wire to be browser-friendly versus letting the MCP wrapper absorb the impedance, settled in favor of the wrapper."
status: active
---

# D0012 — Browser Is an MCP Runtime; Live Web Demos Use the Wrapper, Not a Wire Extension

> A browser cannot supply `Authorization: Bearer ...` on a `new WebSocket(url)` upgrade — the constructor accepts only the URL and a subprotocol list. The temptation, when the homepage theatre demo wants to go live, is to extend the wire so the browser can authenticate against `/connect` directly (e.g., `Sec-WebSocket-Protocol: ams.bearer.<credential>`). That temptation is rejected. Per `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers`, the wire does not bend to runtimes. The browser is a runtime. The MCP wrapper — already required for the SPEC §3.2 demo gate, already speaking the MCP-tools-plus-notifications surface from `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai` — is the runtime adapter the browser uses, just like Claude Code, Claude Desktop, Cursor, and claude.ai use it.

## The Decision

The MCP edge wrapper is the canonical edge wrapper for **any** runtime that speaks MCP — and a browser, via `fetch()` against MCP's Streamable HTTP transport, speaks MCP. The browser is therefore *not* a special case requiring a wire-spec extension; it is the fifth (or nth) MCP client sitting next to the conversational-AI clients the wrapper was already going to serve.

In practice this means:

- The wire (`PROTOCOL.md`) does **not** grow a browser-friendly auth shape. No `Sec-WebSocket-Protocol`-as-bearer. No cookie auth on `/connect`. No query-string credential. The wire's authentication remains `Authorization: Bearer ams_sk_…` on the WebSocket upgrade, exactly as it is today.
- The MCP wrapper (the SessionDO from `POC-INFRA.md` §4) is the only adapter that exists. Browsers reach AMS by issuing `tools/call` requests against `/mcp` over HTTP, with `Authorization` set on the `fetch()`, and consume server-pushed events via the SSE leg of MCP's Streamable HTTP transport.
- The homepage theatre's live-demo path, when it lands, is a small JavaScript IIFE in `worker/src/homepage.ts` that speaks MCP same-origin against `/mcp`. No new endpoints. No wire change. No wrapper additions beyond what the SPEC §3.2 demo gate already demands.

## What This Means in Practice

- **The homepage SIM is honest until the MCP wrapper ships.** Before the wrapper exists, the in-browser theatre cannot be live by any path that respects the architecture. The current SIM badge text — "In-browser SIM (browser WS auth limit)" — is correct *under this decision*: the limit is a real browser fact, and the path around it is the wrapper, which doesn't exist yet.
- **Once the MCP wrapper exists, going live is an `emit()`/`onToken()` rewrite.** The Day 1 homepage handoff's prediction holds, with the wiring corrected: the existing SIM functions become MCP `tools/call ams_send` and `notifications/ams/token` SSE handlers respectively. The SIM badge becomes a LIVE badge. The two-agent UX uses two MCP sessions (one per agent) with two `ams_join` calls under the same auto-minted bearer.
- **Same-origin keeps CORS trivial.** The reference deployment serves the homepage and the MCP wrapper from the same Worker on the same hosts (`ams.klappy.dev`, `ams.truthkit.ai`). Browser → `/mcp` is same-origin. No CORS preflight, no header allowlist, no credentialed-fetch dance beyond what the MCP transport already specifies.
- **Rate limiting is the wrapper's concern, not the homepage's.** Any abuse vector against `/mcp` from a browser is the same abuse vector against `/mcp` from any other MCP client. The mitigation (per-IP throttle, demo-namespace TTL, KV counter) belongs at the wrapper layer where it protects every consumer, not as a homepage afterthought.
- **Visitor-minted bearers are non-negotiable for the demo.** A shared embedded credential in client-side JS is harvestable in seconds by anyone who reads the page source. The homepage's existing door-(i) mint flow auto-mints a per-visitor demo credential; the live theatre re-uses the same mint flow programmatically rather than embedding a long-lived key.

## Why the Wrapper, Not a Wire Extension

The alternative considered — and rejected — is extending the wire to accept `Sec-WebSocket-Protocol: ams.bearer.<credential>` (and possibly other browser-friendly auth shapes) so the browser can connect to `/connect` directly. That extension is technically small (~30 lines across `auth.ts` and `PROTOCOL.md`) and superficially attractive: lower latency, fewer hops, no wrapper dependency.

It is rejected for four reasons, in descending order of weight:

1. **D0006 already settled the layering.** "The wire does not bend to runtimes; per-session edge wrappers absorb the impedance mismatch." Adding browser-friendly auth to the wire is wire-bending-to-runtime by definition. Doing it once invites every future runtime to ask for the same accommodation, and the foundation play collapses one acceptance at a time.
2. **The MCP wrapper has to ship anyway.** SPEC §3.1 items 4 and 5 and the §3.2 demo gate are all the MCP wrapper. The browser-as-MCP-client path costs zero additional wrapper work; the wire-extension path costs PROTOCOL.md + SPEC.md updates, an `auth.ts` change, and a new conformance branch in `wire-conformance.md`. The cheaper path also happens to be the architecturally cleaner one.
3. **The wrapper-stays-cheap test now passes for the wrapper.** A wrapper for one consumer is a code smell (`ams://canon/constraints/wrapper-stays-cheap`). The MCP wrapper now has multiple consumers — Claude Code, Claude Desktop, Cursor, claude.ai, and any browser-based UI — which is exactly the multi-runtime justification D0006 requires. The browser as a fifth consumer makes the wrapper *more* justified, not less.
4. **`Sec-WebSocket-Protocol` as auth is a known hack.** RFC 6455 designed the subprotocol field for protocol selection, not credential transport. The server MUST echo the selected subprotocol in the response or the handshake fails, which means any auth-via-subprotocol scheme has to also pretend to be a protocol selection. It works in practice and is used in the wild, but it is a downstream-of-design choice that we would be inheriting only because we declined to use the adapter that already exists.

## Why Not Wait for a Different Adapter

Other browser-WebSocket-auth workarounds exist (cookie auth, server-side relay endpoint, WebTransport, fetch-with-streaming-body). All were considered:

- **Cookie auth** conflicts with `D0011` (cookies are per-host; magic links are cross-host) and forces a sign-in surface the protocol does not have.
- **Server-side relay endpoint just for browsers** is an edge wrapper for one consumer, which `wrapper-stays-cheap` rejects, AND duplicates work the MCP wrapper already does.
- **WebTransport / fetch-streaming** crosses into transport-swap territory, which `AMS.md` non-goal #5 explicitly punts ("AMS does not crown a winner" on transport).

The MCP wrapper is the option that satisfies every constraint the others violate.

## What Falls Out For Free

- **Every browser-based AMS application gets the same path.** The homepage demo is the first browser consumer; the next one (any partner's web UI, a hosted dashboard, an embedded chat surface) follows the same pattern. No per-consumer adapter work.
- **The eventual JavaScript SDK is small.** `POC-PLAN.md §3` puts "Any client SDK beyond the example scripts in `examples/`" on the not-this-week list. When that SDK eventually lands, it is an MCP client wrapper for the browser, not a custom-WebSocket-protocol implementation. The SDK's surface is whatever MCP libraries already exist plus a few AMS-specific helpers.
- **The MCP wrapper's own observability covers browser traffic.** Any per-tool latency / error / abuse instrumentation the wrapper has automatically applies to browser callers. No separate browser-traffic monitoring.

## What This Forecloses

- **Browser → `/connect` direct WebSocket.** The wire endpoint exists and is open, but a browser cannot reach it without a wire-spec extension this decision rejects. JavaScript outside a browser context (Node, Deno, Bun) can still hit `/connect` directly because those runtimes' WebSocket implementations support arbitrary headers; only browser JS is routed through the wrapper.
- **Lower-latency browser path than the wrapper provides.** Browser → `/mcp` → SessionDO → wire WS → ConversationDO → wire fan-out → SessionDO → SSE → browser is more hops than browser → `/connect` would be. If a browser-native real-time use case ever surfaces where the MCP wrapper's latency budget is unacceptable, this decision would need to be revisited (see Reversibility).
- **Per-tab independent credential.** Two browser tabs on the same homepage page mint separate demo bearers, get separate conversations, see no cross-tab token flow. Cross-tab demo would require either tab-shared storage (a feature this design does not include) or an explicit "join existing" UX where the second tab presents a magic link from the first.

## Reversibility

**Two-way.** Unlike `D0006`, `D0009`, or `D0011`, this decision does not commit the wire to a particular shape — it commits the *adapter strategy* for browser clients. If a future use case demonstrates that the MCP wrapper's latency or feature set genuinely cannot serve a browser-native real-time application, the wire can be extended later (e.g., with `Sec-WebSocket-Protocol`-as-bearer per the alternative considered above) without breaking any existing client. The MCP wrapper continues to work; the new direct path becomes a second option for runtimes that need it.

The reversibility is asymmetric: adding browser-friendly auth to the wire later is cheap (no existing client breaks). *Removing* it once added is expensive (every browser client that adopted the direct path has to migrate back through the wrapper). The asymmetry is why this decision picks "wrapper first, direct path only on demonstrated need" rather than "build the direct path now and use it where convenient."

## See Also

- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` — the parent decision this applies. Browser is a runtime; runtimes get wrappers.
- `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai` — the surface the MCP wrapper exposes (six tools, two notifications, one resource); the browser path consumes the same surface.
- `ams://canon/constraints/wrapper-stays-cheap` — the test the wrapper now passes more easily because it serves multiple runtimes including the browser.
- `ams://canon/constraints/permanent-non-goals` — the homepage as a hosted UI for AMS itself remains a non-goal; the homepage as a *marketing surface that demonstrates* AMS via the same wrapper any third party would use is the inversion this decision codifies.
- `ams://canon/decisions/D0011-multi-host-cname-deployment` — the same-origin condition that makes browser → `/mcp` CORS-trivial on the reference deployment.
- `POC-INFRA.md` §3 §4 — the MCP wrapper's role as "the cheapest distribution path on the planet."
- `POC-PLAN.md` §3 — the "non-work for this week" list ("A web UI of any kind", "Any client SDK beyond the example scripts in `examples/`") that this decision retroactively reframes: those items are post-PoC, and when they land, they land as MCP-client surfaces, not as wire-protocol extensions.
- `journal/2026-05-03-d0012-browser-as-mcp-runtime.tsv` — the planning conversation that produced this decision (O / D / C / L / E / H artifacts), including the misdiagnosis that surfaced it.
