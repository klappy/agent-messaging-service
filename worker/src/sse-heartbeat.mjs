// worker/src/sse-heartbeat.mjs
//
// Canonical implementation of wrapWithSseHeartbeat. Imported both by the
// production wrapper in worker/src/mcp.ts (via the .d.mts shim) and by the
// CI unit proof in scripts/test-sse-wrapper-unit.mjs. A single source of
// truth is what makes the unit gate actually defend the production wrapper —
// see ams://canon/constraints/outcome-verification-via-runnable-artifact.
//
// Structural invariants (each one corresponds to a Bugbot finding on PR #47
// or an iOS-Safari "Load failed" report):
//
//   1. Leading byte flush — `:ok\n\n` enqueued at +0ms, before any read.
//      Without it, WebKit's streaming-fetch watchdog can fire before the
//      first heartbeat arrives.
//
//   2. Verbatim forwarding — every byte the upstream emits arrives in the
//      output unmodified. No inspection, no buffering, no re-framing.
//
//   3. No mid-event heartbeat injection — heartbeats can only enqueue
//      between full upstream chunks. The pending `reader.read()` is held
//      across iterations so a heartbeat-wins race does NOT orphan the
//      in-flight read; the next upstream chunk still flows through the
//      same await.
//
//   4. Cancel propagation — when downstream cancels the response stream,
//      `reader.cancel()` propagates to upstream so the SDK's inner WS
//      releases immediately.

export const SSE_LEADING_FLUSH = new TextEncoder().encode(":ok\n\n");
export const SSE_HEARTBEAT_FRAME = new TextEncoder().encode(":keepalive\n\n");
export const SSE_HEARTBEAT_INTERVAL_MS = 15_000;

export function wrapWithSseHeartbeat(resp, intervalMs = SSE_HEARTBEAT_INTERVAL_MS) {
  const upstream = resp.body;
  // Hoisted so `cancel` can reach the reader after `start` has acquired it.
  // Calling `upstream.cancel()` after `start()` ran would throw (the stream
  // is locked to the reader) and the `.catch` would swallow it silently, so
  // the SDK's inner WebSocket would never see the disconnect — that's a leak.
  // `reader.cancel()` releases the lock AND propagates to the underlying
  // source's cancel algorithm, which is what tears down the SDK's WS.
  let reader;
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(SSE_LEADING_FLUSH);
      reader = upstream.getReader();
      // Holds the in-flight reader.read() promise across loop iterations.
      // When the heartbeat wins the race, the read is STILL pending; we must
      // re-await the same promise next iteration rather than starting a new
      // read. Otherwise the original read silently consumes (and discards)
      // the next upstream chunk while the new read awaits the one after it.
      let pendingRead = null;
      try {
        while (true) {
          if (!pendingRead) pendingRead = reader.read();
          let timeoutId;
          const heartbeat = new Promise((resolve) => {
            timeoutId = setTimeout(
              () => resolve({ heartbeat: true }),
              intervalMs,
            );
          });
          const tagged = pendingRead.then((r) => ({ read: r }));
          const next = await Promise.race([tagged, heartbeat]);
          if ("heartbeat" in next) {
            controller.enqueue(SSE_HEARTBEAT_FRAME);
            continue;
          }
          if (timeoutId !== undefined) clearTimeout(timeoutId);
          pendingRead = null;
          if (next.read.done) break;
          if (next.read.value) controller.enqueue(next.read.value);
        }
      } catch {
        // Upstream errored or was cancelled; fall through to close.
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel(reason) {
      if (reader) {
        reader.cancel(reason).catch(() => {
          /* upstream already gone */
        });
      } else {
        upstream.cancel(reason).catch(() => {
          /* upstream already gone */
        });
      }
    },
  });

  const newHeaders = new Headers(resp.headers);
  newHeaders.delete("content-length");
  return new Response(stream, {
    status: resp.status,
    statusText: resp.statusText,
    headers: newHeaders,
  });
}
