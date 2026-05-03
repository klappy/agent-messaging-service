# `examples/two-agents/`

The two-agent demo for the AMS PoC. Three runnable artifacts in one directory:

| Artifact | What it proves |
|----------|----------------|
| `two-agents.mjs` | SPEC §3.2 demo gate — two agents in one Node process exchange tokens through one AMS conversation; D0009 structural self-exclusion holds on the wire. |
| `mcp-server.mjs` | A stdio MCP server (built on the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)) that exposes the six AMS tools (`ams_create_conversation`, `ams_join`, `ams_send`, `ams_set_metadata`, `ams_leave`, `ams_recv`) and the two notifications (`notifications/ams/token`, `notifications/ams/stream_metadata`) per [`ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai`](../../canon/constraints/mcp-wrapper-conformance-for-conversational-ai.md). The SDK handles the JSON-RPC framing, initialize handshake, and tool dispatch — this file only declares tool surfaces and translates them into AMS wire calls. |
| `test-mcp-pair.mjs` | SPEC §3.1 items 4 + 5 — two MCP-server subprocesses driven through the create / join / send / receive sequence end-to-end. |
| `test-close-codes.mjs` | PROTOCOL.md §6 — verifies 4001 / 4002 / 4004 / 4005 / 4400 close codes fire on the wire. |

The bare-wire path is intentionally cheap and Node-native. Per [D0012](../../canon/decisions/D0012-browser-is-an-mcp-runtime.md), Node can hit `/connect` directly because Node WebSocket implementations support arbitrary headers (`Authorization` in particular); browsers go through the MCP wrapper. The MCP server in this directory is the local-stdio reference for the wrapper surface; the hosted SessionDO at `/mcp` (POC-INFRA §3) is the next step beyond this PoC slice.

## Setup

```bash
cd examples/two-agents
npm install      # installs `ws` (the only dep)
```

## Run against the deployed instance

```bash
# Default host is https://ams.klappy.dev
node two-agents.mjs
node test-mcp-pair.mjs
node test-close-codes.mjs

# Or point at the secondary CNAME from D0011 — both work identically.
AMS_HOST=https://ams.truthkit.ai node two-agents.mjs
```

`AMS_HOST` controls the base URL used for all three scripts. When set, the demo will also rewrite the magic link's origin so it stays bound to the chosen host (the magic link is opaque per PROTOCOL §2; this rewrite is a dev convenience, not a wire-spec relaxation).

## Run against a local `wrangler dev`

```bash
# In one shell:
cd ../../worker
npx wrangler dev --local --port 8787

# In another:
cd examples/two-agents
AMS_HOST=http://127.0.0.1:8787 node two-agents.mjs
AMS_HOST=http://127.0.0.1:8787 node test-mcp-pair.mjs
AMS_HOST=http://127.0.0.1:8787 node test-close-codes.mjs
```

`worker/.dev.vars` must declare `AMS_CREDENTIAL_PEPPER` and `AMS_PERMISSIVE_TOKEN_PEPPER` — wrangler reads them as local secrets.

## Use the MCP server from Claude Code

```jsonc
// ~/.claude.json or your Claude Code MCP config
{
  "mcpServers": {
    "ams": {
      "command": "node",
      "args": ["./examples/two-agents/mcp-server.mjs"],
      "env": {
        "AMS_HOST": "https://ams.klappy.dev",
        "AMS_NAMESPACE": "your-namespace-here"
      }
    }
  }
}
```

The first call auto-mints an account under `AMS_NAMESPACE`. To reuse a pre-minted credential, set `AMS_CREDENTIAL=ams_sk_…` and Claude Code's per-session bearer is bound to it.

## What's in scope and what isn't

In scope (and demonstrated here):

- Six MCP tools, two notifications, and the `ams_recv` degradation path.
- D0009 structural self-exclusion verified on both bare-wire and MCP paths.
- Cross-host parity (point `AMS_HOST` at either `ams.klappy.dev` or `ams.truthkit.ai`).
- Close-code conformance for the codes implementable in PoC scope.

Out of scope for this directory:

- The hosted `/mcp` endpoint (SessionDO). Local stdio MCP is sufficient to exercise SPEC §3.1 items 4 + 5. The hosted wrapper lands when there's a browser or hosted-Claude consumer demanding it; the planned shape is a Cloudflare `agents/mcp` `McpAgent` (Worker-hosted Durable Object), not a stdio server.
- Backpressure observation (PROTOCOL §6 close 4290) — `recvBuffer` enforces a soft drop policy with `truncated` signaling, but the wire-side 4290 close requires bufferedAmount tracking that is post-PoC.
- Per-account concurrency caps (PROTOCOL §6 close 4003) — SPEC §8 names the cap as 10 streams/account; enforcement requires global state across DOs and is post-PoC.
