// mcp-server.mjs — stdio MCP server exposing the AMS tool surface.
//
// Why this exists: SPEC §3.1 items 4 and 5 require "a Claude Code instance
// configured with the AMS MCP server" to call ams_create_conversation,
// ams_join, ams_send and observe peer tokens via push notifications or
// ams_recv. Per ams://canon/decisions/D0012-browser-is-an-mcp-runtime, the
// MCP wrapper is the canonical edge wrapper for any runtime that speaks MCP
// — including local stdio runtimes like Claude Code Desktop. This file is
// the local-stdio reference for those items; the hosted SessionDO at /mcp
// (POC-INFRA §3) is the next step beyond this PoC slice and will use
// Cloudflare's `agents/mcp` McpAgent (Worker-side) rather than this
// Node-side stdio implementation.
//
// Implementation: built on the official @modelcontextprotocol/sdk
// (StdioServerTransport + McpServer + zod schemas). The SDK handles the
// JSON-RPC 2.0 framing, the initialize handshake, the initialized
// notification, the tools/list and tools/call dispatch, and standard error
// responses. We only declare tool surfaces and their handlers — translation
// only, per ams://canon/constraints/wrapper-stays-cheap.
//
// Tools exposed (per ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai):
//   ams_create_conversation, ams_join, ams_send, ams_set_metadata,
//   ams_leave, ams_recv
// Notifications emitted:
//   notifications/ams/token, notifications/ams/stream_metadata,
//   notifications/ams/stream_joined, notifications/ams/stream_left,
//   notifications/ams/closed
//
// Environment:
//   AMS_HOST        — base URL of the AMS Worker (default https://ams.klappy.dev)
//   AMS_NAMESPACE   — namespace this MCP session binds; auto-mints account if AMS_CREDENTIAL unset
//   AMS_CREDENTIAL  — pre-existing bearer (skip auto-mint)
//   AMS_LOG=1       — log AMS-side events to stderr for debugging

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { createAccount, createConversation, connect } from "./ams-client.mjs";

const LOG = process.env.AMS_LOG === "1";
const HOST = process.env.AMS_HOST ?? "https://ams.klappy.dev";

let bearer = process.env.AMS_CREDENTIAL ?? null;
let account = null;
let connection = null;

// Per-session recv buffer for the ams_recv long-poll degradation path.
// Push delivery (notifications/ams/*) and buffer accumulation happen in
// lockstep — clients that take notifications get them live, clients that
// poll get the same frames via ams_recv. The class encapsulates the
// truncated flag so it can never be silently dropped by an array splice
// (the kind of bug @modelcontextprotocol/sdk doesn't have but our prior
// hand-rolled buffer did).
class RecvBuffer {
  constructor(budget = 1000) {
    this.budget = budget;
    this.frames = [];
    this.truncated = false;
  }
  push(method, params) {
    if (this.frames.length >= this.budget) {
      this.frames.shift();
      this.truncated = true;
    }
    this.frames.push({ method, params });
  }
  drain() {
    const out = { frames: this.frames, truncated: this.truncated };
    this.frames = [];
    this.truncated = false;
    return out;
  }
  clear() {
    this.frames = [];
    this.truncated = false;
  }
}

const recv = new RecvBuffer();

function logErr(...args) {
  if (LOG) console.error("[ams-mcp]", ...args);
}

const server = new McpServer(
  { name: "ams-mcp-stdio", version: "0.1.0" },
  { capabilities: { tools: { listChanged: false } } },
);

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

// Wire AmsConnection events into both push notifications and the recv buffer.
// The connection's own `error` event is registered explicitly (separate from
// the SDK protocol's error path) so a WebSocket error can never crash the
// host process — see ams-client.mjs for the listener-count guard.
function wireConnection(c) {
  const route = (method) => (params) => {
    pushAndNotify(method, params).catch((err) => logErr("notification failed:", err));
  };
  c.on("token", route("notifications/ams/token"));
  c.on("stream_metadata", route("notifications/ams/stream_metadata"));
  c.on("stream_joined", route("notifications/ams/stream_joined"));
  c.on("stream_left", route("notifications/ams/stream_left"));
  c.on("close", (params) => {
    // Server-initiated close must detach the module-level binding so that
    // subsequent ams_send / ams_set_metadata fail the "not_joined" guard
    // cleanly instead of throwing an opaque "WebSocket is not open" error
    // from the ws library against a dead socket. Guard on identity so a
    // stale close event from a prior connection cannot null out a fresh one.
    if (connection === c) {
      connection = null;
      recv.clear();
    }
    pushAndNotify("notifications/ams/closed", params).catch((err) => logErr("notification failed:", err));
  });
  c.on("error", (err) => logErr("ws error:", err.message));
}

async function pushAndNotify(method, params) {
  recv.push(method, params);
  // The SDK's underlying Protocol.notification serializes and sends. Custom
  // ams/* methods are unknown to the standard MCP schema but the protocol
  // layer doesn't validate notification methods, so they pass through as
  // arbitrary JSON-RPC notifications.
  await server.server.notification({ method, params });
}

function toolResult(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: false,
  };
}

server.registerTool(
  "ams_create_conversation",
  {
    description: "Mint a new AMS conversation under the bound namespace and return the magic link.",
    inputSchema: {
      alias: z.string().optional().describe("Optional human alias; auto-generated if omitted."),
      stream_name: z.string().optional().describe("Optional minter stream name."),
      metadata: z.object({}).passthrough().optional().describe("Conversation-level metadata (immutable in v1)."),
      stream_metadata: z.object({}).passthrough().optional().describe("Initial stream metadata for the minter."),
    },
  },
  async (args) => {
    await ensureAccount();
    const conv = await createConversation(bearer, account.namespace, {
      host: HOST,
      alias: args.alias,
      stream_name: args.stream_name,
      metadata: args.metadata,
      stream_metadata: args.stream_metadata,
    });
    return toolResult({ ok: true, ...conv });
  },
);

server.registerTool(
  "ams_join",
  {
    description: "Attach to a conversation by magic link. Binds this MCP session to that stream.",
    inputSchema: {
      magic_link: z.string().describe("Magic link URL from ams_create_conversation."),
      stream_name: z.string().optional().describe("Optional stream name; defaults to a stream-* token."),
      stream_metadata: z.object({}).passthrough().optional().describe("Initial stream metadata."),
      self_subscribe: z.boolean().optional().describe("Opt into receiving own emissions. Default false (D0009)."),
    },
  },
  async (args) => {
    await ensureAccount();
    if (connection) {
      connection.removeAllListeners();
      connection.close();
      connection = null;
    }
    recv.clear();

    const next = connect(args.magic_link, bearer, {
      stream_name: args.stream_name,
      stream_metadata: args.stream_metadata,
      self_subscribe: !!args.self_subscribe,
    });
    wireConnection(next);
    try {
      const joined = await next.ready();
      connection = next;
      return toolResult({ ok: true, joined });
    } catch (err) {
      next.removeAllListeners();
      next.close();
      throw err;
    }
  },
);

server.registerTool(
  "ams_send",
  {
    description: "Emit a token on the bound stream. Fire-and-forget; returns once the wire accepts the frame.",
    inputSchema: {
      data: z.string().describe("Opaque token payload (UTF-8 string in v1)."),
    },
  },
  async (args) => {
    if (!connection) throw new Error("not_joined: call ams_join first");
    connection.send(args.data);
    return toolResult({ ok: true });
  },
);

server.registerTool(
  "ams_set_metadata",
  {
    description: "Replace the bound stream's metadata. Full replacement, not patch.",
    inputSchema: {
      metadata: z.object({}).passthrough().describe("New stream metadata (full replacement)."),
    },
  },
  async (args) => {
    if (!connection) throw new Error("not_joined: call ams_join first");
    connection.setMetadata(args.metadata ?? {});
    return toolResult({ ok: true });
  },
);

server.registerTool(
  "ams_leave",
  {
    description: "Disconnect the bound stream. Subsequent ams_send will fail until ams_join again.",
    inputSchema: {},
  },
  async () => {
    if (connection) {
      connection.removeAllListeners();
      connection.close();
      connection = null;
    }
    recv.clear();
    return toolResult({ ok: true });
  },
);

server.registerTool(
  "ams_recv",
  {
    description: "Long-poll fallback: drain buffered peer frames since the last ams_recv. Returns immediately if empty.",
    inputSchema: {
      max_wait_ms: z.number().int().min(0).max(30000).optional()
        .describe("If buffer empty, wait up to this many ms for a frame. Default 0."),
    },
  },
  async (args) => {
    const wait = args.max_wait_ms ?? 0;
    if (recv.frames.length === 0 && wait > 0 && connection) {
      const conn = connection;
      await new Promise((resolve) => {
        const onFrame = () => { clearTimeout(t); resolve(); };
        const t = setTimeout(() => { conn.removeListener("frame", onFrame); resolve(); }, wait);
        conn.once("frame", onFrame);
      });
    }
    const drained = recv.drain();
    return toolResult({ ok: true, ...drained });
  },
);

await server.connect(new StdioServerTransport());
logErr("ams-mcp-stdio ready");

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
