#!/usr/bin/env bash
# scripts/check-sse-heartbeat.sh
#
# Validates that the AMS MCP SSE leg sends keepalive bytes within a window
# short enough to satisfy iOS Safari's idle-stream kill threshold (~30s).
# Without keepalives the connection dies mid-flight and surfaces as a
# "Load failed" error on the homepage — see canon constraint
# outcome-verification-via-runnable-artifact and journal
# 2026-05-05-iossafari-sse-keepalive-incident.tsv.
#
# Usage:
#   ./scripts/check-sse-heartbeat.sh                                # validates ams.truthkit.ai
#   AMS_URL=https://ams.klappy.dev ./scripts/check-sse-heartbeat.sh
#
# Exits 0 when the SDK emits any bytes within MAX_IDLE_S seconds (heartbeat
# present), 1 when no bytes arrive in that window (regression), 2 on harness
# error.

set -e

AMS_URL="${AMS_URL:-https://ams.truthkit.ai}"
# iOS Safari kills idle streams at ~30s; threshold of 25s gives margin while
# being well above the 15s heartbeat the wrapper is supposed to emit.
MAX_IDLE_S="${MAX_IDLE_S:-25}"

NS="bt-hb-$(openssl rand -hex 2)"
echo "=== minting account in $NS ==="
TOK=$(curl -fsS -X POST "$AMS_URL/v1/accounts" \
  -H "content-type: application/json" \
  -d "{\"namespace\":\"$NS\"}" \
  | python3 -c "import json,sys;print(json.loads(sys.stdin.read())['credential'])")
echo "  tok: ${TOK:0:24}..."

echo "=== initializing MCP session ==="
SID=$(curl -fsS -D - -X POST "$AMS_URL/mcp" \
  -H "Authorization: Bearer $TOK" \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"sse-keepalive-check","version":"1"}}}' \
  -o /dev/null 2>&1 | grep -i "^mcp-session-id:" | awk '{print $2}' | tr -d "\r")
echo "  session: ${SID:0:24}..."

if [ -z "$SID" ]; then
  echo "FAIL: could not obtain mcp-session-id" >&2
  exit 2
fi

echo "=== streaming GET /mcp for ${MAX_IDLE_S}s, asserting any byte arrives ==="
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

# Stream for MAX_IDLE_S seconds; capture bytes to a file. Curl will exit on
# timeout. Then check whether the file is non-empty.
timeout "$MAX_IDLE_S" curl -sN -X GET "$AMS_URL/mcp" \
  -H "Authorization: Bearer $TOK" \
  -H "Mcp-Session-Id: $SID" \
  -H "Accept: text/event-stream" \
  --raw -o "$TMP" 2>/dev/null || true

BYTES=$(wc -c < "$TMP" | tr -d ' ')
echo "  bytes received in ${MAX_IDLE_S}s: $BYTES"

if [ "$BYTES" -gt 0 ]; then
  echo "  first 200 bytes: $(head -c 200 "$TMP")"
  echo ""
  echo "VERDICT: PASS — SDK SSE stream emitted keepalive bytes within ${MAX_IDLE_S}s"
  exit 0
else
  echo ""
  echo "VERDICT: FAIL — SDK SSE stream emitted ZERO bytes in ${MAX_IDLE_S}s"
  echo "  iOS Safari (and any client with idle-kill timeout) will drop this stream."
  echo "  Fix: the SDK wrapper in worker/src/mcp.ts must inject heartbeats."
  exit 1
fi
