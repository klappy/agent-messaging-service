// Audit-gate runtime — Durable Object hosting the AMS canon-code-sync audit
// session. Instantiates the persona-shaped-agent-runtime contract per
// klappy://canon/methods/persona-shaped-agent-runtime for the single persona
// klappy://canon/methods/persona-shaped-agent-runtime declares the contract;
// ams://canon/personas/ams-canon-code-auditor is the profile this DO resolves.
//
// Phase 2 of AUDIT-GATE-RUNTIME-MIGRATION-PLAN.md — substrate scaffold with a
// local-only test endpoint. The five responsibilities (resolve profile,
// enforce role, run one-shot session, honor agent engagement, apply surface
// post-processing) are implemented structurally. Agent inference is stubbed;
// Phase 3 wires the real Anthropic + oddkit MCP integration alongside the
// side-by-side validation harness.
//
// One DO instance per audit invocation, keyed by head_sha at the route layer
// (worker/src/index.ts). Fresh-context guarantee per
// klappy://canon/principles/verification-requires-fresh-context is
// satisfied by the keying: a new head_sha produces a new DO instance with
// no inherited state. The DO hibernates after fetch() returns and
// eventually dies — session_type=one_shot per
// klappy://canon/methods/spawned-agent-session-runtime-contract §Composition Rules.

import { DurableObject } from "cloudflare:workers";

import type { Env } from "../types";
import { base64ToUtf8, utf8ToBase64 } from "../util";

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
// Output contract per ams://canon/constraints/canon-code-sync-via-spawned-agent-session
// §How the Audit Runs (the "Output contract." bullet — anchor at section
// since the bullet has no heading of its own; same disambiguation pattern as
// canon/personas/ams-canon-code-auditor.md §Field-by-Field Rationale records).

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

// --- Canon URIs and their HTTP-fetchable equivalents ---------------------
// The canon URIs are the durable references; the GitHub raw URLs are the
// substrate-side resolution mechanism for Phase 2. Phase 3 may swap to a
// canon-aware fetcher (oddkit_get) once MCP client wiring is in place.

const PERSONA_CANON_URI = "ams://canon/personas/ams-canon-code-auditor";
const PERSONA_RAW_URL =
  "https://raw.githubusercontent.com/klappy/agent-messaging-service/main/canon/personas/ams-canon-code-auditor.md";
const SYSTEM_PROMPT_RAW_URL =
  "https://raw.githubusercontent.com/klappy/agent-messaging-service/main/canon/constraints/canon-code-sync-via-spawned-agent-session.md";

// --- The DO --------------------------------------------------------------

export class AuditGateDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  override async fetch(req: Request): Promise<Response> {
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
      // Responsibility 1: resolve profile + assemble system prompt
      const profile = await this.resolvePersonaProfile();
      const systemPrompt = await this.assembleSystemPrompt(profile);

      // Responsibility 2: enforce role (validator → read-only, fresh context)
      // Fresh context is satisfied by route-layer keying (DO instance per head_sha).
      // Read-only tool restriction is structural in this DO: no mutation methods
      // are exposed; Phase 3's tool-list assembly will filter mutating MCP tools.
      this.enforceValidatorRole(profile);

      // Responsibility 5 (one-shot) + 4 (agent engagement, no clarification)
      // PHASE 2 STUB: real Anthropic + MCP invocation deferred to Phase 3.
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
    }
  }

  // --- Responsibility 1: Resolve persona profile -------------------------
  // Fetch the persona doc from canon, extract the embedded YAML profile block,
  // parse it into the typed PersonaProfile shape. Per
  // klappy://canon/methods/persona-shaped-agent-runtime §The Runtime's Job.

  private async resolvePersonaProfile(): Promise<PersonaProfile> {
    const res = await fetch(PERSONA_RAW_URL, {
      headers: { accept: "text/plain" },
    });
    if (!res.ok) {
      throw new Error(`persona_fetch_failed: ${res.status} ${res.statusText}`);
    }
    const md = await res.text();
    const profile = parsePersonaFromMarkdown(md);

    // Sanity check: the URI we just resolved should match the persona's
    // self-declared identity. Drift here means canon and substrate disagree.
    if (profile.persona !== "ams-canon-code-auditor") {
      throw new Error(
        `persona_identity_mismatch: profile.persona='${profile.persona}', expected 'ams-canon-code-auditor' from ${PERSONA_CANON_URI}`,
      );
    }
    return profile;
  }

  private async assembleSystemPrompt(profile: PersonaProfile): Promise<string> {
    // Phase 2 resolves system_prompt_uri via direct GitHub raw fetch. Phase 3
    // can route via oddkit_get if MCP client wiring lands first; per the
    // persona profile, knowledge_bases includes both klappy:// and ams://, but
    // the runtime does not need oddkit to fetch the *persona's own* system
    // prompt — that's an operational lookup, not a knowledge-base query.
    const res = await fetch(SYSTEM_PROMPT_RAW_URL, {
      headers: { accept: "text/plain" },
    });
    if (!res.ok) {
      throw new Error(`system_prompt_fetch_failed: ${res.status} ${res.statusText}`);
    }
    const constraintMd = await res.text();
    return [
      `You are the ${profile.persona} persona (version ${profile.version}).`,
      `Your role is: ${profile.role}.`,
      ``,
      `The following AMS canon constraint is your task definition. Read it carefully and follow it strictly. Your output must satisfy its Output contract.`,
      ``,
      `--- BEGIN ${profile.system_prompt_uri} ---`,
      constraintMd,
      `--- END ${profile.system_prompt_uri} ---`,
    ].join("\n");
  }

  // --- Responsibility 2: Enforce role -----------------------------------
  // Validator role: read-only, fresh-context, structured-output required.
  // Per klappy://canon/methods/spawned-agent-session-runtime-contract §Role.

  private enforceValidatorRole(profile: PersonaProfile): void {
    if (profile.role !== "validator") {
      throw new Error(
        `role_mismatch: persona profile declares role='${profile.role}', this DO only hosts validator sessions`,
      );
    }
    // Mutating-tool filtering happens at tool-list assembly. Phase 2 has no
    // tool list yet (inference is stubbed); the filter lives in Phase 3.
    //
    // Fresh-context guarantee is satisfied by the route-layer keying — a new
    // head_sha produces a new DO instance with no inherited state. The DO's
    // SQLite is empty; this method body holds no state across invocations.
  }

  // --- Responsibility 5: Run one-shot session ---------------------------
  // Responsibility 4 (agent engagement): no clarifying questions, fail closed
  // on stuck, no operator-in-loop semantics.
  //
  // PHASE 2 STUB. Phase 3 replaces this with the real Anthropic Messages API
  // call carrying:
  //   - system: ctx.systemPrompt
  //   - messages: the audit task (PR coordinates + the diff against main)
  //   - mcp_servers: profile.mcp_servers.operational → [{name: "oddkit", url: ...}]
  //   - tools: GitHub read-only tools per task_relevant config (added by the
  //     dispatcher/route, not the persona — see migration plan §A trigger wiring)
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
      summary: `Phase 2 substrate stub — persona '${ctx.profile.persona}' v${ctx.profile.version} resolved, prompt assembled (${ctx.systemPrompt.length} chars), no inference yet. PR ${ctx.invocation.pr_owner}/${ctx.invocation.pr_repo}#${ctx.invocation.pr_number} at ${ctx.invocation.head_sha.slice(0, 8)}.`,
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
          `This response exercises the substrate path: persona resolution, ` +
            `system-prompt assembly, role enforcement, output-contract validation, ` +
            `one-shot DO lifecycle. Real Anthropic + oddkit MCP inference lands in ` +
            `Phase 3 alongside side-by-side validation against the Managed Agents path.`,
        ].join("\n"),
      ),
    };
    return "```json\n" + JSON.stringify(stubVerdict, null, 2) + "\n```";
  }

  // --- Responsibility 3: Apply surface post-processing ------------------
  // Parse the final fenced JSON block from the model output, validate against
  // the persona's audit surface contract. Per
  // klappy://canon/methods/persona-shaped-agent-runtime §The Runtime's Job.

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
      throw new Error("verdict_shape_invalid: expected {verdict: PASS|FAIL, summary: string, comment_body_b64: string}");
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

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

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

// --- Persona-profile parser --------------------------------------------
// Extract the persona profile from the canon markdown doc. The doc structure
// is: YAML frontmatter (between ---) then a heading "## The Profile" with
// an embedded ```yaml block containing the actual schema fields.
//
// Phase 2 uses a hand-rolled mini-parser for the persona-profile shape
// (top-level scalars, nested objects at 2-space indent, inline string arrays).
// Phase 3 may swap in a real YAML library (`js-yaml` or `yaml`) if dep cost
// is justified, or move to a JSON profile format.

export function parsePersonaFromMarkdown(md: string): PersonaProfile {
  const blockMatch = md.match(/^##\s+The Profile[\s\S]*?```yaml\s*\n([\s\S]*?)\n```/m);
  if (!blockMatch || !blockMatch[1]) {
    throw new Error("persona_yaml_block_not_found_under_the_profile_heading");
  }
  return parsePersonaYaml(blockMatch[1]);
}

interface RawObject {
  [key: string]: string | number | null | string[] | RawObject;
}

function parsePersonaYaml(yaml: string): PersonaProfile {
  const lines = yaml.split("\n").map(stripComment);
  const root = parseBlock(lines, 0, 0).value;
  return assertPersonaShape(root);
}

function stripComment(line: string): string {
  // Strip trailing # comments. Does not handle # inside quoted strings —
  // sufficient for the persona-profile shape, which has no such cases.
  const i = line.indexOf("#");
  if (i === -1) return line.trimEnd();
  // Allow ams://...# and klappy://...# anchor fragments
  const before = line.slice(0, i);
  if (/[a-z]:\/\/[^\s]*$/.test(before)) return line.trimEnd();
  return before.trimEnd();
}

// Parse a block of YAML at a given indent level. Returns the parsed value and
// the index of the first line not consumed.
function parseBlock(
  lines: string[],
  start: number,
  indent: number,
): { value: RawObject; next: number } {
  const result: RawObject = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      i++;
      continue;
    }
    const lineIndent = countIndent(line);
    if (lineIndent < indent) break;
    if (lineIndent > indent) {
      throw new Error(`yaml_unexpected_indent at line ${i + 1}: ${line}`);
    }
    const colon = line.indexOf(":");
    if (colon === -1) {
      throw new Error(`yaml_no_colon at line ${i + 1}: ${line}`);
    }
    const key = line.slice(lineIndent, colon).trim();
    const rest = line.slice(colon + 1).trim();
    if (rest === "") {
      // Either a block-object or a block-array (next line starts with `-`)
      i++;
      // Look ahead to decide
      while (i < lines.length && lines[i]!.trim() === "") i++;
      if (i >= lines.length) {
        result[key] = {};
        break;
      }
      const nextIndent = countIndent(lines[i]!);
      if (nextIndent <= indent) {
        // Empty value
        result[key] = {};
        continue;
      }
      const nextTrim = lines[i]!.trim();
      if (nextTrim.startsWith("- ") || nextTrim === "-") {
        const arr = parseBlockArray(lines, i, nextIndent);
        result[key] = arr.value;
        i = arr.next;
      } else {
        const nested = parseBlock(lines, i, nextIndent);
        result[key] = nested.value;
        i = nested.next;
      }
    } else {
      // Inline scalar or inline array
      result[key] = parseScalarOrInlineArray(rest);
      i++;
    }
  }
  return { value: result, next: i };
}

function parseBlockArray(
  lines: string[],
  start: number,
  indent: number,
): { value: string[]; next: number } {
  const items: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      i++;
      continue;
    }
    const lineIndent = countIndent(line);
    if (lineIndent < indent) break;
    if (lineIndent > indent) {
      throw new Error(`yaml_unexpected_indent_in_block_array at line ${i + 1}`);
    }
    const trimmed = line.slice(lineIndent);
    if (!trimmed.startsWith("- ") && trimmed !== "-") {
      break;
    }
    const itemText = trimmed.slice(2).trim();
    items.push(parseScalarString(itemText));
    i++;
  }
  return { value: items, next: i };
}

function parseScalarOrInlineArray(s: string): string | number | null | string[] {
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((p) => parseScalarString(p.trim()));
  }
  return parseScalar(s);
}

function parseScalar(s: string): string | number | null {
  if (s === "null" || s === "~" || s === "") return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  return parseScalarString(s);
}

function parseScalarString(s: string): string {
  // Strip surrounding quotes if present
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function countIndent(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === " ") n++;
  return n;
}

function assertPersonaShape(raw: RawObject): PersonaProfile {
  const persona = expectString(raw, "persona");
  const version = expectNumber(raw, "version");
  const system_prompt_uri = expectString(raw, "system_prompt_uri");
  const role = expectString(raw, "role") as PersonaRole;
  if (!isValidRole(role)) {
    throw new Error(`invalid_role: '${role}' not in seven-value enum`);
  }
  const mcpRaw = expectObject(raw, "mcp_servers");
  const mcp_servers = {
    operational: expectArrayOrEmpty(mcpRaw, "operational"),
    task_relevant: expectArrayOrEmpty(mcpRaw, "task_relevant"),
  };
  const knowledge_bases = expectArrayOrEmpty(raw, "knowledge_bases");
  const surfacesRaw = expectObject(raw, "surface_profiles");
  const surface_profiles: Record<string, SurfaceProfile> = {};
  for (const [name, val] of Object.entries(surfacesRaw)) {
    if (!isRawObject(val)) {
      throw new Error(`surface_profile.${name}_not_object`);
    }
    surface_profiles[name] = {
      density: expectString(val, "density") as SurfaceProfile["density"],
      structured_output: expectString(val, "structured_output") as SurfaceProfile["structured_output"],
      output_schema: optionalString(val, "output_schema"),
      max_emissions_per_session: optionalNumber(val, "max_emissions_per_session"),
    };
  }
  const brand_discipline = optionalString(raw, "brand_discipline") ?? null;
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

function isRawObject(v: unknown): v is RawObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function expectString(o: RawObject, key: string): string {
  const v = o[key];
  if (typeof v !== "string") throw new Error(`expected_string_at_${key}`);
  return v;
}

function expectNumber(o: RawObject, key: string): number {
  const v = o[key];
  if (typeof v !== "number") throw new Error(`expected_number_at_${key}`);
  return v;
}

function expectObject(o: RawObject, key: string): RawObject {
  const v = o[key];
  if (!isRawObject(v)) throw new Error(`expected_object_at_${key}`);
  return v;
}

function expectArrayOrEmpty(o: RawObject, key: string): string[] {
  const v = o[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error(`expected_array_at_${key}`);
  for (const item of v) {
    if (typeof item !== "string") throw new Error(`array_${key}_contains_non_string`);
  }
  return v as string[];
}

function optionalString(o: RawObject, key: string): string | undefined {
  const v = o[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new Error(`expected_string_or_null_at_${key}`);
  return v;
}

function optionalNumber(o: RawObject, key: string): number | undefined {
  const v = o[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number") throw new Error(`expected_number_or_null_at_${key}`);
  return v;
}
