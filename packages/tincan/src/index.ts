import {
  negotiateAccept,
  renderBootstrapJson,
  renderBootstrapMarkdown,
} from "./bootstrap";
import { homepageHeadResponse, homepageResponse } from "./homepage";
import { mintPageResponse } from "./mint";
import { portalResponse } from "./portal";
import type { ConvRecord, Env } from "./types";

const AMS_BASE = "https://ams.truthkit.ai";
const TINCAN_BASE = "https://tincan.truthkit.ai";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // Homepage — intro, link to /tincan
    if ((method === "GET" || method === "HEAD") && (path === "/" || path === "/index.html")) {
      return method === "HEAD" ? homepageHeadResponse() : homepageResponse();
    }

    // Mint page — configure and mint a conversation
    if (method === "GET" && path === "/tincan") {
      return mintPageResponse();
    }

    // Same-origin proxy for the mint control-plane call. AMS's /v1/* is
    // intentionally same-origin only (no CORS), so the browser cannot POST
    // cross-origin from tincan.truthkit.ai → ams.truthkit.ai. We proxy via
    // the service binding instead — zero network hop, no preflight needed.
    const v1MintMatch = path.match(/^\/v1\/([^/]+)\/conversations\/?$/);
    if (method === "POST" && v1MintMatch) {
      return proxyV1ToAms(req, env, url);
    }

    // Same-origin proxy for account creation. Same CORS rationale as above.
    if (method === "POST" && path === "/v1/accounts") {
      return proxyV1ToAms(req, env, url);
    }

    // Portal route — /{ns}/conversations/{alias}?t=<permissive>
    // Per ams://canon/decisions/D0025 and D0026:
    //   Browser GET → conversation portal HTML (history, live stream, send surface)
    //   AI fetch (markdown / JSON Accept) → canon-rendered bootstrap per
    //     ams://canon/constraints/portal-bootstrap-content
    //   MCP POST / SSE GET → proxy to AMS via service binding (D0023 compliance)
    const convAliasMatch = path.match(/^\/([^/]+)\/conversations\/([^/]+)\/?$/);
    if (convAliasMatch) {
      const ns = convAliasMatch[1]!;
      const alias = convAliasMatch[2]!;
      const permissive = url.searchParams.get("t");

      if (method === "GET" || method === "HEAD") {
        const isMcpSse =
          req.headers.get("mcp-session-id") !== null ||
          (req.headers.get("accept") ?? "").toLowerCase().includes("text/event-stream");

        if (isMcpSse && method === "GET") {
          // SSE leg of MCP transport — proxy to AMS
          return proxyToAms(req, env, url);
        }

        if (method === "HEAD") {
          return new Response(null, { headers: { "content-type": "text/html;charset=UTF-8" } });
        }

        // Browser/AI GET — content-negotiated bootstrap.
        if (!permissive) {
          return new Response("Missing permissive token.", { status: 400 });
        }

        // AMS magic link — same path on the AMS host. MCP clients POST here.
        const amsMagicLink = AMS_BASE + path + "?t=" + permissive;
        const tincanMagicLink = TINCAN_BASE + path + "?t=" + permissive;

        // Server-side fetch of the conversation record via the AMS service
        // binding. Required for every render path: HTML uses it for the
        // embedded bootstrap, markdown/JSON use it directly.
        const record = await fetchConversationRecord(env, ns, alias, permissive);
        if (!record) {
          return jsonError(404, "conversation_not_found", "No conversation matched the magic-link path or the permissive token did not validate.");
        }

        const shape = negotiateAccept(
          req.headers.get("accept") ?? "",
          req.headers.get("user-agent") ?? "",
        );

        if (shape === "json") {
          const body = await renderBootstrapJson({
            record,
            amsMagicLink,
            tincanUrl: tincanMagicLink,
          });
          return new Response(JSON.stringify(body, null, 2), {
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        }
        if (shape === "markdown") {
          const md = await renderBootstrapMarkdown({
            record,
            amsMagicLink,
            tincanUrl: tincanMagicLink,
          });
          return new Response(md, {
            headers: { "content-type": "text/markdown; charset=utf-8" },
          });
        }
        // Browser → full HTML portal with the canon-rendered bootstrap
        // embedded as a visually-hidden but AI-readable <pre> block.
        return portalResponse({
          namespace: ns,
          alias,
          permissive,
          magicLink: tincanMagicLink,
          amsMagicLink,
          record,
        });
      }

      if (method === "POST" || method === "DELETE" || method === "OPTIONS") {
        // MCP transport — proxy to AMS via service binding
        return proxyToAms(req, env, url);
      }
    }

    return new Response(JSON.stringify({ error: "not_found", path }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  },
};

// Proxy MCP POST / SSE GET / DELETE / OPTIONS to AMS Worker via service binding.
// Service bindings are same-process Cloudflare calls — zero network hop, no egress.
// Rewrites the URL from tincan.truthkit.ai to ams.truthkit.ai preserving path + query.
async function proxyToAms(req: Request, env: Env, url: URL): Promise<Response> {
  const amsUrl = new URL(AMS_BASE + url.pathname + url.search);
  const proxied = new Request(amsUrl.toString(), {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
  return env.AMS.fetch(proxied);
}

// Same-origin proxy for /v1/* control-plane calls (e.g. POST /v1/{ns}/conversations).
// AMS does not allow CORS on /v1/*, so the browser cannot call it cross-origin
// from tincan.truthkit.ai. Proxying via the service binding avoids the preflight.
async function proxyV1ToAms(req: Request, env: Env, url: URL): Promise<Response> {
  const amsUrl = new URL(AMS_BASE + url.pathname + url.search);
  const proxied = new Request(amsUrl.toString(), {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
  return env.AMS.fetch(proxied);
}

// Fetch the AMS conversation record via service binding. Validates permissive
// token server-side as a side effect (AMS returns 403 if the token is wrong),
// so the portal never has to reach into KV directly.
async function fetchConversationRecord(
  env: Env,
  ns: string,
  alias: string,
  permissive: string,
): Promise<ConvRecord | null> {
  const amsUrl = `${AMS_BASE}/v1/${ns}/conversations/${alias}?t=${encodeURIComponent(permissive)}`;
  const res = await env.AMS.fetch(new Request(amsUrl, { method: "GET" }));
  if (!res.ok) return null;
  try {
    return (await res.json()) as ConvRecord;
  } catch {
    return null;
  }
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
