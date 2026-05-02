import { createAccount } from "./accounts";
import { authenticate } from "./auth";
import { createConversation } from "./conversations";
import type { Env } from "./types";
import { errorResponse, jsonResponse } from "./util";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // Health probe — POC-INFRA §13. Both ams.klappy.dev and ams.truthkit.ai
    // must answer 200 here per D0011.
    if (method === "GET" && path === "/healthz") {
      return jsonResponse({
        ok: true,
        host: req.headers.get("host"),
        ts: new Date().toISOString(),
      });
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
