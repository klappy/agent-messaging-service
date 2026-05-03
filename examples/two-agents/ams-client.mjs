// ams-client.mjs — minimal AMS wire client for Node.
// Wraps the control plane (POST /v1/accounts, POST /v1/{ns}/conversations)
// and the stream plane (WebSocket /{ns}/conversations/{alias}/connect?t=...).
//
// Per ams://canon/decisions/D0012-browser-is-an-mcp-runtime, Node can hit
// /connect directly because Node WebSocket implementations support arbitrary
// headers (Authorization in particular). Browser JS cannot — browsers go
// through the MCP wrapper. This file is the Node reference.

import WebSocket from "ws";
import { EventEmitter } from "node:events";

const DEFAULT_HOST = process.env.AMS_HOST ?? "https://ams.klappy.dev";

export async function createAccount(namespace, { host = DEFAULT_HOST } = {}) {
  const res = await fetch(`${host}/v1/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ namespace }),
  });
  if (!res.ok) throw new Error(`createAccount ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function createConversation(
  credential,
  namespace,
  { host = DEFAULT_HOST, alias, stream_name, metadata, stream_metadata } = {},
) {
  const body = {};
  if (alias) body.alias = alias;
  if (stream_name) body.stream_name = stream_name;
  if (metadata) body.metadata = metadata;
  if (stream_metadata) body.stream_metadata = stream_metadata;
  const res = await fetch(`${host}/v1/${namespace}/conversations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${credential}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createConversation ${res.status}: ${await res.text()}`);
  return res.json();
}

// Connect to a conversation by magic link. The magic link is opaque per
// PROTOCOL §2 — we treat it as a URL and insert /connect between the path
// and the query string (NOT a literal append, which would land /connect
// after ?t=...). See journal/2026-05-02-day2-validation-closeout.tsv L1.
//
// AMS_HOST override: when set (e.g. http://127.0.0.1:8787 for wrangler dev),
// the magic link's origin is substituted with AMS_HOST. This is a
// demo/test convenience — production clients treat the magic link's host
// as the host of record per PROTOCOL §2.
export function connect(magicLink, credential, {
  stream_name,
  stream_metadata,
  self_subscribe = false,
} = {}) {
  const u = new URL(magicLink);
  if (process.env.AMS_HOST) {
    const override = new URL(process.env.AMS_HOST);
    u.protocol = override.protocol;
    u.host = override.host;
  }
  // Path becomes /{ns}/conversations/{alias}/connect, query stays.
  u.pathname = `${u.pathname.replace(/\/$/, "")}/connect`;

  const headers = {
    authorization: `Bearer ${credential}`,
    "x-ams-self-subscribe": self_subscribe ? "true" : "false",
  };
  if (stream_name) headers["x-ams-stream-name"] = stream_name;
  if (stream_metadata) {
    headers["x-ams-stream-metadata"] = Buffer.from(
      JSON.stringify(stream_metadata),
      "utf8",
    ).toString("base64");
  }
  // ws:// for plain-HTTP local dev, wss:// for production. We translate
  // https→wss and http→ws to keep the magic link's protocol intact.
  const wsUrl = u.toString().replace(/^http/, "ws");
  return new AmsConnection(wsUrl, headers);
}

export class AmsConnection extends EventEmitter {
  constructor(url, headers) {
    super();
    this.url = url;
    this.headers = headers;
    this.ws = new WebSocket(url, { headers });
    this.joined = new Promise((resolve, reject) => {
      this._joinedResolve = resolve;
      this._joinedReject = reject;
    });
    // close payload — populated by the 'close' event so callers can inspect
    // the §6 close code after a wire-level rejection.
    this.closeInfo = null;

    this.ws.on("message", (raw) => {
      let frame;
      try { frame = JSON.parse(raw.toString("utf8")); } catch { return; }
      if (frame && typeof frame.type === "string") {
        this.emit("frame", frame);
        this.emit(frame.type, frame);
        if (frame.type === "joined") this._joinedResolve(frame);
      }
    });
    this.ws.on("close", (code, reasonBuf) => {
      const reason = reasonBuf?.toString?.("utf8") ?? "";
      this.closeInfo = { code, reason };
      this.emit("close", { code, reason });
      if (this._joinedReject) this._joinedReject(new Error(`closed ${code} ${reason}`));
    });
    this.ws.on("error", (err) => {
      this.emit("error", err);
      if (this._joinedReject) this._joinedReject(err);
    });
  }

  async ready() {
    return this.joined;
  }

  send(data) {
    this.ws.send(JSON.stringify({ type: "token", data }));
  }

  setMetadata(metadata) {
    this.ws.send(JSON.stringify({ type: "set_metadata", metadata }));
  }

  ping() {
    this.ws.send(JSON.stringify({ type: "ping" }));
  }

  close() {
    try { this.ws.close(1000, "client_done"); } catch {}
  }
}
