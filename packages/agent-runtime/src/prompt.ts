// System prompt composition.
//
// Per klappy://canon/methods/persona-shaped-agent-runtime §The Runtime's
// Job, step 1: "Compose the system prompt from the profile's
// system_prompt_uri plus mode-specific scaffolding plus surface-
// specific scaffolding."
//
// Critical constraint: this module MUST NOT fetch the brand_discipline
// canon body and inject it into the prompt. Per
// klappy://canon/constraints/oddkit-prompt-pattern (Tier-1, stable):
//
//   "The system prompt is not the constitution; oddkit is."
//   "Governance is fetched at runtime, never hardcoded."
//
// The brand_discipline URI is named in the prompt; the agent has
// oddkit MCP wired in (operational) and calls oddkit_get on the URI
// when it needs to ground a register or palette decision. The runtime
// does not pre-fetch governance bodies.
//
// What this module DOES fetch:
//   - The system_prompt_uri canon body. This is the TASK DEFINITION,
//     not governance. The task-definition canon IS the system prompt
//     for the persona (per canon §The Persona Profile). Fetching it
//     is the persona-resolution step, not a governance injection.

import { fetchCanon } from "./canon";
import type { Invocation, Mode, PersonaProfile, Role, Surface } from "./types";

export interface ComposedPrompt {
  system: string;
  /** URIs referenced in the prompt; useful for telemetry and debugging. */
  references: string[];
}

export async function composeSystemPrompt(
  profile: PersonaProfile,
  invocation: Invocation,
): Promise<ComposedPrompt> {
  // Fetch the task-definition canon body. This is what tells the agent
  // what its task is. It is NOT governance; it is the persona's role
  // specification authored in canon.
  const taskDoc = await fetchCanon(profile.system_prompt_uri);

  const sections: string[] = [];

  // --- Identity creed --------------------------------------------------
  // Per klappy://canon/constraints/oddkit-prompt-pattern, the system
  // prompt contains the creed + axioms + a pointer to oddkit. Keep this
  // short — the constraint warns that growth past ~500 words is
  // governance leaking in.
  sections.push(
    `You are an agent invoked by the persona-shaped agent runtime.`,
    ``,
    `Persona: ${profile.persona} (version ${profile.version})`,
    `Mode: ${invocation.mode}`,
    `Role: ${invocation.role}`,
    `Surface: ${invocation.surface}`,
    `Engagement: ${invocation.engagement}`,
    `Voice mode: ${invocation.voice_mode ?? "persona"}`,
    ``,
    `Operating posture:`,
    `- Before claiming, verify.`,
    `- Reality is sovereign. Observe before asserting.`,
    `- A claim is a debt; unverified claims are liabilities.`,
    `- You cannot verify what you did not observe.`,
  );

  // --- Governance reachability -----------------------------------------
  // Tell the agent where governance lives and that it MUST dereference
  // brand_discipline before voice-sensitive output. This is the
  // imperative-instruction pattern from PR #91, not canon body
  // injection.
  if (profile.brand_discipline) {
    sections.push(
      ``,
      `Voice & brand discipline:`,
      `- Your voice register, banned moves, signature moves, emoji palette, and machine-vs-human surface rules are governed by ${profile.brand_discipline}.`,
      `- Before emitting any output that contains emoji, river vocabulary, or stylistic register choices, call oddkit_get on that URI and follow its canonical palette and discipline.`,
      `- Do NOT improvise emoji or register choices that are not derivable from that canon body.`,
    );
  }

  // --- Knowledge bases -------------------------------------------------
  if (profile.knowledge_bases.length > 0) {
    sections.push(
      ``,
      `Knowledge bases you may ground observations against:`,
      ...profile.knowledge_bases.map((kb) => `- ${kb}`),
      `Use oddkit_search and oddkit_get to retrieve canon documents from these knowledge bases. You may also call oddkit_resolve to walk supersession.`,
    );
  }

  // --- Mode scaffolding ------------------------------------------------
  sections.push(``, ...modeScaffolding(invocation.mode));

  // --- Role scaffolding ------------------------------------------------
  sections.push(``, ...roleScaffolding(invocation.role));

  // --- Surface scaffolding ---------------------------------------------
  sections.push(``, ...surfaceScaffolding(invocation.surface, profile));

  // --- Task body -------------------------------------------------------
  // The task-definition canon is delimited with explicit BEGIN/END
  // markers so the agent treats it as the authoritative spec for its
  // session, not as one input among many.
  sections.push(
    ``,
    `The following canon document is your task definition. Read it carefully and follow it strictly. Your output must satisfy the Output contract specified within it.`,
    ``,
    `--- BEGIN ${profile.system_prompt_uri} ---`,
    taskDoc.body,
    `--- END ${profile.system_prompt_uri} ---`,
    ``,
    `Caller's task statement:`,
    invocation.task,
  );

  return {
    system: sections.join("\n"),
    references: [profile.system_prompt_uri, ...(profile.brand_discipline ? [profile.brand_discipline] : [])],
  };
}

// --- Mode scaffolding (short — full mechanics live in canon, the agent fetches if needed) ---

function modeScaffolding(mode: Mode): string[] {
  switch (mode) {
    case "validation":
      return [
        `Mode: validation. Truth condition: valid if findings are grounded in the produced artifact, not in what you wished had been built.`,
        `- Tool-use is read-only on the artifact under test.`,
        `- Findings are reports, not patches. Do not propose redesign.`,
        `- Each finding MUST carry an explicit disposition: 'fix' | 'pivot' | 'accept'.`,
        `- A finding without disposition is rejected as incomplete per klappy://canon/methods/spawned-agent-session-runtime-contract §Validation.`,
      ];
    case "exploration":
      return [
        `Mode: exploration. Truth condition: valid if it reveals something new.`,
        `- Read-heavy. No artifact-mutating tool calls.`,
        `- Output emissions tagged: question | possibility | tension | frame | synthesis-ledger-entry.`,
      ];
    case "planning":
      return [
        `Mode: planning. Truth condition: valid if assumptions are visible and challengeable.`,
        `- Every plan emission must declare assumptions, deferred items, and invalidating conditions.`,
      ];
    case "execution":
      return [
        `Mode: execution. Truth condition: valid if it produces verifiable outcomes.`,
        `- Tool-use scope is locked at session start and cannot expand mid-session.`,
        `- Mid-build pivots are noted and carried forward, not surfaced inline as pivots.`,
      ];
    case "resolution":
      return [
        `Mode: resolution. Truth condition: valid if it addresses the findings without expanding scope.`,
        `- Mutations are allowed but bounded by the validation findings, not by the original plan.`,
        `- New requirements require explicit reversion to planning.`,
      ];
  }
}

function roleScaffolding(role: Role): string[] {
  switch (role) {
    case "validator":
      return [
        `Role: validator. You produce structured findings with explicit dispositions.`,
        `- You receive: persona profile, artifact reference, claims declaration, governance documents.`,
        `- You do NOT inherit the executor's reasoning.`,
        `- You do NOT mutate the artifact.`,
        `- You do NOT propose redesigns or reopen planning. Findings only.`,
      ];
    case "explorer":
      return [`Role: explorer. Output is a synthesis ledger; the durable handoff to a planner.`];
    case "planner":
      return [`Role: planner. Output is a plan declaring assumptions, scope, deferred items, and invalidating conditions; the durable handoff to a builder.`];
    case "builder":
      return [`Role: builder. Output is the artifact plus a claims declaration; the durable handoff to a validator.`];
    case "resolver":
      return [`Role: resolver. Output is the revised artifact plus a per-finding remediation summary; the durable handoff back to a fresh validator session.`];
    case "general":
      return [`Role: general. No mode-binding, no fresh-context guarantee, no structured-deliverable requirement. Used deliberately to trade signal quality for throughput.`];
    case "observer":
      return [`Role: observer. Continuous-observation surface. You watch a stream produced elsewhere and emit commentary; no artifact-under-review, no handoff to a next mode.`];
  }
}

function surfaceScaffolding(surface: Surface, profile: PersonaProfile): string[] {
  const profileForSurface = profile.surface_profiles[surface];
  const out: string[] = [`Surface: ${surface}.`];
  if (profileForSurface?.density) {
    out.push(`- Density target: ${profileForSurface.density}.`);
  }
  if (profileForSurface?.max_tokens_per_emission) {
    out.push(`- Maximum tokens per emission: ${profileForSurface.max_tokens_per_emission}.`);
  }
  if (profileForSurface?.structured_output === "required") {
    out.push(
      `- Structured output is REQUIRED. The Output contract in the task-definition canon below specifies the schema. Return ONLY a single JSON object that satisfies that schema, wrapped in a single fenced \`\`\`json block. No prose outside the block.`,
    );
  } else if (profileForSurface?.structured_output === "narrative") {
    out.push(`- Output is narrative prose. Follow the voice & brand discipline above.`);
  } else if (profileForSurface?.structured_output === "mixed") {
    out.push(`- Output is mixed structured + narrative. Follow the Output contract in the task-definition canon below.`);
  }
  return out;
}
