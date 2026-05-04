export interface Env {
  AMS_KV: KVNamespace;
  AMS_CREDENTIAL_PEPPER: string;
  AMS_PERMISSIVE_TOKEN_PEPPER: string;
  CONVERSATION_DO: DurableObjectNamespace;
  // Per ams://canon/decisions/D0019, keyed by (account_id, conversation_id).
  // Holds the upstream wire WebSocket and the per-session MCP tenant set.
  SESSION_DO: DurableObjectNamespace;
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
