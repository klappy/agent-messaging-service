// AI-readable bootstrap rendering per
// ams://canon/constraints/portal-bootstrap-content.
//
// Implementation choice: oddkit MCP client (one of the three options the
// constraint's §Render-Time Composition explicitly endorses). Each prescribed
// section is resolved by URI + section name through oddkit's tools/call —
// section addressing is oddkit's responsibility, not the portal's. The portal
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

const ODDKIT_MCP_URL = "https://oddkit.klappy.dev/mcp";
const CONSTRAINT_URI = "ams://canon/constraints/portal-bootstrap-content";
const KNOWLEDGE_BASE_URL = "https://github.com/klappy/agent-messaging-service";

// Canon-recommended freshness budget per §Render-Time Composition.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Oddkit timeout — generous so cold-canon fetches (which themselves walk a
// GitHub zip) complete, but bounded so a hung oddkit doesn't pin a request.
const ODDKIT_TIMEOUT_MS = 15_000;

// The six section names the constraint enumerates. These strings ARE canon's
// addressing surface — they are the `## <heading>` text in
// canon/constraints/portal-bootstrap-content.md, and oddkit's section= param
// resolves them. If canon renames a heading, oddkit returns "section not
// found" and this module throws loudly; the operator hears about it.
const SECTION_IDENTITY = "Prescribed Text — Identity";
const SECTION_HOW_TO_JOIN = "Prescribed Text — How to Join";
const SECTION_PRE_BOUND = "Prescribed Text — Pre-bound Conversation";
const SECTION_REQUIRED_BEFORE_JOINING = "Prescribed Text — Required Before Joining";
const SECTION_IF_JOINING_DOESNT_WORK = "Prescribed Text — If Joining Doesn't Work";
const SECTION_FOR_HUMANS = "Prescribed Text — For Humans";

interface CacheEntry {
  fetchedAt: number;
  body: string;
}
const sectionCache = new Map<string, CacheEntry>();

export interface BootstrapInputs {
  record: ConvRecord;
  amsMagicLink: string;
  tincanUrl: string;
}

// --- oddkit MCP client ---------------------------------------------------

// Single tools/call to oddkit_get for one section. Returns the prescribed
// blockquote body with `> ` markers peeled. Cached in-isolate for 24h.
// Throws on any oddkit failure or canon shape mismatch — caller serves 503.
async function oddkitGetSection(sectionName: string): Promise<string> {
  const cached = sectionCache.get(sectionName);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.body;

  const rpcBody = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "oddkit_get",
      arguments: {
        input: CONSTRAINT_URI,
        section: sectionName,
        knowledge_base_url: KNOWLEDGE_BASE_URL,
      },
    },
  });

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ODDKIT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(ODDKIT_MCP_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: rpcBody,
      signal: ac.signal,
    });
  } catch (err) {
    // Transient network/timeout failure. If we have any prior cached body,
    // serve it (stale beats 503 for a one-off blip); otherwise throw.
    if (cached) return cached.body;
    throw new Error(`oddkit_fetch_failed:${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (cached) return cached.body;
    throw new Error(`oddkit_http_${res.status}`);
  }

  // oddkit's Streamable HTTP response is a single SSE message frame:
  //   event: message
  //   data: <jsonrpc-response>
  // We don't need a streaming parser — just pluck the data line.
  const text = await res.text();
  const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
  if (!dataLine) throw new Error("oddkit_no_data_frame");

  const rpc = JSON.parse(dataLine.slice("data: ".length)) as {
    result?: { content?: Array<{ type: string; text: string }> };
    error?: { code?: number; message?: string };
  };
  if (rpc.error) {
    throw new Error(`oddkit_rpc_error:${rpc.error.message ?? "unknown"}`);
  }
  const innerText = rpc.result?.content?.[0]?.text;
  if (!innerText) throw new Error("oddkit_empty_tool_result");

  const envelope = JSON.parse(innerText) as {
    result?: {
      content?: string;
      error?: string;
      available_sections?: string[];
    };
  };
  if (envelope.result?.error) {
    // Section not found — canon shape drifted (heading renamed/removed).
    // Surface loudly with the available-sections list so the operator can
    // see the divergence in logs.
    const avail = envelope.result.available_sections?.join(", ") ?? "(none)";
    throw new Error(
      `oddkit_section_missing:"${sectionName}":available=[${avail}]`,
    );
  }
  const sectionMd = envelope.result?.content;
  if (!sectionMd) throw new Error("oddkit_no_section_content");

  const body = peelBlockquote(sectionMd);
  if (body === "") {
    throw new Error(`oddkit_section_no_blockquote:"${sectionName}"`);
  }

  sectionCache.set(sectionName, { fetchedAt: Date.now(), body });
  return body;
}

// Strip the leading blockquote out of an oddkit-returned section body.
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
  // Parallel fan-out — six independent oddkit calls. With the 24h in-isolate
  // cache, only cold isolates pay this cost; subsequent renders in the same
  // isolate hit memory.
  const [
    identity,
    howToJoin,
    preBoundTemplate,
    requiredBeforeJoining,
    ifJoiningDoesntWork,
    forHumans,
  ] = await Promise.all([
    oddkitGetSection(SECTION_IDENTITY),
    oddkitGetSection(SECTION_HOW_TO_JOIN),
    oddkitGetSection(SECTION_PRE_BOUND),
    oddkitGetSection(SECTION_REQUIRED_BEFORE_JOINING),
    oddkitGetSection(SECTION_IF_JOINING_DOESNT_WORK),
    oddkitGetSection(SECTION_FOR_HUMANS),
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
  const s = await loadAllSections();
  const instructions =
    [s.identity, s.howToJoin, s.requiredBeforeJoining].join("\n\n").trim() + "\n";
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
