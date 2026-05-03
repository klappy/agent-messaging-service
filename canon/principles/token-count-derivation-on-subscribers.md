---
uri: ams://canon/principles/token-count-derivation-on-subscribers
title: "Token-Count Derivation on Subscribers — A Wire-Layer Approximation, Named as Such"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: stable
tags: ["ams", "canon", "principle", "observability", "tokens", "tokenizer", "approximation", "naming-honesty", "vodka-architecture"]
epoch: E0008.3
date: 2026-05-03
derives_from: "ams://canon/decisions/D0010-observability-via-subscriber-not-wire, ams://canon/constraints/observability-payload-boundary §'Shape, not substance' (token_count entry), klappy://canon/constraints/telemetry-governance §'Tokenizer Choice', PROTOCOL.md §7 (payload opacity)"
complements: "ams://canon/decisions/D0015-state-totals-via-snapshot-worker, ams://canon/principles/wire-layer-latency-vocabulary, ams://canon/principles/observability-as-subscriber"
governs: "How an observability subscriber computes token counts from opaque wire payloads, how the result is labeled, and what the wire layer is forbidden from claiming about provider-side billing tokens. Recommended convention; deployments may use other tokenizers if they document the substitution and the drift."
status: active
---

# Token-Count Derivation on Subscribers — A Wire-Layer Approximation, Named as Such

> The AMS wire transports opaque token `data` (`PROTOCOL.md` §7). The broker does not parse it; the wire does not know what it represents. An observability subscriber that wants to report "tokens" derives a count by running a tokenizer over the bytes — at best an approximation of any specific provider's billing-tokens. The principle commits to a single reference tokenizer, names the drift, forbids silent labeling as billing-canonical, and documents why provider `usage` blocks are not accessible at the AMS layer.

## Description

`observability-payload-boundary` lists `token_count` in the "Shape, not substance" allowlist — observability sinks may capture token counts but never the bytes themselves. The constraint is a privacy commitment; it does not specify how the count is computed. The how matters: different tokenizers produce different counts on the same bytes, and an unspecified procedure invites every subscriber to invent one and disagree about the resulting numbers.

The upstream telemetry doctrine (`klappy://canon/constraints/telemetry-governance` §"Tokenizer Choice") established the precedent: use `cl100k_base` (GPT-4's tokenizer) as a tokenizer-agnostic proxy for "payload token shape," with the understanding that counts diverge from any specific provider's tokenizer by approximately 3–4 percent on English prose. The doctrine framed the choice as "not billing-accurate for any specific consumer model" and accepted the drift for the questions telemetry exists to answer.

This principle imports the choice and the framing into AMS, plus a correction that does not arise upstream. **Provider `usage` blocks — the canonical billing-token counts emitted by Anthropic, OpenAI, and others — are not accessible at the AMS layer.** AMS is a broker between agents (`AMS.md` §3); the agents call providers; the wire transports opaque tokens between agents. Provider responses, including their `usage` metadata, never traverse the AMS wire. Any "billing-accurate" token count must come from the agent layer, not the broker. The wire-layer count is an approximation; the principle insists on labeling it as one.

## Outline

- The Reference Tokenizer
- What the Subscriber Computes
- What the Subscriber Cannot Compute (Provider Usage)
- The Drift, Quantified
- Schema Slot Allocation
- Frame-Count vs Token-Count: Different Questions
- Why Naming This Matters
- What This Is Not

---

## The Reference Tokenizer

The AMS reference deployment uses `gpt-tokenizer/encoding/cl100k_base` for wire-layer token counts. The choice mirrors the upstream rationale:

- **Empirical performance.** On the V8 runtime that backs Cloudflare Workers, `cl100k_base` benchmarks roughly six times faster than `@anthropic-ai/tokenizer` (WASM) on payload sizes between 200 B and 50 KB, with a more predictable p95 (no WASM memory-grow spikes). Bench methodology and results are documented in `klappy://canon/constraints/telemetry-governance` §"Tokenizer Choice" and `klappy://canon/constraints/measure-before-you-object`.
- **Bundle cost.** Approximately 432 KB gzipped — comfortably within Workers paid-tier limits.
- **Cross-provider neutrality.** No tokenizer is correct for every provider; cl100k is a single consistent reference that drifts predictably from each provider rather than being correct for one and unbounded for others.

Other deployments may select a different tokenizer (e.g., `o200k_base` for GPT-4o-style payloads, the Anthropic WASM tokenizer for Claude-only deployments). Deployments that substitute document the substitution in their service docs and accept that cross-deployment comparisons of "token_count" require a conversion factor.

## What the Subscriber Computes

For each `token` frame the subscriber observes, it derives:

```
token_count_estimate = cl100k_base.encode(frame.data).length
```

Aggregated per stream per conversation, this gives the per-stream token total for the conversation. Aggregated across streams, this gives the conversation token total. Aggregated across conversations under one account, this gives the account token total — the headline number for "how many tokens did this account move through the wire."

**Computation happens off the broker's hot path.** Per `ams://canon/decisions/D0010-observability-via-subscriber-not-wire`, observability subscribers are peers, not middleware. The broker emits the frame to every subscriber per its broadcast rule; the observability subscriber tokenizes the bytes in its own runtime. The hot path is unchanged. Per `ams://canon/principles/observability-as-subscriber` §"The Recommended Subscriber Pattern", the subscriber does not block, slow, or modify the broadcast.

The byte length is also captured (`bytes` field in the subscriber-layer record per `observability-payload-boundary` §"The Subscriber-Layer Schema"). Bytes and tokens are independently useful; the principle does not allow substituting one for the other in any dashboard column.

## What the Subscriber Cannot Compute (Provider Usage)

The provider `usage` block — Anthropic's `{input_tokens, output_tokens}`, OpenAI's `{prompt_tokens, completion_tokens, total_tokens}`, and equivalents — is the billing-canonical count for any specific provider call. **This block does not traverse the AMS wire.**

The path of a provider call:

1. Agent peer holds a model API key and SDK.
2. Agent calls the provider (Anthropic, OpenAI, Bedrock, etc.) directly over the public internet.
3. Provider responds with content + a `usage` block.
4. Agent receives both. The agent decides what to do with the content.
5. Agent emits zero, one, or many `token` frames into AMS conversations.

The provider response, including `usage`, never enters AMS. The broker has no API key, makes no provider calls, and sees no provider responses. The wire carries only what the agent emits; agents do not customarily emit their billing metadata into conversations.

A subscriber cannot retrieve provider usage by:

- Inspecting `token.data` — `data` is opaque per `PROTOCOL.md` §7; even if an agent wrote `{"usage": {...}}` into `data`, the boundary doc forbids the subscriber from inspecting it (`observability-payload-boundary` §"The Capture Blocklist", first item).
- Reading metadata values — metadata values are blocked from the sink by the same boundary (the keys are observable; the values are not).
- Calling the provider itself — the subscriber has no provider credential and would be calling for a different prompt anyway; the result would not match what the agent saw.

If billing-accurate counts are operationally required, **they must be captured at the agent layer**, by the agent that made the provider call, and surfaced through whatever observability path the agent chooses (its own metrics endpoint, its own application logs, its own out-of-band reporting). The AMS wire is the wrong layer for that data and the principle does not invent a way to obtain it.

## The Drift, Quantified

The drift between cl100k_base and provider tokenizers is bounded but real:

- **vs Anthropic's tokenizer (Claude family):** ~3–4% on English prose; larger on code, mathematical notation, and non-Latin scripts.
- **vs OpenAI's o200k_base (GPT-4o family):** Smaller, since both descend from BPE on similar corpora; ~1–2% on typical payloads.
- **vs OpenAI's cl100k itself (GPT-4-turbo and earlier):** Identity for the GPT-4 family; this is the original use of the tokenizer.

The drift is acceptable for the questions wire-layer telemetry exists to answer:

- Which accounts move the most token volume? (Drift is a constant factor per account if their payload distribution is similar.)
- Which conversations are token-heavy? (Same.)
- Has token volume per account spiked? (Drift is constant over time for a stable payload mix.)

The drift is unacceptable for:

- Reconciling against provider invoices. (Use provider usage at the agent layer.)
- Cross-provider cost comparison. (Drift differs by provider; the comparison is contaminated.)
- Per-token billing of an account by the broker operator. (The broker is not the priced layer; if the broker bills, it bills on bytes or on a flat per-conversation fee, both honest at the wire layer.)

Dashboards that display the wire-layer token count label it `token_count_estimate` or include a `(cl100k approximation, ~3–4% drift from provider tokenizers)` footer. Operators who omit the disclosure invite the misreadings the principle exists to prevent.

## Schema Slot Allocation

The subscriber-layer record from `observability-payload-boundary` already names a `bytes` field on `token` records. This principle extends the recommended subscriber-layer record:

```json
{
  "kind": "token",
  "conversation_id": "conv_01H...",
  "stream_id": "str_01J...",
  "owner_account_id": "acc_01J...",
  "ts": "2026-05-03T13:14:22.140Z",
  "bytes": 1024,
  "token_count_estimate": 234,
  "tokenizer": "cl100k_base"
}
```

`tokenizer` is required when `token_count_estimate` is non-null so downstream consumers can apply the right conversion factor if they need one.

For the hook-layer Analytics Engine dataset, token-count aggregates land in the activity stream's existing slot pattern. A subscriber that aggregates writes one row per stream per close (or per N-minute window) with `event_type='stream_token_summary'`, the metric name in `endpoint_or_close_code` (e.g., `tokens_estimate`, `bytes_total`), and the value in `peer_count_at_event` — consistent with the snapshot-worker reuse pattern in `ams://canon/decisions/D0015-state-totals-via-snapshot-worker`. No new slot is introduced.

## Frame-Count vs Token-Count: Different Questions

A `token` frame is a unit of wire transport. A token (in the LLM sense) is a unit of language modeling. They are not the same.

- **Frame count** = number of `token` frames emitted on a stream. Always exactly known at the wire layer; counted directly without a tokenizer. Useful for "how chatty was the agent" and for measuring wire-level ordering and timing.
- **Token-count estimate** = sum of cl100k tokens across all frame `data` payloads. An approximation per the drift discussion above. Useful for "how much language did the agent generate."

A dashboard that needs both presents them as distinct columns. A dashboard that needs only one names which one. The wire layer maintains the distinction.

## Why Naming This Matters

Three failure modes the principle prevents.

**Billing fabrication.** A "tokens used" column derived from cl100k that an operator interprets as "tokens billed" silently miscounts every invoice. The number is not wrong as a relative measure; it is wrong as an absolute one. The label `token_count_estimate` plus the tokenizer name is the discipline that prevents this misreading.

**Cross-deployment number-matching.** Two AMS deployments that pick different tokenizers report different "tokens" for the same workload. Without a documented tokenizer field, a comparison treats the two numbers as equivalent. The `tokenizer` field plus the convention to disclose the choice in service docs makes the comparison honest or impossible — both better than silently wrong.

**Architectural-layer confusion.** An operator who believes the wire knows about provider usage may design infrastructure that asks the wire for billing data, push for new metadata fields to "expose" what the wire never had, or build dashboards that present the question as answered when it is not. Naming the layer ("agent, not wire") and the limit ("provider usage is not on the wire") closes the loop.

## What This Is Not

- Not a refusal to display billing-accurate counts in any AMS-adjacent dashboard. Dashboards that combine wire-layer telemetry with agent-layer usage data are valuable and supported. The principle requires that the two columns be distinguishable and labeled by source layer.
- Not a tokenizer endorsement beyond "consistent reference." cl100k is the reference because it benches well on Workers and was already the upstream choice. Future re-evaluation against a faster, equally-portable tokenizer is welcome under the same principle.
- Not specific to LLM agents. A non-LLM agent (a webhook adapter, a sensor relay, an image-bearer) produces frames whose `data` is bytes, and cl100k will tokenize those bytes too. The number is "cl100k tokens of those bytes" and is honestly such; whether it is operationally meaningful for a non-LLM workload is the operator's call.
- Not a wire protocol change. Tokenization happens entirely on the subscriber side. Nothing is added to the wire; nothing is required of any peer.
- Not a block on agents emitting their own usage telemetry. An agent that wants to publish its provider usage may emit it on a side channel of its own choosing — its own metrics endpoint, its own conversation-metadata declaration scoped to its own stream, its own off-broker reporting. The wire neither requires this nor forbids it; the principle forbids the broker from inferring it.

## See Also

- `ams://canon/decisions/D0010-observability-via-subscriber-not-wire` — the architectural commit that puts derivation on subscribers
- `ams://canon/decisions/D0015-state-totals-via-snapshot-worker` — sister gap-fill, schema-slot reuse pattern
- `ams://canon/principles/wire-layer-latency-vocabulary` — sister gap-fill on TTFF/TTFT honesty
- `ams://canon/constraints/observability-payload-boundary` — the schema this principle extends and the allowlist that admits `token_count`
- `PROTOCOL.md` §7 — payload opacity rule the principle respects
- `klappy://canon/constraints/telemetry-governance` §"Tokenizer Choice" — upstream rationale the AMS reference inherits
- `klappy://canon/constraints/measure-before-you-object` — the bench-first methodology behind the tokenizer choice
