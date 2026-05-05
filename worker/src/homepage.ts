// Homepage for AMS (Agent Messaging Service) — served from GET / on both ams.klappy.dev and ams.truthkit.ai.
//
// This is an "epic landing page" that doubles as a live demo of the protocol.
// Live data sources, post-Day-2:
//   1. /healthz polling on both hosts (same-origin for whichever host you hit)
//   2. POST /v1/accounts and POST /v1/{ns}/conversations against the actual Worker
//      (same-origin — no CORS gymnastics needed)
//   3. WebSocket /connect is SHIPPED and live (Day 2 — see Section C of
//      journal/evidence-day2-wscat.txt for the byte-for-byte transcript).
//      The in-page theatre below remains a faithful in-browser SIM for one
//      specific reason: the wire requires `Authorization: Bearer ams_sk_...`
//      on the WebSocket upgrade, and browsers cannot set arbitrary headers
//      on `new WebSocket(url)`. Two terminals + wscat exercise the real wire;
//      the homepage hands you the exact command and the bearer it just minted.
//   4. Live oddkit telemetry pulled directly from oddkit.klappy.dev/mcp
//      (CORS-enabled public MCP endpoint, JSON-RPC over HTTP)
//
// No build step, no framework, no external CSS/JS. Just one Google Fonts request
// for IBM Plex (Serif + Sans + Mono — the corporate type system designed for
// IBM, the right vibe for "TCP/IP for agents"). Everything else is inline.

const HOMEPAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AMS — Agent Messaging Service · Token Stream Routing</title>
<meta name="description" content="AMS = Agent Messaging Service. Real-time pub-sub for agents. N peers, any subscribers — humans, observers, services — all equal at the wire. The TCP/IP play for agent communication.">
<meta name="color-scheme" content="dark">
<meta property="og:title" content="AMS — Agent Messaging Service · Token Stream Routing">
<meta property="og:description" content="AMS = Agent Messaging Service. N peers, any subscribers — humans, observers, services — all equal at the wire. The TCP/IP play for agent communication. We were the wire. AMS is the rewiring.">
<meta property="og:type" content="website">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Serif:ital,wght@0,300;0,400;0,500;0,600;1,400&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@300;400;500;600&display=swap">

<style>
  /* ─────────────────────────────────────────────────────────────────────
     AMS Homepage — design notes
     Aesthetic: 1970s technical journal meets signal-station console.
     IBM Plex throughout (the system designed for Bell Labs–era IBM).
     Two stream colors that NEVER mix on screen: amber (Stream A, transmit)
     and teal (Stream B, receive). Background is warm off-black, not pure
     black — pure black on web feels like a void; warm off-black feels like
     a darkened studio.
     ───────────────────────────────────────────────────────────────────── */

  :root {
    --bg:        #0d0c0a;
    --bg-soft:   #16140f;
    --bg-panel:  #1a1813;
    --fg:        #e8e2d4;
    --fg-dim:    #a39d8b;
    --fg-faint:  #5a5547;
    --hairline:  #2c2920;
    --hairline-bright: #3d3929;

    /* Stream A — transmit / mint side */
    --amber:     #ffb547;
    --amber-dim: #b8803a;
    --amber-glow: rgba(255, 181, 71, 0.18);

    /* Stream B — receive / join side */
    --teal:      #5fd4d4;
    --teal-dim:  #4a9b9b;
    --teal-glow: rgba(95, 212, 212, 0.18);

    /* Status colors */
    --ok:        #7fc97f;
    --err:       #e26d6d;
    --pending:   #d4b35f;

    --serif: 'IBM Plex Serif', Georgia, serif;
    --sans:  'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    --mono:  'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace;

    --max: 1280px;
    --gut: clamp(20px, 4vw, 56px);
  }

  *, *::before, *::after { box-sizing: border-box; }
  html { background: var(--bg); }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--sans);
    font-weight: 400;
    line-height: 1.55;
    font-size: 16px;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    overflow-x: hidden;
  }

  ::selection { background: var(--amber); color: var(--bg); }

  a { color: var(--fg); text-decoration: underline; text-decoration-color: var(--hairline-bright); text-underline-offset: 3px; transition: color .18s, text-decoration-color .18s; }
  a:hover { color: var(--amber); text-decoration-color: var(--amber); }

  /* ─── Subtle full-page grain ───────────────────────────────────────── */
  body::before {
    content: '';
    position: fixed; inset: 0;
    pointer-events: none;
    opacity: 0.035;
    background-image:
      radial-gradient(rgba(255,255,255,.6) 1px, transparent 1px),
      radial-gradient(rgba(255,255,255,.4) 1px, transparent 1px);
    background-size: 3px 3px, 7px 7px;
    background-position: 0 0, 1px 2px;
    z-index: 1000;
    mix-blend-mode: overlay;
  }

  /* ─── Layout primitives ────────────────────────────────────────────── */
  .container { max-width: var(--max); margin: 0 auto; padding: 0 var(--gut); }
  .rule { height: 1px; background: var(--hairline); border: 0; margin: 0; }
  .rule-bright { height: 1px; background: var(--hairline-bright); border: 0; margin: 0; }

  /* ─── Top bar ──────────────────────────────────────────────────────── */
  .topbar {
    position: sticky; top: 0; z-index: 100;
    background: rgba(13, 12, 10, 0.86);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--hairline);
  }
  .topbar-inner {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px var(--gut);
    max-width: var(--max); margin: 0 auto;
    gap: 24px;
  }
  .brand {
    font-family: var(--mono); font-weight: 500; font-size: 14px;
    letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--fg);
  }
  .brand .dot {
    display: inline-block; width: 8px; height: 8px;
    background: var(--amber); margin-right: 10px;
    border-radius: 50%;
    box-shadow: 0 0 0 0 var(--amber-glow);
    animation: brandPulse 2.4s ease-out infinite;
  }
  /* Brand collapse: AMS + expansion (operator requirement) survive on every
     viewport; tagline collapses on phones first, expansion only on tiny screens. */
  @media (max-width: 520px) {
    .brand-sep, .brand-tag { display: none; }
  }
  @media (max-width: 360px) {
    .brand-expand { display: none; }
  }
  @keyframes brandPulse {
    0%   { box-shadow: 0 0 0 0 rgba(255,181,71,.5); }
    70%  { box-shadow: 0 0 0 12px rgba(255,181,71,0); }
    100% { box-shadow: 0 0 0 0 rgba(255,181,71,0); }
  }
  .topnav { display: flex; gap: 28px; font-family: var(--mono); font-size: 12.5px; letter-spacing: 0.04em; text-transform: uppercase; }
  .topnav a { text-decoration: none; color: var(--fg-dim); }
  .topnav a:hover { color: var(--fg); }
  @media (max-width: 720px) { .topnav { display: none; } }

  /* ─── Hero ─────────────────────────────────────────────────────────── */
  .hero {
    position: relative;
    padding: 64px var(--gut) 48px;
    border-bottom: 1px solid var(--hairline);
    overflow: hidden;
  }
  .hero-grid {
    max-width: var(--max); margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.4fr);
    gap: clamp(32px, 5vw, 72px);
    align-items: center;
  }
  @media (max-width: 920px) { .hero-grid { grid-template-columns: minmax(0, 1fr); gap: 36px; } }

  .hero-eyebrow {
    font-family: var(--mono); font-size: 12px; letter-spacing: 0.18em;
    text-transform: uppercase; color: var(--amber); margin: 0 0 24px;
  }
  .hero-eyebrow .sep { color: var(--fg-faint); margin: 0 10px; }

  .hero h1 {
    font-family: var(--serif);
    font-weight: 400;
    font-style: italic;
    font-size: clamp(40px, 6.4vw, 88px);
    line-height: 0.96;
    letter-spacing: -0.02em;
    margin: 0 0 28px;
    color: var(--fg);
  }
  .hero h1 .accent { font-style: normal; color: var(--amber); }
  .hero h1 .small { display: block; font-size: 0.55em; font-style: normal; color: var(--fg-dim); margin-top: 18px; letter-spacing: -0.01em; line-height: 1.15; }

  .hero p.lede {
    font-family: var(--serif); font-weight: 300;
    font-size: clamp(17px, 1.6vw, 21px);
    line-height: 1.55;
    color: var(--fg);
    margin: 0 0 34px;
    max-width: 36ch;
  }

  .cta-row { display: flex; gap: 14px; flex-wrap: wrap; }
  .btn {
    display: inline-flex; align-items: center; gap: 10px;
    padding: 13px 22px;
    font-family: var(--mono); font-size: 13px; font-weight: 500;
    letter-spacing: 0.06em; text-transform: uppercase;
    border: 1px solid var(--hairline-bright); border-radius: 0;
    background: transparent; color: var(--fg);
    cursor: pointer; text-decoration: none;
    transition: all .18s ease;
  }
  .btn:hover { border-color: var(--amber); color: var(--amber); background: var(--amber-glow); }
  .btn-primary { background: var(--amber); color: var(--bg); border-color: var(--amber); }
  .btn-primary:hover { background: transparent; color: var(--amber); }
  .btn .arrow { font-family: var(--serif); font-size: 16px; }

  /* ─── Hero canvas — token river ────────────────────────────────────── */
  .hero-stage {
    position: relative;
    aspect-ratio: 5 / 4;
    border: 1px solid var(--hairline);
    background:
      linear-gradient(180deg, rgba(255,181,71,0.04) 0%, transparent 50%, rgba(95,212,212,0.04) 100%),
      var(--bg-panel);
    overflow: hidden;
  }
  .hero-stage::before {
    content: '';
    position: absolute; inset: 0;
    background:
      linear-gradient(0deg, transparent 0, transparent 49%, rgba(232,226,212,.02) 49%, rgba(232,226,212,.02) 51%, transparent 51%) 0 0 / 100% 24px,
      linear-gradient(90deg, transparent 0, transparent 49%, rgba(232,226,212,.02) 49%, rgba(232,226,212,.02) 51%, transparent 51%) 0 0 / 24px 100%;
    pointer-events: none;
  }
  .stage-label {
    position: absolute;
    font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.2em;
    text-transform: uppercase;
    padding: 4px 10px;
    background: var(--bg);
    border: 1px solid var(--hairline);
    z-index: 3;
  }
  .stage-label.tl { top: 14px; left: 14px; color: var(--amber); border-color: var(--amber-dim); }
  .stage-label.bl { bottom: 14px; left: 14px; color: var(--teal); border-color: var(--teal-dim); }
  .stage-label.tr {
    top: 14px; right: 14px;
    color: var(--fg-dim);
    font-feature-settings: 'tnum';
  }
  .stage-label.tr .live-dot {
    display: inline-block; width: 6px; height: 6px; border-radius: 50%;
    background: var(--amber); margin-right: 6px;
    animation: brandPulse 1.6s ease-out infinite;
  }
  #hero-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; z-index: 1; }

  /* ─── Section header ───────────────────────────────────────────────── */
  section { padding: 96px 0 64px; border-bottom: 1px solid var(--hairline); }
  section:last-of-type { border-bottom: 0; }
  .section-head { max-width: var(--max); margin: 0 auto 56px; padding: 0 var(--gut); }
  .section-eyebrow {
    font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.22em;
    text-transform: uppercase; color: var(--fg-dim); margin: 0 0 18px;
    display: flex; align-items: center; gap: 14px;
  }
  .section-eyebrow::before {
    content: ''; display: inline-block; width: 32px; height: 1px; background: var(--amber);
  }
  .section-title {
    font-family: var(--serif); font-weight: 400;
    font-size: clamp(32px, 4vw, 52px); line-height: 1.05; letter-spacing: -0.018em;
    margin: 0 0 20px; max-width: 22ch;
  }
  .section-title em { font-style: italic; color: var(--amber); }
  .section-sub {
    font-family: var(--serif); font-weight: 300;
    font-size: clamp(16px, 1.4vw, 19px);
    line-height: 1.6;
    color: var(--fg-dim);
    max-width: 60ch;
    margin: 0;
  }

  /* ─── Live wire status bar ─────────────────────────────────────────── */
  .wire {
    background: var(--bg-soft);
    border-top: 1px solid var(--hairline);
    border-bottom: 1px solid var(--hairline);
    padding: 18px 0;
  }
  .wire-inner {
    max-width: var(--max); margin: 0 auto; padding: 0 var(--gut);
    display: flex; flex-wrap: wrap; align-items: center; gap: 22px 32px;
    font-family: var(--mono); font-size: 12.5px;
  }
  .wire-label {
    color: var(--fg-faint); letter-spacing: 0.12em; text-transform: uppercase;
  }
  .pill {
    display: inline-flex; align-items: center; gap: 10px;
    padding: 7px 14px;
    border: 1px solid var(--hairline-bright);
    background: var(--bg);
    color: var(--fg-dim);
    font-feature-settings: 'tnum';
    transition: all .2s;
  }
  .pill .lamp {
    display: inline-block; width: 9px; height: 9px; border-radius: 50%;
    background: var(--fg-faint);
    box-shadow: 0 0 0 0 transparent;
  }
  .pill[data-state="ok"]      { color: var(--fg); border-color: var(--ok); }
  .pill[data-state="ok"]      .lamp { background: var(--ok); box-shadow: 0 0 12px rgba(127,201,127,.6); }
  .pill[data-state="err"]     { color: var(--err); border-color: rgba(226,109,109,.5); }
  .pill[data-state="err"]     .lamp { background: var(--err); }
  .pill[data-state="pending"] .lamp { background: var(--pending); animation: lampBlink 1s linear infinite; }
  @keyframes lampBlink { 50% { opacity: 0.25; } }
  .pill .host { font-weight: 500; }
  .pill .meta { color: var(--fg-faint); margin-left: 4px; }

  .wire-version {
    margin-left: auto; color: var(--fg-faint);
  }
  @media (max-width: 720px) { .wire-version { margin-left: 0; } }

  /* ─── TinCan §03 — live MCP demo ────────────────────────────────────
     Browser as MCP runtime per ams://canon/decisions/D0012. Same /mcp
     wrapper any agent uses. CSS reuses .theatre/.frame primitives plus
     a small set of TinCan-specific helpers. */
  .tincan {
    max-width: var(--max); margin: 0 auto; padding: 0 var(--gut);
  }
  .tincan-instructions {
    border: 1px solid var(--hairline); background: var(--bg-panel);
    margin-bottom: 12px; padding: 12px 18px 14px;
  }
  .tincan-instructions-label {
    display: block; font-family: var(--mono); font-size: 11.5px;
    letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg);
    margin-bottom: 8px;
  }
  .tincan-instructions-hint {
    text-transform: none; letter-spacing: 0; color: var(--fg-dim);
    font-size: 11px; font-weight: normal;
  }
  .tincan-instructions-hint code {
    font-family: var(--mono); font-size: 10.5px; color: var(--teal);
  }
  .tincan-instructions-hint a { color: var(--teal); }
  .tincan-instructions-input {
    width: 100%; box-sizing: border-box;
    background: var(--bg); border: 1px solid var(--hairline); outline: none;
    padding: 10px 12px;
    color: var(--fg); font-family: var(--mono); font-size: 12.5px; line-height: 1.5;
    resize: vertical;
  }
  .tincan-instructions-input::placeholder { color: var(--fg-faint); font-style: italic; }
  .tincan-instructions-input:focus { border-color: var(--teal); }
  .tincan-bar {
    display: grid; grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: stretch; gap: 0;
    border: 1px solid var(--hairline); background: var(--bg-panel);
    margin-bottom: 16px;
  }
  @media (max-width: 720px) {
    .tincan-bar { grid-template-columns: minmax(0, 1fr); }
    .tincan-bar > * + * { border-left: 0; border-top: 1px solid var(--hairline); }
  }
  .tincan-bar input.tincan-link {
    background: transparent; border: 0; outline: none;
    padding: 14px 18px;
    color: var(--fg); font-family: var(--mono); font-size: 12.5px;
    overflow: hidden; text-overflow: ellipsis;
  }
  .tincan-bar input.tincan-link::placeholder { color: var(--fg-faint); }
  .tincan-bar button.tincan-action {
    background: transparent; border: 0; border-left: 1px solid var(--hairline);
    color: var(--fg); font-family: var(--mono); font-size: 11.5px;
    letter-spacing: 0.1em; text-transform: uppercase;
    padding: 0 22px; cursor: pointer; transition: color .15s;
  }
  .tincan-bar button.tincan-action.mint:hover  { color: var(--amber); }
  .tincan-bar button.tincan-action.copy:hover  { color: var(--teal); }
  .tincan-console {
    border: 1px solid var(--hairline); background: var(--bg-soft);
    display: grid; grid-template-rows: auto 1fr auto;
    min-height: 320px;
  }
  .tincan-console-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 18px; border-bottom: 1px solid var(--hairline); background: var(--bg);
    font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--fg-dim);
  }
  .tincan-console-bar .who { color: var(--amber); }
  .tincan-console-bar .meta { color: var(--fg-faint); }
  .tincan-log {
    padding: 14px 18px; overflow-y: auto;
    font-family: var(--mono); font-size: 12.5px; line-height: 1.55;
    min-height: 200px; max-height: 360px;
    display: flex; flex-direction: column; gap: 10px;
    color: var(--fg);
  }
  .tincan-emit {
    border-top: 1px solid var(--hairline); background: var(--bg);
    display: flex; gap: 0;
  }
  .tincan-emit input {
    flex: 1; background: transparent; border: 0; outline: none;
    padding: 14px 18px;
    color: var(--fg); font-family: var(--mono); font-size: 13px;
  }
  .tincan-emit button {
    background: transparent; border: 0; border-left: 1px solid var(--hairline);
    color: var(--fg); font-family: var(--mono); font-size: 11.5px;
    letter-spacing: 0.1em; text-transform: uppercase;
    padding: 0 22px; cursor: pointer; transition: color .15s;
  }
  .tincan-emit button:hover { color: var(--amber); }
  .tincan-emit input:disabled, .tincan-emit button:disabled {
    opacity: 0.4; cursor: not-allowed;
  }
  .tincan-frame {
    border-left: 2px solid var(--hairline-bright);
    padding: 4px 0 4px 12px;
  }
  .tincan-frame .head {
    font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--fg-faint); margin-bottom: 3px;
  }
  .tincan-frame .body { white-space: pre-wrap; word-break: break-word; }
  .tincan-frame.token { border-left-color: var(--teal); }
  .tincan-frame.token .head { color: var(--teal-dim); }
  .tincan-frame.self  { border-left-color: var(--amber); }
  .tincan-frame.self  .head { color: var(--amber-dim); }
  .tincan-frame.join  { border-left-color: var(--ok); }
  .tincan-frame.join  .head { color: var(--ok); }
  .tincan-frame.left  { border-left-color: var(--err); }
  .tincan-frame.left  .head { color: var(--err); }
  .tincan-frame.sys   { color: var(--fg-dim); font-size: 11.5px; }

  /* ─── Raw AMS section — § B, same conversation as § A ──────────────── */
  .rawams {
    max-width: var(--max); margin: 0 auto; padding: 0 var(--gut);
  }
  .rawams-bar {
    display: flex; align-items: baseline; justify-content: space-between;
    flex-wrap: wrap; gap: 12px;
    border: 1px solid var(--hairline); background: var(--bg-panel);
    padding: 12px 18px; margin-bottom: 16px;
  }
  .rawams-bar-label { display: flex; flex-direction: column; gap: 2px; }
  .rawams-bar-eyebrow {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--fg-dim);
  }
  .rawams-bar-meta {
    font-family: var(--mono); font-size: 12px; color: var(--fg);
  }
  .rawams-bar-spec {
    font-family: var(--mono); font-size: 11px; color: var(--fg-dim);
  }
  .rawams-bar-spec a { color: var(--teal); }
  .rawams-console {
    border: 1px solid var(--hairline); background: var(--bg);
    padding: 16px 18px;
    min-height: 240px; max-height: 480px; overflow: auto;
  }
  .rawams-log { display: grid; gap: 8px; }
  .rawams-frame {
    font-family: var(--mono); font-size: 12px; line-height: 1.5;
    border-left: 2px solid var(--hairline-bright);
    padding: 4px 0 4px 12px;
  }
  .rawams-frame .head {
    font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--fg-faint); margin-bottom: 3px;
  }
  .rawams-frame .body { white-space: pre-wrap; word-break: break-word; color: var(--fg-dim); }
  .rawams-frame.token        { border-left-color: var(--teal); }
  .rawams-frame.token .head  { color: var(--teal-dim); }
  .rawams-frame.joined       { border-left-color: var(--ok); }
  .rawams-frame.joined .head { color: var(--ok); }
  .rawams-frame.stream-joined  { border-left-color: var(--ok); }
  .rawams-frame.stream-joined .head { color: var(--ok); }
  .rawams-frame.stream-left    { border-left-color: var(--err); }
  .rawams-frame.stream-left .head  { color: var(--err); }
  .rawams-frame.stream-metadata    { border-left-color: var(--amber); }
  .rawams-frame.stream-metadata .head { color: var(--amber-dim); }
  .rawams-frame.closed       { border-left-color: var(--err); }
  .rawams-frame.closed .head { color: var(--err); }
  .rawams-frame.sys          { color: var(--fg-dim); font-size: 11.5px; }
  .rawams-footer {
    margin-top: 14px; padding: 14px 18px;
    border: 1px solid var(--hairline); background: var(--bg-panel);
    font-size: 11.5px; line-height: 1.55; color: var(--fg-dim);
  }
  .rawams-footer-line a { color: var(--teal); }

  /* ─── Protocol section — verbatim ──────────────────────────────────── */
  .protocol {
    max-width: var(--max); margin: 0 auto; padding: 0 var(--gut);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 32px;
  }
  @media (max-width: 880px) { .protocol { grid-template-columns: minmax(0, 1fr); } }
  .endpoint {
    border: 1px solid var(--hairline);
    background: var(--bg-panel);
    padding: 24px;
  }
  .endpoint h4 {
    font-family: var(--mono); font-size: 13px; font-weight: 500;
    margin: 0 0 4px;
    letter-spacing: 0.04em;
  }
  .endpoint h4 .verb {
    display: inline-block; padding: 2px 8px;
    background: var(--amber); color: var(--bg);
    margin-right: 10px; letter-spacing: 0.1em;
  }
  .endpoint h4 .verb.get { background: var(--teal); }
  .endpoint h4 .verb.ws  { background: var(--fg-dim); }
  .endpoint .desc {
    font-family: var(--serif); font-weight: 300;
    color: var(--fg-dim); font-size: 14px; line-height: 1.5;
    margin: 8px 0 16px;
  }
  pre.code {
    margin: 0;
    background: var(--bg);
    border: 1px solid var(--hairline);
    padding: 14px 16px;
    font-family: var(--mono); font-size: 12px; line-height: 1.55;
    color: var(--fg);
    overflow-x: auto;
    white-space: pre;
  }
  pre.code .c { color: var(--fg-faint); font-style: italic; }
  pre.code .k { color: var(--amber); }
  pre.code .t { color: var(--teal); }
  pre.code .s { color: var(--fg); }
  pre.code .n { color: var(--fg-dim); }

  /* ─── Telemetry section ────────────────────────────────────────────── */
  .telem {
    max-width: var(--max); margin: 0 auto; padding: 0 var(--gut);
  }
  .telem-grid {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: 32px;
  }
  @media (max-width: 880px) { .telem-grid { grid-template-columns: minmax(0, 1fr); } }
  .telem-card {
    border: 1px solid var(--hairline);
    background: var(--bg-panel);
    padding: 24px;
  }
  .telem-card h4 {
    font-family: var(--mono); font-size: 11.5px; font-weight: 500;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--fg-dim);
    margin: 0 0 18px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px;
  }
  .telem-card h4 .right {
    color: var(--fg-faint); font-size: 10.5px; letter-spacing: 0.1em;
  }

  .bars { display: flex; flex-direction: column; gap: 10px; }
  .bar-row { display: grid; grid-template-columns: 160px 1fr 60px; align-items: center; gap: 14px; font-family: var(--mono); font-size: 12px; }
  @media (max-width: 720px) { .bar-row { grid-template-columns: 110px 1fr 48px; } }
  .bar-row .label { color: var(--fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar-row .track { height: 8px; background: var(--bg); border: 1px solid var(--hairline); position: relative; overflow: hidden; }
  .bar-row .fill { position: absolute; inset: 0; width: 0; background: linear-gradient(90deg, var(--amber-dim), var(--amber)); transition: width 1.4s cubic-bezier(.2,.7,.2,1); }
  .bar-row .num { color: var(--fg-dim); text-align: right; font-feature-settings: 'tnum'; }

  .stat-rows { display: flex; flex-direction: column; gap: 16px; }
  .stat-row {
    display: flex; flex-direction: column; gap: 4px;
    padding-bottom: 14px; border-bottom: 1px dashed var(--hairline);
  }
  .stat-row:last-child { border-bottom: 0; padding-bottom: 0; }
  .stat-num {
    font-family: var(--serif); font-weight: 400;
    font-size: 38px; line-height: 1; letter-spacing: -0.02em;
    color: var(--fg);
    font-feature-settings: 'tnum';
  }
  .stat-num em { font-style: italic; color: var(--amber); }
  .stat-label {
    font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--fg-faint);
  }

  .telem-foot {
    margin-top: 18px;
    font-family: var(--mono); font-size: 11px; color: var(--fg-faint);
    line-height: 1.5;
  }
  .telem-foot a { color: var(--fg-dim); }

  /* ─── Why tokens — pull-quote ──────────────────────────────────────── */
  .pull {
    max-width: var(--max); margin: 0 auto; padding: 0 var(--gut);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 32px;
  }
  blockquote.thesis {
    margin: 0;
    padding: 0;
    font-family: var(--serif); font-style: italic;
    font-weight: 300;
    font-size: clamp(22px, 2.7vw, 36px);
    line-height: 1.3;
    letter-spacing: -0.01em;
    color: var(--fg);
    max-width: 32ch;
  }
  blockquote.thesis::before { content: '“'; color: var(--amber); }
  blockquote.thesis::after  { content: '”'; color: var(--amber); }
  blockquote.thesis cite {
    display: block;
    font-family: var(--mono); font-style: normal;
    font-size: 11px; letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--fg-faint);
    margin-top: 22px;
  }

  .three-points {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 28px;
    margin-top: 40px;
  }
  @media (max-width: 880px) { .three-points { grid-template-columns: minmax(0, 1fr); } }
  .point { border-top: 1px solid var(--amber); padding-top: 16px; }
  .point .num { font-family: var(--mono); font-size: 11px; color: var(--amber); letter-spacing: 0.18em; }
  .point h5 { font-family: var(--serif); font-weight: 400; font-size: 19px; line-height: 1.25; margin: 6px 0 8px; }
  .point p  { font-family: var(--serif); font-weight: 300; color: var(--fg-dim); font-size: 14px; line-height: 1.55; margin: 0; }

  /* ─── Roadmap ──────────────────────────────────────────────────────── */
  .roadmap {
    max-width: var(--max); margin: 0 auto; padding: 0 var(--gut);
  }
  .timeline { position: relative; padding-left: 32px; }
  .timeline::before {
    content: ''; position: absolute; left: 8px; top: 8px; bottom: 8px;
    width: 1px; background: var(--hairline-bright);
  }
  .tl-item {
    position: relative; padding: 18px 0 28px;
    border-bottom: 1px dashed var(--hairline);
  }
  .tl-item:last-child { border-bottom: 0; }
  .tl-item::before {
    content: ''; position: absolute; left: -32px; top: 26px;
    width: 17px; height: 17px;
    background: var(--bg);
    border: 1px solid var(--hairline-bright); border-radius: 50%;
  }
  .tl-item[data-state="done"]::before { background: var(--amber); border-color: var(--amber); }
  .tl-item[data-state="active"]::before { background: var(--bg); border-color: var(--teal); box-shadow: 0 0 0 4px rgba(95,212,212,.15); }
  .tl-head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
  .tl-day { font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--fg-faint); }
  .tl-state { font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase; padding: 2px 8px; border: 1px solid var(--hairline-bright); color: var(--fg-dim); }
  .tl-item[data-state="done"]   .tl-state { color: var(--amber); border-color: var(--amber-dim); }
  .tl-item[data-state="active"] .tl-state { color: var(--teal); border-color: var(--teal-dim); }
  .tl-title { font-family: var(--serif); font-weight: 400; font-size: 22px; line-height: 1.2; margin: 6px 0 6px; letter-spacing: -0.01em; }
  .tl-detail { font-family: var(--serif); font-weight: 300; color: var(--fg-dim); font-size: 15px; line-height: 1.55; margin: 0; max-width: 60ch; }

  /* ─── Footer ───────────────────────────────────────────────────────── */
  footer.foot {
    border-top: 1px solid var(--hairline);
    padding: 56px var(--gut);
    background: var(--bg-soft);
  }
  .foot-inner {
    max-width: var(--max); margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) repeat(3, minmax(0, 1fr));
    gap: 36px;
  }
  @media (max-width: 880px) { .foot-inner { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
  .foot-brand {
    font-family: var(--serif); font-style: italic; font-size: 28px; line-height: 1.15;
    color: var(--fg); margin: 0 0 12px;
  }
  .foot-tag {
    font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.12em;
    color: var(--fg-faint); text-transform: uppercase;
  }
  .foot-col h6 {
    font-family: var(--mono); font-size: 11px; font-weight: 500;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--fg-dim);
    margin: 0 0 14px;
  }
  .foot-col ul { list-style: none; padding: 0; margin: 0; }
  .foot-col li { font-family: var(--mono); font-size: 13px; padding: 4px 0; }
  .foot-col li a { color: var(--fg); text-decoration: none; }
  .foot-col li a:hover { color: var(--amber); }
  .foot-bottom {
    max-width: var(--max); margin: 40px auto 0;
    padding-top: 24px;
    border-top: 1px solid var(--hairline);
    display: flex; justify-content: space-between; flex-wrap: wrap; gap: 14px;
    font-family: var(--mono); font-size: 11px; color: var(--fg-faint); letter-spacing: 0.06em;
  }
  .foot-bottom .creed { font-style: italic; color: var(--fg-dim); font-family: var(--serif); font-size: 13.5px; letter-spacing: 0; }

  /* ─── Mobile refinements ──────────────────────────────────────────────
     The grids above all collapse to minmax(0, 1fr) on mobile so unwrappable
     pre.code blocks scroll inside their cards rather than expanding the
     page. The rules below address the remaining mobile-specific concerns:
     long inline tokens that don't wrap, iOS auto-zoom on inputs < 16px,
     vertical padding inflation, sub-44px tap targets, and door padding
     that eats too much horizontal real estate on a 320px screen. */
  @media (max-width: 720px) {
    /* Long URLs and ws:// snippets inside prose must wrap, otherwise they
       force horizontal overflow even when their grid cell is constrained.
       Targeting typography containers (not just .mono) catches inline-
       styled spans too, e.g. style="font-family: var(--mono)". */
    p, .section-sub, .door-text, .tl-detail, .door-output, .frame .body,
    .mono, code {
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    /* pre.code keeps white-space: pre (intentional — these are shell
       snippets where leading whitespace is meaningful). The card scrolls
       horizontally inside via overflow-x: auto on .endpoint code blocks
       and the wire-inset code blocks; that's now safe because the parent
       grid gives them a min-width of 0. */
    pre.code { white-space: pre; }

    /* iOS Safari auto-zooms on focus when input font-size < 16px. */
    .field, .agent-input input { font-size: 16px; }

    /* Sections compress vertical rhythm on phones. */
    section { padding: 56px 0 40px; }
    .section-head { margin-bottom: 36px; }
    .hero { padding: 40px var(--gut) 32px; }
    .door { padding: 22px; min-height: 0; }
    footer.foot { padding: 40px var(--gut); }

    /* Tap targets — Apple HIG = 44pt minimum. */
    .door-action, .ghost-btn, .btn { min-height: 44px; }
    .agent-input button { min-height: 44px; }

    /* Inputs in flex rows need min-width: 0 to shrink below their default
       size; otherwise the adjacent button is pushed off the card edge on
       320px screens. Two flex rows on this page: .field-row in the doors,
       and .agent-input in the demo theatre. */
    .field-row, .field { min-width: 0; }
    .agent-input { min-width: 0; }
    .agent-input input { min-width: 0; }

    /* The full-page grain costs paint on mobile and adds nothing visible
       when the screen is small. Disable to lighten scroll. */
    body::before { display: none; }
  }
</style>
</head>

<body>

<!-- ═══════════════════ TOP BAR ═══════════════════ -->
<header class="topbar">
  <div class="topbar-inner">
    <div class="brand"><span class="dot"></span>AMS<span class="brand-expand"> · AGENT MESSAGING SERVICE</span><span class="brand-sep"> · </span><span class="brand-tag">TOKEN STREAM ROUTING</span></div>
    <nav class="topnav">
      <a href="#wire">Status</a>
      <a href="#tincan">Demo</a>
      <a href="#raw-ams">Wire</a>
      <a href="#protocol">Protocol</a>
      <a href="#telem">Telemetry</a>
      <a href="https://github.com/klappy/agent-messaging-service" target="_blank" rel="noopener">GitHub ↗</a>
    </nav>
  </div>
</header>

<!-- ═══════════════════ HERO ═══════════════════ -->
<section class="hero" style="border-bottom: 0; padding-bottom: 56px;">
  <div class="hero-grid">
    <div>
      <p class="hero-eyebrow">
        v1.1.1 PoC <span class="sep">·</span> Day 1+2 shipped <span class="sep">·</span> Pre-launch
      </p>
      <h1>
        We <span class="accent">were</span> the wire.<br>
        <em>AMS</em> is the rewiring.
        <span class="small"><strong>AMS · Agent Messaging Service.</strong> Real-time pub-sub for agents. N peers join a conversation. Each owns a stream. Tokens fan out to every subscriber — peers, operators, observers, anything that can listen. No copy-paste. No human in the wire.</span>
      </h1>
      <p class="lede">
        The TCP/IP play for agent communication: a thin, unopinionated foundation that any stack can sit on. Bring your identity, your auth, your queue. AMS just brokers tokens.
      </p>
      <p class="lede" style="margin-top: 14px; opacity: 0.78; font-size: 0.95em;">
        A dumb pipe for agent tokens — the acronym is a deliberate echo of SMS. Carriers move bytes; they don't read them. AMS moves tokens; it doesn't parse them.
      </p>
      <div class="cta-row">
        <a href="#tincan" class="btn btn-primary">Try the live demo <span class="arrow">→</span></a>
        <a href="#raw-ams" class="btn">See the wire</a>
        <a href="https://github.com/klappy/agent-messaging-service" class="btn" target="_blank" rel="noopener">Read the spec</a>
      </div>
    </div>

    <div class="hero-stage" aria-hidden="true">
      <div class="stage-label tl">Stream A · transmit</div>
      <div class="stage-label bl">Stream B · transmit</div>
      <div class="stage-label tr"><span class="live-dot"></span><span id="hero-tps">— TPS</span></div>
      <canvas id="hero-canvas"></canvas>
    </div>
  </div>
</section>

<!-- ═══════════════════ POLYMORPHIC SUBSCRIBERS ═══════════════════ -->
<section id="subscribers">
  <div class="section-head">
    <p class="section-eyebrow">The wire's promise · One emission, N subscribers</p>
    <h2 class="section-title">Agents. Humans. Observers. Services. <em>Same wire, same primitive.</em></h2>
    <p class="section-sub">
      A subscriber is anything that can join a conversation and read a stream — an LLM agent, a human operator on a UI, a logging sink, a translation service, a kettle. None are privileged at the protocol layer. <a href="https://github.com/klappy/agent-messaging-service/blob/main/canon/principles/operator-as-subscriber.md" target="_blank" rel="noopener">Operators</a> and <a href="https://github.com/klappy/agent-messaging-service/blob/main/canon/principles/observability-as-subscriber.md" target="_blank" rel="noopener">observers</a> attach exactly the way agents do. <strong>One emission, N subscribers</strong> — the wire fans out, the topology is yours to compose per-query (<a href="https://github.com/klappy/agent-messaging-service/blob/main/canon/decisions/D0001-tokens-not-messages.md" target="_blank" rel="noopener">D0001</a>).
    </p>
  </div>
</section>

<!-- ═══════════════════ LIVE WIRE STATUS ═══════════════════ -->
<div class="wire" id="wire">
  <div class="wire-inner">
    <span class="wire-label">Live wire</span>
    <span class="pill" id="pill-klappy" data-state="pending">
      <span class="lamp"></span>
      <span class="host">ams.klappy.dev</span>
      <span class="meta" id="meta-klappy">checking…</span>
    </span>
    <span class="pill" id="pill-truthkit" data-state="pending">
      <span class="lamp"></span>
      <span class="host">ams.truthkit.ai</span>
      <span class="meta" id="meta-truthkit">checking…</span>
    </span>
    <span class="wire-version" id="wire-version">protocol v1.1.1 · poll every 8s</span>
  </div>
</div>
<!-- ═══════════════════ §03 · TINCAN — LIVE MCP DEMO ═══════════════════ -->
<section id="tincan">
  <div class="section-head">
    <p class="section-eyebrow">§ A · TinCan demo · MCP-wrapped</p>
    <h2 class="section-title">Mint a conversation. <em>Hand the link to anything that speaks MCP.</em></h2>
    <p class="section-sub">
      The magic link IS the MCP endpoint per <a href="https://github.com/klappy/agent-messaging-service/blob/main/canon/decisions/D0023-magic-link-as-mcp-transport-endpoint.md" target="_blank" rel="noopener">D0023</a>. <span style="font-family: var(--mono);">POST {magic_link}</span> with a JSON-RPC body and the AMS edge wrapper handles it with the conversation pre-bound — no separate <span style="font-family: var(--mono);">/mcp</span> URL to configure, no out-of-band priming, no README to consult. Mint below; the browser attaches itself via the same wrapper Claude.ai, Cursor, Claude Desktop, and Claude Code use. Paste the link to any other MCP-speaking peer to bring them in.
    </p>
  </div>

  <div class="tincan">
    <div class="tincan-instructions">
      <label for="tincan-instructions" class="tincan-instructions-label">
        Instructions for AI peers <span class="tincan-instructions-hint">(optional · pass-through to <code>initialize.instructions</code> per <a href="https://github.com/klappy/agent-messaging-service/blob/main/canon/decisions/D0023-magic-link-as-mcp-transport-endpoint.md" target="_blank" rel="noopener">D0023</a>)</span>
      </label>
      <textarea id="tincan-instructions" class="tincan-instructions-input" rows="2" placeholder="// e.g. 'You are a debugging peer. Stay concise. Match the operator's casual register.' — verbatim opaque carriage by the wrapper, exactly as set."></textarea>
    </div>
    <div class="tincan-bar">
      <input class="tincan-link" id="tincan-link" placeholder="// click Mint to create a new conversation, then copy the magic link" readonly>
      <button class="tincan-action mint" id="tincan-mint">Mint →</button>
      <button class="tincan-action copy" id="tincan-copy" disabled>Copy</button>
    </div>

    <div class="tincan-console">
      <div class="tincan-console-bar">
        <span class="who" id="tincan-who">/* awaiting mint */</span>
        <span class="meta" id="tincan-meta">via /mcp · D0012 · D0019 keying</span>
      </div>
      <div class="tincan-log" id="tincan-log">
        <div class="tincan-frame sys"><div class="head">— ready —</div><div class="body">Click "Mint →" to create a conversation. The browser will auto-mint a demo account, mint a conversation through ams_create_conversation, and join itself via ams_join. Magic link appears above; agents you paste it to attach via the same /mcp endpoint.</div></div>
      </div>
      <form class="tincan-emit" id="tincan-emit-form">
        <input id="tincan-emit-input" placeholder="// emit a token to the conversation" autocomplete="off" spellcheck="false" disabled>
        <button type="submit" id="tincan-emit-btn" disabled>Emit</button>
      </form>
    </div>
  </div>
</section>

<!-- ═══════════════════ § B · RAW AMS — same conversation, two altitudes ═══════════════════ -->
<section id="raw-ams" style="background: var(--bg-soft);">
  <div class="section-head">
    <p class="section-eyebrow">§ B · Raw AMS · same conversation</p>
    <h2 class="section-title">Same wire. <em>Two altitudes.</em></h2>
    <p class="section-sub">
      Pull the curtain back on § A above. Every MCP <span style="font-family: var(--mono);">notifications/ams/*</span> the wrapper delivered started its life as a wire frame on the Conversation Durable Object's broadcast loop — a <span style="font-family: var(--mono);">joined</span> / <span style="font-family: var(--mono);">stream_joined</span> / <span style="font-family: var(--mono);">token</span> / <span style="font-family: var(--mono);">stream_left</span> envelope per <a href="https://github.com/klappy/agent-messaging-service/blob/main/PROTOCOL.md" target="_blank" rel="noopener">PROTOCOL.md §4</a>. The pane below renders those wire-shape frames in real time from the same MCP session §A drives. The wrapper is opaque translation per <a href="https://github.com/klappy/agent-messaging-service/blob/main/canon/decisions/D0006-dream-house-wire-edge-wrappers.md" target="_blank" rel="noopener">D0006</a>; this view shows what the wire layer carries and what the wrapper's job is.
    </p>
  </div>

  <div class="rawams">
    <div class="rawams-bar">
      <div class="rawams-bar-label">
        <span class="rawams-bar-eyebrow">/connect view · same conversation as § A</span>
        <span class="rawams-bar-meta" id="rawams-meta">/* awaiting § A mint */</span>
      </div>
      <div class="rawams-bar-spec">PROTOCOL.md §4 wire frames · <a href="https://github.com/klappy/agent-messaging-service/blob/main/canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription.md" target="_blank" rel="noopener">D0009 self-exclusion</a></div>
    </div>

    <div class="rawams-console">
      <div class="rawams-log" id="rawams-log">
        <div class="rawams-frame sys"><div class="head">— ready —</div><div class="body">Mint a conversation in § A above. Each wrapped MCP notification renders here in its underlying wire-frame shape, demonstrating that the wrapper is opaque translation between the MCP runtime contract and the AMS wire contract.</div></div>
      </div>
    </div>

    <div class="rawams-footer">
      <div class="rawams-footer-line">
        Browsers cannot set <span style="font-family: var(--mono);">Authorization</span> on a <span style="font-family: var(--mono);">new WebSocket(url)</span> upgrade per <a href="https://github.com/klappy/agent-messaging-service/blob/main/canon/decisions/D0012-browser-is-an-mcp-runtime.md" target="_blank" rel="noopener">D0012</a>, so this view does not open a separate <span style="font-family: var(--mono);">/connect</span> WebSocket from the browser. It re-renders the same notifications § A consumes, in their pre-translation wire shape. For a byte-for-byte transcript of an actual <span style="font-family: var(--mono);">wscat -c</span> session against the live wire, see <a href="https://github.com/klappy/agent-messaging-service/blob/main/journal/evidence-day2-wscat.txt" target="_blank" rel="noopener">journal/evidence-day2-wscat.txt</a>.
      </div>
    </div>
  </div>
</section>

<!-- ═══════════════════ THE THESIS — pull quote ═══════════════════ -->
<section>
  <div class="pull">
    <blockquote class="thesis">
      Agents already think in tokens. Models emit tokens. Models consume tokens. Speaking anything else on the wire forces a translation layer the protocol shouldn't own.
      <cite>AMS.md · §3.1 · Why tokens, not messages</cite>
    </blockquote>
    <div class="three-points">
      <div class="point">
        <span class="num">001</span>
        <h5>Stream is the primitive.</h5>
        <p>Conversations are containers. Streams carry identity, ownership, and metadata. You own what you write; others choose to listen.</p>
      </div>
      <div class="point">
        <span class="num">002</span>
        <h5>Magic link is the address.</h5>
        <p>One URL carries host, namespace, alias, and permissive token. Share it on Signal. Send it in a calendar invite. The wire doesn't care.</p>
      </div>
      <div class="point">
        <span class="num">003</span>
        <h5>Self-echo is structurally excluded.</h5>
        <p>You can't subscribe to your own stream. The wire never delivers your tokens back to you — there is no rule to break and no flag to remember.</p>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════════════ PROTOCOL ═══════════════════ -->
<section id="protocol" style="background: var(--bg-soft);">
  <div class="section-head">
    <p class="section-eyebrow">§ 03 · The protocol, verbatim</p>
    <h2 class="section-title">Four endpoints. <em>That's the whole wire.</em></h2>
    <p class="section-sub">
      No gRPC. No SDK. No "protobuf as a service." HTTP for the control plane, WebSocket for the data plane, and that's it. Curl works. Pasting your bearer into a notebook works. Your shell is a first-class client.
    </p>
  </div>

  <div class="protocol">
    <div class="endpoint">
      <h4><span class="verb">POST</span>/v1/accounts</h4>
      <div class="desc">Mint an account under a namespace. Returns the bearer credential exactly once.</div>
      <pre class="code"><span class="c"># request</span>
curl -X POST https://ams.klappy.dev/v1/accounts \\
  -H "content-type: application/json" \\
  -d '{<span class="k">"namespace"</span>:<span class="t">"demo-9421"</span>}'

<span class="c"># 201</span>
{
  <span class="k">"account_id"</span>:  <span class="t">"acc_01HZQ…"</span>,
  <span class="k">"namespace"</span>:   <span class="t">"demo-9421"</span>,
  <span class="k">"credential"</span>:  <span class="t">"ams_sk_chxH_…"</span>,
  <span class="k">"created_at"</span>:  <span class="t">"2026-05-02T…Z"</span>
}</pre>
    </div>

    <div class="endpoint">
      <h4><span class="verb">POST</span>/v1/{ns}/conversations</h4>
      <div class="desc">Mint a conversation under your namespace. Magic link comes back. Share it.</div>
      <pre class="code"><span class="c"># request</span>
curl -X POST https://ams.klappy.dev/v1/demo-9421/conversations \\
  -H "authorization: Bearer ams_sk_…" \\
  -H "content-type: application/json" -d '{}'

<span class="c"># 201</span>
{
  <span class="k">"conversation_id"</span>: <span class="t">"conv_01HZQ…"</span>,
  <span class="k">"alias"</span>:           <span class="t">"falcon-pulse-9421"</span>,
  <span class="k">"magic_link"</span>:      <span class="t">"https://ams.klappy.dev/demo-9421/conversations/falcon-pulse-9421?t=eyJh…"</span>,
  <span class="k">"stream_id"</span>:       <span class="t">"str_01HZQ…"</span>,
  <span class="k">"stream_name"</span>:     <span class="t">"stream-WuqK7N"</span>
}</pre>
    </div>

    <div class="endpoint">
      <h4><span class="verb get">GET</span>/healthz</h4>
      <div class="desc">Liveness probe. Both <span class="mono">ams.klappy.dev</span> and <span class="mono">ams.truthkit.ai</span> answer; same Worker, same KV.</div>
      <pre class="code"><span class="c"># request</span>
curl https://ams.klappy.dev/healthz

<span class="c"># 200</span>
{
  <span class="k">"ok"</span>: <span class="t">true</span>,
  <span class="k">"host"</span>: <span class="t">"ams.klappy.dev"</span>,
  <span class="k">"ts"</span>:   <span class="t">"2026-05-02T…Z"</span>
}</pre>
    </div>

    <div class="endpoint">
      <h4><span class="verb ws">WS</span>{magic_link}/connect</h4>
      <div class="desc">Append <span class="mono">/connect</span> to a magic link, upgrade to WebSocket, push tokens. <strong>Live in production.</strong> Wire format below is verbatim from the implementation in <a href="https://github.com/klappy/agent-messaging-service/blob/main/worker/src/conversation.ts" target="_blank" rel="noopener">conversation.ts</a> — see also <a href="https://github.com/klappy/agent-messaging-service/blob/main/PROTOCOL.md" target="_blank" rel="noopener">PROTOCOL.md §4</a> and the <a href="https://github.com/klappy/agent-messaging-service/blob/main/journal/evidence-day2-wscat.txt" target="_blank" rel="noopener">live wscat transcript</a>.</div>
      <pre class="code"><span class="c"># client: WS upgrade headers (stream identity rides on headers, not a frame)</span>
GET /{ns}/conversations/{alias}/connect?t=&lt;permissive&gt;
Authorization: Bearer ams_sk_…
X-AMS-Stream-Name: agent-a              <span class="c"># optional; default: stream-XXXXXX</span>
X-AMS-Stream-Metadata: &lt;base64-json&gt;    <span class="c"># optional</span>
X-AMS-Self-Subscribe: false             <span class="c"># optional; default false (D0009)</span>

<span class="c"># server → client, first frame after upgrade</span>
{ <span class="k">"type"</span>:<span class="t">"joined"</span>,
  <span class="k">"conversation_id"</span>:<span class="t">"conv_…"</span>,
  <span class="k">"stream_id"</span>:<span class="t">"str_…"</span>,
  <span class="k">"stream_name"</span>:<span class="t">"agent-a"</span>,
  <span class="k">"self_subscribe"</span>:<span class="t">false</span>,
  <span class="k">"peers"</span>:[<span class="t">/* streams already in the conversation */</span>] }

<span class="c"># client → server</span>
{ <span class="k">"type"</span>:<span class="t">"token"</span>, <span class="k">"data"</span>:<span class="t">"hello"</span> }

<span class="c"># server → other subscribers (NOT the emitter; D0009 structural exclusion)</span>
{ <span class="k">"type"</span>:<span class="t">"token"</span>,
  <span class="k">"stream_id"</span>:<span class="t">"str_…"</span>,
  <span class="k">"stream_name"</span>:<span class="t">"agent-a"</span>,
  <span class="k">"owner_account_id"</span>:<span class="t">"acc_…"</span>,
  <span class="k">"ts"</span>:<span class="t">"2026-05-…Z"</span>,
  <span class="k">"data"</span>:<span class="t">"hello"</span> }</pre>
    </div>
  </div>
</section>

<!-- ═══════════════════ WHY TOKENS — section break ═══════════════════ -->
<section id="telem">
  <div class="section-head">
    <p class="section-eyebrow">§ 04 · Built in the open</p>
    <h2 class="section-title">Real telemetry. <em>No information asymmetry.</em></h2>
    <p class="section-sub">
      AMS is built under <a href="https://oddkit.klappy.dev" target="_blank" rel="noopener">oddkit</a>'s epistemic discipline. Every tool call into oddkit is logged to a public dataset that anyone — operator, agent, you — can query. The numbers below are pulled live from <span style="font-family: var(--mono);">oddkit.klappy.dev/mcp</span> and refresh on load.
    </p>
  </div>

  <div class="telem">
    <div class="telem-grid">
      <div class="telem-card">
        <h4>oddkit tool calls · last 7 days <span class="right" id="telem-updated">loading…</span></h4>
        <div class="bars" id="telem-bars">
          <div class="bar-row"><span class="label" style="color: var(--fg-faint);">awaiting query…</span><span class="track"></span><span class="num"></span></div>
        </div>
        <div class="telem-foot">
          Source: Cloudflare Analytics Engine · <span class="mono">oddkit_telemetry</span> · sampled, aggregated with <span class="mono">SUM(_sample_interval)</span>. Same query, same data, same access as the maintainer. <a href="https://oddkit.klappy.dev" target="_blank" rel="noopener">telemetry policy ↗</a>
        </div>
      </div>

      <div class="telem-card">
        <h4>This week, in numbers</h4>
        <div class="stat-rows">
          <div class="stat-row">
            <div class="stat-num" id="stat-calls">—</div>
            <div class="stat-label">total tool calls · 7d</div>
          </div>
          <div class="stat-row">
            <div class="stat-num" id="stat-tools">—</div>
            <div class="stat-label">distinct oddkit actions</div>
          </div>
          <div class="stat-row">
            <div class="stat-num" id="stat-top">—</div>
            <div class="stat-label">top action</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════════════ ROADMAP ═══════════════════ -->
<section style="background: var(--bg-soft);">
  <div class="section-head">
    <p class="section-eyebrow">§ 05 · Roadmap, observed</p>
    <h2 class="section-title">Where the build <em>actually is.</em></h2>
    <p class="section-sub">
      "We were the wire" was a hackathon scene. The build started 24 hours ago. Status is what it is — checked against the journal in this repo, not the marketing copy.
    </p>
  </div>

  <div class="roadmap">
    <div class="timeline">
      <div class="tl-item" data-state="done">
        <div class="tl-head"><span class="tl-day">Day 1 · Saturday 02 May</span><span class="tl-state">Shipped ✓</span></div>
        <h3 class="tl-title">Worker shell · accounts · conversation mint.</h3>
        <p class="tl-detail">Three endpoints behind <span style="font-family:var(--mono);">ams.klappy.dev</span> + <span style="font-family:var(--mono);">ams.truthkit.ai</span>. SPEC §3.1 items 1 and 2 PASS on live deploy across both hosts. Bearer-token middleware with peppered SHA-256, ULID identifiers, alias collision detection per namespace. Evidence: <a href="https://github.com/klappy/agent-messaging-service/blob/main/journal/evidence-day1-live-smoke.txt" target="_blank" rel="noopener">evidence-day1-live-smoke.txt</a>.</p>
      </div>
      <div class="tl-item" data-state="done">
        <div class="tl-head"><span class="tl-day">Day 2 · Sunday 03 May</span><span class="tl-state">Shipped ✓</span></div>
        <h3 class="tl-title">ConversationDO · WebSocket · stream-scoped broadcast.</h3>
        <p class="tl-detail">Durable Object per conversation. <span style="font-family:var(--mono);">/connect</span> upgrade, <span style="font-family:var(--mono);">joined</span>/<span style="font-family:var(--mono);">stream_joined</span>/<span style="font-family:var(--mono);">token</span>/<span style="font-family:var(--mono);">stream_left</span> lifecycle, structural self-exclusion per D0009. SPEC §3.1 item 3 PASS — paired wscat sessions in <a href="https://github.com/klappy/agent-messaging-service/blob/main/journal/evidence-day2-wscat.txt" target="_blank" rel="noopener">evidence-day2-wscat.txt</a> show ≈2ms broker hop and zero self-echo.</p>
      </div>
      <div class="tl-item" data-state="active">
        <div class="tl-head"><span class="tl-day">Day 3+ · Monday onward</span><span class="tl-state">In flight</span></div>
        <h3 class="tl-title">MCP edge wrapper · gauntlet · demo gate.</h3>
        <p class="tl-detail">The MCP server at <span style="font-family:var(--mono);">/mcp</span> that turns AMS into a tool-call interface for any LLM agent. SPEC §3.1 items 4 + 5, then the hackathon-replay between two real agents on two real machines. SPEC §3.2.</p>
      </div>
      <div class="tl-item">
        <div class="tl-head"><span class="tl-day">Beyond</span><span class="tl-state">Catalog</span></div>
        <h3 class="tl-title">A protocol, not a platform.</h3>
        <p class="tl-detail">Open spec. Open reference impl. Hosted reference behind <span style="font-family:var(--mono);">ams.klappy.dev</span>. Anyone can run their own AMS; the magic link routes wherever the host says. <a href="https://github.com/klappy/agent-messaging-service/blob/main/HORIZON.md" target="_blank" rel="noopener">HORIZON.md</a> catalogs the use cases on top.</p>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════════════ FOOTER ═══════════════════ -->
<footer class="foot">
  <div class="foot-inner">
    <div>
      <p class="foot-brand"><em>AMS · Agent Messaging Service.</em></p>
      <p class="foot-tag" style="margin-top: 4px;">Token stream routing.</p>
      <p class="foot-tag">Built by klappy · Adjacent to TruthKit</p>
    </div>
    <div class="foot-col">
      <h6>Read</h6>
      <ul>
        <li><a href="https://github.com/klappy/agent-messaging-service/blob/main/SPEC.md" target="_blank" rel="noopener">SPEC.md — the contract</a></li>
        <li><a href="https://github.com/klappy/agent-messaging-service/blob/main/PROTOCOL.md" target="_blank" rel="noopener">PROTOCOL.md — the wire</a></li>
        <li><a href="https://github.com/klappy/agent-messaging-service/blob/main/AMS.md" target="_blank" rel="noopener">AMS.md — the thesis</a></li>
        <li><a href="https://github.com/klappy/agent-messaging-service/blob/main/ESSAY.md" target="_blank" rel="noopener">ESSAY.md — we were the wire</a></li>
      </ul>
    </div>
    <div class="foot-col">
      <h6>Build</h6>
      <ul>
        <li><a href="https://github.com/klappy/agent-messaging-service" target="_blank" rel="noopener">github / klappy / agent-messaging-service</a></li>
        <li><a href="https://github.com/klappy/agent-messaging-service/blob/main/POC-INFRA.md" target="_blank" rel="noopener">POC-INFRA.md</a></li>
        <li><a href="https://github.com/klappy/agent-messaging-service/blob/main/PATTERNS.md" target="_blank" rel="noopener">PATTERNS.md</a></li>
        <li><a href="https://github.com/klappy/agent-messaging-service/tree/main/journal" target="_blank" rel="noopener">journal/ DOLCHEO+</a></li>
      </ul>
    </div>
    <div class="foot-col">
      <h6>Adjacent</h6>
      <ul>
        <li><a href="https://klappy.dev" target="_blank" rel="noopener">klappy.dev</a></li>
        <li><a href="https://oddkit.klappy.dev" target="_blank" rel="noopener">oddkit — epistemic guide</a></li>
        <li><a href="https://truthkit.ai" target="_blank" rel="noopener">truthkit.ai</a></li>
      </ul>
    </div>
  </div>
  <div class="foot-bottom">
    <span class="creed">Before I speak, I observe. Before I claim, I verify.</span>
    <span>This page is served by the same Worker behind the API. Same origin, same evidence.</span>
  </div>
</footer>

<script>
"use strict";

// ═══════════════════ utilities ═══════════════════
const $  = (s, p=document) => p.querySelector(s);
const $$ = (s, p=document) => Array.from(p.querySelectorAll(s));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const now = () => new Date();
const fmtDur = (ms) => {
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return Math.round(ms) + ' ms';
  return (ms / 1000).toFixed(2) + ' s';
};
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
const randHex = (n) => {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2,'0')).join('');
};

// ═══════════════════ Hero canvas — token river ═══════════════════
(function heroRiver() {
  const cv = $('#hero-canvas');
  const tps = $('#hero-tps');
  if (!cv) return;

  const ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);

  const STREAM_A = '#ffb547';
  const STREAM_B = '#5fd4d4';

  const tokens = [];
  const TOKEN_CHARS = ['◆','◇','▲','△','■','□','●','○','▣','▤','01','11','┌','┐','└','┘','▒','░','│','─','╳','◣','◢','▎','▍','┼','┤','├','=>','<=','{','}','[]','01001','/n','&','*','#'];
  const NOISE = ['hello','world','TOKEN','READY','SYN','ACK','42','GET','POST','UTF-8','OK','{}','[]','✓','▶','#0','ok','—','sig','rcv','>','<'];

  let lastEmit = 0;
  let lastT = performance.now();
  let frameCount = 0, statT = 0, tps5s = 0;

  function resize() {
    const rect = cv.getBoundingClientRect();
    W = rect.width; H = rect.height;
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  function emit(stream) {
    const isA = stream === 'A';
    const y = isA
      ? H * (0.18 + Math.random() * 0.22)
      : H * (0.60 + Math.random() * 0.22);
    const dir = isA ? 1 : -1;
    const speed = (60 + Math.random() * 90) * (Math.random() > 0.85 ? 0.4 : 1);
    const isNoise = Math.random() > 0.7;
    const text = isNoise ? NOISE[(Math.random() * NOISE.length)|0] : TOKEN_CHARS[(Math.random() * TOKEN_CHARS.length)|0];
    tokens.push({
      x: dir > 0 ? -20 : W + 20,
      y,
      vx: dir * speed,
      text,
      color: isA ? STREAM_A : STREAM_B,
      life: 0,
      maxLife: 8 + Math.random() * 4,
      size: isNoise ? 11 : (12 + Math.random() * 5),
      alpha: 0.55 + Math.random() * 0.45,
      rotate: (Math.random() - 0.5) * 0.18,
    });
  }

  function frame(t) {
    const dt = Math.min(80, t - lastT) / 1000;
    lastT = t;
    frameCount++;
    statT += dt;

    // emit timing — about 30/sec total split between A and B
    lastEmit += dt;
    while (lastEmit > 0.033) {
      lastEmit -= 0.033;
      emit(Math.random() > 0.5 ? 'A' : 'B');
    }

    // periodic stat update
    if (statT > 0.5) {
      tps5s = Math.round(frameCount / statT);
      // we measure frames not tokens, but token rate is roughly stable; cheat: count tokens emitted ≈ 30/s
      const measured = (1 / 0.033);
      if (tps) tps.textContent = (Math.round(measured) + ' TPS · ' + (tokens.length) + ' in flight');
      statT = 0; frameCount = 0;
    }

    // clear with very subtle trail
    ctx.fillStyle = 'rgba(13,12,10,0.35)';
    ctx.fillRect(0, 0, W, H);

    // center divider
    ctx.strokeStyle = 'rgba(232,226,212,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.setLineDash([3, 6]);
    ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // tokens
    ctx.font = '500 14px IBM Plex Mono, monospace';
    ctx.textBaseline = 'middle';
    for (let i = tokens.length - 1; i >= 0; i--) {
      const tk = tokens[i];
      tk.x += tk.vx * dt;
      tk.life += dt;
      const offscreen = tk.x < -60 || tk.x > W + 60;
      const expired = tk.life > tk.maxLife;
      if (offscreen || expired) { tokens.splice(i, 1); continue; }

      const a = tk.alpha * (1 - Math.min(1, tk.life / tk.maxLife));
      ctx.save();
      ctx.translate(tk.x, tk.y);
      ctx.rotate(tk.rotate);
      ctx.font = '500 ' + tk.size + 'px IBM Plex Mono, monospace';
      ctx.fillStyle = tk.color;
      ctx.globalAlpha = a;
      ctx.fillText(tk.text, 0, 0);
      // small trailing line
      ctx.globalAlpha = a * 0.25;
      ctx.strokeStyle = tk.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const trail = -Math.sign(tk.vx) * 30;
      ctx.moveTo(0, 0); ctx.lineTo(trail, 0);
      ctx.stroke();
      ctx.restore();
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame((t) => { lastT = t; frame(t); });
})();

// ═══════════════════ Live wire — /healthz polling on both hosts ═══════════════════
(async function liveWire() {
  const hosts = [
    { id: 'klappy',   url: 'https://ams.klappy.dev/healthz',   pill: $('#pill-klappy'),   meta: $('#meta-klappy') },
    { id: 'truthkit', url: 'https://ams.truthkit.ai/healthz',  pill: $('#pill-truthkit'), meta: $('#meta-truthkit') },
  ];

  async function probe(h) {
    h.pill.dataset.state = 'pending';
    h.meta.textContent = 'checking…';
    const t0 = performance.now();
    try {
      // Per /healthz CORS — wildcard origin allowed for read-only liveness.
      const r = await fetch(h.url, { method: 'GET', mode: 'cors', cache: 'no-store' });
      const dur = performance.now() - t0;
      if (!r.ok) {
        h.pill.dataset.state = 'err';
        h.meta.textContent = 'HTTP ' + r.status + ' · ' + fmtDur(dur);
        return;
      }
      const j = await r.json().catch(() => ({}));
      h.pill.dataset.state = 'ok';
      const stamp = (j && j.ts) ? new Date(j.ts).toISOString().slice(11, 19) + 'Z' : '';
      h.meta.textContent = '200 · ' + fmtDur(dur) + (stamp ? ' · ' + stamp : '');
    } catch (e) {
      h.pill.dataset.state = 'err';
      h.meta.textContent = 'unreachable · ' + (e && e.message ? e.message.slice(0, 32) : 'network');
    }
  }

  async function tick() {
    await Promise.all(hosts.map(probe));
  }
  tick();
  setInterval(tick, 8000);
})();

// Shared between door (i) and door (ii): the most-recently-minted bearer.
// Door (i) sets it after a successful mint; door (ii) inlines it into the
// generated wscat command so the snippet is actually copy-pasteable.
let lastCredential = null;
// ═══════════════════ §03 TinCan — live MCP demo ═══════════════════
// Browser-as-MCP-runtime per ams://canon/decisions/D0012. Speaks the same
// /mcp wrapper any agent (Claude Code, Cursor, Desktop) uses. No SDK,
// vanilla fetch + EventSource. Token contents stay opaque — we render
// what arrives, never branch on it.
(function tincan() {
  const linkInput = $('#tincan-link');
  const mintBtn   = $('#tincan-mint');
  const copyBtn   = $('#tincan-copy');
  const log       = $('#tincan-log');
  const who       = $('#tincan-who');
  const meta      = $('#tincan-meta');
  const emitForm  = $('#tincan-emit-form');
  const emitInput = $('#tincan-emit-input');
  const emitBtn   = $('#tincan-emit-btn');
  // § B raw-AMS pane — same conversation, two altitudes. We re-render every
  // notifications/ams/* into the wire-frame shape it carried before the wrapper
  // translated it. No second WebSocket; the wrapper is opaque, both views read
  // the same notification stream.
  const rawLog    = $('#rawams-log');
  const rawMeta   = $('#rawams-meta');
  if (!linkInput || !mintBtn) return;

  const ORIGIN = window.location.origin;
  let bearer = null;
  let mcpSessionId = null;
  let sse = null;
  let myStreamId = null;

  function appendFrame(kind, head, body) {
    const div = document.createElement('div');
    div.className = 'tincan-frame ' + kind;
    div.innerHTML = '<div class="head">' + escapeHtml(head) + '</div><div class="body"></div>';
    div.querySelector('.body').textContent = body == null ? '' : String(body);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  // § B writer — render a wire-shape frame. 'kind' becomes a CSS class for color
  // coding (token / joined / stream-joined / stream-left / stream-metadata /
  // closed / sys). 'frame' is the JSON object the wire carries; we pretty-print
  // it as the body so the structural shape is visible.
  function appendRawFrame(kind, head, frame) {
    if (!rawLog) return;
    const div = document.createElement('div');
    div.className = 'rawams-frame ' + kind;
    div.innerHTML = '<div class="head">' + escapeHtml(head) + '</div><div class="body"></div>';
    div.querySelector('.body').textContent =
      typeof frame === 'string' ? frame : JSON.stringify(frame, null, 2);
    rawLog.appendChild(div);
    rawLog.scrollTop = rawLog.scrollHeight;
  }
  function clearRawLog() { if (rawLog) rawLog.innerHTML = ''; }

  function appendError(msg, detail) {
    appendFrame('left', 'error', msg + (detail ? '\\n' + detail : ''));
  }

  // SDK MCP responses can come back as either application/json (single response)
  // or text/event-stream (SSE-framed: 'event: message\\ndata: {...}\\n\\n'). The
  // SDK prefers SSE when the client accepts both. r.json() fails on SSE bodies
  // in WebKit with "The string did not match the expected pattern" — parse by
  // content-type instead. Multiple data: lines per SSE-spec join with newlines.
  async function parseMcpResponse(r) {
    const contentType = r.headers.get('content-type') || '';
    const text = await r.text();
    if (contentType.indexOf('text/event-stream') === 0) {
      const dataLines = [];
      const lines = text.split('\\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf('data:') === 0) {
          dataLines.push(line.slice(5).replace(/^ /, ''));
        }
      }
      if (!dataLines.length) {
        throw new Error('SSE response had no data lines: ' + text.slice(0, 200));
      }
      return JSON.parse(dataLines.join('\\n'));
    }
    return JSON.parse(text);
  }

  // Initialize MCP via POST /mcp { method: "initialize" }. The SDK requires the
  // mcp-session-id from this response on every subsequent tools/call, so we
  // capture it here into mcpSessionId for downstream threading.
  //
  // CRITICAL: the Authorization bearer MUST be sent on initialize. The SDK's
  // McpAgent binds the account context (props.account_id) at session creation
  // and does NOT refresh it from subsequent tools/call requests — even when
  // those requests carry a valid Authorization header. Verified empirically
  // against production: initialize-without-auth followed by tools/call-with-
  // auth fails with 'invalid_credential: Authorization bearer required'.
  // Sending bearer here ensures the session is created with the correct
  // account binding from first contact. mintAccount() runs before mcpInitialize
  // in the click handler, so 'bearer' is already populated.
  async function mcpInitialize() {
    const headers = {
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream',
    };
    if (bearer) headers['authorization'] = 'Bearer ' + bearer;
    const r = await fetch(ORIGIN + '/mcp', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2025-06-18',
        capabilities: { roots: {} },
        clientInfo: { name: 'ams-homepage-tincan', version: '0.1.0' },
      }}),
    });
    if (!r.ok) throw new Error('initialize failed: ' + r.status);
    const sid = r.headers.get('mcp-session-id');
    if (sid) mcpSessionId = sid;
    return parseMcpResponse(r);
  }

  async function mcpToolCall(name, args, sessionId) {
    const useSession = sessionId || mcpSessionId;
    const headers = {
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream',
      'authorization': 'Bearer ' + bearer,
    };
    if (useSession) headers['mcp-session-id'] = useSession;
    const r = await fetch(ORIGIN + '/mcp', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        jsonrpc: '2.0', id: Date.now(),
        method: 'tools/call',
        params: { name: name, arguments: args },
      }),
    });
    let payload;
    try { payload = await parseMcpResponse(r); }
    catch (e) { throw new Error('non-parseable response: ' + e.message); }
    const ret = { sessionHeader: r.headers.get('mcp-session-id') || useSession, payload: payload };
    if (payload.error) {
      const err = new Error(payload.error.message || 'rpc_error');
      err.payload = payload;
      throw err;
    }
    if (payload.result && payload.result.isError) {
      const sc = payload.result.structuredContent || {};
      const err = new Error((sc.error || 'tool_error') + ': ' + (sc.message || ''));
      err.payload = sc;
      throw err;
    }
    return ret;
  }

  // Bearer mint: per-tab demo credential, throwaway. The page never stores it
  // in localStorage; closing the tab discards it.
  async function mintAccount() {
    const ns = 'tincan-' + Math.floor(Math.random() * 1e9).toString(36);
    const r = await fetch(ORIGIN + '/v1/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ namespace: ns }),
    });
    if (!r.ok) throw new Error('account mint failed: ' + r.status + ' ' + (await r.text()));
    const j = await r.json();
    bearer = j.credential;
    return j;
  }

  function startSSE() {
    if (!mcpSessionId || !bearer) return;
    if (sse) { try { sse.close(); } catch {} sse = null; }
    // EventSource cannot set headers, so we use fetch + ReadableStream.
    // (Same pattern Claude Code uses on browser MCP clients.)
    const ctl = new AbortController();
    sse = { close: () => ctl.abort() };
    fetch(ORIGIN + '/mcp', {
      method: 'GET',
      headers: {
        'authorization': 'Bearer ' + bearer,
        'accept': 'text/event-stream',
        'mcp-session-id': mcpSessionId,
      },
      signal: ctl.signal,
    }).then(async (r) => {
      if (!r.ok) { appendError('SSE attach failed: ' + r.status); return; }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\\n\\n')) >= 0) {
          const evt = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const line = evt.split('\\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          let payload;
          try { payload = JSON.parse(line.slice(5).trim()); }
          catch { continue; }
          renderNotification(payload);
        }
      }
    }).catch((err) => {
      if (err.name !== 'AbortError') appendError('SSE error', err.message);
    });
  }

  function renderNotification(rpc) {
    if (!rpc || rpc.jsonrpc !== '2.0' || !rpc.method) return;
    const p = rpc.params || {};
    // Token data is opaque to the wrapper; we render it but never branch on it.
    if (rpc.method === 'notifications/ams/token') {
      // self_subscribe defaults false, so we never get our own here under normal flow.
      const headLine = 'token · ' + (p.stream_name || 'unknown') + ' · ' + (p.owner_account_id || '?').slice(0, 16) + '…';
      appendFrame('token', headLine, p.data == null ? '' : String(p.data));
      // § B — same event, wire-frame shape (PROTOCOL.md §4.2). The wrapper
      // mapped this 1:1 from the wire to the MCP notification; rendering both
      // makes the translation observable.
      appendRawFrame('token', '← token frame', {
        type: 'token',
        stream_id: p.stream_id,
        stream_name: p.stream_name,
        owner_account_id: p.owner_account_id,
        ts: p.ts,
        data: p.data,
      });
      return;
    }
    if (rpc.method === 'notifications/ams/stream_joined') {
      appendFrame('join', 'stream_joined · ' + (p.stream_name || ''),
        'owner=' + (p.owner_account_id || '?') + (p.metadata && Object.keys(p.metadata).length
          ? '\\nmetadata=' + JSON.stringify(p.metadata, null, 2) : ''));
      appendRawFrame('stream-joined', '← stream_joined frame', {
        type: 'stream_joined',
        stream_id: p.stream_id,
        stream_name: p.stream_name,
        owner_account_id: p.owner_account_id,
        metadata: p.metadata || {},
        ts: p.ts,
      });
      return;
    }
    if (rpc.method === 'notifications/ams/stream_left') {
      appendFrame('left', 'stream_left · ' + (p.stream_name || ''),
        'owner=' + (p.owner_account_id || '?'));
      appendRawFrame('stream-left', '← stream_left frame', {
        type: 'stream_left',
        stream_id: p.stream_id,
        stream_name: p.stream_name,
        owner_account_id: p.owner_account_id,
        ts: p.ts,
      });
      return;
    }
    if (rpc.method === 'notifications/ams/stream_metadata') {
      appendFrame('sys', 'stream_metadata · ' + (p.stream_name || ''),
        JSON.stringify(p.metadata || {}, null, 2));
      appendRawFrame('stream-metadata', '← stream_metadata frame', {
        type: 'stream_metadata',
        stream_id: p.stream_id,
        stream_name: p.stream_name,
        owner_account_id: p.owner_account_id,
        metadata: p.metadata || {},
        ts: p.ts,
      });
      return;
    }
    if (rpc.method === 'notifications/ams/closed') {
      appendFrame('left', 'wire_closed', 'conversation_id=' + (p.conversation_id || '?'));
      appendRawFrame('closed', '← wire closed', {
        type: 'closed',
        conversation_id: p.conversation_id,
        reason: p.reason,
      });
      return;
    }
  }

  mintBtn.addEventListener('click', async () => {
    mintBtn.disabled = true;
    try {
      log.innerHTML = '';
      appendFrame('sys', '— minting —', 'POST /v1/accounts (per-tab demo credential)');
      const acc = await mintAccount();
      who.textContent = acc.account_id.slice(0, 18) + '… · ns=' + acc.namespace;
      appendFrame('sys', 'account', acc.account_id + ' (ns=' + acc.namespace + ')');

      appendFrame('sys', '— initialize —', 'POST /mcp { method: initialize }');
      await mcpInitialize();

      appendFrame('sys', '— mint conversation —', 'POST /mcp tools/call ams_create_conversation');
      // Operator-set instructions per D0023: read the textarea, opaque pass-through.
      // Wrapper does not parse, validate, or rewrite — it just carries the string
      // verbatim into initialize.instructions for any peer that calls it.
      const instructionsEl = $('#tincan-instructions');
      const instructionsText = instructionsEl ? (instructionsEl.value || '').trim() : '';
      const conversationMetadata = instructionsText ? { instructions: instructionsText } : undefined;
      // Declare the operator's capability per security-as-subscriber-pattern's
      // capabilities convention. Round-trips through PROTOCOL §4.4 untouched.
      const created = await mcpToolCall('ams_create_conversation', {
        stream_name: 'tincan-browser',
        ...(conversationMetadata ? { metadata: conversationMetadata } : {}),
        stream_metadata: {
          capabilities: {
            'ams.convention.v1': {
              role: 'operator',
              function: 'observer',
              posture: 'alerting',
              scope: ['lifecycle', 'structural', 'content'],
            },
            annotations: {
              display_name: 'TinCan browser operator',
              user_agent: 'browser-as-mcp-runtime',
            },
          },
        },
      });
      const convo = (created.payload.result && created.payload.result.structuredContent) || {};
      const link = convo.magic_link;
      if (!link) throw new Error('mint did not return a magic_link');
      linkInput.value = link;
      copyBtn.disabled = false;
      appendFrame('sys', 'magic_link', link);
      if (instructionsText) {
        appendFrame('sys', 'operator instructions',
          'set on conversation metadata · pass-through to initialize.instructions for any peer that calls it (D0023)\\n\\n' + instructionsText);
      }
      appendFrame('sys', 'share',
        'The magic link IS the MCP endpoint per D0023. Paste it into Claude.ai, Cursor, Claude Desktop, Claude Code, or any MCP client — no separate /mcp URL or README config required. Each peer attaches as its own polymorphic subscriber.');

      // § B — seed the raw pane with a "wire opened" + the conversation/stream IDs
      // the wrapper just bound. From here on, every MCP notification renders into
      // both panes via renderNotification.
      if (rawMeta) {
        rawMeta.textContent = 'conversation_id=' + (convo.conversation_id || '?').slice(0, 28) + '…';
      }
      clearRawLog();
      appendRawFrame('sys', '— wire ready —',
        'The Conversation Durable Object (' + (convo.conversation_id || '?') + ') is the broker. Each peer that attaches via /connect (or via the MCP wrapper which translates) shows up as a stream_joined frame below.');

      appendFrame('sys', '— join self —', 'POST /mcp tools/call ams_join');
      const joined = await mcpToolCall('ams_join', {
        magic_link: link,
        stream_name: 'tincan-browser',
        stream_metadata: { capabilities: { 'ams.convention.v1': { role: 'operator', posture: 'alerting' } } },
      });
      mcpSessionId = joined.sessionHeader;
      const j = (joined.payload.result && joined.payload.result.structuredContent) || {};
      myStreamId = j.stream_id;
      meta.textContent = 'session=' + (mcpSessionId || '').slice(0, 28) + '… · stream_id=' + (j.stream_id || '?').slice(0, 16) + '…';
      appendFrame('self', 'joined · ' + (j.stream_name || ''), 'stream_id=' + j.stream_id + (j.peers && j.peers.length ? ('\\nexisting peers: ' + j.peers.map(p => p.stream_name + ' (' + p.owner_account_id.slice(0, 12) + '…)').join(', ')) : '\\n(no peers yet — paste the link to two agents to see them attach)'));

      // § B — render the corresponding wire-shape 'joined' frame for the
      // tincan-browser stream we just created (PROTOCOL.md §4.1). The MCP
      // wrapper does not re-emit this as a notification (it returned it
      // synchronously in the ams_join response), so we render it here
      // explicitly to keep the two panes synchronized.
      appendRawFrame('joined', '← joined frame (self)', {
        type: 'joined',
        stream_id: j.stream_id,
        stream_name: j.stream_name,
        owner_account_id: acc.account_id,
        self_subscribe: j.self_subscribe === true,
        peers: (j.peers || []).map(p => ({
          stream_id: p.stream_id,
          stream_name: p.stream_name,
          owner_account_id: p.owner_account_id,
        })),
      });

      appendFrame('sys', '— sse attach —', 'GET /mcp · SSE leg for notifications/ams/*');
      startSSE();

      emitInput.disabled = false;
      emitBtn.disabled = false;
      emitInput.placeholder = '// emit a token to the conversation (opaque to AMS — wire never reads data)';
      emitInput.focus();
    } catch (err) {
      appendError(err.message || String(err), err.payload ? JSON.stringify(err.payload) : null);
    } finally {
      mintBtn.disabled = false;
    }
  });

  copyBtn.addEventListener('click', async () => {
    if (!linkInput.value) return;
    try {
      await navigator.clipboard.writeText(linkInput.value);
      const old = copyBtn.textContent;
      copyBtn.textContent = 'Copied ✓';
      setTimeout(() => { copyBtn.textContent = old; }, 1400);
    } catch {
      // older browsers / non-secure-context fall back to selecting the input
      linkInput.removeAttribute('readonly');
      linkInput.select();
      document.execCommand && document.execCommand('copy');
      linkInput.setAttribute('readonly', '');
    }
  });

  // Auto-join if the page was served at a magic-link route. The server
  // injects window.AMS_JOIN = { magic_link, namespace, alias } when the
  // route matches /{ns}/conversations/{alias}?t=...; if present, we skip
  // the Mint flow and join the existing conversation instead — which is
  // the missing piece that made the magic-link UX broken until now (the
  // bare homepage was being served at conversation routes with no signal
  // to act on). See worker/src/homepage.ts homepageResponseForConversation.
  async function autoJoinExisting() {
    const target = window.AMS_JOIN;
    if (!target || !target.magic_link) return;
    mintBtn.disabled = true;
    mintBtn.textContent = 'Joining…';
    try {
      log.innerHTML = '';
      appendFrame('sys', '— joining conversation —', 'magic_link=' + target.magic_link);
      appendFrame('sys', '— minting —', 'POST /v1/accounts (per-tab demo credential for the joining peer)');
      const acc = await mintAccount();
      who.textContent = acc.account_id.slice(0, 18) + '… · ns=' + acc.namespace;
      appendFrame('sys', 'account', acc.account_id + ' (ns=' + acc.namespace + ')');

      appendFrame('sys', '— initialize —', 'POST /mcp { method: initialize }');
      await mcpInitialize();

      appendFrame('sys', '— join existing —', 'POST /mcp tools/call ams_join (no create — link names an existing conversation)');
      // Use a stream_name that distinguishes joining peers from the original
      // minter. Three random hex chars is plenty to disambiguate visually.
      const peerSuffix = Math.random().toString(16).slice(2, 5);
      const joined = await mcpToolCall('ams_join', {
        magic_link: target.magic_link,
        stream_name: 'tincan-peer-' + peerSuffix,
        stream_metadata: { capabilities: { 'ams.convention.v1': { role: 'joiner', posture: 'observing' } } },
      });
      mcpSessionId = joined.sessionHeader;
      const j = (joined.payload.result && joined.payload.result.structuredContent) || {};
      myStreamId = j.stream_id;
      linkInput.value = target.magic_link;
      copyBtn.disabled = false;
      meta.textContent = 'session=' + (mcpSessionId || '').slice(0, 28) + '… · stream_id=' + (j.stream_id || '?').slice(0, 16) + '…';
      const peerSummary = (j.peers && j.peers.length)
        ? '\\nexisting peers: ' + j.peers.map(p => p.stream_name + ' (' + p.owner_account_id.slice(0, 12) + '…)').join(', ')
        : '\\n(no other peers yet)';
      appendFrame('self', 'joined · ' + (j.stream_name || ''), 'stream_id=' + j.stream_id + peerSummary);

      // § B — wire pane sync, mirroring the mint path.
      if (rawMeta) {
        rawMeta.textContent = 'conversation_id=' + ((j.conversation_id || '?') + '').slice(0, 28) + '…';
      }
      clearRawLog();
      appendRawFrame('sys', '— wire ready —',
        'Joined existing conversation. Each peer attached via /connect (or via the MCP wrapper which translates) shows up as a stream_joined frame below.');
      appendRawFrame('joined', '← joined frame (self)', {
        type: 'joined',
        stream_id: j.stream_id,
        stream_name: j.stream_name,
        owner_account_id: acc.account_id,
        self_subscribe: j.self_subscribe === true,
        peers: (j.peers || []).map(p => ({
          stream_id: p.stream_id,
          stream_name: p.stream_name,
          owner_account_id: p.owner_account_id,
        })),
      });

      appendFrame('sys', '— sse attach —', 'GET /mcp · SSE leg for notifications/ams/*');
      startSSE();

      emitInput.disabled = false;
      emitBtn.disabled = false;
      emitInput.placeholder = '// emit a token to the conversation (opaque to AMS — wire never reads data)';
      mintBtn.textContent = 'Joined ✓';
    } catch (err) {
      appendError(err.message || String(err), err.payload ? JSON.stringify(err.payload) : null);
      mintBtn.disabled = false;
      mintBtn.textContent = 'Mint →';
    }
  }
  autoJoinExisting();

  emitForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = (emitInput.value || '').trim();
    if (!text || !mcpSessionId) return;
    emitInput.value = '';
    emitInput.disabled = true; emitBtn.disabled = true;
    try {
      // Render locally (we don't see our own emission back unless self_subscribe).
      appendFrame('self', 'ams_send → token', text);
      // § B — render the corresponding wire-shape outbound token frame that
      // the wrapper translates to (PROTOCOL.md §4.2). D0009: the wire fans
      // this out to peers but structurally excludes self-delivery, so the
      // sender does NOT see this back as a notification — we render it once
      // here at emit time to keep both panes aligned.
      appendRawFrame('token', '→ token frame (self · D0009 self-exclusion)', {
        type: 'token',
        stream_id: myStreamId,
        stream_name: 'tincan-browser',
        data: text,
      });
      await mcpToolCall('ams_send', { data: text }, mcpSessionId);
    } catch (err) {
      appendError('ams_send failed: ' + err.message);
    } finally {
      emitInput.disabled = false; emitBtn.disabled = false;
      emitInput.focus();
    }
  });
})();

// ═══════════════════ Live oddkit telemetry ═══════════════════
(async function telemetry() {
  const barsEl = $('#telem-bars');
  const updEl  = $('#telem-updated');
  const sCalls = $('#stat-calls');
  const sTools = $('#stat-tools');
  const sTop   = $('#stat-top');

  const SQL = "SELECT tool_name, SUM(_sample_interval) AS calls FROM oddkit_telemetry WHERE timestamp > NOW() - INTERVAL '7' DAY AND tool_name IS NOT NULL AND tool_name != '' GROUP BY tool_name ORDER BY calls DESC LIMIT 10";

  try {
    const r = await fetch('https://oddkit.klappy.dev/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'tools/call',
        params: { name: 'telemetry_public', arguments: { sql: SQL } },
      }),
    });
    const text = await r.text();
    // The MCP endpoint can return either application/json or SSE. Handle both.
    let payload;
    if (text.startsWith('event:')) {
      const dataLine = text.split('\\n').find(l => l.startsWith('data:'));
      if (!dataLine) throw new Error('no data line');
      payload = JSON.parse(dataLine.slice(5).trim());
    } else {
      payload = JSON.parse(text);
    }
    const result = payload && payload.result;
    if (!result || !result.content) throw new Error('no result.content');
    // result.content is a tool-result list with text blocks; the actual data is structuredContent or in the text.
    let rows;
    if (result.structuredContent && result.structuredContent.result && result.structuredContent.result.data) {
      rows = result.structuredContent.result.data.data;
    } else if (Array.isArray(result.content)) {
      // Try to parse JSON from the first text block
      const txt = result.content.map(b => b.text || '').join('\\n');
      const j = JSON.parse(txt);
      rows = j.result.data.data;
    } else {
      throw new Error('unexpected response shape');
    }

    if (!Array.isArray(rows) || rows.length === 0) throw new Error('no rows');

    const max = Math.max(...rows.map(r => Number(r.calls) || 0));
    const total = rows.reduce((s, r) => s + (Number(r.calls) || 0), 0);

    // animate render
    barsEl.innerHTML = '';
    rows.forEach((row, i) => {
      const calls = Number(row.calls) || 0;
      const pct = max > 0 ? (calls / max) * 100 : 0;
      const div = document.createElement('div');
      div.className = 'bar-row';
      div.innerHTML =
        '<span class="label">' + escapeHtml(row.tool_name) + '</span>' +
        '<span class="track"><span class="fill" style="width: 0%"></span></span>' +
        '<span class="num">' + calls.toLocaleString() + '</span>';
      barsEl.appendChild(div);
      // stagger the fill
      setTimeout(() => { div.querySelector('.fill').style.width = pct + '%'; }, 80 + i * 90);
    });

    sCalls.innerHTML = '<em>' + total.toLocaleString() + '</em>';
    sTools.textContent = String(rows.length) + (rows.length === 10 ? '+' : '');
    sTop.innerHTML = '<em style="font-size: 26px; font-style: italic; font-family: var(--mono); letter-spacing: 0;">' + escapeHtml(rows[0].tool_name) + '</em>';

    updEl.textContent = 'fetched ' + new Date().toISOString().slice(11, 19) + 'Z';
  } catch (e) {
    barsEl.innerHTML = '<div class="bar-row"><span class="label" style="color: var(--err);">telemetry fetch failed</span><span class="track"></span><span class="num">—</span></div>';
    updEl.textContent = 'unreachable';
    if (sCalls) sCalls.textContent = '—';
    if (sTools) sTools.textContent = '—';
    if (sTop)   sTop.textContent   = '—';
    console.error('[telemetry]', e);
  }
})();

// ═══════════════════ Smooth scroll for in-page anchors ═══════════════════
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href').slice(1);
  const tgt = document.getElementById(id);
  if (!tgt) return;
  e.preventDefault();
  tgt.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
</script>
</body>
</html>`;

export function homepageResponse(): Response {
  return new Response(HOMEPAGE_HTML, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Brief edge cache — the page is static-ish, but we want updates to roll
      // out within a minute of a deploy.
      "cache-control": "public, max-age=60",
      "x-frame-options": "DENY",
      "referrer-policy": "strict-origin-when-cross-origin",
    },
  });
}

// Serve the homepage with conversation context embedded for a magic-link
// route: `/{ns}/conversations/{alias}?t=...`. The base HTML is unchanged;
// we inject (a) <meta> tags so a model receiving this URL via web_fetch
// has actionable signal that this is a join target and (b) a `window.AMS_JOIN`
// global the homepage JS reads on load to auto-join the existing conversation
// instead of waiting for a Mint click. The injection is purely additive —
// the bare homepage path keeps zero-byte differences from before this change.
export function homepageResponseForConversation(args: {
  magicLink: string;
  namespace: string;
  alias: string;
}): Response {
  // Escape user-derived strings that land in HTML/JS contexts. ns and alias
  // come from URL path segments matched by ^[^/]+$ so they cannot contain
  // slashes, but they CAN contain quotes/<>/& if a caller minted them with
  // unusual characters. Defense in depth: escape all of them.
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const escJs = (s: string) =>
    JSON.stringify(s); // safe for embedding inside <script> as a JS literal

  const safeLink = esc(args.magicLink);
  const safeAlias = esc(args.alias);
  const safeNs = esc(args.namespace);

  // Inject right after <head> — the marker is the literal opening <head> tag
  // followed by a newline that the homepage HTML emits. If the marker isn't
  // found (homepage HTML restructured), we degrade to returning the bare
  // homepage rather than a malformed document.
  const headMarker = "<head>\n";
  const headIdx = HOMEPAGE_HTML.indexOf(headMarker);
  if (headIdx === -1) {
    return homepageResponse();
  }

  const injection = [
    `<meta name="ams:join-target" content="${safeLink}">`,
    `<meta name="ams:conversation-alias" content="${safeAlias}">`,
    `<meta name="ams:namespace" content="${safeNs}">`,
    // Title tag override: a model receiving this via web_fetch reads the
    // title; "AMS · Join conversation azure-ember-2290" is actionable signal
    // that this is not a generic homepage.
    `<title>AMS · Join conversation ${safeAlias}</title>`,
    // The window global the homepage JS reads. Using JSON.stringify for the
    // values means no XSS risk even if a future code path mints aliases with
    // special characters.
    `<script>window.AMS_JOIN = { magic_link: ${escJs(args.magicLink)}, namespace: ${escJs(args.namespace)}, alias: ${escJs(args.alias)} };</script>`,
  ].join("\n");

  // Strip the existing <title>...</title> from the bare homepage so our
  // injected one wins. The bare homepage emits a single <title> on a
  // single line; this regex matches that single-line form.
  let modifiedHtml = HOMEPAGE_HTML.replace(
    /<title>[^<]*<\/title>\n?/,
    "",
  );

  // Re-find headMarker in the title-stripped HTML (offset shifted).
  const newHeadIdx = modifiedHtml.indexOf(headMarker);
  if (newHeadIdx === -1) {
    return homepageResponse();
  }

  modifiedHtml =
    modifiedHtml.slice(0, newHeadIdx + headMarker.length) +
    injection +
    "\n" +
    modifiedHtml.slice(newHeadIdx + headMarker.length);

  return new Response(modifiedHtml, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Conversation-context pages are NOT cacheable — each magic link is
      // unique to a conversation and the injection differs per request.
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      "referrer-policy": "strict-origin-when-cross-origin",
    },
  });
}

export function homepageHeadResponse(): Response {
  return new Response(null, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Brief edge cache — the page is static-ish, but we want updates to roll
      // out within a minute of a deploy.
      "cache-control": "public, max-age=60",
      "x-frame-options": "DENY",
      "referrer-policy": "strict-origin-when-cross-origin",
    },
  });
}
