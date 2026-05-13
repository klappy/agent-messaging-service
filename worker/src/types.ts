export interface Env {
  AMS_KV: KVNamespace;
  AMS_CREDENTIAL_PEPPER: string;
  AMS_PERMISSIVE_TOKEN_PEPPER: string;
  CONVERSATION_DO: DurableObjectNamespace;
  // Per ams://canon/decisions/D0024, the hosted MCP wrapper is an `agents/mcp`
  // McpAgent subclass (AmsMcpAgent). Each instance is per MCP transport
  // session; (account_id, conversation_id) is threaded as construction props
  // per D0019, kept opaque to the SDK's session id.
  AMS_MCP: DurableObjectNamespace;
  // AuditGateDO — generalized persona-shaped agent runtime, instantiated
  // per persona_uri in the request body. One DO instance per audit
  // invocation, keyed by PR head_sha at the route layer. See
  // worker/src/runtime/audit-gate.ts and the canon constraint
  // canon-code-sync-via-spawned-agent-session.
  AUDIT_GATE: DurableObjectNamespace;
  // Anthropic API key for the audit-gate agent session. The AuditGateDO
  // calls the Anthropic Messages API with the persona's
  // mcp_servers.operational wired in via the native MCP connector
  // (anthropic-beta: mcp-client-2025-11-20). Set via `wrangler secret
  // put ANTHROPIC_API_KEY`. If unset, the audit session fails fast.
  ANTHROPIC_API_KEY?: string;
}

export interface AccountRecord {
  account_id: string;
  namespace: string;
  credential_hash: string;
  created_at: string;
}

export interface ConversationRecord {
  conversation_id: string;
  alias: string;
  namespace: string;
  owner_account_id: string;
  id_kind: "uuid";
  permissive_token_hash: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
