#!/usr/bin/env node
// scripts/validate-homepage-mint.js
//
// End-to-end validator for the homepage Mint flow against a live AMS wrapper.
//
// Why this exists: regressions in the homepage's MCP client code (SSE parsing,
// session-id threading, Authorization header timing, SSE keepalive on idle
// streams) only surface in the browser. Curl tests of the wrapper alone passed
// Slice 7 while the homepage itself was broken in production, frustrating the
// operator. This validator closes the loop by exercising the actual rendered
// HTML against a live endpoint and asserting (1) the magic_link populates,
// (2) no error frames appear during the full wait window, (3) the SSE leg
// stays alive long enough that iOS Safari's idle-kill threshold (~30s) would
// have triggered a regression if SSE keepalives are missing.
//
// Runs the same scenario against BOTH chromium AND webkit. Chromium is more
// permissive on idle streams; webkit (Safari engine) reproduces iOS behavior
// closer to what real users hit. Either engine failing is a fail.
//
// Usage:
//   node scripts/validate-homepage-mint.js               # validates ams.truthkit.ai
//   AMS_URL=https://ams.klappy.dev node scripts/validate-homepage-mint.js
//   ENGINE=chromium node scripts/validate-homepage-mint.js   # only chromium
//   ENGINE=webkit node scripts/validate-homepage-mint.js     # only webkit
//   SETTLE_MS=45000 node scripts/validate-homepage-mint.js   # custom wait
//
// Exits 0 on success, 1 on validation failure, 2 on harness/setup error.

const playwright = require('playwright');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');

const AMS_URL = process.env.AMS_URL || 'https://ams.truthkit.ai';
// Wait long enough that a missing SSE heartbeat would surface as a stream
// kill on webkit. iOS Safari kills idle streams at ~30s; 40s gives margin.
const SETTLE_MS = parseInt(process.env.SETTLE_MS || '40000', 10);
const ENGINES = (process.env.ENGINE
  ? [process.env.ENGINE]
  : ['chromium', 'webkit']
).map(e => e.toLowerCase());

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    lib.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function startLocalProxyServer(html, port, amsUrl) {
  // The local server does TWO things:
  //   1. Serves the patched homepage HTML at /
  //   2. Proxies every other path to AMS_URL, streaming response bytes
  //      through (critical for the SSE GET leg).
  // This gives the validator's page same-origin requests against itself,
  // matching how a real user on ams.truthkit.ai hits the worker — no CORS
  // games, no engine-specific bypass flags.
  const amsHost = new URL(amsUrl).host;
  const amsIsHttps = amsUrl.startsWith('https:');
  const amsLib = amsIsHttps ? https : http;
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/' || req.url.startsWith('/?') || req.url === '/index.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
      // Proxy everything else to AMS, streaming.
      const upstreamUrl = new URL(req.url, amsUrl);
      const headers = { ...req.headers };
      delete headers['host'];
      headers['host'] = amsHost;
      const upstream = amsLib.request({
        method: req.method,
        hostname: upstreamUrl.hostname,
        port: upstreamUrl.port || (amsIsHttps ? 443 : 80),
        path: upstreamUrl.pathname + upstreamUrl.search,
        headers,
      }, upRes => {
        // Forward status + headers, then pipe body straight through (works
        // for SSE because we're not buffering).
        const respHeaders = { ...upRes.headers };
        // Strip CORS headers — same-origin from the page's POV anyway
        delete respHeaders['access-control-allow-origin'];
        delete respHeaders['access-control-allow-headers'];
        delete respHeaders['access-control-allow-methods'];
        res.writeHead(upRes.statusCode, upRes.statusMessage, respHeaders);
        upRes.pipe(res);
      });
      upstream.on('error', err => {
        if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
        res.end('proxy error: ' + err.message);
      });
      req.pipe(upstream);
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function runEngine(engineName, html, port) {
  console.log(`\n========== ENGINE: ${engineName} ==========`);
  const engine = playwright[engineName];
  if (!engine) {
    console.error(`UNKNOWN ENGINE: ${engineName}`);
    return { engine: engineName, pass: false, reason: 'unknown engine' };
  }

  const browser = await engine.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1100 },
  });
  const page = await ctx.newPage();

  let pageErrors = 0;
  page.on('pageerror', err => { console.log(`[pageerror] ${err.message}`); pageErrors++; });

  const network = [];
  // Browser requests now go through the local proxy at 127.0.0.1:${port},
  // not directly to AMS_URL, so track the proxy host to capture them.
  const trackedHosts = [`127.0.0.1:${port}`];
  page.on('request', req => {
    const u = req.url();
    if (trackedHosts.some(h => u.includes(h))) {
      network.push({ phase: 'req', method: req.method(), url: u, hasAuth: !!req.headers()['authorization'], sessionId: req.headers()['mcp-session-id'] || null });
    }
  });
  page.on('response', async resp => {
    const u = resp.url();
    if (trackedHosts.some(h => u.includes(h))) {
      let body = '';
      try { body = (await resp.text()).slice(0, 500); } catch {}
      network.push({ phase: 'resp', status: resp.status(), url: u, bodySnippet: body });
    }
  });

  let pass, errorFrames, linkValue;
  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForTimeout(500);

    console.log(`  clicking Mint, waiting ${SETTLE_MS}ms (long enough for SSE-keepalive failures to surface)`);
    await page.locator('#tincan-mint').first().scrollIntoViewIfNeeded();
    await page.locator('#tincan-mint').first().click();

    // Poll for error frames during the wait — fail fast if one appears, since
    // SSE keepalive failures often surface mid-wait.
    const startedAt = Date.now();
    while (Date.now() - startedAt < SETTLE_MS) {
      await page.waitForTimeout(2000);
      // Count only frames whose head reads exactly "error" — other left-kinded
      // lifecycle frames (stream_left, wire_closed) share the .left class.
      const errs = await page.$$eval('.tincan-frame.left', nodes =>
        nodes.filter(n => {
          const head = n.querySelector('.head');
          return head && head.textContent.trim() === 'error';
        }).map(n => {
          const body = n.querySelector('.body');
          return body ? body.textContent : '';
        })
      );
      if (errs.length) {
        console.log(`  *** error frame appeared at ${Math.round((Date.now()-startedAt)/1000)}s into wait ***`);
        for (const t of errs) console.log(`    ${t.slice(0,200)}`);
        break; // no point waiting more
      }
    }

    linkValue = await page.locator('#tincan-link').inputValue();
    errorFrames = await page.$$eval('.tincan-frame.left', nodes =>
      nodes.filter(n => {
        const head = n.querySelector('.head');
        return head && head.textContent.trim() === 'error';
      }).map(n => {
        const body = n.querySelector('.body');
        return body ? body.textContent : '';
      })
    );

    console.log(`\n  AMS traffic summary (${engineName}):`);
    for (const e of network) {
      if (e.phase === 'req') {
        const p = new URL(e.url).pathname;
        console.log(`    --> ${e.method} ${p}  auth=${e.hasAuth} session=${e.sessionId ? e.sessionId.slice(0,12)+'...' : 'none'}`);
      } else {
        const isErr = e.bodySnippet.includes('isError') || e.status >= 400;
        const p = new URL(e.url).pathname;
        console.log(`    <-- ${e.status} ${p}  ${isErr ? '*** ERROR ***' : ''}`);
        if (isErr) console.log(`        body: ${e.bodySnippet.slice(0, 300).replace(/\n/g, '\\n')}`);
      }
    }

    console.log(`\n  final state (${engineName}):`);
    console.log(`    link:    ${linkValue || '(empty)'}`);
    console.log(`    errors:  ${errorFrames.length}`);
    if (errorFrames.length) {
      for (const t of errorFrames) console.log(`      ${t.slice(0,200)}`);
    }
    console.log(`    pageErr: ${pageErrors}`);

    const screenshotPath = path.join(__dirname, '..', `tmp-validator-${engineName}.png`);
    try {
      await page.locator('.tincan').first().screenshot({ path: screenshotPath });
      console.log(`    screenshot: ${screenshotPath}`);
    } catch {}

    const linkPopulated = linkValue && linkValue.includes('://') && linkValue.includes('?t=');
    const noErrors = errorFrames.length === 0 && pageErrors === 0;
    pass = linkPopulated && noErrors;
    console.log(`\n  VERDICT (${engineName}): ${pass ? 'PASS' : 'FAIL'}  (link=${!!linkPopulated} noErrors=${noErrors})`);
  } catch (e) {
    console.error(`  HARNESS ERROR (${engineName}): ${e.message}`);
    pass = false;
  } finally {
    await browser.close().catch(() => {});
  }
  return { engine: engineName, pass, errorFrames: errorFrames || [], linkValue };
}

async function main() {
  console.log(`=== AMS_URL: ${AMS_URL}  SETTLE_MS: ${SETTLE_MS}  ENGINES: ${ENGINES.join(', ')} ===`);

  console.log('=== fetching live homepage HTML ===');
  let html = await fetchText(`${AMS_URL}/`);
  console.log(`  size: ${html.length}`);

  // Override the page's ORIGIN to point at the local proxy. The proxy forwards
  // every non-/ request upstream to AMS_URL, so the page sees same-origin
  // requests against itself — matching how a real user on ams.truthkit.ai
  // hits the worker. No CORS, no engine-specific bypass flags needed.
  const port = parseInt(process.env.VALIDATOR_PORT || '8765', 10);
  const origConst = 'const ORIGIN = window.location.origin;';
  if (!html.includes(origConst)) {
    console.error('FAIL: could not find ORIGIN const — page structure changed?');
    process.exit(2);
  }
  html = html.replace(origConst, `const ORIGIN = "http://127.0.0.1:${port}";`);

  const server = await startLocalProxyServer(html, port, AMS_URL);

  const results = [];
  for (const engineName of ENGINES) {
    results.push(await runEngine(engineName, html, port));
  }
  server.close();

  console.log('\n========== SUMMARY ==========');
  for (const r of results) {
    console.log(`  ${r.engine}: ${r.pass ? 'PASS' : 'FAIL'}`);
  }
  const allPass = results.every(r => r.pass);
  console.log(`\nOVERALL: ${allPass ? 'PASS' : 'FAIL'}`);
  process.exit(allPass ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
