# agent-runtime

Persona-shaped agent runtime per `klappy://canon/methods/persona-shaped-agent-runtime` (Tier-1 method, epoch E0009) and `klappy://canon/methods/spawned-agent-session-runtime-contract` (Tier-2 spec).

A vodka-thin Cloudflare Worker that does **one** thing: turn a five-dimension invocation (`persona`, `mode`, `role`, `surface`, `engagement`) into a spawned agent session, dispatch it to a substrate, and post-process the output. No AMS protocol. No TinCan surfaces. No orchestration. No persona content of its own.

## Why this worker exists

The canon at `klappy://canon/methods/persona-shaped-agent-runtime` describes a reusable substrate that turns "spin up an agent" capability into a service. The first deployment target named in canon is the AMS audit gate. Before this worker, AMS had its own ~900-line hand-rolled agent dispatcher in `worker/src/runtime/audit-gate.ts` — persona profile parsing, system prompt assembly, MCP wiring, SSE streaming, base64 round-tripping, output schema validation, all bespoke to one consumer. Each fix to that code re-discovered something the canon already specified.

This worker is the implementation the canon described. AMS becomes a consumer; TinCan and future personas become consumers. The runtime stays in one place.

## What lives here

- `src/index.ts` — HTTP entry point. One endpoint: `POST /v1/invoke`.
- `src/types.ts` — the five-dimension invocation contract and the persona profile shape.
- `src/persona.ts` *(next commit)* — resolve a persona profile by URI via oddkit.
- `src/prompt.ts` *(next commit)* — compose the system prompt per canon §Persona resolution: identity creed + system_prompt_uri body + mode scaffolding + surface scaffolding. **Does NOT inject brand_discipline canon body** per `klappy://canon/constraints/oddkit-prompt-pattern` — the agent dereferences brand_discipline via `oddkit_get` at session time.
- `src/surface.ts` *(next commit)* — output post-processing: machine/human field tagging, persona-emoji stripping in machine fields, voice-mode toggle, density caps.
- `src/substrate.ts` *(next commit)* — Anthropic Messages API adapter with native MCP connector. Streaming SSE so requests don't trip Cloudflare's 100s upstream-timeout limit.
- `src/invoke.ts` *(next commit)* — the orchestrator that ties persona resolution → prompt composition → substrate dispatch → surface post-processing together. Single direction, no orchestration of multi-session workflows.

## What does NOT live here

- **AMS protocol code.** AMS lives at `worker/`. This worker does not import from it.
- **TinCan surfaces.** TinCan lives at `packages/tincan/`. This worker does not import from it.
- **Persona content.** Personas are canon docs. The runtime fetches them via oddkit; it does not own them.
- **Governance canon bodies.** Per `klappy://canon/constraints/oddkit-prompt-pattern`, governance is fetched at runtime by the agent itself via oddkit tools, not pre-baked into the system prompt by the runtime.
- **Orchestration.** Per `klappy://canon/methods/persona-shaped-agent-runtime` §What This Method Is Not, the runtime invokes one persona per request. Multi-session workflows (validator → resolver → re-validate) are the caller's job.

## Deployment sequence (per canon)

1. **v1: validator-role / audit-surface / agent-engagement** *(this scaffold + the next commit)*. Replaces the AMS audit gate. The simplest first deployment because validator is read-only, the audit surface has a clear structured-output schema, and agent engagement has no turn-control to maintain.
2. **v2: builder + resolver** for the multi-role build workflow. Adds mutating-tool allow-lists and resolver-bounded scope.
3. **v3: explorer + planner** for the synthesis-ledger path.
4. **v4: observer** for Oddie's TinCan subscribed-session deployment.

Each version adds dimensions. None retroactively change v1 behavior.

## What the v1 scaffold ships

- The five-dimension invocation type, parsed and validated at submit time.
- A v1-scope refusal layer: invocations outside `validator/audit/agent/validation` are returned as structured `{status: "refused", refusal_reason: "..."}` — explicit, machine-readable, no pretense of doing more than it does.
- Global try/catch on the worker's fetch handler so any uncaught throw becomes a JSON 500 envelope, never a raw Cloudflare 1101.
- `/healthz` and `/version` endpoints for operational visibility.

That is the entire surface. The implementation files in the next commit add the validator-role / audit-surface path; everything else stays a structured refusal until its deployment lands.

## Local development

```bash
cd packages/agent-runtime
npm install
npm run typecheck
npm run dev   # local wrangler dev server
```

## What this worker is not promised to do

Per `klappy://canon/methods/spawned-agent-session-runtime-contract` §What This Method Does NOT Promise — mechanical enforcement at the runtime layer catches violations that are schema-detectable or tool-call-detectable. Content-level voice violations inside human-tagged narrative fields, subtle false-closure patterns in exploration output, and other content-level drift may pass the runtime checks. Human review remains in scope for production verdicts.
