#!/usr/bin/env bash
# scripts/check-sse-heartbeat.sh
#
# Validates the GET /mcp SSE response wrapper contract end-to-end against a
# deployed AMS Worker. Asserts BOTH halves of the wrapper's contract:
#
#   1. **Leading flush** — the first body byte arrives within
#      ${LEADING_BUDGET_S} seconds (default 2). Without this, iOS Safari's
#      streaming-fetch watchdog raises "TypeError: Load failed" on the
#      homepage tincan demo.
#
#   2. **Idle heartbeat** — within ${HEARTBEAT_BUDGET_S} seconds (default 20)
#      a `:keepalive\n\n` frame arrives, distinct from the leading `:ok\n\n`.
#      Without this, intermediary HTTP/2 idle-stream drops kill long-lived
#      connections silently.
#
# Both must pass. A wrapper that emits the leading flush but loses the
# heartbeat path passes #1 and fails #2; a wrapper that loses the leading
# flush fails #1 immediately. The previous version of this script asserted
# only "first byte arrives" — Bugbot correctly noted that a wrapper emitting
# `:ok\n\n` and nothing else would silently pass.
#
# Usage:
#   ./scripts/check-sse-heartbeat.sh                                # ams.truthkit.ai
#   AMS_URL=https://ams.klappy.dev ./scripts/check-sse-heartbeat.sh
#   HEARTBEAT_BUDGET_S=30 ./scripts/check-sse-heartbeat.sh          # for testing
#
# Exits 0 on PASS, 1 on regression, 2 on harness error.
#
# Authority: ams://canon/constraints/outcome-verification-via-runnable-artifact

set -e

AMS_URL="${AMS_URL:-https://ams.truthkit.ai}"
LEADING_BUDGET_S="${LEADING_BUDGET_S:-2}"
HEARTBEAT_BUDGET_S="${HEARTBEAT_BUDGET_S:-20}"

# 64 bits of randomness. Previous 16-bit version (openssl rand -hex 2) hit
# birthday collisions when this script ran on every push to main across two
# hosts — namespace_taken failures unrelated to the SSE contract.
NS="bt-hb-$(openssl rand -hex 8)"
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

TMP=$(mktemp)
TTFB_OUT=$(mktemp)
trap 'rm -f "$TMP" "$TTFB_OUT"' EXIT

# Measure leading-byte latency with a SHORT curl bounded by LEADING_BUDGET_S.
# This call exits naturally when the budget elapses, so -w gets flushed and
# we capture an accurate time_starttransfer. We also capture the body so we
# can verify the first byte content.
echo "=== probe 1: leading byte within ${LEADING_BUDGET_S}s ==="
LEADING_BODY=$(mktemp)
trap 'rm -f "$TMP" "$TTFB_OUT" "$LEADING_BODY"' EXIT

# `curl --max-time` causes curl to exit non-zero (28) on timeout, but -w
# still writes to stdout in that case. Run in a subshell that always exits 0.
TTFB=$(curl -sN --max-time "$LEADING_BUDGET_S" -X GET "$AMS_URL/mcp" \
  -H "Authorization: Bearer $TOK" \
  -H "Mcp-Session-Id: $SID" \
  -H "Accept: text/event-stream" \
  -o "$LEADING_BODY" \
  -w '%{time_starttransfer}' 2>/dev/null || true)

LEADING_BYTES=$(wc -c < "$LEADING_BODY" | tr -d ' ')
echo "  bytes received: $LEADING_BYTES"
echo "  time-to-first-byte: ${TTFB}s"
if [ "$LEADING_BYTES" -gt 0 ]; then
  echo "  first 80 bytes: $(head -c 80 "$LEADING_BODY")"
fi

if [ "$LEADING_BYTES" -eq 0 ]; then
  echo "FAIL: zero bytes in ${LEADING_BUDGET_S}s — leading flush missing"
  exit 1
fi
FIRST_CHAR=$(head -c 1 "$LEADING_BODY")
if [ "$FIRST_CHAR" != ":" ]; then
  echo "FAIL: first byte is $(printf '%q' "$FIRST_CHAR"), expected ':'"
  exit 1
fi
TTFB_OK=$(awk -v t="$TTFB" -v b="$LEADING_BUDGET_S" 'BEGIN { print (t > 0 && t < b) ? "1" : "0" }')
if [ "$TTFB_OK" != "1" ]; then
  echo "FAIL: time-to-first-byte=${TTFB}s outside (0, ${LEADING_BUDGET_S}s) budget"
  exit 1
fi
echo "  PASS leading byte: arrived at ${TTFB}s"

# --- probe 2: a `:keepalive` heartbeat (distinct from `:ok`) arrives ---
echo "=== probe 2: heartbeat within ${HEARTBEAT_BUDGET_S}s ==="
# Need a fresh session — the prior leading-byte probe may have closed its
# stream when we cancelled. (MCP sessions are reusable across multiple
# GET /mcp connections per spec, so we can reuse $TOK and $SID.)
timeout "$HEARTBEAT_BUDGET_S" curl -sN -X GET "$AMS_URL/mcp" \
  -H "Authorization: Bearer $TOK" \
  -H "Mcp-Session-Id: $SID" \
  -H "Accept: text/event-stream" \
  --raw -o "$TMP" 2>/dev/null || true

HB_BYTES=$(wc -c < "$TMP" | tr -d ' ')
echo "  bytes received: $HB_BYTES"
echo "  body received:"
head -c 400 "$TMP" | sed 's/^/    /'
echo ""

if [ "$HB_BYTES" -eq 0 ]; then
  echo "FAIL: zero bytes in ${HEARTBEAT_BUDGET_S}s on heartbeat probe"
  exit 1
fi

if grep -q "^:keepalive" "$TMP"; then
  echo "  PASS heartbeat: :keepalive frame arrived within ${HEARTBEAT_BUDGET_S}s"
else
  echo "FAIL: no :keepalive frame in ${HEARTBEAT_BUDGET_S}s"
  echo "  Wrapper may emit leading flush but the heartbeat path is broken."
  exit 1
fi

echo ""
echo "VERDICT: PASS — leading flush + idle heartbeat both intact"
exit 0
