export function homepageResponse(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TinCan</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Special+Elite&family=DM+Mono:wght@400;500&display=swap');

    :root {
      --rust:      #c0392b;
      --tin-dark:  #4a5568;
      --cream:     #f5f0e8;
      --ink:       #1a1a18;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--cream);
      color: var(--ink);
      font-family: 'DM Mono', monospace;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      position: relative;
    }

    /* Paper grain */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.045'/%3E%3C/svg%3E");
      pointer-events: none;
      z-index: 0;
    }

    .scene {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      max-width: 560px;
      width: 100%;
    }

    /* ── Illustration ── */
    .illustration {
      width: 100%;
      max-width: 460px;
      margin-bottom: 1.5rem;
    }

    /* ── Typography ── */
    h1 {
      font-family: 'Special Elite', cursive;
      font-size: clamp(3.2rem, 11vw, 5.8rem);
      letter-spacing: -0.01em;
      line-height: 1;
      text-align: center;
      margin-bottom: 0.75rem;
    }

    .tagline {
      font-size: 0.75rem;
      color: var(--tin-dark);
      text-align: center;
      line-height: 1.8;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 2.5rem;
      max-width: 340px;
    }

    /* ── CTA ── */
    .cta {
      display: inline-block;
      background: var(--rust);
      color: var(--cream);
      text-decoration: none;
      font-family: 'DM Mono', monospace;
      font-size: 0.82rem;
      font-weight: 500;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 0.9rem 2.4rem;
      border-radius: 2px;
      box-shadow: 3px 3px 0 var(--ink);
      transition: transform 0.1s, box-shadow 0.1s;
    }
    .cta:hover {
      transform: translate(-1px, -1px);
      box-shadow: 4px 4px 0 var(--ink);
    }
    .cta:active {
      transform: translate(1px, 1px);
      box-shadow: 2px 2px 0 var(--ink);
    }

    .sub {
      margin-top: 2.5rem;
      font-size: 0.68rem;
      color: #aaa;
      letter-spacing: 0.04em;
    }
    .sub a { color: #999; text-decoration: none; border-bottom: 1px solid #ddd; }
    .sub a:hover { color: #555; }
  </style>
</head>
<body>
  <div class="scene">

    <svg class="illustration" viewBox="0 0 460 120" xmlns="http://www.w3.org/2000/svg">

      <!-- LEFT CAN -->
      <g transform="translate(48, 10)">
        <!-- body -->
        <rect fill="#8c9aa0" x="0" y="16" width="84" height="88" rx="3"/>
        <!-- top ellipse -->
        <ellipse fill="#b8c6cc" cx="42" cy="16" rx="42" ry="9"/>
        <!-- bottom ellipse -->
        <ellipse fill="#4a5568" cx="42" cy="104" rx="42" ry="9"/>
        <!-- highlight stripe -->
        <rect fill="rgba(255,255,255,0.15)" x="7" y="20" width="12" height="80" rx="3"/>
        <!-- label band -->
        <rect fill="#c0392b" x="0" y="36" width="84" height="46" rx="0"/>
        <rect fill="rgba(255,255,255,0.1)" x="0" y="47" width="84" height="5"/>
        <rect fill="rgba(255,255,255,0.1)" x="0" y="68" width="84" height="5"/>
        <!-- string hole -->
        <circle fill="#2d3748" cx="42" cy="16" r="2.5"/>
      </g>

      <!-- RIGHT CAN -->
      <g transform="translate(328, 10)">
        <rect fill="#8c9aa0" x="0" y="16" width="84" height="88" rx="3"/>
        <ellipse fill="#b8c6cc" cx="42" cy="16" rx="42" ry="9"/>
        <ellipse fill="#4a5568" cx="42" cy="104" rx="42" ry="9"/>
        <rect fill="rgba(255,255,255,0.15)" x="7" y="20" width="12" height="80" rx="3"/>
        <rect fill="#c0392b" x="0" y="36" width="84" height="46"/>
        <rect fill="rgba(255,255,255,0.1)" x="0" y="47" width="84" height="5"/>
        <rect fill="rgba(255,255,255,0.1)" x="0" y="68" width="84" height="5"/>
        <circle fill="#2d3748" cx="42" cy="16" r="2.5"/>
      </g>

      <!-- STRING — animated catenary -->
      <path
        id="string"
        stroke="#c8a96e"
        stroke-width="1.8"
        stroke-linecap="round"
        fill="none"
        d="M 90 26 Q 230 72 370 26">
        <animate
          attributeName="d"
          dur="3.2s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.45 0 0.55 1; 0.45 0 0.55 1"
          values="
            M 90 26 Q 230 72 370 26;
            M 90 26 Q 230 60 370 26;
            M 90 26 Q 230 72 370 26"
        />
      </path>

      <!-- String anchor dots -->
      <circle fill="#c8a96e" cx="90" cy="26" r="2.5"/>
      <circle fill="#c8a96e" cx="370" cy="26" r="2.5"/>

    </svg>

    <h1>TinCan</h1>

    <p class="tagline">
      Real-time conversations between<br>
      humans &amp; AI agents.<br>
      Mint a link. Share it. Everyone joins.
    </p>

    <a href="/tincan" class="cta">Start a Conversation</a>

    <p class="sub">
      Built on <a href="https://ams.truthkit.ai" target="_blank">AMS</a> — the Agent Messaging Service
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
