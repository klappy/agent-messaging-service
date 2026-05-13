// GitHub Actions OIDC JWT verification, with JWKS caching.
//
// Used by the audit-gate-test route (Phase 4) and any future
// persona-shaped agent runtime that wants OIDC-authenticated callers
// from GitHub Actions workflows. The shape is generic: pass the
// expected audience, an allow-list of repository claims, and a JWT;
// receive the verified claims object or a typed error.
//
// Why this is its own module: JWT verification is a reusable
// substrate concern that has nothing to do with the audit gate per
// se. Phase 5 in the migration plan generalizes the runtime to host
// any persona, not just ams-canon-code-auditor. The auth check
// belongs at the route boundary alongside body parsing, not inside
// the DO. Co-locating it here keeps the audit-gate.ts file focused
// on the persona-shaped-agent-runtime contract.
//
// References:
//   - GitHub OIDC docs: about-security-hardening-with-openid-connect
//   - RFC 7519 (JWT), RFC 7515 (JWS), RFC 7517 (JWK), RFC 7518 (JWA)
//   - klappy://canon/principles/cache-fetches-and-parses (JWKS cache)

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`;

// JWKS cache TTL. Short enough to pick up GitHub's key rotation,
// long enough to amortize the fetch across many requests. GitHub
// rotates rarely (months), so a 1-hour TTL is conservative. Cached
// in the Workers global scope (per isolate); a cold isolate
// re-fetches.
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

let jwksCache: { keys: JsonWebKey[]; fetchedAt: number } | null = null;

export interface GitHubOidcClaims {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  /** owner/repo, e.g. "klappy/agent-messaging-service" */
  repository: string;
  /** Commit SHA the workflow ran against. */
  sha: string;
  /** Git ref, e.g. "refs/pull/85/merge" or "refs/heads/main". */
  ref: string;
  /** Workflow file path the OIDC token was issued from. */
  workflow_ref?: string;
  /** Repository owner (org or user). */
  repository_owner?: string;
  /** Run ID + attempt — useful for log correlation. */
  run_id?: string;
  run_attempt?: string;
  /** Catch-all for additional claims we don't care about. */
  [key: string]: unknown;
}

export type OidcVerifyResult =
  | { ok: true; claims: GitHubOidcClaims }
  | { ok: false; code: string; message: string };

export interface OidcVerifyOptions {
  /**
   * Expected `aud` claim. The audience the caller's workflow asked
   * GitHub for, e.g. "ams-audit-gate". Must match exactly.
   */
  audience: string;
  /**
   * Allow-list of `repository` claim values. A caller's OIDC token is
   * accepted only if its repository claim is in this set. Closes the
   * "any GitHub Actions workflow could burn our budget" hole.
   */
  allowedRepositories: ReadonlyArray<string>;
  /**
   * Override the current time (Unix seconds). For tests. Defaults to
   * Date.now() / 1000.
   */
  nowSec?: number;
}

/**
 * Verify a GitHub Actions OIDC JWT. Returns the claims if every
 * check passes; an {ok: false, code, message} otherwise. Never
 * throws — auth errors are values, not exceptions.
 */
export async function verifyGitHubOidcJwt(
  token: string,
  opts: OidcVerifyOptions,
): Promise<OidcVerifyResult> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, code: "jwt_malformed", message: "JWT must have three dot-separated parts." };
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  let header: { alg?: string; kid?: string; typ?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(b64urlToUtf8(headerB64));
    payload = JSON.parse(b64urlToUtf8(payloadB64));
  } catch {
    return { ok: false, code: "jwt_unparseable", message: "JWT header or payload is not valid JSON." };
  }

  if (header.alg !== "RS256") {
    return { ok: false, code: "jwt_alg_unsupported", message: `Expected alg=RS256, got alg=${header.alg ?? "unknown"}.` };
  }
  if (!header.kid || typeof header.kid !== "string") {
    return { ok: false, code: "jwt_kid_missing", message: "JWT header missing kid." };
  }

  // Claim shape checks
  if (payload.iss !== GITHUB_OIDC_ISSUER) {
    return { ok: false, code: "jwt_issuer_mismatch", message: `Expected iss=${GITHUB_OIDC_ISSUER}, got iss=${String(payload.iss ?? "")}.` };
  }
  if (payload.aud !== opts.audience) {
    return { ok: false, code: "jwt_audience_mismatch", message: `Expected aud=${opts.audience}, got aud=${String(payload.aud ?? "")}.` };
  }
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
    return { ok: false, code: "jwt_expired", message: `JWT expired (exp=${String(payload.exp)}, now=${nowSec}).` };
  }
  if (typeof payload.iat !== "number" || payload.iat > nowSec + 60) {
    // 60s skew tolerance; iat in the future is suspicious.
    return { ok: false, code: "jwt_iat_invalid", message: `JWT iat invalid or in the future (iat=${String(payload.iat)}, now=${nowSec}).` };
  }
  const repository = payload.repository;
  if (typeof repository !== "string" || !opts.allowedRepositories.includes(repository)) {
    return {
      ok: false,
      code: "repository_not_allowed",
      message: `Repository claim '${String(repository ?? "")}' is not in the allow-list: ${opts.allowedRepositories.join(", ")}.`,
    };
  }

  // Signature verification.
  const key = await fetchJwksKey(header.kid);
  if (!key) {
    return { ok: false, code: "jwt_kid_unknown", message: `kid=${header.kid} not found in GitHub JWKS.` };
  }

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = b64urlToBytes(signatureB64);

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      signature,
      signingInput,
    );
  } catch (err) {
    return {
      ok: false,
      code: "jwt_verify_error",
      message: `crypto.subtle.verify failed: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
  if (!valid) {
    return { ok: false, code: "jwt_signature_invalid", message: "JWT signature does not verify against the issuer's JWKS." };
  }

  // Past all checks; treat payload as GitHubOidcClaims. We have already
  // narrowed iss/aud/exp/iat/repository; sha/ref are claim-typical for
  // GitHub Actions tokens but not load-bearing for auth — they're the
  // audit context the caller will use.
  return { ok: true, claims: payload as GitHubOidcClaims };
}

/**
 * Fetch (and cache) the GitHub JWKS, look up the key by kid, import
 * it into the WebCrypto API. Returns null if the kid is unknown.
 *
 * Cache invalidation: on a kid miss, the cache is flushed once and a
 * single refetch is attempted, in case GitHub rotated keys since we
 * last cached. This means a key-rotation event causes at most one
 * extra fetch per isolate, not one per request.
 */
async function fetchJwksKey(kid: string): Promise<CryptoKey | null> {
  const cached = await getCachedJwks();
  let jwk = cached.find((k) => (k as { kid?: string }).kid === kid);
  if (!jwk) {
    // Maybe GitHub rotated. Flush and re-fetch once.
    jwksCache = null;
    const refreshed = await getCachedJwks();
    jwk = refreshed.find((k) => (k as { kid?: string }).kid === kid);
    if (!jwk) return null;
  }
  // Convert JWK → CryptoKey for RSASSA-PKCS1-v1_5 verify (RS256).
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
    false,
    ["verify"],
  );
}

async function getCachedJwks(): Promise<JsonWebKey[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(GITHUB_OIDC_JWKS_URL, { cf: { cacheTtl: 600 } } as RequestInit);
  if (!res.ok) {
    throw new Error(`github_jwks_fetch_failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { keys?: JsonWebKey[] };
  if (!body.keys || !Array.isArray(body.keys)) {
    throw new Error("github_jwks_malformed: missing keys array");
  }
  jwksCache = { keys: body.keys, fetchedAt: now };
  return body.keys;
}

// --- Base64url helpers -------------------------------------------------

function b64urlToUtf8(s: string): string {
  return new TextDecoder().decode(b64urlToBytes(s));
}

function b64urlToBytes(s: string): Uint8Array {
  // base64url → base64
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad === 2) b64 += "==";
  else if (pad === 3) b64 += "=";
  else if (pad !== 0) throw new Error("invalid_base64url_length");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
