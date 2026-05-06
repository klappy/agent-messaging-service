import { homepageHeadResponse, homepageResponse } from "./homepage";
import { mintPageResponse } from "./mint";
import { portalResponse } from "./portal";
import type { Env } from "./types";

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

    // Portal route — /{ns}/conversations/{alias}?t=<permissive>
    // Per ams://canon/decisions/D0025 and D0026:
    //   Browser GET → conversation portal (history, live stream, send surface)
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
          return proxyToAms(req, env, ns, alias, url);
        }

        if (method === "HEAD") {
          return new Response(null, { headers: { "content-type": "text/html;charset=UTF-8" } });
        }

        // Browser GET — serve the portal
        if (!permissive) {
          return new Response("Missing permissive token.", { status: 400 });
        }

        // AMS magic link — same path, AMS domain. MCP clients POST here directly.
        const amsMagicLink = AMS_BASE + path + "?t=" + permissive;
        const magicLink = TINCAN_BASE + path + "?t=" + permissive;

        return portalResponse({ namespace: ns, alias, permissive, magicLink, amsMagicLink });
      }

      if (method === "POST" || method === "DELETE" || method === "OPTIONS") {
        // MCP transport — proxy to AMS via service binding
        return proxyToAms(req, env, ns, alias, url);
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
async function proxyToAms(req: Request, env: Env, ns: string, alias: string, url: URL): Promise<Response> {
  const amsUrl = new URL(AMS_BASE + url.pathname + url.search);
  const proxied = new Request(amsUrl.toString(), {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
  return env.AMS.fetch(proxied);
}
