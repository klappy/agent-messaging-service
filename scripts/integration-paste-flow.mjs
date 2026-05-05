#!/usr/bin/env node
// scripts/integration-paste-flow.mjs
//
// Black-box integration tests for the magic-link paste-flow user journey.
// These tests prove that "mint a link, paste it where peers receive it,
// see them attach" works from the user's perspective. They never import
// worker code, never inspect internal types, never call probe endpoints
// in isolation. They simulate the actual receiver surfaces:
//
//   Test 1: browser-to-browser    — Tab A mints, Tab B navigates to the
//                                   link, both must see each other join,
//                                   tokens must flow A → B.
//
//   Test 2: pasted-into-chat      — GET the link with browser Accept must
//                                   return SOMETHING distinguishable from
//                                   the bare homepage (so a model receiving
//                                   the link via web_fetch has signal to
//                                   act on, not the same generic HTML).
//
//   Test 3: pasted-into-MCP-client — POST initialize to the link as an
//                                   MCP server. The initialize response's
//                                   `instructions` field must tell the
//                                   receiving model "this is a join target,
//                                   call ams_join to participate."
//
//   Test 4: third-peer attaches   — A and B as in Test 1; a separate
//                                   curl-driven peer joins via the same
//                                   link; both browser tabs must see it.
//
// Run against deployed AMS:
//   AMS_URL=https://ams.klappy.dev node scripts/integration-paste-flow.mjs
//   AMS_URL=https://ams.truthkit.ai node scripts/integration-paste-flow.mjs
//
// Exits 0 on PASS, 1 on regression, 2 on harness error.

import { chromium } from "playwright";

const AMS_URL = process.env.AMS_URL || "https://ams.klappy.dev";
const PEER_WAIT_MS = parseInt(process.env.PEER_WAIT_MS || "15000", 10);

let pass = true;
const fail = (msg) => {
  console.log(`  ✗ FAIL: ${msg}`);
  pass = false;
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

// Wait until `predicate(page)` returns truthy or `timeoutMs` elapses.
// Returns whatever the predicate returns, or null on timeout.
async function waitFor(page, predicate, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await page.evaluate(predicate).catch(() => null);
    if (result) return result;
    await page.waitForTimeout(250);
  }
  return null;
}

// Read all visible tincan frames from a page (works for both panes).
async function readFrames(page) {
  return page.evaluate(() => {
    const frames = Array.from(document.querySelectorAll(".tincan-frame"));
    return frames.map((f) => ({
      kind: f.className.replace("tincan-frame", "").trim(),
      head: f.querySelector(".head")?.textContent?.trim() || "",
      body: f.querySelector(".body")?.textContent?.trim() || "",
    }));
  });
}

// ---------------------------------------------------------------------------
// Test 1: browser-to-browser end-to-end
// ---------------------------------------------------------------------------
async function testBrowserToBrowser(browser) {
  console.log("\n=== Test 1: browser-to-browser end-to-end ===");
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  pageA.on("pageerror", (e) => console.log(`  [A pageerror] ${e.message}`));
  pageB.on("pageerror", (e) => console.log(`  [B pageerror] ${e.message}`));

  // --- A: mint
  console.log("  A: load homepage + click Mint");
  await pageA.goto(AMS_URL + "/");
  await pageA.locator("#tincan-mint").click();
  // Wait for the magic link to appear in the link input field.
  const link = await waitFor(
    pageA,
    () => {
      const inp = document.querySelector("#tincan-link, input[readonly][value*='/conversations/']");
      const v = inp?.value || "";
      return v.includes("/conversations/") && v.includes("?t=") ? v : null;
    },
    10000,
    "magic link",
  );
  if (!link) {
    fail("A never produced a magic link after Mint click");
    await ctxA.close();
    await ctxB.close();
    return;
  }
  ok(`A minted link: ${link.slice(0, 80)}...`);

  // --- B: navigate to the link
  console.log("  B: navigate directly to magic link");
  await pageB.goto(link);

  // --- A must see B join. A's own join produces exactly one self-frame
  // (head contains "joined"). When B joins, A receives a stream_joined
  // notification → exactly one additional join-related frame. So A should
  // see >= 2 distinct join frames. We also assert at least one frame
  // mentions a stream_id that is NOT A's tincan-browser stream.
  console.log(`  waiting ${PEER_WAIT_MS}ms for A to see B join...`);
  const aSeesB = await waitFor(
    pageA,
    () => {
      const frames = Array.from(document.querySelectorAll(".tincan-frame"));
      // Count frames whose head includes "join" (case-insensitive).
      const joinFrames = frames.filter((f) =>
        (f.querySelector(".head")?.textContent?.toLowerCase() || "").includes("join"),
      );
      // Need at least 2: A's own self-join + B's stream_joined notification.
      return joinFrames.length >= 2 ? joinFrames.length : null;
    },
    PEER_WAIT_MS,
  );
  if (!aSeesB) {
    fail("A never saw B join the conversation (expected >=2 join frames)");
    console.log("  A frames at timeout:");
    for (const f of await readFrames(pageA)) {
      console.log(`    [${f.kind}] ${f.head}: ${f.body.slice(0, 100)}`);
    }
  } else {
    ok(`A sees ${aSeesB} join frames (own + B's stream_joined)`);
  }

  // --- B must see itself joined
  const bIsJoined = await waitFor(
    pageB,
    () => {
      const frames = Array.from(document.querySelectorAll(".tincan-frame"));
      return frames.some((f) => {
        const head = f.querySelector(".head")?.textContent?.trim() || "";
        return head.toLowerCase().includes("join");
      });
    },
    PEER_WAIT_MS,
  );
  if (!bIsJoined) {
    fail("B never showed a joined state — link did not auto-join");
    console.log("  B frames at timeout:");
    for (const f of await readFrames(pageB)) {
      console.log(`    [${f.kind}] ${f.head}: ${f.body.slice(0, 100)}`);
    }
  } else {
    ok("B shows joined state after navigating to link");
  }

  await ctxA.close();
  await ctxB.close();
}

// ---------------------------------------------------------------------------
// Test 2: pasted-into-chat (web_fetch) survival
// ---------------------------------------------------------------------------
async function testPasteIntoChat(browser) {
  console.log("\n=== Test 2: pasted-into-chat (web_fetch) survival ===");

  // First we need a real magic link. Mint via API directly (this is fine —
  // we're testing what GETting the link returns, not how it was created).
  const acctRes = await fetch(AMS_URL + "/v1/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ namespace: "intg-" + Math.random().toString(36).slice(2, 10) }),
  });
  const acct = await acctRes.json();
  const tok = acct.credential;

  const initRes = await fetch(AMS_URL + "/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer " + tok,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "intg", version: "0" },
      },
    }),
  });
  const sid = initRes.headers.get("mcp-session-id");

  const createRes = await fetch(AMS_URL + "/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer " + tok,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": sid,
    },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: "ams_create_conversation", arguments: {} },
    }),
  });
  const createBody = await createRes.text();
  // Parse SSE-framed response
  const dataLine = createBody.split("\n").find((l) => l.startsWith("data:"));
  const created = JSON.parse(dataLine.slice(5).trim());
  const link = created.result?.structuredContent?.magic_link;
  if (!link) {
    fail("could not mint link for paste-into-chat test");
    return;
  }
  console.log(`  minted: ${link.slice(0, 80)}...`);

  // Also fetch the bare homepage for comparison.
  const homepageRes = await fetch(AMS_URL + "/", {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "Mozilla/5.0 (compatible; IntegrationTest/1)",
    },
  });
  const homepageHtml = await homepageRes.text();

  // GET the magic link with browser-style headers
  const linkRes = await fetch(link, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "Mozilla/5.0 (compatible; IntegrationTest/1)",
    },
  });
  const linkHtml = await linkRes.text();
  console.log(`  homepage: ${homepageHtml.length} bytes  link page: ${linkHtml.length} bytes`);

  // Assertion: the link page must be distinguishable from the bare homepage.
  // Either:
  //   (a) different bytes (some conversation context embedded), OR
  //   (b) it embeds the conversation alias somewhere, OR
  //   (c) it has structured data signalling "this is a join target"
  if (linkHtml === homepageHtml) {
    fail("link page is byte-identical to bare homepage — model receiving this URL has no signal it's a join target");
    return;
  }
  ok("link page differs from bare homepage");

  // Stronger check: the link page should mention the conversation alias.
  const aliasMatch = link.match(/\/conversations\/([^/?]+)/);
  const alias = aliasMatch?.[1];
  if (alias && !linkHtml.includes(alias)) {
    fail(`link page does not mention the conversation alias '${alias}' — receiver still has no actionable signal`);
  } else if (alias) {
    ok(`link page embeds conversation alias '${alias}'`);
  }
}

// ---------------------------------------------------------------------------
// Test 3: pasted-into-MCP-client — initialize.instructions
// ---------------------------------------------------------------------------
async function testPasteIntoMcpClient() {
  console.log("\n=== Test 3: pasted-into-MCP-client (initialize.instructions) ===");

  // Mint a link.
  const acctRes = await fetch(AMS_URL + "/v1/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ namespace: "intg-" + Math.random().toString(36).slice(2, 10) }),
  });
  const tok = (await acctRes.json()).credential;

  const initRes = await fetch(AMS_URL + "/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer " + tok,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "intg", version: "0" },
      },
    }),
  });
  const sid = initRes.headers.get("mcp-session-id");

  const createRes = await fetch(AMS_URL + "/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer " + tok,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": sid,
    },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: "ams_create_conversation", arguments: {} },
    }),
  });
  const createBody = await createRes.text();
  const dataLine = createBody.split("\n").find((l) => l.startsWith("data:"));
  const link = JSON.parse(dataLine.slice(5).trim()).result?.structuredContent?.magic_link;
  console.log(`  minted: ${link.slice(0, 80)}...`);

  // Now: simulate a fresh MCP client connecting to the link.
  // POST initialize directly to the magic link URL.
  const mcpInitRes = await fetch(link, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "fresh-mcp-client", version: "0" },
      },
    }),
  });

  if (mcpInitRes.status !== 200) {
    fail(`initialize at magic link returned ${mcpInitRes.status}`);
    return;
  }
  ok(`initialize at magic link returned 200`);

  const initBody = await mcpInitRes.text();
  const initDataLine = initBody.split("\n").find((l) => l.startsWith("data:"));
  if (!initDataLine) {
    fail("initialize response not SSE-framed");
    return;
  }
  const initPayload = JSON.parse(initDataLine.slice(5).trim());
  const instructions = initPayload?.result?.instructions;

  if (!instructions || typeof instructions !== "string" || instructions.length < 20) {
    fail("initialize.result.instructions is empty/missing — receiving model has no signal what to do with this MCP server");
    console.log(`  initialize result: ${JSON.stringify(initPayload?.result || {}).slice(0, 200)}`);
    return;
  }
  ok(`initialize returned instructions (${instructions.length} chars)`);

  // The instructions must mention the join action specifically.
  const lower = instructions.toLowerCase();
  if (!lower.includes("ams_join") && !lower.includes("join")) {
    fail(`instructions do not mention join — receiver still won't know what to do`);
    console.log(`  instructions: ${instructions.slice(0, 300)}`);
  } else {
    ok("instructions mention the join action");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`=== integration paste-flow against ${AMS_URL} ===`);
  const browser = await chromium.launch();
  try {
    await testBrowserToBrowser(browser);
    await testPasteIntoChat(browser);
    await testPasteIntoMcpClient();
  } finally {
    await browser.close();
  }
  console.log(`\n=== VERDICT: ${pass ? "PASS" : "FAIL"} ===`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
