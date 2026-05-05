// SSE response wrapper: leading flush byte + idle heartbeats.
//
// Wraps a `text/event-stream` response so consumers see bytes immediately
// (defends iOS Safari's streaming-fetch watchdog) and continue to see bytes
// during long idle periods (defends intermediary HTTP/2 idle-stream drops).
//
// Why this exists: the `agents/mcp` SDK's `GET /mcp` handler returns a
// `text/event-stream` whose body is a `TransformStream` only written to when
// the inner DO WebSocket forwards a notification. With a fresh tincan session
// that has joined a conversation but has no peers yet, the stream sits at
// zero body bytes for the lifetime of the connection. iOS Safari raises
// `TypeError: Load failed`; intermediaries silently drop the connection.
//
// Design constraints (each with a concrete failure mode it prevents):
//   1. **Single writer.** Only the controller ever enqueues. Two concurrent
//      writers (e.g. a pump + a setInterval callback both writing to the
//      same TransformStream writer) can interleave bytes mid-frame and
//      corrupt SSE events split across multiple upstream chunks.
//   2. **One timer per loop iteration, owned by that iteration.** No
//      setInterval, no chained setTimeout, no shared timer handle. The
//      timer is created fresh inside the loop and explicitly cleared the
//      moment `read()` resolves. Re-arm races are impossible by construction.
//   3. **Heartbeat-wins cancels the orphaned read.** When the heartbeat
//      timeout wins the Promise.race, the `reader.read()` promise is still
//      pending. Without intervention it would resolve later (when upstream
//      finally emits) and that frame would be consumed by the orphaned
//      `.then` handler — outside the loop — and silently dropped. Worse,
//      every idle iteration would attach a new `.then` handler to the same
//      pending read promise, accumulating handlers indefinitely on
//      long-lived idle connections (the EXACT failure mode this wrapper
//      targets — an unbounded handler-list memory leak on idle SSE streams).
//      Mitigation: when heartbeat wins, cancel the reader, then re-acquire
//      a fresh reader. `cancel()` causes the pending `read()` to resolve
//      with `{done:true}`, which the orphaned `.then` simply discards. The
//      next iteration gets a clean reader with no pending read in flight.
//   4. **Downstream cancel propagates.** When the consumer disconnects, the
//      ReadableStream's `cancel(reason)` runs. Calling `upstream.cancel()`
//      directly throws once `start` has acquired the reader (locked-stream
//      TypeError that a `.catch` would swallow silently, breaking
//      propagation to the SDK's inner WebSocket — a leak). Fix: hoist the
//      reader so `cancel` can call `reader.cancel(reason)` instead, which
//      releases the lock AND propagates to the underlying source's cancel
//      algorithm, tearing down the SDK's WebSocket.
//
// SSE comment lines (`:...\n\n`) are spec-mandated to be ignored by all
// conformant parsers (WHATWG §"event stream parser"), so the leading flush
// and heartbeats are semantically invisible to clients.

export const SSE_LEADING_FLUSH: Uint8Array = new TextEncoder().encode(":ok\n\n");
export const SSE_HEARTBEAT_FRAME: Uint8Array = new TextEncoder().encode(
  ":keepalive\n\n",
);
export const SSE_HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * Wrap a 200 text/event-stream response with a leading flush byte and idle
 * heartbeats. Non-SSE responses pass through unchanged.
 *
 * @param resp the upstream Response (e.g. from the SDK GET /mcp handler)
 * @param heartbeatIntervalMs override for tests; production uses the default
 */
export function wrapWithSseHeartbeat(
  resp: Response,
  heartbeatIntervalMs: number = SSE_HEARTBEAT_INTERVAL_MS,
): Response {
  // Pass through anything that isn't a 200 SSE response with a body.
  if (resp.status !== 200) return resp;
  const ct = resp.headers.get("content-type") || "";
  if (!ct.includes("text/event-stream")) return resp;
  if (!resp.body) return resp;

  const upstream: ReadableStream<Uint8Array> = resp.body;
  // Hoisted so `cancel(reason)` can call `reader.cancel(reason)` instead of
  // `upstream.cancel()` (which throws once start() has locked the stream).
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(SSE_LEADING_FLUSH);
      reader = upstream.getReader();
      try {
        while (true) {
          // Each iteration owns exactly one timer.
          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          const heartbeat = new Promise<{ heartbeat: true }>((resolve) => {
            timeoutId = setTimeout(
              () => resolve({ heartbeat: true }),
              heartbeatIntervalMs,
            );
          });
          const readPromise = reader.read();
          const next = await Promise.race([
            readPromise.then((r) => {
              if (timeoutId !== undefined) clearTimeout(timeoutId);
              return r;
            }),
            heartbeat,
          ]);
          if ("heartbeat" in next) {
            // Heartbeat-wins: cancel the orphaned read so it resolves with
            // {done:true} (discarded by the no-op .then), then re-acquire a
            // fresh reader for the next iteration. Without this, idle
            // iterations would accumulate .then handlers on the same pending
            // read indefinitely (memory leak), and a frame arriving later
            // would be consumed outside the loop and dropped.
            controller.enqueue(SSE_HEARTBEAT_FRAME);
            try {
              reader.releaseLock();
            } catch {
              // releaseLock throws if there's a pending read; cancel handles
              // both cases (releases the lock AND resolves pending read).
              await reader.cancel().catch(() => {});
            }
            // Await the orphan to fully resolve before re-acquiring, so the
            // re-acquisition doesn't race the prior reader's settlement.
            await readPromise.catch(() => {});
            reader = upstream.getReader();
            continue;
          }
          if (next.done) break;
          if (next.value) controller.enqueue(next.value);
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
      // Downstream disconnected — propagate so the SDK's inner WS releases.
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

  // Strip Content-Length — the wrapped stream is indeterminate.
  const newHeaders = new Headers(resp.headers);
  newHeaders.delete("content-length");
  return new Response(stream, {
    status: resp.status,
    statusText: resp.statusText,
    headers: newHeaders,
  });
}
