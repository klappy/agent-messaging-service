// Canon URI resolution.
//
// The runtime needs to fetch persona profiles and task-definition canon
// (system_prompt_uri) at session-assembly time. The AGENT — not the
// runtime — fetches governance canon (brand_discipline, etc.) at
// session time via oddkit MCP, per
// klappy://canon/constraints/oddkit-prompt-pattern.
//
// v1 strategy: raw GitHub URLs. Two-line URI scheme → URL mapping per
// the canonical repos:
//
//   klappy://canon/methods/x → raw.githubusercontent.com/klappy/klappy.dev/main/canon/methods/x.md
//   ams://canon/personas/x   → raw.githubusercontent.com/klappy/agent-messaging-service/main/canon/personas/x.md
//
// Tradeoff vs oddkit MCP JSON-RPC: simpler (zero JSON-RPC machinery),
// boot-resilient (one less service dependency at startup), but skips
// oddkit's knowledge_base_url overlay and supersession-walking. v2+
// can add the oddkit path if those features prove necessary at the
// runtime layer; for v1 a missing overlay just means stale lookup,
// which is a non-issue for canon URIs that resolve identically across
// the overlay and the default knowledge base.

const KLAPPY_REPO = "klappy/klappy.dev";
const AMS_REPO = "klappy/agent-messaging-service";

/** Convert a klappy:// or ams:// URI to a raw GitHub URL. */
export function canonUriToUrl(uri: string): string {
  if (uri.startsWith("klappy://")) {
    const path = uri.slice("klappy://".length);
    return `https://raw.githubusercontent.com/${KLAPPY_REPO}/main/${path}.md`;
  }
  if (uri.startsWith("ams://")) {
    const path = uri.slice("ams://".length);
    return `https://raw.githubusercontent.com/${AMS_REPO}/main/${path}.md`;
  }
  throw new Error(`unsupported_canon_uri_scheme: ${uri}`);
}

export interface CanonDoc {
  uri: string;
  url: string;
  body: string;
}

/**
 * Fetch a canon doc by URI. Returns the raw markdown body (including
 * frontmatter and any embedded YAML profile blocks).
 *
 * Throws `canon_fetch_failed: <reason>` on any failure mode. Caller
 * wraps the throw with structural context (which URI, which session).
 */
export async function fetchCanon(uri: string): Promise<CanonDoc> {
  const url = canonUriToUrl(uri);
  const res = await fetch(url, {
    headers: {
      // Identify the runtime in GitHub's logs so abuse / outages are
      // attributable. Same pattern as oddkit's own consumer-label
      // headers.
      "user-agent": "agent-runtime/0.0.1 (+https://github.com/klappy/agent-messaging-service)",
    },
  });
  if (!res.ok) {
    throw new Error(`canon_fetch_failed: HTTP ${res.status} for ${uri} (${url})`);
  }
  const body = await res.text();
  return { uri, url, body };
}
