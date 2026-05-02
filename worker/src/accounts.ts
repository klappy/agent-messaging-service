import { ACCOUNT_KEY, CRED_INDEX_KEY, NAMESPACE_KEY } from "./auth";
import type { AccountRecord, Env } from "./types";
import {
  errorResponse,
  isValidNamespace,
  jsonResponse,
  pepperedHash,
  randomToken,
  ulid,
} from "./util";

interface CreateAccountBody {
  namespace?: unknown;
}

// POST /v1/accounts
// PROTOCOL.md §3.1 — unauthenticated; returns the bearer credential exactly once.
export async function createAccount(req: Request, env: Env): Promise<Response> {
  let body: CreateAccountBody;
  try {
    body = (await req.json()) as CreateAccountBody;
  } catch {
    return errorResponse(400, "invalid_json", "Request body must be JSON.");
  }
  const ns = body?.namespace;
  if (!isValidNamespace(ns)) {
    return errorResponse(
      400,
      "invalid_namespace",
      "namespace required: lowercase alphanumeric + hyphen, 1–63 chars, must start with [a-z0-9].",
    );
  }

  // Namespace uniqueness check. KV is eventually consistent; a true race
  // would require a DO. PoC accepts the small race window (account creation
  // is rare; collision returns 409 on any later attempt).
  const existing = await env.AMS_KV.get(NAMESPACE_KEY(ns));
  if (existing) {
    return errorResponse(
      409,
      "namespace_taken",
      `Namespace '${ns}' is already registered.`,
    );
  }

  const accountId = `acc_${ulid()}`;
  const credential = `ams_sk_${randomToken(32)}`;
  const credentialHash = await pepperedHash(env.AMS_CREDENTIAL_PEPPER, credential);
  const createdAt = new Date().toISOString();

  const record: AccountRecord = {
    account_id: accountId,
    namespace: ns,
    credential_hash: credentialHash,
    created_at: createdAt,
  };

  // Three writes: account record, namespace → account_id pointer, credential
  // hash → account_id reverse index for bearer lookup.
  await Promise.all([
    env.AMS_KV.put(ACCOUNT_KEY(accountId), JSON.stringify(record)),
    env.AMS_KV.put(NAMESPACE_KEY(ns), accountId),
    env.AMS_KV.put(CRED_INDEX_KEY(credentialHash), accountId),
  ]);

  return jsonResponse(
    {
      account_id: accountId,
      namespace: ns,
      credential,
      created_at: createdAt,
    },
    { status: 201 },
  );
}
