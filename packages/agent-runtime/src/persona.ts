// Persona profile resolution.
//
// Per klappy://canon/methods/persona-shaped-agent-runtime §The Persona
// Profile, profiles live in canon. The AMS audit personas put the
// profile YAML in a code-fenced ```yaml block inside the doc body
// (under ## The Profile or similar header). This module:
//
//   1. Fetches the persona's canon doc via canon.ts.
//   2. Extracts the first ```yaml block that has a `persona:` field.
//   3. Parses it as YAML and validates against the PersonaProfile type.
//
// Validation is strict on required fields; optional fields default to
// sensible empty values. If the profile is malformed, throw a named
// error so the caller surfaces it as a refusal, not a 500.

import { parse as parseYaml } from "yaml";

import { fetchCanon } from "./canon";
import type { PersonaProfile, PersonaUri, Role, Surface, SurfaceProfile } from "./types";

/** Resolve a persona URI to a typed profile. */
export async function resolvePersona(uri: PersonaUri): Promise<PersonaProfile> {
  const doc = await fetchCanon(uri);
  const yamlBlock = extractProfileYamlBlock(doc.body);
  if (!yamlBlock) {
    throw new Error(
      `persona_profile_not_found: no \`\`\`yaml block with a 'persona:' field in ${uri}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(yamlBlock);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_yaml_error";
    throw new Error(`persona_profile_yaml_parse_failed: ${msg} (uri: ${uri})`);
  }

  return validateProfile(parsed, uri);
}

// --- YAML block extraction --------------------------------------------------

/**
 * Find the first ```yaml fenced code block whose body contains a
 * top-level `persona:` field. Returns the block's body (without the
 * fence markers) or null if no such block exists.
 *
 * The simple search-and-scan approach is intentional. The format is a
 * literal markdown fenced code block, and rolling our own parse is
 * cheaper than pulling in a markdown parser for this one use case.
 */
export function extractProfileYamlBlock(markdown: string): string | null {
  const fence = "```yaml";
  let cursor = 0;
  while (cursor < markdown.length) {
    const start = markdown.indexOf(fence, cursor);
    if (start === -1) return null;
    const bodyStart = markdown.indexOf("\n", start);
    if (bodyStart === -1) return null;
    const end = markdown.indexOf("\n```", bodyStart);
    if (end === -1) return null;
    const block = markdown.slice(bodyStart + 1, end);
    // The profile block has a top-level `persona:` key. Other yaml
    // blocks (sample outputs, JSON schemas embedded as yaml, etc.)
    // won't.
    if (/^persona:\s*\S/m.test(block)) {
      return block;
    }
    cursor = end + 4; // skip past the closing fence
  }
  return null;
}

// --- Validation -------------------------------------------------------------

function validateProfile(raw: unknown, uri: PersonaUri): PersonaProfile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`persona_profile_not_mapping: top-level YAML must be a mapping (uri: ${uri})`);
  }
  const o = raw as Record<string, unknown>;

  const persona = requireString(o, "persona", uri);
  const version = requireNumber(o, "version", uri);
  const system_prompt_uri = requireString(o, "system_prompt_uri", uri);

  // Optional informational role declaration. Validated against the
  // Role enum so the typecheck stays clean; an unknown value is
  // dropped silently rather than throwing — the invocation role is
  // what determines runtime behavior, and the persona's declared_role
  // is hint metadata.
  const declared_role = parseDeclaredRole(o.role);

  // mcp_servers can be missing — default to empty operational + task_relevant
  // arrays. A persona without any MCP servers is rare but legal.
  const mcp_servers = parseMcpServers(o.mcp_servers, uri);

  // knowledge_bases may be a list of URI prefixes (e.g., ["klappy://", "ams://"]).
  const knowledge_bases = parseStringArray(o.knowledge_bases) ?? [];

  // surface_profiles is a mapping from surface name -> SurfaceProfile.
  const surface_profiles = parseSurfaceProfiles(o.surface_profiles, uri);

  // brand_discipline is null or a URI string.
  let brand_discipline: string | null = null;
  if (o.brand_discipline !== undefined && o.brand_discipline !== null) {
    if (typeof o.brand_discipline !== "string") {
      throw new Error(
        `persona_profile_brand_discipline_not_string: must be a URI string or null (uri: ${uri})`,
      );
    }
    brand_discipline = o.brand_discipline;
  }

  return {
    persona,
    version,
    system_prompt_uri,
    declared_role,
    mcp_servers,
    knowledge_bases,
    surface_profiles,
    brand_discipline,
  };
}

function parseMcpServers(
  raw: unknown,
  uri: string,
): { operational: string[]; task_relevant: string[] } {
  if (raw === undefined || raw === null) {
    return { operational: [], task_relevant: [] };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`persona_profile_mcp_servers_not_mapping: must be a mapping (uri: ${uri})`);
  }
  const o = raw as Record<string, unknown>;
  return {
    operational: parseStringArray(o.operational) ?? [],
    task_relevant: parseStringArray(o.task_relevant) ?? [],
  };
}

function parseSurfaceProfiles(
  raw: unknown,
  uri: string,
): Partial<Record<Surface, SurfaceProfile>> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `persona_profile_surface_profiles_not_mapping: must be a mapping (uri: ${uri})`,
    );
  }
  const o = raw as Record<string, unknown>;
  const out: Partial<Record<Surface, SurfaceProfile>> = {};
  for (const [key, value] of Object.entries(o)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const v = value as Record<string, unknown>;
    const profile: SurfaceProfile = {};
    if (v.density === "high" || v.density === "medium" || v.density === "low") {
      profile.density = v.density;
    }
    if (
      v.structured_output === "required" ||
      v.structured_output === "narrative" ||
      v.structured_output === "mixed"
    ) {
      profile.structured_output = v.structured_output;
    }
    if (typeof v.max_tokens_per_emission === "number") {
      profile.max_tokens_per_emission = v.max_tokens_per_emission;
    }
    if (typeof v.output_schema === "string") {
      profile.output_schema_uri = v.output_schema;
    } else if (typeof v.output_schema_uri === "string") {
      profile.output_schema_uri = v.output_schema_uri;
    }
    out[key as Surface] = profile;
  }
  return out;
}

function parseStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  if (!v.every((x) => typeof x === "string")) return null;
  return v as string[];
}

function requireString(o: Record<string, unknown>, key: string, uri: string): string {
  const v = o[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`persona_profile_missing_field: '${key}' must be a non-empty string (uri: ${uri})`);
  }
  return v;
}

function requireNumber(o: Record<string, unknown>, key: string, uri: string): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`persona_profile_missing_field: '${key}' must be a finite number (uri: ${uri})`);
  }
  return v;
}

function parseDeclaredRole(v: unknown): Role | undefined {
  if (typeof v !== "string") return undefined;
  switch (v) {
    case "explorer":
    case "planner":
    case "builder":
    case "validator":
    case "resolver":
    case "general":
    case "observer":
      return v;
    default:
      return undefined;
  }
}
