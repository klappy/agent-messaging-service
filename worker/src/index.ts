import { createAccount } from "./accounts";
import { authenticate } from "./auth";
import { createConversation } from "./conversations";
import { homepageHeadResponse, homepageResponse } from "./homepage";
import type { Env } from "./types";
import { errorResponse, jsonResponse } from "./util";

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
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // Homepage — POC marketing surface served by the same Worker so the page
    // is genuinely same-origin with the API it demonstrates. Day 1 scope add;
    // does not modify the SPEC §3.1 smoke surface (accounts + conversations).
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

    // POST /v1/{namespace}/conversations
    const convMintMatch = path.match(/^\/v1\/([^/]+)\/conversations\/?$/);
    if (method === "POST" && convMintMatch) {
      const ns = convMintMatch[1]!;
      const account = await authenticate(req, env);
      if (account instanceof Response) return account;
      return createConversation(req, env, account, ns);
    }

    return errorResponse(404, "not_found", `No route for ${method} ${path}.`);
  },
};
