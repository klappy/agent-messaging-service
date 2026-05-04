---
uri: ams://canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying
title: "D0019 — Cross-Session Continuity via Account-Conversation Keying"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: stable
tags: ["ams", "canon", "decision", "mcp", "edge-wrapper", "session-state", "account-model", "vodka-architecture"]
epoch: E0008.4
date: 2026-05-04
derives_from: "D0006-dream-house-wire-edge-wrappers (the wrapper layer this re-keys); D0016-buffering-and-persistence-as-wrapper-primitive (the primitive this enables to outlive a single MCP transport session); POC-INFRA.md §6.1 (the current Session DO design this revises); SPEC.md §5 (relationship to lifted deferrals); operator↔Claude planning conversation 2026-05-04 establishing that turn-based MCP clients open a fresh transport session per turn and that buffer continuity requires re-keying."
complements: "D0006-dream-house-wire-edge-wrappers, D0016-buffering-and-persistence-as-wrapper-primitive, D0018-multi-stream-per-account-per-conversation"
governs: "How the MCP edge wrapper's Session DO is keyed when buffering is enabled. The lifecycle of Session DOs across MCP transport sessions. Concurrent-session semantics within a single account. The lifecycle rules that prevent zombie state."
status: active
---

# D0019 — Cross-Session Continuity via Account-Conversation Keying

> When buffering is enabled (per `D0016`), the MCP edge wrapper's Session DO is keyed by `(account_id, conversation_id)`, not by `mcp_session_id`. The Session DO survives across MCP transport sessions, enabling deterministic resume after disconnect. Concurrent MCP sessions under the same account share the Session DO as cooperative tenants. Lifecycle rules are explicit and bounded.

## Description

`POC-INFRA.md` §6.1 keys the MCP Session DO by `mcp_session_id` from the Streamable HTTP session header, with the explicit note that the buffer is "discarded when the session ends." This was correct for the original use case — a single bound MCP session, one round-trip with the model, ephemeral state.

It is incorrect for the use cases `D0016` introduces. Turn-based MCP clients (Claude in any IDE, Claude Desktop, claude.ai, Cursor) open a fresh MCP transport session per turn or per process restart. Two turns under the same Authorization bearer produce two `mcp_session_id` values and, under the original keying, two Session DOs with disjoint state. The second turn starts cold; whatever the first turn buffered is lost the moment the first transport session closes.

Cross-session continuity — the ability to disconnect, reconnect, and resume from a stable cursor — requires Session DO state to outlive any individual MCP transport session. The keying that achieves this is the `(account_id, conversation_id)` pair: stable across transport sessions for the same account, distinct across accounts and across conversations.

This decision re-keys the Session DO accordingly and documents the lifecycle rules that prevent the re-keying from producing zombie state.

## Outline

- The Original Keying and Why It Was Right
- The New Keying and Why It Is Now Right
- Concurrent Sessions Within One Account
- Lifecycle Rules
- Risks Acknowledged
- Free Tier Behavior
- What This Forecloses
- What This Is Not
- Reversibility
- See Also

---

## The Original Keying and Why It Was Right

The original `mcp_session_id` keying matched the original assumption: an MCP session corresponds to a single agent's working session. State that scoped to that session was state that scoped correctly to the agent's intent. When the session closed, the agent had finished, and the state should go with it.

This is correct for stateless or single-shot uses of the MCP wrapper. It remains correct for the no-buffering free tier, which neither needs nor receives buffer continuity.

## The New Keying and Why It Is Now Right

For the buffered tier, the relevant identity is not "this transport session" but "this account's view of this conversation." Two MCP transport sessions under the same bearer attaching to the same conversation are not two separate agents; they are two attempts by the same account to interact with the same conversation, possibly concurrently, possibly serially.

Keying the Session DO by `(account_id, conversation_id)` makes the state's lifetime match the relevant identity. The DO survives until the account is no longer interested in the conversation. Reconnect-and-resume becomes deterministic: the second transport session reaches the same DO instance with the same buffer state.

The keying is invisible to the wire. The Conversation DO sees the Session DO as a single subscriber regardless of how many MCP transport sessions are attached to it. `D0006`'s wrapper boundary holds.

## Concurrent Sessions Within One Account

Multiple MCP transport sessions may attach to a single Session DO concurrently. The Session DO operates as a multi-tenant component within a single account: each transport session is tracked by its `mcp_session_id` as a tenant, sees the same buffer state (read coherence), and may emit independently (write isolation per `D0018`).

Concrete semantics:

- **Reads.** Every attached transport session sees the same buffer view and can independently call `ams_recv` with its own cursor. Their cursors are tracked separately so each tenant advances at its own pace.
- **Writes.** Each transport session may register its own stream(s) under the account, per `D0018`. Streams owned by the account are owned by the Session DO; the transport session that registered a stream is the active emitter for that stream during its lifetime.
- **Notifications.** Server-pushed `notifications/ams/*` are delivered to every transport session that is holding an open Streamable HTTP response, in parallel.

There is no priority among concurrent transport sessions. They cooperate; they do not compete. A transport session that closes simply removes itself from the tenant set; the Session DO continues serving the remaining tenants, or — if none remain — enters the idle state defined in Lifecycle Rules below.

## Lifecycle Rules

The Session DO's lifetime is bounded explicitly:

- **Idle timeout.** When the last attached MCP transport session closes, the Session DO enters idle. After a configurable idle period (matched by default to the buffer's TTL configuration per `D0016`), the Session DO is torn down and its state discarded.
- **Buffer expiration.** Independent of the idle timeout, the Session DO's buffer evicts entries per `D0016`'s TTL and size bounds. If the buffer is empty and the DO is idle, the DO is eligible for early teardown at the implementation's discretion.
- **Account deletion.** When an account is deleted, all Session DOs keyed to that account are torn down and their state discarded.
- **Conversation deletion.** Conversation deletion is not currently a control-plane operation. If it is added in a future revision, conversation deletion implies tearing down all Session DOs keyed to that conversation across all accounts.
- **Configuration change.** Tier downgrades that reduce TTL or size cap are applied at the next eviction sweep, not retroactively. A downgrade does not destroy state that was valid under the previous tier.

These rules guarantee that Session DOs do not accumulate indefinitely. The idle timeout is the primary garbage-collection mechanism; buffer expiration is the secondary one; account and (eventual) conversation deletion are the explicit discharge mechanisms.

## Risks Acknowledged

Three risks are accepted by this decision and named here so future operators inherit them eyes-open:

- **Credential blast radius.** Under the original keying, leaking a bearer leaks "act as me in active transport sessions." Under the new keying, leaking a bearer leaks "read all my buffered conversation state." The wrapper's storage becomes a higher-value target. Mitigation lives in scopes / rotation / least-privilege bearers, none of which exist in v1; this is a deferred item to revisit when bearer-scope management ships.
- **Statefulness as a conscious tradeoff.** The original Session DO was ephemeral by design — state did not outlive requests. The re-keyed Session DO does outlive requests. This is a deliberate trade for the deterministic-resume capability `D0016` is built to deliver. The wire stays clean; the wrapper layer accepts the statefulness and the lifecycle obligations that come with it.
- **Multi-tenancy bugs are now possible within a single account.** Two concurrent transport sessions sharing a Session DO must not interfere with each other beyond the documented cooperation model. Implementation must ensure read coherence, write isolation, and clean tenant departure. Bug surfaces here did not exist under the original keying.

These are not blockers; they are obligations.

## Free Tier Behavior

The no-account demo path and the free tier (no buffering enabled) retain the original `mcp_session_id` keying. Their Session DOs remain ephemeral, scoped to one transport session, discarded at session close. Cross-session continuity is a paid-tier feature; no surface area is added to free-tier behavior.

This means the keying choice is determined per request by whether the account associated with the bearer has buffering enabled. A single Worker deployment serves both flavors of Session DO concurrently.

## What This Forecloses

- A future revision in which Session DO state survives account deletion. Account deletion is now defined as a discharge boundary; reversing this would compromise the account-as-trust-boundary model.
- A future revision in which concurrent transport sessions under one account compete rather than cooperate. The cooperation model is locked; introducing competition would require extensive new semantics for ordering, priority, and conflict resolution.
- Per-transport-session distinct buffers under a single account. The buffer is shared across tenants; an account that wants per-session isolation must use distinct accounts.

## What This Is Not

- Not a change to wire-level identity. `account_id` is already the wire's account identity per `PROTOCOL.md` §3.1; this decision uses that identity for keying, not introducing a new one.
- Not a server-side persistence of secrets. Bearer credentials are not stored in the Session DO; they are validated per request against the account they encode and discarded. The Session DO knows the `account_id` only.
- Not a sessions feature for the wire. The wire's notion of session is unchanged. This decision is purely about how the MCP edge wrapper organizes its own state.

## Reversibility

**One-way door once buffered tier is offered.** Clients on the buffered tier will rely on cross-session continuity for the resume capability they are paying for. Reverting to per-transport-session keying would silently break their resume guarantee.

The decision can be reversed before paid-tier launch with no consequences. After paid-tier launch, the keying is load-bearing.

## See Also

- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` — the wrapper layer this re-keys
- `ams://canon/decisions/D0016-buffering-and-persistence-as-wrapper-primitive` — the buffering primitive this enables to outlive transport sessions
- `ams://canon/decisions/D0018-multi-stream-per-account-per-conversation` — the multi-stream model that interacts with multi-tenant Session DO behavior
- `POC-INFRA.md` §6.1 — the original Session DO design this revises
- `PROTOCOL.md` §3.1 — the account identity used as a keying component
- `SPEC.md` §4, §5 — scope and deferral context
