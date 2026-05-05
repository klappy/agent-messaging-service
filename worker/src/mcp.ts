// MCP edge wrapper at /mcp on the existing AMS Worker — SDK-substrate rewrite
// per ams://canon/decisions/D0024-migrate-hosted-mcp-wrapper-to-mcpagent-sdk.
//
// The wrapper is a McpAgent subclass on Cloudflare's `agents/mcp` package; the
// SDK owns Streamable HTTP framing, JSON-RPC dispatch, capabilities negotiation,
// and the protocol-version handshake. AMS-specific code in this file is the
// translation layer: registering the four tools (ams_create_conversation,
// ams_join, ams_send, ams_recv), the four resources, the operator-defined
// prompts, and the two non-standard notifications (notifications/ams/token,
// notifications/ams/stream_metadata) — plus the upstream wire WebSocket to the
// ConversationDO that ams_send / ams_recv route through.
//
// D0019 keying is preserved as construction context: route handlers thread
// (account_id, conversation_id) into McpAgent props before dispatch. The SDK's
// transport session id is internal; AMS reads account/conversation from props.
//
// Translation only. Token data stays opaque — no logging, no parsing, no
// schema-checking. Capabilities round-trip via stream_metadata exactly as
// PROTOCOL §4.4 specifies. Security-subscriber attachment points are
// documented surfaces, not running code: any consumer that wants to attach a
// signing/audit/policy/anomaly-detection subscriber per
// `ams://canon/principles/security-as-subscriber-pattern` joins the same
// conversation through any conformant wrapper and declares its role in
// stream_metadata.capabilities.ams.convention.v1.{role,function,posture,scope,attestation}.
// The wrapper does not gate — `ams://canon/principles/security-as-subscriber-pattern`
// "Bounded Power" applies.

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { authenticate } from "./auth";
import type { JoinPayload } from "./conversation";
import { ALIAS_KEY, CONVERSATION_KEY, createConversation } from "./conversations";
import type { AccountRecord, ConversationRecord, Env } from "./types";
import {
  errorResponse,
  isPlainObject,
  pepperedHash,
  randomToken,
  timingSafeEqualHex,
  utf8ToBase64,
} from "./util";

// --- Public types --------------------------------------------------------

// Magic-link prebind context per ams://canon/decisions/D0023. Threaded by the
// route handler in index.ts when the request arrived on /{ns}/conversations/{alias}
// with a valid permissive token. /mcp callers carry no prebind.
export interface McpPrebind {
  ns: string;
  alias: string;
  permissive: string;
}

// Props passed to the McpAgent at request dispatch time via ctx.props. Carries
// the resolved prebind, the conversation record, the authenticated account
// (when an Authorization header was present and valid), and the outer host
// for magic-link minting. Persisted to DO storage by the SDK on first hit, so
// subsequent requests on the same MCP transport session see the same shape.
export interface AmsProps extends Record<string, unknown> {
  prebind_ns?: string;
  prebind_alias?: string;
  prebind_permissive?: string;
  prebind_conversation_id?: string;
  prebind_record_json?: string;
  account_id?: string;
  account_namespace?: string;
  outer_host?: string;
}

interface ResolvedPrebind {
  ns: string;
  alias: string;
  permissive: string;
  conversation_id: string;
  record: ConversationRecord;
}

const PROTOCOL_POINTER_URL =
  "https://github.com/klappy/agent-messaging-service/blob/main/PROTOCOL.md";
const CONVENTIONS_POINTER_URL =
  "https://github.com/klappy/agent-messaging-service/blob/main/canon/constraints/two-agent-conversation-conventions.md";

// Static governance block per ams://canon/decisions/D0023 §"The MCP Surface
// Additions". Build-time-derived from canon: references PROTOCOL.md, the
// conformance constraint, the convention spec, the two-door auth, and the
// polling pattern. No runtime branching — what changes per conversation is
// the per-conversation block appended after this.
const STATIC_INSTRUCTIONS = [
  "AMS edge wrapper — Agent Messaging Service over MCP.",
  "",
  "Wire model (canon-derived):",
  "  • Tokens, not messages: payloads are opaque bytes (D0001). Use ams_send to emit; peer tokens arrive via notifications/ams/token (push) or ams_recv (poll).",
  "  • Streams own themselves: by default a stream does not see its own emissions (D0009). Pass self_subscribe: true at ams_join to opt in.",
  "  • Two-door auth: door 1 is the magic link (capability to attach a stream). Door 2 is the Bearer in Authorization (account ownership). Both are required for ams_send. Mint an account at POST /v1/accounts if you do not have one.",
  "  • Polling fallback: ams_recv is the long-poll degradation path for runtimes that cannot consume the SSE leg of the Streamable HTTP transport. Pass wait_ms to wait for frames.",
  "  • Convention manifest: 'ams.convention.v1' is the application-level namespace inside stream_metadata.capabilities (role / function / posture / scope / attestation). Round-trips opaquely through the wrapper.",
  "",
  "References:",
  "  • Wire protocol: PROTOCOL.md",
  "  • Wrapper conformance: canon/constraints/mcp-wrapper-conformance-for-conversational-ai",
  "  • Conversation conventions: canon/constraints/two-agent-conversation-conventions",
  "  • Bootstrap rationale: canon/decisions/D0023-magic-link-as-mcp-transport-endpoint",
  "",
  "Call sequence: initialize → (optional) prompts/list, prompts/get, resources/list, resources/read → ams_join → ams_send / ams_recv. On the magic-link route, ams_join accepts zero arguments because the conversation is pre-bound from the URL.",
].join("\n");

function readPrebindFromProps(props: AmsProps | undefined): ResolvedPrebind | null {
  if (!props) return null;
  if (
    !props.prebind_ns ||
    !props.prebind_alias ||
    !props.prebind_permissive ||
    !props.prebind_conversation_id ||
    !props.prebind_record_json
  ) {
    return null;
  }
  let record: ConversationRecord;
  try {
    record = JSON.parse(props.prebind_record_json) as ConversationRecord;
  } catch {
    return null;
  }
  return {
    ns: props.prebind_ns,
    alias: props.prebind_alias,
    permissive: props.prebind_permissive,
    conversation_id: props.prebind_conversation_id,
    record,
  };
}

function buildInstructions(prebind: ResolvedPrebind | null): string {
  if (!prebind) return STATIC_INSTRUCTIONS;
  const tail: string[] = [
    "",
    "─── Pre-bound conversation ───",
    `namespace: ${prebind.record.namespace}`,
    `alias: ${prebind.record.alias}`,
    `conversation_id: ${prebind.conversation_id}`,
  ];
  const opInstr = (prebind.record.metadata as Record<string, unknown>)["instructions"];
  if (typeof opInstr === "string" && opInstr.length > 0) {
    tail.push("", "─── Operator instructions (verbatim) ───", opInstr);
  }
  return `${STATIC_INSTRUCTIONS}\n${tail.join("\n")}`;
}

function operatorPrompts(record: ConversationRecord): Array<Record<string, unknown>> {
  const raw = (record.metadata as Record<string, unknown>)["prompts"];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPlainObject) as Array<Record<string, unknown>>;
}

// --- Buffered-frame state ------------------------------------------------

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

// --- The McpAgent --------------------------------------------------------

interface AmsState extends Record<string, unknown> {
  // Empty for now — wire WS state is volatile, re-dialed on hibernation per
  // wrapper-stays-cheap (the wrapper does not buffer beyond the live session).
}

export class AmsMcpAgent extends McpAgent<Env, AmsState, AmsProps> {
  // Assigned in init() once props are populated, so initialize.instructions
  // can incorporate the prebind tail.
  server!: McpServer;

  // Upstream wire WebSocket to the ConversationDO. Re-dialed on first ams_join;
  // not persisted across hibernation per `wrapper-stays-cheap`.
  private wireWs: WebSocket | null = null;
  private joined: JoinedSnapshot | null = null;

  // Frame buffer for ams_recv (long-poll fallback for runtimes that cannot
  // consume the SDK's standalone SSE leg). Bounded; oldest-drop on overflow.
  private recvBuffer: BufferedFrame[] = [];
  private recvTruncated = false;
  private static readonly RECV_BUDGET = 1000;
  private waiters: Array<() => void> = [];

  override async init(): Promise<void> {
    const prebind = readPrebindFromProps(this.props);
    this.server = new McpServer(
      { name: "ams-mcp", version: "0.1.0" },
      { instructions: buildInstructions(prebind) },
    );

    this.registerStaticResources();
    if (prebind) {
      this.registerConversationScopedResources(prebind);
      this.registerOperatorPrompts(prebind.record);
    }
    this.registerTools(prebind);
  }

  // --- resources -----------------------------------------------------------

  private registerStaticResources(): void {
    this.server.registerResource(
      "ams-protocol",
      "ams://protocol",
      {
        title: "AMS wire protocol",
        description:
          "Pointer to PROTOCOL.md at the deployment's canonical canon location.",
        mimeType: "text/uri-list",
      },
      async (uri) => ({
        contents: [
          {
            uri: typeof uri === "string" ? uri : uri.href,
            mimeType: "text/uri-list",
            text: `${PROTOCOL_POINTER_URL}\n`,
          },
        ],
      }),
    );

    this.server.registerResource(
      "ams-conventions-v1",
      "ams://conventions/v1",
      {
        title: "Conversation conventions (v1)",
        description:
          "Pointer to canon/constraints/two-agent-conversation-conventions and the ams.convention.v1 manifest spec.",
        mimeType: "text/uri-list",
      },
      async (uri) => ({
        contents: [
          {
            uri: typeof uri === "string" ? uri : uri.href,
            mimeType: "text/uri-list",
            text: `${CONVENTIONS_POINTER_URL}\n`,
          },
        ],
      }),
    );
  }

  private registerConversationScopedResources(prebind: ResolvedPrebind): void {
    const conversationId = prebind.conversation_id;
    const record = prebind.record;

    this.server.registerResource(
      "ams-conversation-snapshot",
      `ams://conversations/${conversationId}`,
      {
        title: "Conversation snapshot",
        description: "Current state snapshot for the bound conversation.",
        mimeType: "application/json",
      },
      async (uri) => ({
        contents: [
          {
            uri: typeof uri === "string" ? uri : uri.href,
            mimeType: "application/json",
            text: JSON.stringify({
              conversation_id: record.conversation_id,
              alias: record.alias,
              namespace: record.namespace,
              created_at: record.created_at,
              metadata: record.metadata,
            }),
          },
        ],
      }),
    );

    this.server.registerResource(
      "ams-conversation-peers",
      `ams://conversations/${conversationId}/peers`,
      {
        title: "Conversation peers",
        description:
          "Current peer list with stream metadata for the bound conversation.",
        mimeType: "application/json",
      },
      async (uri) => ({
        contents: [
          {
            uri: typeof uri === "string" ? uri : uri.href,
            mimeType: "application/json",
            // Best-effort live snapshot from this agent's joined state.
            // ams_join's joined snapshot is the durable source.
            text: JSON.stringify({ peers: this.joined?.peers ?? [] }),
          },
        ],
      }),
    );
  }

  // --- prompts -------------------------------------------------------------

  private registerOperatorPrompts(record: ConversationRecord): void {
    for (const p of operatorPrompts(record)) {
      if (typeof p.name !== "string") continue;
      const description =
        typeof p.description === "string" ? p.description : undefined;
      const messages = Array.isArray(p.messages) ? p.messages : [];
      this.server.registerPrompt(
        p.name,
        { description, argsSchema: {} },
        async () => ({
          description,
          // Forward verbatim — wrapper-stays-cheap; no schema-checking.
          messages: messages as never,
        }),
      );
    }
  }

  // --- tools ---------------------------------------------------------------

  private registerTools(prebind: ResolvedPrebind | null): void {
    this.server.registerTool(
      "ams_create_conversation",
      {
        description:
          "Mint a new AMS conversation under the bound account's namespace. Returns the magic link URL to share with peers.",
        inputSchema: {
          alias: z
            .string()
            .optional()
            .describe(
              "Optional human-readable alias; auto-generated if omitted.",
            ),
          stream_name: z
            .string()
            .optional()
            .describe("Optional stream name for the minter."),
          metadata: z
            .record(z.string(), z.unknown())
            .optional()
            .describe("Optional conversation-level metadata. Immutable in v1."),
          stream_metadata: z
            .record(z.string(), z.unknown())
            .optional()
            .describe(
              "Optional initial stream metadata. By convention the 'capabilities' key carries the ams.convention.v1 manifest (role, function, posture, scope, attestation). Round-trips opaquely through the wrapper per PROTOCOL §4.4.",
            ),
        },
      },
      async (args) => this.tool_ams_create_conversation(args),
    );

    // ams_join: magic_link is OPTIONAL. On the magic-link prebind route the
    // conversation is bound from the URL and ams_join({}) works; on /mcp the
    // tool returns an isError result if magic_link is omitted.
    this.server.registerTool(
      "ams_join",
      {
        description: prebind
          ? "Attach to the pre-bound conversation. The magic-link route bound (namespace, alias, permissive) from the URL; magic_link is therefore optional. Binds this MCP session's (account_id, conversation_id) pair per D0019."
          : "Attach to a conversation by magic link. Binds this MCP session's (account_id, conversation_id) pair per D0019, opens the upstream WebSocket, and returns the joined snapshot. Subsequent ams_send / ams_recv calls and notification frames flow through this binding.",
        inputSchema: {
          magic_link: z
            .string()
            .optional()
            .describe(
              "Magic link URL from ams_create_conversation. Optional on the magic-link MCP transport route where the conversation is pre-bound from the URL (D0023); required otherwise.",
            ),
          stream_name: z
            .string()
            .optional()
            .describe("Optional stream name; defaults to a stream-* token."),
          stream_metadata: z
            .record(z.string(), z.unknown())
            .optional()
            .describe(
              "Optional initial stream metadata. The 'capabilities' key carries the ams.convention.v1 manifest. All keys round-trip opaquely.",
            ),
          self_subscribe: z
            .boolean()
            .optional()
            .describe(
              "Opt into receiving own emissions on the SSE leg. Default false per D0009 (structural self-exclusion).",
            ),
        },
      },
      async (args) => this.tool_ams_join(args, prebind),
    );

    this.server.registerTool(
      "ams_send",
      {
        description:
          "Emit a token on the bound stream. Fire-and-forget at the wire layer; returns once the wrapper accepts the frame. Token data is opaque — the wrapper does not parse, log, or schema-check.",
        inputSchema: {
          data: z
            .string()
            .describe("Opaque UTF-8 token payload (up to 64 KiB)."),
        },
      },
      async (args) => this.tool_ams_send(args),
    );

    this.server.registerTool(
      "ams_recv",
      {
        description:
          "Long-poll degradation path: drain buffered peer frames since the last ams_recv. Runtimes that take MCP notifications via the SSE leg (GET /mcp) do not need this. Returns immediately if the buffer is empty unless wait_ms is provided.",
        inputSchema: {
          wait_ms: z
            .number()
            .int()
            .min(0)
            .max(25000)
            .optional()
            .describe(
              "If buffer empty, wait up to this many ms for a frame. Default 0.",
            ),
        },
      },
      async (args) => this.tool_ams_recv(args),
    );
  }

  // --- tool: ams_create_conversation --------------------------------------

  private async tool_ams_create_conversation(args: {
    alias?: string;
    stream_name?: string;
    metadata?: Record<string, unknown>;
    stream_metadata?: Record<string, unknown>;
  }): Promise<AmsToolResult> {
    const account = await this.requireAccount();
    if (!account) return mcpToolError({ error: "invalid_credential", message: "Authorization bearer required for ams_create_conversation." });

    const outerHost = this.props?.outer_host ?? "ams.klappy.dev";
    // Reuse the existing control-plane handler so mint behavior is single-sourced.
    const innerReq = new Request(
      `https://${outerHost}/v1/${account.namespace}/conversations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          alias: args.alias,
          stream_name: args.stream_name,
          metadata: args.metadata,
          stream_metadata: args.stream_metadata,
        }),
      },
    );
    const resp = await createConversation(
      innerReq,
      this.env,
      account,
      account.namespace,
      outerHost,
    );
    const payload = (await resp.json()) as Record<string, unknown>;
    if (resp.status >= 400) return mcpToolError(payload);
    return mcpToolOk(payload);
  }

  // --- tool: ams_join ------------------------------------------------------

  private async tool_ams_join(
    args: {
      magic_link?: string;
      stream_name?: string;
      stream_metadata?: Record<string, unknown>;
      self_subscribe?: boolean;
    },
    prebind: ResolvedPrebind | null,
  ): Promise<AmsToolResult> {
    const account = await this.requireAccount();
    if (!account)
      return mcpToolError({
        error: "invalid_credential",
        message: "Authorization bearer required for ams_join.",
      });

    let resolved: ResolvedPrebind;
    if (prebind && typeof args.magic_link !== "string") {
      resolved = prebind;
    } else {
      if (typeof args.magic_link !== "string") {
        return mcpToolError({
          error: "invalid_arguments",
          message: "ams_join requires magic_link as a string.",
        });
      }
      let parsed: { ns: string; alias: string; permissive: string };
      try {
        parsed = parseMagicLink(args.magic_link);
      } catch (err) {
        return mcpToolError({
          error: "invalid_magic_link",
          message: (err as Error).message,
        });
      }
      const id = await this.env.AMS_KV.get(ALIAS_KEY(parsed.ns, parsed.alias));
      if (!id)
        return mcpToolError({
          error: "conversation_not_found",
          message: "No conversation with that namespace+alias.",
        });
      const recordRaw = await this.env.AMS_KV.get(CONVERSATION_KEY(id));
      if (!recordRaw)
        return mcpToolError({
          error: "conversation_not_found",
          message: "Conversation record missing.",
        });
      const record = JSON.parse(recordRaw) as ConversationRecord;
      const tokenHash = await pepperedHash(
        this.env.AMS_PERMISSIVE_TOKEN_PEPPER,
        parsed.permissive,
      );
      if (!timingSafeEqualHex(tokenHash, record.permissive_token_hash))
        return mcpToolError({
          error: "invalid_magic_link",
          message: "Permissive token did not match.",
        });
      resolved = {
        ns: parsed.ns,
        alias: parsed.alias,
        permissive: parsed.permissive,
        conversation_id: id,
        record,
      };
    }

    const dial = await this.dialWire({
      account_id: account.account_id,
      conversation_id: resolved.conversation_id,
      namespace: resolved.record.namespace,
      alias: resolved.alias,
      conversation_metadata: resolved.record.metadata,
      stream_name: args.stream_name,
      stream_metadata: args.stream_metadata,
      self_subscribe: args.self_subscribe === true,
    });
    if ("error" in dial) return mcpToolError(dial.error);

    return mcpToolOk({
      ok: true,
      conversation_id: dial.joined.conversation_id,
      stream_id: dial.joined.stream_id,
      stream_name: dial.joined.stream_name,
      metadata: dial.joined.metadata,
      self_subscribe: dial.joined.self_subscribe,
      peers: dial.joined.peers,
    });
  }

  // --- tool: ams_send ------------------------------------------------------

  private async tool_ams_send(args: {
    data: string;
  }): Promise<AmsToolResult> {
    const account = await this.requireAccount();
    if (!account)
      return mcpToolError({
        error: "invalid_credential",
        message: "Authorization bearer required for ams_send.",
      });
    if (!this.wireWs)
      return mcpToolError({
        error: "not_joined",
        message: "Call ams_join before ams_send.",
      });
    try {
      this.wireWs.send(JSON.stringify({ type: "token", data: args.data }));
    } catch (err) {
      return mcpToolError({
        error: "wire_send_failed",
        message: (err as Error).message,
      });
    }
    return mcpToolOk({ ok: true, ts: new Date().toISOString() });
  }

  // --- tool: ams_recv ------------------------------------------------------

  private async tool_ams_recv(args: {
    wait_ms?: number;
  }): Promise<AmsToolResult> {
    const account = await this.requireAccount();
    if (!account)
      return mcpToolError({
        error: "invalid_credential",
        message: "Authorization bearer required for ams_recv.",
      });
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
    return mcpToolOk({ ok: true, frames, truncated });
  }

  // --- wire WS plumbing ----------------------------------------------------

  private async dialWire(opts: {
    account_id: string;
    conversation_id: string;
    namespace: string;
    alias: string;
    conversation_metadata: Record<string, unknown>;
    stream_name?: string;
    stream_metadata?: Record<string, unknown>;
    self_subscribe: boolean;
  }): Promise<
    | { joined: JoinedSnapshot }
    | { error: { error: string; message: string } }
  > {
    if (this.wireWs && this.joined) return { joined: this.joined };

    const streamName =
      opts.stream_name && opts.stream_name.length > 0
        ? opts.stream_name
        : `stream-${randomToken(6)}`;
    const streamMetadata = opts.stream_metadata ?? {};

    const payload: JoinPayload = {
      conversation_id: opts.conversation_id,
      conversation_namespace: opts.namespace,
      alias: opts.alias,
      conversation_metadata: opts.conversation_metadata,
      account_id: opts.account_id,
      stream_name: streamName,
      self_subscribe: opts.self_subscribe,
      stream_metadata: streamMetadata,
    };

    const stub = this.env.CONVERSATION_DO.get(
      this.env.CONVERSATION_DO.idFromName(opts.conversation_id),
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
      return {
        error: {
          error: "wire_upgrade_failed",
          message: `status ${upgrade.status}`,
        },
      };
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

    this.wireWs = ws;
    this.joined = joined;

    // Long-lived listeners that demultiplex notifications to MCP.
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
        conversation_id: opts.conversation_id,
      });
      this.wireWs = null;
    });

    return { joined };
  }

  private onWireFrame(frame: unknown): void {
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

  private broadcastNotification(method: string, params: unknown): void {
    // Buffer for ams_recv (poll-mode consumers).
    if (this.recvBuffer.length >= AmsMcpAgent.RECV_BUDGET) {
      this.recvBuffer.shift();
      this.recvTruncated = true;
    }
    this.recvBuffer.push({ method, params });
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) {
      try {
        w();
      } catch {
        // ignore; broadcast must not throw on a misbehaving waiter
      }
    }

    // Push through the SDK's escape hatch per the day-3 stdio migration pattern.
    // Goes to the standalone Streamable HTTP SSE leg if a client has it open.
    try {
      void this.server.server.notification({ method, params: params as never });
    } catch {
      // No active transport / not initialized yet — buffered above is enough.
    }
  }

  // --- auth helper ---------------------------------------------------------

  private async requireAccount(): Promise<AccountRecord | null> {
    const accountId = this.props?.account_id;
    const namespace = this.props?.account_namespace;
    if (!accountId || !namespace) return null;
    return {
      account_id: accountId,
      namespace,
      // The wrapper does not need credential_hash / created_at downstream.
      credential_hash: "",
      created_at: "",
    };
  }
}

// --- Magic-link parsing --------------------------------------------------

function parseMagicLink(link: string): {
  ns: string;
  alias: string;
  permissive: string;
} {
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

// --- Tool result helpers -------------------------------------------------

// Tool result helpers. Per MCP, a tool that completed but reported a domain
// error returns a normal result with `isError: true` (transport-/protocol-
// level errors are JSON-RPC errors, which the SDK handles automatically).
type AmsToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
  isError: boolean;
};

function mcpToolOk(payload: Record<string, unknown>): AmsToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: false,
  };
}

function mcpToolError(payload: Record<string, unknown>): AmsToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: true,
  };
}

// --- Route delegation ----------------------------------------------------

// One handler instance per Worker isolate. McpAgent.serve binds to a fixed
// path inside its URLPattern; we route requests to "/mcp" by URL-rewriting in
// the route handler so both the canonical /mcp endpoint and the magic-link
// transport route hit the same SDK substrate.
let _mcpHandler:
  | {
      fetch: (
        request: Request,
        env: Env,
        ctx: ExecutionContext,
      ) => Promise<Response>;
    }
  | null = null;

function getMcpHandler(): {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
} {
  if (_mcpHandler) return _mcpHandler;
  // The SDK forwards all requests under the basePath into a McpAgent DO
  // keyed by its transport session id. CORS is set wide-open here to match
  // the prior handroll's CORS posture (the homepage cross-origin-polls /mcp
  // and the SSE leg from a different host; see MCP_CORS in the prior file).
  _mcpHandler = AmsMcpAgent.serve("/mcp", {
    binding: "AMS_MCP",
    corsOptions: {
      origin: "*",
      methods: "GET, POST, DELETE, OPTIONS",
      headers:
        "authorization, content-type, mcp-session-id, mcp-protocol-version, accept",
      exposeHeaders: "mcp-session-id",
      maxAge: 86400,
    },
  }) as unknown as {
    fetch: (
      req: Request,
      env: Env,
      ctx: ExecutionContext,
    ) => Promise<Response>;
  };
  return _mcpHandler;
}

// Wraps an ExecutionContext with the props field that the SDK reads.
function ctxWithProps(
  ctx: ExecutionContext,
  props: AmsProps,
): ExecutionContext {
  // Spread does not preserve `this` binding for waitUntil/passThroughOnException,
  // so we delegate explicitly. The SDK only reads `ctx.props` and `ctx.waitUntil`.
  const wrapped = {
    waitUntil: ctx.waitUntil.bind(ctx),
    passThroughOnException:
      typeof ctx.passThroughOnException === "function"
        ? ctx.passThroughOnException.bind(ctx)
        : () => {},
    props,
  };
  return wrapped as unknown as ExecutionContext;
}

async function buildAuthProps(
  req: Request,
  env: Env,
  base: AmsProps,
): Promise<AmsProps> {
  // authenticate() returns either an AccountRecord or a Response. We only set
  // account_id when the bearer is present and valid; absent/invalid auth just
  // leaves account_id undefined so unauthenticated MCP calls (initialize,
  // prompts/list, resources/list, resources/read) still work and tool calls
  // that need it surface a clean isError result.
  const account = await authenticate(req, env);
  if (account instanceof Response) return base;
  return {
    ...base,
    account_id: account.account_id,
    account_namespace: account.namespace,
  };
}

async function resolvePrebindRecord(
  env: Env,
  prebind: McpPrebind,
): Promise<
  | { ok: true; conversation_id: string; record: ConversationRecord }
  | { ok: false; error: string }
> {
  const conversationId = await env.AMS_KV.get(
    ALIAS_KEY(prebind.ns, prebind.alias),
  );
  if (!conversationId) return { ok: false, error: "conversation_not_found" };
  const recordRaw = await env.AMS_KV.get(CONVERSATION_KEY(conversationId));
  if (!recordRaw) return { ok: false, error: "conversation_not_found" };
  const record = JSON.parse(recordRaw) as ConversationRecord;
  const tokenHash = await pepperedHash(
    env.AMS_PERMISSIVE_TOKEN_PEPPER,
    prebind.permissive,
  );
  if (!timingSafeEqualHex(tokenHash, record.permissive_token_hash)) {
    return { ok: false, error: "invalid_magic_link" };
  }
  return { ok: true, conversation_id: conversationId, record };
}

// Public route handler. Both /mcp and the magic-link transport route in
// index.ts forward here. The SDK handles GET/POST/DELETE/OPTIONS uniformly;
// the prebind threading that the prior handroll plumbed through OPTIONS,
// SSE-GET, and DELETE is now a single props-population step before dispatch.
export async function handleMcp(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  prebind?: McpPrebind,
): Promise<Response> {
  const outerHost = req.headers.get("host") ?? "ams.klappy.dev";

  let baseProps: AmsProps = { outer_host: outerHost };

  if (prebind) {
    const resolved = await resolvePrebindRecord(env, prebind);
    if (!resolved.ok) {
      // Magic-link route failure surfaces as transport-level rejection before
      // MCP framing gets a chance — the magic link is the bootstrap. Missing
      // conversation alias/record is a not-found condition; a permissive-token
      // mismatch is an auth failure.
      const status = resolved.error === "conversation_not_found" ? 404 : 401;
      return errorResponse(status, resolved.error, "magic-link rejected");
    }
    baseProps = {
      ...baseProps,
      prebind_ns: prebind.ns,
      prebind_alias: prebind.alias,
      prebind_permissive: prebind.permissive,
      prebind_conversation_id: resolved.conversation_id,
      prebind_record_json: JSON.stringify(resolved.record),
    };
  }

  const props = await buildAuthProps(req, env, baseProps);

  // The SDK's URLPattern is anchored at "/mcp"; rewrite the incoming URL so
  // both /mcp and /{ns}/conversations/{alias} hit the same handler.
  const internalUrl = new URL(req.url);
  internalUrl.pathname = "/mcp";
  internalUrl.search = "";
  const internalReq = new Request(internalUrl.toString(), req);

  const handler = getMcpHandler();
  return handler.fetch(internalReq, env, ctxWithProps(ctx, props));
}
