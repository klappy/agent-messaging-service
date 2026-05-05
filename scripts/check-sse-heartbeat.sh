#!/usr/bin/env bash
# scripts/check-sse-heartbeat.sh
#
# Validates that the AMS MCP SSE leg sends bytes immediately on response start
# — the leading-flush contract that defends against iOS Safari's
# streaming-fetch watchdog. Without an immediate byte, WebKit's fetch raises
# "TypeError: Load failed" and the homepage tincan demo's SSE leg dies. See
# canon constraint outcome-verification-via-runnable-artifact and journal
# 2026-05-05-tincan-sse-keepalive-fresh-iteration.tsv.
#
# Contract (post-PR #49): worker/src/mcp.ts wrapWithSseHeartbeat enqueues
# `:ok\n\n` (a 5-byte SSE comment) at +0ms before entering the read loop.
# Network round-trip + TLS handshake account for the wall-clock latency;
# server-side flush is essentially instantaneous. A 2-second budget is
# generous against any reasonable network and demonstrably fails against
# the pre-PR-#49 zero-bytes-for-15s state.
#
# Usage:
#   ./scripts/check-sse-heartbeat.sh                                # validates ams.truthkit.ai
#   AMS_URL=https://ams.klappy.dev ./scripts/check-sse-heartbeat.sh
#   MAX_IDLE_S=30 ./scripts/check-sse-heartbeat.sh                  # legacy 25s window for heartbeat-only checks
#
# Exits 0 when bytes arrive within MAX_IDLE_S AND the first byte is `:`
# (SSE comment marker — both `:ok\n\n` and `:keepalive\n\n` start this way),
# 1 when no bytes arrive in window OR first byte is wrong, 2 on harness error.

set -e

AMS_URL="${AMS_URL:-https://ams.truthkit.ai}"
# Default tightened from 25s (heartbeat-only window) to 2s (leading-flush
# window) after PR #49 made the wrapper write `:ok\n\n` immediately on response
# start. A regression that removes the leading flush would fail at this budget
# (zero bytes in 2s) where it would have silently passed at 25s.
MAX_IDLE_S="${MAX_IDLE_S:-2}"

# Mint a probe account in a fresh namespace. AMS namespaces are global per
# `ams://canon/decisions/D0011-multi-host-cname-deployment` (one Worker, one KV
# bound to both hosts), so probe namespaces accumulate forever and never get
# cleaned up. With only 16 bits of entropy the collision rate becomes
# significant after a few thousand main-branch pushes, and a collision returns
# 409 namespace_taken — which under `set -e` aborts the probe on a condition
# unrelated to the SSE contract this script is supposed to validate.
#
# Mitigation: 64 bits of randomness (~1.8e19 values) effectively eliminates
# birthday collisions over the lifetime of this probe, and we still retry up
# to a few times on the off chance one happens. namespaces stay within the
# isValidNamespace() shape (lowercase alphanumeric + hyphen, <= 63 chars).
TOK=""
NS=""
for attempt in 1 2 3 4 5; do
  NS="bt-hb-$(openssl rand -hex 8)"
  echo "=== minting account in $NS (attempt $attempt) ==="
  MINT_HTTP=$(curl -sS -o /tmp/sse-mint.$$.json -w "%{http_code}" \
    -X POST "$AMS_URL/v1/accounts" \
    -H "content-type: application/json" \
    -d "{\"namespace\":\"$NS\"}")
  if [ "$MINT_HTTP" = "201" ]; then
    TOK=$(python3 -c "import json,sys;print(json.loads(open('/tmp/sse-mint.$$.json').read())['credential'])")
    rm -f /tmp/sse-mint.$$.json
    break
  fi
  if [ "$MINT_HTTP" = "409" ]; then
    echo "  namespace_taken on $NS, retrying with fresh entropy"
    rm -f /tmp/sse-mint.$$.json
    continue
  fi
  echo "FAIL: account mint returned HTTP $MINT_HTTP" >&2
  cat /tmp/sse-mint.$$.json >&2 2>/dev/null || true
  rm -f /tmp/sse-mint.$$.json
  exit 2
done
if [ -z "$TOK" ]; then
  echo "FAIL: could not mint a probe account after 5 attempts (namespace collisions)" >&2
  exit 2
fi
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

echo "=== streaming GET /mcp for ${MAX_IDLE_S}s, asserting leading bytes arrive ==="
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

# Stream for MAX_IDLE_S seconds; capture bytes to a file. Curl will exit on
# timeout. Then check whether the file is non-empty AND begins with `:`.
timeout "$MAX_IDLE_S" curl -sN -X GET "$AMS_URL/mcp" \
  -H "Authorization: Bearer $TOK" \
  -H "Mcp-Session-Id: $SID" \
  -H "Accept: text/event-stream" \
  --raw -o "$TMP" 2>/dev/null || true

BYTES=$(wc -c < "$TMP" | tr -d ' ')
echo "  bytes received in ${MAX_IDLE_S}s: $BYTES"

if [ "$BYTES" -eq 0 ]; then
  echo ""
  echo "VERDICT: FAIL — SDK SSE stream emitted ZERO bytes in ${MAX_IDLE_S}s"
  echo "  iOS Safari (and any client with idle-kill timeout) will drop this stream."
  echo "  Fix: the SDK wrapper in worker/src/mcp.ts must inject a leading flush."
  exit 1
fi

FIRST_BYTE=$(head -c 1 "$TMP")
echo "  first 200 bytes: $(head -c 200 "$TMP")"

if [ "$FIRST_BYTE" != ":" ]; then
  echo ""
  echo "VERDICT: FAIL — first byte is $(printf '%q' "$FIRST_BYTE"), expected ':' (SSE comment)"
  echo "  Both ':ok\\n\\n' (leading flush) and ':keepalive\\n\\n' (heartbeat) start with ':'."
  echo "  A different first byte means the wrapper contract is broken."
  exit 1
fi

echo ""
echo "VERDICT: PASS — SDK SSE stream emitted leading SSE comment within ${MAX_IDLE_S}s"
exit 0
