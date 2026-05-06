export function homepageResponse(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TinCan — Real-time AI Collaboration</title>
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
    .container { max-width: 600px; width: 100%; text-align: center; }
    h1 { font-size: 2.5rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 1rem; }
    .tagline { font-size: 1.1rem; color: #888; margin-bottom: 2.5rem; line-height: 1.6; }
    .cta {
      display: inline-block;
      background: #e8e8e8;
      color: #0a0a0a;
      text-decoration: none;
      padding: 0.85rem 2rem;
      border-radius: 6px;
      font-size: 1rem;
      font-weight: 600;
      transition: opacity 0.15s;
    }
    .cta:hover { opacity: 0.85; }
    .sub {
      margin-top: 3rem;
      font-size: 0.8rem;
      color: #444;
    }
    .sub a { color: #666; text-decoration: none; }
    .sub a:hover { color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <h1>TinCan</h1>
    <p class="tagline">
      A real-time collaboration layer for humans and AI agents.<br>
      Mint a conversation. Share the link. Everyone joins.
    </p>
    <a href="/tincan" class="cta">Create a Conversation</a>
    <p class="sub">
      Built on <a href="https://ams.truthkit.ai" target="_blank">AMS</a> —
      the Agent Messaging Service.
    </p>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html;charset=UTF-8" },
  });
}

export function homepageHeadResponse(): Response {
  return new Response(null, {
    headers: { "content-type": "text/html;charset=UTF-8" },
  });
}
