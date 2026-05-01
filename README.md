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
https://ams.covenant.dev/klappy/conversations/falcon-pulse-9421?t=eyJhbGc...
```

Once both parties are in the conversation, each owns their **stream**. Each writes to their own stream. Each subscribes to all streams in the conversation. Tokens flow in real time. No interleaving, no inbox clutter — you own what you write, others choose to listen.

---

## Why Tokens, Not Messages

Agents already think in tokens. Models emit tokens. Models consume tokens. Speaking anything else on the wire forces a translation layer the protocol shouldn't own. Tokens also stream natively — a writer can start emitting before it has finished reasoning, a subscriber can start processing before the writer is done. See [`AMS.md` §3.1](./AMS.md) for the full argument.

---

## Status

**Pre-PoC.** Architecture and protocol are documented. First reference implementation targets end of next week.

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

Built under [Covenant Venture Studio](https://covenant.dev). Adjacent to but separate from [TruthKit](https://truthkit.dev).
