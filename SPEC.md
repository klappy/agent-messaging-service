# AMS Spec / PRD — v1.1

> Token stream routing.

**Version:** 1.1.3 (PoC scope locked; dual-host CNAME deployment per D0011; deploy mechanism corrected to branch-deploy via git-hook).
**Status:** Active. Last updated 2026-05-08.

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

Run after the branch deploys via the operator's git-hook deploy. All five must pass. The deployed Worker is reachable at both `ams.klappy.dev` and `ams.truthkit.ai` per [`canon/decisions/D0011`](./canon/decisions/D0011-multi-host-cname-deployment.md); the smoke test below exercises the `ams.klappy.dev` host, and the same Worker (same KV, same DOs) is reachable identically via `ams.truthkit.ai`.

1. `curl -X POST https://ams.klappy.dev/v1/accounts -d '{"namespace":"smoke"}'` returns `201` with a credential.
2. `curl -X POST https://ams.klappy.dev/v1/smoke/conversations -H "Authorization: Bearer <cred>" -d '{}'` returns `201` with a magic link.
3. Two `wscat` sessions on the magic link (with `/connect` appended) exchange `{"type":"token","data":"hello"}` frames in real time. Each session sees the *other's* frames and not its own — confirming structural exclusion of self-delivery (per [`canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`](./canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription.md)).
4. A Claude Code instance configured with the AMS MCP server can call `ams_create_conversation` and receive a magic link.
5. A second Claude Code instance (different bearer) can `ams_join` that link and `ams_send` a token; the first instance receives it (via push notification or `ams_recv`) within 5 seconds. Neither instance receives its own emissions back unless it explicitly opted into self-subscription.

### 3.2 Demo Gate (real-world)

The end-to-end hackathon-replay scenario from [`POC-PLAN.md`](./POC-PLAN.md) §1, between two real agents on two physical machines:

- Klappy's Claude Code mints a conversation, returns the magic link.
- Klappy shares the link with Ian via Signal (one human action, accepted).
- Ian's Claude Code joins the conversation.
- Klappy's agent emits a token requesting a summary of the last commit on `truthkit-proxy`.
- Ian's agent receives the token, performs the work, emits the summary.
- Klappy's agent receives the summary.

**No copy-paste of message contents at any step. Neither agent receives its own emissions back from the wire.** Both are the gate. Anything else passing while either fails is a fail.

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
| Stream-scoped delivery with structural exclusion of self-echo | [`canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`](./canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription.md), [`PROTOCOL.md`](./PROTOCOL.md) §4.1 |
| Hosted reference deployment behind `ams.klappy.dev` and `ams.truthkit.ai` (single Worker, dual hosts per [`D0011`](./canon/decisions/D0011-multi-host-cname-deployment.md)) | [`POC-INFRA.md`](./POC-INFRA.md) §8 |
| Day-by-day execution plan | [`POC-PLAN.md`](./POC-PLAN.md) |

Specifically locked for v1:

- Six MCP tools: `ams_create_conversation`, `ams_join`, `ams_send`, `ams_set_metadata`, `ams_leave`, `ams_recv` (degradation path).
- Two MCP notifications: `notifications/ams/token`, `notifications/ams/stream_metadata`.
- One MCP resource: `ams://conversations/{conversation_id}`.
- Wire frames: `token`, `set_metadata`, `ping` (client→server); `joined` (with `self_subscribe` field), `token`, `stream_joined`, `stream_left`, `stream_metadata`, `pong` (server→client).
- Connect headers: `Authorization`, `X-AMS-Stream-Name`, `X-AMS-Stream-Metadata`, `X-AMS-Self-Subscribe` (default `false`).
- Conformance rules: [`PROTOCOL.md`](./PROTOCOL.md) §7, both must and must-not, including MUSTs #4 (stream-scoped broadcast) and #6 (structural exclusion).
- One MCP binding mode: bound-account via `Authorization` header in MCP config.
- Emit semantics: fire-and-forget at the wire layer (no acknowledgment frame in v1).

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
| Optional emit receipts (acknowledgment frame) | First orchestration or audit use case that requires positive confirmation of broker acceptance |
| Selective subscription (attach to specific streams within a conversation, not all) | First use case where reading every peer stream is operationally prohibitive |

Deferring an item means: it is not blocked, it is not forgotten, and it does not gate v1. When the re-entry signal fires, the item gets its own design pass.

## 6. Architecture — One Page

Full detail in [`POC-INFRA.md`](./POC-INFRA.md) §4.

```
Agent (Claude Code, Cursor, Desktop, claude.ai, ...)
   │ MCP Streamable HTTP (request/response + push notifications)
   ▼
AMS Worker (ams.klappy.dev | ams.truthkit.ai)
   ├─ POST /mcp        → SessionDO (per MCP session)
   ├─ POST /v1/...     → REST control plane
   └─ GET  /v1/.../connect → ConversationDO via WS upgrade

   SessionDO (edge wrapper) ───WS───► ConversationDO (push-native AMS wire)
                                         │
                                         ▼
                                       AMS KV
```

**Two Durable Object classes.** `ConversationDO` is the dream-house wire — push-only, one per conversation, knows nothing about MCP. It holds the per-stream subscription registry (with owners structurally excluded by default) and runs the stream-scoped broadcast loop. `SessionDO` is the per-MCP-session edge wrapper — holds the WS to the conversation DO, holds the per-session buffer, translates MCP I/O. The wire stays clean; the wrapper carries the runtime adaptation. Neither layer implements echo filtering; the wire structurally excludes self-delivery.

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
| Wire-level echo of own-stream tokens with subscriber-side filtering | Earlier draft of `PROTOCOL.md` §4.1. Made the wire deliver each stream's tokens to its owner and required every subscriber to filter on `owner_account_id`. Reversed under D0009 — moved the constraint into wire structure (exclusion at registration), eliminated the bug class, and unblocked concurrent multi-stream emission as a default property of the wire. |

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
| Some legitimate use case requires self-observability that the default exclusion blocks | Low | `X-AMS-Self-Subscribe: true` opt-in covers it. Documented in [`PROTOCOL.md`](./PROTOCOL.md) §4.1 and the D0009 hard-cases section. |

## 9. Reversibility — One-Way vs Two-Way Doors

| Decision | Door type | If we want to reverse |
|----------|-----------|------------------------|
| Tokens-not-messages as the wire unit | **One-way** | Re-architecting to message envelopes would break every subscriber. Don't reverse; layer on top. |
| Magic link as a URL (not opaque blob) | **One-way for v1** within the deployment | Other implementations may differ; protocol opacity rule preserves this. |
| Per-account stream ownership | **One-way** | This is the inverted-inbox model. Reversing breaks the central security simplification. |
| Stream as primitive; ownership structurally excludes subscription (D0009) | **One-way** | Reversing would re-introduce wire-level echo, force every subscriber to re-implement filtering, and re-couple broadcast scope to conversation membership in a way that would foreclose downstream composition. Don't reverse; the door is closed. See [`canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`](./canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription.md) §"What This Forecloses." |
| Fire-and-forget emit semantics (no v1 ack frame) | **Two-way** at v2 boundary, two-way within v1 via an extension MAY | Optional receipts can be added later as an extension or a v2 frame without breaking existing emitters. |
| Two-DO split (ConversationDO + SessionDO) | **Two-way** | Could be merged later if the SessionDO pattern proves redundant. Cost: redoing the file split. |
| Six-tool MCP surface (current names) | **Two-way** until external adoption | Add tools freely (additive). Renames break clients once anyone configures the MCP server. After that, only additive changes. |
| JSON frame format on the wire | **Two-way** at v2 boundary | Versioning in the URL path (`/v1/`) means swapping framing is a v2 concern. v1 is committed JSON. |
| Dual-host CNAME deployment per [`D0011`](./canon/decisions/D0011-multi-host-cname-deployment.md) — `ams.klappy.dev` and `ams.truthkit.ai` route to a single Worker; magic links are host-portable | **Two-way** for adding/removing hosts; **one-way for v1** for splitting into per-host Workers | Add/remove a host: DNS + routes change, trivial. Split per host: would break magic-link portability across the existing link space; would require a translation layer the v1 design does not include. |
| Bound-account MCP binding (`Authorization` header) | **Two-way** | Mode B (on-demand account) can be added without breaking Mode A. |

The one-way doors are the places to be most certain. Two-way doors get less scrutiny.

## 10. Disconfirmers — What Would Invalidate the Plan

If any of these is observed, the plan needs re-thinking, not just re-trying:

- **The demo (§3.2) cannot be made to work even after the smoke test (§3.1) passes.** Means the wire ↔ wrapper translation has a structural problem we haven't diagnosed.
- **Two MCP clients cannot reliably exchange tokens within a 5-second budget.** Means either MCP transport is too slow for the use case, or the SessionDO pattern adds unacceptable hop latency.
- **A second wrapper class (e.g. webhook, Slack) cannot be added without modifying `conversation.ts`.** Means the wrapper-pattern abstraction leaked, and the ConversationDO is not as pure as the spec claims.
- **An agent's emitted tokens are observably re-ordered within a single stream.** Means the per-stream ordering guarantee in [`PROTOCOL.md`](./PROTOCOL.md) §5 is broken in the implementation; this is a wire-conformance failure.
- **Subscribers receive their own emitted tokens by default at the wire layer.** Means the structural exclusion in [`PROTOCOL.md`](./PROTOCOL.md) §7 MUST #6 is broken in the implementation; this is a wire-conformance failure under D0009.
- **Adoption signal after the first 30 days is zero — nobody outside klappy tries to write a subscriber.** Means the foundation play is mistimed or mis-positioned, and the strategic risk in §8 has materialized.

## 11. Open Decisions Still Inside v1 Scope

These are not deferred to a future version — they're decisions inside v1 that haven't been forced yet. Each will be made when the implementation forces it, not before:

1. **Which MCP SDK / framework to use.** **Resolved 2026-05-03:** Cloudflare `agents/mcp` (`McpAgent`) for the hosted Worker wrapper at `/mcp`; `@modelcontextprotocol/sdk` for stdio examples (`examples/two-agents/mcp-server.mjs`). See `journal/2026-05-03-day3-mcp-sdk-migration.tsv` (Decision and Constraint rows) and [`ams://canon/constraints/mcp-build-side-governance`](./canon/constraints/mcp-build-side-governance.md). Handrolling MCP transport, framing, or capabilities negotiation requires a named justification recorded in the plan per [`klappy://docs/promotions/P0002-borrow-evaluation-before-implementation`](https://github.com/klappy/klappy.dev/blob/main/docs/promotions/P0002-borrow-evaluation-before-implementation.md). The existing `worker/src/mcp.ts` (handrolled, shipped in PR #33) is documented as carry-over debt in `journal/2026-05-05-mcp-handroll-recurrence-canon-fix.tsv`; the rewrite to `agents/mcp` McpAgent is a separate scheduled change.
2. **TLS for `wss://` outside Cloudflare's defaults.** Default: Cloudflare auto-TLS.
3. **DNS apex vs subdomain.** v1 commits to subdomains: `ams.klappy.dev` and `ams.truthkit.ai`, both as CNAMEs to one Worker per [`D0011`](./canon/decisions/D0011-multi-host-cname-deployment.md). Apex would be a separate decision per host.
4. **Bearer token format.** Default: 32-byte URL-safe base64. Alternative: signed JWT. Going with the simpler unless there's a real reason.
5. **MCP server discovery URL.** Default: `https://ams.klappy.dev/mcp` (and identically `https://ams.truthkit.ai/mcp`, since both hosts route to the same Worker per [`D0011`](./canon/decisions/D0011-multi-host-cname-deployment.md)). Possible alternative: `/.well-known/mcp` or `/mcp/v1`. v1 commits to `/mcp`.

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
11. **Optional emit receipts** — opt-in `x_receipt` server-pushed frame for emitters that need positive confirmation; deferred from D0009 hard cases.
12. **Selective subscription** — attach to a chosen subset of streams in a conversation (rather than the default subscribe-to-all-except-own); D0009 enables this without further architectural change but the v1 default is sufficient for the PoC.
13. **Multi-stream-per-account composition patterns** — pipelines, aggregators, cross-conversation re-routing; D0009 unblocks these but they are post-PoC design work.

## 13. References

- [`AMS.md`](./AMS.md) — Conceptual thesis, primitives, agentic stack.
- [`PROTOCOL.md`](./PROTOCOL.md) — Wire-level specification, conformance.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — Reference implementation architecture.
- [`POC-INFRA.md`](./POC-INFRA.md) — Deployable shape, MCP wrap, topology.
- [`POC-PLAN.md`](./POC-PLAN.md) — Day-by-day execution plan.
- [`PATTERNS.md`](./PATTERNS.md) — Patterns built on AMS (deterministic harness, edge wrapper).
- [`HORIZON.md`](./HORIZON.md) — comprehensive catalog of use cases AMS unlocks and things to build on top of it.
- [`ESSAY.md`](./ESSAY.md) — *We Were the Wire* — the foundational essay.
- [`GLOSSARY.md`](./GLOSSARY.md) — Vocabulary.
- [`canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription.md`](./canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription.md) — The wire-delivery axiom.
- [`journal/`](./journal/) — DOLCHE artifacts capturing decisions, learnings, constraints, encodings.

---

## 14. Revision Discipline

This doc is the lock. When a load-bearing decision changes, this doc is updated **first**, then the deeper docs are brought into alignment. Every revision adds a dated entry below.

**Versioning.** The spec carries a SemVer-style version number (e.g. `v1.0`, `v1.1`, `v2.0`). The version is the provenance handle: the implementation is built to a specific spec version, and the version is the answer to "what did we commit to when we shipped this." Bump rules:

- **Patch** (e.g. `v1.0` → `v1.0.1`) — clarifications, typo fixes, no change to commitments. Rare; usually folded into the next minor.
- **Minor** (e.g. `v1.0` → `v1.1`) — additive changes within the same compatibility envelope. New scope, new conventions, new canon references. An implementation built to v1.0 remains a valid implementation under v1.1.
- **Major** (e.g. `v1.x` → `v2.0`) — breaking changes to scope, contract, or wire. An implementation built to v1.x is not automatically compliant with v2.0. Major bumps align with wire-protocol bumps when the wire itself breaks; spec-only major bumps happen when the contract envelope changes (e.g., scope expands beyond what v1 promised) without breaking the wire.

The version in the title at the top of this document is the current version. Each row in the revisions table below is tagged with the version it introduced. Git tags (`spec-v1.0`, `spec-v1.1`, ...) mark each version's commit for direct retrieval.

**Forward-compatibility check:** every proposed change to this spec — and every implementation choice it permits — is evaluated against [`HORIZON.md`](./HORIZON.md). If a change would foreclose any catalog entry, the change is wrong (or the catalog entry is deliberately retired with a named reason). The catalog is the constraint set that protects v1 from painting future versions into a corner.

| Version | Date | Change | Driver |
|---------|------|--------|--------|
| v1.0 | 2026-05-01 | Initial lock — PoC scope, acceptance criteria, alternatives, risks, reversibility, disconfirmers. | Oddkit gauntlet pass surfaced that load-bearing decisions were spread across six docs without a single locking surface. |
| v1.0 | 2026-05-01 | Added forward-compatibility check against `HORIZON.md` to revision discipline. | Catalog reframed explicitly as a two-sided document: dream half (what becomes possible) and constraint half (what must remain possible). The constraint half belongs in spec discipline. |
| v1.0 | 2026-05-01 | Added SemVer-style spec versioning. | Provenance — clear mapping between "what we committed to" and "what we shipped." This row introduces the versioning convention; the document is retroactively marked v1.0 because the PoC scope and locks above are unchanged. |
| v1.0 | 2026-05-01 | Adopted D0009: stream-scoped delivery with structural exclusion of self-echo. Wire MUST #4 rewritten; new MUSTs #6 added; new opt-in `X-AMS-Self-Subscribe` connect header; emit semantics confirmed as fire-and-forget v1 default. Echo-filter principle deprecated. Smoke test §3.1 item 3 and demo gate §3.2 updated to verify the no-echo property. Reversibility table records D0009 as a one-way door. | First-principles rethink: previous wire model required every subscriber to implement echo filtering; D0009 moves the constraint into wire structure, eliminating the failure mode and unblocking concurrent multi-stream emission as a default property. Operator (klappy) brought decades of multi-stream parallelism experience to the table. |
| v1.1 | 2026-05-02 | Replaced single-host `ams.covenant.dev` references with dual-host CNAME deployment per [`canon/decisions/D0011-multi-host-cname-deployment`](./canon/decisions/D0011-multi-host-cname-deployment.md): `ams.klappy.dev` and `ams.truthkit.ai` both route to one Worker, magic links are host-portable. Updated §3.1 smoke test framing, §4 Scope IN, §6 architecture diagram, §9 reversibility map, §11 open decisions (DNS subdomain choice and MCP discovery URL). Deeper docs (POC-INFRA, POC-PLAN, PROTOCOL, AMS, ARCHITECTURE, ESSAY, README, D0010) brought into alignment in the same PR. | D0011 was merged 2026-05-02 (PR #5) but the deeper docs and SPEC still referenced the prior single-host hostname `ams.covenant.dev`, which was never a real deploy target. Per D0007 §"The Revision Order" the lock moves first; this row records that move. |
| v1.1.1 | 2026-05-02 | Patch — clarification only, no commitment change. §3.1 trigger phrase updated from "Run after `wrangler deploy`" to "Run after the branch deploys via the operator's git-hook deploy." POC-INFRA §8.2 and §11 reframed: deploys happen via the operator's git-hook branch deploy, not from a coding session running `wrangler deploy`; secrets bind via the Cloudflare dashboard, not `wrangler secret put`. POC-PLAN §4 success criterion reworded ("a push to the deploy branch lands a working Worker"). `wrangler.toml` `routes` blocks corrected: `custom_domain = true` does not accept `/*` path patterns. | Operator clarified during Day 1 execution: `wrangler deploy` from a coding session is a "ritual smell," not how AMS deploys. The docs were prescribing it. Doc accuracy fix; no protocol or scope change. |
| v1.1.2 | 2026-05-03 | Patch — no wire or scope change. Records the existence of homepage governance: [`canon/decisions/D0013-homepage-as-poc-surface`](./canon/decisions/D0013-homepage-as-poc-surface.md) is the load-bearing rule, [`docs/homepage-governance.md`](./docs/homepage-governance.md) is the operational surface, `scripts/check-homepage-architectural-claims.mjs` and `.github/workflows/homepage-architectural-claims.yml` mechanically enforce it. Homepage-content changes route through the governance doc, not through SPEC; the homepage is not on the wire and SPEC's contract envelope is unchanged. This row exists so the locking surface is aware of the new governance surface per D0007's "the lock moves first" discipline. | Day 3 N-cardinality drift (`journal/2026-05-03-ams-homepage-n-cardinality-and-dumb-pipe.tsv`) survived two days on the live homepage because no governance surface existed to constrain or detect it. The website-governance pattern was tested retrospectively against day 3 in a planning conversation; D0013 + the governance doc + the CI script + the workflow are the four artifacts that close the loop. |
| v1.1.3 | 2026-05-08 | Additive — Path C completion, deterministic identity, stream resumability, peer_identity wire field. Three new canon surfaces brought into the locking envelope: [`D0028 — Deterministic Identity and Stream Resumability`](./canon/decisions/D0028-deterministic-identity-and-stream-resumability.md) makes `acc_anon_*` link-derived (peppered hash of permissive token) instead of fresh-ULID-per-request, makes `stream_id` deterministic from `(conversation_id, account_id, stream_name)`, and changes the Conversation DO to displace-and-resume on `stream_name` reconnect when `account_id` matches (rather than reject-conflict). Also introduces optional wire field `peer_identity={kind, model?, client?}` carried in participant frames, and adds an auto-`stream_name` formula `<client-slug>-<4-hex-chars-of-pepperedHash(mcp-session-id)>` when `stream_name` is omitted but `peer_identity` is supplied. [`D0029 — Magic Link as ams_join Argument on /mcp`](./canon/decisions/D0029-magic-link-as-ams-join-argument-on-mcp.md) extends Path C to the bare `/mcp` route — `tool_ams_join({ magic_link })` without `Authorization` header validates the link and synthesizes the same transient anonymous account `D0023`'s URL-route flow synthesizes, so ChatGPT-class consumers (which configure connector URLs once and pass magic links as tool arguments per OpenAI Apps SDK constraints) can finally use the credential. [`D0023`](./canon/decisions/D0023-magic-link-as-mcp-transport-endpoint.md) §Door-1-Only Auth and frontmatter cross-refs updated; [`D0019`](./canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying.md) §New Keying records that the keying contract now applies uniformly to door-1 and door-2 accounts (was effectively broken for door-1 under the prior fresh-ULID behavior). All wire-level changes are additive — no existing subscriber breaks. Two-door auth (D0004) preserved: `ams_create_conversation` continues to require Door 2. | Operator brief 2026-05-08 surfaced that PR #66 shipped Path C in a shape that solved curl/script flows but not the consumer flow that motivated the work (the silver-falcon-9295 ChatGPT screenshot). Operator concern named explicitly: "stability for subscribers, no thousands of orphaned streams cluttering logs and ruining mechanics of buffer and playback." Three orphan paths were named (reconnect, abandon, multi-instance same-link); D0028's deterministic-stream-id + resume-on-reconnect kills the reconnect path entirely (the dominant orphan source). Path #2 (abandon orphans) and per-account stream caps explicitly deferred to a separate canon decision and a separate evening of work. Gauntlet (encode/challenge/preflight/manual-URI-integrity) run before code phase. |

