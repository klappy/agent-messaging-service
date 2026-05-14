// Five-dimension invocation contract per
// klappy://canon/methods/spawned-agent-session-runtime-contract.
//
// The runtime exposes one primitive — invoke a session — parameterized
// by five orthogonal dimensions. Adding a dimension here is a canon-
// level change, not an implementation choice.
//
// v1 scope: only validator/audit/agent/validation is implemented.
// Other dimension values are accepted at the type level (so the
// surface area matches the contract) but rejected at submit time
// with a named refusal_reason. v2+ adds explorer/planner/builder/
// resolver per the deployment sequence in canon §First Worked
// Examples.

// --- Dimension 1: Persona ---------------------------------------------------

/** Canon URI for a persona — e.g., "ams://canon/personas/ams-canon-code-auditor". */
export type PersonaUri = string;

// --- Dimension 2: Mode ------------------------------------------------------

export type Mode =
  | "exploration"
  | "planning"
  | "execution"
  | "validation"
  | "resolution";

// --- Dimension 3: Role ------------------------------------------------------

export type Role =
  | "explorer"
  | "planner"
  | "builder"
  | "validator"
  | "resolver"
  | "general"
  | "observer";

// --- Dimension 4: Surface ---------------------------------------------------

export type Surface =
  | "real-time-stream"
  | "audit"
  | "mentorship"
  | "sidebar-chat"
  | "code-output"
  | "synthesis-ledger"
  | "conversational"
  | "strategic-translation";

// --- Dimension 5: Engagement ------------------------------------------------

export type Engagement = "assistant" | "agent";

// --- Voice mode (per §Surface drives output post-processing) ---------------
//
// Session-level toggle; not one of the five dimensions. Honored by the
// surface post-processor. `neutral` and `strict` suppress persona emoji
// across all fields. Functional status emoji (✅ ⚠️ 🔴 ⏳ 🟡) survive
// across all toggles per canon — they are information, not character.

export type VoiceMode = "persona" | "neutral" | "strict";

// --- The invocation contract ------------------------------------------------

/**
 * Complete invocation per canon §Persona resolution. The runtime
 * validates the shape, checks v1 scope, and dispatches if eligible.
 *
 * Handoff inputs (the encoded artifacts from upstream-mode sessions)
 * are required for downstream roles per the encoded-handoff constraint
 * (klappy://canon/constraints/mode-transitions-require-encoded-handoff).
 * v1 (validator only) needs `artifact_uri` and optionally `claims_uri`.
 */
export interface Invocation {
  persona: PersonaUri;
  mode: Mode;
  role: Role;
  surface: Surface;
  engagement: Engagement;
  voice_mode?: VoiceMode; // defaults to "persona"
  task: string;
  handoff?: HandoffInputs;
  /**
   * Per-invocation task-relevant MCP server URIs supplementing the
   * persona's operational MCP set. Runtime composes
   * operational ∪ task_relevant. Per canon: MUST NOT strip
   * operational as "unrelated to the task."
   */
  task_relevant_mcps?: string[];
  /** Knowledge base URL override (for oddkit lookups). */
  knowledge_base_url?: string;
}

export interface HandoffInputs {
  synthesis_ledger_uri?: string;
  plan_uri?: string;
  artifact_uri?: string;
  claims_uri?: string;
  findings_uri?: string;
}

// --- Persona profile shape --------------------------------------------------
//
// Per klappy://canon/methods/persona-shaped-agent-runtime §The Persona
// Profile. The profile lives in canon (in the persona doc's YAML body
// block). The runtime resolves; it does not author.

export interface PersonaProfile {
  persona: string;
  version: number;
  system_prompt_uri: string;
  /**
   * Persona's declared role. Per canon, role is also an invocation
   * dimension — an invocation may request a different role from the
   * persona's declared default. v1 supports only validator and
   * requires the invocation role to equal the persona's declared
   * role; v2+ relaxes this for personas declaring multiple roles.
   */
  declared_role?: Role;
  mcp_servers: {
    operational: string[];
    task_relevant: string[];
  };
  knowledge_bases: string[];
  surface_profiles: Partial<Record<Surface, SurfaceProfile>>;
  /**
   * URI pointing at the persona's voice canon. Per
   * klappy://canon/constraints/oddkit-prompt-pattern, the runtime
   * MUST NOT fetch this and inject its body into the system prompt.
   * The agent dereferences via oddkit_get if it needs to ground a
   * register call during the session.
   */
  brand_discipline: string | null;
}

export interface SurfaceProfile {
  density?: "high" | "medium" | "low";
  /** "required" forces JSON output; "narrative" allows prose. */
  structured_output?: "required" | "narrative" | "mixed";
  max_tokens_per_emission?: number;
  /** Canon URI naming the field-level machine/human tagging for this surface. */
  output_schema_uri?: string;
}

// --- Output envelope --------------------------------------------------------
//
// What the runtime returns to the caller after a session. Field
// tagging (machine vs human) is per canon §Surface drives output
// post-processing. Machine fields are emoji-stripped; human fields
// preserve persona emoji unless voice_mode suppresses them.

export interface InvocationResult {
  status: "completed" | "refused" | "failed";
  meta: {
    session_id: string;
    persona: PersonaUri;
    mode: Mode;
    role: Role;
    surface: Surface;
    engagement: Engagement;
    started_at: string;
    completed_at: string;
    /** When status="refused", names the canon section that gates the request. */
    refusal_reason?: string;
    /** When status="failed", names the upstream failure. */
    failure_reason?: string;
    /** Diagnostic info for failure debugging (machine-tagged). */
    failure_detail?: string;
    /** Number of retry attempts the substrate made before success/failure. */
    attempts?: number;
  };
  /** Surface-specific structured output. For validator/audit: ValidatorOutput. */
  output: unknown;
  /**
   * Human-tagged narrative summary. Persona emoji preserved unless
   * voice_mode suppresses them.
   */
  comment_markdown?: string;
}

// --- Validator-role output schema (v1's concrete surface) -------------------
//
// Per canon §validator and P0008 (klappy://docs/promotions/
// P0008-pr-validator-dolcheo-ledger-as-deliverable). Each finding
// carries an explicit disposition. A finding without disposition is
// rejected as incomplete.

export type FindingDisposition = "fix" | "pivot" | "accept";

export type FindingSeverity = "blocker" | "finding" | "caveat";

export interface ValidatorFinding {
  kind: string;
  location: string;
  severity: FindingSeverity;
  disposition: FindingDisposition;
  evidence_uri?: string;
  /** Short prose. Human-tagged; voice_mode controls persona-emoji policy. */
  description: string;
}

export interface ValidatorOutput {
  verdict: "pass" | "fail" | "needs_human_review";
  findings: ValidatorFinding[];
  summary: {
    total: number;
    by_disposition: Record<FindingDisposition, number>;
    by_severity: Record<FindingSeverity, number>;
  };
}
