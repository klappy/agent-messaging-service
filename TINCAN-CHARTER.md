# TinCan PoC Charter

> Codename for the build that ships SPEC §3.1 items 4–5 (the MCP tool surface) plus the SPEC §3.2 demo gate, with a browser-based human-overlay use case as additional scope.

**Version:** 1.0 (charter locked 2026-05-04 in operator↔Claude planning conversation).
**Status:** Active. Gates the TINCAN-POC-PLAN.md that follows.

This charter defines the box. The build plan operates strictly inside it. Anything that requires changing the charter requires explicit reversion to planning, not inline expansion during build.

---

## 1. Intent

TinCan is the AMS proof-of-concept that proves two MCP-speaking agents can exchange tokens through one AMS conversation, with a human watching and participating from the browser. It is structurally minimal — the MCP edge wrapper plus the homepage demo glue that makes the wrapper visible end-to-end. Nothing more.

TinCan is a build codename, not a brand, product, or portfolio name (per [`canon/decisions/D0022`](./canon/decisions/D0022-multi-brand-portfolio-on-shared-substrate.md), amended 2026-05-04). The artifact this charter governs is the proof; the brand/portfolio layer is downstream of the build evidence TinCan produces.

Success is not "the wrapper compiles." Success is **the operator can demo it themselves in the browser, end-to-end, today.**

---

## 2. Use Cases

The single canonical use case TinCan v1 must support, end-to-end:

1. **Mint.** From the AMS homepage, a human clicks a button to create a new conversation. AMS returns a magic-link URL (per [`canon/decisions/D0002`](./canon/decisions/D0002-magic-link-as-url.md) — the magic link is a URL; deployment chooses structure).
2. **Distribute.** The human copies the URL and pastes it into each MCP-speaking agent's context (system prompt, tool input, chat message — wherever the agent receives a target address).
3. **Connect.** Each agent's MCP runtime speaks to TinCan's MCP wrapper; the wrapper translates MCP ↔ AMS wire and joins the conversation as a stream-owning subscriber. Per [`canon/decisions/D0012`](./canon/decisions/D0012-browser-is-an-mcp-runtime.md), the browser is also an MCP runtime — it talks to the same wrapper.
4. **Watch.** The browser session that minted the conversation is auto-subscribed to peer streams ([`canon/decisions/D0017`](./canon/decisions/D0017-selective-subscription.md) default: subscribe-to-all-except-own). `stream_joined` and `token` frames flow in as agents arrive and talk; the browser renders them in real time.
5. **Participate.** The browser owns its own stream and can emit tokens to the conversation. Agents see the human exactly as they see each other — a polymorphic subscriber per the [`operator-as-subscriber`](./canon/principles/operator-as-subscriber.md) principle. The browser declares itself in capabilities metadata so agents may (by convention) adapt; the wire does not enforce.

This use case is the SPEC §3.2 demo gate plus the human-overlay. It composes entirely from already-locked canon and adds zero new wire features.

---

## 3. Constraints (MUSTs)

The five disciplines TinCan must hold from day one. These are floor, not ceiling. Anything that violates one of these means TinCan is no longer TinCan.

1. **Round-trip the capabilities declaration through the wrapper.** PROTOCOL §4.4's `capabilities` key with the `ams.convention.v1` schema (role / function / posture / scope / attestation) passes through the wrapper unchanged. Security subscribers, observability sinks, operator-as-subscriber declarations — all must round-trip.

2. **Treat the wire `data` field as opaque, period.** No logging of token contents, no persistence of token contents, no content-derived branching, no transformation of token bytes. The wrapper translates MCP↔AMS framing only. Bytes through.

3. **Adopt D0019 account-conversation keying for the wrapper's Session DO from day one.** Even though TinCan v1 ships without buffering, the keying convention must already be `account_id + conversation_id` rather than MCP-transport-session. Otherwise every TinCan client breaks the day buffering or encryption activates.

4. **Ship the four security-subscriber attachment points as documented surfaces.** Signing, audit, policy, anomaly_detection — the SPEC for TinCan names how each would attach. No security subscribers required to run in the v1 demo; the *shape* of attaching one is locked from day one.

5. **No gatekeeping at the wrapper.** The wrapper translates and stays out of the trust loop. Any security subscriber that wants to enforce something attaches as a peer (per [`security-as-subscriber-pattern`](./canon/principles/security-as-subscriber-pattern.md)). The [`wrapper-stays-cheap`](./canon/constraints/wrapper-stays-cheap.md) discipline applies; the wrapper does not become a security product.

### Binding Canon References

TinCan v1 conforms to all of these without exception:

- [`D0001`](./canon/decisions/D0001-tokens-not-messages.md) — tokens, not messages
- [`D0002`](./canon/decisions/D0002-magic-link-as-url.md) — magic link as URL
- [`D0006`](./canon/decisions/D0006-dream-house-wire-edge-wrappers.md) — dream-house wire, edge-wrappers (irreversible)
- [`D0009`](./canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription.md) — stream as primitive, ownership excludes subscription
- [`D0010`](./canon/decisions/D0010-observability-via-subscriber-not-wire.md) — observability via subscriber, not wire
- [`D0012`](./canon/decisions/D0012-browser-is-an-mcp-runtime.md) — browser is an MCP runtime
- [`D0013`](./canon/decisions/D0013-homepage-as-poc-surface.md) — homepage as PoC surface
- [`D0017`](./canon/decisions/D0017-selective-subscription.md) — selective subscription default (subscribe-to-all-except-own)
- [`D0019`](./canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying.md) — cross-session continuity via account-conversation keying
- [`canon/constraints/mcp-wrapper-conformance-for-conversational-ai.md`](./canon/constraints/mcp-wrapper-conformance-for-conversational-ai.md)
- [`canon/constraints/wrapper-stays-cheap.md`](./canon/constraints/wrapper-stays-cheap.md)
- [`canon/constraints/observability-payload-boundary.md`](./canon/constraints/observability-payload-boundary.md)
- [`canon/constraints/permanent-non-goals.md`](./canon/constraints/permanent-non-goals.md)
- [`canon/principles/operator-as-subscriber.md`](./canon/principles/operator-as-subscriber.md)
- [`canon/principles/observability-as-subscriber.md`](./canon/principles/observability-as-subscriber.md)
- [`canon/principles/security-as-subscriber-pattern.md`](./canon/principles/security-as-subscriber-pattern.md)

---

## 4. Guardrails (MUST-NOTs)

What TinCan v1 explicitly will NOT do, ship, or include:

- **No wire changes.** Zero new frame types, zero new fields, zero new headers. The wire stays exactly as it is on `ams.klappy.dev` and `ams.truthkit.ai` today.
- **No plaintext token logging.** Not in the wrapper, not in observability, not in error paths. If it touches token contents it does not get logged.
- **No buffering primitive built into TinCan.** Buffering is [`D0016`](./canon/decisions/D0016-buffering-and-persistence-as-wrapper-primitive.md)'s wrapper-layer primitive; it composes on top later. TinCan v1 ships with no buffer.
- **No encryption built in.** [`P0001`](./canon/proposals/P0001-stream-encryption-as-pre-syndication-wrapper.md) is unresolved; placement is deferred. TinCan v1 ships bare. When P0001 promotes, encryption layers on per its spec.
- **No gatekeeping (security, policy, moderation, content-filtering) at the wrapper.** All such roles are subscribers per `security-as-subscriber-pattern`.
- **No expansion of TinCan scope beyond {MCP wrapper translation, minimum homepage demo glue}.** `wrapper-stays-cheap`. If a feature isn't required for the canonical use case, it isn't in v1.
- **No solving of the open tensions below.** They remain open; TinCan operates inside the gap they leave.

---

## 5. Open Tensions Held In Mind

These exist. TinCan does not resolve them. The charter names them so future build work knows the bounds within which it is operating — and so future canon work can pick them up cleanly when the operator chooses to.

- **P0001 (a) vs (b) — encryption placement.** Whether AMS itself ships pre-syndication encryption as a platform-level value-added service (the dial-tone case) or documents the pattern and leaves implementation to third-party VAS providers (the application-layer case). Operator stance as of 2026-05-04: no preference, can be layered in or brought to the table. TinCan v1 ships in neither configuration; both remain reachable from where TinCan leaves the substrate.

- **Threat model gap.** Per `security-as-subscriber-pattern`, the complete threat model for AMS is open per the [2026-05-02 per-conversation-runtime-isolation journal entry](./journal/2026-05-02-ams-per-conversation-runtime-isolation-idea.tsv). TinCan ships inside this gap. Any external claim about TinCan's security must be bounded to "TinCan preserves the substrate's security composition properties" — not "TinCan is secure in the absolute sense."

- **Deployment topology.** Single Worker with internal `/mcp` routing on the existing AMS Worker; two Workers on the same domain (route-based split); or two separate domains. **Default assumption for v1: single Worker with internal `/mcp` routing on existing AMS deployment.** This is the most-vodka first cut and defers the multi-Worker / multi-domain question until build evidence justifies it. Revisable at any time without canon revision.

- **Agent identity verification.** Encryption protects payload confidentiality; it does not verify that the entity holding the key is the entity it claims to be. Identity is a separate concern (signing-as-subscriber sub-pattern). TinCan v1 makes no identity claims about its agents.

- **Operator premortem (recorded 2026-05-04):** the absence of buffering may be the layer that prevents agent-to-agent from working in practice — turn-based MCP transports open a fresh session per turn, so agent-A emitting while agent-B's MCP client is between turns means tokens vanish without a buffer. The decision is to ship without buffering and let the failure mode prove itself rather than pre-engineering against a theoretical concern. If Day 2 closeout confirms the pain, [`D0016`](./canon/decisions/D0016-buffering-and-persistence-as-wrapper-primitive.md) is already-locked canon, ready to layer in driven by actual evidence.

---

## 6. Done

TinCan v1 is **done** when, from the AMS homepage, in a clean browser session against the live deployment:

1. The operator can mint a new conversation and copy its magic-link URL.
2. Two MCP-speaking agents (e.g. Claude Code in two terminals, Claude in two browser windows, Claude + Cursor, two separate model-API clients) can connect to TinCan's MCP wrapper using that URL and exchange tokens in one AMS conversation.
3. The operator's browser session displays the agents' streams in real time as they appear and talk.
4. The operator can emit tokens from the browser into the conversation, and the agents see them.
5. End-to-end, with no additional manual steps beyond paste-the-URL.

No buffering. No encryption. No multi-stream-per-account. No security subscribers running. No identity verification. None of those are required for "done"; all of them are reachable from "done" without re-architecting.

If steps 1–5 work in a clean browser session against the live deployment, TinCan v1 has shipped.

---

## 7. Next Planning Artifact

[`TINCAN-POC-PLAN.md`](./TINCAN-POC-PLAN.md) — the Day 1 / Day 2 / Day 3 numbered build plan in the shape of [`canon/principles/poc-build-repeatability-pattern`](./canon/principles/poc-build-repeatability-pattern.md), with per-day scope locked at day-start, per-day evidence-of-done specified, and operator review gates between days.

The build plan operates strictly inside this charter. Anything that requires changing the charter requires explicit reversion to planning, not inline expansion during build.
