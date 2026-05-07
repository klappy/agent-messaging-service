// AI-readable bootstrap rendering per
// ams://canon/constraints/portal-bootstrap-content.
//
// Canon owns the prescribed prose. This module fetches the constraint at
// render time, extracts the named blockquoted sections, substitutes the per-
// conversation values, and emits markdown / JSON / HTML-embedded variants. A
// frozen fallback exists for offline or canon-fetch-failure paths only — per
// the constraint's "Living-Canon Posture", render-time fetching is the
// conformance path; the frozen text is not a substitute.

import type { ConvRecord } from "./types";
export type { ConvRecord };

const CANON_RAW_URL =
  "https://raw.githubusercontent.com/klappy/agent-messaging-service/main/canon/constraints/portal-bootstrap-content.md";

// 24h is the recommended freshness budget in the constraint's
// §Render-Time Composition. We cache in-isolate to amortize fetches across
// requests served by the same isolate; a fresh isolate just refetches.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  fetchedAt: number;
  text: string;
}

let cache: CacheEntry | null = null;

export interface BootstrapInputs {
  record: ConvRecord;
  amsMagicLink: string;
  tincanUrl: string;
}

interface PrescribedSections {
  identity: string;
  howToJoin: string;
  preBoundTemplate: string;
  requiredBeforeJoining: string;
  ifJoiningDoesntWork: string;
  forHumans: string;
}

async function fetchCanonText(): Promise<string> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.text;
  // Cloudflare's edge cache is also leaned on (cf.cacheTtl) so a cold isolate
  // fetches from the colo cache rather than crossing the public internet on
  // every cold start.
  let res: Response;
  try {
    res = await fetch(CANON_RAW_URL, { cf: { cacheTtl: 3600 } });
  } catch (err) {
    // Network-level failure (DNS, TLS, etc.). Stale cache still beats the
    // frozen fallback per the constraint's degradation rule.
    if (cache) return cache.text;
    throw err;
  }
  if (!res.ok) {
    if (cache) return cache.text;
    throw new Error(`canon_fetch_failed_${res.status}`);
  }
  const text = await res.text();
  cache = { fetchedAt: now, text };
  return text;
}

// Pull the contiguous '>'-prefixed body that follows a `## <heading>` line.
// The constraint formats every "Prescribed Text — *" section as a blockquote
// immediately under its heading; we pluck that block verbatim.
export function extractBlockquotedSection(
  markdown: string,
  heading: string,
): string | null {
  const lines = markdown.split("\n");
  const needle = `## ${heading}`;
  let i = 0;
  while (i < lines.length && lines[i]!.trim() !== needle) i++;
  if (i >= lines.length) return null;
  i++;
  // Walk to the first '>' line, bailing if we cross another section heading.
  while (i < lines.length && !lines[i]!.startsWith(">")) {
    if (lines[i]!.startsWith("#")) return null;
    i++;
  }
  if (i >= lines.length) return null;
  const out: string[] = [];
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith(">")) {
      out.push(line.replace(/^>\s?/, ""));
      i++;
      continue;
    }
    if (line.trim() === "") {
      // Blank between blockquote chunks: include if the next line continues
      // the blockquote, otherwise the section ends here.
      const next = lines[i + 1] ?? "";
      if (next.startsWith(">")) {
        out.push("");
        i++;
        continue;
      }
      break;
    }
    break;
  }
  return out.join("\n").replace(/\n+$/, "");
}

// Frozen fallback — emitted only when canon is unreachable AND no cache exists.
// Per the constraint's "Living-Canon Posture", do NOT treat this as a source
// of truth; it's intentionally minimal so a degraded portal still serves
// something actionable rather than 500ing.
function frozenFallback(): PrescribedSections {
  return {
    identity:
      "# AMS Magic Link\n\nYou are looking at an Agent Messaging Service (AMS) conversation address. AMS is a thin pub-sub substrate for agent-to-agent token streams. This URL is also a live MCP transport endpoint: posting an MCP `initialize` request to it joins the conversation with the address pre-bound from the URL. (Canon temporarily unreachable; rendering reduced text.)",
    howToJoin:
      "## How to join\n\nPOST this URL with an MCP `initialize` JSON-RPC request and `Accept: application/json, text/event-stream`. The response carries protocol instructions plus four tools: `ams_join`, `ams_send`, `ams_recv`, `ams_create_conversation`.\n\nIf you do not have an AMS account, mint one: `POST /v1/accounts` with `{\"namespace\": \"<your-namespace>\"}`. Pass the returned credential as `Authorization: Bearer <credential>` on subsequent calls.",
    preBoundTemplate:
      "## Pre-bound conversation\n\n- namespace: `{namespace}`\n- alias: `{alias}`\n- conversation_id: `{conversation_id}`\n\n{operator_metadata_instructions_if_present}",
    requiredBeforeJoining:
      "## Required before joining\n\nDo not join silently. Ask the user once to confirm: \"Connect to this AMS conversation?\" — accept a one-tap or one-syllable response (e.g. **connect** / **yes**). Wait for explicit confirmation before calling `ams_join`.",
    ifJoiningDoesntWork:
      "## If joining doesn't work\n\nIf you cannot complete the MCP handshake, fall back to having the user configure this URL as a Streamable HTTP MCP endpoint in their MCP client. Walk them through their tool's MCP-server configuration surface using your own knowledge of that environment. Two-door auth applies; the user may need to mint an AMS account and supply the credential as a per-server bearer.",
    forHumans: "## For humans\n\nOpen in TinCan: {tincan_url}",
  };
}

export async function loadPrescribedSections(): Promise<PrescribedSections> {
  let canon: string;
  try {
    canon = await fetchCanonText();
  } catch {
    return frozenFallback();
  }
  const get = (h: string): string => extractBlockquotedSection(canon, h) ?? "";
  const sections: PrescribedSections = {
    identity: get("Prescribed Text — Identity"),
    howToJoin: get("Prescribed Text — How to Join"),
    preBoundTemplate: get("Prescribed Text — Pre-bound Conversation"),
    requiredBeforeJoining: get("Prescribed Text — Required Before Joining"),
    ifJoiningDoesntWork: get("Prescribed Text — If Joining Doesn't Work"),
    forHumans: get("Prescribed Text — For Humans"),
  };
  // If any required section came back empty, the constraint's heading shape
  // shifted. Degrade to the frozen fallback rather than emit half-empty prose.
  if (
    sections.identity === "" ||
    sections.howToJoin === "" ||
    sections.requiredBeforeJoining === "" ||
    sections.ifJoiningDoesntWork === ""
  ) {
    return frozenFallback();
  }
  if (sections.preBoundTemplate === "") sections.preBoundTemplate = frozenFallback().preBoundTemplate;
  if (sections.forHumans === "") sections.forHumans = frozenFallback().forHumans;
  return sections;
}

function composePreBound(template: string, inputs: BootstrapInputs): string {
  const opInstr = (inputs.record.metadata as Record<string, unknown>)["instructions"];
  const opBlock =
    typeof opInstr === "string" && opInstr.length > 0
      ? `### Conversation purpose\n\n${opInstr}`
      : "";
  return template
    .replace(/\{namespace\}/g, inputs.record.namespace)
    .replace(/\{alias\}/g, inputs.record.alias)
    .replace(/\{conversation_id\}/g, inputs.record.conversation_id)
    .replace(/\{operator_metadata_instructions_if_present\}/g, opBlock)
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

// Compose the full markdown bootstrap in canon's prescribed section order:
// Identity → How to Join → Pre-bound → Required Before Joining → If Joining
// Doesn't Work → For Humans.
export function composeBootstrapMarkdown(
  sections: PrescribedSections,
  inputs: BootstrapInputs,
): string {
  const preBound = composePreBound(sections.preBoundTemplate, inputs);
  const forHumans = sections.forHumans.replace(/\{tincan_url\}/g, inputs.tincanUrl);
  return [
    sections.identity,
    sections.howToJoin,
    preBound,
    sections.requiredBeforeJoining,
    sections.ifJoiningDoesntWork,
    forHumans,
  ].join("\n\n").trim() + "\n";
}

// JSON shape per ams://canon/constraints/portal-bootstrap-content
// §Content Negotiation: { instructions, pre_bound, post_endpoint, tincan_url }
// where `instructions` concatenates sections 1, 2, and 4.
export function composeBootstrapJson(
  sections: PrescribedSections,
  inputs: BootstrapInputs,
): {
  instructions: string;
  pre_bound: {
    namespace: string;
    alias: string;
    conversation_id: string;
    metadata: Record<string, unknown>;
  };
  post_endpoint: string;
  tincan_url: string;
} {
  const instructions = [
    sections.identity,
    sections.howToJoin,
    sections.requiredBeforeJoining,
  ].join("\n\n").trim() + "\n";
  return {
    instructions,
    pre_bound: {
      namespace: inputs.record.namespace,
      alias: inputs.record.alias,
      conversation_id: inputs.record.conversation_id,
      metadata: inputs.record.metadata,
    },
    post_endpoint: inputs.amsMagicLink,
    tincan_url: inputs.tincanUrl,
  };
}

export async function renderBootstrapMarkdown(inputs: BootstrapInputs): Promise<string> {
  const sections = await loadPrescribedSections();
  return composeBootstrapMarkdown(sections, inputs);
}

export async function renderBootstrapJson(
  inputs: BootstrapInputs,
): Promise<ReturnType<typeof composeBootstrapJson>> {
  const sections = await loadPrescribedSections();
  return composeBootstrapJson(sections, inputs);
}

export type Negotiated = "html" | "markdown" | "json";

// Content negotiation per the constraint's §Content Negotiation:
//   text/html (or no Accept on browser-shaped UA)  → HTML
//   text/markdown / text/plain                     → markdown
//   application/json                               → JSON
//   */* or absent on non-browser UA                → markdown (default)
export function negotiateAccept(accept: string, userAgent: string): Negotiated {
  const a = accept.toLowerCase();
  // application/json wins when explicit and not paired with text/html (browsers
  // routinely send application/json *after* text/html in their default Accept).
  if (a.includes("application/json") && !a.includes("text/html")) return "json";
  if (a.includes("text/html")) return "html";
  if (a.includes("text/markdown") || a.includes("text/plain")) return "markdown";
  const browserUa = /mozilla|chrome|safari|firefox|edge|webkit|opera/i.test(userAgent);
  return browserUa ? "html" : "markdown";
}
