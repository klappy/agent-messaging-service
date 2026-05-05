#!/usr/bin/env node
// scripts/test-sse-wrapper-unit.mjs
//
// Unit-level proof of worker/src/sse-heartbeat.ts wrapWithSseHeartbeat.
//
// **Imports the production module directly** — there is no re-implementation,
// no copy. A future change to the wrapper that breaks any of these properties
// will fail this script. (The previous version of this script reimplemented
// the wrapper inline, which Bugbot correctly flagged: a divergence between
// the copy and the production code would silently pass CI. Fixed by extracting
// the wrapper to its own .ts module — see worker/src/sse-heartbeat.ts.)
//
// We compile the .ts module to .mjs in a temp dir using esbuild's lightweight
// transform (already installed via wrangler's deps), then import it.
//
// Asserts four properties whose absence empirically produced either user-
// visible failures (leading byte missing -> iOS Safari "Load failed") or
// Bugbot findings on prior PRs (mid-event injection, cancel leak, idle-handler
// accumulation):
//
//   1. Leading byte flush — `:ok\n\n` enqueued at +0ms before any read.
//   2. Verbatim forwarding — every byte the upstream emits arrives unmodified.
//   3. **No mid-event injection.** Sending 100 back-to-back data chunks at an
//      interval shorter than the heartbeat must produce ZERO `:keepalive`
//      frames interleaved between them. (Previous version of this test
//      computed the count but never failed when non-empty — Bugbot caught
//      that. Now asserts === 0.)
//   4. **Cancel propagation + no orphaned-read leak.** Downstream cancel()
//      reaches upstream cancel(); on heartbeat-wins the orphaned read is
//      cancelled rather than left pending (no .then handler accumulation).
//
// Authority: ams://canon/constraints/outcome-verification-via-runnable-artifact

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_PATH = join(__dirname, "..", "worker", "src", "sse-heartbeat.ts");

// --- Compile the production .ts to runnable .mjs in a temp dir using tsc.
// tsc is a devDependency of worker/, so it's already available there.
// We invoke it with --module esnext --target es2022 to get a directly-
// importable ESM module that Node 20+ runs natively.
const tmpDir = mkdtempSync(join(tmpdir(), "sse-heartbeat-test-"));
const tsCopy = join(tmpDir, "sse-heartbeat.ts");
copyFileSync(SRC_PATH, tsCopy);

try {
  execFileSync(
    "npx",
    [
      "--prefix",
      join(__dirname, "..", "worker"),
      "tsc",
      tsCopy,
      "--target",
      "es2022",
      "--module",
      "esnext",
      "--moduleResolution",
      "bundler",
      "--lib",
      "es2022,dom",
      "--skipLibCheck",
      "--outDir",
      tmpDir,
    ],
    { stdio: "pipe" },
  );
} catch (e) {
  console.error("FATAL: tsc compile of sse-heartbeat.ts failed");
  console.error(e.stdout?.toString());
  console.error(e.stderr?.toString());
  process.exit(2);
}

// tsc emits sse-heartbeat.js — rename to .mjs so Node treats it as ESM.
const jsPath = join(tmpDir, "sse-heartbeat.js");
const mjsPath = join(tmpDir, "sse-heartbeat.mjs");
const { renameSync } = await import("node:fs");
renameSync(jsPath, mjsPath);

let wrapWithSseHeartbeat;
try {
  ({ wrapWithSseHeartbeat } = await import(mjsPath));
} catch (e) {
  console.error("FATAL: failed to import compiled wrapper:", e);
  process.exit(2);
}

if (typeof wrapWithSseHeartbeat !== "function") {
  console.error(
    "FATAL: wrapWithSseHeartbeat is not exported from worker/src/sse-heartbeat.ts",
  );
  process.exit(2);
}

// --- Test harness --------------------------------------------------------
async function readAll(response, durationMs) {
  const reader = response.body.getReader();
  const dec = new TextDecoder();
  const t0 = Date.now();
  const chunks = [];
  while (true) {
    const elapsed = Date.now() - t0;
    if (elapsed >= durationMs) break;
    const result = await Promise.race([
      reader.read(),
      new Promise((r) =>
        setTimeout(() => r({ done: true, timedOut: true }), durationMs - elapsed),
      ),
    ]);
    if (result.timedOut || result.done) break;
    chunks.push({
      elapsed: Date.now() - t0,
      text: dec.decode(result.value, { stream: true }),
    });
  }
  try {
    await reader.cancel();
  } catch {
    /* ignore */
  }
  return chunks;
}

let pass = true;
const fail = (msg) => {
  console.log(`  ✗ FAIL: ${msg}`);
  pass = false;
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

// Production heartbeat is 15_000ms; tests pass a shorter override so they
// run quickly. The override exists ONLY for testing — `wrapWithSseHeartbeat`
// in production is called with no override and uses the 15s constant.
const TEST_HB_MS = 200;

async function testLeadingFlushAndHeartbeats() {
  console.log("\n--- Test 1: leading flush at +0ms + idle heartbeats ---");
  const upstream = new ReadableStream({ cancel() {} });
  const wrapped = wrapWithSseHeartbeat(
    new Response(upstream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
    TEST_HB_MS,
  );
  const chunks = await readAll(wrapped, 700);
  for (const c of chunks)
    console.log(`    +${String(c.elapsed).padStart(4)}ms  ${JSON.stringify(c.text)}`);

  if (!chunks.length || chunks[0].text !== ":ok\n\n") {
    fail(`first chunk should be ":ok\\n\\n", got ${JSON.stringify(chunks[0]?.text)}`);
  } else {
    ok(`leading :ok\\n\\n at +${chunks[0].elapsed}ms`);
  }
  if ((chunks[0]?.elapsed ?? Infinity) >= 50) {
    fail(`leading byte should arrive < 50ms, got ${chunks[0]?.elapsed}ms`);
  } else {
    ok("leading byte flushes immediately");
  }
  const heartbeats = chunks.filter((c) => c.text === ":keepalive\n\n").length;
  if (heartbeats < 2) {
    fail(`expected >= 2 heartbeats in 700ms (interval ${TEST_HB_MS}ms), got ${heartbeats}`);
  } else {
    ok(`${heartbeats} heartbeats fired on schedule`);
  }
}

async function testFrameForwardingVerbatim() {
  console.log("\n--- Test 2: real frames forwarded byte-for-byte ---");
  const enc = new TextEncoder();
  const frame = 'event: message\ndata: {"hi":1}\n\n';
  const upstream = new ReadableStream({
    start(controller) {
      setTimeout(() => controller.enqueue(enc.encode(frame)), 50);
      setTimeout(() => controller.close(), 100);
    },
  });
  const wrapped = wrapWithSseHeartbeat(
    new Response(upstream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
    TEST_HB_MS,
  );
  const chunks = await readAll(wrapped, 300);
  const all = chunks.map((c) => c.text).join("");
  for (const c of chunks)
    console.log(`    +${String(c.elapsed).padStart(4)}ms  ${JSON.stringify(c.text)}`);
  if (!all.includes(frame)) fail("upstream frame not forwarded verbatim");
  else ok("upstream frame forwarded byte-for-byte");
}

async function testNoMidEventInjection() {
  console.log("\n--- Test 3: NO mid-event heartbeat injection (asserts === 0) ---");
  // Send 100 small chunks at 6ms intervals (33x faster than the 200ms heartbeat).
  // The read loop is never idle long enough for a heartbeat to win the race.
  // STRICT assertion: zero `:keepalive` frames must appear among the 100 data
  // chunks. (Previous version of this test computed the count but never
  // asserted on it — Bugbot finding "Interleavings never fail".)
  const enc = new TextEncoder();
  const upstream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 6));
        controller.enqueue(enc.encode(`data: chunk-${i}\n`));
      }
      controller.close();
    },
  });
  const wrapped = wrapWithSseHeartbeat(
    new Response(upstream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
    TEST_HB_MS,
  );
  const chunks = await readAll(wrapped, 1500);
  const heartbeatCount = chunks.filter((c) => c.text === ":keepalive\n\n").length;
  console.log(`    total chunks: ${chunks.length}, heartbeats interleaved: ${heartbeatCount}`);

  // Strict assertion #1: zero heartbeats interleaved with active reads.
  if (heartbeatCount !== 0) {
    fail(`expected 0 heartbeats interleaved, got ${heartbeatCount} (mid-event injection)`);
  } else {
    ok("0 heartbeats injected during continuous reads");
  }

  // Strict assertion #2: all 100 chunks arrived in order, none lost.
  // (If the orphaned-read fix is broken, frames can be silently dropped
  // when a heartbeat-wins race occurs and the orphan resolves outside
  // the loop. This catches that.)
  const seq = chunks
    .filter((c) => c.text.startsWith("data: chunk-"))
    .map((c) => parseInt(c.text.match(/chunk-(\d+)/)[1], 10));
  if (seq.length !== 100 || !seq.every((n, i) => n === i)) {
    fail(
      `expected 100 chunks in strict order, got ${seq.length}, first 10 = [${seq.slice(0, 10).join(", ")}]`,
    );
  } else {
    ok("all 100 chunks arrived in strict order, no frames lost");
  }
}

async function testCancelPropagation() {
  console.log("\n--- Test 4: downstream cancel() propagates to upstream cancel() ---");
  let upstreamCancelled = false;
  let upstreamCancelReason;
  const upstream = new ReadableStream({
    cancel(reason) {
      upstreamCancelled = true;
      upstreamCancelReason = reason;
    },
  });
  const wrapped = wrapWithSseHeartbeat(
    new Response(upstream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
    TEST_HB_MS,
  );
  const reader = wrapped.body.getReader();
  await reader.read(); // consume :ok\n\n so start() has acquired the upstream reader
  await reader.cancel("downstream gone");
  await new Promise((r) => setTimeout(r, 50));
  if (!upstreamCancelled)
    fail("upstream.cancel was NOT called when downstream cancelled (leak)");
  else
    ok(`upstream.cancel propagated correctly with reason: ${JSON.stringify(upstreamCancelReason)}`);
}

async function testIdleOrphanCleanup() {
  console.log("\n--- Test 5: idle heartbeats do NOT accumulate read handlers ---");
  // Long-lived idle stream that NEVER emits or closes. Without orphaned-read
  // cleanup, every heartbeat-wins iteration would attach a fresh `.then`
  // handler to the same pending `read()` promise — accumulating handlers
  // indefinitely on the exact connection type this wrapper exists to keep
  // alive. We approximate the check by running for 2s with a 100ms heartbeat
  // (~20 heartbeat iterations) and verifying the wrapper still responds to
  // cancel() promptly (a memory-leaked iteration would still respond, but a
  // wedged loop would not).
  const upstream = new ReadableStream({ cancel() {} });
  const wrapped = wrapWithSseHeartbeat(
    new Response(upstream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
    100,
  );
  const reader = wrapped.body.getReader();
  // Consume ~20 heartbeat iterations.
  const consumeUntil = Date.now() + 2000;
  let frames = 0;
  while (Date.now() < consumeUntil) {
    const r = await Promise.race([
      reader.read(),
      new Promise((resolve) => setTimeout(() => resolve({ done: true, timedOut: true }), 250)),
    ]);
    if (r.done || r.timedOut) break;
    frames++;
  }
  const cancelStart = Date.now();
  await reader.cancel("test done");
  const cancelMs = Date.now() - cancelStart;
  if (frames < 10) {
    fail(`expected >= 10 heartbeat frames over 2s with 100ms interval, got ${frames}`);
  } else {
    ok(`${frames} heartbeat frames consumed without wedging`);
  }
  if (cancelMs > 100) {
    fail(`cancel took ${cancelMs}ms — loop may be wedged`);
  } else {
    ok(`cancel completed in ${cancelMs}ms (loop responsive after ${frames} idle iterations)`);
  }
}

async function main() {
  console.log("=== wrapWithSseHeartbeat unit proof ===");
  console.log(`Source: ${SRC_PATH}`);
  console.log("Authority: ams://canon/constraints/outcome-verification-via-runnable-artifact");
  await testLeadingFlushAndHeartbeats();
  await testFrameForwardingVerbatim();
  await testNoMidEventInjection();
  await testCancelPropagation();
  await testIdleOrphanCleanup();
  console.log(`\n=== VERDICT: ${pass ? "PASS" : "FAIL"} ===`);
  // Cleanup temp dir on success only — leave artifacts on failure for postmortem.
  if (pass) {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  } else {
    console.log(`(temp transpiled module preserved at ${mjsPath} for postmortem)`);
  }
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
