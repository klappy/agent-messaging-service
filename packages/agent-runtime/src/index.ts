// HTTP entry point for the persona-shaped agent runtime.
//
// One substantive endpoint: POST /v1/invoke. Body is an Invocation
// (src/types.ts). Response is an InvocationResult or a structured
// error envelope.
//
// v1 scope per klappy://canon/methods/persona-shaped-agent-runtime
// §First Worked Examples deployment sequence:
//   - Implemented:   role=validator, surface=audit, engagement=agent,
//                    mode=validation.
//   - Refused:       all other combinations, with refusal_reason naming
//                    the canon section that gates each.
//
// Operational routes (/healthz, /version) for visibility. Nothing else.

import { invoke } from "./invoke";
import type { Invocation, InvocationResult } from "./types";

interface Env {
  ANTHROPIC_API_KEY: string;
  AGENT_RUNTIME_MODEL?: string;
}

export default {
  async fetch(
    req: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    // Global try/catch so any uncaught throw becomes a structured 500
    // envelope rather than Cloudflare's raw error code 1101 page. This
    // was a real failure mode on the previous handrolled audit-gate.
    try {
      return await routeRequest(req, env);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown_error";
      const stack = err instanceof Error ? (err.stack ?? "") : "";
      console.error("runtime_unhandled_throw", {
        url: req.url,
        method: req.method,
        message,
        stack: stack.split("\n").slice(0, 8).join("\n"),
      });
      return jsonError(500, "runtime_unhandled_throw", message);
    }
  },
};

async function routeRequest(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (method === "GET" && path === "/healthz") {
    return new Response("ok\n", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  if (method === "GET" && path === "/version") {
    return jsonResponse(200, {
      service: "agent-runtime",
      version: "0.0.1",
      implements: [
        "klappy://canon/methods/persona-shaped-agent-runtime",
        "klappy://canon/methods/spawned-agent-session-runtime-contract",
      ],
      v1_supported: {
        mode: ["validation"],
        role: ["validator"],
        surface: ["audit"],
        engagement: ["agent"],
      },
    });
  }

  if (method === "POST" && path === "/v1/invoke") {
    return await handleInvoke(req, env);
  }

  return jsonError(404, "not_found", `No route for ${method} ${path}.`);
}

async function handleInvoke(req: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = parseInvocation(body);
  if (!parsed.ok) return jsonError(400, "invalid_invocation", parsed.error);
  const invocation = parsed.invocation;

  // v1 supports validator/audit/agent/validation only. Other
  // combinations are refused at submit time with a named reason.
  // Shipping the full runtime in one PR is the failure mode the canon
  // §Confidence section warns about.
  const unsupported = checkV1Scope(invocation);
  if (unsupported) {
    const now = new Date().toISOString();
    const result: InvocationResult = {
      status: "refused",
      meta: {
        session_id: crypto.randomUUID(),
        persona: invocation.persona,
        mode: invocation.mode,
        role: invocation.role,
        surface: invocation.surface,
        engagement: invocation.engagement,
        started_at: now,
        completed_at: now,
        refusal_reason: unsupported,
      },
      output: null,
    };
    return jsonResponse(400, result);
  }

  if (!env.ANTHROPIC_API_KEY) {
    return jsonError(
      500,
      "missing_secret",
      "ANTHROPIC_API_KEY is not configured on this worker. " +
        "Set it via `wrangler secret put ANTHROPIC_API_KEY`.",
    );
  }

  const result = await invoke(invocation, {
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    AGENT_RUNTIME_MODEL: env.AGENT_RUNTIME_MODEL,
  });

  const status = result.status === "completed" ? 200 : 500;
  return jsonResponse(status, result);
}

// --- Invocation parsing -----------------------------------------------------

interface ParseOk {
  ok: true;
  invocation: Invocation;
}
interface ParseErr {
  ok: false;
  error: string;
}

function parseInvocation(body: unknown): ParseOk | ParseErr {
  if (!body || typeof body !== "object") {
    return err("body must be a JSON object");
  }
  const o = body as Record<string, unknown>;

  const persona = stringField(o, "persona");
  if (!persona) return err("missing required field: persona (canon URI)");

  const mode = stringField(o, "mode");
  if (!mode) return err("missing required field: mode");
  if (!isMode(mode)) {
    return err(
      `mode must be one of: exploration, planning, execution, validation, resolution; got ${JSON.stringify(mode)}`,
    );
  }

  const role = stringField(o, "role");
  if (!role) return err("missing required field: role");
  if (!isRole(role)) {
    return err(
      `role must be one of: explorer, planner, builder, validator, resolver, general, observer; got ${JSON.stringify(role)}`,
    );
  }

  const surface = stringField(o, "surface");
  if (!surface) return err("missing required field: surface");
  if (!isSurface(surface)) {
    return err(
      `surface must be one of: real-time-stream, audit, mentorship, sidebar-chat, code-output, synthesis-ledger, conversational, strategic-translation; got ${JSON.stringify(surface)}`,
    );
  }

  const engagement = stringField(o, "engagement");
  if (!engagement) return err("missing required field: engagement");
  if (engagement !== "assistant" && engagement !== "agent") {
    return err(
      `engagement must be 'assistant' or 'agent'; got ${JSON.stringify(engagement)}`,
    );
  }

  const task = stringField(o, "task");
  if (!task) return err("missing required field: task");

  const voice_mode = stringField(o, "voice_mode");
  if (
    voice_mode &&
    voice_mode !== "persona" &&
    voice_mode !== "neutral" &&
    voice_mode !== "strict"
  ) {
    return err(
      `voice_mode must be 'persona' | 'neutral' | 'strict'; got ${JSON.stringify(voice_mode)}`,
    );
  }

  return {
    ok: true,
    invocation: {
      persona,
      mode: mode as Invocation["mode"],
      role: role as Invocation["role"],
      surface: surface as Invocation["surface"],
      engagement: engagement as Invocation["engagement"],
      voice_mode: (voice_mode as Invocation["voice_mode"]) ?? "persona",
      task,
      handoff: (o.handoff as Invocation["handoff"]) ?? undefined,
      task_relevant_mcps: arrayOfStrings(o.task_relevant_mcps) ?? undefined,
      knowledge_base_url: stringField(o, "knowledge_base_url") ?? undefined,
    },
  };
}

function checkV1Scope(inv: Invocation): string | null {
  if (inv.role !== "validator") {
    return `v1 implements only role=validator (per klappy://canon/methods/persona-shaped-agent-runtime §First Worked Examples → "Audit Gate (validator, single-role)"). role=${inv.role} ships in a later deployment.`;
  }
  if (inv.surface !== "audit") {
    return `v1 implements only surface=audit. surface=${inv.surface} ships in a later deployment.`;
  }
  if (inv.engagement !== "agent") {
    return `v1 implements only engagement=agent. engagement=${inv.engagement} ships in a later deployment.`;
  }
  if (inv.mode !== "validation") {
    return `v1 implements only mode=validation (the canonical mode for role=validator). mode=${inv.mode} with role=validator is rejected per canon §Composition Rules.`;
  }
  return null;
}

// --- Tiny helpers -----------------------------------------------------------

function err(message: string): ParseErr {
  return { ok: false, error: message };
}

function stringField(
  o: Record<string, unknown>,
  key: string,
): string | null {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function arrayOfStrings(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  if (!v.every((x) => typeof x === "string")) return null;
  return v as string[];
}

function isMode(s: string): s is Invocation["mode"] {
  return (
    s === "exploration" ||
    s === "planning" ||
    s === "execution" ||
    s === "validation" ||
    s === "resolution"
  );
}

function isRole(s: string): s is Invocation["role"] {
  return (
    s === "explorer" ||
    s === "planner" ||
    s === "builder" ||
    s === "validator" ||
    s === "resolver" ||
    s === "general" ||
    s === "observer"
  );
}

function isSurface(s: string): s is Invocation["surface"] {
  return (
    s === "real-time-stream" ||
    s === "audit" ||
    s === "mentorship" ||
    s === "sidebar-chat" ||
    s === "code-output" ||
    s === "synthesis-ledger" ||
    s === "conversational" ||
    s === "strategic-translation"
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2) + "\n", {
    status,
    headers: { "content-type": "application/json" },
  });
}

function jsonError(status: number, error: string, message: string): Response {
  return jsonResponse(status, { error, message });
}
