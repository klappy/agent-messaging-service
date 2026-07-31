// Regression tests for the oddkit envelope parser in bootstrap.ts.
//
// Incident (2026-06): oddkit flipped its default get envelope to the
// Retrieval Disclosure Contract shape (result.data.body) while this module
// still read the legacy shape (result.content). Every tincan render threw
// `oddkit_no_section_content` and the portal served 503
// `bootstrap_unavailable` for all conversations.
//
// Two layers of protection:
//   1. Fixture tests — both envelope shapes parse; both miss shapes throw
//      the loud section_missing error. Deterministic, offline.
//   2. Live contract test — fetches all six prescribed sections from the
//      real oddkit MCP endpoint exactly as production does. This is the
//      layer that catches *upstream* drift before users do; fixtures
//      cannot. Gated behind ODDKIT_LIVE_TEST=1 so local offline runs stay
//      green; CI sets it.
//
// Runner: node:test via tsx (no framework dependency beyond the TS loader).

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOddkitSectionEnvelope } from "./bootstrap";

// --- fixtures: the two success shapes --------------------------------------

const PRESCRIBED_SECTION_MD = [
  "## Prescribed Text — Identity",
  "",
  "Commentary the portal must skip.",
  "",
  "> # AMS Magic Link",
  ">",
  "> You are looking at an AMS conversation address.",
].join("\n");

const EXPECTED_PEELED = [
  "# AMS Magic Link",
  "",
  "You are looking at an AMS conversation address.",
].join("\n");

test("parses the disclosure-contract envelope (result.data.body)", () => {
  const inner = JSON.stringify({
    action: "get",
    result: {
      status: "FOUND",
      data: {
        uri: "klappy://canon/constraints/portal-bootstrap-content",
        body: PRESCRIBED_SECTION_MD,
        section: "Prescribed Text — Identity",
      },
      disclosure_applied: ["body"],
    },
  });
  assert.equal(
    parseOddkitSectionEnvelope(inner, "Prescribed Text — Identity"),
    EXPECTED_PEELED,
  );
});

test("parses the legacy envelope (result.content)", () => {
  const inner = JSON.stringify({
    result: { content: PRESCRIBED_SECTION_MD },
  });
  assert.equal(
    parseOddkitSectionEnvelope(inner, "Prescribed Text — Identity"),
    EXPECTED_PEELED,
  );
});

// --- fixtures: the two miss shapes ------------------------------------------

test("contract-shape miss (status NOT_FOUND) throws section_missing with available list", () => {
  const inner = JSON.stringify({
    action: "get",
    result: {
      status: "NOT_FOUND",
      error: 'Section not found: "Ghost"',
      available_sections: ["Description", "Prescribed Text — Identity"],
    },
  });
  assert.throws(
    () => parseOddkitSectionEnvelope(inner, "Ghost"),
    /oddkit_section_missing:"Ghost":available=\[Description, Prescribed Text — Identity\]/,
  );
});

test("legacy miss (result.error) throws section_missing", () => {
  const inner = JSON.stringify({
    result: { error: "Section not found", available_sections: ["A", "B"] },
  });
  assert.throws(
    () => parseOddkitSectionEnvelope(inner, "Ghost"),
    /oddkit_section_missing:"Ghost":available=\[A, B\]/,
  );
});

test("success body without a blockquote throws section_no_blockquote (no silent fallback)", () => {
  const inner = JSON.stringify({
    result: { status: "FOUND", data: { body: "## Heading\n\nProse only." } },
  });
  assert.throws(
    () => parseOddkitSectionEnvelope(inner, "Prescribed Text — Identity"),
    /oddkit_section_no_blockquote/,
  );
});

test("empty result throws no_section_content", () => {
  const inner = JSON.stringify({ result: { status: "FOUND", data: {} } });
  assert.throws(
    () => parseOddkitSectionEnvelope(inner, "Prescribed Text — Identity"),
    /oddkit_no_section_content/,
  );
});

// --- live contract test ------------------------------------------------------
//
// Mirrors production exactly: same MCP endpoint, same tool, same six section
// names, same knowledge_base_url, same parser. If oddkit changes its envelope
// again, or canon renames a prescribed heading, this fails in CI before the
// portal serves a single 503.

const ODDKIT_MCP_URL = "https://oddkit.klappy.dev/mcp";
const CONSTRAINT_URI = "ams://canon/constraints/portal-bootstrap-content";
const KNOWLEDGE_BASE_URL = "https://github.com/klappy/agent-messaging-service";

const PRESCRIBED_SECTIONS = [
  "Prescribed Text — Identity",
  "Prescribed Text — How to Join",
  "Prescribed Text — Pre-bound Conversation",
  "Prescribed Text — Required Before Joining",
  "Prescribed Text — If Joining Doesn't Work",
  "Prescribed Text — For Humans",
];

test(
  "live: all six prescribed sections resolve through the real oddkit endpoint",
  { skip: process.env.ODDKIT_LIVE_TEST !== "1" },
  async () => {
    for (const sectionName of PRESCRIBED_SECTIONS) {
      const res = await fetch(ODDKIT_MCP_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
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
        }),
      });
      assert.ok(res.ok, `oddkit HTTP ${res.status} for "${sectionName}"`);

      const text = await res.text();
      const dataLine = text
        .split("\n")
        .find((l) => l.startsWith("data: "));
      assert.ok(dataLine, `no SSE data frame for "${sectionName}"`);

      const rpc = JSON.parse(dataLine.slice("data: ".length)) as {
        result?: { content?: Array<{ type: string; text: string }> };
        error?: { message?: string };
      };
      assert.ok(!rpc.error, `rpc error for "${sectionName}": ${rpc.error?.message}`);
      const innerText = rpc.result?.content?.[0]?.text;
      assert.ok(innerText, `empty tool result for "${sectionName}"`);

      // The production parser, against the live envelope.
      const body = parseOddkitSectionEnvelope(innerText, sectionName);
      assert.ok(
        body.length > 0,
        `parsed empty prescribed body for "${sectionName}"`,
      );
    }
  },
);
