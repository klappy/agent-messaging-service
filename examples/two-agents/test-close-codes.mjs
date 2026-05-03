// test-close-codes.mjs — verifies PROTOCOL §6 close codes fire on the wire.
//
// For each scenario, opens a WebSocket and asserts the close code/reason
// observed by the client matches the spec. These are the codes that landed
// in this Day-3 build; 4003 and 4290 remain deferred (see journal H entry).
//
// Usage:
//   AMS_HOST=http://127.0.0.1:8787 node test-close-codes.mjs

import WebSocket from "ws";
import { createAccount, createConversation } from "./ams-client.mjs";

const HOST = process.env.AMS_HOST ?? "https://ams.klappy.dev";
const WS_HOST = HOST.replace(/^http/, "ws");

let passes = 0, fails = 0;
function check(name, ok, detail = "") {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
  if (ok) passes++; else fails++;
}

function awaitClose(url, headers, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    const t = setTimeout(() => { try { ws.terminate(); } catch {} reject(new Error("timeout")); }, timeoutMs);
    ws.on("close", (code, reasonBuf) => {
      clearTimeout(t);
      resolve({ code, reason: reasonBuf?.toString?.("utf8") ?? "" });
    });
    ws.on("error", () => { /* swallow — we expect close events not errors */ });
  });
}

console.log(`PROTOCOL §6 close codes (host=${HOST})`);
console.log("---");

// Bootstrap: real account + real conversation we can poke at.
const acc = await createAccount(`closecodes-${Math.floor(Math.random() * 1e9).toString(36)}`, { host: HOST });
const conv = await createConversation(acc.credential, acc.namespace, { host: HOST });

// Substitute origin for AMS_HOST when set (matches ams-client.mjs convention).
function liveUrl(magicLinkPath, opts = {}) {
  const u = new URL(conv.magic_link);
  u.protocol = WS_HOST.startsWith("wss") ? "wss:" : "ws:";
  u.host = new URL(WS_HOST).host;
  if (opts.namespace) u.pathname = u.pathname.replace(/^\/[^/]+/, `/${opts.namespace}`);
  if (opts.alias) u.pathname = u.pathname.replace(/conversations\/[^/?]+/, `conversations/${opts.alias}`);
  if (opts.dropToken) u.searchParams.delete("t");
  if (opts.badToken) u.searchParams.set("t", "deadbeef-not-a-real-token-aaaaaaaaa");
  u.pathname = `${u.pathname.replace(/\/$/, "")}/connect`;
  return u.toString();
}

// 4001 — missing 't' query param.
{
  const url = liveUrl(conv.magic_link, { dropToken: true });
  const r = await awaitClose(url, { authorization: `Bearer ${acc.credential}` });
  check("4001 (missing permissive token) closes with 4001 invalid_magic_link",
    r.code === 4001 && r.reason === "invalid_magic_link", `got ${r.code} ${r.reason}`);
}

// 4001 — invalid 't' query param.
{
  const url = liveUrl(conv.magic_link, { badToken: true });
  const r = await awaitClose(url, { authorization: `Bearer ${acc.credential}` });
  check("4001 (invalid permissive token) closes with 4001 invalid_magic_link",
    r.code === 4001 && r.reason === "invalid_magic_link", `got ${r.code} ${r.reason}`);
}

// 4002 — missing Authorization header.
{
  const url = liveUrl(conv.magic_link);
  const r = await awaitClose(url, {});
  check("4002 (missing Authorization) closes with 4002 invalid_credential",
    r.code === 4002 && r.reason === "invalid_credential", `got ${r.code} ${r.reason}`);
}

// 4002 — invalid bearer.
{
  const url = liveUrl(conv.magic_link);
  const r = await awaitClose(url, { authorization: "Bearer ams_sk_definitely_not_real" });
  check("4002 (invalid bearer) closes with 4002 invalid_credential",
    r.code === 4002 && r.reason === "invalid_credential", `got ${r.code} ${r.reason}`);
}

// 4005 — conversation not found (use a real-ish-looking but unminted alias).
{
  const url = liveUrl(conv.magic_link, { alias: "nope-falcon-0000" });
  const r = await awaitClose(url, { authorization: `Bearer ${acc.credential}` });
  check("4005 (conversation not found) closes with 4005 conversation_not_found",
    r.code === 4005 && r.reason === "conversation_not_found", `got ${r.code} ${r.reason}`);
}

// 4400 — invalid X-AMS-Stream-Name header.
{
  const url = liveUrl(conv.magic_link);
  const r = await awaitClose(url, {
    authorization: `Bearer ${acc.credential}`,
    "x-ams-stream-name": "INVALID NAME WITH SPACES",
  });
  check("4400 (malformed connect header — stream name) closes with 4400",
    r.code === 4400 && r.reason === "invalid_stream_name_header", `got ${r.code} ${r.reason}`);
}

// 4400 — malformed frame after successful connect.
{
  const url = liveUrl(conv.magic_link);
  const r = await new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { authorization: `Bearer ${acc.credential}` } });
    let joined = false;
    const t = setTimeout(() => { try { ws.terminate(); } catch {} reject(new Error("timeout")); }, 5000);
    ws.on("message", () => {
      if (!joined) {
        joined = true;
        ws.send("not-json-at-all");
      }
    });
    ws.on("close", (code, reasonBuf) => {
      clearTimeout(t);
      resolve({ code, reason: reasonBuf?.toString?.("utf8") ?? "" });
    });
    ws.on("error", () => {});
  });
  check("4400 (malformed frame after join) closes with 4400 malformed_frame",
    r.code === 4400 && r.reason === "malformed_frame", `got ${r.code} ${r.reason}`);
}

// 4004 — same alias, different account, same stream name.
{
  // First connection holds the stream name.
  const url1 = liveUrl(conv.magic_link);
  const ws1 = new WebSocket(url1, {
    headers: {
      authorization: `Bearer ${acc.credential}`,
      "x-ams-stream-name": "claimed-stream",
    },
  });
  await new Promise((resolve) => ws1.on("message", resolve));
  // Second connection: different account, same stream name → 4004.
  const acc2 = await createAccount(`closecodes2-${Math.floor(Math.random() * 1e9).toString(36)}`, { host: HOST });
  const r = await awaitClose(url1, {
    authorization: `Bearer ${acc2.credential}`,
    "x-ams-stream-name": "claimed-stream",
  });
  check("4004 (cross-account stream-name conflict) closes with 4004 stream_name_conflict",
    r.code === 4004 && r.reason === "stream_name_conflict", `got ${r.code} ${r.reason}`);
  ws1.close();
}

console.log("---");
console.log(`PASS: ${passes}  FAIL: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
