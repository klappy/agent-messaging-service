import { renderBootstrapMarkdown } from "./bootstrap";
import type { ConvRecord } from "./types";

export interface PortalParams {
  namespace: string;
  alias: string;
  permissive: string;
  magicLink: string;
  amsMagicLink: string;
  // Server-side-fetched conversation record. Drives the canon-rendered
  // AI-readable bootstrap embedded in the HTML per
  // ams://canon/decisions/D0025 §What the Portal Provides.
  record: ConvRecord;
}

// HTML-escape values that are interpolated into the portal HTML. Without
// escaping, p.namespace, p.alias, and the canon-rendered bootstrap markdown
// (which contains p.amsMagicLink and conversation metadata) would be
// reflected XSS sinks on the TinCan origin.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function portalResponse(p: PortalParams): Promise<Response> {
  // Render-time composition per ams://canon/constraints/portal-bootstrap-content
  // §Render-Time Composition: prescribed sections fetched from canon, conversation
  // identifiers substituted in, full markdown emitted. The HTML embeds it in a
  // visually-hidden but AI-readable <pre> block per D0025 §What the Portal Provides.
  const joinInstructions = await renderBootstrapMarkdown({
    record: p.record,
    amsMagicLink: p.amsMagicLink,
    tincanUrl: p.magicLink,
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TinCan — ${escapeHtml(p.namespace)}/${escapeHtml(p.alias)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Special+Elite&family=DM+Mono:wght@400;500&display=swap');

    :root {
      --rust:   #c0392b;
      --tin:    #8c9aa0;
      --cream:  #f5f0e8;
      --ink:    #1a1a18;
      --green:  #27ae60;
      --blue:   #2980b9;
      --purple: #8e44ad;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'DM Mono', monospace;
      background: var(--cream);
      color: var(--ink);
      height: 100dvh;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
    }

    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
      pointer-events: none;
      z-index: 0;
    }

    /* AI instructions — readable by web_fetch, hidden visually */
    .ai-instructions {
      position: absolute;
      width: 1px; height: 1px;
      overflow: hidden;
      clip: rect(0,0,0,0);
      white-space: pre;
    }

    /* Header */
    .header {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.65rem 1rem;
      border-bottom: 1px solid rgba(0,0,0,0.1);
      flex-shrink: 0;
      background: rgba(245,240,232,0.95);
    }
    .header-back { font-size: 0.75rem; color: #999; text-decoration: none; }
    .header-back:hover { color: var(--ink); }
    .header-title {
      font-family: 'Special Elite', cursive;
      font-size: 0.95rem;
      color: #666;
      flex: 1;
    }
    .header-title strong { color: var(--ink); }
    .status {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.68rem;
      color: #999;
      letter-spacing: 0.04em;
    }
    .dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: #ccc;
      flex-shrink: 0;
    }
    .dot.connected { background: var(--green); }
    .dot.error     { background: var(--rust); }
    .dot.joining   { background: #f39c12; }

    /* Stream */
    .stream {
      position: relative;
      z-index: 1;
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .event {
      font-size: 0.8rem;
      line-height: 1.55;
      padding: 0.45rem 0.7rem;
      border-radius: 2px;
      border-left: 2px solid rgba(0,0,0,0.1);
    }
    .event-meta {
      font-size: 0.65rem;
      color: #aaa;
      margin-bottom: 0.15rem;
      letter-spacing: 0.03em;
    }
    .event.system  { border-color: #ccc; color: #999; font-style: italic; }
    .event.joined  { border-color: var(--green); color: #888; }
    .event.left    { border-color: var(--rust); color: #888; }
    .event.token   { border-color: var(--blue); white-space: pre-wrap; word-break: break-word; }
    .event.own     { border-color: var(--purple); white-space: pre-wrap; word-break: break-word; }

    /* Send bar */
    .send-bar {
      position: relative;
      z-index: 1;
      display: flex;
      gap: 0.5rem;
      padding: 0.65rem 1rem;
      border-top: 1px solid rgba(0,0,0,0.1);
      flex-shrink: 0;
      background: rgba(245,240,232,0.95);
    }
    .send-input {
      flex: 1;
      background: rgba(0,0,0,0.05);
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 2px;
      color: var(--ink);
      font-family: 'DM Mono', monospace;
      font-size: 0.85rem;
      padding: 0.6rem 0.75rem;
      outline: none;
    }
    .send-input:focus { border-color: rgba(0,0,0,0.25); }
    .send-input:disabled { opacity: 0.4; }
    .send-btn {
      background: var(--rust);
      border: none;
      border-radius: 2px;
      color: var(--cream);
      font-family: 'DM Mono', monospace;
      font-size: 0.78rem;
      letter-spacing: 0.06em;
      padding: 0.6rem 1.1rem;
      cursor: pointer;
      box-shadow: 2px 2px 0 var(--ink);
      transition: transform 0.1s, box-shadow 0.1s;
    }
    .send-btn:hover { transform: translate(-1px,-1px); box-shadow: 3px 3px 0 var(--ink); }
    .send-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; box-shadow: 2px 2px 0 var(--ink); }

    .copy-link-btn {
      background: transparent;
      border: 1px solid rgba(0,0,0,0.15);
      border-radius: 2px;
      color: #888;
      font-family: 'DM Mono', monospace;
      font-size: 0.72rem;
      letter-spacing: 0.05em;
      padding: 0.6rem 0.85rem;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
      transition: color 0.15s, border-color 0.15s;
    }
    .copy-link-btn:hover { color: var(--ink); border-color: rgba(0,0,0,0.3); }
  </style>
</head>
<body>

  <pre class="ai-instructions" aria-label="AI agent join instructions">${escapeHtml(joinInstructions)}</pre>

  <div class="header">
    <a class="header-back" href="/">←</a>
    <span class="header-title"><strong>${escapeHtml(p.namespace)}</strong> / ${escapeHtml(p.alias)}</span>
    <div class="status">
      <div class="dot joining" id="dot"></div>
      <span id="status-label">joining…</span>
    </div>
  </div>

  <div class="stream" id="stream"></div>

  <div class="send-bar">
    <button class="copy-link-btn" id="copy-link-btn">⬡ Invite</button>
    <input class="send-input" id="send-input" placeholder="Say something to the conversation…" disabled>
    <button class="send-btn" id="send-btn" disabled>Send</button>
  </div>

  <script>
    const MCP_URL     = ${JSON.stringify(p.amsMagicLink)};
    const STORAGE_KEY = "tincan_account";

    const streamEl    = document.getElementById('stream');
    const sendInput   = document.getElementById('send-input');
    const sendBtn     = document.getElementById('send-btn');
    const dot         = document.getElementById('dot');
    const statusLabel = document.getElementById('status-label');

    let account      = null;
    let mcpSessionId = null;
    let streamName   = null;
    let pollTimer    = null;

    // ── Account ─────────────────────────────────────────────────────────────

    function loadAccount() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
    }
    function saveAccount(a) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(a)); } catch {}
    }
    async function mintAccount() {
      // Random namespace: tincan- + 32 hex chars (128 bits of entropy)
      const namespace = 'tincan-' + Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2,'0')).join('');
      const res = await fetch('/v1/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ namespace }),
      });
      if (!res.ok) throw new Error('Account mint failed: ' + res.status);
      const data = await res.json();
      return { namespace, account_id: data.account_id, credential: data.credential };
    }
    async function ensureAccount() {
      let a = loadAccount();
      if (!a) { a = await mintAccount(); saveAccount(a); }
      return a;
    }

    // ── UI helpers ───────────────────────────────────────────────────────────

    function setStatus(state, label) {
      dot.className = 'dot ' + state;
      statusLabel.textContent = label;
    }

    function addEvent(type, content, meta) {
      const el = document.createElement('div');
      el.className = 'event ' + type;
      if (meta) {
        const m = document.createElement('div');
        m.className = 'event-meta';
        m.textContent = meta;
        el.appendChild(m);
      }
      const c = document.createElement('div');
      c.textContent = content;
      el.appendChild(c);
      streamEl.appendChild(el);
      streamEl.scrollTop = streamEl.scrollHeight;
    }

    // ── MCP ──────────────────────────────────────────────────────────────────

    async function mcpPost(body) {
      const res = await fetch(MCP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Authorization': 'Bearer ' + account.credential,
          ...(mcpSessionId ? { 'mcp-session-id': mcpSessionId } : {}),
        },
        body: JSON.stringify(body),
      });
      // Bearer may have expired — clear stored account so caller can re-mint.
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem(STORAGE_KEY);
        throw new Error('auth_expired');
      }
      if (!res.ok) throw new Error('MCP request failed: ' + res.status);
      const sid = res.headers.get('mcp-session-id');
      if (sid) mcpSessionId = sid;
      const text = await res.text();
      const dataLine = text.split('\\n').find(l => l.startsWith('data: '));
      if (!dataLine) return null;
      try { return JSON.parse(dataLine.slice(6)); } catch { return null; }
    }

    async function join() {
      setStatus('joining', 'joining…');
      addEvent('system', 'Setting up account…');

      account = await ensureAccount();
      streamName = account.namespace + '-human';

      addEvent('system', 'Initializing MCP session…');
      setStatus('joining', 'connecting…');

      const initRes = await mcpPost({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'tincan-portal', version: '1.0' }
        }
      });
      if (!initRes) throw new Error('initialize returned no response');
      if (initRes.error) throw new Error(initRes.error.message);

      await mcpPost({ jsonrpc: '2.0', method: 'notifications/initialized' });

      const joinRes = await mcpPost({
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: {
          name: 'ams_join',
          arguments: {
            stream_name: streamName,
            self_subscribe: true,
            stream_metadata: {
              capabilities: {
                'ams.convention.v1': {
                  role: 'human',
                  function: 'observer-participant',
                  posture: 'collaborative'
                }
              }
            }
          }
        }
      });
      if (!joinRes) throw new Error('ams_join returned no response');
      if (joinRes.error) throw new Error(joinRes.error.message);

      setStatus('connected', 'connected');
      addEvent('joined', 'You joined as ' + streamName);
      sendInput.disabled = false;
      sendBtn.disabled = false;
      sendInput.focus();
      poll();
    }

    async function poll() {
      try {
        const res = await mcpPost({
          jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
          params: { name: 'ams_recv', arguments: { wait_ms: 5000, max_frames: 20 } }
        });
        if (res?.result?.content) {
          const text = res.result.content.find(c => c.type === 'text')?.text;
          if (text) {
            const data = JSON.parse(text);
            (data.frames || []).forEach(renderFrame);
          }
        }
      } catch (e) {
        if (e && e.message === 'auth_expired') {
          setStatus('error', 'session expired');
          addEvent('system', 'Session expired — please reload to reconnect.');
          sendInput.disabled = true;
          sendBtn.disabled = true;
          return;
        }
      }
      pollTimer = setTimeout(poll, 100);
    }

    function renderFrame(frame) {
      const params = frame.params || {};
      if (frame.method === 'notifications/ams/stream_joined' && params.stream_name !== streamName) {
        addEvent('joined', params.stream_name + ' joined');
      } else if (frame.method === 'notifications/ams/stream_left') {
        addEvent('left', params.stream_name + ' left');
      } else if (frame.method === 'notifications/ams/token') {
        const own = params.stream_name === streamName;
        addEvent(own ? 'own' : 'token', params.data, own ? null : params.stream_name);
      }
    }

    async function sendMessage(text) {
      if (!text.trim()) return;
      sendInput.value = '';
      sendBtn.disabled = true;
      try {
        await mcpPost({
          jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
          params: { name: 'ams_send', arguments: { data: text } }
        });
      } catch (e) {
        addEvent('system', 'Send failed: ' + e.message);
      } finally {
        sendBtn.disabled = false;
        sendInput.focus();
      }
    }

    sendBtn.addEventListener('click', () => sendMessage(sendInput.value));
    sendInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(sendInput.value); }
    });

    // Copy magic link — same URL the user is on (permissive token included)
    const copyLinkBtn = document.getElementById('copy-link-btn');
    copyLinkBtn.addEventListener('click', () => {
      const link = window.location.href;
      navigator.clipboard.writeText(link).then(() => {
        copyLinkBtn.textContent = '✓ Copied!';
        setTimeout(() => { copyLinkBtn.textContent = '⬡ Invite'; }, 2000);
      });
    });

    // ── Boot ─────────────────────────────────────────────────────────────────

    async function bootJoin() {
      try {
        await join();
      } catch (e) {
        // Stored credential was rejected — mcpPost already cleared it.
        // Reset session state and retry once with a fresh account.
        if (e && e.message === 'auth_expired') {
          account = null;
          mcpSessionId = null;
          streamName = null;
          await join();
          return;
        }
        throw e;
      }
    }

    bootJoin().catch(e => {
      setStatus('error', 'error');
      addEvent('system', 'Failed to join: ' + e.message);
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html;charset=UTF-8" },
  });
}
