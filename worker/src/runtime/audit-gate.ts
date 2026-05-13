// Audit-gate runtime — Durable Object hosting persona-shaped validator
// sessions. Generalized substrate: each invocation specifies which
// canon persona to instantiate (e.g. ams://canon/personas/ams-canon-
// code-auditor), provided the URI is on ALLOWED_PERSONA_URIS below.
// Implements the persona-shaped-agent-runtime contract per
// klappy://canon/methods/persona-shaped-agent-runtime.
//
// The five responsibilities (resolve profile, enforce role, run one-
// shot session, honor agent engagement, apply surface post-processing)
// are implemented with the runtime acting as an oddkit MCP CLIENT for
// profile resolution — the runtime resolves canon URIs via oddkit_get
// rather than bypassing the URI scheme with raw GitHub fetches.
//
// Two distinct MCP wirings exist on the audit path and are kept
// separate by design:
//   - Runtime → oddkit  (this file): resolve persona profile + system
//     prompt URI to bootstrap the session. Stateless tool calls. Uses
//     the @modelcontextprotocol/sdk Client + StreamableHTTPClientTransport.
//   - Agent session → oddkit  (this file, in runAuditSession): the agent
//     invocation passes profile.mcp_servers.operational through to the
//     Anthropic Messages API native MCP connector (anthropic-beta:
//     mcp-client-2025-11-20), giving the agent oddkit_get/oddkit_search
//     as tool surface DURING the audit.
//
// One DO instance per audit invocation, keyed by head_sha at the route
// layer. Fresh-context guarantee per klappy://canon/principles/
// verification-requires-fresh-context is satisfied by the keying: a new
// head_sha produces a new DO instance with no inherited state. The DO
// hibernates after fetch() returns and eventually dies — session_type=
// one_shot per klappy://canon/methods/spawned-agent-session-runtime-
// contract §Composition Rules.
//
// Trigger surface and auth model are defined in worker/src/index.ts
// (OIDC verification, repository allow-list, persona allow-list, body
// validation). The DO sees a fully resolved AuditInvocation —
// pr_owner/pr_repo/head_sha derived from the JWT's claims, persona_uri
// already allow-list-checked, knowledge_base_url already constructed.
// See ams://canon/constraints/canon-code-sync-via-spawned-agent-session
// §Current Implementation for the canonical description.

import { DurableObject } from "cloudflare:workers";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { parse as parseYaml } from "yaml";
import type { Env } from "../types";
import { base64ToUtf8, errorResponse } from "../util";

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
  /**
   * Canon URI of the persona to instantiate. Phase 4/5 generalized
   * the runtime: rather than hardcoding a single persona, every
   * invocation specifies which persona to load. The route enforces
   * that this URI is on an allow-list of canon-resident personas, so
   * a caller cannot point at an attacker-controlled doc.
   */
  persona_uri: string;
  /**
   * GitHub repo URL whose canon should be used to resolve persona +
   * system-prompt URIs (passed to oddkit_get as knowledge_base_url).
   * Derived from the OIDC token's `repository` claim at the route.
   */
  knowledge_base_url: string;
  /**
   * Optional per-run GitHub token for private-repo diff fetching.
   * Passed in the request body by the caller workflow (whose
   * GITHUB_TOKEN is scoped to that run only). The DO uses it as the
   * Authorization header on the diff fetch and does not persist it.
   */
  github_token?: string;
}

export interface AuditVerdict {
  verdict: "PASS" | "FAIL";
  summary: string;
  comment_body_b64: string;
}

// --- Canon URIs and config ----------------------------------------------

// Allow-list of persona URIs the runtime will instantiate. A caller
// passes persona_uri in the request body; the route accepts only URIs
// in this set. Adding a new persona to the runtime is a canon-PR-and-
// allow-list-bump pair, not a free-form runtime config.
//
// Phase 4/5: only ams-canon-code-auditor exists. Future personas
// (output/artifact validators, oddkit gauntlet runners) get added
// here when their canon doc lands.
export const ALLOWED_PERSONA_URIS: ReadonlyArray<string> = [
  "ams://canon/personas/ams-canon-code-auditor",
];

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

export class AuditGateDO extends DurableObject<Env> {
  // Lazy oddkit MCP client; reused across calls within a single fetch().
  // Each DO invocation builds its own client; the DO hibernates between
  // invocations so there's no cross-request client reuse anyway.
  private oddkit: Client | null = null;

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
          "body must be {pr_owner, pr_repo, pr_number, head_sha, persona_uri, knowledge_base_url, github_token?}");
      }
      invocation = body;
    } catch {
      return errorResponse(400, "invalid_json", "body must be JSON");
    }

    try {
      // Responsibility 1: resolve profile via oddkit MCP (NOT raw GitHub fetch)
      const profile = await this.resolvePersonaProfile(invocation);

      // Responsibility 2: enforce role
      this.enforceValidatorRole(profile);

      // Assemble the system prompt by fetching the system_prompt_uri canon
      // doc — also via oddkit, since the URI is canonical and oddkit owns
      // resolution. Same caching strategy.
      const systemPrompt = await this.assembleSystemPrompt(profile, invocation);

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

  private async resolvePersonaProfile(invocation: AuditInvocation): Promise<PersonaProfile> {
    // Step 1: fetch via oddkit_get
    const doc = await this.oddkitGet({
      uri: invocation.persona_uri,
      knowledge_base_url: invocation.knowledge_base_url,
    });

    // Step 2: check parsed-profile cache
    const cacheKey = `parsed-profile:${invocation.persona_uri}`;
    const cached = await this.ctx.storage.get<CachedParsedProfile>(cacheKey);
    if (cached && cached.content_hash === doc.content_hash) {
      return cached.profile;
    }

    // Step 3: parse the YAML profile block out of the markdown body
    const profile = parsePersonaFromMarkdown(doc.content);

    // Step 4: sanity check — URI we asked for should match the persona's
    // self-declared identity. The URI's last path segment is the expected
    // persona name (e.g. ams://canon/personas/ams-canon-code-auditor →
    // expected persona = "ams-canon-code-auditor").
    const expectedName = invocation.persona_uri.split("/").pop() ?? "";
    if (profile.persona !== expectedName) {
      throw new Error(
        `persona_identity_mismatch: profile.persona='${profile.persona}', expected '${expectedName}' from ${invocation.persona_uri}`,
      );
    }

    // Step 5: cache the parsed result keyed by content_hash
    await this.ctx.storage.put<CachedParsedProfile>(cacheKey, {
      content_hash: doc.content_hash,
      profile,
      parsed_at: new Date().toISOString(),
    });

    return profile;
  }

  private async assembleSystemPrompt(profile: PersonaProfile, invocation: AuditInvocation): Promise<string> {
    // Resolve the system_prompt_uri via oddkit. Same caching strategy as
    // the persona profile — cache the doc by content_hash.
    const doc = await this.oddkitGet({
      uri: profile.system_prompt_uri,
      knowledge_base_url: invocation.knowledge_base_url,
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
  // Phase 3: real Anthropic Messages API call. The persona profile declares
  // mcp_servers.operational: [oddkit]; we wire it via the Anthropic native
  // MCP connector (anthropic-beta: mcp-client-2025-11-20). The agent session
  // gets oddkit as a tool surface; the runtime's separate oddkit client
  // (used above for profile resolution) is decoupled from the agent's.
  //
  // GitHub diff is fetched by the runtime and passed inline in the user
  // message — for the PoC, no agent-side GitHub MCP. Phase 4+ may move
  // GitHub access to an agent tool.

  private async runAuditSession(ctx: {
    invocation: AuditInvocation;
    profile: PersonaProfile;
    systemPrompt: string;
  }): Promise<string> {
    if (!this.env.ANTHROPIC_API_KEY) {
      throw new Error("anthropic_api_key_not_configured");
    }

    // Fetch the PR diff. Public repos work unauthenticated; for private
    // repos the caller workflow passes its per-run GITHUB_TOKEN in the
    // request body and we use it as the Authorization header here. The
    // token is scoped to the workflow run that issued it and is not
    // persisted by this DO.
    const diffUrl = `https://github.com/${ctx.invocation.pr_owner}/${ctx.invocation.pr_repo}/pull/${ctx.invocation.pr_number}.diff`;
    const diffHeaders: Record<string, string> = { accept: "text/plain" };
    if (ctx.invocation.github_token) {
      diffHeaders.authorization = `token ${ctx.invocation.github_token}`;
    }
    const diffRes = await fetch(diffUrl, {
      headers: diffHeaders,
      redirect: "follow",
    });
    if (!diffRes.ok) {
      throw new Error(`diff_fetch_failed: ${diffRes.status} ${diffRes.statusText} for ${diffUrl}`);
    }
    const diff = await diffRes.text();
    // Cap diff size to keep the token bill bounded on huge PRs.
    // head+tail strategy: keep the first half-cap and the last half-cap
    // of the diff with a marker between, so context lives in both
    // boundaries rather than just the start. Full chunking + reducer is
    // a future phase; this is the right cost/value trade for current
    // PR sizes.
    const MAX_DIFF_CHARS = 150_000; // 150 KiB
    const truncatedDiff = capDiff(diff, MAX_DIFF_CHARS);

    // Compose the agent's user message: PR coordinates + the diff + an
    // explicit reminder of the output contract.
    const userMessage = [
      `Audit the following pull request for canon-code drift per the AMS canon-code-sync constraint loaded as your system prompt.`,
      ``,
      `PR coordinates:`,
      `  owner:  ${ctx.invocation.pr_owner}`,
      `  repo:   ${ctx.invocation.pr_repo}`,
      `  number: ${ctx.invocation.pr_number}`,
      `  head_sha: ${ctx.invocation.head_sha}`,
      ``,
      `You have the oddkit MCP server available. Use oddkit_get and oddkit_search to resolve any \`ams://\` or \`klappy://\` URIs you need to ground your analysis. Pass knowledge_base_url=${ctx.invocation.knowledge_base_url} when resolving ams:// URIs.`,
      ``,
      `Output contract: your final emission MUST be a single fenced JSON block matching:`,
      "```json",
      `{"verdict": "PASS" | "FAIL", "summary": "<one-line summary>", "comment_body_b64": "<base64-encoded UTF-8 markdown comment body>"}`,
      "```",
      ``,
      `--- BEGIN DIFF ---`,
      truncatedDiff,
      `--- END DIFF ---`,
    ].join("\n");

    // Resolve the operational MCP servers from the persona profile.
    // Currently the profile names "oddkit" by short name; map to the URL
    // canonically. Phase 4+ may move the URL into the profile itself or
    // resolve via an MCP registry.
    const mcpServers = ctx.profile.mcp_servers.operational
      .filter((name) => name === "oddkit")
      .map((name) => ({
        type: "url" as const,
        url: ODDKIT_MCP_URL,
        name,
      }));

    const requestBody = {
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: ctx.systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      mcp_servers: mcpServers,
      tools: mcpServers.map((s) => ({
        type: "mcp_toolset" as const,
        mcp_server_name: s.name,
      })),
    };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "mcp-client-2025-11-20",
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`anthropic_api_failed: ${res.status} ${res.statusText} body=${errBody.slice(0, 500)}`);
    }
    const respJson = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      stop_reason?: string;
      usage?: Record<string, number>;
    };

    // Concatenate all text-type content blocks. MCP tool_use / mcp_tool_use
    // / mcp_tool_result blocks are not included — they're the agent's
    // intermediate work, not the verdict. The verdict lives in the final
    // text block per the output contract.
    const textBlocks = (respJson.content ?? [])
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string);

    if (textBlocks.length === 0) {
      throw new Error(`anthropic_no_text_content: stop_reason=${respJson.stop_reason ?? "?"}`);
    }

    return textBlocks.join("\n\n");
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
    /^[0-9a-f]{40}$/i.test(i.head_sha) &&
    typeof i.persona_uri === "string" &&
    ALLOWED_PERSONA_URIS.includes(i.persona_uri) &&
    typeof i.knowledge_base_url === "string" &&
    /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(i.knowledge_base_url) &&
    (i.github_token === undefined || (typeof i.github_token === "string" && i.github_token.length > 0))
  );
}

/**
 * Cap a diff to at most maxChars by keeping the head and tail with a
 * middle-omission marker. Returns the diff unchanged if it already
 * fits. The marker is part of the cap so the budget includes it.
 */
export function capDiff(diff: string, maxChars: number): string {
  if (diff.length <= maxChars) return diff;
  const marker = (omitted: number) =>
    `\n\n[... ${omitted} chars omitted from middle of diff; full diff is ${diff.length} chars ...]\n\n`;
  // Reserve marker space; split remaining budget between head and tail.
  // Conservative marker estimate: 120 chars (handles 9-digit omitted counts).
  const reservedForMarker = 120;
  const usable = Math.max(maxChars - reservedForMarker, 1000);
  const half = Math.floor(usable / 2);
  const head = diff.slice(0, half);
  const tail = diff.slice(diff.length - half);
  const omitted = diff.length - head.length - tail.length;
  return head + marker(omitted) + tail;
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
