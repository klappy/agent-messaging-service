import type { Env } from "./types";
import { base64ToUtf8, isPlainObject, ulid } from "./util";

// Payload the Worker hands the DO at upgrade time. Carried as a base64 JSON
// blob in the X-AMS-Join-Payload header on the internal Worker→DO request,
// because a WebSocket upgrade request has no body the DO can read.
export interface JoinPayload {
  conversation_id: string;
  conversation_namespace: string;
  alias: string;
  conversation_metadata: Record<string, unknown>;
  account_id: string;
  stream_name: string;
  self_subscribe: boolean;
  stream_metadata: Record<string, unknown>;
}

interface ConnectionState {
  ws: WebSocket;
  account_id: string;
  stream_id: string;
  stream_name: string;
  self_subscribe: boolean;
  metadata: Record<string, unknown>;
}

// One ConversationDO per conversation_id. The Worker resolves alias → conv_id
// via KV and routes here via CONVERSATION_DO.idFromName(conv_id). The DO holds
// the in-memory stream registry, the per-stream subscription set, and the WS
// handles. Per ARCHITECTURE.md §4 and ams://canon/decisions/D0009, the stream's
// owning account is structurally excluded from its own subscription set unless
// X-AMS-Self-Subscribe: true was passed at connect time. Exclusion lives at
// registration, not as a runtime filter on the broadcast path.
export class ConversationDO {
  private streams: Map<string, ConnectionState> = new Map();

  constructor(_state: DurableObjectState, _env: Env) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/__do__/connect") {
      try {
        return await this.handleConnect(req);
      } catch {
        // PROTOCOL §6 close 4500 — server error. Any unexpected throw inside
        // the DO surfaces as a wire close so clients get a uniform error path
        // rather than an opaque HTTP 500 from workerd.
        return wsClose(4500, "internal_error");
      }
    }
    return new Response("not found", { status: 404 });
  }

  private async handleConnect(req: Request): Promise<Response> {
    if (req.headers.get("upgrade") !== "websocket") {
      return new Response("expected websocket upgrade", { status: 426 });
    }
    const payloadHeader = req.headers.get("x-ams-join-payload");
    if (!payloadHeader) {
      // The Worker is the only caller and always sets this header. Missing it
      // is an invariant break, not user input — surface as 4500 so a bug shows
      // up on the wire instead of as an opaque HTTP 400.
      return wsClose(4500, "internal_error");
    }
    let payload: JoinPayload;
    try {
      payload = JSON.parse(base64ToUtf8(payloadHeader)) as JoinPayload;
    } catch {
      return wsClose(4500, "internal_error");
    }

    // PROTOCOL.md §6 close 4004 — stream-name conflict within this conversation.
    for (const conn of this.streams.values()) {
      if (
        conn.stream_name === payload.stream_name &&
        conn.account_id !== payload.account_id
      ) {
        return wsClose(4004, "stream_name_conflict");
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();

    const stream_id = `str_${ulid()}`;
    const conn: ConnectionState = {
      ws: server,
      account_id: payload.account_id,
      stream_id,
      stream_name: payload.stream_name,
      self_subscribe: payload.self_subscribe,
      metadata: payload.stream_metadata,
    };

    // Build `joined` peers list from the streams currently registered (i.e.,
    // before adding the new one). PROTOCOL.md §4.1 — server frame on success.
    const peers = [];
    for (const other of this.streams.values()) {
      peers.push({
        stream_id: other.stream_id,
        stream_name: other.stream_name,
        owner_account_id: other.account_id,
        metadata: other.metadata,
      });
    }
    server.send(
      JSON.stringify({
        type: "joined",
        conversation_id: payload.conversation_id,
        stream_id,
        stream_name: payload.stream_name,
        metadata: payload.stream_metadata,
        self_subscribe: payload.self_subscribe,
        peers,
      }),
    );

    // PROTOCOL.md §4.2 — server pushes `stream_joined` to every existing peer.
    // Initial metadata rides on this frame (canon/constraints/wire-conformance MUST #5).
    const wireJoined = JSON.stringify({
      type: "stream_joined",
      stream_id,
      stream_name: payload.stream_name,
      owner_account_id: payload.account_id,
      metadata: payload.stream_metadata,
    });
    for (const other of this.streams.values()) {
      try {
        other.ws.send(wireJoined);
      } catch {
        // peer ws closed mid-broadcast; teardown handler will clean up.
      }
    }

    this.streams.set(stream_id, conn);

    server.addEventListener("message", (event) => this.handleMessage(stream_id, event));
    const onTeardown = () => this.handleTeardown(stream_id);
    server.addEventListener("close", onTeardown);
    server.addEventListener("error", onTeardown);

    return new Response(null, { status: 101, webSocket: client });
  }

  private handleMessage(stream_id: string, event: MessageEvent) {
    const conn = this.streams.get(stream_id);
    if (!conn) return;
    try {
      this.dispatchMessage(stream_id, conn, event);
    } catch {
      // PROTOCOL §6 close 4500 — anything unexpected becomes a server-error
      // close so the wire stays well-defined.
      try {
        conn.ws.close(4500, "internal_error");
      } catch {}
    }
  }

  private dispatchMessage(stream_id: string, conn: ConnectionState, event: MessageEvent) {
    let data: unknown;
    try {
      data = typeof event.data === "string" ? JSON.parse(event.data) : null;
    } catch {
      conn.ws.close(4400, "malformed_frame");
      return;
    }
    if (!isPlainObject(data) || typeof data.type !== "string") {
      conn.ws.close(4400, "malformed_frame");
      return;
    }
    switch (data.type) {
      case "ping":
        try {
          conn.ws.send(JSON.stringify({ type: "pong" }));
        } catch {}
        return;
      case "token": {
        if (typeof data.data !== "string") {
          conn.ws.close(4400, "malformed_frame");
          return;
        }
        const wire = JSON.stringify({
          type: "token",
          stream_id,
          stream_name: conn.stream_name,
          owner_account_id: conn.account_id,
          ts: new Date().toISOString(),
          data: data.data,
        });
        // D0009: stream-scoped delivery. Each peer connection is a subscriber
        // of every stream EXCEPT its own (default). Concretely: send to every
        // connection except the emitter (self) unless the emitter opted into
        // self-subscription at connect via X-AMS-Self-Subscribe: true.
        for (const [other_id, other] of this.streams) {
          if (other_id === stream_id && !conn.self_subscribe) continue;
          try {
            other.ws.send(wire);
          } catch {}
        }
        return;
      }
      case "set_metadata":
        // SPEC §4 lists set_metadata as a v1 client frame; the matching
        // stream_metadata server-broadcast is wire-conformance MUST #5.
        // Day 2 ships the stream_joined initial-metadata path; mid-flight
        // mutation lands in a follow-up day. Accept silently so wire stays
        // forward-compatible — clients that send set_metadata today receive
        // no error; tomorrow's implementation will start broadcasting.
        return;
      default:
        conn.ws.close(4400, "unknown_frame_type");
        return;
    }
  }

  private handleTeardown(stream_id: string) {
    const conn = this.streams.get(stream_id);
    if (!conn) return;
    this.streams.delete(stream_id);
    const wire = JSON.stringify({
      type: "stream_left",
      stream_id,
      stream_name: conn.stream_name,
      owner_account_id: conn.account_id,
    });
    for (const other of this.streams.values()) {
      try {
        other.ws.send(wire);
      } catch {}
    }
  }
}

// Build a 101 Switching Protocols response that immediately closes with the
// given AMS close code. PROTOCOL §4.1: connect failures return WS close, not
// HTTP — so even invariant breaks inside the DO surface as a wire close
// rather than an HTTP error the upstream Worker would otherwise pass through.
export function wsClose(code: number, reason: string): Response {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
  server.accept();
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: client });
}
