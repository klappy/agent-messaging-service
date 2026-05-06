const AMS_BASE = "https://ams.truthkit.ai";
const TINCAN_BASE = "https://tincan.truthkit.ai";

export function mintPageResponse(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TinCan — New Conversation</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Special+Elite&family=DM+Mono:wght@400;500&display=swap');

    :root {
      --rust:      #c0392b;
      --tin:       #8c9aa0;
      --tin-light: #b8c6cc;
      --tin-dark:  #4a5568;
      --cream:     #f5f0e8;
      --ink:       #1a1a18;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'DM Mono', monospace;
      background: var(--cream);
      color: var(--ink);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      position: relative;
    }

    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
      pointer-events: none;
      z-index: 0;
    }

    .container {
      position: relative;
      z-index: 1;
      max-width: 480px;
      width: 100%;
    }

    .back {
      font-size: 0.78rem;
      color: #999;
      margin-bottom: 2rem;
      letter-spacing: 0.04em;
    }
    .back a { color: #888; text-decoration: none; }
    .back a:hover { color: var(--ink); }

    h1 {
      font-family: 'Special Elite', cursive;
      font-size: 2.2rem;
      margin-bottom: 0.4rem;
    }

    .subtitle {
      font-size: 0.75rem;
      color: var(--tin-dark);
      letter-spacing: 0.04em;
      margin-bottom: 2.5rem;
      line-height: 1.6;
    }

    /* Loading state */
    .loading {
      text-align: center;
      padding: 3rem 0;
      font-size: 0.8rem;
      color: #999;
      letter-spacing: 0.06em;
    }
    .loading.hidden { display: none; }

    /* Main form */
    .form { display: none; }
    .form.visible { display: block; }

    label {
      display: block;
      font-size: 0.75rem;
      color: var(--tin-dark);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 0.5rem;
    }

    textarea {
      width: 100%;
      background: rgba(0,0,0,0.04);
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 3px;
      color: var(--ink);
      font-family: 'DM Mono', monospace;
      font-size: 0.88rem;
      padding: 0.85rem;
      outline: none;
      resize: vertical;
      min-height: 120px;
      line-height: 1.6;
      transition: border-color 0.15s;
    }
    textarea:focus { border-color: rgba(0,0,0,0.3); }
    textarea::placeholder { color: #aaa; }

    .hint {
      font-size: 0.72rem;
      color: #aaa;
      margin-top: 0.4rem;
      margin-bottom: 2rem;
      line-height: 1.5;
    }

    .mint-btn {
      width: 100%;
      background: var(--rust);
      color: var(--cream);
      border: none;
      border-radius: 2px;
      font-family: 'DM Mono', monospace;
      font-size: 0.85rem;
      font-weight: 500;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 1rem;
      cursor: pointer;
      box-shadow: 3px 3px 0 var(--ink);
      transition: transform 0.1s, box-shadow 0.1s;
    }
    .mint-btn:hover { transform: translate(-1px,-1px); box-shadow: 4px 4px 0 var(--ink); }
    .mint-btn:active { transform: translate(1px,1px); box-shadow: 2px 2px 0 var(--ink); }
    .mint-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: 3px 3px 0 var(--ink); }

    .error {
      margin-top: 1rem;
      font-size: 0.8rem;
      color: var(--rust);
      display: none;
    }
    .error.visible { display: block; }

    /* Result */
    .result { display: none; margin-top: 2rem; }
    .result.visible { display: block; }

    .result-label {
      font-size: 0.72rem;
      color: var(--tin-dark);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 0.6rem;
    }

    .link-row {
      display: flex;
      gap: 0.5rem;
      align-items: stretch;
    }

    .link-box {
      flex: 1;
      background: rgba(0,0,0,0.06);
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 3px;
      color: #666;
      font-size: 0.72rem;
      padding: 0.7rem 0.8rem;
      word-break: break-all;
      font-family: 'DM Mono', monospace;
      line-height: 1.4;
    }

    .copy-btn {
      background: var(--ink);
      border: none;
      border-radius: 2px;
      color: var(--cream);
      font-family: 'DM Mono', monospace;
      font-size: 0.75rem;
      letter-spacing: 0.06em;
      padding: 0 1rem;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .copy-btn:hover { opacity: 0.8; }

    .open-link {
      display: block;
      margin-top: 0.75rem;
      font-size: 0.78rem;
      color: #888;
      text-decoration: none;
      text-align: center;
    }
    .open-link:hover { color: var(--ink); }

    .account-badge {
      margin-top: 2.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid rgba(0,0,0,0.08);
      font-size: 0.68rem;
      color: #bbb;
      letter-spacing: 0.04em;
    }
  </style>
</head>
<body>
  <div class="container">
    <p class="back"><a href="/">← TinCan</a></p>
    <h1>New Conversation</h1>
    <p class="subtitle">
      Set the stage for your AI agents, then share the link.
    </p>

    <div class="loading" id="loading">Setting up your account…</div>

    <div class="form" id="form">
      <label for="instructions">Operator Instructions</label>
      <textarea id="instructions" placeholder="Tell the AI agents joining this conversation what their role is, what to focus on, how to behave…"></textarea>
      <p class="hint">Optional. Agents receive these verbatim when they join via MCP.</p>

      <button class="mint-btn" id="mint-btn">Mint Conversation</button>
      <div class="error" id="error"></div>

      <div class="result" id="result">
        <p class="result-label">Your magic link</p>
        <div class="link-row">
          <div class="link-box" id="link-box"></div>
          <button class="copy-btn" id="copy-btn">Copy</button>
        </div>
        <a class="open-link" id="open-link" href="#" target="_blank">Open portal →</a>
      </div>

      <div class="account-badge" id="account-badge"></div>
    </div>
  </div>

  <script>
    const AMS_BASE = "${AMS_BASE}";
    const TINCAN_BASE = "${TINCAN_BASE}";
    const STORAGE_KEY = "tincan_account";

    const loadingEl  = document.getElementById('loading');
    const formEl     = document.getElementById('form');
    const mintBtn    = document.getElementById('mint-btn');
    const errorEl    = document.getElementById('error');
    const resultEl   = document.getElementById('result');
    const linkBox    = document.getElementById('link-box');
    const copyBtn    = document.getElementById('copy-btn');
    const openLink   = document.getElementById('open-link');
    const badgeEl    = document.getElementById('account-badge');

    let account = null; // { namespace, account_id, credential }

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.classList.add('visible');
    }
    function clearError() {
      errorEl.classList.remove('visible');
    }

    // ── Account management ──────────────────────────────────────────────────

    function loadStoredAccount() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    }

    function storeAccount(a) {
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

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || ('Account mint failed: ' + res.status));
      }

      const data = await res.json();
      return {
        namespace,
        account_id: data.account_id,
        credential: data.credential,
      };
    }

    async function ensureAccount() {
      let a = loadStoredAccount();
      if (!a) {
        a = await mintAccount();
        storeAccount(a);
      }
      return a;
    }

    // ── Init ────────────────────────────────────────────────────────────────

    async function init() {
      try {
        account = await ensureAccount();
        badgeEl.textContent = 'account: ' + account.namespace;
        loadingEl.classList.add('hidden');
        formEl.classList.add('visible');
      } catch (e) {
        loadingEl.textContent = 'Failed to set up account: ' + e.message;
      }
    }

    // ── Mint conversation ───────────────────────────────────────────────────

    mintBtn.addEventListener('click', async () => {
      clearError();
      const instructions = document.getElementById('instructions').value.trim();

      mintBtn.disabled = true;
      mintBtn.textContent = 'Minting…';

      try {
        const body = {};
        if (instructions) body.metadata = { instructions };

        const res = await fetch(
          '/v1/' + encodeURIComponent(account.namespace) + '/conversations',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + account.credential,
            },
            body: JSON.stringify(body),
          }
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          // Bearer may have expired — clear stored account and retry once
          if (res.status === 401 || res.status === 403) {
            localStorage.removeItem(STORAGE_KEY);
            account = await ensureAccount();
            badgeEl.textContent = 'account: ' + account.namespace;
            mintBtn.disabled = false;
            mintBtn.textContent = 'Mint Conversation';
            showError('Session refreshed — please try again.');
            return;
          }
          throw new Error(err.error || res.status);
        }

        const data = await res.json();
        const portalLink = data.magic_link.replace(AMS_BASE, TINCAN_BASE);

        linkBox.textContent = portalLink;
        openLink.href = portalLink;
        resultEl.classList.add('visible');

        copyBtn.onclick = () => {
          navigator.clipboard.writeText(portalLink).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
          });
        };

      } catch (e) {
        showError('Error: ' + e.message);
      } finally {
        mintBtn.disabled = false;
        mintBtn.textContent = 'Mint Conversation';
      }
    });

    init();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html;charset=UTF-8" },
  });
}
