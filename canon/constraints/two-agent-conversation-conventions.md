---
uri: ams://canon/constraints/two-agent-conversation-conventions
title: "Two-Agent Conversation Conventions — The Recommended Pattern for Conversational AI on AMS"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "constraint", "convention", "two-agent", "conversational-ai", "recommended-not-required", "primary-use-case"]
epoch: E0008.3
date: 2026-05-01
derives_from: "SPEC.md §3.2 (Demo Gate), AMS.md §3 (primitives), PROTOCOL.md §4 §5, GLOSSARY.md, POC-INFRA.md §3 (MCP wrap)"
complements: "ams://canon/principles/own-stream-echo-must-be-filtered, ams://canon/principles/operator-as-subscriber, ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai"
governs: "How two LLM-backed conversational agents are recommended to interact through a single AMS conversation. The reference convention; not a wire requirement."
status: active
---

# Two-Agent Conversation Conventions — The Recommended Pattern for Conversational AI on AMS

> The wire stays vodka — it carries opaque tokens. For two conversational AI assistants to interop reliably, an application convention is needed above the wire. This article documents the recommended convention for the primary v1 use case. Implementations may diverge with declared metadata; this convention is a default, not a requirement.

## Description

The SPEC §3.2 demo gate calls for two real LLM-backed agents (today: two Claude Code instances; the principle generalizes) to exchange tokens through one AMS conversation, with no human in the wire. The wire is sufficient to move the bytes. It is not sufficient to coordinate the dialogue. Specifically, the wire does not say:

- When one agent has finished its turn.
- How the other agent should know it is now its turn.
- What happens when both speak at once.
- How the loop terminates.
- How peers introduce themselves to each other.
- What an agent should do with tokens it emitted that the wire echoes back.

These are application-layer questions. AMS does not own them by design (`ams://canon/constraints/permanent-non-goals`). The article below is the recommended convention so two implementations following it can interop without prior coordination. An implementation that diverges should declare its divergence in stream metadata so peers can adapt.

## Outline

- The Six Conventions
- Capabilities Declaration for Conversational AI
- Failure Modes the Conventions Prevent
- How to Diverge
- What This Is Not

---

## The Six Conventions

### 1. Turn Boundaries Use a Sentinel Token

A conversational AI's turn ends when it emits a sentinel token. The recommended sentinel is a single token whose `data` is the literal JSON object:

```json
{"ams.convention.v1": "end_of_turn"}
```

Until the sentinel is observed on a peer's stream, the receiver treats incoming tokens as "still talking" and continues to accumulate. Once the sentinel arrives, the accumulated buffer is considered the peer's complete turn and the receiver may begin its own response.

This convention is recommended because the wire is streaming-native and tokens may arrive incrementally. Without a sentinel, "is the peer done?" requires either a timeout (slow, unreliable) or out-of-band coordination (defeats the point).

### 2. Initiative Is Whoever Spoke Last Gives It

By default, after a peer's `end_of_turn` sentinel, initiative passes to the receiver. The receiver decides whether to respond, ask a clarifying question, or terminate. There is no token reserved for "yielding" initiative without speaking; not responding is the yield.

If multiple peers are in the conversation, the convention is more permissive: any peer may speak after any other peer's `end_of_turn`. Two peers speaking simultaneously is allowed (their streams are independent) and is treated as both speaking; receivers handle both inputs.

### 3. Handshake on Join Is Optional

The wire's `joined` and `stream_joined` frames already give every subscriber the peer roster and each peer's metadata immediately. A handshake message is not required. A peer may emit a single short opening turn introducing itself, but the introduction adds nothing the wire did not already provide via metadata; do it for human readability, not for protocol need.

If an introduction is emitted, it ends with the `end_of_turn` sentinel like any other turn.

### 4. Loop Termination Has Three Defaults

Two conversational AIs can talk past the point of usefulness if no termination signal exists. The recommended defaults are:

- **Sentinel termination.** Either peer emits `{"ams.convention.v1": "end_of_conversation"}` to signal that they consider the dialogue complete. Other peers may continue or also terminate.
- **Hop-count cap.** Each peer maintains a hop counter (turns since the conversation started or since the last operator message). At a configured limit (recommended default: 20), the peer emits `end_of_conversation` instead of continuing.
- **Stale-time cap.** If no peer has emitted a non-sentinel token within a configured window (recommended default: 5 minutes), any peer may emit `end_of_conversation` and disconnect.

Termination does not destroy the conversation — the conversation persists until all subscribers have left. Termination is each peer's signal that they are done.

### 5. System Prompts Are the Harness's, Not the Wire's

A conversational AI's system prompt, role configuration, model parameters, and tool list are properties of its runtime — its harness, in the sense of `PATTERNS.md` §1. They are not transmitted on the wire. Peers learn about each other through the `capabilities` metadata key (see below); the underlying system prompt remains private.

Two consequences:

- Peers cannot inspect each other's prompts. If trust requires prompt verification, that is an out-of-band concern (signed agent specs, harness attestation), not an AMS feature.
- An agent that wants to influence a peer's behavior does so through tokens on the wire, not by attempting to reach into the peer's configuration.

### 6. Own-Stream Echo Is Filtered, Not Acted On

Per `PROTOCOL.md` §4.1, the server pushes tokens from every stream to every connected subscriber, including the subscriber's own stream. A conversational AI MUST NOT treat tokens it emitted as inbound. This is so easy to get wrong that it has its own canon article: `ams://canon/principles/own-stream-echo-must-be-filtered`.

## Capabilities Declaration for Conversational AI

A conversational AI subscriber declares itself in stream metadata via the `capabilities` well-known key (`PROTOCOL.md` §4.4). The recommended schema for v1:

```json
{
  "capabilities": {
    "ams.convention.v1": {
      "role": "conversational_ai",
      "model": "claude-opus-4.7",
      "supports_sentinels": ["end_of_turn", "end_of_conversation"],
      "max_token_size_bytes": 65536,
      "languages": ["en"]
    },
    "annotations": {
      "display_name": "Klappy's Claude Code",
      "operator": "klappy@covenant.dev"
    }
  }
}
```

The shape is recommended, not enforced. AMS does not validate it. Peers read what they understand and ignore what they don't. Any field absent is assumed to take its default value where one exists; missing fields without defaults are treated as undeclared rather than as zero or null.

The `role: "conversational_ai"` value is the signal to other peers that the conventions in this article apply. A subscriber that does not declare itself a conversational AI is not bound by these conventions; conversational AIs handle non-conformant peers by best-effort heuristics (typically: treat any token as an utterance, do not expect sentinels).

## Failure Modes the Conventions Prevent

- **Echo loops.** Without convention 6, a naïve implementation reads its own emissions as input and loops indefinitely until rate limits kick in.
- **Endless ping-pong.** Without convention 4, two agents can volley pleasantries past the point of any usefulness because neither has a termination signal.
- **Stalls.** Without convention 1, a receiver does not know when to start its response and either starts too early (interrupting) or waits forever.
- **Mistaken simultaneity penalties.** Without convention 2, an implementation may suppress its own response when it sees a peer speak at the same time, losing both halves of a parallel exchange.
- **Identity confusion.** Without the capabilities declaration in the form recommended here, peers fall back to inference from `stream_name` or `owner_account_id`, which is unreliable.

## How to Diverge

If an implementation needs to use a different convention (different sentinels, different schema, different termination defaults), the rule is to declare the divergence in `capabilities` so peers can adapt. For example:

```json
"capabilities": {
  "ams.convention.v1": false,
  "custom.org.example.v1": {
    "role": "conversational_ai",
    "turn_boundary": "newline_chunk",
    "termination": "operator_only"
  }
}
```

A peer that does not understand the custom convention falls back to best-effort. Two peers that understand each other's conventions interop on whatever subset they share.

This is the AMS pattern in general: the wire stays vodka; conventions live in metadata; negotiation is between agents, not in the protocol.

## What This Is Not

- Not a wire requirement. None of the conventions above appear in `ams://canon/constraints/wire-conformance`. An AMS implementation is conformant whether or not its subscribers follow this article.
- Not a model-specific or runtime-specific convention. Two Claude Code instances, a Claude Code and a Gemini-backed agent, two custom LLM harnesses, an MCP-wrapped agent talking to a webhook-wrapped agent — all of these can follow the convention if they agree to.
- Not a finished spec. The convention is at v1 because we expect it to evolve as more implementations land. Versioning lives in the `ams.convention.v1` namespace; future versions ship as `v2`, etc., with backward-compatibility advice in the upgrade notes.
- Not the only valid convention. Other communities may converge on different defaults; AMS does not arbitrate. This is the recommended default for the v1 demo gate.

## See Also

- `SPEC.md` §3.2 — the demo gate this convention enables
- `PROTOCOL.md` §4 — the wire frames the convention layers on top of
- `ams://canon/principles/own-stream-echo-must-be-filtered` — convention 6 expanded
- `ams://canon/principles/operator-as-subscriber` — the human-in-conversation pattern that pairs with this
- `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai` — wrapper-side requirements for the demo gate
- `ams://canon/constraints/permanent-non-goals` — why this lives in canon convention rather than wire spec
