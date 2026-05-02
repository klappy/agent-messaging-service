import { createAccount } from "./accounts";
import { authenticate } from "./auth";
import { ConversationDO, type JoinPayload } from "./conversation";
import { ALIAS_KEY, CONVERSATION_KEY } from "./conversations";
import { homepageHeadResponse, homepageResponse } from "./homepage";
import type { ConversationRecord, Env } from "./types";
import {
  errorResponse,
  isValidStreamName,
  jsonResponse,
  pepperedHash,
  randomToken,
  timingSafeEqualHex,
  utf8ToBase64,
} from "./util";

// Re-export the DO class so wrangler's [[migrations]] / [[durable_objects.bindings]]
// can find it on the Worker module entrypoint.
export { ConversationDO };

// CORS for the read-only liveness endpoint /healthz. The homepage embeds a
// status-pill that polls both ams.klappy.dev and ams.truthkit.ai from a single
// origin, so the not-currently-hit host needs to answer the cross-origin
// preflight. /v1/* is intentionally same-origin only — credentials are minted
// there and we don't want third-party origins driving them via the browser.
const HEALTHZ_CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-max-age": "86400",
  "vary": "Origin",
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // Homepage — POC marketing surface served by the same Worker so the page
    // is genuinely same-origin with the API it demonstrates. Day 1 scope add;
    // does not modify the SPEC §3.1 smoke surface (accounts + conversations).
    if ((method === "GET" || method === "HEAD") && (path === "/" || path === "/index.html")) {
      return method === "HEAD" ? homepageHeadResponse() : homepageResponse();
    }

    // Health probe — POC-INFRA §13. Both ams.klappy.dev and ams.truthkit.ai
    // must answer 200 here per D0011. Pre-flight + GET both carry CORS so
    // browser-based monitors and the homepage's own pill can poll either host.
    if (method === "OPTIONS" && path === "/healthz") {
      return new Response(null, { status: 204, headers: HEALTHZ_CORS });
    }
    if ((method === "GET" || method === "HEAD") && path === "/healthz") {
      if (method === "HEAD") {
        return new Response(null, {
          headers: { "content-type": "application/json", ...HEALTHZ_CORS },
        });
      }
      return jsonResponse(
        {
          ok: true,
          host: req.headers.get("host"),
          ts: new Date().toISOString(),
        },
        { headers: HEALTHZ_CORS },
      );
    }

    if (method === "POST" && path === "/v1/accounts") {
      return createAccount(req, env);
    }

    // POST /v1/{namespace}/conversations
    const convMintMatch = path.match(/^\/v1\/([^/]+)\/conversations\/?$/);
    if (method === "POST" && convMintMatch) {
      const ns = convMintMatch[1]!;
      const account = await authenticate(req, env);
      if (account instanceof Response) return account;
      return createConversation(req, env, account, ns);
    }

    // GET /{namespace}/conversations/{alias}/connect?t=<permissive-token>
    // Stream-plane WebSocket upgrade. The path shape mirrors the magic link
    // returned from POST /v1/{ns}/conversations (PROTOCOL.md §3.2) with
    // `/connect` appended — the magic link is opaque to clients, so the
    // connect URL inherits its shape (no /v1/ prefix on the stream-plane).
    const connectMatch = path.match(/^\/([^/]+)\/conversations\/([^/]+)\/connect\/?$/);
    if (method === "GET" && connectMatch) {
      const ns = connectMatch[1]!;
      const alias = connectMatch[2]!;
      return handleConnect(req, env, ns, alias, url);
    }

    return errorResponse(404, "not_found", `No route for ${method} ${path}.`);
  },
};

// Lazy import to avoid a circular dep (conversations.ts pulls util.ts which is fine).
import { createConversation } from "./conversations";

async function handleConnect(
  req: Request,
  env: Env,
  ns: string,
  alias: string,
  url: URL,
): Promise<Response> {
  if (req.headers.get("upgrade") !== "websocket") {
    return errorResponse(426, "upgrade_required", "WebSocket upgrade required for /connect.");
  }
  const permissiveToken = url.searchParams.get("t");
  if (!permissiveToken) {
    return errorResponse(
      401,
      "missing_permissive_token",
      "Magic link 't' query parameter required.",
    );
  }

  // Resolve alias → conversation_id.
  const conversationId = await env.AMS_KV.get(ALIAS_KEY(ns, alias));
  if (!conversationId) {
    return errorResponse(
      404,
      "conversation_not_found",
      "No conversation matches this magic link.",
    );
  }

  const recordRaw = await env.AMS_KV.get(CONVERSATION_KEY(conversationId));
  if (!recordRaw) {
    return errorResponse(
      404,
      "conversation_not_found",
      "No conversation matches this magic link.",
    );
  }
  const record = JSON.parse(recordRaw) as ConversationRecord;

  // Validate the permissive token (timing-safe compare against the stored hash).
  // PROTOCOL.md §6 close 4001 maps to this; we return HTTP 401 pre-upgrade
  // since no WebSocket has been established yet.
  const tokenHash = await pepperedHash(env.AMS_PERMISSIVE_TOKEN_PEPPER, permissiveToken);
  if (!timingSafeEqualHex(tokenHash, record.permissive_token_hash)) {
    return errorResponse(
      401,
      "invalid_permissive_token",
      "Magic link permissive token is not valid.",
    );
  }

  // Authenticate the bearer (ownership of the joining stream).
  const account = await authenticate(req, env);
  if (account instanceof Response) return account;

  // Stream name (optional header). Defaults to a stream-* token.
  const streamNameHeader = req.headers.get("x-ams-stream-name");
  let streamName: string;
  if (streamNameHeader) {
    if (!isValidStreamName(streamNameHeader)) {
      return errorResponse(
        400,
        "invalid_stream_name",
        "X-AMS-Stream-Name must match [A-Za-z0-9][A-Za-z0-9._-]{0,62}.",
      );
    }
    streamName = streamNameHeader;
  } else {
    streamName = `stream-${randomToken(6)}`;
  }

  // Self-subscribe (default false). Boolean header parsed liberally.
  const selfHeader = (req.headers.get("x-ams-self-subscribe") ?? "false").toLowerCase();
  const selfSubscribe = selfHeader === "true" || selfHeader === "1";

  // Optional stream metadata (base64-encoded JSON object).
  const metadataHeader = req.headers.get("x-ams-stream-metadata");
  let streamMetadata: Record<string, unknown> = {};
  if (metadataHeader) {
    try {
      const decoded = atob(metadataHeader);
      const parsed = JSON.parse(decoded);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return errorResponse(
          400,
          "invalid_stream_metadata",
          "X-AMS-Stream-Metadata must decode to a JSON object.",
        );
      }
      streamMetadata = parsed as Record<string, unknown>;
    } catch {
      return errorResponse(
        400,
        "invalid_stream_metadata",
        "X-AMS-Stream-Metadata must be base64-encoded JSON.",
      );
    }
  }

  // Hand off to the ConversationDO. The DO is named by conversation_id; that
  // way every connect for the same conversation lands on the same DO instance
  // regardless of which CF colo terminated the WebSocket.
  const stub = env.CONVERSATION_DO.get(env.CONVERSATION_DO.idFromName(conversationId));
  const payload: JoinPayload = {
    conversation_id: conversationId,
    conversation_namespace: ns,
    alias,
    conversation_metadata: record.metadata,
    account_id: account.account_id,
    stream_name: streamName,
    self_subscribe: selfSubscribe,
    stream_metadata: streamMetadata,
  };
  // The DO's fetch() reads the join payload from this header. We can't put it
  // in a body — WebSocket-upgrade requests have no readable body in workerd.
  const doReq = new Request("https://do.internal/__do__/connect", {
    method: "GET",
    headers: {
      upgrade: "websocket",
      "x-ams-join-payload": utf8ToBase64(JSON.stringify(payload)),
    },
  });
  return stub.fetch(doReq);
}
