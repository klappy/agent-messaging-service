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
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { authenticate } from "./auth";
import type { JoinPayload, PeerIdentity } from "./conversation";
import { wrapWithSseHeartbeat } from "./sse-heartbeat";
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

// Optional peer-identity metadata supplied at ams_join time per D0028. Carried
// in participant frames so subscribers see human-readable identity (kind,
// model, client) alongside the opaque account_id / stream_id values. Set once
// at join; not mutable mid-session. Re-exported from ./conversation so callers
// importing from mcp.ts keep the prior surface.
export type { PeerIdentity };

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
  // Set when account_id was synthesized from the magic-link route's permissive
  // token (Door 1) rather than read from a persisted account record via the
  // Authorization bearer (Door 2). Transient accounts exist only for the
  // duration of the MCP session and are not in KV. ams_create_conversation
  // rejects them; ams_join / ams_send / ams_recv accept them. The capability
  // to hold the magic link is the authorization to participate in the single
  // conversation it names; persistent identity remains opt-in via Door 2.
  account_is_transient?: boolean;
  // Set when an Authorization bearer was present on the request but failed
  // validation, AND we did not return a transport-level 401 (i.e. the bare
  // /mcp route, where MCP framing must still apply). Tools that would
  // otherwise synthesize a transient identity (D0029 magic-link path in
  // ams_join) must refuse when this is set, so an invalid bearer is never
  // silently downgraded to a different (transient) identity.
  bearer_invalid?: boolean;
  outer_host?: string;
  // MCP transport session id, threaded through props so tool handlers can use
  // it for derivations (e.g. auto-generated stream_name suffix per D0028). The
  // SDK persists this in DO storage at session-init alongside the rest of the
  // props per the comment above; subsequent requests on the same MCP session
  // see the same value.
  mcp_session_id?: string;
}

interface ResolvedPrebind {
  ns: string;
  alias: string;
  permissive: string;
  conversation_id: string;
  record: ConversationRecord;
}

// SDK's request-handler `extra` argument. Used by withRideAlong to flush
// buffered peer frames onto the active POST tool-call response stream — per
// ams://canon/decisions/D0027 §Mechanism, the SDK pre-binds `relatedRequestId`
// on extra.sendNotification so notifications route to the in-flight request
// rather than the standalone SSE GET leg. The SDK's ServerNotification union
// does not enumerate AMS-specific methods (notifications/ams/token,
// notifications/ams/stream_metadata, notifications/ams/truncated), so we cast
// at the call site — same pattern the existing broadcastNotification uses for
// server.server.notification(...) below.
type ToolHandlerExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

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
  "  • Two-door auth: door 1 is the magic link (capability to attach a stream). Door 2 is the Bearer in Authorization (persistent account identity). On the magic-link route (POST to a magic-link URL), ams_join / ams_send / ams_recv accept Door 1 alone — the wrapper synthesizes a transient session-scoped account from the magic link's permissive token. On the /mcp endpoint, ams_join also accepts Door 1 when 'magic_link' is supplied as a tool argument (D0029 — the path for ChatGPT-class consumers that configure a stable connector URL and pass magic links as tool arguments). ams_create_conversation always requires Door 2 (mint at POST /v1/accounts) regardless of route.",
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
  // Set by the Conversation DO when this attach displaced and resumed an
  // existing stream per D0028. Absent / false on a fresh join.
  resumed?: boolean;
  // Optional human-readable peer metadata supplied at join time per D0028.
  // Echoed back on the joined frame so the tool result can surface it
  // alongside the opaque stream_id.
  peer_identity?: PeerIdentity;
  peers: Array<{
    stream_id: string;
    stream_name: string;
    owner_account_id: string;
    metadata: Record<string, unknown>;
    peer_identity?: PeerIdentity;
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

  // Frame buffer drained by the three delivery paths in
  // ams://canon/decisions/D0027-inbound-delivery-is-transport-adaptive:
  //   • push       — SDK's standalone SSE GET leg (broadcastNotification)
  //   • ride-along — drained onto active POST tool-call responses by withRideAlong
  //   • poll       — explicit ams_recv tool
  // Bounded; oldest-drop on overflow with truncation surfaced to whichever
  // path drains next.
  private recvBuffer: BufferedFrame[] = [];
  private recvTruncated = false;
  private static readonly RECV_BUDGET = 1000;
  // Cap drain count per ride-along call so a backlogged session does not block
  // a single tool-call response on flushing thousands of frames. Remainder
  // stays in the buffer for the next drain (next tool call, ams_recv, or push).
  private static readonly RIDE_ALONG_BUDGET = 64;
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
    // Three of the four tools are wrapped with withRideAlong per
    // ams://canon/decisions/D0027 §Mechanism so buffered peer frames are
    // drained onto the POST response stream of any tool call. ams_recv stays
    // un-wrapped — it owns the buffer explicitly; double-drain would lose
    // frames on consumers that expect the recv path to be authoritative.
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
      this.withRideAlong(async (args) => this.tool_ams_create_conversation(args)),
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
          peer_identity: z
            .object({
              kind: z
                .enum(["agent", "human"])
                .describe("Top-level discriminator: agent or human peer."),
              model: z
                .string()
                .optional()
                .describe(
                  "Model identifier when kind=agent (e.g. 'claude-opus-4-7', 'gpt-4o'). Optional but recommended for observability.",
                ),
              client: z
                .string()
                .optional()
                .describe(
                  "Client/runtime identifier (e.g. 'ChatGPT Apps', 'Claude Code', 'TinCan UI', 'curl'). Used by the wrapper to derive stream_name when one is not supplied.",
                ),
            })
            .optional()
            .describe(
              "Optional human-readable peer metadata per D0028. Carried in participant frames so subscribers see typed identity alongside opaque IDs. Set once at join; not mutable mid-session.",
            ),
        },
      },
      // Read the prebind fresh from this.props on every call, not the value
      // captured at registration time. The D0029 magic-link synthesis path in
      // tool_ams_join mutates this.props mid-session to record a new prebind;
      // a closure-captured `prebind` value would still be null on a
      // subsequent ams_join({}) (no magic_link argument) within the same DO
      // lifetime, breaking the comment's guarantee that re-join works after
      // synthesis without re-passing magic_link. Audit fix.
      this.withRideAlong(async (args) =>
        this.tool_ams_join(
          args,
          readPrebindFromProps(this.props as AmsProps | undefined),
        ),
      ),
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
      this.withRideAlong(async (args) => this.tool_ams_send(args)),
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
    // ams_create_conversation creates a NEW conversation owned by an account.
    // The transient Door-1-only account is scoped to a single existing
    // conversation (the one the magic link names) and is not persisted to KV;
    // ownership of a new conversation requires a persistent Door-2 account.
    // ams_join, ams_send, and ams_recv accept transient accounts.
    if (this.props?.account_is_transient) {
      return mcpToolError({
        error: "invalid_credential",
        message:
          "ams_create_conversation requires a persistent account (Authorization bearer / Door 2). The transient account synthesized from the magic-link route's permissive token is scoped to the bound conversation only. Mint an account at POST /v1/accounts and present the bearer to create new conversations.",
      });
    }

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
      peer_identity?: PeerIdentity;
    },
    prebind: ResolvedPrebind | null,
  ): Promise<AmsToolResult> {
    // Auth resolution per D0029. Three valid auth paths:
    //   1. Door 2 (Authorization bearer present and valid) — already populated
    //      this.props at session-init via buildAuthProps.
    //   2. Door 1 via URL route (D0023) — prebind populated; transient account
    //      already synthesized at session-init via buildAuthProps.
    //   3. Door 1 via magic_link argument on /mcp (D0029) — synthesize on
    //      first ams_join, mutate this.props for the session.
    //
    // The reorder: try requireAccount first; if no account AND no prebind AND
    // args.magic_link is supplied, attempt the D0029 synthesis path. Only then
    // fall through to the no-credential error. The bearer-presented-but-invalid
    // case is signaled via this.props.bearer_invalid (set by buildAuthProps on
    // the bare /mcp route, where MCP framing must still apply); we refuse the
    // D0029 synthesis in that case so an invalid bearer is never silently
    // downgraded to a transient account that would attribute the caller's
    // actions to a different identity.
    let account = await this.requireAccount();
    const bearerInvalid = (this.props as AmsProps | undefined)?.bearer_invalid === true;

    if (bearerInvalid && !account) {
      return mcpToolError({
        error: "invalid_credential",
        message:
          "Authorization bearer was presented but is invalid; refusing to fall back to magic-link synthesis to avoid silent identity downgrade. Retry without the Authorization header to authenticate via magic_link, or supply a valid bearer.",
      });
    }

    if (!account && !prebind && typeof args.magic_link === "string") {
      const synthesized = await synthesizeFromMagicLink(this.env, args.magic_link);
      if ("error" in synthesized) {
        return mcpToolError(synthesized.error);
      }
      // Mutate this.props so subsequent ams_send / ams_recv calls in this
      // session pass requireAccount() via the same mechanism. The agent
      // instance survives across requests within an MCP session per the SDK
      // (this.wireWs at line ~690 is the existing precedent). Includes
      // prebind_record_json so a subsequent ams_join({}) (without re-passing
      // magic_link) in the same session — e.g. after a wire drop where the
      // consumer uses D0028 resume-by-stream_name semantics — finds a valid
      // prebind via readPrebindFromProps. Audit M-2 fix.
      this.props = {
        ...(this.props ?? {}),
        account_id: synthesized.account_id,
        account_namespace: synthesized.namespace,
        account_is_transient: true,
        prebind_ns: synthesized.prebind.ns,
        prebind_alias: synthesized.prebind.alias,
        prebind_permissive: synthesized.prebind.permissive,
        prebind_conversation_id: synthesized.prebind.conversation_id,
        prebind_record_json: JSON.stringify(synthesized.prebind.record),
      };
      account = await this.requireAccount();
      // The validated magic link also acts as the prebind for this call so
      // the rest of the function can flow through the existing prebind path.
      prebind = synthesized.prebind;
    }

    if (!account) {
      return mcpToolError({
        error: "invalid_credential",
        message:
          "Authorization bearer required for ams_join, OR pass a valid magic_link argument (D0029) to authenticate via the magic link's permissive token.",
      });
    }

    let resolved: ResolvedPrebind;
    if (prebind && typeof args.magic_link !== "string") {
      resolved = prebind;
    } else if (prebind && typeof args.magic_link === "string") {
      // Account was already established (bearer or URL-route prebind), but the
      // caller supplied a magic_link argument too. Trust the prebind we
      // already validated; ignore the argument unless it disagrees.
      resolved = prebind;
    } else {
      if (typeof args.magic_link !== "string") {
        return mcpToolError({
          error: "invalid_arguments",
          message: "ams_join requires magic_link as a string.",
        });
      }
      const validated = await validateMagicLinkArgument(this.env, args.magic_link);
      if ("error" in validated) return mcpToolError(validated.error);
      resolved = {
        ns: validated.parsed.ns,
        alias: validated.parsed.alias,
        permissive: validated.parsed.permissive,
        conversation_id: validated.conversation_id,
        record: validated.record,
      };
    }

    // Compute effective stream_name per D0028. Order of preference:
    //   1. Explicit args.stream_name (operator-typed; cross-session-stable
    //      escape hatch).
    //   2. Auto-derived from peer_identity + mcp_session_id when peer_identity
    //      is supplied and stream_name is not.
    //   3. Existing random fallback (stream-NNNNNN) when neither is supplied.
    let effectiveStreamName: string | undefined = args.stream_name;
    if (
      (effectiveStreamName === undefined || effectiveStreamName.length === 0) &&
      args.peer_identity
    ) {
      const sessionDiscriminator =
        this.props?.mcp_session_id ?? account.account_id;
      effectiveStreamName = await deriveAutoStreamName(
        this.env,
        args.peer_identity,
        sessionDiscriminator,
      );
    }

    const dial = await this.dialWire({
      account_id: account.account_id,
      conversation_id: resolved.conversation_id,
      namespace: resolved.record.namespace,
      alias: resolved.alias,
      conversation_metadata: resolved.record.metadata,
      stream_name: effectiveStreamName,
      stream_metadata: args.stream_metadata,
      self_subscribe: args.self_subscribe === true,
      peer_identity: args.peer_identity,
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
      // Surface D0028 displace-and-resume to the consumer so a reconnect that
      // resumed an existing stream is distinguishable from a fresh join.
      ...(dial.joined.resumed ? { resumed: true } : {}),
      ...(args.peer_identity ? { peer_identity: args.peer_identity } : {}),
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
    peer_identity?: PeerIdentity;
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
      ...(opts.peer_identity ? { peer_identity: opts.peer_identity } : {}),
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
    // Buffer-side eviction with truncation surfacing per
    // ams://canon/decisions/D0027 §Echo Filter and Truncation: when the
    // per-session buffer overflows, the next drain across all three paths
    // (push, ride-along, poll) emits a notifications/ams/truncated frame.
    // We surface that frame in-band via the buffer (idempotent: at most one
    // truncated marker per drain cycle, gated on the recvTruncated flag) so
    // the ride-along and poll drains pick it up naturally; we also push it
    // via the SDK so push-leg consumers see it without having to drain.
    let truncatedTransition = false;
    if (this.recvBuffer.length >= AmsMcpAgent.RECV_BUDGET) {
      this.recvBuffer.shift();
      if (!this.recvTruncated) {
        this.recvTruncated = true;
        truncatedTransition = true;
        // The truncated marker we're about to push consumes a buffer slot
        // too, so evict an additional entry to honor RECV_BUDGET.
        if (this.recvBuffer.length > 0) this.recvBuffer.shift();
      }
    }
    if (truncatedTransition) {
      this.recvBuffer.push({
        method: "notifications/ams/truncated",
        params: {},
      });
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
    if (truncatedTransition) {
      try {
        void this.server.server.notification({
          method: "notifications/ams/truncated",
          params: {} as never,
        });
      } catch {
        // No active transport / not initialized yet — buffer carries it.
      }
    }
    try {
      void this.server.server.notification({ method, params: params as never });
    } catch {
      // No active transport / not initialized yet — buffered above is enough.
    }
  }

  // Ride-along delivery wrapper per ams://canon/decisions/D0027 §Mechanism.
  // Wraps a tool handler so that buffered peer frames are flushed onto the
  // active POST response stream via the SDK's extra.sendNotification (which
  // routes to the response by relatedRequestId). Capped at RIDE_ALONG_BUDGET
  // frames per call to keep response latency bounded; remainder stays in the
  // buffer for the next drain. Not applied to ams_recv — that tool drains the
  // buffer explicitly and a wrapped version would double-drain.
  private withRideAlong<TArgs, TResult>(
    handler: (args: TArgs, extra: ToolHandlerExtra) => Promise<TResult>,
  ): (args: TArgs, extra: ToolHandlerExtra) => Promise<TResult> {
    return async (args, extra) => {
      const result = await handler(args, extra);
      const drain = this.recvBuffer.splice(0, AmsMcpAgent.RIDE_ALONG_BUDGET);
      // recvTruncated is reset whenever a drain consumes the in-band marker
      // so the next overflow can surface a fresh marker.
      let drainedTruncated = false;
      for (const frame of drain) {
        if (frame.method === "notifications/ams/truncated") drainedTruncated = true;
        try {
          await extra.sendNotification({
            method: frame.method,
            params: frame.params,
          } as never);
        } catch {
          // Response stream gone / transport closed — drop on the floor; the
          // SDK push leg or a subsequent ams_recv will carry future frames.
        }
      }
      if (drainedTruncated) this.recvTruncated = false;
      return result;
    };
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

// --- Identity derivation per D0028 --------------------------------------

// Deterministic anon-account_id derivation per D0028. Same magic link →
// same acc_anon_* identity, every request, every session. Replaces the
// previous fresh-`ulid()`-per-request behavior in buildAuthProps. Reuses
// AMS_PERMISSIVE_TOKEN_PEPPER with a domain separator so the same secret
// can underwrite multiple derivations without cross-contamination.
async function deriveAnonId(env: Env, permissive: string): Promise<string> {
  const hex = await pepperedHash(
    env.AMS_PERMISSIVE_TOKEN_PEPPER,
    "anon-account|" + permissive,
  );
  return `acc_anon_${hex.slice(0, 26)}`;
}

// Validate a magic_link string supplied as a tool argument. Performs the
// four-step check (parse, KV alias lookup, KV record lookup, peppered-hash
// token comparison) and returns the parsed link, the resolved
// conversation_id, and the conversation record. Shared by the D0029
// synthesizeFromMagicLink path and the inline magic_link branch in
// tool_ams_join so both validate identically.
async function validateMagicLinkArgument(
  env: Env,
  link: string,
): Promise<
  | {
      parsed: { ns: string; alias: string; permissive: string };
      conversation_id: string;
      record: ConversationRecord;
    }
  | { error: { error: string; message: string } }
> {
  let parsed: { ns: string; alias: string; permissive: string };
  try {
    parsed = parseMagicLink(link);
  } catch (err) {
    return {
      error: { error: "invalid_magic_link", message: (err as Error).message },
    };
  }
  const id = await env.AMS_KV.get(ALIAS_KEY(parsed.ns, parsed.alias));
  if (!id) {
    return {
      error: {
        error: "conversation_not_found",
        message: "No conversation with that namespace+alias.",
      },
    };
  }
  const recordRaw = await env.AMS_KV.get(CONVERSATION_KEY(id));
  if (!recordRaw) {
    return {
      error: {
        error: "conversation_not_found",
        message: "Conversation record missing.",
      },
    };
  }
  const record = JSON.parse(recordRaw) as ConversationRecord;
  const tokenHash = await pepperedHash(
    env.AMS_PERMISSIVE_TOKEN_PEPPER,
    parsed.permissive,
  );
  if (!timingSafeEqualHex(tokenHash, record.permissive_token_hash)) {
    return {
      error: {
        error: "invalid_magic_link",
        message: "Permissive token did not match.",
      },
    };
  }
  return { parsed, conversation_id: id, record };
}

// Synthesize a transient account from a magic_link argument on /mcp per
// D0029. Validates the link, derives the anon account_id deterministically
// per D0028, and returns both the synthesized identity and the resolved
// prebind so tool_ams_join can flow through its existing prebind path.
async function synthesizeFromMagicLink(
  env: Env,
  link: string,
): Promise<
  | {
      account_id: string;
      namespace: string;
      prebind: ResolvedPrebind;
    }
  | { error: { error: string; message: string } }
> {
  const validated = await validateMagicLinkArgument(env, link);
  if ("error" in validated) return validated;
  const account_id = await deriveAnonId(env, validated.parsed.permissive);
  return {
    account_id,
    namespace: validated.parsed.ns,
    prebind: {
      ns: validated.parsed.ns,
      alias: validated.parsed.alias,
      permissive: validated.parsed.permissive,
      conversation_id: validated.conversation_id,
      record: validated.record,
    },
  };
}

// Auto-derive a stream_name from peer_identity + an MCP-session discriminator
// per D0028 §5. Format: <client-slug>-<first-4-hex-chars-of-pepperedHash>.
// Examples: chatgpt-7f3a, claude-code-9c2e, tincan-1d8b. Stable within an MCP
// session (same discriminator → same suffix → same stream resumes on
// reconnect) and distinct across sessions (each fresh initialize mints a new
// mcp-session-id, yielding a new auto-name even on the same magic link).
// Reuses AMS_PERMISSIVE_TOKEN_PEPPER with the "auto-stream-name|" domain
// separator — no new secret. Matching deriveAnonId / deriveStreamId pattern.
async function deriveAutoStreamName(
  env: Env,
  identity: PeerIdentity,
  discriminator: string,
): Promise<string> {
  const slugSource = identity.client ?? identity.kind;
  const slug = slugSource
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "peer";
  // 16^4 = 65536 distinct values per slug — sufficient for in-conversation
  // discrimination of simultaneous consumers under the same magic link.
  const raw = await pepperedHash(
    env.AMS_PERMISSIVE_TOKEN_PEPPER,
    "auto-stream-name|" + discriminator,
  );
  return `${slug}-${raw.slice(0, 4)}`;
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
): Promise<AmsProps | Response> {
  // authenticate() returns either an AccountRecord or a Response. We only set
  // account_id when the bearer is present and valid; absent auth just leaves
  // account_id undefined so unauthenticated MCP calls (initialize,
  // prompts/list, resources/list, resources/read) still work and tool calls
  // that need it surface a clean isError result. An explicitly-presented but
  // invalid bearer is surfaced as a transport-level auth error only on the
  // magic-link route (so it isn't silently downgraded to a transient
  // account) — see the Door-1 fallback below.
  const account = await authenticate(req, env);
  if (!(account instanceof Response)) {
    return {
      ...base,
      account_id: account.account_id,
      account_namespace: account.namespace,
      account_is_transient: false,
    };
  }

  // Distinguish "no bearer presented" from "bearer presented but invalid".
  // authenticate() returns a Response in both cases, but only the former is
  // eligible for the Door-1 transient fallback. An explicit-but-invalid
  // bearer on the magic-link route must not be silently downgraded — the
  // caller intended to act under their persistent identity, and a fresh
  // transient account would attribute their actions to a different identity
  // without any signal that their credential was rejected.
  //
  // On the bare /mcp route (no prebind) we deliberately fall through to
  // `return base` so the MCP session still starts and tool calls that need an
  // account surface invalid_credential at the MCP level — preserving prior
  // behavior. Returning a transport-level 401 here would bypass MCP framing
  // (and the SDK's CORS handling) for clients hitting /mcp directly.
  const bearerPresented = /^Bearer\s+\S/i.test(
    req.headers.get("authorization") ?? "",
  );
  if (bearerPresented && base.prebind_ns && base.prebind_alias) {
    return account;
  }

  // Door-1-only path. If we have a resolved prebind (the request arrived on
  // The transient Door-1-only account is scoped to a single existing
  // conversation (the one the magic-link route's URL identifies). Per D0028,
  // its account_id is now deterministically derived from the permissive token
  // (peppered hash, ULID-shaped opaque string) instead of fresh-per-request
  // ulid() — so the same magic link yields the same acc_anon_* identity
  // across all requests, all reconnects, and all MCP transport sessions. This
  // makes D0019's (account_id, conversation_id) SessionDO keying actually
  // work for the transient case.
  if (base.prebind_ns && base.prebind_alias && base.prebind_permissive) {
    return {
      ...base,
      account_id: await deriveAnonId(env, base.prebind_permissive),
      account_namespace: base.prebind_ns,
      account_is_transient: true,
    };
  }

  // No bearer (or invalid bearer on the bare /mcp route), no prebind. Tools
  // that need an account will surface invalid_credential; tools that do not
  // (initialize, prompts/list, resources/list, resources/read) continue to
  // work. We carry a `bearer_invalid` signal through props so the D0029
  // magic-link synthesis path in ams_join can distinguish "no bearer
  // presented" from "bearer presented but invalid" and refuse to silently
  // downgrade the latter to a transient account.
  if (bearerPresented) {
    return { ...base, bearer_invalid: true };
  }
  return base;
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
  const mcpSessionIdHeader = req.headers.get("mcp-session-id");

  let baseProps: AmsProps = {
    outer_host: outerHost,
    ...(mcpSessionIdHeader ? { mcp_session_id: mcpSessionIdHeader } : {}),
  };

  // Only POST carries a JSON-RPC body that needs the resolved conversation
  // record threaded into props; the other verbs on the magic-link route are
  // transport-level concerns that operate on MCP session state, not the
  // conversation. Resolving here for those verbs would couple session
  // teardown and SSE reconnection to KV state that may have moved on:
  //   - OPTIONS (CORS preflight) carries `?t=` on the same URL but must be
  //     answered by the SDK's corsOptions handler with `Access-Control-Allow-*`
  //     headers, or browsers block the subsequent real request entirely. A
  //     JSON errorResponse (no CORS headers) on a stale link downgrades a
  //     readable rejection on the actual request into an opaque preflight
  //     failure.
  //   - DELETE tears down the MCP session in the DO; a deleted conversation
  //     or rotated token must not block the client from cleaning up.
  //   - GET (MCP SSE notification leg) reconnects to a live MCP session;
  //     conversation-record state is irrelevant to whether the SSE stream
  //     should resume.
  // POST is the only verb where the prebind record is actually consumed, so
  // gate resolution on it rather than excluding the others one by one.
  if (prebind && req.method === "POST") {
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
  if (props instanceof Response) {
    return props;
  }

  // The SDK's URLPattern is anchored at "/mcp"; rewrite the incoming URL so
  // both /mcp and /{ns}/conversations/{alias} hit the same handler.
  const internalUrl = new URL(req.url);
  internalUrl.pathname = "/mcp";
  internalUrl.search = "";
  const internalReq = new Request(internalUrl.toString(), req);

  const handler = getMcpHandler();
  const resp = await handler.fetch(internalReq, env, ctxWithProps(ctx, props));

  // SSE keepalive: the SDK's GET /mcp response is a long-lived event-stream
  // that emits frames only when notifications/ams/* fire. iOS Safari (and any
  // other client with an aggressive idle-timeout) kills the connection if no
  // bytes arrive for ~20-30 seconds, surfacing as "Load failed" in fetch and
  // breaking the homepage's notification leg. Inject SSE comment heartbeats
  // (`: ping\n\n`, ignored by every conforming SSE parser per WHATWG) at a
  // fixed cadence to keep the connection live. Only applied to GET responses
  // whose Content-Type is text/event-stream — POST responses that happen to be
  // SSE-framed are short-lived and do not need keepalives.
  if (
    req.method === "GET" &&
    resp.body &&
    (resp.headers.get("content-type") ?? "").toLowerCase().includes("text/event-stream")
  ) {
    return wrapWithSseHeartbeat(resp);
  }
  return resp;
}

// SSE response wrapping (leading flush + idle heartbeats) lives in its own
// module so the unit test can import the REAL implementation rather than a
// re-implementation that could drift. See worker/src/sse-heartbeat.ts and
// scripts/test-sse-wrapper-unit.mjs.
