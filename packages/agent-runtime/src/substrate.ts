// Anthropic Messages API substrate adapter.
//
// Built on @anthropic-ai/sdk v0.96+ per
// ams://canon/constraints/mcp-build-side-governance: AMS uses the
// maintained SDK; handrolling requires a P0002-criterion justification.
// The previous raw-fetch implementation of this module (committed to a
// prior branch in this repo, never merged) was retracted on review as
// an unjustified handroll. This rewrite is the canon-compliant default.
//
// Two things the SDK gives us that the previous handroll had to do
// by hand:
//
//   1. Streaming with automatic SSE parsing — `client.messages.stream()`
//      returns an async iterable over content events. No buffer
//      splitting, no `data: ` prefix parsing, no JSON event-frame
//      reconstruction. The same SSE that was needed to avoid CF's 100s
//      upstream-timeout (524) is now an SDK primitive.
//
//   2. Native MCP connector — `client.beta.messages.stream()` accepts
//      `mcp_servers: BetaRequestMCPServerURLDefinition[]` (the
//      Anthropic MCP-client beta). The persona's operational MCP set
//      ∪ invocation.task_relevant_mcps are passed verbatim. The agent
//      calls these as tools natively, with no intermediate proxy.
//
// What this module still owns:
//
//   - Retry-with-backoff on transient errors. The SDK's built-in retry
//     is a sensible default but does not cover in-stream `overloaded`
//     events (the failure mode that surfaced on PR #92). We wrap the
//     SDK call in our own retry loop to catch both pre-stream HTTP
//     errors AND in-stream overload events.
//
//   - Stable error class names for the caller. invoke.ts catches
//     SubstrateHttpError and SubstrateStreamError by name; the SDK's
//     own error classes wrap into these so the caller's existing
//     handling continues to work.

import Anthropic, { APIError } from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_MAX_TOKENS = 16384;
const MCP_BETA = "mcp-client-2025-11-20";

// Transient errors get retried with exponential backoff. The set
// mirrors what the previous handroll retried plus 529 (Anthropic
// overloaded). This is wider than the SDK's default to catch the
// model_overloaded_error class that surfaced on PR #92.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529]);
const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 1500;

export interface McpServerSpec {
  /** Display name the agent sees, e.g., "oddkit". */
  name: string;
  /** Full URL of the HTTP MCP endpoint. */
  url: string;
}

export interface SubstrateRequest {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  systemPrompt: string;
  /** The caller's task statement — becomes the first user message. */
  userMessage: string;
  mcpServers: McpServerSpec[];
}

export interface SubstrateResponse {
  /** Concatenated text emitted by the agent over the stream. */
  text: string;
  /** Final stop_reason from the Anthropic response. */
  stopReason: string | null;
  /** Number of retry attempts before success (0 if first try succeeded). */
  attempts: number;
}

export async function dispatchToSubstrate(
  req: SubstrateRequest,
): Promise<SubstrateResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await dispatchOnce(req, attempt);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!isRetryableError(lastError) || attempt === MAX_RETRIES) {
        throw lastError;
      }
      const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt);
      console.warn("substrate_retry", {
        attempt: attempt + 1,
        max_retries: MAX_RETRIES,
        backoff_ms: backoffMs,
        message: lastError.message,
      });
      await sleep(backoffMs);
    }
  }

  throw lastError ?? new Error("substrate_retry_exhausted");
}

async function dispatchOnce(
  req: SubstrateRequest,
  attempt: number,
): Promise<SubstrateResponse> {
  const client = new Anthropic({
    apiKey: req.apiKey,
    // We do our own retries; disable SDK retries to avoid double-retry
    // behavior on transients (otherwise a 503 retried by the SDK then
    // our loop produces 4 × 2 = 8 attempts instead of 4).
    maxRetries: 0,
  });

  let text = "";
  let stopReason: string | null = null;

  try {
    const stream = client.beta.messages.stream({
      model: req.model ?? DEFAULT_MODEL,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: req.systemPrompt,
      messages: [{ role: "user", content: req.userMessage }],
      mcp_servers: req.mcpServers.map((s) => ({
        type: "url" as const,
        name: s.name,
        url: s.url,
      })),
      betas: [MCP_BETA],
    });

    // SDK gives us a typed event iterator. We accumulate text deltas
    // and capture the final stop_reason. The SDK handles SSE framing,
    // event-frame reconstruction, and JSON parsing internally.
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        text += event.delta.text;
      } else if (event.type === "message_delta") {
        stopReason = event.delta.stop_reason ?? stopReason;
      }
    }

    return { text, stopReason, attempts: attempt };
  } catch (err) {
    // SDK errors map to our two stable error classes so invoke.ts's
    // catch-by-name logic continues to work. The SDK's APIError carries
    // status + message; we preserve both.
    if (err instanceof APIError) {
      if (typeof err.status === "number") {
        throw new SubstrateHttpError(err.status, err.message);
      }
      throw new SubstrateStreamError(err.message, { cause: err });
    }
    // Non-APIError exceptions (e.g., TypeError from the Workers
    // fetch/ReadableStream runtime on a network failure mid-stream)
    // also need to flow through the retry path. Wrap as
    // SubstrateStreamError so classifyStreamMessage can decide
    // retryability from the message text.
    const message = err instanceof Error ? err.message : String(err);
    throw new SubstrateStreamError(message, { cause: err });
  }
}

// --- Errors ----------------------------------------------------------------

export class SubstrateHttpError extends Error {
  override name = "SubstrateHttpError";
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(`http_${status}: ${message}`);
  }
}

export class SubstrateStreamError extends Error {
  override name = "SubstrateStreamError";
  /** Short classifier the caller can put in a failure_reason string. */
  readonly errorType: string;
  constructor(message: string, options?: { cause?: unknown; errorType?: string }) {
    super(message, options);
    this.errorType = options?.errorType ?? classifyStreamMessage(message);
  }
}

function classifyStreamMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("overload")) return "overloaded";
  if (m.includes("rate_limit") || m.includes("rate limit")) return "rate_limited";
  if (m.includes("timeout")) return "timeout";
  if (m.includes("network")) return "network";
  return "unknown";
}

function isRetryableError(err: Error): boolean {
  if (err instanceof SubstrateHttpError) {
    return RETRYABLE_STATUS.has(err.status);
  }
  // In-stream overload events (the model_overloaded_error class from
  // PR #92) and network errors mid-stream surface as SubstrateStreamError
  // with messages naming the upstream class. Retry once per attempt.
  if (err instanceof SubstrateStreamError) {
    return (
      err.errorType === "overloaded" ||
      err.errorType === "rate_limited" ||
      err.errorType === "network" ||
      err.errorType === "timeout"
    );
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
