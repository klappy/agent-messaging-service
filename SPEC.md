# AMS Spec / PRD

> Token stream routing.

**Status:** Locked for PoC. Last updated 2026-05-01.

This is the single source of truth for what the AMS PoC commits to ship and how we know we shipped it. The deeper docs ([`PROTOCOL.md`](./PROTOCOL.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`POC-INFRA.md`](./POC-INFRA.md), [`POC-PLAN.md`](./POC-PLAN.md), [`AMS.md`](./AMS.md), [`PATTERNS.md`](./PATTERNS.md)) are the reference layer. This doc is the contract.

When this doc and a deeper doc disagree, this doc wins until the next revision; deeper docs are then updated to match.

---

## 1. Problem

Two agents that need to coordinate in real time across machines, owners, and stacks have no foundation to do it on. Existing options are either human-shaped messaging (Slack, Discord, email) or opinionated full-stack agent frameworks that lock the user into a vertical. Teams running multiple agents in parallel become the manual copy-paste bus between them — the hackathon scenario in [`AMS.md`](./AMS.md) §1.

The async case is solved by oddkit-style journal handoffs. The real-time case is not.

## 2. Goal

Ship the **smallest possible substrate** that lets two agents (and any other polymorphic subscribers) exchange tokens through a magic-link-addressed conversation, with no human in the wire, by the end of the week.

This is a foundation play, not a product play. We are building dial tone, not phones — see [`AMS.md`](./AMS.md) §2.

## 3. Acceptance — How We Know We Shipped

The PoC is **done** when all of the following are observable, end-to-end, on the deployed infrastructure. These are the falsifiable conditions:

### 3.1 Smoke Test (mechanical)

Run after `wrangler deploy`. All five must pass:

1. `curl -X POST https://ams.covenant.dev/v1/accounts -d '{"namespace":"smoke"}'` returns `201` with a credential.
2. `curl -X POST https://ams.covenant.dev/v1/smoke/conversations -H "Authorization: Bearer <cred>" -d '{}'` returns `201` with a magic link.
3. Two `wscat` sessions on the magic link (with `/connect` appended) echo each other's `{"type":"token","data":"hello"}` frames in real time.
4. A Claude Code instance configured with the AMS MCP server can call `ams_create_conversation` and receive a magic link.
5. A second Claude Code instance (different bearer) can `ams_join` that link and `ams_send` a token; the first instance receives it (via push notification or `ams_recv`) within 5 seconds.

### 3.2 Demo Gate (real-world)

The end-to-end hackathon-replay scenario from [`POC-PLAN.md`](./POC-PLAN.md) §1, between two real agents on two physical machines:

- Klappy's Claude Code mints a conversation, returns the magic link.
- Klappy shares the link with Ian via Signal (one human action, accepted).
- Ian's Claude Code joins the conversation.
- Klappy's agent emits a token requesting a summary of the last commit on `truthkit-proxy`.
- Ian's agent receives the token, performs the work, emits the summary.
- Klappy's agent receives the summary.

**No copy-paste of message contents at any step.** That is the gate. Anything else passing while this fails is a fail.

### 3.3 Definition of Done (per `klappy://canon/constraints/definition-of-done`)

For the PoC ship to be claimed complete, the closeout artifact (a journal entry under `journal/`) must contain:

- **Change description** — what was deployed, where, with what config.
- **Verification performed** — the smoke test (3.1) was run; the demo (3.2) was attempted.
- **Observed behavior** — what actually happened, including any deviation from spec.
- **Evidence produced** — log excerpts, curl outputs, screenshots, or the recorded demo session.
- **Self-audit** — this section's items checked off; deferred items still in their boxes.

---

## 4. Scope — IN

| Component | Source of truth |
|-----------|-----------------|
| AMS wire protocol (control plane + WebSocket) | [`PROTOCOL.md`](./PROTOCOL.md) |
| Reference architecture (Worker + DOs + KV) | [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`POC-INFRA.md`](./POC-INFRA.md) §4 |
| MCP edge wrapper as the agent door | [`POC-INFRA.md`](./POC-INFRA.md) §3, [`PATTERNS.md`](./PATTERNS.md) §2 |
| Stream + conversation metadata slot | [`PROTOCOL.md`](./PROTOCOL.md) §4.4 |
| Account model (namespace + bearer credential) | [`PROTOCOL.md`](./PROTOCOL.md) §3.1 |
| Magic-link addressing (URL with permissive token) | [`PROTOCOL.md`](./PROTOCOL.md) §2 |
| Hosted reference deployment at `ams.covenant.dev` | [`POC-INFRA.md`](./POC-INFRA.md) §8 |
| Day-by-day execution plan | [`POC-PLAN.md`](./POC-PLAN.md) |

Specifically locked for v1:

- Six MCP tools: `ams_create_conversation`, `ams_join`, `ams_send`, `ams_set_metadata`, `ams_leave`, `ams_recv` (degradation path).
- Two MCP notifications: `notifications/ams/token`, `notifications/ams/stream_metadata`.
- One MCP resource: `ams://conversations/{conversation_id}`.
- Wire frames: `token`, `set_metadata`, `ping` (client→server); `joined`, `token`, `stream_joined`, `stream_left`, `stream_metadata`, `pong` (server→client).
- Conformance rules: [`PROTOCOL.md`](./PROTOCOL.md) §7, both must and must-not.
- One MCP binding mode: bound-account via `Authorization` header in MCP config.

## 5. Scope — OUT (Deferred, Named)

These are explicitly **not** in v1. They are deferred so we don't drift into them mid-build. Each has a known re-entry point.

| Item | Re-entry signal |
|------|-----------------|
| Capability schema (the value-shape of the well-known `capabilities` key) | First inter-org agent pairing where the two sides need to agree on a vocabulary |
| Conversation metadata mutability | First user request to update a conversation's declared purpose mid-flight |
| Federation (multi-broker conversations) | First cross-org adoption that demands it; needs its own protocol layer |
| Magic link revocation / expiry | First leaked-link incident, or first paying customer requirement |
| JCS-SHA conversation IDs | First need for two parties to derive the same conversation ID without coordination |
| Replay / per-stream history | First user need for a subscriber to catch up on missed tokens |
| Identity above account ID (OIDC, signed agent specs, etc.) | First inter-org pairing that needs identity beyond bearer-as-account |
| Multi-stream-per-account-per-conversation | First valid use case (e.g. one account running parallel agent processes in one conversation) |
| Per-stream ACLs richer than account ownership | Same trigger as conversation-level authz |
| MCP Mode B (on-demand account via tool call) | First hosted-dashboard use case |
| `ams_create_account` as an MCP tool | Same as Mode B |
| Spill-to-storage for SessionDO buffer | First observed buffer-overflow incident in production |
| DOLCHE journal observability subscriber | After the PoC ships and we want production telemetry |
| Containers / non-Worker hosting | If Workers + DOs prove insufficient for any specific subscriber type |

Deferring an item means: it is not blocked, it is not forgotten, and it does not gate v1. When the re-entry signal fires, the item gets its own design pass.

## 6. Architecture — One Page

Full detail in [`POC-INFRA.md`](./POC-INFRA.md) §4.

```
Agent (Claude Code, Cursor, Desktop, claude.ai, ...)
   │ MCP Streamable HTTP (request/response + push notifications)
   ▼
AMS Worker (ams.covenant.dev)
   ├─ POST /mcp        → SessionDO (per MCP session)
   ├─ POST /v1/...     → REST control plane
   └─ GET  /v1/.../connect → ConversationDO via WS upgrade

   SessionDO (edge wrapper) ───WS───► ConversationDO (push-native AMS wire)
                                         │
                                         ▼
                                       AMS KV
```

**Two Durable Object classes.** `ConversationDO` is the dream-house wire — push-only, one per conversation, knows nothing about MCP. `SessionDO` is the per-MCP-session edge wrapper — holds the WS to the conversation DO, holds the per-session buffer, translates MCP I/O. The wire stays clean; the wrapper carries the runtime adaptation.

**KV** holds account credential hashes, alias → conversation_id mappings, and conversation-level metadata + permissive tokens.

## 7. Alternatives Considered (and Why Not)

Surfaced explicitly because the gauntlet flagged them as missing.

| Alternative | Why we rejected it (for v1) |
|-------------|------------------------------|
| Build directly on Matrix or Mastodon, strip human assumptions | Stripping the human-shaped assumptions (presence, threads, mentions, archival semantics) is a bigger project than building agent-native from scratch. [`AMS.md`](./AMS.md) §11.3. |
| Adopt MCP itself as the inter-agent protocol | MCP is one-to-one (agent ↔ tool). AMS is many-to-many (agents ↔ conversations ↔ subscribers). They compose; they don't substitute. [`AMS.md`](./AMS.md) §11.4. |
| Build the opinionated full stack (identity + auth + queue + transport + format) | Vertically-bundled stacks own a slice forever and never settle the foundation. We are betting the foundation is the more defensible layer. [`AMS.md`](./AMS.md) §2, §11.2. |
| Single DO that handles both raw WS and MCP sessions | Earlier draft of `POC-INFRA.md`. Compromised the ConversationDO with MCP-session state, breaking the "any wrapper plugs in" property. Replaced with the SessionDO split. |
| Long-poll as the primary MCP delivery mechanism | Earlier framing of the MCP tool surface. Let runtime constraints shape the spec presentation. Corrected to push-as-primary, recv-as-degradation. |
| Containers for the PoC infra | Workers + DOs cover the PoC. Containers add operational surface without solving any v1 requirement. Re-entry signal: any subscriber type that can't run as a Worker. |

## 8. Risks (and Mitigations)

| Risk | Severity | Mitigation |
|------|----------|------------|
| MCP Streamable HTTP notification support is uneven across clients | Medium | `ams_recv` long-poll path covers any client that can't take notifications. Same buffer; no protocol fork. |
| Per-MCP-session DO adds an extra hop's latency | Low | Acceptable for PoC. If the demo feels laggy, profile before optimizing. The split is load-bearing for the wrapper-pattern; we don't collapse it for a few ms. |
| Conversation DO geographic placement (whichever region first hit) | Low for two-agent demo | Acknowledged in [`POC-INFRA.md`](./POC-INFRA.md) §11. Re-entry: when conversations span continents in production. |
| WebSocket cost / concurrency in CF Workers DOs | Low for PoC volume | DO concurrency budget handles ~100 subscribers per conversation easily. PoC caps at 10 streams/account, 100 subscribers/conversation. |
| The opinionated-stack vendors entrench before we plant the flag | High strategic | Ship visibly and quickly. The week is the mitigation. |
| MCP itself evolves in a way that obsoletes the wrapper before v2 | Medium-positive | Wrappers are designed to be disposable; if MCP gains first-class persistent streams, the SessionDO buffer logic shrinks toward zero and gets deleted. The wire does not change. This is the [intended trajectory](./journal/2026-05-01-ams-dream-house-edge-wrappers.tsv). |
| A buffer overflow in a slow MCP client silently drops events | Low (mitigated by design) | `truncated: true` flag on the next `ams_recv` response with a count of dropped events. Slow clients get told they were slow. |
| The demo fails mid-presentation | Medium | Smoke test (§3.1) must pass before any demo attempt. Recorded fallback exists. |

## 9. Reversibility — One-Way vs Two-Way Doors

| Decision | Door type | If we want to reverse |
|----------|-----------|------------------------|
| Tokens-not-messages as the wire unit | **One-way** | Re-architecting to message envelopes would break every subscriber. Don't reverse; layer on top. |
| Magic link as a URL (not opaque blob) | **One-way for v1** within the deployment | Other implementations may differ; protocol opacity rule preserves this. |
| Per-account stream ownership | **One-way** | This is the inverted-inbox model. Reversing breaks the central security simplification. |
| Two-DO split (ConversationDO + SessionDO) | **Two-way** | Could be merged later if the SessionDO pattern proves redundant. Cost: redoing the file split. |
| Six-tool MCP surface (current names) | **Two-way** until external adoption | Add tools freely (additive). Renames break clients once anyone configures the MCP server. After that, only additive changes. |
| JSON frame format on the wire | **Two-way** at v2 boundary | Versioning in the URL path (`/v1/`) means swapping framing is a v2 concern. v1 is committed JSON. |
| `ams.covenant.dev` as the reference instance | **Two-way** | DNS / routing change. Trivial. |
| Bound-account MCP binding (`Authorization` header) | **Two-way** | Mode B (on-demand account) can be added without breaking Mode A. |

The one-way doors are the places to be most certain. Two-way doors get less scrutiny.

## 10. Disconfirmers — What Would Invalidate the Plan

If any of these is observed, the plan needs re-thinking, not just re-trying:

- **The demo (§3.2) cannot be made to work even after the smoke test (§3.1) passes.** Means the wire ↔ wrapper translation has a structural problem we haven't diagnosed.
- **Two MCP clients cannot reliably exchange tokens within a 5-second budget.** Means either MCP transport is too slow for the use case, or the SessionDO pattern adds unacceptable hop latency.
- **A second wrapper class (e.g. webhook, Slack) cannot be added without modifying `conversation.ts`.** Means the wrapper-pattern abstraction leaked, and the ConversationDO is not as pure as the spec claims.
- **An agent's emitted tokens are observably re-ordered within a single stream.** Means the per-stream ordering guarantee in [`PROTOCOL.md`](./PROTOCOL.md) §5 is broken in the implementation; this is a wire-conformance failure.
- **Adoption signal after the first 30 days is zero — nobody outside Covenant tries to write a subscriber.** Means the foundation play is mistimed or mis-positioned, and the strategic risk in §8 has materialized.

## 11. Open Decisions Still Inside v1 Scope

These are not deferred to a future version — they're decisions inside v1 that haven't been forced yet. Each will be made when the implementation forces it, not before:

1. **Which MCP SDK / framework to use, if any.** Default: hand-roll Streamable HTTP framing in `mcp.ts`. If a maintained TS SDK exists and is light enough, use it.
2. **TLS for `wss://` outside Cloudflare's defaults.** Default: Cloudflare auto-TLS.
3. **DNS apex vs subdomain.** Default: `ams.covenant.dev` as a subdomain of an existing Covenant zone.
4. **Bearer token format.** Default: 32-byte URL-safe base64. Alternative: signed JWT. Going with the simpler unless there's a real reason.
5. **MCP server discovery URL.** Default: `https://ams.covenant.dev/mcp`. Possible alternative: `/.well-known/mcp` or `/mcp/v1`. v1 commits to `/mcp`.

## 12. Out-of-Scope, On Horizon

The post-PoC roadmap, in rough order:

1. **Capability manifest sister-spec** — schema for the `capabilities` metadata key.
2. **Conversation-metadata mutability** — owner-only PATCH endpoint and `conversation_metadata` server frame.
3. **Magic link revocation / expiry.**
4. **JCS-SHA conversation IDs** — content-addressable conversations.
5. **Replay buffer** — opt-in per conversation, with a documented retention model.
6. **Federation shape** — sister protocol vs intra-AMS extension. Decision required before the federation feature itself.
7. **Identity above account** — OIDC, signed agent specs, signed bearer credentials.
8. **Second wrapper class** (probably webhook adapter) — proves the edge-wrapper pattern is general.
9. **Observability subscriber** — DOLCHE-shaped journal sink as a separate service.
10. **Pricing surface** — the hosted instance becomes commercial.

## 13. References

- [`AMS.md`](./AMS.md) — Conceptual thesis, primitives, agentic stack.
- [`PROTOCOL.md`](./PROTOCOL.md) — Wire-level specification, conformance.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — Reference implementation architecture.
- [`POC-INFRA.md`](./POC-INFRA.md) — Deployable shape, MCP wrap, topology.
- [`POC-PLAN.md`](./POC-PLAN.md) — Day-by-day execution plan.
- [`PATTERNS.md`](./PATTERNS.md) — Patterns built on AMS (deterministic harness, edge wrapper).
- [`HORIZON.md`](./HORIZON.md) — *The Durable Thread* — what AMS plus a harness makes possible after the PoC.
- [`ESSAY.md`](./ESSAY.md) — *We Were the Wire* — the foundational essay.
- [`GLOSSARY.md`](./GLOSSARY.md) — Vocabulary.
- [`journal/`](./journal/) — DOLCHE artifacts capturing decisions, learnings, constraints, encodings.

---

## 14. Revision Discipline

This doc is the lock. When a load-bearing decision changes, this doc is updated **first**, then the deeper docs are brought into alignment. Every revision adds a dated entry below.

| Date | Change | Driver |
|------|--------|--------|
| 2026-05-01 | Initial lock — PoC scope, acceptance criteria, alternatives, risks, reversibility, disconfirmers. | Oddkit gauntlet pass surfaced that load-bearing decisions were spread across six docs without a single locking surface. |
