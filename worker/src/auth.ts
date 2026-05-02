import type { AccountRecord, Env } from "./types";
import { errorResponse, pepperedHash, timingSafeEqualHex } from "./util";

export const ACCOUNT_KEY = (accountId: string) => `account:${accountId}`;
export const NAMESPACE_KEY = (ns: string) => `namespace:${ns}`;
export const CRED_INDEX_KEY = (credHash: string) => `credindex:${credHash}`;

// Parse `Authorization: Bearer <token>` and resolve to an account.
// Returns either an AccountRecord or an HTTP error Response.
export async function authenticate(
  req: Request,
  env: Env,
): Promise<AccountRecord | Response> {
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return errorResponse(
      401,
      "missing_credential",
      "Authorization: Bearer <ams_sk_...> required.",
    );
  }
  const credential = m[1]!.trim();
  const credHash = await pepperedHash(env.AMS_CREDENTIAL_PEPPER, credential);
  const accountId = await env.AMS_KV.get(CRED_INDEX_KEY(credHash));
  if (!accountId) {
    return errorResponse(
      401,
      "invalid_credential",
      "Account credential not recognized.",
    );
  }
  const raw = await env.AMS_KV.get(ACCOUNT_KEY(accountId));
  if (!raw) {
    // Index points at a missing account — treat as invalid.
    return errorResponse(
      401,
      "invalid_credential",
      "Account credential not recognized.",
    );
  }
  const account = JSON.parse(raw) as AccountRecord;
  // Defense in depth: re-check the stored hash equals what we computed.
  if (!timingSafeEqualHex(account.credential_hash, credHash)) {
    return errorResponse(
      401,
      "invalid_credential",
      "Account credential not recognized.",
    );
  }
  return account;
}
