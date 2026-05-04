// MCP edge wrapper at /mcp on the existing AMS Worker. Implements the
// Streamable HTTP transport (POST = JSON-RPC request/response, GET = SSE for
// server-pushed notifications) and the Session DO that holds the upstream
// /connect WebSocket and translates MCP ↔ AMS wire framing.
//
// This is the minimum-viable wrapper for the SPEC §3.1 items 4–5 and §3.2
// demo gate plus the TinCan charter §6 browser overlay. Three tools ship in
// this slice — ams_create_conversation, ams_join, ams_send — plus ams_recv
// as the long-poll degradation path for runtimes whose MCP transport cannot
// take server-pushed notifications. The other surface from
// `ams://canon/constraints/mcp-wrapper-conformance-for-conversational-ai`
// (ams_set_metadata, ams_leave) is named in TODO and lands when a consumer
// asks for it; the wrapper-stays-cheap discipline keeps the surface bounded.
//
// Translation only. Token `data` is opaque — no logging, no parsing, no
// schema-checking. Capabilities round-trip via stream_metadata exactly as
// PROTOCOL §4.4 specifies. Security-subscriber attachment points are
// documented surfaces, not running code: any consumer that wants to attach
// a signing/audit/policy/anomaly-detection subscriber per
// `ams://canon/principles/security-as-subscriber-pattern` joins the same
// conversation through any conformant wrapper and declares its role in
// stream_metadata.capabilities.ams.convention.v1.{role,function,posture,scope,attestation}.
// The wrapper does not gate — `ams://canon/principles/security-as-subscriber-pattern`
// "Bounded Power" applies.
//
// Per `ams://canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying`,
// the Session DO is keyed `(account_id, conversation_id)` from day one even
// though TinCan v1 ships with no buffering. The keying convention is in
// place so that when D0016 buffering layers on (per the operator premortem
// in TINCAN-CHARTER §5), no client breaks. Concrete behavior under no
// buffering: the DO is a thin pass-through — it forwards SSE frames to
// every attached MCP transport session and accepts ams_send via the upstream
// WebSocket. Cross-MCP-session continuity for buffered tokens is a
// follow-up; the DO key shape is forward-compatible.

import { authenticate } from "./auth";
import type { JoinPayload } from "./conversation";
import { ALIAS_KEY, CONVERSATION_KEY, createConversation } from "./conversations";
import type { AccountRecord, ConversationRecord, Env } from "./types";
import {
  base64ToUtf8,
  errorResponse,
  isPlainObject,
  jsonResponse,
  pepperedHash,
  randomToken,
  timingSafeEqualHex,
  utf8ToBase64,
} from "./util";

// --- MCP / Streamable HTTP types -----------------------------------------

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
  // Internal: populated from the mcp-session-id request header so the
  // dispatch path can route without threading the Request all the way down.
  _sessionHeader?: string | null;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

const MCP_PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "ams-mcp", version: "0.1.0" };

const MCP_CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers":
    "authorization, content-type, mcp-session-id, mcp-protocol-version, accept",
  "access-control-expose-headers": "mcp-session-id",
  "access-control-max-age": "86400",
  vary: "Origin",
};

// --- Public route handler ------------------------------------------------

export async function handleMcp(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: MCP_CORS });
  }
  if (req.method === "POST") return handleMcpPost(req, env);
  if (req.method === "GET") return handleMcpGet(req, env);
  if (req.method === "DELETE") return handleMcpDelete(req, env);
  return errorResponse(
    405,
    "method_not_allowed",
    "MCP transport accepts GET/POST/DELETE/OPTIONS only.",
  );
}

// POST /mcp — JSON-RPC request leg. Accepts singletons; rejects batches in
// this slice (the four tools we ship are not chained). Notifications (no
// id) get a 202 with no body per JSON-RPC 2.0.
async function handleMcpPost(req: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonRpcErrorResponse(null, -32700, "Parse error", 400);
  }
  if (Array.isArray(body)) {
    return jsonRpcErrorResponse(null, -32600, "Batch requests not supported in this slice.", 400);
  }
  if (!isPlainObject(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return jsonRpcErrorResponse(null, -32600, "Invalid Request", 400);
  }
  const rpc = body as unknown as JsonRpcRequest;
  rpc._sessionHeader = req.headers.get("mcp-session-id");
  const isNotification = rpc.id === undefined;

  // Stateless / unauthenticated:
  if (rpc.method === "initialize") return handleInitialize(rpc);
  if (rpc.method === "ping") return jsonRpcOkResponse(rpc.id ?? null, {});
  if (rpc.method === "notifications/initialized") {
    return new Response(null, { status: 202, headers: MCP_CORS });
  }

  // Authenticated path. Mode A only — Authorization header carries the bearer.
  const account = await authenticate(req, env);
  if (account instanceof Response) {
    return jsonRpcErrorResponse(rpc.id ?? null, -32001, "invalid_credential", 401);
  }
  if (rpc.method === "tools/list") {
    return jsonRpcOkResponse(rpc.id ?? null, { tools: TOOL_SCHEMAS });
  }
  if (rpc.method === "tools/call") {
    // Outer host preserved here so tool_ams_create_conversation can build a magic_link
    // that names the host the request actually hit (truthkit-on-truthkit, klappy-on-klappy).
    const outerHost = req.headers.get("host") ?? "ams.klappy.dev";
    return handleToolCall(rpc, account, env, isNotification, outerHost);
  }
  return jsonRpcErrorResponse(rpc.id ?? null, -32601, `Method not found: ${rpc.method}`, 404);
}

// GET /mcp — SSE leg. Per D0019 cooperative tenants, multiple transport
// sessions under the same account+conversation may attach concurrently.
async function handleMcpGet(req: Request, env: Env): Promise<Response> {
  const sessionId = req.headers.get("mcp-session-id");
  if (!sessionId) {
    return errorResponse(400, "missing_session", "mcp-session-id header required for GET /mcp.");
  }
  const account = await authenticate(req, env);
  if (account instanceof Response) return account;

  const route = parseSessionId(sessionId);
  if (!route || route.account_id !== account.account_id) {
    return errorResponse(404, "session_not_found", "mcp-session-id not bound to this account.");
  }

  const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(route.do_name));
  const doReq = new Request("https://do.internal/__do__/sse", {
    method: "GET",
    headers: { "x-ams-mcp-session-id": sessionId },
  });
  const resp = await stub.fetch(doReq);
  const headers = new Headers(resp.headers);
  for (const [k, v] of Object.entries(MCP_CORS)) headers.set(k, v);
  return new Response(resp.body, { status: resp.status, headers });
}

async function handleMcpDelete(req: Request, env: Env): Promise<Response> {
  const sessionId = req.headers.get("mcp-session-id");
  if (!sessionId) return new Response(null, { status: 204, headers: MCP_CORS });
  const account = await authenticate(req, env);
  if (account instanceof Response) return account;

  const route = parseSessionId(sessionId);
  if (!route || route.account_id !== account.account_id) {
    return new Response(null, { status: 204, headers: MCP_CORS });
  }
  const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(route.do_name));
  const doReq = new Request("https://do.internal/__do__/detach", {
    method: "POST",
    headers: { "x-ams-mcp-session-id": sessionId },
  });
  await stub.fetch(doReq);
  return new Response(null, { status: 204, headers: MCP_CORS });
}

// --- initialize ----------------------------------------------------------

function handleInitialize(rpc: JsonRpcRequest): Response {
  return jsonRpcOkResponse(rpc.id ?? null, {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {
      tools: { listChanged: false },
      logging: {},
    },
    serverInfo: SERVER_INFO,
    instructions:
      "AMS edge wrapper. Call tools/list to discover ams_create_conversation, ams_join, ams_send, ams_recv. " +
      "Open GET /mcp with the mcp-session-id from your ams_join response to receive notifications/ams/* via SSE.",
  });
}

// --- tool surface --------------------------------------------------------

const TOOL_SCHEMAS = [
  {
    name: "ams_create_conversation",
    description:
      "Mint a new AMS conversation under the bound account's namespace. Returns the magic link URL to share with peers.",
    inputSchema: {
      type: "object",
      properties: {
        alias: { type: "string", description: "Optional human-readable alias; auto-generated if omitted." },
        stream_name: { type: "string", description: "Optional stream name for the minter." },
        metadata: {
          type: "object",
          description: "Optional conversation-level metadata. Immutable in v1.",
        },
        stream_metadata: {
          type: "object",
          description:
            "Optional initial stream metadata. By convention the 'capabilities' key carries the ams.convention.v1 manifest (role, function, posture, scope, attestation). Round-trips opaquely through the wrapper per PROTOCOL §4.4.",
        },
      },
    },
  },
  {
    name: "ams_join",
    description:
      "Attach to a conversation by magic link. Binds this MCP session's (account_id, conversation_id) pair per D0019, opens the upstream WebSocket, and returns the joined snapshot. Subsequent ams_send / ams_recv calls and SSE notifications flow through this binding.",
    inputSchema: {
      type: "object",
      required: ["magic_link"],
      properties: {
        magic_link: { type: "string", description: "Magic link URL from ams_create_conversation." },
        stream_name: { type: "string", description: "Optional stream name; defaults to a stream-* token." },
        stream_metadata: {
          type: "object",
          description:
            "Optional initial stream metadata. The 'capabilities' key carries the ams.convention.v1 manifest. All keys round-trip opaquely.",
        },
        self_subscribe: {
          type: "boolean",
          description:
            "Opt into receiving own emissions on the SSE leg. Default false per D0009 (structural self-exclusion).",
        },
      },
    },
  },
  {
    name: "ams_send",
    description:
      "Emit a token on the bound stream. Fire-and-forget at the wire layer; returns once the wrapper accepts the frame. Token data is opaque — the wrapper does not parse, log, or schema-check.",
    inputSchema: {
      type: "object",
      required: ["data"],
      properties: {
        data: { type: "string", description: "Opaque UTF-8 token payload (up to 64 KiB)." },
      },
    },
  },
  {
    name: "ams_recv",
    description:
      "Long-poll degradation path: drain buffered peer frames since the last ams_recv. Runtimes that take MCP notifications via the SSE leg (GET /mcp) do not need this. Returns immediately if the buffer is empty unless wait_ms is provided.",
    inputSchema: {
      type: "object",
      properties: {
        wait_ms: {
          type: "integer",
          minimum: 0,
          maximum: 25000,
          description: "If buffer empty, wait up to this many ms for a frame. Default 0.",
        },
      },
    },
  },
];

// --- tools/call dispatch -------------------------------------------------

interface ToolCallParams {
  name?: unknown;
  arguments?: unknown;
}

async function handleToolCall(
  rpc: JsonRpcRequest,
  account: AccountRecord,
  env: Env,
  _isNotification: boolean,
  outerHost: string,
): Promise<Response> {
  const params = (isPlainObject(rpc.params) ? rpc.params : {}) as ToolCallParams;
  if (typeof params.name !== "string") {
    return jsonRpcErrorResponse(rpc.id ?? null, -32602, "tools/call requires a 'name' parameter.", 400);
  }
  const toolName = params.name;
  const args = (isPlainObject(params.arguments) ? params.arguments : {}) as Record<string, unknown>;

  if (toolName === "ams_create_conversation") {
    return tool_ams_create_conversation(rpc, account, env, args, outerHost);
  }
  if (toolName === "ams_join") {
    return tool_ams_join(rpc, account, env, args);
  }
  if (toolName === "ams_send" || toolName === "ams_recv") {
    return routeToBoundSession(rpc, account, env, toolName, args);
  }
  return jsonRpcErrorResponse(rpc.id ?? null, -32601, `Unknown tool: ${toolName}`, 404);
}

async function tool_ams_create_conversation(
  rpc: JsonRpcRequest,
  account: AccountRecord,
  env: Env,
  args: Record<string, unknown>,
  outerHost: string,
): Promise<Response> {
  // Reuse the existing control-plane handler so the mint behavior is
  // single-sourced. Build a synthetic Request whose body matches the public
  // POST /v1/{ns}/conversations contract.
  // Use the outer host (forwarded from handleMcpPost) so the synthetic Request carries
  // a host header equal to whichever brand the operator hit (klappy vs truthkit).
  // createConversation reads req.headers.get("host") to build the magic_link.
  const innerReq = new Request(`https://${outerHost}/v1/${account.namespace}/conversations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      alias: args.alias,
      stream_name: args.stream_name,
      metadata: args.metadata,
      stream_metadata: args.stream_metadata,
    }),
  });
  const resp = await createConversation(innerReq, env, account, account.namespace, outerHost);
  const payload = (await resp.json()) as Record<string, unknown>;
  if (resp.status >= 400) {
    return jsonRpcMcpToolError(rpc.id ?? null, payload);
  }
  return jsonRpcOkResponse(rpc.id ?? null, mcpToolResult(payload));
}

interface JoinSubarguments {
  magic_link?: unknown;
  stream_name?: unknown;
  stream_metadata?: unknown;
  self_subscribe?: unknown;
}

async function tool_ams_join(
  rpc: JsonRpcRequest,
  account: AccountRecord,
  env: Env,
  args: Record<string, unknown>,
): Promise<Response> {
  const sub = args as JoinSubarguments;
  if (typeof sub.magic_link !== "string") {
    return jsonRpcMcpToolError(rpc.id ?? null, {
      error: "invalid_arguments",
      message: "ams_join requires magic_link as a string.",
    });
  }

  let parsed: { ns: string; alias: string; permissive: string };
  try {
    parsed = parseMagicLink(sub.magic_link);
  } catch (err) {
    return jsonRpcMcpToolError(rpc.id ?? null, {
      error: "invalid_magic_link",
      message: (err as Error).message,
    });
  }

  // Resolve the conversation in-Worker so a bad link surfaces as a clean
  // tool-level error rather than as a wire close.
  const conversationId = await env.AMS_KV.get(ALIAS_KEY(parsed.ns, parsed.alias));
  if (!conversationId) {
    return jsonRpcMcpToolError(rpc.id ?? null, {
      error: "conversation_not_found",
      message: "No conversation with that namespace+alias.",
    });
  }
  const recordRaw = await env.AMS_KV.get(CONVERSATION_KEY(conversationId));
  if (!recordRaw) {
    return jsonRpcMcpToolError(rpc.id ?? null, {
      error: "conversation_not_found",
      message: "Conversation record missing.",
    });
  }
  const record = JSON.parse(recordRaw) as ConversationRecord;
  const tokenHash = await pepperedHash(env.AMS_PERMISSIVE_TOKEN_PEPPER, parsed.permissive);
  if (!timingSafeEqualHex(tokenHash, record.permissive_token_hash)) {
    return jsonRpcMcpToolError(rpc.id ?? null, {
      error: "invalid_magic_link",
      message: "Permissive token did not match.",
    });
  }

  // D0019 keying.
  const doName = sessionDoName(account.account_id, conversationId);
  const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(doName));
  const mcpSessionId = makeSessionId(account.account_id, doName);

  const joinReq = new Request("https://do.internal/__do__/join", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ams-mcp-session-id": mcpSessionId,
    },
    body: JSON.stringify({
      account_id: account.account_id,
      conversation_id: conversationId,
      namespace: record.namespace,
      alias: parsed.alias,
      permissive_token: parsed.permissive,
      stream_name: sub.stream_name,
      stream_metadata: sub.stream_metadata,
      self_subscribe: sub.self_subscribe === true,
    }),
  });
  const joinResp = await stub.fetch(joinReq);
  const payload = (await joinResp.json()) as Record<string, unknown>;
  if (joinResp.status >= 400) {
    return jsonRpcMcpToolError(rpc.id ?? null, payload);
  }

  return jsonRpcOkResponse(rpc.id ?? null, mcpToolResult(payload), {
    "mcp-session-id": mcpSessionId,
  });
}

async function routeToBoundSession(
  rpc: JsonRpcRequest,
  account: AccountRecord,
  env: Env,
  toolName: string,
  args: Record<string, unknown>,
): Promise<Response> {
  const sessionId = rpc._sessionHeader ?? "";
  if (!sessionId) {
    return jsonRpcMcpToolError(rpc.id ?? null, {
      error: "missing_session",
      message: `${toolName} requires mcp-session-id from a prior ams_join.`,
    });
  }
  const route = parseSessionId(sessionId);
  if (!route || route.account_id !== account.account_id) {
    return jsonRpcMcpToolError(rpc.id ?? null, {
      error: "invalid_session",
      message: "mcp-session-id not bound to this account.",
    });
  }

  const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(route.do_name));
  const path = toolName === "ams_send" ? "/__do__/send" : "/__do__/recv";
  const doReq = new Request(`https://do.internal${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ams-mcp-session-id": sessionId,
    },
    body: JSON.stringify(args),
  });
  const resp = await stub.fetch(doReq);
  const payload = (await resp.json()) as Record<string, unknown>;
  if (resp.status >= 400) {
    return jsonRpcMcpToolError(rpc.id ?? null, payload);
  }
  return jsonRpcOkResponse(rpc.id ?? null, mcpToolResult(payload));
}

// --- helpers -------------------------------------------------------------

function jsonRpcOkResponse(
  id: string | number | null,
  result: unknown,
  extraHeaders: Record<string, string> = {},
): Response {
  const body: JsonRpcResponse = { jsonrpc: "2.0", id, result };
  return jsonResponse(body, {
    headers: { ...MCP_CORS, ...extraHeaders },
  });
}

function jsonRpcErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  status = 200,
): Response {
  const body: JsonRpcResponse = { jsonrpc: "2.0", id, error: { code, message } };
  return jsonResponse(body, { status, headers: MCP_CORS });
}

// Tool-level errors: per MCP, a JSON-RPC success response whose `result`
// carries `isError: true` is the right shape. JSON-RPC error codes are
// reserved for protocol/transport failures.
function jsonRpcMcpToolError(id: string | number | null, payload: unknown): Response {
  return jsonRpcOkResponse(id, {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: true,
  });
}

function mcpToolResult(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: false,
  };
}

// Magic link shape from PROTOCOL §3.2: https://<host>/<ns>/conversations/<alias>?t=<permissive>
function parseMagicLink(link: string): { ns: string; alias: string; permissive: string } {
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    throw new Error("magic_link is not a valid URL");
  }
  const m = u.pathname.match(/^\/([^/]+)\/conversations\/([^/]+)\/?$/);
  if (!m) {
    throw new Error("magic_link path does not match /{ns}/conversations/{alias}");
  }
  const permissive = u.searchParams.get("t");
  if (!permissive) {
    throw new Error("magic_link is missing the permissive token (?t=…)");
  }
  return { ns: m[1]!, alias: m[2]!, permissive };
}

function sessionDoName(accountId: string, conversationId: string): string {
  return `${accountId}:${conversationId}`;
}

interface SessionRoute {
  account_id: string;
  do_name: string;
}

// mcp-session-id format: mcps_<rand>.<b64url(account_id)>.<b64url(do_name)>
// Self-describing so the GET /mcp leg can route without server-side state.
function makeSessionId(accountId: string, doName: string): string {
  return `mcps_${randomToken(8)}.${b64urlEncode(accountId)}.${b64urlEncode(doName)}`;
}

function parseSessionId(s: string): SessionRoute | null {
  const m = s.match(/^[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    return { account_id: b64urlDecode(m[1]!), do_name: b64urlDecode(m[2]!) };
  } catch {
    return null;
  }
}

function b64urlEncode(s: string): string {
  return utf8ToBase64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  let b = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4) b += "=";
  return base64ToUtf8(b);
}

// --- Session DO ----------------------------------------------------------

interface AttachedTransport {
  // Each MCP transport session that has called ams_join under this DO is a
  // tenant. The SSE leg (GET /mcp) registers a writer here; ams_recv just
  // drains the buffer. Per D0019 cooperative tenants, all attached SSEs see
  // the same notifications.
  mcp_session_id: string;
  writer?: WritableStreamDefaultWriter<Uint8Array>;
}

interface BufferedFrame {
  method: string;
  params: unknown;
}

interface JoinedSnapshot {
  conversation_id: string;
  stream_id: string;
  stream_name: string;
  metadata: Record<string, unknown>;
  self_subscribe: boolean;
  peers: Array<{
    stream_id: string;
    stream_name: string;
    owner_account_id: string;
    metadata: Record<string, unknown>;
  }>;
}

export class SessionDO {
  private state: DurableObjectState;
  private env: Env;

  // Upstream wire WebSocket to the ConversationDO. One per (account, conversation).
  private wireWs: WebSocket | null = null;
  private joined: JoinedSnapshot | null = null;
  private accountId: string | null = null;
  private conversationId: string | null = null;

  // Tenants and their SSE writers.
  private tenants: Map<string, AttachedTransport> = new Map();

  // Recv buffer for ams_recv. Bounded to prevent unbounded memory growth;
  // overflow drops oldest with a truncated flag.
  private recvBuffer: BufferedFrame[] = [];
  private recvTruncated = false;
  private static readonly RECV_BUDGET = 1000;

  // Frame-arrival waiters for ams_recv long-poll.
  private waiters: Array<() => void> = [];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    try {
      switch (url.pathname) {
        case "/__do__/join":
          return await this.handleJoin(req);
        case "/__do__/send":
          return await this.handleSend(req);
        case "/__do__/recv":
          return await this.handleRecv(req);
        case "/__do__/sse":
          return await this.handleSse(req);
        case "/__do__/detach":
          return await this.handleDetach(req);
      }
      return jsonResponse({ error: "not_found" }, { status: 404 });
    } catch (err) {
      return jsonResponse(
        { error: "internal_error", message: (err as Error).message },
        { status: 500 },
      );
    }
  }

  private async handleJoin(req: Request): Promise<Response> {
    const body = (await req.json()) as {
      account_id: string;
      conversation_id: string;
      namespace: string;
      alias: string;
      permissive_token: string;
      stream_name?: unknown;
      stream_metadata?: unknown;
      self_subscribe?: unknown;
    };
    const mcpSessionId = req.headers.get("x-ams-mcp-session-id") ?? "";
    if (!mcpSessionId) {
      return jsonResponse({ error: "missing_session" }, { status: 400 });
    }

    if (!this.accountId) {
      this.accountId = body.account_id;
      this.conversationId = body.conversation_id;
    } else if (
      this.accountId !== body.account_id ||
      this.conversationId !== body.conversation_id
    ) {
      // idFromName is deterministic, so this should be unreachable. Defense
      // in depth: refuse rather than corrupt state.
      return jsonResponse({ error: "do_key_mismatch" }, { status: 500 });
    }

    if (!this.wireWs) {
      const dial = await this.dialWire(body);
      if ("error" in dial) {
        return jsonResponse(dial.error, { status: 502 });
      }
      this.wireWs = dial.ws;
      this.joined = dial.joined;
    }

    if (!this.tenants.has(mcpSessionId)) {
      this.tenants.set(mcpSessionId, { mcp_session_id: mcpSessionId });
    }

    return jsonResponse({
      ok: true,
      conversation_id: this.joined?.conversation_id,
      stream_id: this.joined?.stream_id,
      stream_name: this.joined?.stream_name,
      metadata: this.joined?.metadata,
      self_subscribe: this.joined?.self_subscribe ?? false,
      peers: this.joined?.peers ?? [],
      mcp_session_id: mcpSessionId,
    });
  }

  // Dial the upstream wire by routing through the in-Worker ConversationDO
  // directly. We bypass the public /connect path because we already have
  // the resolved conversation; re-validating would duplicate work (KV
  // lookup, hash compare) we just did.
  private async dialWire(body: {
    account_id: string;
    conversation_id: string;
    namespace: string;
    alias: string;
    permissive_token: string;
    stream_name?: unknown;
    stream_metadata?: unknown;
    self_subscribe?: unknown;
  }): Promise<
    | { ws: WebSocket; joined: JoinedSnapshot }
    | { error: { error: string; message: string } }
  > {
    const streamName =
      typeof body.stream_name === "string" && body.stream_name.length > 0
        ? body.stream_name
        : `stream-${randomToken(6)}`;
    const streamMetadata = isPlainObject(body.stream_metadata)
      ? (body.stream_metadata as Record<string, unknown>)
      : {};
    const selfSubscribe = body.self_subscribe === true;

    const recordRaw = await this.env.AMS_KV.get(CONVERSATION_KEY(body.conversation_id));
    if (!recordRaw) {
      return { error: { error: "conversation_not_found", message: "record missing" } };
    }
    const record = JSON.parse(recordRaw) as ConversationRecord;

    const payload: JoinPayload = {
      conversation_id: body.conversation_id,
      conversation_namespace: body.namespace,
      alias: body.alias,
      conversation_metadata: record.metadata,
      account_id: body.account_id,
      stream_name: streamName,
      self_subscribe: selfSubscribe,
      stream_metadata: streamMetadata,
    };

    const stub = this.env.CONVERSATION_DO.get(
      this.env.CONVERSATION_DO.idFromName(body.conversation_id),
    );
    const upgradeReq = new Request("https://do.internal/__do__/connect", {
      method: "GET",
      headers: {
        upgrade: "websocket",
        "x-ams-join-payload": utf8ToBase64(JSON.stringify(payload)),
      },
    });
    const upgrade = await stub.fetch(upgradeReq);
    const ws = upgrade.webSocket;
    if (!ws) {
      return { error: { error: "wire_upgrade_failed", message: `status ${upgrade.status}` } };
    }
    ws.accept();

    // Wait for the joined frame. Per PROTOCOL §4.1 it is the first frame.
    const joined = await new Promise<
      JoinedSnapshot | { closed: { code: number; reason: string } }
    >((resolve) => {
      const onMsg = (ev: MessageEvent) => {
        if (typeof ev.data !== "string") return;
        try {
          const f = JSON.parse(ev.data);
          if (isPlainObject(f) && f.type === "joined") {
            ws.removeEventListener("message", onMsg);
            ws.removeEventListener("close", onClose);
            resolve(f as unknown as JoinedSnapshot);
          }
        } catch {
          // ignore; wait for the real joined frame
        }
      };
      const onClose = (ev: CloseEvent) => {
        ws.removeEventListener("message", onMsg);
        ws.removeEventListener("close", onClose);
        resolve({ closed: { code: ev.code, reason: ev.reason } });
      };
      ws.addEventListener("message", onMsg);
      ws.addEventListener("close", onClose);
    });

    if ("closed" in joined) {
      return {
        error: {
          error: "wire_closed",
          message: `${joined.closed.code} ${joined.closed.reason}`,
        },
      };
    }

    // Long-lived listeners that demultiplex notifications.
    ws.addEventListener("message", (ev) => {
      if (typeof ev.data !== "string") return;
      try {
        this.onWireFrame(JSON.parse(ev.data));
      } catch {
        // Malformed wire frame from our own ConversationDO should not happen;
        // ignore rather than crash.
      }
    });
    ws.addEventListener("close", () => {
      this.broadcastNotification("notifications/ams/closed", {
        conversation_id: body.conversation_id,
      });
      this.wireWs = null;
    });

    return { ws, joined };
  }

  private onWireFrame(frame: unknown) {
    if (!isPlainObject(frame) || typeof frame.type !== "string") return;
    let method: string | null = null;
    switch (frame.type) {
      case "token":
        method = "notifications/ams/token";
        break;
      case "stream_metadata":
        method = "notifications/ams/stream_metadata";
        break;
      case "stream_joined":
        method = "notifications/ams/stream_joined";
        break;
      case "stream_left":
        method = "notifications/ams/stream_left";
        break;
      case "pong":
        return;
      default:
        return;
    }
    // Strip the wire 'type' so the params are clean MCP shape.
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(frame)) {
      if (k !== "type") rest[k] = v;
    }
    this.broadcastNotification(method, rest);
  }

  private broadcastNotification(method: string, params: unknown) {
    if (this.recvBuffer.length >= SessionDO.RECV_BUDGET) {
      this.recvBuffer.shift();
      this.recvTruncated = true;
    }
    this.recvBuffer.push({ method, params });

    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) {
      try {
        w();
      } catch {}
    }

    const note: JsonRpcNotification = { jsonrpc: "2.0", method, params };
    const wire = sseFrame(note);
    for (const t of this.tenants.values()) {
      if (!t.writer) continue;
      try {
        t.writer.write(wire).catch(() => this.detachWriter(t.mcp_session_id));
      } catch {
        this.detachWriter(t.mcp_session_id);
      }
    }
  }

  private detachWriter(mcpSessionId: string) {
    const t = this.tenants.get(mcpSessionId);
    if (!t) return;
    if (t.writer) {
      try {
        t.writer.close().catch(() => {});
      } catch {}
      t.writer = undefined;
    }
  }

  private async handleSend(req: Request): Promise<Response> {
    const args = (await req.json()) as { data?: unknown };
    if (typeof args.data !== "string") {
      return jsonResponse(
        { error: "invalid_arguments", message: "ams_send requires data as a string." },
        { status: 400 },
      );
    }
    if (!this.wireWs) {
      return jsonResponse(
        { error: "not_joined", message: "Call ams_join before ams_send." },
        { status: 409 },
      );
    }
    try {
      this.wireWs.send(JSON.stringify({ type: "token", data: args.data }));
    } catch (err) {
      return jsonResponse(
        { error: "wire_send_failed", message: (err as Error).message },
        { status: 502 },
      );
    }
    return jsonResponse({ ok: true, ts: new Date().toISOString() });
  }

  private async handleRecv(req: Request): Promise<Response> {
    const args = (await req.json().catch(() => ({}))) as { wait_ms?: unknown };
    let wait = 0;
    if (typeof args.wait_ms === "number" && Number.isFinite(args.wait_ms)) {
      wait = Math.max(0, Math.min(25000, Math.floor(args.wait_ms)));
    }
    if (this.recvBuffer.length === 0 && wait > 0) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, wait);
        this.waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    const frames = this.recvBuffer;
    const truncated = this.recvTruncated;
    this.recvBuffer = [];
    this.recvTruncated = false;
    return jsonResponse({ ok: true, frames, truncated });
  }

  private async handleSse(req: Request): Promise<Response> {
    const mcpSessionId = req.headers.get("x-ams-mcp-session-id") ?? "";
    if (!mcpSessionId) {
      return jsonResponse({ error: "missing_session" }, { status: 400 });
    }
    const tenant = this.tenants.get(mcpSessionId);
    if (!tenant) {
      return jsonResponse({ error: "session_not_attached" }, { status: 404 });
    }
    if (tenant.writer) {
      try {
        tenant.writer.close().catch(() => {});
      } catch {}
      tenant.writer = undefined;
    }

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    tenant.writer = writer;

    writer.write(new TextEncoder().encode(": ams-mcp connected\n\n")).catch(() => {});

    // Drain any already-buffered frames so a late SSE attach catches up.
    for (const buffered of this.recvBuffer) {
      writer
        .write(
          sseFrame({
            jsonrpc: "2.0",
            method: buffered.method,
            params: buffered.params,
          }),
        )
        .catch(() => {});
    }

    return new Response(readable, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  }

  private async handleDetach(req: Request): Promise<Response> {
    const mcpSessionId = req.headers.get("x-ams-mcp-session-id") ?? "";
    if (mcpSessionId) {
      this.detachWriter(mcpSessionId);
      this.tenants.delete(mcpSessionId);
    }
    if (this.tenants.size === 0 && this.wireWs) {
      try {
        this.wireWs.close(1000, "no_tenants");
      } catch {}
      this.wireWs = null;
      this.joined = null;
    }
    return jsonResponse({ ok: true });
  }
}

function sseFrame(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}
