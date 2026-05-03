// test-mcp-pair.mjs — exercises SPEC §3.1 items 4 and 5 end-to-end.
//
// Spawns two stdio MCP server subprocesses (mcp-server.mjs), each acting as
// a Claude Code session would. Drives them through the items 4/5 sequence:
//
//   item 4: agent A calls ams_create_conversation, gets a magic link.
//   item 5: agent B calls ams_join with that link, calls ams_send;
//           agent A receives notifications/ams/token within 5s.
//
// Both agents also verify D0009 structural exclusion: neither receives its
// own emissions back from the wire. Exit 0 on PASS, non-zero on FAIL.
//
// Usage:
//   AMS_HOST=http://127.0.0.1:8787 node test-mcp-pair.mjs

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const HOST = process.env.AMS_HOST ?? "https://ams.klappy.dev";
const TIMEOUT_MS = 8000;

class McpClient {
  constructor(label, env) {
    this.label = label;
    this.proc = spawn("node", ["mcp-server.mjs"], {
      cwd: new URL(".", import.meta.url).pathname,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc.stderr.on("data", (b) => process.stderr.write(`[${label}.err] ${b}`));
    this.id = 0;
    this.pending = new Map();
    this.notifications = [];
    this.notificationListeners = [];
    const rl = createInterface({ input: this.proc.stdout });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      let m;
      try { m = JSON.parse(line); } catch { return; }
      if (m.id !== undefined && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(`${m.error.code} ${m.error.message}`));
        else resolve(m.result);
      } else if (m.method) {
        this.notifications.push(m);
        for (const cb of this.notificationListeners.splice(0)) cb(m);
      }
    });
  }
  call(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timeout`));
        }
      }, TIMEOUT_MS);
    });
  }
  waitForNotification(method, predicate = () => true, timeoutMs = TIMEOUT_MS) {
    const found = this.notifications.find((n) => n.method === method && predicate(n.params));
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`waitForNotification(${method}) timeout`)), timeoutMs);
      const cb = (n) => {
        if (n.method === method && predicate(n.params)) {
          clearTimeout(t);
          resolve(n);
        } else {
          this.notificationListeners.push(cb);
        }
      };
      this.notificationListeners.push(cb);
    });
  }
  close() {
    try { this.proc.kill("SIGTERM"); } catch {}
  }
}

let passes = 0;
let fails = 0;
function check(name, ok, detail = "") {
  const tag = ok ? "PASS" : "FAIL";
  if (ok) passes++; else fails++;
  console.log(`  [${tag}] ${name}${detail ? " — " + detail : ""}`);
}

const NS_A = `mcptest-a-${Math.floor(Math.random() * 1e6)}`;
const NS_B = `mcptest-b-${Math.floor(Math.random() * 1e6)}`;

console.log(`SPEC §3.1 items 4 + 5 — MCP edge wrapper exercise (host=${HOST})`);
console.log("---");

const a = new McpClient("A", { AMS_HOST: HOST, AMS_NAMESPACE: NS_A });
const b = new McpClient("B", { AMS_HOST: HOST, AMS_NAMESPACE: NS_B });

try {
  // --- MCP initialize handshake (both clients) ---
  await a.call("initialize", { protocolVersion: "2024-11-05", capabilities: {} });
  await b.call("initialize", { protocolVersion: "2024-11-05", capabilities: {} });
  check("both MCP servers initialize", true);

  const aTools = await a.call("tools/list", {});
  const requiredTools = ["ams_create_conversation", "ams_join", "ams_send", "ams_set_metadata", "ams_leave", "ams_recv"];
  const presentTools = (aTools.tools ?? []).map((t) => t.name);
  const missing = requiredTools.filter((t) => !presentTools.includes(t));
  check("six MCP tools surfaced (per mcp-wrapper-conformance)", missing.length === 0, missing.length ? `missing: ${missing.join(",")}` : `${presentTools.length} tools`);

  // --- SPEC §3.1 item 4 ---
  const create = await a.call("tools/call", {
    name: "ams_create_conversation",
    arguments: {
      stream_name: "klappy-mcp",
      stream_metadata: { display_name: "Klappy via MCP" },
    },
  });
  const conv = create.structuredContent;
  check("item 4 — ams_create_conversation returns magic_link", typeof conv.magic_link === "string" && conv.magic_link.includes("?t="), conv.magic_link);
  check("item 4 — magic_link has alias-shaped path", /\/conversations\/[a-z0-9-]+/.test(conv.magic_link));

  // A also joins as the writer (to receive Ian's response and to drive the
  // §3.2 demo gate sequence).
  const aJoin = await a.call("tools/call", {
    name: "ams_join",
    arguments: {
      magic_link: conv.magic_link,
      stream_name: "klappy-mcp",
      stream_metadata: { display_name: "Klappy via MCP" },
    },
  });
  check("agent A joins its own conversation (writer)", aJoin.structuredContent?.ok === true);

  // --- SPEC §3.1 item 5 ---
  const bJoin = await b.call("tools/call", {
    name: "ams_join",
    arguments: {
      magic_link: conv.magic_link,
      stream_name: "ian-mcp",
      stream_metadata: { display_name: "Ian via MCP" },
    },
  });
  check("item 5 — second MCP client (different bearer) ams_join succeeds", bJoin.structuredContent?.ok === true);
  const bJoinedFrame = bJoin.structuredContent?.joined;
  const peers = bJoinedFrame?.peers ?? [];
  check("item 5 — B sees A in peers list", peers.length === 1 && peers[0].stream_name === "klappy-mcp");

  // B emits; A must receive notifications/ams/token within 5s.
  const aGotToken = a.waitForNotification(
    "notifications/ams/token",
    (params) => params?.data === "hello-from-ian-via-mcp",
    5000,
  );
  await b.call("tools/call", {
    name: "ams_send",
    arguments: { data: "hello-from-ian-via-mcp" },
  });
  let aTokenFrame;
  try {
    aTokenFrame = await aGotToken;
    check("item 5 — A receives B's token within 5s (push notification)", true, `ts=${aTokenFrame.params.ts}`);
  } catch (e) {
    check("item 5 — A receives B's token within 5s (push notification)", false, e.message);
  }

  // D0009 wire property: B must NOT receive its own emission via push.
  await new Promise((r) => setTimeout(r, 300));
  const bSelfEcho = b.notifications.find((n) =>
    n.method === "notifications/ams/token" && n.params?.data === "hello-from-ian-via-mcp",
  );
  check("D0009 — B (emitter) did NOT receive own token back via push", !bSelfEcho);

  // ams_recv parity: A's recvBuffer should also have the frame (push + buffer
  // are kept in lockstep so degradation-path clients see the same events).
  const aRecv = await a.call("tools/call", { name: "ams_recv", arguments: {} });
  const recvHasToken = aRecv.structuredContent?.frames?.some(
    (f) => f.method === "notifications/ams/token" && f.params?.data === "hello-from-ian-via-mcp",
  );
  check("ams_recv degradation path also surfaces the same token", !!recvHasToken);

  // Echo round trip: A emits, B receives. Confirms bidirectional flow.
  const bGotToken = b.waitForNotification(
    "notifications/ams/token",
    (params) => params?.data === "ack-from-klappy",
    5000,
  );
  await a.call("tools/call", { name: "ams_send", arguments: { data: "ack-from-klappy" } });
  try {
    await bGotToken;
    check("bidirectional — A→B token also delivered", true);
  } catch (e) {
    check("bidirectional — A→B token also delivered", false, e.message);
  }

  // ams_leave teardown.
  await b.call("tools/call", { name: "ams_leave", arguments: {} });
  check("ams_leave returns ok", true);
} catch (e) {
  console.error("test crashed:", e);
  fails++;
} finally {
  a.close();
  b.close();
}

console.log("---");
console.log(`PASS: ${passes}  FAIL: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
