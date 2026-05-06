export interface Env {
  // Service binding to AMS Worker per ams://canon/decisions/D0026.
  // Used to proxy MCP POST and SSE GET from the portal route to AMS,
  // keeping the magic link URL as the single MCP transport endpoint (D0023).
  AMS: Fetcher;
}
