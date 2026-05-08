import type { Env } from "./types";
import { base64ToUtf8, isPlainObject, pepperedHash } from "./util";

// Optional peer-identity metadata supplied by the wrapper at join time per
// ams://canon/decisions/D0028. Carried on the JoinPayload; recorded in the
// per-connection state; included in stream_joined and joined frames so
// subscribers see typed identity alongside opaque stream_id / account_id
// values. Set once at join; not mutated mid-session.
export interface PeerIdentity {
  kind: "agent" | "human";
  model?: string;
  client?: string;
}

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
  peer_identity?: PeerIdentity;
}

interface ConnectionState {
  ws: WebSocket;
  account_id: string;
  stream_id: string;
  stream_name: string;
  self_subscribe: boolean;
  metadata: Record<string, unknown>;
  peer_identity?: PeerIdentity;
}

// One ConversationDO per conversation_id. The Worker resolves alias → conv_id
// via KV and routes here via CONVERSATION_DO.idFromName(conv_id). The DO holds
// the in-memory stream registry, the per-stream subscription set, and the WS
// handles. Per ARCHITECTURE.md §4 and ams://canon/decisions/D0009, the stream's
// owning account is structurally excluded from its own subscription set unless
// X-AMS-Self-Subscribe: true was passed at connect time. Exclusion lives at
// registration, not as a runtime filter on the broadcast path.
//
// Per ams://canon/decisions/D0028 (deterministic identity and stream
// resumability), stream_id is derived from (conversation_id, account_id,
// stream_name) — same identity tuple yields the same stream_id, every join.
// Reconnect with the same (account_id, stream_name) on a conversation
// displaces the prior WebSocket and resumes the existing stream_id rather
// than minting a fresh one. Cross-account take-over of an in-use stream_name
// is rejected with the new wsClose(4004, "stream_name_owner_conflict") code
// (distinct from the prior unconditional stream_name_conflict).
export class ConversationDO {
  private streams: Map<string, ConnectionState> = new Map();
  private env: Env;

  constructor(_state: DurableObjectState, env: Env) {
    this.env = env;
  }

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

    // Detect existing stream with the same stream_name on this conversation
    // per D0028:
    //   - Different account_id → reject with stream_name_owner_conflict.
    //     Per D0003 (per-account-stream-ownership), a stream_name held by
    //     one account cannot be taken over by another. The close code is
    //     distinct from the prior stream_name_conflict (which previously
    //     applied unconditionally) so clients can differentiate "name is
    //     taken by someone else" from "you crashed and want to resume."
    //   - Same account_id → displace and resume. Pull the existing entry
    //     out of the map (so peers list does not list self as a peer),
    //     gracefully close the prior WebSocket with stream_displaced, and
    //     reuse its stream_id for the new connection. No stream_joined or
    //     stream_left broadcast — subscribers see continuous stream identity
    //     across the WebSocket transition.
    let displacedStreamId: string | undefined;
    let displacedConn: ConnectionState | undefined;
    for (const [sid, conn] of this.streams) {
      if (conn.stream_name === payload.stream_name) {
        if (conn.account_id !== payload.account_id) {
          // PROTOCOL.md §6 close 4004 family — owner conflict variant.
          return wsClose(4004, "stream_name_owner_conflict");
        }
        displacedStreamId = sid;
        displacedConn = conn;
        break;
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();

    let stream_id: string;
    let isResume = false;
    if (displacedStreamId && displacedConn) {
      stream_id = displacedStreamId;
      isResume = true;
      // Pull the displaced entry out of the map BEFORE building the peers
      // list so the new client's joined frame does not list self as a peer.
      this.streams.delete(displacedStreamId);
      // Close the displaced ws with a distinct code so a graceful client
      // knows it was replaced rather than disconnected. The bound teardown
      // handler for the displaced ws will see this.streams.get(stream_id)
      // !== oldConn and noop — no stream_left broadcast, no double-teardown.
      try {
        displacedConn.ws.close(4001, "stream_displaced");
      } catch {}
    } else {
      stream_id = await deriveStreamId(this.env, payload);
    }

    const conn: ConnectionState = {
      ws: server,
      account_id: payload.account_id,
      stream_id,
      stream_name: payload.stream_name,
      self_subscribe: payload.self_subscribe,
      metadata: payload.stream_metadata,
      ...(payload.peer_identity ? { peer_identity: payload.peer_identity } : {}),
    };

    // Build `joined` peers list from the streams currently registered (i.e.,
    // before adding the new one — and, on resume, after the displaced entry
    // was already removed). PROTOCOL.md §4.1 — server frame on success.
    const peers = [];
    for (const other of this.streams.values()) {
      peers.push({
        stream_id: other.stream_id,
        stream_name: other.stream_name,
        owner_account_id: other.account_id,
        metadata: other.metadata,
        ...(other.peer_identity ? { peer_identity: other.peer_identity } : {}),
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
        ...(payload.peer_identity ? { peer_identity: payload.peer_identity } : {}),
        ...(isResume ? { resumed: true } : {}),
      }),
    );

    // PROTOCOL.md §4.2 — server pushes `stream_joined` to every existing peer.
    // Initial metadata rides on this frame (canon/constraints/wire-conformance MUST #5).
    // Per D0028: skip the broadcast on resume — subscribers already know about
    // this stream; it has continuous identity across the WebSocket transition.
    if (!isResume) {
      const wireJoined = JSON.stringify({
        type: "stream_joined",
        stream_id,
        stream_name: payload.stream_name,
        owner_account_id: payload.account_id,
        metadata: payload.stream_metadata,
        ...(payload.peer_identity ? { peer_identity: payload.peer_identity } : {}),
      });
      for (const other of this.streams.values()) {
        try {
          other.ws.send(wireJoined);
        } catch {
          // peer ws closed mid-broadcast; teardown handler will clean up.
        }
      }
    }

    this.streams.set(stream_id, conn);

    server.addEventListener("message", (event) => this.handleMessage(stream_id, event));
    // Bind teardown to a closure that captures the conn reference so a
    // displaced ws's later close event no-ops instead of removing the
    // resuming connection. Per D0028.
    const onTeardown = () => this.handleTeardown(stream_id, conn);
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
          ...(conn.peer_identity ? { peer_identity: conn.peer_identity } : {}),
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

  private handleTeardown(stream_id: string, expectedConn: ConnectionState) {
    // Identity-aware teardown per D0028: only act if the stream_id is still
    // bound to this exact connection. A displaced ws's later close event
    // will see a different ConnectionState in the map (or none at all) and
    // noop, so resume-on-reconnect doesn't accidentally remove the resuming
    // connection.
    const current = this.streams.get(stream_id);
    if (current !== expectedConn) return;
    this.streams.delete(stream_id);
    const wire = JSON.stringify({
      type: "stream_left",
      stream_id,
      stream_name: expectedConn.stream_name,
      owner_account_id: expectedConn.account_id,
      ...(expectedConn.peer_identity
        ? { peer_identity: expectedConn.peer_identity }
        : {}),
    });
    for (const other of this.streams.values()) {
      try {
        other.ws.send(wire);
      } catch {}
    }
  }
}

// Deterministic stream_id derivation per ams://canon/decisions/D0028. Same
// (conversation_id, account_id, stream_name) tuple → same stream_id, every
// join. Reuses AMS_PERMISSIVE_TOKEN_PEPPER with a distinct domain separator
// so no new secret is introduced. The 26-char hex slice is opaque downstream
// and matches the prior `str_${ulid()}` shape's character class.
async function deriveStreamId(env: Env, payload: JoinPayload): Promise<string> {
  const hex = await pepperedHash(
    env.AMS_PERMISSIVE_TOKEN_PEPPER,
    "stream|" +
      payload.conversation_id +
      "|" +
      payload.account_id +
      "|" +
      payload.stream_name,
  );
  return `str_${hex.slice(0, 26)}`;
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
