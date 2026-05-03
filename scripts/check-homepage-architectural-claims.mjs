#!/usr/bin/env node
// scripts/check-homepage-architectural-claims.mjs
//
// Enforces ams://canon/decisions/D0013 (Homepage as PoC Surface).
// Scans the architectural surfaces of worker/src/homepage.ts for
// forbidden cardinality patterns. Demo body copy is intentionally
// not scanned — see ams://docs/homepage-governance for the
// architectural-vs-demo surface split.
//
// Architectural surfaces scanned:
//   - <title>...</title>
//   - <meta name="description" content="...">
//   - <meta property="og:title" content="...">
//   - <meta property="og:description" content="...">
//   - The hero subhead — currently a <span class="small"> whose first
//     child is <strong>AMS · Agent Messaging Service.</strong>
//
// Exit 0 = pass; exit 1 = governed surfaces contain forbidden patterns;
// exit 2 = could not locate one or more architectural surfaces (means
// the homepage was restructured and this script is out of date — fix
// the matchers in the same PR).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOMEPAGE_PATH = resolve(__dirname, "..", "worker", "src", "homepage.ts");

// Forbidden patterns. Case-insensitive. Kept in lockstep with
// ams://docs/homepage-governance §"Forbidden Patterns".
const FORBIDDEN = [
  { pattern: /\btwo agents?\b/i, label: '"two agent(s)"' },
  { pattern: /\b2 agents?\b/i, label: '"2 agent(s)"' },
  { pattern: /\bpair of agents\b/i, label: '"pair of agents"' },
  // "two-agent" allowed only when modifying convention/demo/instruction
  {
    pattern: /\btwo[- ]agent\b(?!\s*(convention|demo|instruction))/i,
    label: '"two-agent" (without convention/demo/instruction modifier)',
  },
];

// Surface matchers. Each returns the inner text of the surface or null.
// If any matcher returns null, the homepage was restructured and the
// script needs updating.
const SURFACES = [
  {
    name: "<title>",
    match: (src) => {
      const m = src.match(/<title>([\s\S]*?)<\/title>/i);
      return m ? m[1] : null;
    },
  },
  {
    name: '<meta name="description">',
    match: (src) => {
      const m = src.match(
        /<meta\s+name=["']description["']\s+content=(["'])([\s\S]*?)\1/i,
      );
      return m ? m[2] : null;
    },
  },
  {
    name: '<meta property="og:title">',
    match: (src) => {
      const m = src.match(
        /<meta\s+property=["']og:title["']\s+content=(["'])([\s\S]*?)\1/i,
      );
      return m ? m[2] : null;
    },
  },
  {
    name: '<meta property="og:description">',
    match: (src) => {
      const m = src.match(
        /<meta\s+property=["']og:description["']\s+content=(["'])([\s\S]*?)\1/i,
      );
      return m ? m[2] : null;
    },
  },
  {
    name: 'hero subhead (<span class="small">AMS · Agent Messaging Service. ...</span>)',
    match: (src) => {
      // Match the <span class="small"> that opens with the AMS · brand
      // line. The closing </span> is the first one after that opening.
      const m = src.match(
        /<span\s+class=["']small["']>\s*<strong>\s*AMS\s*·\s*Agent Messaging Service\.\s*<\/strong>([\s\S]*?)<\/span>/i,
      );
      return m ? m[1] : null;
    },
  },
];

function main() {
  let src;
  try {
    src = readFileSync(HOMEPAGE_PATH, "utf8");
  } catch (err) {
    console.error(`fail: cannot read ${HOMEPAGE_PATH}: ${err.message}`);
    process.exit(2);
  }

  const findings = [];
  const missing = [];

  for (const surface of SURFACES) {
    const text = surface.match(src);
    if (text === null) {
      missing.push(surface.name);
      continue;
    }
    for (const f of FORBIDDEN) {
      if (f.pattern.test(text)) {
        findings.push({ surface: surface.name, pattern: f.label, text: text.trim() });
      }
    }
  }

  if (missing.length > 0) {
    console.error("fail: architectural surface(s) not found in homepage.ts:");
    for (const m of missing) console.error(`  - ${m}`);
    console.error("");
    console.error(
      "this means the homepage was restructured and this script is out of date.",
    );
    console.error(
      "update SURFACES matchers in scripts/check-homepage-architectural-claims.mjs",
    );
    console.error("and ams://docs/homepage-governance §Architectural Surfaces.");
    process.exit(2);
  }

  if (findings.length > 0) {
    console.error(
      "fail: forbidden cardinality patterns found in architectural surfaces.",
    );
    console.error(
      "see ams://canon/decisions/D0013 and ams://docs/homepage-governance.",
    );
    console.error("");
    for (const f of findings) {
      console.error(`  surface: ${f.surface}`);
      console.error(`  pattern: ${f.pattern}`);
      console.error(`  text:    ${f.text}`);
      console.error("");
    }
    process.exit(1);
  }

  console.log("pass: all architectural surfaces are N-peer compliant.");
  console.log(`  scanned: ${SURFACES.length} surface(s)`);
  console.log(`  forbidden patterns checked: ${FORBIDDEN.length}`);
  process.exit(0);
}

main();
