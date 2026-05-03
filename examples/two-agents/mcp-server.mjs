// mcp-server.mjs — minimal stdio MCP server exposing the AMS tool surface.
//
// Why this exists: SPEC §3.1 items 4 and 5 require "a Claude Code instance
// configured with the AMS MCP server" to call ams_create_conversation,
// ams_join, ams_send and observe peer tokens via push notifications or
// ams_recv. Per ams://canon/decisions/D0012-browser-is-an-mcp-runtime, the
// MCP wrapper is the canonical edge wrapper for any runtime that speaks MCP
// — including local stdio runtimes like Claude Code Desktop. This file is
// the local-stdio reference for those items; the hosted SessionDO at /mcp
// (POC-INFRA §3) is the next step beyond this PoC slice.
//
// Wire surface: JSON-RPC 2.0 over stdio, line-delimited (one message per
// stdin line). Implements the subset of MCP needed for tools/list,
// tools/call, and notifications/ams/* outbound. No SSE, no streaming —
// MCP transports beyond stdio are out of scope for this example.
//
// Tools exposed (per ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai):
//   ams_create_conversation, ams_join, ams_send, ams_set_metadata,
//   ams_leave, ams_recv
// Notifications emitted:
//   notifications/ams/token, notifications/ams/stream_metadata
//
// Environment:
//   AMS_HOST        — base URL of the AMS Worker (default https://ams.klappy.dev)
//   AMS_NAMESPACE   — namespace this MCP session binds; auto-mints account if AMS_CREDENTIAL unset
//   AMS_CREDENTIAL  — pre-existing bearer (skip auto-mint)
//   AMS_LOG=1       — log JSON-RPC traffic to stderr for debugging

import { createAccount, createConversation, connect } from "./ams-client.mjs";
import { createInterface } from "node:readline";

const LOG = process.env.AMS_LOG === "1";
const HOST = process.env.AMS_HOST ?? "https://ams.klappy.dev";

let bearer = process.env.AMS_CREDENTIAL ?? null;
let account = null;
let connection = null;
let recvBuffer = []; // PROTOCOL §4.2 frames since last ams_recv (push fallback).
let recvBudget = 1000; // events; per mcp-wrapper-conformance recommended default.

function logErr(...args) {
  if (LOG) console.error("[mcp]", ...args);
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}
function fail(id, code, message, data) {
  send({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });
}
function notify(method, params) {
  send({ jsonrpc: "2.0", method, params });
}

async function ensureAccount() {
  if (bearer && account) return;
  if (bearer && !account) {
    // Bearer pre-supplied via env. We don't have account_id without an extra
    // lookup endpoint; treat bearer as the binding and synthesize a stub.
    account = { credential: bearer, namespace: process.env.AMS_NAMESPACE ?? "unknown" };
    return;
  }
  const ns = process.env.AMS_NAMESPACE ?? `mcp-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const acc = await createAccount(ns, { host: HOST });
  account = acc;
  bearer = acc.credential;
  logErr("auto-minted account", acc.account_id, "ns=", ns);
}

const TOOLS = [
  {
    name: "ams_create_conversation",
    description: "Mint a new AMS conversation under the bound namespace and return the magic link.",
    inputSchema: {
      type: "object",
      properties: {
        alias: { type: "string", description: "Optional human alias; auto-generated if omitted." },
        stream_name: { type: "string", description: "Optional minter stream name." },
        metadata: { type: "object", description: "Optional conversation-level metadata (immutable in v1)." },
        stream_metadata: { type: "object", description: "Optional initial stream metadata for the minter." },
      },
    },
  },
  {
    name: "ams_join",
    description: "Attach to a conversation by magic link. Binds this MCP session to that stream.",
    inputSchema: {
      type: "object",
      required: ["magic_link"],
      properties: {
        magic_link: { type: "string", description: "Magic link URL from ams_create_conversation." },
        stream_name: { type: "string", description: "Optional stream name; defaults to a stream-* token." },
        stream_metadata: { type: "object", description: "Optional initial stream metadata." },
        self_subscribe: { type: "boolean", description: "Opt into receiving own emissions. Default false (D0009)." },
      },
    },
  },
  {
    name: "ams_send",
    description: "Emit a token on the bound stream. Fire-and-forget; returns once the wire accepts the frame.",
    inputSchema: {
      type: "object",
      required: ["data"],
      properties: { data: { type: "string", description: "Opaque token payload (UTF-8 string in v1)." } },
    },
  },
  {
    name: "ams_set_metadata",
    description: "Replace the bound stream's metadata. Full replacement, not patch.",
    inputSchema: {
      type: "object",
      required: ["metadata"],
      properties: { metadata: { type: "object" } },
    },
  },
  {
    name: "ams_leave",
    description: "Disconnect the bound stream. Subsequent ams_send will fail until ams_join again.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ams_recv",
    description: "Long-poll fallback: drain buffered peer frames since the last ams_recv. Returns immediately if empty.",
    inputSchema: {
      type: "object",
      properties: {
        max_wait_ms: { type: "integer", description: "If buffer empty, wait up to this many ms for a frame. Default 0." },
      },
    },
  },
];

const HANDLERS = {
  initialize(params) {
    return {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: { listChanged: false },
      },
      serverInfo: {
        name: "ams-mcp-stdio",
        version: "0.1.0",
      },
    };
  },
  "tools/list"() {
    return { tools: TOOLS };
  },
  async "tools/call"(params) {
    const { name, arguments: args = {} } = params ?? {};
    switch (name) {
      case "ams_create_conversation": {
        await ensureAccount();
        const conv = await createConversation(bearer, account.namespace, {
          host: HOST,
          alias: args.alias,
          stream_name: args.stream_name,
          metadata: args.metadata,
          stream_metadata: args.stream_metadata,
        });
        return toolResult({ ok: true, ...conv });
      }
      case "ams_join": {
        await ensureAccount();
        if (connection) {
          connection.removeAllListeners();
          connection.close();
        }
        recvBuffer.length = 0;
        recvBuffer.truncated = false;
        connection = connect(args.magic_link, bearer, {
          stream_name: args.stream_name,
          stream_metadata: args.stream_metadata,
          self_subscribe: !!args.self_subscribe,
        });
        wireConnection(connection);
        try {
          const joined = await connection.ready();
          return toolResult({ ok: true, joined });
        } catch (err) {
          if (connection) {
            connection.removeAllListeners();
            connection.close();
            connection = null;
          }
          throw err;
        }
      }
      case "ams_send": {
        if (!connection) throw new RpcError(-32602, "not_joined: call ams_join first");
        connection.send(args.data);
        return toolResult({ ok: true });
      }
      case "ams_set_metadata": {
        if (!connection) throw new RpcError(-32602, "not_joined: call ams_join first");
        connection.setMetadata(args.metadata ?? {});
        return toolResult({ ok: true });
      }
      case "ams_leave": {
        if (connection) {
          connection.removeAllListeners();
          connection.close();
          connection = null;
        }
        recvBuffer.length = 0;
        recvBuffer.truncated = false;
        return toolResult({ ok: true });
      }
      case "ams_recv": {
        const wait = Math.max(0, Math.min(30000, Number(args.max_wait_ms ?? 0)));
        if (recvBuffer.length === 0 && wait > 0) {
          await new Promise((resolve) => {
            const t = setTimeout(resolve, wait);
            const onFrame = () => { clearTimeout(t); resolve(); };
            if (connection) connection.once("frame", onFrame);
          });
        }
        const frames = recvBuffer.splice(0, recvBuffer.length);
        const truncated = recvBuffer.truncated ?? false;
        recvBuffer.truncated = false;
        return toolResult({ ok: true, frames, truncated });
      }
      default:
        throw new RpcError(-32601, `unknown_tool: ${name}`);
    }
  },
};

function toolResult(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: false,
  };
}

class RpcError extends Error {
  constructor(code, message, data) { super(message); this.code = code; this.data = data; }
}

function wireConnection(c) {
  c.on("token", (frame) => {
    bufferOrPush("notifications/ams/token", frame);
  });
  c.on("stream_metadata", (frame) => {
    bufferOrPush("notifications/ams/stream_metadata", frame);
  });
  c.on("stream_joined", (frame) => {
    bufferOrPush("notifications/ams/stream_joined", frame);
  });
  c.on("stream_left", (frame) => {
    bufferOrPush("notifications/ams/stream_left", frame);
  });
  c.on("close", (info) => {
    bufferOrPush("notifications/ams/closed", info);
  });
}

function bufferOrPush(method, params) {
  // Both push and buffer: notifications go out always (clients that take
  // them get push delivery), and the same frames stay in recvBuffer for
  // ams_recv-only clients. recvBuffer.truncated is set if the budget would
  // be exceeded; oldest events are dropped per mcp-wrapper-conformance.
  notify(method, params);
  if (recvBuffer.length >= recvBudget) {
    recvBuffer.shift();
    recvBuffer.truncated = true;
  }
  recvBuffer.push({ method, params });
}

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  logErr("recv", msg);
  if (msg.method && HANDLERS[msg.method]) {
    try {
      const result = await HANDLERS[msg.method](msg.params);
      if (msg.id !== undefined) reply(msg.id, result);
    } catch (e) {
      if (msg.id !== undefined) {
        if (e instanceof RpcError) fail(msg.id, e.code, e.message, e.data);
        else fail(msg.id, -32603, `internal_error: ${e.message}`);
      }
    }
  } else if (msg.id !== undefined) {
    fail(msg.id, -32601, `unknown_method: ${msg.method}`);
  }
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
