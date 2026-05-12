// Audit-gate runtime — Durable Object hosting the AMS canon-code-sync audit
// session. Instantiates the persona-shaped-agent-runtime contract per
// klappy://canon/methods/persona-shaped-agent-runtime for the persona
// ams://canon/personas/ams-canon-code-auditor.
//
// Phase 2 of AUDIT-GATE-RUNTIME-MIGRATION-PLAN.md — substrate scaffold with
// a local-only test endpoint. The five responsibilities (resolve profile,
// enforce role, run one-shot session, honor agent engagement, apply surface
// post-processing) are implemented with the runtime acting as an oddkit MCP
// CLIENT — the persona profile declares mcp_servers.operational: [oddkit],
// so the runtime resolves canon URIs via oddkit_get rather than bypassing
// the URI scheme with raw GitHub fetches.
//
// Agent inference is stubbed; Phase 3 wires the real Anthropic + oddkit MCP
// integration on the *agent session's* side alongside side-by-side validation.
// The Phase 2 oddkit client is used by the RUNTIME for profile resolution,
// not by the agent session itself. The two MCP wirings are separate concerns:
//   - Runtime → oddkit  (this file, Phase 2): resolve persona profile + system
//     prompt URI to produce the session's bootstrap. Stateless tool calls.
//   - Agent session → oddkit  (Phase 3): the agent has oddkit MCP wired into
//     its operational tool surface for canon lookups DURING the audit.
//
// One DO instance per audit invocation, keyed by head_sha at the route layer.
// Fresh-context guarantee per klappy://canon/principles/verification-requires-
// fresh-context is satisfied by the keying: a new head_sha produces a new DO
// instance with no inherited state. The DO hibernates after fetch() returns
// and eventually dies — session_type=one_shot per
// klappy://canon/methods/spawned-agent-session-runtime-contract §Composition
// Rules.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { parse as parseYaml } from "yaml";
import type { Env } from "../types";
import { base64ToUtf8, errorResponse, utf8ToBase64 } from "../util";

// --- Persona-profile schema ----------------------------------------------
// Per klappy://canon/methods/persona-shaped-agent-runtime §The Persona Profile.
// The seven-value role enum is per
// klappy://canon/methods/spawned-agent-session-runtime-contract §Role.

export type PersonaRole =
  | "explorer"
  | "planner"
  | "builder"
  | "validator"
  | "resolver"
  | "general"
  | "observer";

export interface SurfaceProfile {
  density: "low" | "medium" | "high";
  structured_output: "required" | "optional" | "none";
  output_schema?: string;
  max_emissions_per_session?: number;
}

export interface PersonaProfile {
  persona: string;
  version: number;
  system_prompt_uri: string;
  role: PersonaRole;
  mcp_servers: {
    operational: string[];
    task_relevant: string[];
  };
  knowledge_bases: string[];
  surface_profiles: Record<string, SurfaceProfile>;
  brand_discipline: string | null;
}

// --- Audit invocation / verdict shapes -----------------------------------
// Output contract per ams://canon/constraints/canon-code-sync-via-spawned-
// agent-session §How the Audit Runs (the "Output contract." bullet — anchor
// at section since the bullet has no heading of its own).

export interface AuditInvocation {
  pr_owner: string;
  pr_repo: string;
  pr_number: number;
  head_sha: string;
}

export interface AuditVerdict {
  verdict: "PASS" | "FAIL";
  summary: string;
  comment_body_b64: string;
}

// --- Canon URIs and config ----------------------------------------------

const PERSONA_URI = "ams://canon/personas/ams-canon-code-auditor";
const PERSONA_KNOWLEDGE_BASE_URL =
  "https://github.com/klappy/agent-messaging-service";
const ODDKIT_MCP_URL = "https://oddkit.klappy.dev/mcp";

// --- Cache shape (SQLite-backed via DO state) ---------------------------
// Per klappy://canon/principles/cache-fetches-and-parses: cache both the
// fetch result and the parse result, keyed by content_hash. A new content_hash
// means the canon doc changed and the parse must be redone; same hash means
// reuse. The DO storage hosts the cache; eviction is implicit (each DO
// instance is keyed per head_sha and dies after one-shot).

interface CachedParsedProfile {
  content_hash: string;
  profile: PersonaProfile;
  parsed_at: string;
}

// --- The DO --------------------------------------------------------------

export class AuditGateDO {
  private env: Env;
  private state: DurableObjectState;
  // Lazy oddkit MCP client; reused across calls within a single fetch().
  // Each DO invocation builds its own client; the DO hibernates between
  // invocations so there's no cross-request client reuse anyway.
  private oddkit: Client | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.env = env;
    this.state = state;
  }

  async fetch(req: Request): Promise<Response> {
    if (req.method !== "POST") {
      return errorResponse(405, "method_not_allowed", "audit-gate DO accepts POST only");
    }

    let invocation: AuditInvocation;
    try {
      const body = await req.json();
      if (!isValidInvocation(body)) {
        return errorResponse(400, "invalid_invocation",
          "body must be {pr_owner, pr_repo, pr_number, head_sha}");
      }
      invocation = body;
    } catch {
      return errorResponse(400, "invalid_json", "body must be JSON");
    }

    try {
      // Responsibility 1: resolve profile via oddkit MCP (NOT raw GitHub fetch)
      const profile = await this.resolvePersonaProfile();

      // Responsibility 2: enforce role
      this.enforceValidatorRole(profile);

      // Assemble the system prompt by fetching the system_prompt_uri canon
      // doc — also via oddkit, since the URI is canonical and oddkit owns
      // resolution. Same caching strategy.
      const systemPrompt = await this.assembleSystemPrompt(profile);

      // Responsibility 5 (one-shot) + 4 (agent engagement, no clarification)
      // PHASE 2 STUB: real Anthropic + agent-side MCP invocation deferred to
      // Phase 3. The stub exercises the post-processing code path.
      const rawResponse = await this.runAuditSession({
        invocation,
        profile,
        systemPrompt,
      });

      // Responsibility 3: surface post-processing — validate output JSON
      const verdict = this.parseAndValidateVerdict(rawResponse, profile);

      return new Response(JSON.stringify(verdict), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown_error";
      return errorResponse(500, "audit_failed", message);
    } finally {
      // Close the MCP transport so the DO can hibernate cleanly.
      if (this.oddkit) {
        try {
          await this.oddkit.close();
        } catch {
          // Best-effort; hibernation will collect anyway.
        }
        this.oddkit = null;
      }
    }
  }

  // --- oddkit MCP client (lazy) ------------------------------------------

  private async oddkitClient(): Promise<Client> {
    if (this.oddkit) return this.oddkit;
    const transport = new StreamableHTTPClientTransport(
      new URL(ODDKIT_MCP_URL),
    );
    const client = new Client(
      { name: "ams-audit-gate", version: "0.1.0" },
      { capabilities: {} },
    );
    await client.connect(transport);
    this.oddkit = client;
    return client;
  }

  /**
   * Fetch a canon document via oddkit_get. Returns the doc's content and
   * its content_hash so the caller can cache and re-use across invocations
   * keyed by hash. Per klappy://canon/principles/cache-fetches-and-parses,
   * both the fetch result and downstream parse results should be cached
   * against content_hash.
   */
  private async oddkitGet(args: {
    uri: string;
    knowledge_base_url?: string;
  }): Promise<{ content: string; content_hash: string; path: string }> {
    const client = await this.oddkitClient();
    const callArgs: Record<string, string> = { input: args.uri };
    if (args.knowledge_base_url) {
      callArgs.knowledge_base_url = args.knowledge_base_url;
    }
    const result = await client.callTool({
      name: "oddkit_get",
      arguments: callArgs,
    });
    // oddkit wraps its action response inside MCP's text-content block. The
    // top-level result.content is an array of {type, text} blocks; the first
    // text block carries the JSON-encoded oddkit response.
    const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
    if (!Array.isArray(content) || content.length === 0) {
      throw new Error(`oddkit_get_empty_response: ${args.uri}`);
    }
    const textBlock = content.find((c) => c.type === "text" && typeof c.text === "string");
    if (!textBlock || !textBlock.text) {
      throw new Error(`oddkit_get_no_text_block: ${args.uri}`);
    }
    let parsed: { action?: string; result?: { error?: string; path?: string; content?: string; content_hash?: string } };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      throw new Error(`oddkit_get_unparseable_response: ${args.uri}`);
    }
    if (!parsed.result) {
      throw new Error(`oddkit_get_no_result: ${args.uri}`);
    }
    if (parsed.result.error) {
      throw new Error(`oddkit_get_error: ${parsed.result.error} (uri=${args.uri}, resolved_path=${parsed.result.path ?? "?"})`);
    }
    if (typeof parsed.result.content !== "string" || typeof parsed.result.content_hash !== "string") {
      throw new Error(`oddkit_get_malformed_result: ${args.uri}`);
    }
    return {
      content: parsed.result.content,
      content_hash: parsed.result.content_hash,
      path: parsed.result.path ?? "",
    };
  }

  // --- Responsibility 1: Resolve persona profile -------------------------
  // Fetch the persona doc via oddkit, extract the embedded YAML profile
  // block, parse it. Cache the parsed profile by content_hash so subsequent
  // audits at the same head_sha (rare; DOs are usually one-shot per head_sha
  // but the SDK may invoke fetch() more than once if a retry occurs) skip
  // the parse. Per klappy://canon/methods/persona-shaped-agent-runtime
  // §The Runtime's Job.

  private async resolvePersonaProfile(): Promise<PersonaProfile> {
    // Step 1: fetch via oddkit_get
    const doc = await this.oddkitGet({
      uri: PERSONA_URI,
      knowledge_base_url: PERSONA_KNOWLEDGE_BASE_URL,
    });

    // Step 2: check parsed-profile cache
    const cached = await this.state.storage.get<CachedParsedProfile>(
      `parsed-profile:${PERSONA_URI}`,
    );
    if (cached && cached.content_hash === doc.content_hash) {
      return cached.profile;
    }

    // Step 3: parse the YAML profile block out of the markdown body
    const profile = parsePersonaFromMarkdown(doc.content);

    // Step 4: sanity check — URI we asked for should match the persona's
    // self-declared identity.
    if (profile.persona !== "ams-canon-code-auditor") {
      throw new Error(
        `persona_identity_mismatch: profile.persona='${profile.persona}', expected 'ams-canon-code-auditor' from ${PERSONA_URI}`,
      );
    }

    // Step 5: cache the parsed result keyed by content_hash
    await this.state.storage.put<CachedParsedProfile>(
      `parsed-profile:${PERSONA_URI}`,
      {
        content_hash: doc.content_hash,
        profile,
        parsed_at: new Date().toISOString(),
      },
    );

    return profile;
  }

  private async assembleSystemPrompt(profile: PersonaProfile): Promise<string> {
    // Resolve the system_prompt_uri via oddkit. Same caching strategy as
    // the persona profile — cache the doc by content_hash.
    const doc = await this.oddkitGet({
      uri: profile.system_prompt_uri,
      knowledge_base_url: PERSONA_KNOWLEDGE_BASE_URL,
    });

    // The system prompt assembly is per-invocation since it composes
    // profile-derived headers with the canon body. The parse result itself
    // (the markdown) is the canon body; only the wrapping needs assembly,
    // and that's microsecond-derivation work that
    // klappy://canon/principles/cache-fetches-and-parses explicitly does
    // not want cached.
    return [
      `You are the ${profile.persona} persona (version ${profile.version}).`,
      `Your role is: ${profile.role}.`,
      ``,
      `The following AMS canon constraint is your task definition. Read it carefully and follow it strictly. Your output must satisfy its Output contract.`,
      ``,
      `--- BEGIN ${profile.system_prompt_uri} ---`,
      doc.content,
      `--- END ${profile.system_prompt_uri} ---`,
    ].join("\n");
  }

  // --- Responsibility 2: Enforce role -----------------------------------
  // Validator role: read-only, fresh-context, structured-output required.

  private enforceValidatorRole(profile: PersonaProfile): void {
    if (profile.role !== "validator") {
      throw new Error(
        `role_mismatch: persona profile declares role='${profile.role}', this DO only hosts validator sessions`,
      );
    }
    // Mutating-tool filtering happens at tool-list assembly. Phase 2 has no
    // tool list yet on the agent-session side (inference is stubbed); the
    // filter lives in Phase 3.
    //
    // Fresh-context guarantee is satisfied by route-layer keying: a new
    // head_sha produces a new DO instance.
  }

  // --- Responsibility 5: Run one-shot session ---------------------------
  // Responsibility 4 (agent engagement): no clarifying questions, fail closed.
  //
  // PHASE 2 STUB. Phase 3 replaces this with the real Anthropic Messages API
  // call carrying:
  //   - system: ctx.systemPrompt
  //   - messages: the audit task (PR coordinates + the diff against main)
  //   - mcp_servers: profile.mcp_servers.operational → [{name: "oddkit",
  //     url: ODDKIT_MCP_URL}] (the AGENT's MCP wiring, separate from the
  //     RUNTIME's oddkit client used above for profile resolution)
  //   - tools: GitHub read-only tools per task_relevant config (added by
  //     the dispatcher/route layer, not by the persona — see migration
  //     plan §A trigger wiring)
  // The response is streamed; the final fenced JSON block is the verdict.

  private async runAuditSession(ctx: {
    invocation: AuditInvocation;
    profile: PersonaProfile;
    systemPrompt: string;
  }): Promise<string> {
    // Synthetic response that exercises the post-processing code path. The
    // shape is the real output contract so parseAndValidateVerdict() runs
    // unchanged when Phase 3 swaps in real inference.
    const stubVerdict: AuditVerdict = {
      verdict: "PASS",
      summary: `Phase 2 substrate stub — persona '${ctx.profile.persona}' v${ctx.profile.version} resolved via oddkit_get, prompt assembled (${ctx.systemPrompt.length} chars), no inference yet. PR ${ctx.invocation.pr_owner}/${ctx.invocation.pr_repo}#${ctx.invocation.pr_number} at ${ctx.invocation.head_sha.slice(0, 8)}.`,
      comment_body_b64: utf8ToBase64(
        [
          `## Canon-Code Sync Audit — Substrate Scaffold (Phase 2 Stub)`,
          ``,
          `**Verdict:** PASS *(stub — agent inference deferred to Phase 3)*`,
          ``,
          `**Persona:** \`${ctx.profile.persona}\` v${ctx.profile.version}`,
          `**Role:** ${ctx.profile.role}`,
          `**System prompt URI:** \`${ctx.profile.system_prompt_uri}\``,
          `**System prompt length:** ${ctx.systemPrompt.length} chars`,
          ``,
          `**PR:** ${ctx.invocation.pr_owner}/${ctx.invocation.pr_repo} #${ctx.invocation.pr_number}`,
          `**Head SHA:** \`${ctx.invocation.head_sha}\``,
          ``,
          `---`,
          ``,
          `This response exercises the substrate path: oddkit MCP client ` +
            `connection, persona resolution via \`oddkit_get\` against ` +
            `\`${PERSONA_URI}\`, system-prompt assembly via \`oddkit_get\` ` +
            `against the system_prompt_uri, role enforcement, output-contract ` +
            `validation, one-shot DO lifecycle, content-hash-keyed parse ` +
            `caching per \`klappy://canon/principles/cache-fetches-and-parses\`. ` +
            `Real Anthropic + agent-side oddkit MCP inference lands in Phase 3.`,
        ].join("\n"),
      ),
    };
    return "```json\n" + JSON.stringify(stubVerdict, null, 2) + "\n```";
  }

  // --- Responsibility 3: Apply surface post-processing ------------------

  private parseAndValidateVerdict(raw: string, profile: PersonaProfile): AuditVerdict {
    const audit = profile.surface_profiles.audit;
    if (!audit) {
      throw new Error("no_audit_surface_profile_in_persona");
    }
    if (audit.structured_output !== "required") {
      throw new Error(
        `audit_surface_structured_output_not_required: got '${audit.structured_output}', expected 'required'`,
      );
    }

    // Extract the final fenced JSON block. Per the output contract in the AMS
    // constraint, the session terminates after the verdict block; if more
    // appear later (model overshoots), the final one wins.
    const matches = Array.from(raw.matchAll(/```json\s*\n([\s\S]*?)\n```/g));
    if (matches.length === 0) {
      throw new Error("no_fenced_json_block_in_response");
    }
    const lastBlock = matches[matches.length - 1]![1]!;

    let parsed: unknown;
    try {
      parsed = JSON.parse(lastBlock);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      throw new Error(`malformed_json_in_fenced_block: ${message}`);
    }

    if (!isValidVerdict(parsed)) {
      throw new Error(
        "verdict_shape_invalid: expected {verdict: PASS|FAIL, summary: string, comment_body_b64: string}",
      );
    }

    // Validate comment_body_b64 decodes cleanly (catch corruption early).
    try {
      base64ToUtf8(parsed.comment_body_b64);
    } catch {
      throw new Error("comment_body_b64_invalid_base64");
    }

    return parsed;
  }
}

// --- Helpers ------------------------------------------------------------

function isValidInvocation(v: unknown): v is AuditInvocation {
  if (!v || typeof v !== "object") return false;
  const i = v as Record<string, unknown>;
  return (
    typeof i.pr_owner === "string" &&
    i.pr_owner.length > 0 &&
    typeof i.pr_repo === "string" &&
    i.pr_repo.length > 0 &&
    typeof i.pr_number === "number" &&
    Number.isInteger(i.pr_number) &&
    i.pr_number > 0 &&
    typeof i.head_sha === "string" &&
    /^[0-9a-f]{40}$/i.test(i.head_sha)
  );
}

function isValidVerdict(v: unknown): v is AuditVerdict {
  if (!v || typeof v !== "object") return false;
  const x = v as Record<string, unknown>;
  return (
    (x.verdict === "PASS" || x.verdict === "FAIL") &&
    typeof x.summary === "string" &&
    typeof x.comment_body_b64 === "string"
  );
}

// --- Persona-profile extraction from markdown ---------------------------
// The persona profile lives in a ```yaml fenced block under the `## The
// Profile` heading in the persona canon doc. Extract the block, parse with
// the `yaml` npm dep (battle-tested, no transitive deps, MIT). The handle-
// rolled YAML parser from PR #80 is gone — it duplicated what `yaml`
// provides for free, deterministically, with edge-case coverage.

export function parsePersonaFromMarkdown(md: string): PersonaProfile {
  const blockMatch = md.match(/^##\s+The Profile[\s\S]*?```yaml\s*\n([\s\S]*?)\n```/m);
  if (!blockMatch || !blockMatch[1]) {
    throw new Error("persona_yaml_block_not_found_under_the_profile_heading");
  }
  const raw = parseYaml(blockMatch[1]);
  return assertPersonaShape(raw);
}

function assertPersonaShape(raw: unknown): PersonaProfile {
  if (!raw || typeof raw !== "object") {
    throw new Error("persona_yaml_not_object");
  }
  const o = raw as Record<string, unknown>;
  const persona = expectString(o, "persona");
  const version = expectNumber(o, "version");
  const system_prompt_uri = expectString(o, "system_prompt_uri");
  const role = expectString(o, "role") as PersonaRole;
  if (!isValidRole(role)) {
    throw new Error(`invalid_role: '${role}' not in seven-value enum`);
  }
  const mcpRaw = expectObject(o, "mcp_servers");
  const mcp_servers = {
    operational: expectStringArrayOrEmpty(mcpRaw, "operational"),
    task_relevant: expectStringArrayOrEmpty(mcpRaw, "task_relevant"),
  };
  const knowledge_bases = expectStringArrayOrEmpty(o, "knowledge_bases");
  const surfacesRaw = expectObject(o, "surface_profiles");
  const surface_profiles: Record<string, SurfaceProfile> = {};
  for (const [name, val] of Object.entries(surfacesRaw)) {
    if (!val || typeof val !== "object") {
      throw new Error(`surface_profile.${name}_not_object`);
    }
    const sObj = val as Record<string, unknown>;
    surface_profiles[name] = {
      density: expectString(sObj, "density") as SurfaceProfile["density"],
      structured_output: expectString(sObj, "structured_output") as SurfaceProfile["structured_output"],
      output_schema: optionalString(sObj, "output_schema"),
      max_emissions_per_session: optionalNumber(sObj, "max_emissions_per_session"),
    };
  }
  const brand_discipline = (() => {
    const v = o.brand_discipline;
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") throw new Error("brand_discipline_not_string_or_null");
    return v;
  })();
  return {
    persona,
    version,
    system_prompt_uri,
    role,
    mcp_servers,
    knowledge_bases,
    surface_profiles,
    brand_discipline,
  };
}

function isValidRole(r: string): r is PersonaRole {
  return (
    r === "explorer" ||
    r === "planner" ||
    r === "builder" ||
    r === "validator" ||
    r === "resolver" ||
    r === "general" ||
    r === "observer"
  );
}

function expectString(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== "string") throw new Error(`expected_string_at_${key}`);
  return v;
}

function expectNumber(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== "number") throw new Error(`expected_number_at_${key}`);
  return v;
}

function expectObject(o: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = o[key];
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`expected_object_at_${key}`);
  }
  return v as Record<string, unknown>;
}

function expectStringArrayOrEmpty(o: Record<string, unknown>, key: string): string[] {
  const v = o[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error(`expected_array_at_${key}`);
  for (const item of v) {
    if (typeof item !== "string") throw new Error(`array_${key}_contains_non_string`);
  }
  return v as string[];
}

function optionalString(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new Error(`expected_string_or_null_at_${key}`);
  return v;
}

function optionalNumber(o: Record<string, unknown>, key: string): number | undefined {
  const v = o[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number") throw new Error(`expected_number_or_null_at_${key}`);
  return v;
}
