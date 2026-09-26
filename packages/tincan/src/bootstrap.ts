// AI-readable bootstrap rendering per
// ams://canon/constraints/portal-bootstrap-content.
//
// Implementation choice: canon bundled at build time (one of the options the
// constraint's §Render-Time Composition endorses). Each prescribed section is
// resolved locally by `## <heading>` from the bundled canon file. The portal
// peels the leading blockquote markers (canon's universal shape for
// prescribed text), substitutes per-conversation values, and concatenates.
//
// No hardcoded canon prose. No markdown parser. When canon is unreachable or
// canon shape drifts (renamed section, removed blockquote), this module
// throws — the caller is responsible for serving 503. Per the constraint's
// §The Living-Canon Posture, frozen prose in source is forbidden because it
// drifts silently; loud failure is the correct degradation path.
//
// Cache: each section is cached in-isolate for the constraint's recommended
// 24h freshness budget. A cold isolate pays six MCP RTTs once; subsequent
// requests in that isolate serve from memory.
//
// See also:
//   - ams://canon/constraints/portal-bootstrap-content (what this implements)
//   - ams://canon/decisions/D0025-magic-link-url-is-the-tincan-portal
//   - ams://canon/constraints/wrapper-stays-cheap (renderer of governance,
//     not repository of governance)
//   - ams://canon/constraints/mcp-build-side-governance (the discipline this
//     follows: borrow the maintained MCP surface, do not handroll)

import type { ConvRecord } from "./types";
export type { ConvRecord };

import { PORTAL_BOOTSTRAP_CANON } from "./canon-bundle.generated";

// Canon is BUNDLED at build time (scripts/bundle-canon.mjs) — no runtime
// dependency on oddkit. Borrowed from ptxprint-mcp's bundled progressive docs
// (klappy/kitchen rail/6-learned/2026-09-05-ptxprint-docs-v2-progressive-disclosure).
// Canon edits ship by regenerating the bundle and deploying; `--check` flags drift.

// The six section names the constraint enumerates. These strings ARE canon's
// addressing surface — they are the `## <heading>` text in
// canon/constraints/portal-bootstrap-content.md, resolved from the bundle.
// If canon renames a heading, lookup fails and this module throws loudly; the operator hears about it.
const SECTION_IDENTITY = "Prescribed Text — Identity";
const SECTION_HOW_TO_JOIN = "Prescribed Text — How to Join";
const SECTION_PRE_BOUND = "Prescribed Text — Pre-bound Conversation";
const SECTION_REQUIRED_BEFORE_JOINING = "Prescribed Text — Required Before Joining";
const SECTION_IF_JOINING_DOESNT_WORK = "Prescribed Text — If Joining Doesn't Work";
const SECTION_FOR_HUMANS = "Prescribed Text — For Humans";

export interface BootstrapInputs {
  record: ConvRecord;
  amsMagicLink: string;
  tincanUrl: string;
}

// --- bundled canon section lookup ---------------------------------------

// Split the bundled canon into `## <heading>` sections once per isolate.
let sectionIndex: Map<string, string> | null = null;
function sections(): Map<string, string> {
  if (sectionIndex) return sectionIndex;
  const idx = new Map<string, string>();
  let name: string | null = null;
  let buf: string[] = [];
  for (const line of PORTAL_BOOTSTRAP_CANON.split("\n")) {
    const m = /^## (.+?)\s*$/.exec(line);
    if (m) {
      if (name) idx.set(name, buf.join("\n"));
      name = m[1]!;
      buf = [line];
    } else if (name) {
      buf.push(line);
    }
  }
  if (name) idx.set(name, buf.join("\n"));
  sectionIndex = idx;
  return idx;
}

// Returns the prescribed blockquote body for one section with `> ` peeled.
// Throws loudly if canon shape drifted (heading renamed/removed) — the
// caller serves 503 and the operator hears about it.
async function getSection(sectionName: string): Promise<string> {
  const sectionMd = sections().get(sectionName);
  if (!sectionMd) {
    const avail = [...sections().keys()].join(", ");
    throw new Error(`canon_section_missing:"${sectionName}":available=[${avail}]`);
  }
  const body = peelBlockquote(sectionMd);
  if (body === "") throw new Error(`canon_section_no_blockquote:"${sectionName}"`);
  return body;
}

// Strip the leading blockquote out of a canon section body.
// Canon's shape: `## <heading>`, optional commentary paragraph, then the
// prescribed text in a single contiguous `>`-prefixed block. We capture the
// first contiguous `>` block and peel the prefix. If canon ever changes to
// multi-block prescribed text, this captures only the first block — that
// surfaces as missing content in the rendered output, not silent fallback.
function peelBlockquote(sectionMd: string): string {
  const out: string[] = [];
  let entered = false;
  for (const line of sectionMd.split("\n")) {
    if (line.startsWith(">")) {
      out.push(line.replace(/^>\s?/, ""));
      entered = true;
    } else if (entered) {
      break;
    }
    // not yet entered: keep scanning past heading + commentary
  }
  return out.join("\n").trimEnd();
}

// --- composition ---------------------------------------------------------

interface Sections {
  identity: string;
  howToJoin: string;
  preBoundTemplate: string;
  requiredBeforeJoining: string;
  ifJoiningDoesntWork: string;
  forHumans: string;
}

async function loadAllSections(): Promise<Sections> {
  // Six local section lookups against the bundled canon.
  const [
    identity,
    howToJoin,
    preBoundTemplate,
    requiredBeforeJoining,
    ifJoiningDoesntWork,
    forHumans,
  ] = await Promise.all([
    getSection(SECTION_IDENTITY),
    getSection(SECTION_HOW_TO_JOIN),
    getSection(SECTION_PRE_BOUND),
    getSection(SECTION_REQUIRED_BEFORE_JOINING),
    getSection(SECTION_IF_JOINING_DOESNT_WORK),
    getSection(SECTION_FOR_HUMANS),
  ]);
  return {
    identity,
    howToJoin,
    preBoundTemplate,
    requiredBeforeJoining,
    ifJoiningDoesntWork,
    forHumans,
  };
}

function composePreBound(template: string, inputs: BootstrapInputs): string {
  const opInstr = (inputs.record.metadata as Record<string, unknown>)["instructions"];
  const opBlock =
    typeof opInstr === "string" && opInstr.length > 0
      ? `### Conversation purpose\n\n${opInstr}`
      : "";
  // Function replacements so `$`-prefixed sequences in user-supplied values
  // (namespace, alias, conversation_id, opBlock) are emitted verbatim rather
  // than triggering String.prototype.replace's special patterns ($$, $&, $`,
  // $'). Same fix as commit 31f06e0 on the prior implementation.
  return template
    .replace(/\{namespace\}/g, () => inputs.record.namespace)
    .replace(/\{alias\}/g, () => inputs.record.alias)
    .replace(/\{conversation_id\}/g, () => inputs.record.conversation_id)
    .replace(/\{operator_metadata_instructions_if_present\}/g, () => opBlock)
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

// --- public surface ------------------------------------------------------

export async function renderBootstrapMarkdown(
  inputs: BootstrapInputs,
): Promise<string> {
  const s = await loadAllSections();
  const preBound = composePreBound(s.preBoundTemplate, inputs);
  const forHumans = s.forHumans.replace(/\{tincan_url\}/g, () => inputs.tincanUrl);
  return (
    [
      s.identity,
      s.howToJoin,
      preBound,
      s.requiredBeforeJoining,
      s.ifJoiningDoesntWork,
      forHumans,
    ]
      .join("\n\n")
      .trim() + "\n"
  );
}

// JSON shape per ams://canon/constraints/portal-bootstrap-content
// §Content Negotiation: { instructions, pre_bound, post_endpoint, tincan_url }
// where `instructions` concatenates sections 1, 2, and 4.
export async function renderBootstrapJson(
  inputs: BootstrapInputs,
): Promise<{
  instructions: string;
  pre_bound: {
    namespace: string;
    alias: string;
    conversation_id: string;
    metadata: Record<string, unknown>;
  };
  post_endpoint: string;
  tincan_url: string;
}> {
  // Only fetch the three sections this shape needs (sections 1, 2, and 4 per
  // the constraint's §Content Negotiation). Avoids coupling JSON availability
  // to sections it never renders (Pre-bound, If Joining Doesn't Work, For
  // Humans), and skips three unnecessary lookups.
  const [identity, howToJoin, requiredBeforeJoining] = await Promise.all([
    getSection(SECTION_IDENTITY),
    getSection(SECTION_HOW_TO_JOIN),
    getSection(SECTION_REQUIRED_BEFORE_JOINING),
  ]);
  const instructions =
    [identity, howToJoin, requiredBeforeJoining].join("\n\n").trim() + "\n";
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
