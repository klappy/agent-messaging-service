import type { AccountRecord, ConversationRecord, Env } from "./types";
import {
  errorResponse,
  isPlainObject,
  isValidAlias,
  isValidStreamName,
  jsonResponse,
  pepperedHash,
  randomAlias,
  randomToken,
  ulid,
} from "./util";

export const ALIAS_KEY = (ns: string, alias: string) =>
  `alias:${ns}:${alias}`;
export const CONVERSATION_KEY = (id: string) => `conversation:${id}`;

interface CreateConversationBody {
  alias?: unknown;
  stream_name?: unknown;
  id_kind?: unknown;
  metadata?: unknown;
  stream_metadata?: unknown;
}

// POST /v1/{namespace}/conversations
// PROTOCOL.md §3.2.
//
// Day 1 scope: mints conversation_id + alias mapping + permissive token, builds
// the magic link, and returns the protocol-shaped response. The minter's
// stream is recorded in the response shape (stream_id, stream_name) but no
// ConversationDO is created — that lands Day 2 along with the WebSocket path.
export async function createConversation(
  req: Request,
  env: Env,
  account: AccountRecord,
  pathNamespace: string,
  hostOverride?: string,
): Promise<Response> {
  if (pathNamespace !== account.namespace) {
    return errorResponse(
      403,
      "namespace_mismatch",
      `Bearer credential is for namespace '${account.namespace}'; cannot mint under '${pathNamespace}'.`,
    );
  }

  let body: CreateConversationBody;
  try {
    body = (await readJsonAllowEmpty(req)) as CreateConversationBody;
  } catch {
    return errorResponse(400, "invalid_json", "Request body must be JSON.");
  }

  // Optional alias
  let alias: string;
  if (body.alias === undefined || body.alias === null || body.alias === "") {
    alias = randomAlias();
  } else if (isValidAlias(body.alias)) {
    alias = body.alias;
  } else {
    return errorResponse(
      400,
      "invalid_alias",
      "alias must be lowercase alphanumeric + hyphen, 1–63 chars.",
    );
  }

  // Optional stream_name
  let streamName: string;
  if (
    body.stream_name === undefined ||
    body.stream_name === null ||
    body.stream_name === ""
  ) {
    streamName = `stream-${randomToken(6)}`;
  } else if (isValidStreamName(body.stream_name)) {
    streamName = body.stream_name;
  } else {
    return errorResponse(
      400,
      "invalid_stream_name",
      "stream_name must match [A-Za-z0-9][A-Za-z0-9._-]{0,62}.",
    );
  }

  // id_kind — only "uuid" in PoC (PROTOCOL.md §2.1).
  if (body.id_kind !== undefined && body.id_kind !== "uuid") {
    return errorResponse(
      400,
      "unsupported_id_kind",
      "id_kind 'jcs-sha256' is post-PoC; only 'uuid' is accepted in v1.",
    );
  }

  // Conversation- and stream-level metadata are opaque to AMS (PROTOCOL.md §4.4).
  const metadata =
    body.metadata === undefined ? {} : (
      isPlainObject(body.metadata)
        ? body.metadata
        : null
    );
  if (metadata === null) {
    return errorResponse(400, "invalid_metadata", "metadata must be a JSON object.");
  }
  const streamMetadata =
    body.stream_metadata === undefined ? {} : (
      isPlainObject(body.stream_metadata)
        ? body.stream_metadata
        : null
    );
  if (streamMetadata === null) {
    return errorResponse(
      400,
      "invalid_stream_metadata",
      "stream_metadata must be a JSON object.",
    );
  }

  // Alias collision within the minter's namespace.
  const aliasKey = ALIAS_KEY(account.namespace, alias);
  const existing = await env.AMS_KV.get(aliasKey);
  if (existing) {
    return errorResponse(
      409,
      "alias_taken",
      `Conversation alias '${alias}' is already in use under namespace '${account.namespace}'.`,
    );
  }

  const conversationId = `conv_${ulid()}`;
  const streamId = `str_${ulid()}`;
  const permissiveToken = randomToken(32);
  const permissiveTokenHash = await pepperedHash(
    env.AMS_PERMISSIVE_TOKEN_PEPPER,
    permissiveToken,
  );
  const createdAt = new Date().toISOString();

  const record: ConversationRecord = {
    conversation_id: conversationId,
    alias,
    namespace: account.namespace,
    owner_account_id: account.account_id,
    id_kind: "uuid",
    permissive_token_hash: permissiveTokenHash,
    metadata,
    created_at: createdAt,
  };

  await Promise.all([
    env.AMS_KV.put(CONVERSATION_KEY(conversationId), JSON.stringify(record)),
    env.AMS_KV.put(aliasKey, conversationId),
  ]);

  // Per D0011: read the request host to construct the magic link. The host
  // in the link is whichever host the mint request hit — and is portable
  // across the dual-host pair because both route to the same Worker.
  // hostOverride is provided by the MCP edge wrapper because synthetic in-Worker
  // Requests do not populate the Host header from their URL (forbidden header name).
  const host = hostOverride ?? req.headers.get("host") ?? "ams.klappy.dev";
  const magicLink =
    `https://${host}/${account.namespace}/conversations/${alias}?t=${permissiveToken}`;

  return jsonResponse(
    {
      conversation_id: conversationId,
      alias,
      magic_link: magicLink,
      stream_id: streamId,
      stream_name: streamName,
      metadata,
      stream_metadata: streamMetadata,
      created_at: createdAt,
    },
    { status: 201 },
  );
}

async function readJsonAllowEmpty(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text || text.trim() === "") return {};
  const parsed = JSON.parse(text);
  if (!isPlainObject(parsed)) {
    throw new SyntaxError("Request body must be a JSON object.");
  }
  return parsed;
}
