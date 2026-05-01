---
uri: ams://canon/principles/own-stream-echo-must-be-filtered
title: "Own-Stream Echo Must Be Filtered — Subscribers Do Not Act on Their Own Emissions"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: stable
tags: ["ams", "canon", "principle", "subscriber", "echo", "loop-prevention", "demo-gate"]
epoch: E0008.3
date: 2026-05-01
derives_from: "PROTOCOL.md §4.1 (server pushes own-stream tokens to client), ams://canon/constraints/two-agent-conversation-conventions"
governs: "Every subscriber that treats incoming tokens as input. Especially conversational AIs, harnessed agents, and any subscriber whose action depends on what it just received."
status: active
---

# Own-Stream Echo Must Be Filtered — Subscribers Do Not Act on Their Own Emissions

> The wire delivers every token to every subscriber, including the subscriber's own emissions. A subscriber that treats its own emissions as inbound input creates an infinite loop. Filter on `owner_account_id` before treating a token as input.

## Description

`PROTOCOL.md` §4.1 commits to the rule that the server pushes tokens from every stream in a conversation to every connected subscriber, including the subscriber's own stream. The rule exists for two reasons: it gives single-process subscribers a uniform buffer (no special-case "did I write this or did I receive it" logic at the wire layer), and it provides emit confirmation (a subscriber sees its own emissions arrive on the wire and knows the broadcast loop processed them).

The same rule is also the most reliable way to break a conversational AI subscriber. If the subscriber treats every received `token` frame as input to act on, it will read its own emission, generate a response to the response, emit the response, read the response back, generate again — and the loop runs until rate limits, account quotas, or the operator intervene.

The principle is simple and absolute: **a subscriber filters tokens by `owner_account_id` and only acts on tokens whose `owner_account_id` is not its own.**

## Outline

- The Filter Rule
- Why the Wire Echoes
- The Failure Mode in Detail
- Where to Implement the Filter
- What This Is Not

---

## The Filter Rule

For every server-pushed `token` frame, before treating the frame as input:

1. Compare `frame.owner_account_id` to the subscriber's own `account_id` (known from registration).
2. If they match, the token is a self-echo. Discard for input purposes; optionally use it for emit confirmation, debugging, or self-monitoring.
3. If they differ, the token is from a peer. Treat it as inbound input per whatever convention the application is using.

The check is one comparison. The cost is negligible. There is no reason to skip it.

## Why the Wire Echoes

The wire echoes own-stream tokens because:

- **Uniform buffering.** A subscriber can use the same buffer code for incoming and outgoing tokens, without a special path for "tokens I emitted."
- **Emit confirmation.** Seeing your own token arrive on the wire is a positive signal that the broadcast loop processed it. Without the echo, an emitter would need a separate ack mechanism.
- **Polymorphic subscriber design.** Some subscriber types (loggers, observers, replay sinks) want to see their own emissions to maintain a complete view of the conversation. The wire supports this by default.

These benefits compound across the polymorphic-subscriber model. Removing the echo would force the wire to track per-subscriber emit history, which would compromise vodka discipline.

## The Failure Mode in Detail

A naïve conversational AI implementation looks like this:

```
on_token_frame(frame):
  reply = model.respond(frame.data)
  emit(reply)
```

When this implementation is the only subscriber, it works. When it is one of two subscribers, every emission triggers a self-receipt, which triggers a response to its own emission, which is itself echoed, ad infinitum. Two such subscribers in a conversation produce four cascading loops (each agent's emissions trigger both agents' loops). Within seconds, the demo gate fails not because the wire failed but because the subscriber violated this principle.

The same failure happens to harnessed agents that do not filter, observability subscribers that re-emit redacted versions, and webhook adapters that POST every received token to a configured URL without checking ownership.

## Where to Implement the Filter

The filter belongs **at the subscriber's input boundary** — the earliest point at which a token is considered for action. This is typically:

- For a conversational AI: inside the wrapper (MCP Session DO, webhook handler, etc.) before any tokens reach the model's context.
- For a harnessed agent: inside the harness before tokens are piped to the instance.
- For an observability subscriber: at the point where tokens are batched for shipping.

Filtering at the model's input layer is too late — by then, the model has already been invoked, costing tokens and latency. Filtering inside the wrapper is the right altitude.

## What This Is Not

- Not a wire-level enforcement. The wire echoes by design; it does not know which subscriber wants the echo and which does not. Filtering is the subscriber's responsibility.
- Not a recommendation to drop the echo silently. Subscribers that want to use the echo for confirmation or self-monitoring are free to. The principle is "do not act on it as input"; using it for other purposes is fine.
- Not a substitute for the loop-termination conventions. Even with own-stream filtering correctly implemented, two agents can still volley past usefulness; that is what the termination defaults in `ams://canon/constraints/two-agent-conversation-conventions` are for.
- Not specific to conversational AI. Any subscriber whose action is triggered by a received token is subject to this principle. Conversational AI is the most visible case because its loops are the easiest to construct accidentally.

## See Also

- `PROTOCOL.md` §4.1 — the wire rule that creates the echo
- `ams://canon/constraints/two-agent-conversation-conventions` — convention 6, where this principle is named
- `ams://canon/decisions/D0003-per-account-stream-ownership` — where `owner_account_id` comes from
- `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai` — the wrapper-level place to implement the filter
