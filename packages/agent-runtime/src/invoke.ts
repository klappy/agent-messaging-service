// The runtime's main primitive: invoke(invocation) → result.
//
// Single direction. No orchestration of multi-session workflows. The
// caller is responsible for chaining sessions (validator → resolver
// → re-validate) if a workflow needs that.
//
// Pipeline:
//   1. Resolve persona profile via canon.
//   2. Compose system prompt (NOT injecting governance bodies).
//   3. Compose MCP server set (operational ∪ task_relevant).
//   4. Dispatch to substrate (Anthropic Messages API, streaming).
//   5. Post-process output per surface.
//   6. Return InvocationResult.
//
// Errors at any stage become a structured `failed` result with a named
// reason — never a raw 500. The Worker's global try/catch is a
// belt-and-suspenders backstop.

import { composeSystemPrompt } from "./prompt";
import { resolvePersona } from "./persona";
import {
  parseValidatorEmission,
  postProcessCommentMarkdown,
  postProcessValidatorOutput,
} from "./surface";
import {
  dispatchToSubstrate,
  SubstrateHttpError,
  SubstrateStreamError,
  type McpServerSpec,
} from "./substrate";
import type { Invocation, InvocationResult } from "./types";

interface InvokeEnv {
  ANTHROPIC_API_KEY: string;
  AGENT_RUNTIME_MODEL?: string;
}

export async function invoke(invocation: Invocation, env: InvokeEnv): Promise<InvocationResult> {
  const session_id = crypto.randomUUID();
  const started_at = new Date().toISOString();

  // --- 1. Resolve persona profile -----------------------------------------
  let profile;
  try {
    profile = await resolvePersona(invocation.persona);
  } catch (err) {
    return failedResult(invocation, session_id, started_at, "persona_resolution_failed", err);
  }

  // --- 2. Compose system prompt -------------------------------------------
  let prompt;
  try {
    prompt = await composeSystemPrompt(profile, invocation);
  } catch (err) {
    return failedResult(invocation, session_id, started_at, "prompt_composition_failed", err);
  }

  // --- 3. Compose MCP server set ------------------------------------------
  // operational ∪ task_relevant per canon §Operational vs task-relevant
  // MCP servers. The runtime MUST NOT strip operational servers as
  // "unrelated to the task" — that would break personas like Oddie
  // who use the methodology on themselves.
  const mcpServers = composeMcpServers(profile.mcp_servers.operational, [
    ...profile.mcp_servers.task_relevant,
    ...(invocation.task_relevant_mcps ?? []),
  ]);

  // --- 4. Dispatch to substrate -------------------------------------------
  let response;
  try {
    response = await dispatchToSubstrate({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.AGENT_RUNTIME_MODEL,
      systemPrompt: prompt.system,
      userMessage: invocation.task,
      mcpServers,
    });
  } catch (err) {
    if (err instanceof SubstrateHttpError) {
      return failedResult(invocation, session_id, started_at, `substrate_http_${err.status}`, err);
    }
    if (err instanceof SubstrateStreamError) {
      return failedResult(invocation, session_id, started_at, `substrate_stream_${err.errorType}`, err);
    }
    return failedResult(invocation, session_id, started_at, "substrate_dispatch_failed", err);
  }

  // --- 5. Post-process output per surface ---------------------------------
  // v1 only handles validator/audit. checkV1Scope in index.ts guarantees
  // we never reach here outside that combination.
  const voiceMode = invocation.voice_mode ?? "persona";
  let validatorOutput;
  try {
    const parsed = parseValidatorEmission(response.text);
    validatorOutput = postProcessValidatorOutput(parsed, voiceMode);
  } catch (err) {
    // Output schema violation. Per canon §validator, "A finding without
    // disposition is rejected as incomplete." We surface this as a
    // 'failed' result rather than fabricating a verdict — the caller
    // sees explicitly that the agent's emission did not satisfy the
    // contract.
    return failedResult(invocation, session_id, started_at, "validator_output_schema_failed", err, {
      raw_text: response.text.slice(0, 4000),
    });
  }

  // --- 6. Return result ---------------------------------------------------
  const completed_at = new Date().toISOString();
  return {
    status: "completed",
    meta: {
      session_id,
      persona: invocation.persona,
      mode: invocation.mode,
      role: invocation.role,
      surface: invocation.surface,
      engagement: invocation.engagement,
      started_at,
      completed_at,
    },
    output: validatorOutput,
    comment_markdown: postProcessCommentMarkdown(
      renderValidatorMarkdown(validatorOutput, profile.persona, response.attempts, response.stopReason),
      voiceMode,
    ),
  };
}

// --- MCP server composition ------------------------------------------------

/**
 * Convert a list of MCP server URIs/URLs to McpServerSpec records.
 *
 * Persona profiles declare MCP servers by short name (e.g., "oddkit").
 * The runtime maps known names to their canonical endpoints. Unknown
 * names that look like URLs are passed through as-is; everything else
 * is skipped with a console warning.
 */
function composeMcpServers(operational: string[], taskRelevant: string[]): McpServerSpec[] {
  const seen = new Set<string>();
  const out: McpServerSpec[] = [];
  for (const ref of [...operational, ...taskRelevant]) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    const spec = resolveMcpReference(ref);
    if (spec) {
      out.push(spec);
    } else {
      console.warn("mcp_server_unknown_reference", { ref });
    }
  }
  return out;
}

const KNOWN_MCP_SERVERS: Record<string, string> = {
  oddkit: "https://oddkit.klappy.dev/mcp",
};

function resolveMcpReference(ref: string): McpServerSpec | null {
  if (ref in KNOWN_MCP_SERVERS) {
    return { name: ref, url: KNOWN_MCP_SERVERS[ref]! };
  }
  if (ref.startsWith("https://") || ref.startsWith("http://")) {
    // Anonymous URL — derive a short name from the host.
    let name = "mcp";
    try {
      const u = new URL(ref);
      name = u.hostname.split(".")[0] ?? "mcp";
    } catch {
      // ignore
    }
    return { name, url: ref };
  }
  return null;
}

// --- Helpers ----------------------------------------------------------------

function failedResult(
  invocation: Invocation,
  session_id: string,
  started_at: string,
  failure_reason: string,
  err: unknown,
  extra: Record<string, unknown> = {},
): InvocationResult {
  const message = err instanceof Error ? err.message : String(err);
  console.error("invoke_failed", {
    session_id,
    persona: invocation.persona,
    failure_reason,
    message,
    ...extra,
  });
  return {
    status: "failed",
    meta: {
      session_id,
      persona: invocation.persona,
      mode: invocation.mode,
      role: invocation.role,
      surface: invocation.surface,
      engagement: invocation.engagement,
      started_at,
      completed_at: new Date().toISOString(),
      failure_reason: `${failure_reason}: ${message}`,
    },
    output: null,
  };
}

function renderValidatorMarkdown(
  output: { verdict: string; findings: ReadonlyArray<{ kind: string; location: string; severity: string; disposition: string; description: string; evidence_uri?: string }>; summary: { total: number; by_disposition: Record<string, number>; by_severity: Record<string, number> } },
  personaName: string,
  attempts: number,
  stopReason: string | null,
): string {
  const verdictBadge =
    output.verdict === "pass" ? "✅ PASS" : output.verdict === "fail" ? "🔴 FAIL" : "🟡 NEEDS HUMAN REVIEW";

  const lines: string[] = [
    `## ${personaName} verdict: ${verdictBadge}`,
    ``,
    `- Total findings: ${output.summary.total}`,
    `- By severity: ${formatCounts(output.summary.by_severity)}`,
    `- By disposition: ${formatCounts(output.summary.by_disposition)}`,
    `- Attempts: ${attempts + 1}; stop_reason: ${stopReason ?? "(none)"}`,
    ``,
  ];

  if (output.findings.length === 0) {
    lines.push(`_No findings._`);
    return lines.join("\n");
  }

  lines.push(`### Findings`);
  for (const f of output.findings) {
    const severityBadge =
      f.severity === "blocker" ? "🔴" : f.severity === "finding" ? "⚠️" : "🟡";
    lines.push(
      ``,
      `**${severityBadge} ${f.kind}** at \`${f.location}\` — disposition: \`${f.disposition}\``,
      f.description,
    );
    if (f.evidence_uri) lines.push(`Evidence: \`${f.evidence_uri}\``);
  }
  return lines.join("\n");
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  if (entries.length === 0) return "(none)";
  return entries.map(([k, v]) => `${v} ${k}`).join(", ");
}
