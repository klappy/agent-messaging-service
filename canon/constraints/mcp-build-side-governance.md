---
uri: ams://canon/constraints/mcp-build-side-governance
title: "MCP Build-Side Governance — Any AMS MCP Wrapper Is Built on the Maintained SDK; Handrolling Requires a Named Justification"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "constraint", "mcp", "edge-wrapper", "build-discipline", "sdk", "borrow-before-build", "operator-attention", "anti-pattern"]
epoch: E0008.5
date: 2026-05-05
derives_from: "journal/2026-05-03-day3-mcp-sdk-migration.tsv (Decision row, Constraint row, Learning row), klappy://docs/promotions/P0002-borrow-evaluation-before-implementation, ams://canon/constraints/wrapper-stays-cheap, ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai, klappy://canon/methods/borrow-bend-break-beget-build, klappy://canon/principles/doing-less-enables-more"
governs: "Implementation substrate of any AMS MCP wrapper class — the hosted Worker /mcp endpoint, the stdio reference example, future MCP wrapper variants. Distinct from the surface conformance constraint which governs what the wrapper exposes."
status: active
---

# MCP Build-Side Governance — Any AMS MCP Wrapper Is Built on the Maintained SDK; Handrolling Requires a Named Justification

> Any AMS MCP wrapper is built on the official MCP SDK appropriate to its runtime. For the hosted Worker wrapper that lives behind `/mcp`, that SDK is Cloudflare's `agents/mcp` package (the `McpAgent` class). For stdio reference examples, that SDK is `@modelcontextprotocol/sdk`. Handrolling the MCP transport, JSON-RPC framing, capabilities negotiation, or notification dispatch is a deviation from the default and requires a named justification recorded in the plan before any execution begins. The justification follows the inspection criteria in `klappy://docs/promotions/P0002-borrow-evaluation-before-implementation`.

## Description

This constraint exists because the same handroll has occurred six times across six MCP server projects with the same operator and the same model family, and the corrective conversation cannot happen a seventh time. The empirical claim is established, not theoretical: the failure mode is consistent, the bug class is consistent, and the operator-attention cost is non-recoverable.

The rule is narrow and falsifiable: when implementing any AMS MCP wrapper, the agent must use the maintained SDK for the runtime in question, OR the agent must have written, before execution, a single-line justification naming which inspection criterion from P0002 applies (vision conflict, foundational gap, gross overcomplication, opinionated stack imposition, improper authority, or persistent gap after multiple field iterations) and what specifically was inspected. A blank justification, an aesthetic preference ("I want to understand it"), or a silent skip does not satisfy the rule.

This constraint complements `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai` but is not the same thing. That constraint governs **what the wrapper exposes** — the six MCP tools, two notifications, one resource, the translation requirements, the latency budget, the backpressure behavior. This constraint governs **how the wrapper is built** — the implementation substrate beneath the surface. A wrapper can satisfy conformance and violate build-side governance, or vice versa; both must hold.

## Outline

- The Required Substrate, By Runtime
- What This Forbids
- The Justified-Handroll Escape Hatch
- Counter-Example — The Day 3 Stdio Migration
- Risks, Tensions, and Reversibility
- Success Criteria
- What This Is Not

---

## The Required Substrate, By Runtime

| Wrapper class | Runtime | Required SDK | Authority |
|---|---|---|---|
| Hosted Worker wrapper at `/mcp` | Cloudflare Workers + Durable Objects | Cloudflare `agents/mcp` (`McpAgent`) | `journal/2026-05-03-day3-mcp-sdk-migration.tsv` Constraint row |
| Stdio reference example | Node.js / TS stdio | `@modelcontextprotocol/sdk` v1.29+ (`McpServer` + `StdioServerTransport` + zod) | `journal/2026-05-03-day3-mcp-sdk-migration.tsv` Decision row |
| Future wrapper classes | TBD | The maintained SDK by the protocol authors for the target runtime | This constraint, generalized |

If a runtime has no maintained SDK from the protocol authors at the time of implementation, the constraint becomes inert for that wrapper class until one ships. The agent records the absence in the plan; this is not a silent skip.

## What This Forbids

The following are violations regardless of how the resulting code performs:

- Implementing JSON-RPC envelope construction, request/response framing, or notification serialization by hand when the SDK provides these.
- Implementing the MCP `initialize` handshake, `tools/list`, `tools/call`, or `notifications/initialized` dispatch by hand when the SDK provides these.
- Implementing Streamable HTTP transport (POST + SSE) framing by hand when the SDK provides it.
- Implementing capabilities negotiation by hand when the SDK provides it.
- Hardcoding the MCP protocol version as a literal string instead of letting the SDK declare it.
- Defining `JsonRpcRequest` / `JsonRpcResponse` / `JsonRpcNotification` interfaces locally when the SDK exports them.

The forbidden moves all have the same shape: re-implementing a layer of the protocol that the SDK already implements, in the absence of a named justification for doing so.

## The Justified-Handroll Escape Hatch

Handrolling is permitted when the plan records, before execution, a single-line justification of the form:

> "Handrolling [layer] because [P0002 criterion] applies: [what was inspected] [why it does not fit]."

Acceptable example:

> "Handrolling the Streamable HTTP transport because *opinionated stack imposition* applies: inspected `@cloudflare/agents@0.1.0`, which requires a Durable Object inheritance hierarchy that conflicts with the existing SessionDO topology committed in POC-INFRA §4. Handroll is the minimum delta."

Unacceptable examples:

- "I want to understand the protocol myself." (Aesthetic preference, not a P0002 criterion.)
- "The SDK seems heavy." (Not specific; no inspection.)
- "It's only a few hundred lines." (Argues from size of change rather than location of it; see `klappy://canon/principles/doing-less-enables-more` smell test.)
- (Silent — no justification recorded at all.)

A justified handroll is canon-compliant. An unjustified handroll is a violation, regardless of the resulting code's quality. The discipline is about the recorded decision, not the artifact.

## Counter-Example — The Day 3 Stdio Migration

The stdio reference example at `examples/two-agents/mcp-server.mjs` was initially handrolled on 2026-05-03 morning. Cursor BugBot caught five structural bug classes (`recvBuffer.splice` losing the truncated flag; unhandled EventEmitter `error` event; recvBuffer not cleared on join replacement; failed `ams_join` masking the `not_joined` guard; `liveUrl` ignoring its parameter). The operator surfaced the lesson explicitly: *"we have to manually fix bugs that are not an issue in the SDK."*

Migrating to `@modelcontextprotocol/sdk` v1.29 (`McpServer` + `StdioServerTransport` + zod) eliminated four of five bug classes by construction — the SDK's protocol layer handles framing, the request handler signature carries typed validated args (no closure leak), and notification dispatch goes through `Protocol.notification` rather than a hand-rolled stdout writer. The fifth class became a single try/catch.

The journal recorded both the lesson and the binding decision for the next-shipping wrapper: *"The hosted /mcp endpoint (SessionDO) — when it lands — uses Cloudflare `agents/mcp` McpAgent, NOT a port of this stdio server."* That sentence is the proximate authority for this constraint.

This counter-example is load-bearing because it shows the rule is empirically grounded — the bug classes the SDK eliminates are not hypothetical, they are documented in PR #21's BugBot findings against this repository.

## Risks, Tensions, and Reversibility

**Risk 1 — SDK regression.** The SDK could ship a version with a regression that the handroll would not have. Mitigation: the justified-handroll escape hatch covers this case. The agent inspects, names the regression, records the handroll as the minimum delta.

**Risk 2 — SDK API churn.** The SDK could change in a way that breaks AMS's integration. Mitigation: pin the SDK version in `package.json`; the lock is updated deliberately, not silently. This is normal dependency hygiene.

**Risk 3 — Mismatch between SDK and AMS-specific affordances.** The SDK might not expose the exact extension points AMS needs (e.g., for the `notifications/ams/*` non-standard methods). Mitigation: the SDK's underlying `Protocol` layer is accessible (per the day-3 stdio migration's pattern: `server.server.notification(...)`); AMS extensions go through the documented escape hatch, not around it.

**Tension with `wrapper-stays-cheap`.** The wrapper-stays-cheap rule says the wrapper does only translation. The build-side governance rule says the wrapper uses the SDK. These are not in tension: the SDK *is* the translation substrate; using it is the cheapest way to honor wrapper-stays-cheap. Handrolling violates wrapper-stays-cheap by definition (every handrolled framing line is wrapper-internal logic that is not translation).

**Tension with `doing-less-enables-more`.** The substrate-design principle says to refuse opinions at the wire. The build-side governance rule says to adopt opinions at the wrapper. These are not in tension: the wire (Conversation DO + WebSocket) refuses opinions; the wrapper is application-layer code above the wire and inherits the SDK's opinions about MCP because MCP is the protocol the wrapper translates *to*. The substrate stays vodka; the adapter on top of the substrate is allowed to be opinionated and should be.

**Reversibility.** This rule is itself reversible. If the SDK proves to be a net negative for AMS over time (e.g., it begins forcing topology changes that conflict with `D0006`, or it stops being maintained), the rule is updated via canon revision. The rule does not lock AMS to a specific SDK version or vendor — it locks AMS to the discipline of using whatever maintained SDK exists, and to recording deviations explicitly. Switching SDKs is a planning-mode change, not a constraint violation.

## Success Criteria

The constraint is working when:

- New MCP wrapper code added to AMS uses the appropriate SDK without prompting from the operator.
- Any handroll in `worker/src/` that touches MCP transport, framing, or capabilities is accompanied by a plan-level justification record (in the PR description, the journal, or both) naming the P0002 criterion that applies.
- An `oddkit_search` for "MCP wrapper" / "MCP server" / "build" / "SDK" surfaces this constraint in the top results during preflight, before the agent writes a line of MCP code.
- The recurrence count of "agent handrolled what the SDK already does" decreases monotonically across new wrapper sessions.

The constraint is failing when:

- A new MCP wrapper or wrapper extension lands without an SDK import and without a justification record.
- The agent re-implements protocol-version handshake, tools dispatch, or notification framing in canon-search without the rule being surfaced.
- The operator has to point at this document to enforce it (rather than the document enforcing itself via search/preflight).

The disconfirmer that would invalidate this constraint:

- A maintained MCP SDK becomes consistently worse than handrolling — empirically, across multiple AMS wrapper attempts, with documented bug classes the SDK introduces that the handroll did not have. In that world, the rule is updated to point at a different substrate or to relax the default.

## What This Is Not

- **Not a substitute for `mcp-wrapper-conformance-for-conversational-ai`.** Conformance governs the surface; this governs the substrate. Both must hold.
- **Not a ban on handrolling.** Handrolling with a recorded P0002-criterion justification is canon-compliant.
- **Not specific to AMS.** The pattern this codifies is general; the agent-binding form across all of klappy's projects lives in `klappy://docs/promotions/P0002-borrow-evaluation-before-implementation` (currently `proposed`; canon-execution pending). This constraint is the AMS-local manifestation that binds independently of P0002's upstream execution.
- **Not retroactive.** The existing `worker/src/mcp.ts` (1003 lines, fully handrolled, shipped in PR #33) remains in place until the rewrite ships as its own decision. This constraint binds new and modified MCP wrapper code from this date forward; the existing handroll is documented as a debt in the journal entry that introduces this constraint.

## See Also

- `journal/2026-05-03-day3-mcp-sdk-migration.tsv` — the binding journal entry this constraint canonizes
- `journal/2026-05-05-mcp-handroll-recurrence-canon-fix.tsv` — the journal entry recording why this constraint exists
- `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai` — the surface-side companion
- `ams://canon/constraints/wrapper-stays-cheap` — the discipline this constraint is one expression of
- `klappy://canon/methods/borrow-bend-break-beget-build` — the meta-method
- `klappy://docs/promotions/P0002-borrow-evaluation-before-implementation` — the agent-binding generalization (proposed)
- `klappy://canon/principles/doing-less-enables-more` — the empirical claim about why substrate refusal wins (and why adapter adoption follows the same logic at the layer above)
- `SPEC.md §11` item 1 — the previously-open decision this constraint resolves
