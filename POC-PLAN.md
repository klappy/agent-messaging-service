# AMS PoC Plan

The week-one execution plan. Target: demonstrable end-to-end agent-to-agent conversation by **end of next week**.

The success measure is not "AMS exists." It is "the hackathon copy-paste scenario is gone."

---

## 1. Demo Script (the Definition of Done)

Two terminals on two laptops. One agent each.

1. Klappy's agent: "Create an AMS conversation and give me the magic link."
   → Agent calls `POST /v1/accounts` (if no account yet), then `POST /v1/klappy/conversations`. Prints the magic link URL.
2. Klappy hands the URL to Ian (paste into Signal, say it out loud, whatever).
3. Ian's agent: "Join this AMS conversation: https://ams.klappy.dev/klappy/conversations/falcon-pulse-9421?t=..."
   → Agent calls `POST /v1/accounts` under namespace `ian` (if needed), then opens a WebSocket to the URL.
4. Klappy's agent: "Ask Ian's agent to summarize the last commit on `truthkit-proxy`."
   → Token emitted on Klappy's stream. Ian's agent receives it. Ian's agent does the work, emits the summary on its stream. Klappy's agent receives it. Klappy reads it.
5. No copy-paste at any step.

If that sequence works end-to-end, the PoC succeeded.

---

## 2. Day-by-Day Plan

### Day 1 — Saturday

**Goal:** Worker shell, account model, conversation minting, URL routing (no WebSocket yet).

- Scaffold the `worker/` directory. Wrangler config, basic routes.
- Implement `POST /v1/accounts` — namespace allocation, credential issuance, KV write.
- Implement bearer-token middleware.
- Implement `POST /v1/{namespace}/conversations` — generate conversation_id, alias mapping, permissive token, magic link URL.
- Deploy to a staging subdomain. Verify with curl.

**Done when:** `curl -X POST .../v1/accounts` returns a credential. `curl -X POST .../v1/klappy/conversations` (with credential) returns a magic link URL.

### Day 2 — Sunday

**Goal:** Conversation Durable Object with WebSocket connect, single-conversation stream-scoped broadcast.

- Implement the Conversation Durable Object: stream registry, per-stream subscription registry (owners structurally excluded by default per `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`), stream-scoped broadcast loop.
- Implement WebSocket upgrade in the Worker, parse URL + permissive token + account credential + optional `X-AMS-Self-Subscribe` header, hand off to the DO.
- Implement `joined` server frame on connect (including the `self_subscribe` field echoing the effective opt-in state).
- Implement token frame routing (client emits → server broadcasts to every subscriber of the emitting stream, which excludes the stream's owning account by default).
- Manual test with two `wscat` sessions on the same magic link URL: emit on one, see on the other AND verify the emitter does not see its own frame.

**Done when:** two `wscat` clients on the same magic link URL can see each other's emitted tokens in real time, each tagged with the writing account / stream — and neither client receives its own emissions back from the wire (verifying the structural exclusion).

### Day 3 — Monday Morning

**Goal:** Stream ownership, lifecycle frames, error codes, the `examples/two-agents/` walkthrough.

- Enforce per-account stream ownership (an account cannot emit on a stream it does not own).
- Implement `stream_joined` and `stream_left` lifecycle frames.
- Implement the WebSocket close codes from `PROTOCOL.md` §6.
- Write the two-agent example: a small Node script (or Claude Code tool definition) that wraps the AMS protocol and lets a Claude session join a conversation by URL.
- End-to-end test: Klappy's Claude in one conversation with Ian's Claude.

**Done when:** the demo script in §1 of this document runs cleanly.

### Day 3 — Monday Afternoon

**Goal:** Documentation pass, governance article, ship-ready repo.

- Update `README.md` with "how to use the deployed instance."
- Write a short governance article (separate document) capturing the build process so it is repeatable for the next vertical.
- Tag `v0.1.0`. Push.
- Run the whole thing through the oddkit gauntlet: `oddkit_orient`, `oddkit_challenge`, `oddkit_encode` for any new foundational decisions surfaced during the build.

**Done when:** repo is public-able, gauntlet has surfaced any tensions worth addressing, and the demo runs from a clean clone.

---

## 3. Explicit Non-Work for the PoC

The following are *not* on the list, even though they are tempting:

- Magic link expiry or revocation
- Per-stream read scopes
- End-to-end encryption
- Federation across regions or brokers
- Token replay for late subscribers
- Per-account billing
- A web UI of any kind
- Identity layer beyond the account credential
- Capability-negotiation docs endpoint
- Observability beyond Worker logs
- JCS-SHA derived conversation identifiers
- Multi-stream-per-account-per-conversation
- Any client SDK beyond the example scripts in `examples/`

Each of these is a real layer that needs real attention. None of them is required to prove that the foundation works. Adding any of them this week increases the risk of missing the demo, which is the only thing that matters.

---

## 4. Success Criteria

| Criterion | How We Know |
|-----------|-------------|
| Two agents talk in real time without human copy-paste | Demo script runs end-to-end |
| The protocol is small enough to feel obvious | `worker/src/` totals under ~300 lines |
| Non-agent subscribers also work | `wscat` in the same conversation as an agent works identically |
| The reference implementation deploys with one command | `wrangler deploy` on a fresh clone |
| The architecture survived contact with the gauntlet | `oddkit_challenge` did not surface a tension that requires a rewrite |
| Magic link URL is genuinely shareable | URL paste into a fresh terminal, agent joins, conversation works |

---

## 5. Risks for the Week

- **WebSocket on Cloudflare Workers + DOs has subtle behavior.** Hibernation, message ordering across reconnects, etc. Time-box debugging to two hours; if blocked, fall back to a non-DO single-instance Worker for the demo and revisit.
- **The "demo Claude" wrapper.** Getting Claude Code (or another agent runtime) to invoke AMS calls cleanly is more about prompt engineering than protocol work. Should be fast, but worth scoping early.
- **Account model scope creep.** The account model is the easiest thing to over-build. Hard rule: bearer tokens, KV-backed, no expiry, no rotation, no billing. Done.
- **Spec drift while building.** If implementation reveals a problem with the protocol, update `PROTOCOL.md` *first*, then implement. Don't let code quietly diverge from the spec.

---

## 6. After the Demo Lands

The Monday afternoon governance article and oddkit gauntlet are not optional. They are how we make the PoC *repeatable* — so that the next vertical (ClearWriter, the help-desk-PR pipeline, whatever comes next) starts from a known process rather than another scramble.

The week's work is not "shipped" until that pass is done.
