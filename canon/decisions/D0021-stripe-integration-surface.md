---
uri: ams://canon/decisions/D0021-stripe-integration-surface
title: "D0021 — Stripe Integration Surface for Agent-Payment Rails"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "decision", "integration", "billing", "agent-economy", "stripe", "shared-payment-tokens", "streaming-payments"]
epoch: E0008.4
date: 2026-05-04
derives_from: "D0020-agents-as-customer-and-third-party-vas-substrate (the positioning this implements); D0006-dream-house-wire-edge-wrappers (billing concerns live in the wrapper layer, not the wire); D0016-buffering-and-persistence-as-wrapper-primitive (the first metered value-added service); PROTOCOL.md §3.1 (the account-creation surface this extends); Stripe Sessions 2026 announcements (April 29) introducing Streaming Payments, Link wallet for agents, Issuing for agents, Shared Payment Tokens, the Agentic Commerce Protocol with Anthropic on the early-partner list, and Stripe Projects (let agents sign up for and purchase services)."
complements: "D0006-dream-house-wire-edge-wrappers, D0016-buffering-and-persistence-as-wrapper-primitive, D0019-cross-session-continuity-via-account-conversation-keying, D0020-agents-as-customer-and-third-party-vas-substrate"
governs: "How AMS integrates with Stripe's agent-payment rails. Where billing and metering events fire. How agent-driven account creation works. How Shared Payment Tokens authorize ad-hoc value-added-service purchases. How Streaming Payments meter token-speed usage. The boundary between AMS's billing surface and Stripe's payment surface — both kept thin."
status: active
---

# D0021 — Stripe Integration Surface for Agent-Payment Rails

> Agent-driven signup, ad-hoc per-stream value-added-service purchases, and token-speed metered billing all integrate via Stripe's 2026 agent-payment rails. AMS does not build payment infrastructure; it integrates the rails Stripe published. The integration surface is deliberately thin: account-credential issuance binds to a Stripe payment surface (Link wallet, Shared Payment Token, or Stripe Projects sign-up), metered usage events fire from the wrapper layer (never from the wire), and per-purchase capability provisioning rides on Shared Payment Tokens scoped by amount, time, and merchant.

## Description

`D0020` commits to agents-as-customer with AMS as substrate. That commitment is mechanically credible only because Stripe Sessions 2026 (2026-04-29) shipped the rails it requires: Streaming Payments for token-speed micropayments, Link wallet for agents with programmatic OAuth access, Issuing for agents with virtual cards scoped by spending controls, Shared Payment Tokens (SPTs) as a payment primitive scoped by business/time/amount, the Agentic Commerce Protocol as an open standard, and Stripe Projects to let agents sign up for and integrate services autonomously. Anthropic is named on Stripe's ACP early-partner list.

This decision specifies how AMS plugs into those rails without absorbing payment-infrastructure concerns into the substrate. The discipline parallels `D0006`: the wire never grows runtime-specific concerns; the wire never grows payment-specific concerns either. Billing-related logic lives in the wrapper layer (specifically, in the existing MCP edge wrapper and in a new lightweight billing-aware control-plane surface), not in the Conversation DO.

The integration is intentionally thin because both surfaces — Stripe's and AMS's — are designed to be substrate. AMS owns identity (account_id, namespace), authorization (per-conversation admission, per-stream ownership), and the wrapper-layer primitives. Stripe owns payment authorization, fraud detection, settlement, and the buyer-merchant relationship. The integration documents how identity from one surface unlocks capability on the other; it does not duplicate either surface.

## Outline

- The Three Integration Surfaces
- Agent-Driven Account Creation
- Per-Purchase Capability Provisioning via Shared Payment Tokens
- Metered Usage via Streaming Payments
- Where the Code Lives
- What AMS Owns vs What Stripe Owns
- The Operator Funding Path Still Works
- What This Forecloses
- What This Is Not
- Reversibility
- See Also

---

## The Three Integration Surfaces

Three flows integrate AMS with Stripe's agent-payment rails. Each is independent; an account can use any subset.

1. **Account creation.** An agent (or its operator) creates an AMS account, optionally backed by a Stripe billing relationship. Without the Stripe link, accounts get the no-buffering free tier. With the Stripe link, accounts get whatever capability they purchase.

2. **Per-purchase capability.** An agent activates a value-added service (for example, buffering on a specific conversation/stream, or an archive subscriber's storage tier) by presenting a Shared Payment Token scoped to AMS as the merchant, bounded by an amount and a time window. AMS validates the SPT, provisions the capability for the (account, conversation, stream) scope, and submits the SPT for settlement.

3. **Metered usage.** Streaming-style consumption (tokens emitted, tokens received, buffering bytes-seconds, wrapper-CPU-time, whatever metric a tier measures) fires meter events to Stripe's Streaming Payments surface. Stripe handles the micro-settlement; AMS sees a per-meter-event success/failure signal that may govern whether to continue providing service.

These three flows are deliberately independent so that operator funding (humans paying for their agents) and agent autonomy (agents buying their own service) coexist without separate infrastructure.

## Agent-Driven Account Creation

`PROTOCOL.md` §3.1 currently documents `POST /v1/accounts` as unauthenticated and free. This decision adds an authenticated variant, leaving the existing surface unchanged for the no-buffering free tier:

```
POST /v1/accounts
Authorization: Bearer <stripe-link-oauth-token | spt-identifier | stripe-projects-credential>
X-AMS-Billing-Source: link | spt | projects
Content-Type: application/json

{
  "namespace": "klappy",
  "billing_intent": "tier_subscription | metered | ad_hoc"
}
```

The optional `Authorization` header carries one of three Stripe-issued artifacts:

- **Link OAuth access token** — for agents that have completed the Link wallet OAuth flow (per Stripe's Link-for-agents documentation). The agent's parent operator has authorized the agent to spend on AMS up to whatever scope the OAuth grant defines. AMS verifies the token against Stripe's introspection endpoint and binds the resulting customer identity to the new account.
- **Shared Payment Token identifier** — for agents that received an SPT scoped to AMS as the merchant. AMS uses the SPT to create the initial PaymentIntent (a setup intent for future metered billing, or the first ad-hoc charge if `billing_intent: ad_hoc`).
- **Stripe Projects credential** — for agents that signed up via Stripe Projects' agent-driven service-provisioning flow. AMS treats this as an authoritative agent identity and provisions the account.

The `X-AMS-Billing-Source` header tells AMS which artifact shape the Authorization header carries (avoiding ambiguity in token format).

The `billing_intent` field declares what kind of billing relationship the agent wants. `tier_subscription` means a recurring subscription tier (Stripe Subscriptions backing). `metered` means usage-based billing (Streaming Payments backing). `ad_hoc` means no ongoing relationship — pay per purchase via subsequent SPTs (in which case the initial token may just be a verification charge, refunded immediately).

Successful account creation returns the same payload as today's unauthenticated path, with one addition: a `billing_handle` field carrying an opaque AMS-issued identifier that future per-purchase or metered events reference. The agent stores this alongside its `credential`.

## Per-Purchase Capability Provisioning via Shared Payment Tokens

For ad-hoc capability activation (the "spend a penny on this conversation's buffer" flow), an agent presents an SPT scoped to AMS. The new control-plane endpoint:

```
POST /v1/{namespace}/capabilities
Authorization: Bearer <ams-account-credential>
X-AMS-SPT: <shared-payment-token-identifier>
Content-Type: application/json

{
  "scope": {
    "conversation_id": "conv_01H...",       // optional
    "stream_id": "str_01H..."               // optional
  },
  "capability": "buffering",                // or "archive", "translation", "..."
  "parameters": { "ttl_seconds": 3600, "max_bytes": 10485760 },
  "duration_seconds": 86400                 // capability lifetime
}
```

AMS validates the SPT against Stripe's verification endpoint, confirms the SPT amount is sufficient for the requested capability/parameters/duration, charges the SPT, provisions the capability for the requested scope, and returns a `capability_handle` that wrappers can reference when reading their effective configuration.

Wrappers (the buffering primitive's `StreamBufferDO`, the MCP edge wrapper, third-party VAS wrappers) read effective capability configuration via an internal call to the control plane keyed by `(account_id, conversation_id, stream_id, capability)`. Provisioned capabilities expire at `duration_seconds`, evicted lazily.

This is the "agents buy their own phone service" flow made concrete. It composes with `D0020`'s third-party VAS positioning: a third-party VAS provider can issue its own SPTs (scoped to itself, not AMS) for its own services; AMS doesn't need to know the third party exists.

## Metered Usage via Streaming Payments

For accounts on `metered` billing intent, AMS fires meter events to Stripe's Streaming Payments backend at a cadence and granularity defined per tier. The wrapper layer is the firing site — never the Conv DO, never the wire-level broker.

The meter event surface (intentionally unspecified at the protocol level; this is wrapper-implementation detail) carries:

- `account_id` (AMS's identity for the customer)
- `billing_handle` (the Stripe-side correlation token issued at account creation)
- `meter_name` (e.g., `tokens_emitted`, `bytes_buffered`, `wrapper_cpu_ms`)
- `value` (the metric increment for this event)
- `timestamp` (event time in UTC)
- `dimensions` (free-form key-value, e.g., `tier=pro`, `region=ord`, `stream_id=...`)

Cadence and granularity are tunable. A naive implementation fires a meter event per token emitted, but that produces operationally large traffic to Stripe; production deployments typically batch into time-windowed aggregates (every 5 seconds, every minute, etc.). The batching strategy is implementation detail and may evolve without canon edits.

Stripe's Streaming Payments handles micro-settlement. AMS receives webhooks for failures, account-balance-low signals, and similar; the wrapper layer responds by degrading service appropriately (suspending the buffering primitive's writes, emitting a `stream_metadata` discontinuity per `D0016`'s upstream-state convention, etc.). The degradation policy is product-tier-specific and lives in `POC-INFRA.md` or a configuration document, not in canon.

## Where the Code Lives

The integration surface is split across three places, none of which is the wire:

- **Control plane (Worker)** — handles `POST /v1/accounts` with billing source, `POST /v1/{ns}/capabilities`, and the SPT verification calls to Stripe. Stays in the existing Worker but adds a `billing/` module. The Worker code may make outbound HTTPS calls to Stripe's API; this is acceptable per `D0006` because the Worker is not the wire (the Conversation DO is).
- **MCP edge wrapper (Session DO)** — fires meter events for usage that flows through it. The Session DO already accumulates per-tenant cursor state per `D0019`; meter accumulation is a small extension.
- **`StreamBufferDO`** (per `D0016`) — fires meter events for storage utilization (bytes-seconds buffered, eviction sweeps, read calls). The DO already tracks the data needed for these metrics.

The Conversation DO does not learn about billing. It does not fire meter events; it does not check capability provisioning; it does not call Stripe. It serves the wire, full stop. Billing-aware behavior happens before the broker (capability checks at connect time, in the control plane) or after the broker (meter events from the wrapper layer).

## What AMS Owns vs What Stripe Owns

| Concern | Owner |
|---|---|
| Account identity (account_id, namespace, AMS credential) | AMS |
| Conversation admission, stream ownership, wire authorization | AMS |
| Capability provisioning state (which scope has what capability for how long) | AMS |
| Wrapper-layer primitives (buffering, persistence, etc.) | AMS |
| Customer payment identity (Stripe Customer) | Stripe |
| Payment method storage (cards, banks, stablecoins) | Stripe |
| Authorization to spend (OAuth grants, SPT scopes, spending limits) | Stripe |
| Fraud detection (Radar) | Stripe |
| Micro-settlement (Streaming Payments + Tempo blockchain) | Stripe |
| Buyer-merchant invoicing and dispute resolution | Stripe |

The boundary is principled: AMS owns the substrate's mechanics; Stripe owns the financial relationship. Each is the substrate in its own domain. The integration document this decision produces is the contract between the two; it should be readable by an agent that does not know either domain in depth.

## The Operator Funding Path Still Works

A human operator who wants to fund their agent's AMS usage without giving the agent autonomous Stripe access can do so via Stripe's existing patterns: top up the agent's Link wallet with a budget, provision SPTs scoped to AMS with limits, set spending policies that require approval. None of this requires AMS-side changes; the agent presents whichever artifact the operator's funding model produces, and AMS treats it identically regardless of whether the agent obtained it autonomously or was handed it by a human.

This satisfies the common organizational pattern where an enterprise IT department wants centralized control over AMS spend without forbidding individual agents from making per-conversation purchasing decisions within budget. The same control-plane surface serves both modes.

## What This Forecloses

- **First-party AMS billing infrastructure.** AMS does not build its own billing system, payment processing, fraud detection, or invoicing. These are Stripe's responsibility. AMS's billing surface is a thin integration layer; it does not contain a billing system.
- **Multiple payment providers in v1.** This decision integrates Stripe specifically. Other agent-payment rails may emerge; integrating them is a separate decision, not a parallel implementation. The integration shape is generalizable (account-creation auth + capability provisioning + meter events) but the connector to a specific provider is per-provider work.
- **Cross-account credit transfer at the AMS layer.** If account A wants to fund account B's AMS usage, that flow happens through Stripe (operator-level funding patterns), not through an AMS-internal credits system.
- **Billing-aware behavior in the wire.** The Conv DO never learns about Stripe, never fires meter events, never checks capability state. All billing behavior is wrapper-side.

## What This Is Not

- **Not a partnership announcement.** This decision integrates publicly published Stripe infrastructure. It does not claim a special partner relationship; it does not require one. Any AMS deployment can integrate the same rails.
- **Not a complete billing specification.** Tier definitions, meter cadences, retention windows, refund policies, and similar product-level detail are out of scope and live in product documentation that may evolve without canon edits. This decision specifies the architectural integration shape; the product-level detail rides on top.
- **Not a permanent commitment to Stripe.** The integration shape (account-auth + capability + meter) is generalizable. If a future agent-payment rail emerges that better serves AMS's customers, integrating it is incremental work, not a re-architecture. The wire and the wrapper layer don't change; a parallel billing connector lands alongside the Stripe one.
- **Not a replacement for D0020.** D0020 commits to agents-as-customer and substrate-not-application. This decision is the mechanical specification of how the billing rails support that commitment. They are companion decisions, not redundant ones.

## Reversibility

**Two-way door at the connector level, one-way door at the architectural-integration level.** A specific Stripe integration can be replaced or supplemented (a parallel rails connector can land alongside it without breaking existing customers). But the architectural commitment — billing lives in the wrapper layer, the wire never learns about it — is one-way once production traffic depends on it.

The path of least regret: integrate Stripe deeply (because the rails are already shipped and broadly adopted), keep the integration shape generalizable so a future provider could plug in with similar effort, and never let billing concerns leak into the wire.

## See Also

- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` — the architectural commitment that keeps billing out of the wire
- `ams://canon/decisions/D0016-buffering-and-persistence-as-wrapper-primitive` — the first metered value-added service AMS itself ships
- `ams://canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying` — the Session DO keying that hosts per-tenant meter accumulation
- `ams://canon/decisions/D0020-agents-as-customer-and-third-party-vas-substrate` — the positioning this implements
- `PROTOCOL.md` §3.1 — the account-creation surface this extends
- `POC-INFRA.md` — the implementation site for the billing module and meter-event firing
- Stripe documentation: Agentic Commerce Protocol, Shared Payment Tokens, Link wallet for agents, Issuing for agents, Streaming Payments, Stripe Projects (all announced at Stripe Sessions 2026-04-29)
