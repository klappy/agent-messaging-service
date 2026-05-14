// Canon URI resolution.
//
// The runtime needs to fetch persona profiles and task-definition canon
// (system_prompt_uri) at session-assembly time. The AGENT — not the
// runtime — fetches governance canon (brand_discipline, etc.) at
// session time via oddkit MCP, per
// klappy://canon/constraints/oddkit-prompt-pattern.
//
// URI resolution rule:
//
//   - klappy://canon/...  → always klappy.dev (upstream — every consumer
//                            shares this canon).
//   - <any-other>://path  → resolved against the per-invocation
//                            knowledge_base_url passed by the caller.
//                            The scheme prefix is a namespace label;
//                            its meaning is invocation-relative.
//
// This is what makes the runtime consumer-agnostic. The runtime knows
// only about upstream (klappy.dev) and "whatever the caller said its
// knowledge base is". AMS is one such caller; future consumers (other
// canon-governed repos, multi-tenant hosts) pass their own
// knowledge_base_url and their own URI scheme. Same runtime code,
// different invocations, no fork.

const KLAPPY_REPO = "klappy/klappy.dev";

export interface CanonDoc {
  uri: string;
  url: string;
  body: string;
}

/**
 * Convert a canon URI to a raw GitHub URL.
 *
 * For klappy:// URIs, klappy.dev is the upstream canon home — the URL
 * is fully determined. For every other scheme, the caller must pass
 * `knowledge_base_url` (a https://github.com/owner/repo URL) and the
 * runtime resolves the URI path against it. The scheme prefix is
 * a namespace label; only the path matters for the GitHub URL.
 *
 * Throws on:
 *   - URI not in scheme://path shape
 *   - missing knowledge_base_url for a non-klappy URI
 *   - knowledge_base_url that doesn't match the GitHub repo URL shape
 */
export function canonUriToUrl(
  uri: string,
  knowledge_base_url?: string,
): string {
  if (uri.startsWith("klappy://")) {
    const path = uri.slice("klappy://".length);
    return `https://raw.githubusercontent.com/${KLAPPY_REPO}/main/${path}.md`;
  }

  // Any other scheme — extract scheme prefix and path, resolve path
  // against the caller's knowledge_base_url.
  const schemeMatch = uri.match(/^([a-z][a-z0-9+.-]*):\/\/(.+)$/);
  if (!schemeMatch) {
    throw new Error(
      `canon_fetch_failed: not a canon URI (expected scheme://path): ${uri}`,
    );
  }
  const path = schemeMatch[2]!;

  if (!knowledge_base_url) {
    throw new Error(
      `canon_fetch_failed: knowledge_base_url required for non-klappy URI scheme: ${uri}`,
    );
  }

  const repo = parseGitHubRepo(knowledge_base_url);
  return `https://raw.githubusercontent.com/${repo}/main/${path}.md`;
}

/** Parse https://github.com/owner/repo[.git][/] → "owner/repo". */
function parseGitHubRepo(url: string): string {
  const m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!m) {
    throw new Error(
      `canon_fetch_failed: knowledge_base_url must be https://github.com/owner/repo; got ${url}`,
    );
  }
  return `${m[1]}/${m[2]}`;
}

/**
 * Fetch a canon doc by URI. Returns the raw markdown body (including
 * frontmatter and any embedded YAML profile blocks).
 *
 * `knowledge_base_url` is required for any non-klappy URI scheme;
 * klappy:// URIs resolve against the hardcoded upstream regardless.
 *
 * Throws `canon_fetch_failed: <reason>` on any failure mode.
 */
export async function fetchCanon(
  uri: string,
  knowledge_base_url?: string,
): Promise<CanonDoc> {
  const url = canonUriToUrl(uri, knowledge_base_url);
  const res = await fetch(url, {
    headers: {
      "user-agent": "agent-runtime/0.0.1",
    },
  });
  if (!res.ok) {
    throw new Error(
      `canon_fetch_failed: HTTP ${res.status} for ${uri} (${url})`,
    );
  }
  const body = await res.text();
  return { uri, url, body };
}
