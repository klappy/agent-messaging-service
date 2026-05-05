// Type declarations for sse-heartbeat.mjs. The implementation is plain JS so
// it can be imported directly by both production TS code (worker/src/mcp.ts)
// and the Node-run unit proof (scripts/test-sse-wrapper-unit.mjs) without an
// extra build step. See sse-heartbeat.mjs for full documentation.

export const SSE_LEADING_FLUSH: Uint8Array;
export const SSE_HEARTBEAT_FRAME: Uint8Array;
export const SSE_HEARTBEAT_INTERVAL_MS: number;

export function wrapWithSseHeartbeat(
  resp: Response,
  intervalMs?: number,
): Response;
