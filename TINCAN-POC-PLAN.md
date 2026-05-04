# TinCan — AMS PoC Day 3 Wrap-Up Plan

> The wrap-up of Day 3 of the AMS PoC per [`POC-PLAN.md`](./POC-PLAN.md) §2, scoped to ship the remaining MCP-tool-surface work (SPEC §3.1 items 4–5) plus the browser-overlay extension defined in [`TINCAN-CHARTER.md`](./TINCAN-CHARTER.md) §2. Codename for this final push: **TinCan.**

**Version:** 1.0 (plan locked 2026-05-04; gates the build session that follows).
**Scope contract:** [`TINCAN-CHARTER.md`](./TINCAN-CHARTER.md) §3 (Constraints), §4 (Guardrails), §6 (Done).
**Acceptance contract:** [`SPEC.md`](./SPEC.md) §3.1 items 4–5 (mechanical) + §3.2 (real-world) + [`TINCAN-CHARTER.md`](./TINCAN-CHARTER.md) §6 (browser overlay).
**Parent plan:** [`POC-PLAN.md`](./POC-PLAN.md) §2 Day 3 — Monday Morning + Monday Afternoon.

This is **not** a fresh 3-day arc. The AMS PoC's Day 1 and Day 2 are done; Day 2/3-boundary lifecycle frames (`joined → stream_joined → token → stream_left`) are live on the deployed Worker. What remains is the original Day 3 work plus the browser overlay scope locked in this session.

---

## 1. What Day 3 Originally Said

Per [`POC-PLAN.md`](./POC-PLAN.md) §2:

**Day 3 Morning** — stream ownership enforcement; lifecycle frames; PROTOCOL §6 close codes; **the two-agent example: a small Node script (or Claude Code tool definition) that wraps the AMS protocol and lets a Claude session join a conversation by URL.** End-to-end test: Klappy's Claude ↔ Ian's Claude.

**Day 3 Afternoon** — README, governance article, tag `v0.1.0`, oddkit gauntlet.

## 2. What's Already Done

- Stream ownership enforcement: live (per [`canon/decisions/D0009`](./canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription.md)).
- Lifecycle frames `joined`, `stream_joined`, `token`, `stream_left`: live on `ams.klappy.dev` and `ams.truthkit.ai`.
- PROTOCOL §6 close codes: implemented in the WebSocket `/connect` endpoint.

## 3. What's Left (= TinCan v1)

The remaining Day 3 work, plus the browser overlay scope from this session:

**A. The MCP wrapper** — the "two-agent example" line from Day 3 Morning, materialized as the canonical MCP edge wrapper.
- Deployed at `/mcp` on the existing AMS Worker (single Worker, internal routing — charter §5 default topology).
- Three tools: `ams_create_conversation`, `ams_join`, `ams_send` (the names already specified in SPEC §3.1 items 4–5).
- MCP `tools/list` returns the surface; `tools/call` translates to AMS HTTP control plane and AMS WebSocket wire as appropriate.
- Server-initiated MCP notifications stream incoming wire frames (`stream_joined`, `token`, `stream_left`) to the connected MCP client.
- Account-conversation Session DO keying per [`canon/decisions/D0019`](./canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying.md) from day one (no buffering ships, but the keying convention is in place).
- Capabilities round-trip per PROTOCOL §4.4.
- Honors the five Constraints from [`TINCAN-CHARTER.md`](./TINCAN-CHARTER.md) §3 and the seven Guardrails from §4.

**B. The browser homepage demo glue** — the operator-overlay extension defined in [`TINCAN-CHARTER.md`](./TINCAN-CHARTER.md) §2, materialized on the existing homepage.
- "Create Conversation" button on the homepage; hits the AMS HTTP control plane; displays returned magic-link URL with one-click copy.
- Browser-side MCP runtime per [`canon/decisions/D0012`](./canon/decisions/D0012-browser-is-an-mcp-runtime.md): browser opens an MCP connection to `/mcp`, calls `ams_join` on the freshly-minted URL, consumes notifications.
- Live render pane: incoming `stream_joined` and `token` frames displayed in real time, attributed by stream.
- Emit textbox: typed text becomes `ams_send` calls so the operator participates as a polymorphic subscriber alongside the agents.
- Browser declares its capabilities metadata so agents (by convention) can identify the human in the loop.
- Vanilla JavaScript only. No framework. No build step beyond what the existing homepage uses.

**C. The wrap-up docs** — the original Day 3 Afternoon items.
- `README.md` updated with "how to use the deployed instance" including the MCP server config snippet for Claude Code / Cursor / etc.
- Tag `v0.1.0` once SPEC §3.1 items 4–5 + §3.2 + charter §6 all pass.
- oddkit gauntlet pass: `oddkit_orient`, `oddkit_challenge`, `oddkit_encode` for any new foundational decisions surfaced during the build.

---

## 4. Done

TinCan v1 ships when **all** of the following pass against the live deployment, in one continuous demo run:

1. **SPEC §3.1 item 4** — A Claude Code instance configured with the AMS MCP server can call `ams_create_conversation` and receive a magic link.
2. **SPEC §3.1 item 5** — A second Claude Code instance (different bearer) can `ams_join` that link and `ams_send` a token; the first instance receives it within 5 seconds; neither instance receives its own emissions.
3. **SPEC §3.2 demo gate** — Klappy's agent ↔ Ian's agent (or equivalent two-machine Claude Code pair) exchange tokens through one AMS conversation, no human in the wire, no copy-paste of message contents.
4. **[`TINCAN-CHARTER.md`](./TINCAN-CHARTER.md) §6 browser overlay** — From the homepage in a clean browser, the operator can mint a conversation, copy its URL to two MCP-speaking agents, watch their streams render in real time, and emit tokens of their own that the agents see.
5. **Documentation** — `README.md` shows how to configure the MCP server. `v0.1.0` is tagged.

If steps 1–5 all pass, TinCan v1 has shipped, and the AMS PoC is done.

---

## 5. Closeout Discipline

Per [`canon/principles/poc-build-repeatability-pattern`](./canon/principles/poc-build-repeatability-pattern.md), and per the existing AMS PoC's Day 1/Day 2 closeout pattern in `journal/`:

- Build session ends with `journal/2026-MM-DD-tincan-day3-{topic}.tsv` containing DOLCHEO+ artifacts (Decision, Observation, Learning, Constraint, Handoff, Encode, Open).
- A **fresh-session validator** (separate Claude session, no shared context) reads the build journal and runs the §4 acceptance criteria against the deployed Worker independently, producing `journal/2026-MM-DD-tincan-day3-validation-closeout.tsv` with disposition: ACCEPT / ITERATE / PIVOT.
- If validation surfaces a regression, return-to-builder with a single-issue patch PR scoped by the validator's `O` (Observation) entries.

---

## 6. Pain to Expect (Operator Premortem, Recorded)

Per [`TINCAN-CHARTER.md`](./TINCAN-CHARTER.md) §5: **the absence of buffering may be the layer that prevents agent-to-agent from working in practice.** Turn-based MCP transports open a fresh transport session per turn; if agent-A emits while agent-B's MCP client is between turns, the token can vanish.

If this manifests during the SPEC §3.1 item 5 / §3.2 test:
- Build-from-pain disposition is **PIVOT**: layer in [`canon/decisions/D0016`](./canon/decisions/D0016-buffering-and-persistence-as-wrapper-primitive.md) buffering as a wrapper-layer primitive, scoped to a minimal in-memory replay window. D0016 is already-locked canon; its primitive shape (per-stream ring with TTL + size bounds) is ready to implement.
- Charter §4 guardrail "no buffering primitive built into TinCan" is amended on the same branch with explicit reference to the build-evidence that forced re-entry.
- This is not failure of the plan — it is the plan working as designed. Build from pain, not theory.

If buffering is not the failure mode, the original guardrail holds and v1 ships bare.

---

## 7. Explicit Non-Work for TinCan v1

Per [`TINCAN-CHARTER.md`](./TINCAN-CHARTER.md) §4. Not repeated here. The non-work list with re-entry signals lives in the charter; the build plan inherits it without restatement.

---

## 8. After TinCan v1 Lands (= AMS PoC Done)

When `v0.1.0` is tagged, the AMS PoC is shipped. Follow-up work, in priority order, none in this scope:

- **Buffering ([`D0016`](./canon/decisions/D0016-buffering-and-persistence-as-wrapper-primitive.md))** if the operator premortem proved out and the in-build pivot was minimal — the full primitive deserves its own next session.
- **Encryption placement decision** — operator resolves [`P0001`](./canon/proposals/P0001-stream-encryption-as-pre-syndication-wrapper.md) (a) vs (b) based on what TinCan teaches.
- **Threat model gap closure** — open work referenced in [`canon/principles/security-as-subscriber-pattern`](./canon/principles/security-as-subscriber-pattern.md).
- **Multi-stream-per-account demo** ([`D0018`](./canon/decisions/D0018-multi-stream-per-account-per-conversation.md)) when a use case demands it.
- **Brand-naming for the three product cuts** ([`D0022`](./canon/decisions/D0022-multi-brand-portfolio-on-shared-substrate.md)) once TinCan's build evidence justifies the specific cuts.
- **Deployment topology revisit** if single-Worker `/mcp` routing proves limiting at scale.
- **The next vertical** (per [`canon/principles/poc-build-repeatability-pattern`](./canon/principles/poc-build-repeatability-pattern.md)) — ClearWriter or whatever the operator picks. *That* is the next 3-day arc; TinCan is not.

---

## 9. References

- [`TINCAN-CHARTER.md`](./TINCAN-CHARTER.md) — the charter this plan operates inside.
- [`POC-PLAN.md`](./POC-PLAN.md) §2 Day 3 — the parent plan; this document executes its remaining scope.
- [`SPEC.md`](./SPEC.md) §3.1 items 4–5, §3.2 — the existing acceptance contract.
- [`canon/principles/poc-build-repeatability-pattern.md`](./canon/principles/poc-build-repeatability-pattern.md) — the day-by-day pattern (for *next* verticals; not for restarting AMS PoC).
- [`canon/principles/vodka-architecture-applied.md`](./canon/principles/vodka-architecture-applied.md) — the four review questions every proposed change runs through.
- [`canon/constraints/mcp-wrapper-conformance-for-conversational-ai.md`](./canon/constraints/mcp-wrapper-conformance-for-conversational-ai.md) — what the wrapper must surface.
- [`canon/constraints/wrapper-stays-cheap.md`](./canon/constraints/wrapper-stays-cheap.md) — the discipline that keeps TinCan from growing into a product.
