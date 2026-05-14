// Surface-driven output post-processing.
//
// Per klappy://canon/methods/spawned-agent-session-runtime-contract
// §Surface drives output post-processing, the runtime mechanically
// enforces voice canon at the output layer. The agent inside speaks
// naturally; this module cleans before delivery:
//
//   1. Strip persona emoji from machine-tagged fields. Per
//      klappy://canon/voice/oddie-the-river-guide §Brand Guide, persona
//      emoji are absolutely banned in JSON/YAML/code/commit messages/
//      status titles/URIs/file paths.
//
//   2. Honor the session-level voice_mode toggle: persona | neutral |
//      strict. Neutral and strict suppress persona emoji across ALL
//      fields, including human ones.
//
//   3. Preserve functional status emoji (✅ ⚠️ 🔴 ⏳ 🟡) across all
//      toggles per canon — they are information, not character.
//
// v1 scope: validator role + audit surface. Other surfaces are TBD.

import type {
  FindingDisposition,
  FindingSeverity,
  ValidatorFinding,
  ValidatorOutput,
  VoiceMode,
} from "./types";

// --- Emoji policy ----------------------------------------------------------
//
// The canon-correct way to derive the emoji policy is to dereference
// klappy://canon/voice/oddie-the-river-guide via oddkit and parse its
// §Brand Guide § Emoji Discipline. That dereference happens INSIDE the
// agent (per oddkit-prompt-pattern); the runtime cannot pre-fetch.
//
// What this module does instead: maintain a minimal preserve-list of
// functional status emoji that survive across all voice modes. Anything
// outside that list is treated as a "may be persona emoji" candidate
// for stripping when machine-tagged or when voice_mode suppresses
// persona emoji.
//
// This is conservative — it leans on stripping rather than passing.
// False positives (a non-persona emoji incidentally not on the
// preserve-list getting stripped from a machine field) are a non-issue
// because machine fields aren't supposed to have any emoji in the
// first place. False negatives (a persona emoji slipping through in a
// human field with voice_mode=persona) are fine because that's the
// intent of voice_mode=persona.

/** Functional status emoji per klappy://canon/voice/oddie-the-river-guide §Brand Guide. */
const FUNCTIONAL_STATUS_EMOJI = new Set(["✅", "❌", "⚠️", "🔴", "🟢", "🟡", "🟠", "⏳", "🔵"]);

/**
 * Match any code point above U+007F. This is the conservative "any
 * non-ASCII" filter that catches all emoji, river vocabulary, and
 * any other persona-flavored Unicode. Functional status emoji are
 * preserved by exact match against the allow-list above; everything
 * else above U+007F gets stripped when the policy says strip.
 */
const NON_ASCII_REGEX = /[\u0080-\uFFFF\u{10000}-\u{10FFFF}]/gu;

function stripPersonaEmoji(text: string): string {
  // Walk the string by code point; preserve functional status emoji,
  // strip everything else non-ASCII. Use a simple two-pass approach:
  // for each match of the non-ASCII regex, check if it (or one of its
  // immediate neighbors) forms a functional status sequence.
  if (!text) return text;

  // Build a quick "is preservable at index i" lookup by scanning for
  // each functional emoji in the text. Indices that are part of a
  // preservable sequence are kept; everything else above U+007F is
  // stripped.
  const preserveRanges: Array<[number, number]> = [];
  for (const emoji of FUNCTIONAL_STATUS_EMOJI) {
    let cursor = 0;
    while (cursor < text.length) {
      const idx = text.indexOf(emoji, cursor);
      if (idx === -1) break;
      preserveRanges.push([idx, idx + emoji.length]);
      cursor = idx + emoji.length;
    }
  }
  if (preserveRanges.length === 0) {
    return text.replace(NON_ASCII_REGEX, "");
  }

  // Strip non-ASCII characters that are NOT inside any preserve range.
  let out = "";
  for (let i = 0; i < text.length; ) {
    const inPreserve = preserveRanges.some(([s, e]) => i >= s && i < e);
    const ch = text[i]!;
    const code = ch.charCodeAt(0);
    if (inPreserve) {
      out += ch;
      i++;
    } else if (code < 0x80) {
      out += ch;
      i++;
    } else {
      // Handle UTF-16 surrogate pairs as a unit.
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
        i += 2;
      } else {
        i++;
      }
    }
  }
  return out;
}

/** Strip leading/trailing whitespace left by emoji removal. */
function cleanupWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .trim();
}

// --- Validator/audit output post-processing --------------------------------

/**
 * Parse the agent's emission (which should be a JSON object inside a
 * fenced ```json block per the prompt's structured_output contract)
 * into a typed ValidatorOutput. Throws a named error if the shape is
 * wrong — the caller surfaces this as a "needs_human_review" verdict.
 */
export function parseValidatorEmission(text: string): ValidatorOutput {
  const json = extractJsonBlock(text);
  if (!json) {
    throw new Error(
      "validator_output_no_json_block: expected a single \\`\\`\\`json fenced block in the agent's emission",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_json_error";
    throw new Error(`validator_output_invalid_json: ${msg}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("validator_output_not_object: top-level JSON must be an object");
  }

  const obj = parsed as Record<string, unknown>;
  const verdict = obj.verdict;
  if (verdict !== "pass" && verdict !== "fail" && verdict !== "needs_human_review") {
    throw new Error(
      `validator_output_invalid_verdict: must be 'pass' | 'fail' | 'needs_human_review'; got ${JSON.stringify(verdict)}`,
    );
  }

  const rawFindings = obj.findings;
  if (!Array.isArray(rawFindings)) {
    throw new Error("validator_output_findings_not_array: 'findings' must be an array");
  }

  const findings: ValidatorFinding[] = rawFindings.map((f, i) => validateFinding(f, i));

  const summary = {
    total: findings.length,
    by_disposition: countBy<FindingDisposition>(findings, (f) => f.disposition, ["fix", "pivot", "accept"]),
    by_severity: countBy<FindingSeverity>(findings, (f) => f.severity, ["blocker", "finding", "caveat"]),
  };

  return { verdict, findings, summary };
}

function validateFinding(raw: unknown, index: number): ValidatorFinding {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`validator_output_finding_not_object: findings[${index}]`);
  }
  const o = raw as Record<string, unknown>;
  const kind = stringField(o, "kind");
  const location = stringField(o, "location");
  const severity = o.severity;
  const disposition = o.disposition;
  const description = stringField(o, "description");
  const evidence_uri = typeof o.evidence_uri === "string" ? o.evidence_uri : undefined;

  if (!kind) throw new Error(`validator_output_finding_missing_kind: findings[${index}]`);
  if (!location) throw new Error(`validator_output_finding_missing_location: findings[${index}]`);
  if (!description) throw new Error(`validator_output_finding_missing_description: findings[${index}]`);
  if (severity !== "blocker" && severity !== "finding" && severity !== "caveat") {
    throw new Error(
      `validator_output_finding_invalid_severity: findings[${index}].severity must be 'blocker' | 'finding' | 'caveat'; got ${JSON.stringify(severity)}`,
    );
  }
  if (disposition !== "fix" && disposition !== "pivot" && disposition !== "accept") {
    throw new Error(
      `validator_output_finding_invalid_disposition: findings[${index}].disposition must be 'fix' | 'pivot' | 'accept'; got ${JSON.stringify(disposition)}`,
    );
  }

  return {
    kind,
    location,
    severity,
    disposition,
    description,
    evidence_uri,
  };
}

/**
 * Apply machine/human field tagging policy and the voice_mode toggle.
 *
 * For the validator/audit surface:
 *   - Machine fields (kind, location, severity, disposition,
 *     evidence_uri, all of `summary`): always emoji-stripped.
 *   - Human fields (description on each finding, comment_markdown):
 *     stripped only if voice_mode is 'neutral' or 'strict'.
 */
export function postProcessValidatorOutput(
  output: ValidatorOutput,
  voiceMode: VoiceMode,
): ValidatorOutput {
  const stripHumanFields = voiceMode === "neutral" || voiceMode === "strict";

  const cleanedFindings = output.findings.map((f) => ({
    kind: cleanupWhitespace(stripPersonaEmoji(f.kind)),
    location: cleanupWhitespace(stripPersonaEmoji(f.location)),
    severity: f.severity,
    disposition: f.disposition,
    description: stripHumanFields
      ? cleanupWhitespace(stripPersonaEmoji(f.description))
      : f.description,
    evidence_uri: f.evidence_uri ? cleanupWhitespace(stripPersonaEmoji(f.evidence_uri)) : undefined,
  }));

  return {
    verdict: output.verdict,
    findings: cleanedFindings,
    summary: output.summary,
  };
}

/**
 * Strip persona emoji from human-readable comment markdown when
 * voice_mode demands. v1 returns the markdown unchanged in
 * voice_mode='persona' (agent's choice survives); strips in neutral
 * and strict.
 */
export function postProcessCommentMarkdown(
  markdown: string | undefined,
  voiceMode: VoiceMode,
): string | undefined {
  if (!markdown) return markdown;
  if (voiceMode === "persona") return markdown;
  return cleanupWhitespace(stripPersonaEmoji(markdown));
}

// --- Helpers ----------------------------------------------------------------

function extractJsonBlock(text: string): string | null {
  const fence = "```json";
  const start = text.indexOf(fence);
  if (start === -1) {
    // Tolerate raw JSON (no fence) as a fallback. Some models forget
    // the fence even when prompted; if the whole emission is just JSON,
    // accept it.
    const trimmed = text.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed;
    }
    return null;
  }
  const bodyStart = text.indexOf("\n", start);
  if (bodyStart === -1) return null;
  const end = text.indexOf("\n```", bodyStart);
  if (end === -1) return null;
  return text.slice(bodyStart + 1, end);
}

function stringField(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function countBy<T extends string>(
  items: ValidatorFinding[],
  pick: (f: ValidatorFinding) => T,
  keys: readonly T[],
): Record<T, number> {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
  for (const f of items) {
    out[pick(f)]++;
  }
  return out;
}
