---
uri: ams://canon/decisions/D0026-two-worker-topology-ams-substrate-tincan-ui-layer
title: "D0026 — Two-Worker Topology: AMS Is Substrate, TinCan Is UI Layer"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "decision", "tincan", "topology", "cloudflare-workers", "vodka-architecture", "separation-of-concerns"]
epoch: E0008.5
date: 2026-05-06
derives_from: "D0006-dream-house-wire-edge-wrappers (wrappers are removable layers; TinCan is a removable UI layer); D0025-magic-link-url-is-the-tincan-portal (TinCan owns the portal route); doing-less-enables-more (AMS does less by shedding all UI opinions)"
governs: "Directory structure, wrangler.toml split, route ownership, deploy targets, dependency direction between AMS and TinCan."
status: active
---

# D0026 — Two-Worker Topology: AMS Is Substrate, TinCan Is UI Layer

> AMS and TinCan are separate Cloudflare Workers, deployed on sibling subdomains under each apex (`ams.*` and `tincan.*`). AMS owns the protocol substrate. TinCan owns the human-facing surfaces. The dependency runs one way (TinCan → AMS, via Cloudflare service binding). The proof is the wrangler.toml split, not a claim in a doc.

## Route Ownership

**AMS Worker** — protocol substrate only:
- `POST /v1/accounts` — account minting
- `POST /v1/{ns}/conversations` — conversation minting
- `GET /v1/{ns}/conversations/{alias}` — conversation metadata (new, needed by TinCan JS)
- `GET /{ns}/conversations/{alias}/connect` — WebSocket wire
- `POST|GET|DELETE|OPTIONS /mcp` — MCP endpoint
- `GET /healthz` — liveness

**TinCan Worker** — UI surfaces only:
- `GET /` — homepage (intro, link to /tincan)
- `GET /tincan` — mint + configure page (set instructions, mint conversation, copy link)
- `GET /{ns}/conversations/{alias}` — conversation portal (browser: full UI; AI: governance-derived join instructions)

Route-based split via Cloudflare route patterns in each wrangler.toml. AMS substrate routes declared first (more specific); TinCan portal route is the broad pattern. The reference deployment runs the two Workers on **different subdomains** under each apex — `ams.{klappy.dev,truthkit.ai}` and `tincan.{klappy.dev,truthkit.ai}` — rather than sharing one host. Cloudflare routes still first-win on specificity within each subdomain.

## Dependency Direction

TinCan → AMS public API. One direction only.

TinCan serves HTML shells with URL params (namespace, alias, permissive token) baked in. Because the reference deployment splits the two Workers across separate subdomains rather than colocating them, TinCan reaches AMS via a Cloudflare service binding (`packages/tincan/wrangler.toml [[services]] binding = "AMS"`) for the magic-link MCP transport proxy (POST / SSE GET / DELETE / OPTIONS) and for the server-side conversation-record read (`GET /v1/{ns}/conversations/{alias}`) the bootstrap render needs. Service bindings are same-process Cloudflare calls — no network hop, no public egress, no CORS — and the binding is a colocated transport, not a coupling: replacing it with public-network calls against the AMS hostnames yields identical semantics. (An earlier draft of this section assumed shared-domain deployment with no binding required; the reference deployment chose the subdomain split, which keeps the magic-link URL stable on the TinCan host while preserving the unidirectional dependency.)

TinCan consumes the AMS public API as any external client would. AMS has no knowledge TinCan exists. Removing TinCan leaves AMS fully functional. Replacing TinCan with a different UI requires zero AMS changes.

## What This Proves

Vodka architecture by construction. The substrate does less — it sheds all UI opinions. A removable layer is only credibly removable if it actually lives in a separate artifact. Two `wrangler.toml` files make the claim structural rather than documentary.

Any team can build their own UI on top of AMS. The TinCan source is the reference implementation of that pattern, not the only possible implementation.

## Directory Structure

```
agent-messaging-service/
  worker/          ← AMS Worker (existing)
    wrangler.toml
    src/
      index.ts
      conversation.ts
      mcp.ts
      ...
  tincan/          ← TinCan Worker (new)
    wrangler.toml
    src/
      index.ts     ← routing
      homepage.ts  ← / intro
      mint.ts      ← /tincan mint + configure
      portal.ts    ← /{ns}/conversations/{alias} portal
```

`worker/src/homepage.ts` is deleted (or stripped to nothing — the route moves to TinCan).

## Magic Link Shape

Unchanged. AMS mints the magic link. The link points to `/{ns}/conversations/{alias}?t=<permissive>`. TinCan owns that route and serves the portal. The URL the operator copies is the portal URL — the same URL that was always minted.

## Reversibility

Two-way door. Collapsing TinCan back into the AMS Worker means moving the HTML files back to `worker/src/` and merging the route handlers. No wire changes. No protocol changes. No magic link shape changes.
