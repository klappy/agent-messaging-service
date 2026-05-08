export interface Env {
  // Service binding to AMS Worker per ams://canon/decisions/D0026.
  // Used to proxy MCP POST and SSE GET from the portal route to AMS,
  // keeping the magic link URL as the single MCP transport endpoint (D0023).
  AMS: Fetcher;
}

// AMS conversation record returned by GET /v1/{ns}/conversations/{alias}?t=…
// Mirrors the public read endpoint's response shape (see worker/src/index.ts
// `getConversation`); the portal fetches it server-side via the AMS service
// binding to populate the canon-rendered bootstrap.
export interface ConvRecord {
  conversation_id: string;
  namespace: string;
  alias: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
