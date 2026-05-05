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
//   3. **Heartbeat-wins preserves the in-flight read.** When the heartbeat
//      timeout wins the Promise.race, the `reader.read()` promise is still
//      pending. We do NOT release or cancel the reader: in the Cloudflare
//      Workers (workerd) runtime, `reader.releaseLock()` throws a TypeError
//      when there's a pending read, and `reader.cancel()` cancels the
//      ENTIRE upstream stream (transitioning it to closed) — not just the
//      pending read. Re-acquiring a reader on a closed stream yields one
//      whose next `read()` resolves with `{done:true}`, killing the wrapper
//      after a single heartbeat — the exact failure mode this wrapper
//      exists to prevent. Mitigation: hoist the in-flight `readPromise`
//      across iterations. Heartbeat-wins simply enqueues the heartbeat
//      frame and continues; the same `readPromise` is raced against a
//      fresh timeout next iteration. A new `reader.read()` is issued only
//      after the current one settles, so there is at most one pending
//      read on the reader at any time and no orphan ever escapes the loop.
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
  // Content-type check is case-insensitive to match the gate the caller
  // (worker/src/mcp.ts handleMcp) applies before invoking us — RFC 9110
  // permits any case in the media-type token, so a divergence between gate
  // and wrapper would silently pass non-canonical content-types through
  // unwrapped, regressing the iOS Safari "Load failed" surface this wrapper
  // exists to defend.
  if (resp.status !== 200) return resp;
  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("text/event-stream")) return resp;
  if (!resp.body) return resp;

  const upstream: ReadableStream<Uint8Array> = resp.body;
  // Hoisted so `cancel(reason)` can call `reader.cancel(reason)` instead of
  // `upstream.cancel()` (which throws once start() has locked the stream).
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  // Sentinel object used as a Promise.race participant for heartbeats.
  // Identity comparison against this constant is the discriminator — we do
  // NOT wrap `readPromise` in `.then()` for the race, because doing so would
  // attach a fresh `.then` handler to the same pending `readPromise` on
  // every loop iteration. On long-lived idle streams (the exact connection
  // type this wrapper targets) those handlers would accumulate linearly
  // for the entire connection lifetime — at the production 15s interval, a
  // 24-hour idle session would carry ~5,760 closures pinned to a never-
  // settling promise. Racing `readPromise` directly means exactly one
  // `.then` is attached per pending read (the `await` itself); subsequent
  // re-races share that same single continuation.
  const HEARTBEAT_SENTINEL = Symbol("heartbeat");
  type HeartbeatSentinel = typeof HEARTBEAT_SENTINEL;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(SSE_LEADING_FLUSH);
      reader = upstream.getReader();
      try {
        // The in-flight read is hoisted across iterations: heartbeat-wins
        // does NOT issue a new read(), it simply re-races the same pending
        // promise against a fresh timeout. A new read() is issued only
        // after the current read SETTLES (resolves with a value or {done}),
        // so the reader has at most one pending read at any time.
        let readPromise: Promise<ReadableStreamReadResult<Uint8Array>> =
          reader.read();
        while (true) {
          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          const heartbeat = new Promise<HeartbeatSentinel>((resolve) => {
            timeoutId = setTimeout(
              () => resolve(HEARTBEAT_SENTINEL),
              heartbeatIntervalMs,
            );
          });
          const next = await Promise.race([readPromise, heartbeat]);
          // Always clear the timeout when read wins (cheap if heartbeat
          // already fired). Cleared INSIDE the iteration body, not in a
          // .then continuation, so no per-iteration handler attaches.
          if (timeoutId !== undefined) clearTimeout(timeoutId);
          if (next === HEARTBEAT_SENTINEL) {
            controller.enqueue(SSE_HEARTBEAT_FRAME);
            continue;
          }
          // next is a ReadableStreamReadResult — narrow it.
          const result = next as ReadableStreamReadResult<Uint8Array>;
          if (result.done) break;
          if (result.value) controller.enqueue(result.value);
          readPromise = reader.read();
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
