import { createAccount } from "./accounts";
import { authenticate } from "./auth";
import { ConversationDO, type JoinPayload, wsClose } from "./conversation";
import { ALIAS_KEY, CONVERSATION_KEY } from "./conversations";
import { homepageHeadResponse, homepageResponse } from "./homepage";
// Homepage and portal surfaces will move to the TinCan Worker per
// ams://canon/decisions/D0026 once tincan.klappy.dev is live.
import { AmsMcpAgent, handleMcp } from "./mcp";
import { ALLOWED_PERSONA_URIS, AuditGateDO } from "./runtime/audit-gate";
import { verifyGitHubOidcJwt } from "./runtime/oidc";
import type { ConversationRecord, Env } from "./types";
import {
  base64ToUtf8,
  errorResponse,
  isValidStreamName,
  jsonResponse,
  pepperedHash,
  randomToken,
  timingSafeEqualHex,
  utf8ToBase64,
} from "./util";

// Audit-gate runtime config. OIDC audience is the string callers must
// pass as `audience` when requesting an ID token from GitHub; the
// allow-list closes the "any GitHub workflow could call us" hole per
// the canon constraint canon-code-sync-via-spawned-agent-session
// §Current Implementation.
const AUDIT_GATE_OIDC_AUDIENCE = "ams-audit-gate";
const REPOSITORY_ALLOW_LIST: ReadonlyArray<string> = [
  "klappy/agent-messaging-service",
  "klappy/klappy.dev",
];

// Re-export the DO classes so wrangler's [[migrations]] / [[durable_objects.bindings]]
// can find them on the Worker module entrypoint.
export { AmsMcpAgent, ConversationDO, AuditGateDO };

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
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // Homepage — mint surface. TinCan will own this eventually (D0026) but
    // until tincan.klappy.dev is live, AMS continues to serve it.
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

    // MCP edge wrapper — POST/GET/DELETE/OPTIONS at /mcp. Streamable HTTP
    // transport built on Cloudflare's `agents/mcp` McpAgent per
    // ams://canon/decisions/D0024. Four tools (ams_create_conversation,
    // ams_join, ams_send, ams_recv); D0019 keying is threaded as McpAgent
    // construction props. See worker/src/mcp.ts.
    if (path === "/mcp") {
      return handleMcp(req, env, ctx);
    }

    // GET /v1/{namespace}/conversations/{alias} — conversation metadata.
    // Read-only. Returns namespace, alias, created_at, and metadata (including
    // operator instructions). Used by TinCan portal JS to populate the UI.
    // No auth required — permissive token in query param validates access.
    const convGetMatch = path.match(/^\/v1\/([^/]+)\/conversations\/([^/]+)\/?$/);
    if (method === "GET" && convGetMatch) {
      const ns = convGetMatch[1]!;
      const alias = convGetMatch[2]!;
      const permissive = url.searchParams.get("t");
      return getConversation(env, ns, alias, permissive);
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

    // Audit-gate runtime — generalized persona-shaped agent runtime
    // endpoint per AUDIT-GATE-RUNTIME-MIGRATION-PLAN.md (Phase 4/5).
    // OIDC-authenticated; persona_uri in the body picks which canon
    // persona to instantiate. Forwards to AuditGateDO keyed by
    // head_sha for the fresh-context guarantee. Endpoint name kept
    // as /audit-gate-test for continuity with the Phase 2/3 PoC
    // surface; the test- prefix becomes a misnomer as this stabilizes.
    if (method === "POST" && path === "/audit-gate-test") {
      return handleAuditGateTest(req, env);
    }

    // Magic-link route — MCP transport only per ams://canon/decisions/D0023.
    // Browser GETs are handled by the TinCan Worker (D0026) which proxies
    // MCP POST/SSE/DELETE/OPTIONS here via service binding. AMS serves no
    // HTML on this route — it is substrate only.
    //
    //   GET with mcp-session-id or Accept: text/event-stream → MCP SSE leg
    //   POST with application/json → MCP initialize / tool calls
    //   DELETE / OPTIONS → MCP transport lifecycle
    //   Browser GET (no MCP headers) → 404 (TinCan owns the portal UI)
    const convAliasMatch = path.match(/^\/([^/]+)\/conversations\/([^/]+)\/?$/);
    if (convAliasMatch) {
      const ns = convAliasMatch[1]!;
      const alias = convAliasMatch[2]!;
      const permissive = url.searchParams.get("t");
      const prebind = permissive ? { ns, alias, permissive } : undefined;

      if (method === "GET") {
        const isMcpSse =
          req.headers.get("mcp-session-id") !== null ||
          (req.headers.get("accept") ?? "").toLowerCase().includes("text/event-stream");
        if (isMcpSse) return handleMcp(req, env, ctx, prebind);
        // Plain browser GET — not AMS's surface any more.
        return errorResponse(404, "not_found", "Browser portal is served by TinCan. For MCP, include Accept: text/event-stream or mcp-session-id.");
      }
      if (method === "POST") {
        const ct = (req.headers.get("content-type") ?? "").toLowerCase();
        if (!ct.includes("application/json")) {
          return errorResponse(415, "unsupported_media_type", "Magic-link MCP transport requires Content-Type: application/json with a JSON-RPC body.");
        }
        if (!prebind) {
          return errorResponse(400, "invalid_magic_link", "Magic-link route requires the permissive token at ?t=<token>.");
        }
        return handleMcp(req, env, ctx, prebind);
      }
      if (method === "OPTIONS" || method === "DELETE") {
        return handleMcp(req, env, ctx, prebind);
      }
    }

    return errorResponse(404, "not_found", `No route for ${method} ${path}.`);
  },
};

// GET /v1/{ns}/conversations/{alias} — read conversation metadata.
// Validates permissive token (same check as /connect). Returns public fields.
async function getConversation(env: Env, ns: string, alias: string, permissive: string | null): Promise<Response> {
  if (!permissive) return errorResponse(400, "missing_token", "Permissive token required at ?t=<token>.");
  const conversationId = await env.AMS_KV.get(ALIAS_KEY(ns, alias));
  if (!conversationId) return errorResponse(404, "not_found", "Conversation not found.");
  const recordRaw = await env.AMS_KV.get(CONVERSATION_KEY(conversationId));
  if (!recordRaw) return errorResponse(404, "not_found", "Conversation not found.");
  const record = JSON.parse(recordRaw) as ConversationRecord;
  const tokenHash = await pepperedHash(env.AMS_PERMISSIVE_TOKEN_PEPPER, permissive);
  if (!timingSafeEqualHex(tokenHash, record.permissive_token_hash)) {
    return errorResponse(403, "invalid_token", "Invalid permissive token.");
  }
  return jsonResponse({
    conversation_id: record.conversation_id,
    namespace: record.namespace,
    alias: record.alias,
    metadata: record.metadata,
    created_at: record.created_at,
  });
}

// Lazy import to avoid a circular dep (conversations.ts pulls util.ts which is fine).
import { createConversation } from "./conversations";

// Audit-gate runtime handler — Phase 4/5 of the migration plan.
//
// Auth: GitHub Actions OIDC. The Authorization header carries a JWT
// signed by https://token.actions.githubusercontent.com; the token's
// claims (repository, sha, ref) are the audit context. Body carries
// the persona_uri to instantiate and an optional github_token for
// private-repo diff fetching.
//
// Per the canon constraint canon-code-sync-via-spawned-agent-session,
// the route enforces:
//   - JWT signature, iss, aud, exp validity
//   - repository claim in REPOSITORY_ALLOW_LIST (closes the "any GH
//     workflow can call us" hole)
//   - persona_uri in ALLOWED_PERSONA_URIS (closes the "caller points
//     at an attacker-controlled persona doc" hole)
//
// PR coordinates come from the JWT (repository, sha) — not from the
// request body — so a workflow cannot audit a repo it doesn't
// represent. The pr_number is the only PR-identity field passed in
// the body, since the JWT doesn't carry it.
async function handleAuditGateTest(req: Request, env: Env): Promise<Response> {
  const authHeader = req.headers.get("authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return errorResponse(
      401,
      "missing_credential",
      "Authorization: Bearer <github-oidc-jwt> required.",
    );
  }
  const jwt = m[1]!.trim();

  const verifyResult = await verifyGitHubOidcJwt(jwt, {
    audience: AUDIT_GATE_OIDC_AUDIENCE,
    allowedRepositories: REPOSITORY_ALLOW_LIST,
  });
  if (!verifyResult.ok) {
    return errorResponse(401, verifyResult.code, verifyResult.message);
  }
  const claims = verifyResult.claims;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "invalid_json", "body must be JSON");
  }

  const personaUri = body.persona_uri;
  if (typeof personaUri !== "string" || !ALLOWED_PERSONA_URIS.includes(personaUri)) {
    return errorResponse(
      400,
      "persona_uri_not_allowed",
      `body.persona_uri must be in the allow-list: ${ALLOWED_PERSONA_URIS.join(", ")}.`,
    );
  }

  const prNumberRaw = body.pr_number;
  const prNumber =
    typeof prNumberRaw === "number" && Number.isInteger(prNumberRaw) && prNumberRaw > 0
      ? prNumberRaw
      : null;
  if (prNumber === null) {
    return errorResponse(400, "missing_pr_number", "body.pr_number is required (positive integer).");
  }

  const githubToken =
    typeof body.github_token === "string" && body.github_token.length > 0
      ? body.github_token
      : undefined;

  // Derive owner/repo from the JWT's repository claim, sha from the
  // JWT's sha claim. Body-supplied owner/repo/sha values are ignored
  // on the OIDC path: the JWT is the source of truth.
  const [prOwner, prRepo] = claims.repository.split("/");
  if (!prOwner || !prRepo) {
    return errorResponse(400, "repository_claim_malformed", `repository claim '${claims.repository}' is not owner/repo.`);
  }
  const headSha = claims.sha;
  if (typeof headSha !== "string" || !/^[0-9a-f]{40}$/i.test(headSha)) {
    return errorResponse(400, "sha_claim_invalid", "sha claim must be a 40-character hex string.");
  }

  // Forward the resolved invocation to the AuditGateDO. The DO is
  // keyed by head_sha to satisfy the fresh-context guarantee per
  // klappy://canon/methods/spawned-agent-session-runtime-contract.
  const invocation = {
    pr_owner: prOwner,
    pr_repo: prRepo,
    pr_number: prNumber,
    head_sha: headSha,
    persona_uri: personaUri,
    knowledge_base_url: `https://github.com/${prOwner}/${prRepo}`,
    ...(githubToken ? { github_token: githubToken } : {}),
  };
  const stub = env.AUDIT_GATE.get(env.AUDIT_GATE.idFromName(headSha));
  // Re-marshal the invocation into a new Request so the DO sees the
  // resolved shape (rather than the un-validated original body).
  const forwarded = new Request(req.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(invocation),
  });
  return stub.fetch(forwarded);
}

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

  // Per PROTOCOL §4.1, "Server response on failure: WebSocket close with one
  // of the codes in §6." We accept the WS upgrade unconditionally once the
  // upgrade header is present, then either route to the DO or close with the
  // appropriate spec'd code. Pre-upgrade HTTP errors only fire when the
  // request isn't even a WS upgrade attempt.
  //
  // Defense in depth: any unexpected throw from resolveConnect (KV failure,
  // crypto error, JSON.parse on a corrupt KV record) or stub.fetch surfaces
  // as a wire close 4500 instead of an opaque HTTP 500 from workerd. Mirrors
  // the DO's own try/catch around handleConnect.
  try {
    const resolution = await resolveConnect(req, env, ns, alias, url);
    if ("error" in resolution) {
      return wsClose(resolution.error.code, resolution.error.reason);
    }

    // Hand off to the ConversationDO. The DO is named by conversation_id; that
    // way every connect for the same conversation lands on the same DO instance
    // regardless of which CF colo terminated the WebSocket.
    const stub = env.CONVERSATION_DO.get(
      env.CONVERSATION_DO.idFromName(resolution.payload.conversation_id),
    );
    // The DO's fetch() reads the join payload from this header. We can't put it
    // in a body — WebSocket-upgrade requests have no readable body in workerd.
    const doReq = new Request("https://do.internal/__do__/connect", {
      method: "GET",
      headers: {
        upgrade: "websocket",
        "x-ams-join-payload": utf8ToBase64(JSON.stringify(resolution.payload)),
      },
    });
    return await stub.fetch(doReq);
  } catch {
    return wsClose(4500, "internal_error");
  }
}

// Resolve a /connect request into either a JoinPayload or a (code, reason)
// pair. Codes come from PROTOCOL §6:
//   4001 — invalid magic link (missing/invalid permissive token)
//   4002 — invalid or missing account credential
//   4005 — conversation not found
//   4400 — malformed connect header (extends "malformed frame" to the
//          handshake; closest semantic match in §6 for header-validation
//          failures that happen post-upgrade)
async function resolveConnect(
  req: Request,
  env: Env,
  ns: string,
  alias: string,
  url: URL,
): Promise<{ payload: JoinPayload } | { error: { code: number; reason: string } }> {
  const permissiveToken = url.searchParams.get("t");
  if (!permissiveToken) {
    return { error: { code: 4001, reason: "invalid_magic_link" } };
  }

  // Resolve alias → conversation_id.
  const conversationId = await env.AMS_KV.get(ALIAS_KEY(ns, alias));
  if (!conversationId) {
    return { error: { code: 4005, reason: "conversation_not_found" } };
  }
  const recordRaw = await env.AMS_KV.get(CONVERSATION_KEY(conversationId));
  if (!recordRaw) {
    return { error: { code: 4005, reason: "conversation_not_found" } };
  }
  const record = JSON.parse(recordRaw) as ConversationRecord;

  // Validate the permissive token (timing-safe compare against stored hash).
  const tokenHash = await pepperedHash(env.AMS_PERMISSIVE_TOKEN_PEPPER, permissiveToken);
  if (!timingSafeEqualHex(tokenHash, record.permissive_token_hash)) {
    return { error: { code: 4001, reason: "invalid_magic_link" } };
  }

  // Authenticate the bearer (ownership of the joining stream).
  const account = await authenticate(req, env);
  if (account instanceof Response) {
    return { error: { code: 4002, reason: "invalid_credential" } };
  }

  // Optional stream-name header. Defaults to a stream-* token.
  const streamNameHeader = req.headers.get("x-ams-stream-name");
  let streamName: string;
  if (streamNameHeader) {
    if (!isValidStreamName(streamNameHeader)) {
      return { error: { code: 4400, reason: "invalid_stream_name_header" } };
    }
    streamName = streamNameHeader;
  } else {
    streamName = `stream-${randomToken(6)}`;
  }

  // Self-subscribe (default false). Boolean header parsed liberally.
  const selfHeader = (req.headers.get("x-ams-self-subscribe") ?? "false").toLowerCase();
  const selfSubscribe = selfHeader === "true" || selfHeader === "1";

  // Optional stream-metadata header (base64-encoded JSON object).
  const metadataHeader = req.headers.get("x-ams-stream-metadata");
  let streamMetadata: Record<string, unknown> = {};
  if (metadataHeader) {
    try {
      const decoded = base64ToUtf8(metadataHeader);
      const parsed = JSON.parse(decoded);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { error: { code: 4400, reason: "invalid_stream_metadata_header" } };
      }
      streamMetadata = parsed as Record<string, unknown>;
    } catch {
      return { error: { code: 4400, reason: "invalid_stream_metadata_header" } };
    }
  }

  return {
    payload: {
      conversation_id: conversationId,
      conversation_namespace: ns,
      alias,
      conversation_metadata: record.metadata,
      account_id: account.account_id,
      stream_name: streamName,
      self_subscribe: selfSubscribe,
      stream_metadata: streamMetadata,
    },
  };
}

