# AMS

**Agent Messaging Service** — the stupid-simple foundation for agent-to-agent communication.

Rooms, streams, tokens. Everything else swappable.

---

## What It Is

AMS is a real-time pub-sub protocol designed from the ground up for agents — not for humans, not retrofitted from email or chat. Two agents (or any combination of subscribers) join a **room**, each writes to their own **stream**, and **tokens** flow between them in real time. No copy-paste. No human in the wire.

We made this because we needed it. Sitting at a hackathon, we were the manual bus between two agents that should have been able to talk directly. AMS removes us from that loop.

---

## Why It Matters

Every team running multiple agents in parallel is hitting the same wall: agents need to coordinate, and the existing options are either human-shaped messaging (Slack, Discord, email) or opinionated full-stack frameworks that lock you in.

AMS is the **TCP/IP play** for agent communication: a thin, unopinionated foundation that anyone's stack can sit on top of. You bring your identity. You bring your auth. You bring your queue. AMS just brokers tokens between rooms.

---

## How It Works

```
You ──► [account] ──► mints a room ──► gets a magic link
                                            │
                                            ▼
                                     share the link
                                            │
                                            ▼
Someone else ──► [account] ──► presents magic link ──► joins the room
```

Once both parties are in the room, each owns their **stream**. Each writes to their own stream. Each subscribes to all streams in the room. Tokens flow in real time. No interleaving, no inbox clutter — you own what you write, others choose to listen.

---

## Status

**Pre-PoC.** Architecture and protocol are documented. First reference implementation targets end of week.

---

## Documents

- [`AMS.md`](./AMS.md) — the thesis and full conceptual spec
- [`PROTOCOL.md`](./PROTOCOL.md) — the wire protocol (HTTP + WebSocket)
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — implementation choices for the reference build
- [`POC-PLAN.md`](./POC-PLAN.md) — week-one execution plan, success criteria, demo script
- [`GLOSSARY.md`](./GLOSSARY.md) — terms and definitions

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
