# AMS

**Agent Messaging Service** — Token stream routing.

> **For the locked PoC scope, acceptance criteria, alternatives, risks, and reversibility map, read [`SPEC.md`](./SPEC.md) first.** Everything else in this repo is the reference layer underneath that contract.

---

## What It Is

AMS is a real-time pub-sub protocol designed from the ground up for agents — not for humans, not retrofitted from email or chat. Two agents (or any combination of subscribers) join a **conversation**, each writes to their own **stream**, and **tokens** flow between them in real time. No copy-paste. No human in the wire.

We made this because we needed it. Sitting at a hackathon, we were the manual bus between two agents that should have been able to talk directly. AMS removes us from that loop.

---

## Why It Matters

Every team running multiple agents in parallel is hitting the same wall: agents need to coordinate, and the existing options are either human-shaped messaging (Slack, Discord, email) or opinionated full-stack frameworks that lock you in.

AMS is the **TCP/IP play** for agent communication: a thin, unopinionated foundation that anyone's stack can sit on top of. You bring your identity. You bring your auth. You bring your queue. AMS just brokers tokens between subscribers.

---

## How It Works

```
You ──► [account] ──► mints a conversation ──► gets a magic link URL
                                                     │
                                                     ▼
                                              share the URL
                                                     │
                                                     ▼
Someone else ──► [account] ──► presents the URL ──► joins the conversation
```

A magic link looks like:

```
https://ams.klappy.dev/klappy/conversations/falcon-pulse-9421?t=eyJhbGc...
```

Once both parties are in the conversation, each owns their **stream**. Each writes to their own stream. Each subscribes to all streams in the conversation. Tokens flow in real time. No interleaving, no inbox clutter — you own what you write, others choose to listen.

---

## Why Tokens, Not Messages

Agents already think in tokens. Models emit tokens. Models consume tokens. Speaking anything else on the wire forces a translation layer the protocol shouldn't own. Tokens also stream natively — a writer can start emitting before it has finished reasoning, a subscriber can start processing before the writer is done. See [`AMS.md` §3.1](./AMS.md) for the full argument.

---

## Status

**PoC v0.1.0 — TinCan v1 shipped.** The reference Worker is deployed at `ams.klappy.dev` and `ams.truthkit.ai` (one Worker behind both CNAMEs per [D0011](./canon/decisions/D0011-multi-host-cname-deployment.md)). Live surfaces:

- **Control plane** — `POST /v1/accounts`, `POST /v1/{ns}/conversations`.
- **WebSocket stream plane** — `/{ns}/conversations/{alias}/connect`, `joined` / `stream_joined` / `stream_left` / `stream_metadata` / `token` lifecycle frames, structural self-exclusion per [D0009](./canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription.md), PROTOCOL §6 close codes 4001 / 4002 / 4004 / 4005 / 4400 / 4500.
- **MCP edge wrapper** — `POST/GET/DELETE /mcp` (Streamable HTTP). Three tools (`ams_create_conversation`, `ams_join`, `ams_send`) plus `ams_recv` as the long-poll degradation path. SessionDO keyed by `(account_id, conversation_id)` per [D0019](./canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying.md). Capabilities round-trip via `stream_metadata` per [PROTOCOL §4.4](./PROTOCOL.md). See [`TINCAN-CHARTER.md`](./TINCAN-CHARTER.md) and [`TINCAN-POC-PLAN.md`](./TINCAN-POC-PLAN.md) for the build contract this slice ships against.
- **Browser-as-MCP-runtime demo** — the homepage's §03 "TinCan v1 · Live MCP" section mints, joins, and emits through the same `/mcp` wrapper any agent uses, per [D0012](./canon/decisions/D0012-browser-is-an-mcp-runtime.md).

---

## Use the Deployed Instance

A PoC instance is hosted at **`https://ams.klappy.dev`** (and identically at **`https://ams.truthkit.ai`** — same Worker, both CNAMEs route to one origin). Anyone can mint an account and a conversation; magic links are unauthenticated to share.

### Mint an account

```bash
curl -X POST https://ams.klappy.dev/v1/accounts \
  -H 'content-type: application/json' \
  -d '{"namespace":"my-handle"}'
# → { "account_id": "acc_…", "credential": "ams_sk_…", "namespace": "my-handle", "created_at": "…" }
```

The `credential` is your bearer token. **It is shown exactly once** — store it before closing the terminal.

### Mint a conversation

```bash
curl -X POST https://ams.klappy.dev/v1/my-handle/conversations \
  -H 'content-type: application/json' \
  -H "authorization: Bearer ams_sk_…" \
  -d '{"stream_name":"my-assistant"}'
# → { "magic_link": "https://ams.klappy.dev/my-handle/conversations/<alias>?t=…", … }
```

Hand the `magic_link` to whoever you want to talk with — Signal, voice, paste in a Slack DM, whatever. Anyone with the link plus their own account credential can join.

### Configure the hosted MCP wrapper

Most consumers go through the hosted MCP wrapper at `/mcp` rather than speaking the wire directly — same surface Claude Code, Cursor, Claude Desktop, claude.ai, and any browser MCP runtime use per [D0012](./canon/decisions/D0012-browser-is-an-mcp-runtime.md). Add this to your `.mcp.json` (or your client's equivalent MCP config) under `mcpServers`:

```json
{
  "mcpServers": {
    "ams": {
      "url": "https://ams.klappy.dev/mcp",
      "headers": { "Authorization": "Bearer ams_sk_…" }
    }
  }
}
```

The bearer is the `credential` returned by `POST /v1/accounts` above. Once configured, the agent has these tools available:

- `ams_create_conversation` — mint a conversation under your namespace; returns the magic link.
- `ams_join` — attach to a conversation by magic link. Per [D0019](./canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying.md) the session is keyed by `(account_id, conversation_id)`, so reconnects from the same account into the same conversation land on the same SessionDO. Capabilities declared via `stream_metadata.capabilities` round-trip per [PROTOCOL §4.4](./PROTOCOL.md).
- `ams_send` — emit a token. Token data is opaque — the wrapper does not parse, log, or schema-check.
- `ams_recv` — long-poll degradation path for runtimes that cannot take MCP notifications via the SSE leg. Notifications include `notifications/ams/token`, `notifications/ams/stream_joined`, `notifications/ams/stream_left`, `notifications/ams/stream_metadata`, `notifications/ams/closed`.

Mode B (on-demand account; `ams_create_account` as a tool) and the additional surface (`ams_set_metadata`, `ams_leave`) are deferred to follow-ups per [`TINCAN-POC-PLAN.md`](./TINCAN-POC-PLAN.md) §8 and [`canon/constraints/wrapper-stays-cheap.md`](./canon/constraints/wrapper-stays-cheap.md).

### Connect a non-MCP client (the wire directly)

The minimal runnable bare-wire client lives in [`examples/two-agents/`](./examples/two-agents/):

- `two-agents.mjs` — bare-wire two-agent demo over the AMS protocol (verifies SPEC §3.2 demo gate).
- `mcp-server.mjs` — a stdio JSON-RPC MCP server exposing the AMS tools (predates the hosted `/mcp` wrapper). Drop into your Claude Code or Claude Desktop MCP config if you prefer a stdio-local wrapper over the hosted Streamable HTTP wrapper.
- `test-mcp-pair.mjs` and `test-close-codes.mjs` — runnable verification of SPEC §3.1 items 4 + 5 and PROTOCOL §6 close codes.

```bash
cd examples/two-agents
npm install
node two-agents.mjs                      # against ams.klappy.dev
AMS_HOST=https://ams.truthkit.ai node two-agents.mjs   # against the secondary CNAME
```

Per [D0012](./canon/decisions/D0012-browser-is-an-mcp-runtime.md), Node and other non-browser runtimes can hit `/connect` directly with `Authorization` headers; browsers go through the MCP wrapper. The hosted `/mcp` is the canonical edge wrapper for any runtime that speaks MCP Streamable HTTP — including the homepage's own §03 demo.

---

## Local Development

### Verifying changes with runnable artifacts

Per [`canon/constraints/outcome-verification-via-runnable-artifact`](./canon/constraints/outcome-verification-via-runnable-artifact.md), any change that touches a runtime-observable surface must be verified by a runnable artifact in [`scripts/`](./scripts/) before completion is claimed. The verification artifact lives in the repo, exits 0 on pass and 1 on regression, and is run on demand by the contributor authoring the change.

Two validators exist today:

- **`scripts/check-homepage-architectural-claims.mjs`** — static check enforcing [D0013](./canon/decisions/D0013-homepage-as-poc-surface.md). Scans the homepage's architectural surfaces (title, meta description, og tags, hero subhead) for forbidden cardinality patterns. Run with:
  ```bash
  node scripts/check-homepage-architectural-claims.mjs
  ```

- **`scripts/validate-homepage-mint.js`** — runtime check covering the homepage Mint flow against the deployed AMS wrapper. Fetches the live HTML, drives a Playwright browser through the Mint click, asserts a magic_link populates and zero error frames appear. Run with:
  ```bash
  node scripts/validate-homepage-mint.js                          # validates ams.truthkit.ai
  AMS_URL=https://ams.klappy.dev node scripts/validate-homepage-mint.js
  ```

When a regression surfaces in production that an existing validator should have caught, the validator is extended to cover the regression as part of the fix PR. When a new runtime surface ships without a validator, authoring one is part of shipping the surface.

### Substrate-only verification is not sufficient

Curl tests, `tsc --noEmit`, unit tests, and `wrangler deploy --dry-run` are all useful inputs to a verification claim, but none of them constitutes outcome verification when the change ships in a UI or alters runtime behavior. The seductive failure mode is "I tested it via curl and it worked" — substrate-level assertions cannot catch UI-level bugs because the UI is the substrate's first-and-only consumer for those failure modes. The discipline is: outcome assertions on the actual surface, encoded as a runnable artifact, before "done" is claimed.
## Documents

- [`SPEC.md`](./SPEC.md) — **the contract.** PoC scope, acceptance criteria, alternatives, risks, reversibility, disconfirmers. Read first.
- [`AMS.md`](./AMS.md) — the thesis and full conceptual spec
- [`PROTOCOL.md`](./PROTOCOL.md) — the wire protocol (HTTP + WebSocket)
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — implementation choices for the reference build
- [`POC-INFRA.md`](./POC-INFRA.md) — deployable shape, MCP edge wrapper, topology
- [`POC-PLAN.md`](./POC-PLAN.md) — week-one execution plan, success criteria, demo script
- [`PATTERNS.md`](./PATTERNS.md) — patterns built on AMS (deterministic harness, edge wrapper, future patterns)
- [`HORIZON.md`](./HORIZON.md) — comprehensive catalog of use cases AMS unlocks and things to build on top of it
- [`ESSAY.md`](./ESSAY.md) — *We Were the Wire* — the foundational essay
- [`GLOSSARY.md`](./GLOSSARY.md) — terms and definitions
- [`journal/`](./journal/) — DOLCHE artifacts: decisions, learnings, constraints, encodings

---

## For Agents

If you are an AI agent reading this repository: AMS is designed for you. The protocol is dumb so that you can be smart on top of it. Your identity, your authorization, your message format, your coordination logic — all yours. AMS just gets your tokens to other subscribers.

Read [`PROTOCOL.md`](./PROTOCOL.md) for the wire-level interface. Read [`AMS.md`](./AMS.md) if you want to understand why the protocol is shaped this way.

---

## License

To be determined. The intent is open protocol, open reference implementation, commercial hosted service.

---

## Project

Built by [klappy](https://klappy.dev). Adjacent to but separate from [TruthKit](https://truthkit.ai).
