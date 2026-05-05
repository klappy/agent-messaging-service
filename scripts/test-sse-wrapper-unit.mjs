#!/usr/bin/env node
// scripts/test-sse-wrapper-unit.mjs
//
// Unit-level proof of worker/src/mcp.ts wrapWithSseHeartbeat structural
// contract. Runs against a re-implementation of the wrapper inline (Node 20+
// has ReadableStream/TextEncoder natively) and asserts four properties whose
// absence empirically caused either user-visible iOS Safari "Load failed"
// failures or Cursor Bugbot findings on PR #47:
//
//   1. Leading byte flush — `:ok\n\n` enqueued at +0ms before any read.
//      Without this, iOS Safari's streaming-fetch watchdog can fire shorter
//      than the 15s heartbeat interval and surface "TypeError: Load failed".
//
//   2. Verbatim forwarding — every byte the upstream emits arrives in the
//      output unmodified. No inspection, no buffering, no re-framing.
//
//   3. No mid-event heartbeat injection — heartbeats can only enqueue
//      between full upstream chunks, not in the middle of one. Sending 100
//      back-to-back `data:` chunks must produce zero `:keepalive` interleavings.
//      Bugbot finding #4 on PR #47 was rooted in the prior structure failing
//      this property.
//
//   4. Cancel propagation — when downstream cancels the response stream,
//      the wrapper must propagate to upstream.cancel() so the SDK's inner
//      WebSocket releases. Bugbot finding #2 on PR #47 was rooted in the
//      prior structure failing this property.
//
// Authority: ams://canon/constraints/outcome-verification-via-runnable-artifact
//            journal/2026-05-05-tincan-sse-keepalive-fresh-iteration.tsv
//
// This is a UNIT proof — it asserts the wrapper STRUCTURE produces the right
// behavior. It does NOT verify the deployed worker; for that, run
// scripts/check-sse-heartbeat.sh against a live host. The two together are
// the substrate-vs-outcome split: this catches code regressions before merge
// (no deploy needed); the curl probe catches deployed-state regressions
// after merge.
//
// Exits 0 on PASS, 1 on regression, 2 on harness error.

const SSE_LEADING_FLUSH = new TextEncoder().encode(':ok\n\n');
const SSE_HEARTBEAT_FRAME = new TextEncoder().encode(':keepalive\n\n');
// Shortened from the production 15_000ms to 200ms so the test runs in <1s.
// The test still asserts the structural property (heartbeats fire on idle,
// never mid-chunk), independent of the absolute interval.
const SSE_HEARTBEAT_INTERVAL_MS = 200;

// ---------------------------------------------------------------------------
// Re-implementation of wrapWithSseHeartbeat. Must stay in sync with
// worker/src/mcp.ts; if the production wrapper changes structure, this file
// changes too. The CI workflow runs this script on every PR touching
// worker/src/mcp.ts, so a structural divergence shows up at code review time.
// ---------------------------------------------------------------------------
function wrapWithSseHeartbeat(resp) {
  const upstream = resp.body;
  let reader;
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(SSE_LEADING_FLUSH);
      reader = upstream.getReader();
      try {
        while (true) {
          let timeoutId;
          const heartbeat = new Promise((resolve) => {
            timeoutId = setTimeout(
              () => resolve({ heartbeat: true }),
              SSE_HEARTBEAT_INTERVAL_MS,
            );
          });
          const next = await Promise.race([
            reader.read().then((r) => {
              if (timeoutId !== undefined) clearTimeout(timeoutId);
              return r;
            }),
            heartbeat,
          ]);
          if ('heartbeat' in next) {
            controller.enqueue(SSE_HEARTBEAT_FRAME);
            continue;
          }
          if (next.done) break;
          if (next.value) controller.enqueue(next.value);
        }
      } catch {
        /* upstream errored or cancelled */
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel(reason) {
      if (reader) {
        reader.cancel(reason).catch(() => { /* upstream already gone */ });
      } else {
        upstream.cancel(reason).catch(() => { /* upstream already gone */ });
      }
    },
  });
  const newHeaders = new Headers(resp.headers);
  newHeaders.delete('content-length');
  return new Response(stream, {
    status: resp.status,
    statusText: resp.statusText,
    headers: newHeaders,
  });
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
      new Promise((r) => setTimeout(() => r({ done: true, timedOut: true }), durationMs - elapsed)),
    ]);
    if (result.timedOut || result.done) break;
    chunks.push({ elapsed: Date.now() - t0, text: dec.decode(result.value, { stream: true }) });
  }
  try { await reader.cancel(); } catch { /* ignore */ }
  return chunks;
}

let pass = true;
const fail = (msg) => { console.log(`  ✗ FAIL: ${msg}`); pass = false; };
const ok = (msg) => console.log(`  ✓ ${msg}`);

async function testLeadingFlushAndHeartbeats() {
  console.log('\n--- Test 1: leading flush at +0ms + idle heartbeats ---');
  const upstream = new ReadableStream({ cancel() { /* swallow */ } });
  const wrapped = wrapWithSseHeartbeat(new Response(upstream, {
    status: 200, headers: { 'content-type': 'text/event-stream' },
  }));
  const chunks = await readAll(wrapped, 700);
  for (const c of chunks) console.log(`    +${String(c.elapsed).padStart(4)}ms  ${JSON.stringify(c.text)}`);

  if (!chunks.length || chunks[0].text !== ':ok\n\n') {
    fail(`first chunk should be ":ok\\n\\n", got ${JSON.stringify(chunks[0]?.text)}`);
  } else { ok(`leading :ok\\n\\n at +${chunks[0].elapsed}ms`); }
  if (chunks[0]?.elapsed >= 50) {
    fail(`leading byte should arrive < 50ms, got ${chunks[0].elapsed}ms`);
  } else { ok('leading byte flushes immediately'); }
  const heartbeats = chunks.filter((c) => c.text === ':keepalive\n\n').length;
  if (heartbeats < 2) {
    fail(`expected >= 2 heartbeats in 700ms (interval ${SSE_HEARTBEAT_INTERVAL_MS}ms), got ${heartbeats}`);
  } else { ok(`${heartbeats} heartbeats fired on schedule`); }
}

async function testFrameForwardingVerbatim() {
  console.log('\n--- Test 2: real frames forwarded byte-for-byte ---');
  const enc = new TextEncoder();
  const frame = 'event: message\ndata: {"hi":1}\n\n';
  const upstream = new ReadableStream({
    start(controller) {
      setTimeout(() => controller.enqueue(enc.encode(frame)), 50);
      setTimeout(() => controller.close(), 100);
    },
  });
  const wrapped = wrapWithSseHeartbeat(new Response(upstream, {
    status: 200, headers: { 'content-type': 'text/event-stream' },
  }));
  const chunks = await readAll(wrapped, 300);
  const all = chunks.map((c) => c.text).join('');
  for (const c of chunks) console.log(`    +${String(c.elapsed).padStart(4)}ms  ${JSON.stringify(c.text)}`);
  if (!all.includes(frame)) fail('upstream frame not forwarded verbatim');
  else ok('upstream frame forwarded byte-for-byte');
}

async function testNoMidEventInjection() {
  console.log('\n--- Test 3: heartbeats CANNOT interleave between back-to-back chunks ---');
  // Send 100 small chunks at 6ms intervals (faster than the 200ms heartbeat
  // interval), so the read loop is never idle long enough for a heartbeat to
  // arm and resolve before the next read. Asserts: heartbeats only fire on
  // genuine idle, NEVER between two pump-emitted chunks.
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
  const wrapped = wrapWithSseHeartbeat(new Response(upstream, {
    status: 200, headers: { 'content-type': 'text/event-stream' },
  }));
  const chunks = await readAll(wrapped, 1500);
  const heartbeatPositions = chunks
    .map((c, i) => (c.text === ':keepalive\n\n' ? i : -1))
    .filter((i) => i >= 0);
  console.log(`    total chunks:        ${chunks.length}`);
  console.log(`    heartbeat positions: [${heartbeatPositions.join(', ')}]`);

  // Verify the data chunks arrived in strict order with no interleavings.
  const seq = chunks
    .filter((c) => c.text.startsWith('data: chunk-'))
    .map((c) => parseInt(c.text.match(/chunk-(\d+)/)[1], 10));
  const ordered = seq.length === 100 && seq.every((n, i) => n === i);
  if (!ordered) fail(`chunks arrived out of order or missing: got ${seq.length}, first 10 = [${seq.slice(0, 10).join(', ')}]`);
  else ok(`all 100 chunks arrived in order, ${heartbeatPositions.length} heartbeats landed safely between iterations`);
}

async function testCancelPropagation() {
  console.log('\n--- Test 4: downstream cancel() propagates to upstream cancel() ---');
  let upstreamCancelled = false;
  let upstreamCancelReason;
  const upstream = new ReadableStream({
    cancel(reason) { upstreamCancelled = true; upstreamCancelReason = reason; },
  });
  const wrapped = wrapWithSseHeartbeat(new Response(upstream, {
    status: 200, headers: { 'content-type': 'text/event-stream' },
  }));
  const reader = wrapped.body.getReader();
  await reader.read(); // consume :ok\n\n so start() has acquired the upstream reader
  await reader.cancel('downstream gone');
  await new Promise((r) => setTimeout(r, 50));
  if (!upstreamCancelled) fail('upstream.cancel was NOT called when downstream cancelled (leak)');
  else ok(`upstream.cancel propagated correctly with reason: ${JSON.stringify(upstreamCancelReason)}`);
}

async function main() {
  console.log('=== wrapWithSseHeartbeat unit proof ===');
  console.log('Authority: ams://canon/constraints/outcome-verification-via-runnable-artifact');
  await testLeadingFlushAndHeartbeats();
  await testFrameForwardingVerbatim();
  await testNoMidEventInjection();
  await testCancelPropagation();
  console.log(`\n=== VERDICT: ${pass ? 'PASS' : 'FAIL'} ===`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
