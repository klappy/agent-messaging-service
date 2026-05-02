// Random URL-safe base64 string of `bytes` random bytes.
export function randomToken(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

export function base64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// SHA-256 of (pepper || ":" || secret), hex-encoded. Matches storage layout
// for credential hashes and permissive-token hashes.
export async function pepperedHash(pepper: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(pepper + ":" + secret);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

// Constant-time comparison of two hex strings of equal length.
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

const NS_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
export function isValidNamespace(s: unknown): s is string {
  return typeof s === "string" && NS_RE.test(s);
}

const ALIAS_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
export function isValidAlias(s: unknown): s is string {
  return typeof s === "string" && ALIAS_RE.test(s);
}

const STREAM_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;
export function isValidStreamName(s: unknown): s is string {
  return typeof s === "string" && STREAM_NAME_RE.test(s);
}

// ULID-ish: timestamp-prefixed 26-char base32. Sortable, opaque to clients.
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function ulid(): string {
  const time = Date.now();
  const rand = new Uint8Array(10);
  crypto.getRandomValues(rand);
  let out = "";
  let t = time;
  for (let i = 9; i >= 0; i--) {
    out = CROCKFORD[t % 32]! + out;
    t = Math.floor(t / 32);
  }
  for (let i = 0; i < 10; i++) {
    out += CROCKFORD[rand[i]! % 32];
  }
  return out;
}

const ADJ = [
  "azure","crimson","golden","silver","jade","amber","ivory","violet",
  "swift","quiet","brave","keen","clever","gentle","steady","wild",
  "bright","calm","fair","fierce","kind","light","sharp","warm",
];
const NOUN = [
  "falcon","otter","stag","badger","heron","raven","wolf","hawk",
  "river","mountain","forest","valley","harbor","meadow","summit","canyon",
  "pulse","echo","signal","drift","tide","spark","ember","comet",
];
export function randomAlias(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)]!;
  const n = NOUN[Math.floor(Math.random() * NOUN.length)]!;
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${a}-${n}-${num}`;
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  return jsonResponse({ error: code, message }, { status });
}
