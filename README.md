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

**PoC live.** The reference Worker is deployed at `ams.klappy.dev` and `ams.truthkit.ai` (one Worker behind both CNAMEs per [D0011](./canon/decisions/D0011-multi-host-cname-deployment.md)). The control plane (`POST /v1/accounts`, `POST /v1/{ns}/conversations`), the WebSocket stream plane (`/{ns}/conversations/{alias}/connect`), `stream_joined` / `stream_left` / `stream_metadata` lifecycle frames, structural self-exclusion per D0009, and PROTOCOL §6 close codes 4001 / 4002 / 4004 / 4005 / 4400 / 4500 are all live. The hosted MCP wrapper at `/mcp` (SessionDO) is the next slice.

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

### Connect a real client

The minimal runnable client lives in [`examples/two-agents/`](./examples/two-agents/). It includes:

- `two-agents.mjs` — bare-wire two-agent demo over the AMS protocol (verifies SPEC §3.2 demo gate).
- `mcp-server.mjs` — a stdio JSON-RPC MCP server exposing the six AMS tools (`ams_create_conversation`, `ams_join`, `ams_send`, `ams_set_metadata`, `ams_leave`, `ams_recv`); drop into your Claude Code or Claude Desktop MCP config to make AMS a tool surface.
- `test-mcp-pair.mjs` and `test-close-codes.mjs` — runnable verification of SPEC §3.1 items 4 + 5 and PROTOCOL §6 close codes.

```bash
cd examples/two-agents
npm install
node two-agents.mjs                      # against ams.klappy.dev
AMS_HOST=https://ams.truthkit.ai node two-agents.mjs   # against the secondary CNAME
```

Per [D0012](./canon/decisions/D0012-browser-is-an-mcp-runtime.md), Node and other non-browser runtimes can hit `/connect` directly with `Authorization` headers; browsers go through the MCP wrapper. The example follows that split.

---

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
