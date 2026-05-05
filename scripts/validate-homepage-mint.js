#!/usr/bin/env node
// scripts/validate-homepage-mint.js
//
// End-to-end validator for the homepage Mint flow against a live AMS wrapper.
//
// Why this exists: regressions in the homepage's MCP client code (SSE parsing,
// session-id threading, Authorization header timing) only surface in the
// browser. Curl tests of the wrapper alone passed Slice 7 while the homepage
// itself was broken in production, frustrating the operator. This validator
// closes the loop by exercising the actual rendered HTML against a live
// endpoint and asserting the magic_link populates and no error frames appear.
//
// Usage:
//   node scripts/validate-homepage-mint.js               # validates ams.truthkit.ai
//   AMS_URL=https://ams.klappy.dev node scripts/validate-homepage-mint.js
//
// Exits 0 on success, 1 on validation failure, 2 on harness/setup error.

const { chromium } = require('playwright');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const AMS_URL = process.env.AMS_URL || 'https://ams.truthkit.ai';
const SETTLE_MS = parseInt(process.env.SETTLE_MS || '8000', 10);

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

function startLocalServer(html, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function main() {
  console.log(`=== AMS_URL: ${AMS_URL} ===`);
  console.log('=== fetching live homepage HTML ===');
  let html = await fetchText(`${AMS_URL}/`);
  console.log(`  size: ${html.length}`);

  // Override the page's ORIGIN constant so it talks to AMS_URL when served from
  // a different origin (this validator runs from 127.0.0.1).
  const origConst = 'const ORIGIN = window.location.origin;';
  if (!html.includes(origConst)) {
    console.error('FAIL: could not find ORIGIN const — page structure changed?');
    process.exit(2);
  }
  html = html.replace(origConst, `const ORIGIN = "${AMS_URL}";`);

  const port = parseInt(process.env.VALIDATOR_PORT || '8765', 10);
  const server = await startLocalServer(html, port);
  console.log(`=== local server up on http://127.0.0.1:${port}/ ===`);

  const browser = await chromium.launch({
    args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1100 },
    bypassCSP: true,
  });
  const page = await ctx.newPage();

  let pageErrors = 0;
  page.on('pageerror', err => { console.log(`[pageerror] ${err.message}`); pageErrors++; });

  const network = [];
  const trackedHosts = [new URL(AMS_URL).host];
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

  try {
    console.log(`=== loading http://127.0.0.1:${port}/ ===`);
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForTimeout(500);

    console.log('=== clicking Mint ===');
    await page.locator('#tincan-mint').first().scrollIntoViewIfNeeded();
    await page.locator('#tincan-mint').first().click();

    console.log(`=== waiting ${SETTLE_MS}ms for flow to settle ===`);
    await page.waitForTimeout(SETTLE_MS);

    const linkValue = await page.locator('#tincan-link').inputValue();
    const errorFrames = await page.locator('.tincan-frame.left .body').allTextContents();

    console.log('\n=== AMS traffic summary ===');
    for (const e of network) {
      if (e.phase === 'req') {
        const p = new URL(e.url).pathname;
        console.log(`  --> ${e.method} ${p}  auth=${e.hasAuth} session=${e.sessionId ? e.sessionId.slice(0,12)+'...' : 'none'}`);
      } else {
        const isErr = e.bodySnippet.includes('isError') || e.status >= 400;
        const p = new URL(e.url).pathname;
        console.log(`  <-- ${e.status} ${p}  ${isErr ? '*** ERROR ***' : ''}`);
        if (isErr) console.log(`      body: ${e.bodySnippet.slice(0, 300).replace(/\n/g, '\\n')}`);
      }
    }

    console.log('\n=== final state ===');
    console.log('  link:    ', linkValue || '(empty)');
    console.log('  errors:  ', errorFrames.length);
    if (errorFrames.length) {
      for (const t of errorFrames) console.log('   ', t);
    }
    console.log('  pageErr: ', pageErrors);

    // Persist screenshot for human review
    const screenshotPath = path.join(__dirname, '..', 'tmp-validator-screenshot.png');
    try {
      await page.locator('.tincan').first().screenshot({ path: screenshotPath });
      console.log(`  screenshot: ${screenshotPath}`);
    } catch {}

    const linkPopulated = linkValue && linkValue.includes('://') && linkValue.includes('?t=');
    const noErrors = errorFrames.length === 0 && pageErrors === 0;
    const pass = linkPopulated && noErrors;
    console.log(`\n=== VERDICT: ${pass ? 'PASS' : 'FAIL'} ===`);
    if (!pass) {
      console.log(`  linkPopulated=${linkPopulated} noErrors=${noErrors}`);
    }

    await browser.close();
    server.close();
    process.exit(pass ? 0 : 1);
  } catch (e) {
    console.error('HARNESS ERROR:', e.message);
    await browser.close().catch(() => {});
    server.close();
    process.exit(2);
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
