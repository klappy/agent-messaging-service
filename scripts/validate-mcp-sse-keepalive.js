#!/usr/bin/env node
// scripts/validate-mcp-sse-keepalive.js
//
// Outcome-verification artifact per
// ams://canon/constraints/outcome-verification-via-runnable-artifact.
//
// The outcome verified: the GET /mcp standalone notification SSE leg emits at
// least one byte of body within SSE_FIRST_BYTE_BUDGET_MS of the response head
// arriving — and that byte is the SSE comment marker (`:`) so it's spec-valid
// keepalive. This is the substrate-level invariant whose absence the homepage
// tincan demo's "SSE error / Load failed" frame surfaces in iOS Safari.
//
// Why a substrate-level validator for a UI-level outcome:
// iOS Safari's streaming-fetch watchdog is not reproducible in headless
// Chromium or headless WebKit on Linux (existing scripts/validate-homepage-mint.js
// passes against the broken state — verified empirically before this validator
// was authored). The strongest in-CI signal we can produce without an iOS
// device farm is the substrate property whose absence is a *necessary* cause
// of "Load failed": zero body bytes on the SSE response. If this validator
// passes, the necessary-cause is eliminated and the iOS failure mode cannot
// fire from this surface. If it fails, the iOS failure mode IS firing.
//
// Demonstrably fails against current production (verified via curl pre-fix:
// HTTP 200 + text/event-stream + 0 body bytes in 6s window). Passes after
// worker/src/mcp.ts wraps the SDK GET response with a leading SSE comment.
//
// Usage:
//   node scripts/validate-mcp-sse-keepalive.js                    # ams.truthkit.ai
//   AMS_URL=https://ams.klappy.dev node scripts/validate-mcp-sse-keepalive.js
//
// Exits 0 on pass, 1 on regression, 2 on harness/setup error.

const https = require('https');
const http = require('http');
const { URL } = require('url');

const AMS_URL = process.env.AMS_URL || 'https://ams.truthkit.ai';
const SSE_FIRST_BYTE_BUDGET_MS = parseInt(process.env.SSE_FIRST_BYTE_BUDGET_MS || '2000', 10);

function postJson(url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const buf = Buffer.from(body);
    const req = lib.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: {
        ...headers,
        'content-type': 'application/json',
        'content-length': buf.length,
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// Parse a single MCP JSON-RPC payload from either application/json or
// text/event-stream framing. Mirrors the homepage's parseMcpResponse contract.
function parseMcpBody(contentType, text) {
  if ((contentType || '').includes('text/event-stream')) {
    const dataLines = [];
    for (const line of text.split('\n')) {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (!dataLines.length) throw new Error('SSE response had no data lines: ' + text.slice(0, 200));
    return JSON.parse(dataLines.join('\n'));
  }
  return JSON.parse(text);
}

// Open GET /mcp and resolve with the elapsed-ms-to-first-body-byte plus the
// first chunk's bytes. Times out after SSE_FIRST_BYTE_BUDGET_MS with elapsed
// set to that budget and chunk null — which is the failure signal.
function getFirstSseByte(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const started = Date.now();
    let resolved = false;
    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      try { req.destroy(); } catch {}
      resolve(result);
    };
    const req = lib.request({
      method: 'GET',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers,
    }, res => {
      if (res.statusCode !== 200) {
        let buf = '';
        res.on('data', c => { buf += c.toString('utf8'); });
        res.on('end', () => finish({
          status: res.statusCode,
          contentType: res.headers['content-type'] || '',
          firstByteMs: null,
          firstChunk: null,
          errorBody: buf.slice(0, 300),
        }));
        return;
      }
      res.once('data', chunk => {
        finish({
          status: res.statusCode,
          contentType: res.headers['content-type'] || '',
          firstByteMs: Date.now() - started,
          firstChunk: chunk.toString('utf8'),
          errorBody: null,
        });
      });
      res.on('end', () => finish({
        status: res.statusCode,
        contentType: res.headers['content-type'] || '',
        firstByteMs: Date.now() - started,
        firstChunk: '',
        errorBody: null,
      }));
    });
    req.on('error', reject);
    req.setTimeout(SSE_FIRST_BYTE_BUDGET_MS + 500, () => {
      finish({
        status: 200,
        contentType: 'text/event-stream',
        firstByteMs: SSE_FIRST_BYTE_BUDGET_MS, // budget exceeded
        firstChunk: null,
        errorBody: null,
      });
    });
    req.end();
  });
}

async function main() {
  console.log(`=== AMS_URL: ${AMS_URL} ===`);
  console.log(`=== SSE first-byte budget: ${SSE_FIRST_BYTE_BUDGET_MS}ms ===`);

  // --- Mint demo account
  console.log('--- minting demo account ---');
  const mintResp = await postJson(`${AMS_URL}/v1/accounts`, {},
    JSON.stringify({ namespace: 'sse-validator-' + Math.floor(Math.random() * 1e9).toString(36) }));
  if (mintResp.status !== 201) {
    console.error('FAIL: account mint returned', mintResp.status, mintResp.body.slice(0, 300));
    process.exit(2);
  }
  const bearer = JSON.parse(mintResp.body).credential;
  console.log('  bearer prefix:', bearer.slice(0, 20) + '...');

  // --- Initialize MCP (capture session id from header)
  console.log('--- initialize MCP ---');
  const initResp = await postJson(`${AMS_URL}/mcp`, {
    'authorization': 'Bearer ' + bearer,
    'accept': 'application/json, text/event-stream',
  }, JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: { roots: {} },
      clientInfo: { name: 'sse-validator', version: '0.1.0' },
    },
  }));
  if (initResp.status !== 200) {
    console.error('FAIL: initialize returned', initResp.status, initResp.body.slice(0, 300));
    process.exit(2);
  }
  const sessionId = initResp.headers['mcp-session-id'];
  if (!sessionId) {
    console.error('FAIL: initialize response missing mcp-session-id header');
    process.exit(2);
  }
  console.log('  session id:', sessionId.slice(0, 16) + '...');

  // --- Mint a conversation + join (matches homepage tincan flow so the SSE
  // leg connects in the same DO state the homepage produces)
  console.log('--- ams_create_conversation ---');
  const createResp = await postJson(`${AMS_URL}/mcp`, {
    'authorization': 'Bearer ' + bearer,
    'accept': 'application/json, text/event-stream',
    'mcp-session-id': sessionId,
  }, JSON.stringify({
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'ams_create_conversation', arguments: {} },
  }));
  if (createResp.status !== 200) {
    console.error('FAIL: create returned', createResp.status, createResp.body.slice(0, 300));
    process.exit(2);
  }
  const createPayload = parseMcpBody(createResp.headers['content-type'], createResp.body);
  const sc = createPayload.result && createPayload.result.structuredContent;
  if (!sc || !sc.magic_link) {
    console.error('FAIL: create returned no magic_link:', JSON.stringify(createPayload).slice(0, 300));
    process.exit(2);
  }
  console.log('  magic_link populated');

  console.log('--- ams_join ---');
  const joinResp = await postJson(`${AMS_URL}/mcp`, {
    'authorization': 'Bearer ' + bearer,
    'accept': 'application/json, text/event-stream',
    'mcp-session-id': sessionId,
  }, JSON.stringify({
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'ams_join', arguments: { magic_link: sc.magic_link, stream_name: 'sse-validator' } },
  }));
  if (joinResp.status !== 200) {
    console.error('FAIL: join returned', joinResp.status, joinResp.body.slice(0, 300));
    process.exit(2);
  }
  console.log('  joined');

  // --- THE ACTUAL ASSERTION: GET /mcp emits a body byte within budget
  console.log(`--- GET /mcp SSE leg, asserting first byte within ${SSE_FIRST_BYTE_BUDGET_MS}ms ---`);
  const sseResult = await getFirstSseByte(`${AMS_URL}/mcp`, {
    'authorization': 'Bearer ' + bearer,
    'mcp-session-id': sessionId,
    'accept': 'text/event-stream',
  });

  console.log('  status:        ', sseResult.status);
  console.log('  content-type:  ', sseResult.contentType);
  console.log('  first byte ms: ', sseResult.firstChunk == null ? '(timeout)' : sseResult.firstByteMs + 'ms');
  if (sseResult.firstChunk != null) {
    console.log('  first chunk:   ', JSON.stringify(sseResult.firstChunk.slice(0, 60)));
  }
  if (sseResult.errorBody) {
    console.log('  error body:    ', sseResult.errorBody);
  }

  // Assertion: first chunk arrived AND begins with `:` (SSE comment) or
  // `event:` / `data:` (real frame). A `:` comment is the keepalive contract
  // we ship; real frames also satisfy the underlying outcome.
  const arrived = sseResult.firstChunk != null && sseResult.firstChunk.length > 0;
  const inBudget = arrived && sseResult.firstByteMs < SSE_FIRST_BYTE_BUDGET_MS;
  const validSseStart = arrived && /^(:|event:|data:)/.test(sseResult.firstChunk);
  const correctContentType = (sseResult.contentType || '').includes('text/event-stream');

  const pass = correctContentType && inBudget && validSseStart;

  console.log('\n=== assertion ===');
  console.log('  content-type SSE: ', correctContentType);
  console.log('  arrived in budget:', inBudget);
  console.log('  valid SSE start:  ', validSseStart);
  console.log(`\n=== VERDICT: ${pass ? 'PASS' : 'FAIL'} ===`);
  if (!pass) {
    console.log('\nThis means the GET /mcp SSE response did not produce the leading');
    console.log('keepalive byte that defends against iOS Safari "Load failed" and');
    console.log('intermediary idle-stream drops. The wrapper-side fix is in');
    console.log('worker/src/mcp.ts wrapSseWithKeepalive.');
  }
  process.exit(pass ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
