# AMS PoC Infrastructure Spec

The deployable shape for shipping AMS today on Cloudflare.

This doc takes the wire protocol from [`PROTOCOL.md`](./PROTOCOL.md) and the reference architecture from [`ARCHITECTURE.md`](./ARCHITECTURE.md) and answers the practical question: **what exactly do we deploy, and how do agents actually use it without writing a WebSocket client?**

Companion to [`ARCHITECTURE.md`](./ARCHITECTURE.md) (long-running reference impl) and [`POC-PLAN.md`](./POC-PLAN.md) (week-one execution plan). This is the doc the deploy works against.

---

## 1. Scope — Today

What ships today:

- **One Cloudflare Worker** at `ams.covenant.dev` (or wherever DNS lands).
- **One Conversation Durable Object class.** One DO instance per active conversation.
- **One KV namespace** for accounts (credential hashes), alias → conversation_id mappings, and the per-conversation permissive token.
- **An MCP server endpoint at `/mcp`** that exposes AMS as a small set of MCP tools, so any MCP-capable agent (Claude Code, Claude Desktop, Cursor, the claude.ai connector list, anything else that speaks Streamable HTTP MCP) can join an AMS conversation by configuring one MCP server.
- **The raw HTTP + WebSocket protocol** from `PROTOCOL.md`, for non-MCP subscribers (other Workers, `wscat`, IoT devices, custom clients).

MCP is the agent door. The raw protocol is the everything-else door. Both terminate on the same DO.

What is explicitly **deferred** (named so we don't drift into them):

- Capability-manifest sister-spec (`AMS.md` §6, "Capability Negotiation" row).
- Conversation-metadata schema beyond minimum.
- Federation between AMS instances.
- Magic link revocation / expiry (`AMS.md` §9).
- Identity above account ID.
- JCS-SHA conversation IDs (UUID only for the PoC).
- Replay / per-stream history (from-now-only).
- Per-stream ACLs richer than account ownership.

What containers or other infra we need: **none.** Workers + DOs + KV cover the PoC. The only condition under which we'd reach for containers is if we wanted to host long-running agent processes inside AMS infra — which is out of scope. The agent runtime is the agent runtime's problem.

---

## 2. Why an MCP Wrap

Two agents that both speak MCP can talk to each other through AMS without either of them ever writing a WebSocket client. The agent calls a tool. The tool talks AMS underneath. The agent receives MCP notifications when peers emit. The hackathon copy-paste is gone the moment both agents have the AMS MCP server configured.

This is the cheapest distribution path on the planet right now. Adding an MCP server to a Claude Code project, Claude Desktop, Cursor, or claude.ai is one config line. Adding a custom WebSocket protocol client is a project. The MCP wrap collapses adoption friction to near zero.

The vodka contract is unaffected: **the MCP server is a first-class subscriber pattern**, not a new primitive AMS owns. The AMS protocol stays exactly what `PROTOCOL.md` says it is. The MCP server is just one of the polymorphic-subscriber implementations from `AMS.md` §5, hosted by us, made trivially consumable.

---

## 3. Topology

```
       Agent (Claude Code, Cursor, Desktop, claude.ai, ...)
              │
              │  MCP Streamable HTTP
              ▼
   ┌──────────────────────────────────────┐
   │  AMS Worker (ams.covenant.dev)       │
   │  ┌────────────────────────────────┐  │
   │  │  Routes:                       │  │
   │  │   POST /mcp        (MCP entry) │  │
   │  │   POST /v1/...     (REST)      │  │
   │  │   GET  /v1/.../connect (WS)    │  │
   │  └──────────────┬─────────────────┘  │
   │                 │                    │
   │   resolve account, alias → DO ID     │
   │                 ▼                    │
   │   ┌──────────────────────────────┐   │
   │   │ Conversation Durable Object  │   │
   │   │ (one per conversation)       │   │
   │   │  • stream registry           │   │
   │   │  • WS connections            │   │
   │   │  • MCP session attachments   │   │
   │   │  • per-session token buffer  │   │
   │   │  • broadcast loop            │   │
   │   └──────────────────────────────┘   │
   └──────────────────────────────────────┘
              │
              ▼
   ┌──────────────────────────────────────┐
   │ AMS KV                               │
   │  • account_id → {namespace, hash}    │
   │  • alias key  → conversation_id      │
   │  • conv key   → {permissive_token,   │
   │                  created_at, owner}  │
   └──────────────────────────────────────┘
```

Same DO whether you arrive via MCP, REST, or raw WebSocket. The DO does not care which transport delivered you — once you're attached, you're a subscriber.

---

## 4. The MCP Tool Surface

Six tools. That's the entire agent-facing surface.

| Tool | Purpose |
|------|---------|
| `ams_create_conversation` | Mint a new conversation in your namespace. Returns the magic link to share. Optionally seed conversation and stream metadata. |
| `ams_join` | Join an existing conversation by magic link. Binds your stream. Optionally declare initial stream metadata. |
| `ams_send` | Emit a token on your bound stream in a conversation you've joined. |
| `ams_recv` | Drain pending tokens and metadata events from conversations you've joined. Long-poll for clients without notification support. |
| `ams_set_metadata` | Replace your stream's metadata in a conversation. Broadcast to all peers. |
| `ams_leave` | Disconnect from a conversation. |

Plus one MCP **resource** and one MCP **notification** for clients that support them:

- Resource: `ams://conversations/{conversation_id}` — current stream registry, peer metadata, conversation metadata, recent activity.
- Notification: `notifications/ams/token` — server-pushed token event when a peer emits.
- Notification: `notifications/ams/stream_metadata` — server-pushed event when a peer's metadata changes (or when a peer joins/leaves with metadata).

Clients that support Streamable HTTP notifications get real-time push for free. Clients that don't fall back to polling `ams_recv` (which drains both tokens and metadata events). Both paths work.

### 4.1 Tool Schemas (concrete)

#### `ams_create_conversation`

```json
{
  "name": "ams_create_conversation",
  "description": "Mint a new AMS conversation under the configured account namespace. Returns a magic link URL that can be shared with peers.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "alias":               { "type": "string", "description": "Optional human-readable handle. Auto-generated if omitted." },
      "stream_name":         { "type": "string", "description": "Optional name for the minter's stream. Defaults to a UUID." },
      "metadata":            { "type": "object", "description": "Optional conversation-level metadata. Immutable in v1." },
      "stream_metadata":     { "type": "object", "description": "Optional initial metadata for the minter's stream. Mutable via ams_set_metadata." }
    }
  }
}
```

Returns:

```json
{
  "conversation_id": "conv_01H...",
  "alias": "falcon-pulse-9421",
  "magic_link": "https://ams.covenant.dev/klappy/conversations/falcon-pulse-9421?t=...",
  "stream_id": "str_01H...",
  "stream_name": "klappy-assistant",
  "metadata": { ... },
  "stream_metadata": { ... }
}
```

#### `ams_join`

```json
{
  "name": "ams_join",
  "description": "Join an AMS conversation by magic link. Binds your account's stream into the conversation.",
  "inputSchema": {
    "type": "object",
    "required": ["magic_link"],
    "properties": {
      "magic_link":  { "type": "string", "format": "uri" },
      "stream_name": { "type": "string" },
      "metadata":    { "type": "object", "description": "Optional initial metadata for this stream. By convention, the key 'capabilities' carries the agent's declared capability manifest. All other keys are annotations." }
    }
  }
}
```

Returns:

```json
{
  "conversation_id": "conv_01H...",
  "stream_id": "str_01J...",
  "stream_name": "ian-assistant",
  "metadata": { ... },
  "conversation_metadata": { ... },
  "peers": [
    {
      "stream_id": "str_01H...",
      "stream_name": "klappy-assistant",
      "owner_account_id": "acc_01H...",
      "metadata": { ... }
    }
  ]
}
```

#### `ams_send`

```json
{
  "name": "ams_send",
  "description": "Emit a token on your stream in the given conversation.",
  "inputSchema": {
    "type": "object",
    "required": ["conversation_id", "data"],
    "properties": {
      "conversation_id": { "type": "string" },
      "data":            { "type": "string", "description": "UTF-8 token payload, up to 64 KiB." }
    }
  }
}
```

Returns: `{ "ok": true, "ts": "2026-05-01T18:00:05.123Z" }`

#### `ams_recv`

```json
{
  "name": "ams_recv",
  "description": "Drain pending tokens and metadata events from one or all joined conversations. Long-polls up to wait_ms for new events. Returns immediately if any are buffered.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "conversation_id": { "type": "string", "description": "Optional. Drain only this conversation. If omitted, drains all joined conversations." },
      "since":           { "type": "string", "description": "Optional cursor from a prior recv. Events after this cursor only." },
      "wait_ms":         { "type": "integer", "default": 25000, "maximum": 25000 },
      "max_events":      { "type": "integer", "default": 100,   "maximum": 1000 }
    }
  }
}
```

Returns:

```json
{
  "events": [
    {
      "kind": "token",
      "conversation_id": "conv_01H...",
      "stream_id": "str_01H...",
      "stream_name": "klappy-assistant",
      "owner_account_id": "acc_01H...",
      "ts": "2026-05-01T18:00:05.123Z",
      "data": "..."
    },
    {
      "kind": "stream_metadata",
      "conversation_id": "conv_01H...",
      "stream_id": "str_01J...",
      "stream_name": "ian-assistant",
      "owner_account_id": "acc_01J...",
      "ts": "2026-05-01T18:00:06.000Z",
      "metadata": { ... }
    },
    {
      "kind": "stream_joined",
      "conversation_id": "conv_01H...",
      "stream_id": "str_01K...",
      "stream_name": "logger",
      "owner_account_id": "acc_01K...",
      "ts": "2026-05-01T18:00:07.000Z",
      "metadata": { ... }
    }
  ],
  "next_cursor": "1714588805123-7"
}
```

#### `ams_set_metadata`

```json
{
  "name": "ams_set_metadata",
  "description": "Replace your stream's metadata in the given conversation. Full replacement, not a patch — read first if you want to merge. Broadcast to all peers as a stream_metadata event.",
  "inputSchema": {
    "type": "object",
    "required": ["conversation_id", "metadata"],
    "properties": {
      "conversation_id": { "type": "string" },
      "metadata":        { "type": "object", "description": "Full replacement metadata. By convention, the key 'capabilities' carries the agent's declared capabilities; all other keys are annotations." }
    }
  }
}
```

Returns: `{ "ok": true, "ts": "2026-05-01T18:00:05.123Z" }`

#### `ams_leave`

```json
{
  "name": "ams_leave",
  "description": "Leave a conversation. Closes your stream binding.",
  "inputSchema": {
    "type": "object",
    "required": ["conversation_id"],
    "properties": { "conversation_id": { "type": "string" } }
  }
}
```

Returns: `{ "ok": true }`

---

## 5. MCP Session ↔ AMS Account Mapping

Two binding modes, picked at MCP server configuration time.

**Mode A — Bound account (most agents).** The MCP server is configured with an AMS account credential. Every tool call from that MCP session acts as that account. This is the Claude-Code-with-`.mcp.json` shape, the Cursor-mcp-config shape, the Claude-Desktop-config shape.

```json
{
  "mcpServers": {
    "ams": {
      "url": "https://ams.covenant.dev/mcp",
      "headers": { "Authorization": "Bearer ams_sk_klappy_..." }
    }
  }
}
```

**Mode B — On-demand account (rare in PoC, useful for hosted dashboards).** The MCP server has no credential; the first call must be `ams_create_account` (added to the tool surface only when this mode is enabled). The credential is held in the MCP session and discarded when the session ends.

PoC ships Mode A only. Mode B is a half-day add-on if needed.

### 5.1 What the DO Tracks per MCP Session

When an MCP session calls `ams_join`, the DO records:

- `mcp_session_id` (from the Streamable HTTP session header)
- `account_id`, `stream_id`, `stream_name`
- A short ring buffer of pending tokens (default 256 entries, per session per conversation)
- A cursor that increments per emitted token

`ams_recv` reads from the buffer and advances the cursor. `notifications/ams/token` pushes to the MCP session in real time *and* writes to the buffer (so a client mixing notifications and polling doesn't lose anything).

Buffer eviction: oldest first. If a buffer overflows before a recv, the next recv response includes `"truncated": true` and a count of dropped tokens. Slow MCP clients get told they were slow. They don't get to silently lose data.

---

## 6. Auth Model — MCP Path

- The MCP `Authorization: Bearer <ams_sk_...>` header is the AMS account credential.
- The Worker hashes the bearer, looks up `account_id` and `namespace` in KV, and attaches them to the MCP session at handshake.
- All tool calls in that session act as that account.
- `ams_join` additionally validates the permissive token from the magic link query string (or from a `t` field in the tool input — both accepted).
- 401 on bad bearer. WebSocket close code 4001 / 4002 mapped to MCP tool errors with parallel meaning.

For the raw protocol path, nothing changes from `PROTOCOL.md` §6.

---

## 7. Cloudflare Configuration

### 7.1 `wrangler.toml`

```toml
name = "ams"
main = "src/index.ts"
compatibility_date = "2026-05-01"
compatibility_flags = ["nodejs_compat"]

routes = [
  { pattern = "ams.covenant.dev/*", custom_domain = true }
]

[[kv_namespaces]]
binding = "AMS_KV"
id = "<filled at create>"

[[durable_objects.bindings]]
name = "CONVERSATION"
class_name = "ConversationDO"

[[migrations]]
tag = "v1"
new_classes = ["ConversationDO"]

[vars]
AMS_HOST = "ams.covenant.dev"

# Secrets set via `wrangler secret put`:
#   AMS_CREDENTIAL_PEPPER         (random 32-byte hex; mixed into bearer hash)
#   AMS_PERMISSIVE_TOKEN_PEPPER   (same idea, for permissive tokens)
```

### 7.2 Bindings + Secrets — One-Time Setup

```bash
wrangler kv:namespace create AMS_KV
wrangler secret put AMS_CREDENTIAL_PEPPER
wrangler secret put AMS_PERMISSIVE_TOKEN_PEPPER
wrangler deploy
```

DNS: point `ams.covenant.dev` at the Worker via Cloudflare dashboard (custom domain on the Worker). TLS is automatic.

### 7.3 What the Worker File Tree Looks Like

```
worker/
├── wrangler.toml
└── src/
    ├── index.ts            # entry: route /mcp, /v1/*, WebSocket upgrade
    ├── mcp.ts              # MCP server (Streamable HTTP) + tool handlers
    ├── conversation.ts     # ConversationDO class
    ├── auth.ts             # bearer hashing + lookup
    ├── magic_link.ts       # mint + validate + URL build
    ├── alias.ts            # namespace + alias resolution
    └── types.ts
```

Estimated implementation size: ~600–800 lines of TypeScript. Bigger than the wire-only PoC (~300 lines) because the MCP wrap and per-session buffering add real surface — but still one file each, no framework.

---

## 8. What Gets Stubbed for Today vs. What's Real

| Concern | PoC Today | Real Later |
|---|---|---|
| Account creation | Free, unauthenticated, any namespace not already taken | Paid signup, verified identity, abuse controls |
| Account credential | Random 32-byte URL-safe base64, hashed with pepper | Same shape, plus rotation + revocation endpoints |
| Permissive token | Random 32-byte URL-safe base64 per conversation | Add expiry, single-use option, invite-list |
| Conversation ID | UUID only | + `jcs-sha256` |
| Stream-per-account-per-conv | Exactly one | Configurable, multi-stream allowed |
| Replay | None — from-now-only | Optional per-conversation replay buffer |
| Federation | None | Sister protocol, separate doc |
| Per-MCP-session token buffer | 256 entries, oldest-evicted, `truncated` flag on overflow | Configurable, plus optional spill-to-storage |
| Observability | `console.log` to Workers logs | DOLCHE-shaped journal subscriber (a separate Worker) |
| Token contents in logs | Never | Never |

---

## 9. Day-One Demo (the actual hackathon-replay)

This is the "PoC succeeded" gate.

### 9.1 Klappy's machine

Klappy adds AMS to Claude Code's MCP config (`.mcp.json` in the project):

```json
{
  "mcpServers": {
    "ams": {
      "url": "https://ams.covenant.dev/mcp",
      "headers": { "Authorization": "Bearer ams_sk_klappy_..." }
    }
  }
}
```

Klappy in Claude Code: *"Create an AMS conversation called `hackathon-replay` and give me the magic link to send to Ian."*

Claude calls `ams_create_conversation({ alias: "hackathon-replay" })`. Returns the magic link. Klappy copies it, sends it to Ian via Signal (yes, still a human sharing a URL — that's not the broken part; the broken part was per-message copy-paste).

### 9.2 Ian's machine

Ian has the same `.mcp.json` shape (different bearer, his own account `ian`).

Ian in his agent: *"Join this AMS conversation: `https://ams.covenant.dev/klappy/conversations/hackathon-replay?t=...`. Then wait for Klappy to ask you something."*

Agent calls `ams_join({ magic_link: "..." })`, then loops on `ams_recv` (or receives notifications, depending on client).

### 9.3 The exchange

Klappy: *"Ask Ian's agent to summarize the last commit on `truthkit-proxy`."*

→ Klappy's agent calls `ams_send({ conversation_id, data: "Please summarize the last commit on truthkit-proxy." })`.
→ Ian's agent's next `ams_recv` (or live notification) returns the token.
→ Ian's agent does the work, calls `ams_send` with the summary.
→ Klappy's agent's next `ams_recv` returns the summary.
→ Klappy reads it.

**No copy-paste at any step. No Signal in the wire. No human in the loop except for the original link share.**

That's the gate.

---

## 10. Smoke Test Checklist (run after `wrangler deploy`)

1. `curl -X POST https://ams.covenant.dev/v1/accounts -d '{"namespace":"smoke"}'` → 201 with credential.
2. `curl -X POST https://ams.covenant.dev/v1/smoke/conversations -H "Authorization: Bearer <cred>" -d '{}'` → 201 with magic link.
3. `wscat -c "<magic-link-with-/connect-appended>" -H "Authorization: Bearer <cred>"` from two terminals → echo each other's `{"type":"token","data":"hello"}` frames.
4. Configure the MCP server in Claude Code with the smoke credential. Ask Claude: "Use the ams MCP to create a conversation and tell me the magic link." → get a magic link back.
5. Configure a second Claude Code instance (different bearer) with the same MCP. Ask: "Join this magic link and emit `hello` on your stream." → first Claude's `ams_recv` returns `hello`.

If all five pass, today's deploy is real.

---

## 11. What This Spec Does Not Decide

Honest list of things that are still "best-stab" calls and may need to change after first contact:

- **MCP transport choice.** Streamable HTTP is the modern MCP transport and what the major clients (Claude Code, Claude Desktop, Cursor) support today. If a target client only does stdio, we'll need a thin local proxy.
- **Notification delivery semantics.** `notifications/ams/token` is best-effort; if the MCP client disconnects, notifications between disconnect and reconnect are lost. The buffered `ams_recv` path catches them. If both fail, the `truncated` flag fires.
- **Per-conversation DO geographic location.** The DO lives wherever the first request hit. Two agents on opposite sides of the world will route through one of the two regions. Acceptable for the PoC, will need attention if conversations span continents in production.
- **Concurrency caps.** 10 concurrent streams per account, 100 subscribers per conversation. Conservative defaults to bound cost. Easy to raise per-account in KV.

Anything else that surfaces during deploy gets logged into the journal and gets a follow-up doc, not a panic.

---

## 12. Done When

- `ams.covenant.dev` resolves and serves `200 OK` on `GET /healthz`.
- The §10 smoke test passes end-to-end.
- The §9 demo runs between two real agents, on two different machines, with two different bearer tokens, with no copy-paste.
- The DOLCHE journal in this repo gets one entry: "AMS PoC live on Cloudflare, MCP-wrapped, two-agent demo verified."

That is what shipping today looks like.
