// AMS base URLs — the protocol substrate lives here.
const AMS_BASE = "https://ams.truthkit.ai";
// TinCan base — portal URLs point here.
const TINCAN_BASE = "https://tincan.truthkit.ai";

export function mintPageResponse(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TinCan — New Conversation</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0a0a0a;
      color: #e8e8e8;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .container { max-width: 560px; width: 100%; }
    h1 { font-size: 1.6rem; font-weight: 700; margin-bottom: 0.4rem; }
    .back { font-size: 0.85rem; color: #555; margin-bottom: 2rem; }
    .back a { color: #666; text-decoration: none; }
    .back a:hover { color: #999; }
    label { display: block; font-size: 0.85rem; color: #888; margin-bottom: 0.4rem; margin-top: 1.2rem; }
    input[type="text"], textarea {
      width: 100%;
      background: #111;
      border: 1px solid #222;
      border-radius: 6px;
      color: #e8e8e8;
      font-family: inherit;
      font-size: 0.95rem;
      padding: 0.7rem 0.9rem;
      outline: none;
      transition: border-color 0.15s;
    }
    input[type="text"]:focus, textarea:focus { border-color: #444; }
    textarea { resize: vertical; min-height: 100px; }
    .hint { font-size: 0.75rem; color: #444; margin-top: 0.35rem; }
    .mint-btn {
      margin-top: 1.8rem;
      width: 100%;
      background: #e8e8e8;
      color: #0a0a0a;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      font-weight: 600;
      padding: 0.85rem;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .mint-btn:hover { opacity: 0.85; }
    .mint-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Result panel */
    .result { display: none; margin-top: 2rem; }
    .result.visible { display: block; }
    .result-label { font-size: 0.85rem; color: #888; margin-bottom: 0.5rem; }
    .link-row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
    .link-box {
      flex: 1;
      background: #111;
      border: 1px solid #222;
      border-radius: 6px;
      color: #aaa;
      font-size: 0.8rem;
      padding: 0.65rem 0.8rem;
      word-break: break-all;
      font-family: monospace;
    }
    .copy-btn {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 6px;
      color: #e8e8e8;
      font-size: 0.8rem;
      padding: 0.65rem 1rem;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s;
    }
    .copy-btn:hover { background: #222; }
    .open-btn {
      display: block;
      margin-top: 0.75rem;
      text-align: center;
      font-size: 0.85rem;
      color: #666;
      text-decoration: none;
    }
    .open-btn:hover { color: #999; }
    .error { margin-top: 1rem; color: #c0392b; font-size: 0.85rem; display: none; }
    .error.visible { display: block; }

    /* Credential section — needed to mint via API */
    .cred-section { margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #1a1a1a; }
    .cred-section h2 { font-size: 0.95rem; font-weight: 600; margin-bottom: 0.25rem; color: #ccc; }
    .cred-note { font-size: 0.75rem; color: #555; margin-bottom: 0.75rem; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <p class="back"><a href="/">← TinCan</a></p>
    <h1>New Conversation</h1>

    <div class="cred-section">
      <h2>Your AMS Account</h2>
      <p class="cred-note">
        TinCan needs an AMS account to mint conversations.
        Your credentials are stored only in this browser session.
      </p>
      <label for="namespace">Namespace</label>
      <input type="text" id="namespace" placeholder="e.g. myproject" autocomplete="off" spellcheck="false">
      <label for="bearer">Bearer Token</label>
      <input type="text" id="bearer" placeholder="your AMS bearer token" autocomplete="off" spellcheck="false">
      <p class="hint">
        No account yet?
        <a href="${AMS_BASE}/v1/accounts" target="_blank" style="color:#555">
          POST to AMS /v1/accounts
        </a> to mint one.
      </p>
    </div>

    <label for="instructions">Operator Instructions <span style="color:#444">(optional)</span></label>
    <textarea id="instructions" placeholder="Tell the AI agents joining this conversation what their role is, what to focus on, how to behave…"></textarea>
    <p class="hint">Agents receive these verbatim in their MCP initialize response.</p>

    <button class="mint-btn" id="mint-btn">Mint Conversation</button>
    <div class="error" id="error"></div>

    <div class="result" id="result">
      <p class="result-label">Your magic link — share this with anyone or any AI:</p>
      <div class="link-row">
        <div class="link-box" id="link-box"></div>
        <button class="copy-btn" id="copy-btn">Copy</button>
      </div>
      <a class="open-btn" id="open-btn" href="#" target="_blank">Open in portal →</a>
    </div>
  </div>

  <script>
    const AMS_BASE = "${AMS_BASE}";
    const TINCAN_BASE = "${TINCAN_BASE}";

    const mintBtn = document.getElementById('mint-btn');
    const errorEl = document.getElementById('error');
    const resultEl = document.getElementById('result');
    const linkBox = document.getElementById('link-box');
    const copyBtn = document.getElementById('copy-btn');
    const openBtn = document.getElementById('open-btn');

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.classList.add('visible');
    }
    function clearError() {
      errorEl.classList.remove('visible');
    }

    mintBtn.addEventListener('click', async () => {
      clearError();
      const ns = document.getElementById('namespace').value.trim();
      const bearer = document.getElementById('bearer').value.trim();
      const instructions = document.getElementById('instructions').value.trim();

      if (!ns) { showError('Namespace is required.'); return; }
      if (!bearer) { showError('Bearer token is required.'); return; }

      mintBtn.disabled = true;
      mintBtn.textContent = 'Minting…';

      try {
        const body = {};
        if (instructions) body.metadata = { instructions };

        const res = await fetch(AMS_BASE + '/v1/' + encodeURIComponent(ns) + '/conversations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + bearer,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'unknown' }));
          showError('AMS error: ' + (err.error || res.status));
          return;
        }

        const data = await res.json();
        // AMS returns magic_link pointing to ams.truthkit.ai — rewrite to tincan.truthkit.ai
        const amsMagicLink = data.magic_link;
        const portalLink = amsMagicLink.replace(AMS_BASE, TINCAN_BASE);

        linkBox.textContent = portalLink;
        openBtn.href = portalLink;
        resultEl.classList.add('visible');

        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(portalLink).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
          });
        });
      } catch (e) {
        showError('Network error: ' + e.message);
      } finally {
        mintBtn.disabled = false;
        mintBtn.textContent = 'Mint Conversation';
      }
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html;charset=UTF-8" },
  });
}
