---
uri: ams://canon/principles/own-stream-echo-must-be-filtered
title: "Own-Stream Echo Must Be Filtered — DEPRECATED, superseded by D0009"
audience: canon
exposure: nav
tier: 3
voice: neutral
stability: deprecated
tags: ["ams", "canon", "principle", "subscriber", "echo", "loop-prevention", "deprecated", "superseded"]
epoch: E0008.4
date: 2026-05-01
derives_from: "Original derivation: PROTOCOL.md §4.1 (server pushes own-stream tokens to client) under the pre-D0009 wire model. Now superseded."
superseded_by: "ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription"
governs: "Nothing in current canon. Retained as a redirect for legacy references."
status: deprecated
---

# Own-Stream Echo Must Be Filtered — DEPRECATED

> This principle is deprecated. The wire no longer delivers a stream's tokens to its owning account. There is no echo to filter at the subscriber level. See `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` for the current rule.

## Why This Was Deprecated

This principle existed because the previous wire model (`PROTOCOL.md` §4.1, pre-D0009) delivered every token from every stream in a conversation to every connected subscriber, including the subscriber's own emissions. Under that model, every conversational AI subscriber, every wrapper, and every harness had to remember to filter on `owner_account_id` before treating an inbound token as input. Forgetting the filter produced an infinite self-response loop.

The principle was load-bearing because the design was load-bearing the wrong way. It moved the burden of correctness onto every subscriber.

D0009 moves the burden into wire structure. Ownership and subscription are now mutually exclusive states: an account that owns a stream is structurally not a subscriber to that stream, and the wire never delivers a stream's tokens to its owner. There is no echo. The bug class this principle prevented is now unrepresentable at the wire layer.

## What Replaces This

- **The structural rule.** `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` is the canonical source for stream-scoped delivery and the exclusion of self-echo.
- **The wire conformance commitment.** `ams://canon/constraints/wire-conformance` MUSTs #4, #5, and #6 enforce stream-scoped broadcast and the structural exclusion. A broker that echoes own-stream tokens by default is non-conformant.
- **The opt-in escape hatch.** A subscriber that genuinely wants to read its own stream (debug, replay, certain audit patterns) may opt into self-subscription. The default is exclusion; the door is open if needed.

## Backward Compatibility

A subscriber implementation built before D0009 that filters its own emissions on the input side remains correct under D0009 — the filter just becomes a no-op because the wire never sends self-echoes. No code change is required to remain correct; the filter is now redundant rather than load-bearing.

A wrapper that previously implemented the SHOULD-filter recommendation in `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai` may strip the filter logic in a future revision; the wrapper conformance article is being updated to reflect this.

## See Also

- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — the rule that replaces this principle
- `ams://canon/constraints/wire-conformance` — the MUSTs that enforce the new model
- `ams://canon/constraints/two-agent-conversation-conventions` — convention layer, with the former echo-filter convention removed
- `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai` — wrapper conformance, simplified under D0009
