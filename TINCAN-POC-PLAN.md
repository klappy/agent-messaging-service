# TinCan PoC Plan

> The build plan that ships TinCan v1 per [`TINCAN-CHARTER.md`](./TINCAN-CHARTER.md). Three numbered build days with closeout gates between them, in the shape of [`canon/principles/poc-build-repeatability-pattern`](./canon/principles/poc-build-repeatability-pattern.md).

**Version:** 1.0 (plan locked 2026-05-04; gates the build sessions that follow).
**Scope contract:** [`TINCAN-CHARTER.md`](./TINCAN-CHARTER.md) §3 (Constraints), §4 (Guardrails), §6 (Done).
**Acceptance contract:** [`SPEC.md`](./SPEC.md) §3.1 items 4–5 (mechanical) + §3.2 (real-world) + [`TINCAN-CHARTER.md`](./TINCAN-CHARTER.md) §6 (browser-overlay extension).

---

## 1. Demo Script (the Definition of Done)

Per [`TINCAN-CHARTER.md`](./TINCAN-CHARTER.md) §6, in one paragraph:

From the AMS homepage in a clean browser, the operator clicks Mint, copies the URL, pastes it into two MCP-speaking agents (any combination — Claude Code instances, Claude in browser tabs, Claude + Cursor), watches both join, watches them exchange tokens in real time in the browser pane, and emits a token of their own that the agents see. No human in the wire. No copy-paste of message contents. End-to-end, on the live deployment.

If that sequence works, TinCan v1 has shipped.

---

## 2. Day-by-Day Plan

### Day 1 — MCP Wrapper Bones

**Goal:** TinCan MCP server scaffolded, deployed at `/mcp` on the existing AMS Worker, exposing the canonical MCP server surface with one tool working end-to-end against the AMS HTTP control plane.

- Scaffold the `worker/src/mcp/` directory inside the existing AMS Worker. No new Worker, no new domain — the wrapper rides the existing deployment per the charter's default topology assumption.
- Implement MCP server transport at `POST /mcp` (HTTP) and/or stdio shim — whichever satisfies SPEC §3.1 item 4's "configured with the AMS MCP server can call `ams_create_conversation`." Start with HTTP/SSE since the existing wire is already HTTP-shaped.
- Implement `tools/list` returning the three-tool surface: `ams_create_conversation`, `ams_join`, `ams_send`. Each declared with full JSON schemas so MCP clients can introspect.
- Implement `ams_create_conversation` end-to-end: MCP `tools/call` → wrapper translates to AMS `POST /v1/{ns}/conversations` → returns the magic-link URL to the MCP client.
- Adopt [`D0019`](./canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying.md) account-conversation Session DO keying pattern from day one, even though no buffering ships in v1. The keying convention must already be `account_id + conversation_id` rather than MCP-transport-session.
- Round-trip the `capabilities` declaration per PROTOCOL §4.4 — set capabilities → readable from peer.
- Push the branch; the git-hook deploy lands the Worker with the new `/mcp` route on both `ams.klappy.dev` and `ams.truthkit.ai`.

**Done when:** A Claude Code instance configured with `https://ams.klappy.dev/mcp` (or stdio shim) as its MCP server can call `ams_create_conversation` and receive a magic-link URL. SPEC §3.1 item 4 passes.

**Pain to expect (and what it would mean):**
- MCP HTTP transport semantics don't match AMS's existing HTTP shape → may need stdio shim instead of, or alongside, HTTP. Re-entry signal for SPEC adjustment.
- D0019 keying surfaces an unexpected lifecycle issue → Session DO design needs revision before Day 2.

---

### Day 2 — Agent-to-Agent Token Exchange

**Goal:** Two MCP clients in the same conversation exchange tokens through TinCan, with default subscription (subscribe-to-all-except-own per [`D0017`](./canon/decisions/D0017-selective-subscription.md)) honored. SPEC §3.1 item 5 + §3.2 real-world demo gate pass.

- Implement `ams_join` end-to-end: MCP `tools/call ams_join` → wrapper opens a WebSocket to the AMS wire on behalf of the MCP client → joins the conversation as a stream-owning subscriber.
- Implement `ams_send` end-to-end: MCP `tools/call ams_send` → wrapper emits a token frame on the wire.
- Implement MCP-side server-initiated notifications: incoming wire frames (`joined`, `stream_joined`, `token`, `stream_left`) translated to MCP notifications and pushed to the connected client.
- Verify [`D0009`](./canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription.md) holds: each MCP client receives the OTHER's tokens, not its own.
- Run the live two-Claude-Code test from SPEC §3.1 item 5 against the deployed wrapper.
- Run the SPEC §3.2 demo gate end-to-end (Klappy's Claude Code ↔ Ian's Claude Code, two physical machines, no copy-paste of message contents).

**Done when:** SPEC §3.1 item 5 passes (two Claude Code instances exchange tokens; first receives second's tokens within 5 seconds; neither receives its own). SPEC §3.2 real-world demo gate passes.

**Pain to expect (and what it would mean) — operator premortem applies here:**
- Tokens vanish when the receiving client's MCP transport is between turns → buffering is the missing layer. [`D0016`](./canon/decisions/D0016-buffering-and-persistence-as-wrapper-primitive.md) enters scope as v1.1, OR the wrapper's Session DO grows a minimal in-memory replay window (whichever the operator gates after seeing the failure).
- Two-MCP-client coordination is fine within a single MCP server instance but breaks across instances → may need a deployment topology revision (out of v1 scope; would be a re-entry signal documented in §6).

---

### Day 3 — Browser Demo Glue

**Goal:** The homepage demo flow per [`TINCAN-CHARTER.md`](./TINCAN-CHARTER.md) §2 works end-to-end. Mint → distribute → connect → watch → participate, all from the homepage with vanilla JavaScript.

- Add a "Mint Conversation" button to the homepage at `worker/src/homepage.ts`. Hits `POST /v1/{ns}/conversations` (using a homepage-scoped account) and displays the returned magic-link URL.
- Display the magic-link URL with a one-click copy affordance.
- Implement the browser-side MCP runtime per [`D0012`](./canon/decisions/D0012-browser-is-an-mcp-runtime.md): the browser opens an MCP connection to `/mcp`, calls `ams_join` on the freshly-minted conversation URL, and consumes incoming notifications.
- Render incoming `stream_joined` and `token` frames in a live pane, attributing each to its emitting stream.
- Add an emit textbox: typed text becomes `ams_send` calls; the operator's tokens flow into the conversation alongside the agents.
- Declare the browser's capabilities metadata so agents (by convention) can identify the human in the loop.
- Vanilla JavaScript only. No framework. No build step beyond what the existing homepage uses.

**Done when:** [`TINCAN-CHARTER.md`](./TINCAN-CHARTER.md) §6 passes — the five-step demo runs in a clean browser session against the live deployment, with two real MCP-speaking agents and the operator-as-subscriber overlay.

**Pain to expect (and what it would mean):**
- Browser-side MCP transport quirks (CORS, EventSource limits, WebSocket upgrade in-browser) → may force a small homepage-specific adapter that the wrapper translates. Acceptable as long as it stays cheap.
- Real-time render lag → not a TinCan problem; that's the wire and the browser's rendering. Surface it for observability follow-up but do not block Day 3.

---

## 3. Explicit Non-Work for TinCan v1

The non-work list is half the discipline. TinCan v1 will NOT ship any of these. Each item names the **re-entry signal** that would force pulling it into v1.

- **No buffering.** Re-entry: Day 2 closeout confirms agent-to-agent fails because of MCP transport-session gaps (operator premortem). [`D0016`](./canon/decisions/D0016-buffering-and-persistence-as-wrapper-primitive.md) is already-locked canon, layers in driven by evidence not theory.
- **No encryption.** Re-entry: the operator selects [`P0001`](./canon/proposals/P0001-stream-encryption-as-pre-syndication-wrapper.md) (a) or (b). Until then, TinCan ships bare.
- **No multi-stream-per-account-per-conversation.** Re-entry: a use case in TinCan demands one account owning multiple streams in one conversation. v1 is one-stream-per-account; [`D0018`](./canon/decisions/D0018-multi-stream-per-account-per-conversation.md) is reachable later.
- **No security subscribers running.** Re-entry: the operator wants the demo itself to ship with at least one security subscriber (e.g. an audit sink). v1 surfaces the *attachment shape* (capabilities declaration round-trip) but does not run any security subscriber.
- **No identity verification beyond AMS account bearer.** Re-entry: a regulated-tier use case demands signing-as-subscriber attestation in the demo. v1 trusts AMS account credentials only.
- **No SDK beyond minimal example clients.** Re-entry: external developers ask for a published library. v1 ships example scripts, not a packaged SDK.
- **No deployment beyond `/mcp` on existing AMS Worker.** Re-entry: deployment-topology decision (charter §5) gets resolved against the single-Worker default. v1 stays on the simplest topology.
- **No client-side framework.** Re-entry: the demo grows past what vanilla JS handles cleanly. Vodka-violating; defer.
- **No persistence beyond what AMS already provides.** Re-entry: D0016 buffering enters v1.
- **No new wire protocol changes.** Re-entry: never. Wire stability is the substrate guarantee.
- **No alternate MCP tool names.** TinCan adopts the existing AMS-spec tool surface (`ams_create_conversation`, `ams_join`, `ams_send`). Renaming or adding tools is not in v1.

---

## 4. Success Criteria

- All five steps of the [`TINCAN-CHARTER.md`](./TINCAN-CHARTER.md) §6 demo flow pass in a clean browser session.
- SPEC §3.1 items 4 and 5 pass against the deployed Worker.
- SPEC §3.2 real-world demo gate passes (agent-to-agent, two physical machines, no human in the wire).
- The wrapper compiles and deploys via the existing git-hook branch deploy with no manual steps.
- All five Constraints from charter §3 are demonstrably honored in the running system.
- All seven Guardrails from charter §4 are not violated by the shipped code.

---

## 5. Risks for the Week

- **The operator premortem.** Buffering may be the load-bearing missing layer; without it, Day 2's agent-to-agent demo may fail intermittently or completely. Mitigation: ship anyway, see if the failure manifests, layer in [`D0016`](./canon/decisions/D0016-buffering-and-persistence-as-wrapper-primitive.md) driven by evidence rather than theory. If the failure is total, Day 2 closes with disposition PIVOT and v1 grows a minimal buffering primitive.
- **MCP transport choice (HTTP vs stdio).** SPEC §3.1 doesn't pin which transport; both have real costs. Mitigation: pick HTTP/SSE first (closer to the existing AMS shape) and add stdio later only if a Claude Code or other MCP client requires it.
- **Browser MCP runtime quirks.** D0012 says the browser is an MCP runtime; it does not say the browser MCP client is friction-free. Mitigation: scope Day 3 generously; if browser-side MCP is too painful, narrow Day 3 to "homepage shows the URL and a viewer pane" and the operator participates from a separate Claude Code window.
- **Scope creep.** The charter explicitly defers many things (encryption, security subscribers, multi-stream, etc.). Mid-build, any of these can feel "small enough to add now." They are not. Re-entry requires explicit gate. Mitigation: the non-work list with re-entry signals is the lock.

---

## 6. Closeout Discipline

Per [`canon/principles/poc-build-repeatability-pattern`](./canon/principles/poc-build-repeatability-pattern.md):

- Each day ends with a build journal: `journal/YYYY-MM-DD-tincan-day{N}-{topic}.tsv` containing DOLCHEO+ artifacts (Decision, Observation, Learning, Constraint, Handoff, Encode, Open).
- Each Day N+1 starts with a **fresh-session validator** (a separate Claude session, no shared context with the build session) that reads Day N's build journal and runs Day N's acceptance criteria against the deployed Worker independently. Validator produces `journal/YYYY-MM-DD-tincan-day{N}-validation-closeout.tsv` with disposition: ACCEPT / ITERATE / PIVOT.
- The build session and the validation session share a Worker URL, this plan, the SPEC, and the journal directory — they share nothing else.
- If validation surfaces a regression, the loop returns to the builder with a single-issue patch PR — not a vague "redo Day N." The validator's `O` (Observation) entries are the spec of what to fix.

---

## 7. After TinCan v1 Lands

Post-demo follow-ups, in priority order (none are TinCan v1 work):

- **Buffering (D0016)** if the operator premortem proves out — first follow-up if Day 2 needed it.
- **Encryption placement decision** — operator resolves [`P0001`](./canon/proposals/P0001-stream-encryption-as-pre-syndication-wrapper.md) (a) vs (b) based on what TinCan teaches.
- **Threat model gap closure** — the open work referenced in [`canon/principles/security-as-subscriber-pattern`](./canon/principles/security-as-subscriber-pattern.md) and the [2026-05-02 per-conversation-runtime-isolation journal entry](./journal/2026-05-02-ams-per-conversation-runtime-isolation-idea.tsv).
- **Multi-stream-per-account demo** ([`D0018`](./canon/decisions/D0018-multi-stream-per-account-per-conversation.md)) when a use case demands it.
- **Brand-naming for the three product cuts** ([`D0022`](./canon/decisions/D0022-multi-brand-portfolio-on-shared-substrate.md)) once TinCan's build evidence justifies the specific cuts.
- **Deployment topology revisit** if single-Worker `/mcp` routing proves limiting at scale.

---

## 8. References

- [`TINCAN-CHARTER.md`](./TINCAN-CHARTER.md) — the charter this plan operates inside.
- [`SPEC.md`](./SPEC.md) §3.1 items 4–5, §3.2 — the existing acceptance contract this plan satisfies.
- [`POC-PLAN.md`](./POC-PLAN.md) — the original AMS PoC plan this plan mirrors in shape.
- [`canon/principles/poc-build-repeatability-pattern.md`](./canon/principles/poc-build-repeatability-pattern.md) — the day-by-day pattern.
- [`canon/principles/vodka-architecture-applied.md`](./canon/principles/vodka-architecture-applied.md) — the four review questions every proposed change runs through.
- [`canon/constraints/mcp-wrapper-conformance-for-conversational-ai.md`](./canon/constraints/mcp-wrapper-conformance-for-conversational-ai.md) — what the wrapper must surface.
- [`canon/constraints/wrapper-stays-cheap.md`](./canon/constraints/wrapper-stays-cheap.md) — the discipline that keeps TinCan from growing into a product.
