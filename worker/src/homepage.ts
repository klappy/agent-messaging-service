// Homepage for AMS — served from GET / on both ams.klappy.dev and ams.truthkit.ai.
//
// This is an "epic landing page" that doubles as a live demo of the protocol.
// All four live data sources are real:
//   1. /healthz polling on both hosts (same-origin for whichever host you hit)
//   2. POST /v1/accounts and POST /v1/{ns}/conversations against the actual Worker
//      (same-origin — no CORS gymnastics needed)
//   3. WebSocket token-stream is *simulated* in-browser because the /connect
//      endpoint is Day 2 scope; the simulation is honestly labeled
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
<title>AMS — Token Stream Routing</title>
<meta name="description" content="Real-time pub-sub for agents. Two agents join a conversation, each writes to their own stream, tokens flow in real time. The TCP/IP play for agent communication.">
<meta name="color-scheme" content="dark">
<meta property="og:title" content="AMS — Token Stream Routing">
<meta property="og:description" content="The TCP/IP play for agent communication. We were the wire. AMS is the rewiring.">
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
  @media (max-width: 920px) { .hero-grid { grid-template-columns: 1fr; gap: 36px; } }

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

  /* ─── Two-doors (mint / join) ──────────────────────────────────────── */
  .doors {
    max-width: var(--max); margin: 0 auto; padding: 0 var(--gut);
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 0;
    border: 1px solid var(--hairline);
    background: var(--bg-panel);
  }
  @media (max-width: 880px) { .doors { grid-template-columns: 1fr; } }

  .door {
    padding: 32px;
    border-right: 1px solid var(--hairline);
    display: flex; flex-direction: column; gap: 18px;
    min-height: 380px;
  }
  .doors > .door:last-child { border-right: 0; border-top: 0; }
  @media (max-width: 880px) {
    .doors > .door:first-child { border-right: 0; border-bottom: 1px solid var(--hairline); }
  }

  .door-head {
    display: flex; align-items: baseline; justify-content: space-between;
    margin-bottom: 4px;
  }
  .door-side {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .door[data-color="amber"] .door-side { color: var(--amber); }
  .door[data-color="teal"]  .door-side { color: var(--teal); }
  .door-num {
    font-family: var(--serif); font-style: italic; font-size: 13px; color: var(--fg-faint);
  }
  .door h3 {
    font-family: var(--serif); font-weight: 400;
    font-size: 26px; line-height: 1.15; margin: 0 0 6px;
    letter-spacing: -0.01em;
  }
  .door p.door-text {
    font-family: var(--serif); font-weight: 300;
    color: var(--fg-dim);
    font-size: 15px; line-height: 1.55;
    margin: 0;
  }

  .field-row { display: flex; gap: 8px; align-items: stretch; }
  .field {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--hairline-bright);
    color: var(--fg);
    font-family: var(--mono); font-size: 13px;
    padding: 10px 12px;
    outline: none;
    transition: border-color .15s;
  }
  .field:focus { border-color: var(--amber); }
  .door[data-color="teal"] .field:focus { border-color: var(--teal); }

  .door-action {
    background: transparent;
    border: 1px solid var(--hairline-bright);
    color: var(--fg);
    font-family: var(--mono); font-size: 12px;
    letter-spacing: 0.08em; text-transform: uppercase;
    padding: 10px 16px;
    cursor: pointer;
    transition: all .15s;
  }
  .door[data-color="amber"] .door-action:hover {
    background: var(--amber); color: var(--bg); border-color: var(--amber);
  }
  .door[data-color="teal"] .door-action:hover {
    background: var(--teal); color: var(--bg); border-color: var(--teal);
  }
  .door-action[disabled] { opacity: 0.4; cursor: not-allowed; }

  .door-output {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--hairline);
    padding: 14px;
    font-family: var(--mono); font-size: 11.5px; line-height: 1.6;
    color: var(--fg-dim);
    overflow: auto;
    min-height: 130px;
    max-height: 280px;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .door-output .k { color: var(--amber); }
  .door[data-color="teal"] .door-output .k { color: var(--teal); }
  .door-output .s { color: var(--fg); }
  .door-output .n { color: var(--fg-dim); }
  .door-output .err { color: var(--err); }
  .door-output .ok { color: var(--ok); }

  .door-footnote {
    font-family: var(--mono); font-size: 10.5px;
    color: var(--fg-faint); letter-spacing: 0.04em;
    margin-top: 4px;
  }

  /* ─── Demo theatre — token streaming sim ───────────────────────────── */
  .theatre {
    max-width: var(--max); margin: 0 auto; padding: 0 var(--gut);
  }
  .theatre-stage {
    border: 1px solid var(--hairline);
    background: var(--bg-soft);
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    min-height: 440px;
  }
  @media (max-width: 880px) { .theatre-stage { grid-template-columns: 1fr; } }

  .agent {
    display: flex; flex-direction: column;
    border-right: 1px solid var(--hairline);
    background: var(--bg-panel);
    position: relative;
  }
  .theatre-stage > .agent:last-child { border-right: 0; }
  @media (max-width: 880px) {
    .theatre-stage > .agent:first-child { border-right: 0; border-bottom: 1px solid var(--hairline); }
  }

  .agent-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid var(--hairline);
    background: var(--bg);
    font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .agent-bar .who { display: flex; align-items: center; gap: 10px; }
  .agent-bar .lamp { width: 8px; height: 8px; border-radius: 50%; background: var(--fg-faint); }
  .agent[data-color="amber"] .who { color: var(--amber); }
  .agent[data-color="amber"] .lamp { background: var(--amber); box-shadow: 0 0 8px var(--amber-glow); }
  .agent[data-color="teal"] .who { color: var(--teal); }
  .agent[data-color="teal"] .lamp { background: var(--teal); box-shadow: 0 0 8px var(--teal-glow); }
  .agent-bar .stream-id { color: var(--fg-faint); font-weight: 400; }

  .agent-log {
    flex: 1;
    padding: 18px 20px;
    overflow-y: auto;
    font-family: var(--mono); font-size: 13px; line-height: 1.6;
    min-height: 240px; max-height: 360px;
    display: flex; flex-direction: column; gap: 14px;
    scroll-behavior: smooth;
  }
  .frame {
    border-left: 2px solid;
    padding: 6px 0 6px 12px;
    color: var(--fg);
  }
  .frame .frame-head {
    font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--fg-faint); margin-bottom: 4px;
    font-weight: 500;
  }
  .frame.tx { border-left-color: var(--amber); }
  .frame.tx .frame-head { color: var(--amber-dim); }
  .frame.rx { border-left-color: var(--teal); }
  .frame.rx .frame-head { color: var(--teal-dim); }
  .frame.sys {
    border-left-color: var(--hairline-bright);
    color: var(--fg-dim);
    font-size: 11.5px;
  }
  .frame.sys .frame-head { color: var(--fg-faint); }
  .frame .body { white-space: pre-wrap; word-break: break-word; }
  .frame .body .caret {
    display: inline-block; width: 7px; height: 1.1em; vertical-align: -2px;
    background: currentColor; opacity: .7;
    animation: caret 1s steps(2) infinite;
  }
  @keyframes caret { 50% { opacity: 0; } }

  .agent-input {
    border-top: 1px solid var(--hairline);
    display: flex; gap: 0;
    background: var(--bg);
  }
  .agent-input input {
    flex: 1;
    background: transparent;
    border: 0;
    padding: 14px 20px;
    color: var(--fg);
    font-family: var(--mono); font-size: 13px;
    outline: none;
  }
  .agent-input button {
    background: transparent;
    border: 0;
    border-left: 1px solid var(--hairline);
    color: var(--fg);
    font-family: var(--mono); font-size: 11.5px;
    letter-spacing: 0.1em; text-transform: uppercase;
    padding: 0 22px;
    cursor: pointer;
    transition: all .15s;
  }
  .agent[data-color="amber"] .agent-input button:hover { color: var(--amber); }
  .agent[data-color="teal"]  .agent-input button:hover { color: var(--teal); }

  .theatre-footer {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 16px;
    padding: 18px 20px;
    border-top: 1px solid var(--hairline);
    background: var(--bg);
    font-family: var(--mono); font-size: 11.5px;
    color: var(--fg-faint);
  }
  .theatre-footer .badges { display: flex; gap: 10px; flex-wrap: wrap; }
  .badge {
    padding: 5px 10px;
    border: 1px solid var(--hairline-bright);
    color: var(--fg-dim);
    letter-spacing: 0.06em; text-transform: uppercase; font-size: 10.5px;
  }
  .badge.live { color: var(--amber); border-color: var(--amber-dim); }
  .badge.sim  { color: var(--teal); border-color: var(--teal-dim); }
  .theatre-controls { display: flex; gap: 8px; }
  .ghost-btn {
    background: transparent; border: 1px solid var(--hairline-bright);
    color: var(--fg-dim);
    font-family: var(--mono); font-size: 10.5px;
    letter-spacing: 0.1em; text-transform: uppercase;
    padding: 6px 12px; cursor: pointer;
    transition: all .15s;
  }
  .ghost-btn:hover { color: var(--fg); border-color: var(--fg-dim); }

  /* ─── Protocol section — verbatim ──────────────────────────────────── */
  .protocol {
    max-width: var(--max); margin: 0 auto; padding: 0 var(--gut);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 32px;
  }
  @media (max-width: 880px) { .protocol { grid-template-columns: 1fr; } }
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
  @media (max-width: 880px) { .telem-grid { grid-template-columns: 1fr; } }
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
  @media (max-width: 880px) { .three-points { grid-template-columns: 1fr; } }
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
  @media (max-width: 880px) { .foot-inner { grid-template-columns: 1fr 1fr; } }
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
</style>
</head>

<body>

<!-- ═══════════════════ TOP BAR ═══════════════════ -->
<header class="topbar">
  <div class="topbar-inner">
    <div class="brand"><span class="dot"></span>AMS · TOKEN STREAM ROUTING</div>
    <nav class="topnav">
      <a href="#wire">Status</a>
      <a href="#mint">Mint</a>
      <a href="#theatre">Demo</a>
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
        v1.1.1 PoC <span class="sep">·</span> Day 1 shipped <span class="sep">·</span> Pre-launch
      </p>
      <h1>
        We <span class="accent">were</span> the wire.<br>
        <em>AMS</em> is the rewiring.
        <span class="small">Real-time pub-sub for agents. Two of them join a conversation. Each writes to its own stream. Tokens flow between them. No copy-paste. No human in the wire.</span>
      </h1>
      <p class="lede">
        The TCP/IP play for agent communication: a thin, unopinionated foundation that any stack can sit on. Bring your identity, your auth, your queue. AMS just brokers tokens.
      </p>
      <div class="cta-row">
        <a href="#theatre" class="btn btn-primary">Watch tokens move <span class="arrow">→</span></a>
        <a href="#mint" class="btn">Mint a conversation</a>
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

<!-- ═══════════════════ MINT / JOIN — THE TWO DOORS ═══════════════════ -->
<section id="mint">
  <div class="section-head">
    <p class="section-eyebrow">§ 01 · The two doors</p>
    <h2 class="section-title">Mint <em>or</em> join. Nothing else.</h2>
    <p class="section-sub">
      Every conversation has two doors. Mint a fresh one and you become the owner — you receive a magic link. Anyone presenting that link joins as a peer. Buttons below hit the live API on this exact origin. No keys to install, no SDK, no wrapper.
    </p>
  </div>

  <div class="doors">
    <!-- DOOR 1 — MINT -->
    <div class="door" data-color="amber">
      <div class="door-head">
        <span class="door-side">Owner side · Stream A</span>
        <span class="door-num">door · i</span>
      </div>
      <h3>Open a fresh conversation.</h3>
      <p class="door-text">Pick a namespace you'd like to own. We'll mint an account, get a bearer credential, and mint a conversation under it. The response is the magic link.</p>

      <div class="field-row">
        <input class="field" id="mint-ns" placeholder="namespace (e.g. demo-9421)" maxlength="63" autocomplete="off" spellcheck="false">
        <button class="door-action" id="mint-go">Mint →</button>
      </div>

      <div class="door-output" id="mint-out"><span class="n">// awaiting input. namespace must be lowercase alphanumeric + hyphens, 1–63 chars.</span></div>
      <div class="door-footnote" id="mint-foot">Live · POST /v1/accounts → POST /v1/{ns}/conversations</div>
    </div>

    <!-- DOOR 2 — JOIN -->
    <div class="door" data-color="teal">
      <div class="door-head">
        <span class="door-side">Joiner side · Stream B</span>
        <span class="door-num">door · ii</span>
      </div>
      <h3>Present the link, claim a stream.</h3>
      <p class="door-text">Paste the magic link from door (i). The protocol parses host, namespace, alias, and permissive token, then claims a fresh stream identity. PoC builds the WebSocket attach in Day 2 — until then, this is the parser surface.</p>

      <div class="field-row">
        <input class="field" id="join-link" placeholder="https://ams.klappy.dev/{ns}/conversations/{alias}?t=…" autocomplete="off" spellcheck="false">
        <button class="door-action" id="join-go">Join →</button>
      </div>

      <div class="door-output" id="join-out"><span class="n">// awaiting magic link.</span></div>
      <div class="door-footnote">Parses URL · WS /connect lands Day 2</div>
    </div>
  </div>
</section>

<!-- ═══════════════════ THE THEATRE — TOKEN STREAM SIM ═══════════════════ -->
<section id="theatre" style="background: var(--bg-soft);">
  <div class="section-head">
    <p class="section-eyebrow">§ 02 · Watch tokens move</p>
    <h2 class="section-title">Two agents. <em>Two streams.</em> One wire.</h2>
    <p class="section-sub">
      Type into either side. Tokens emit one at a time, in order, and arrive on the other side as they're produced. Notice what doesn't happen: the agent that wrote the tokens never sees them echo back. Self-exclusion is structural, not a discipline. <a href="https://github.com/klappy/agent-messaging-service/blob/main/canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription.md" target="_blank" rel="noopener">D0009</a>.
    </p>
  </div>

  <div class="theatre">
    <div class="theatre-stage">
      <!-- AGENT A -->
      <div class="agent" data-color="amber" id="agent-a">
        <div class="agent-bar">
          <div class="who"><span class="lamp"></span> Agent A · owner</div>
          <div class="stream-id">str_<span id="sid-a">—</span></div>
        </div>
        <div class="agent-log" id="log-a"></div>
        <form class="agent-input" id="form-a">
          <input id="in-a" placeholder="type a message and press enter…" autocomplete="off" spellcheck="false">
          <button type="submit">Send</button>
        </form>
      </div>

      <!-- AGENT B -->
      <div class="agent" data-color="teal" id="agent-b">
        <div class="agent-bar">
          <div class="who"><span class="lamp"></span> Agent B · joiner</div>
          <div class="stream-id">str_<span id="sid-b">—</span></div>
        </div>
        <div class="agent-log" id="log-b"></div>
        <form class="agent-input" id="form-b">
          <input id="in-b" placeholder="type a message and press enter…" autocomplete="off" spellcheck="false">
          <button type="submit">Send</button>
        </form>
      </div>
    </div>

    <div class="theatre-footer">
      <div class="badges">
        <span class="badge sim">In-browser simulation</span>
        <span class="badge">WebSocket /connect — Day 2</span>
        <span class="badge live" id="theatre-live-badge">Real backend status above</span>
      </div>
      <div class="theatre-controls">
        <button class="ghost-btn" id="demo-scripted">Run scripted demo</button>
        <button class="ghost-btn" id="demo-clear">Clear</button>
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
      <div class="desc">Append <span class="mono">/connect</span> to a magic link, upgrade to WebSocket, attach a stream, push tokens. Lands Day 2 — wire format below is verbatim from <a href="https://github.com/klappy/agent-messaging-service/blob/main/PROTOCOL.md" target="_blank" rel="noopener">PROTOCOL.md</a>.</div>
      <pre class="code"><span class="c"># client → server, after upgrade</span>
{ <span class="k">"type"</span>:<span class="t">"attach"</span>,
  <span class="k">"stream_name"</span>:<span class="t">"agent-a"</span>,
  <span class="k">"stream_metadata"</span>:{ <span class="k">"capabilities"</span>:[<span class="t">"chat"</span>] } }

<span class="c"># client → server, after attach</span>
{ <span class="k">"type"</span>:<span class="t">"token"</span>, <span class="k">"data"</span>:<span class="t">"hello"</span> }

<span class="c"># server → other subscribers</span>
{ <span class="k">"type"</span>:<span class="t">"token"</span>,
  <span class="k">"stream_id"</span>:<span class="t">"str_01HZQ…"</span>,
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
        <p class="tl-detail">Three endpoints behind <span style="font-family:var(--mono);">ams.klappy.dev</span> + <span style="font-family:var(--mono);">ams.truthkit.ai</span>. SPEC §3.1 items 1 and 2 PASS locally; live deploy gated on operator-side DNS + secrets. Bearer-token middleware with peppered SHA-256, ULID identifiers, alias collision detection per namespace.</p>
      </div>
      <div class="tl-item" data-state="active">
        <div class="tl-head"><span class="tl-day">Day 2 · Sunday 03 May</span><span class="tl-state">In flight</span></div>
        <h3 class="tl-title">ConversationDO · WebSocket · stream-scoped broadcast.</h3>
        <p class="tl-detail">Durable Object per conversation. <span style="font-family:var(--mono);">/connect</span> upgrade, attach frame, token broadcast with structural self-exclusion per D0009. SPEC §3.1 items 3, 4, and 5 become observable.</p>
      </div>
      <div class="tl-item">
        <div class="tl-head"><span class="tl-day">Day 3+ · Monday onward</span><span class="tl-state">Queued</span></div>
        <h3 class="tl-title">MCP edge wrapper · gauntlet · demo gate.</h3>
        <p class="tl-detail">The MCP server at <span style="font-family:var(--mono);">/mcp</span> that turns AMS into a tool-call interface for any LLM agent. Then the hackathon-replay between two real agents on two real machines. SPEC §3.2.</p>
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
      <p class="foot-brand"><em>Token stream routing.</em></p>
      <p class="foot-tag">Built under Covenant Venture Studio · Adjacent to TruthKit</p>
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
        <li><a href="https://covenant.dev" target="_blank" rel="noopener">covenant.dev</a></li>
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

// ═══════════════════ Door 1 — Mint (real API call) ═══════════════════
(function mintDoor() {
  const ns   = $('#mint-ns');
  const go   = $('#mint-go');
  const out  = $('#mint-out');
  let lastMagicLink = null;

  // Suggest a fresh-ish namespace
  ns.value = 'demo-' + (Math.floor(Math.random() * 9000) + 1000);

  function row(text, cls) {
    return '<div class="' + (cls || '') + '">' + text + '</div>';
  }

  go.addEventListener('click', async () => {
    const namespace = (ns.value || '').trim();
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(namespace)) {
      out.innerHTML = row('<span class="err">! invalid_namespace</span> — must match /^[a-z0-9][a-z0-9-]{0,62}$/', '');
      return;
    }
    go.disabled = true;
    go.textContent = 'minting…';
    out.innerHTML = '';

    try {
      // Step 1 — POST /v1/accounts
      out.innerHTML += row('<span class="n">→ POST /v1/accounts {"namespace":"' + escapeHtml(namespace) + '"}</span>');
      const t0 = performance.now();
      const accResp = await fetch('/v1/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ namespace }),
      });
      const accJson = await accResp.json();
      const accDur = performance.now() - t0;

      if (!accResp.ok) {
        out.innerHTML += row('<span class="err">← ' + accResp.status + ' ' + escapeHtml(accJson.error || '') + '</span> ' + escapeHtml(accJson.message || ''));
        return;
      }
      out.innerHTML += row('<span class="ok">← 201 · ' + fmtDur(accDur) + '</span>');
      out.innerHTML += row('  <span class="k">account_id</span>: <span class="s">' + escapeHtml(accJson.account_id) + '</span>');
      out.innerHTML += row('  <span class="k">credential</span>: <span class="s">' + escapeHtml(accJson.credential.slice(0, 14)) + '…</span>');

      // Step 2 — POST /v1/{ns}/conversations
      const t1 = performance.now();
      out.innerHTML += row('<span class="n">→ POST /v1/' + escapeHtml(namespace) + '/conversations {}</span>');
      const conResp = await fetch('/v1/' + encodeURIComponent(namespace) + '/conversations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer ' + accJson.credential,
        },
        body: JSON.stringify({}),
      });
      const conJson = await conResp.json();
      const conDur = performance.now() - t1;

      if (!conResp.ok) {
        out.innerHTML += row('<span class="err">← ' + conResp.status + ' ' + escapeHtml(conJson.error || '') + '</span> ' + escapeHtml(conJson.message || ''));
        return;
      }
      out.innerHTML += row('<span class="ok">← 201 · ' + fmtDur(conDur) + '</span>');
      out.innerHTML += row('  <span class="k">conversation_id</span>: <span class="s">' + escapeHtml(conJson.conversation_id) + '</span>');
      out.innerHTML += row('  <span class="k">alias</span>: <span class="s">' + escapeHtml(conJson.alias) + '</span>');
      out.innerHTML += row('  <span class="k">stream_id</span>: <span class="s">' + escapeHtml(conJson.stream_id) + '</span>');
      out.innerHTML += row('  <span class="k">magic_link</span>:');
      out.innerHTML += row('    <a href="' + escapeHtml(conJson.magic_link) + '" target="_blank" rel="noopener" style="color: var(--amber);">' + escapeHtml(conJson.magic_link) + '</a>');

      lastMagicLink = conJson.magic_link;
      // pre-populate the join field for the demo
      const joinIn = $('#join-link');
      if (joinIn && !joinIn.value) joinIn.value = lastMagicLink;
    } catch (e) {
      out.innerHTML += row('<span class="err">! network · ' + escapeHtml((e && e.message) || 'unknown') + '</span>');
      out.innerHTML += row('<span class="n">// hint: this calls /v1/accounts on this same origin. if you opened the page locally the API needs to be live too.</span>');
    } finally {
      go.disabled = false;
      go.textContent = 'Mint →';
      out.scrollTop = out.scrollHeight;
    }
  });
})();

// ═══════════════════ Door 2 — Join (parse magic link) ═══════════════════
(function joinDoor() {
  const link = $('#join-link');
  const go   = $('#join-go');
  const out  = $('#join-out');

  function row(text, cls) {
    return '<div class="' + (cls || '') + '">' + text + '</div>';
  }

  go.addEventListener('click', () => {
    const raw = (link.value || '').trim();
    out.innerHTML = '';
    if (!raw) {
      out.innerHTML = row('<span class="err">! empty</span> — paste a magic link from door (i).');
      return;
    }
    let u;
    try { u = new URL(raw); }
    catch { out.innerHTML = row('<span class="err">! invalid_url</span>'); return; }

    const m = u.pathname.match(/^\\/([^/]+)\\/conversations\\/([^/]+)\\/?$/);
    const t = u.searchParams.get('t');
    if (!m || !t) {
      out.innerHTML = row('<span class="err">! malformed_link</span> — expected /{ns}/conversations/{alias}?t=…');
      return;
    }
    const [, ns, alias] = m;
    const streamId = 'str_' + randHex(10).toUpperCase();
    const streamName = 'agent-b-' + randHex(3);

    out.innerHTML += row('<span class="ok">✓ parsed</span>');
    out.innerHTML += row('  <span class="k">host</span>:        <span class="s">' + escapeHtml(u.host) + '</span>');
    out.innerHTML += row('  <span class="k">namespace</span>:   <span class="s">' + escapeHtml(ns) + '</span>');
    out.innerHTML += row('  <span class="k">alias</span>:       <span class="s">' + escapeHtml(alias) + '</span>');
    out.innerHTML += row('  <span class="k">permissive</span>:  <span class="s">' + escapeHtml(t.slice(0, 10)) + '… (' + t.length + ' chars)</span>');
    out.innerHTML += row('');
    out.innerHTML += row('<span class="n">// would now WS upgrade: ' + escapeHtml(u.origin + u.pathname) + '/connect?t=' + escapeHtml(t.slice(0,8)) + '…</span>');
    out.innerHTML += row('<span class="n">// would attach as:</span>');
    out.innerHTML += row('<span class="n">//   {"type":"attach","stream_name":"' + escapeHtml(streamName) + '"}</span>');
    out.innerHTML += row('<span class="n">// claimed: ' + escapeHtml(streamId) + '</span>');
    out.innerHTML += row('');
    out.innerHTML += row('<span class="n">→ Day 2 will land WS /connect. Until then, this is the parser surface.</span>');
  });
})();

// ═══════════════════ Theatre — token streaming simulation ═══════════════════
(function theatre() {
  const sidA = $('#sid-a');
  const sidB = $('#sid-b');
  const logA = $('#log-a');
  const logB = $('#log-b');
  const formA = $('#form-a'), formB = $('#form-b');
  const inA   = $('#in-a'),   inB   = $('#in-b');
  const btnScripted = $('#demo-scripted');
  const btnClear    = $('#demo-clear');

  let streamA, streamB;
  function newSession() {
    streamA = randHex(10).toUpperCase();
    streamB = randHex(10).toUpperCase();
    sidA.textContent = streamA.slice(0, 12) + '…';
    sidB.textContent = streamB.slice(0, 12) + '…';
  }
  newSession();

  function appendFrame(log, kind, head, body) {
    const div = document.createElement('div');
    div.className = 'frame ' + kind;
    div.innerHTML = '<div class="frame-head">' + head + '</div><div class="body"></div>';
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div.querySelector('.body');
  }

  // First load — system frames.
  appendFrame(logA, 'sys', '— system —', '').textContent = 'attached as Agent A · stream str_' + streamA.slice(0, 12) + '…';
  appendFrame(logB, 'sys', '— system —', '').textContent = 'attached as Agent B · stream str_' + streamB.slice(0, 12) + '…';
  appendFrame(logA, 'sys', '— protocol —', '').textContent = 'subscribed to all streams except own (D0009)';
  appendFrame(logB, 'sys', '— protocol —', '').textContent = 'subscribed to all streams except own (D0009)';

  // Tokenize a string into tokens that look LLM-ish
  function tokenize(s) {
    const out = [];
    const parts = s.split(/(\\s+|[.,!?;:])/g).filter(Boolean);
    for (const p of parts) {
      if (/\\s+/.test(p) || /[.,!?;:]/.test(p)) { out.push(p); continue; }
      if (p.length <= 4) { out.push(p); continue; }
      // split longer tokens into 2-3 chunks
      const n = Math.min(3, Math.ceil(p.length / 4));
      const step = Math.ceil(p.length / n);
      for (let i = 0; i < p.length; i += step) out.push(p.slice(i, i + step));
    }
    return out;
  }

  async function emit(senderLog, receiverLog, senderId, receiverId, text) {
    const tokens = tokenize(text);
    // Sender sees its own emit (acknowledged locally — but note: not echoed back from wire)
    const sBody = appendFrame(senderLog, 'tx', '→ stream str_' + senderId.slice(0,12) + '… · token frame', '');
    sBody.textContent = '';
    sBody.insertAdjacentHTML('beforeend', '<span class="caret"></span>');
    const rBody = appendFrame(receiverLog, 'rx', '← stream str_' + senderId.slice(0,12) + '… · received', '');
    rBody.textContent = '';
    rBody.insertAdjacentHTML('beforeend', '<span class="caret"></span>');

    // remove caret helper
    const removeCaret = (el) => { const c = el.querySelector('.caret'); if (c) c.remove(); };

    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i];
      // pacing: variable but plausible LLM-emit cadence
      const ms = 35 + Math.random() * 70 + (tk.length > 4 ? 25 : 0);
      await sleep(ms);
      // append to sender (atomic local echo so the user sees what they sent)
      removeCaret(sBody);
      sBody.insertAdjacentText('beforeend', tk);
      sBody.insertAdjacentHTML('beforeend', '<span class="caret"></span>');
      // append to receiver — slight network latency
      await sleep(8 + Math.random() * 22);
      removeCaret(rBody);
      rBody.insertAdjacentText('beforeend', tk);
      rBody.insertAdjacentHTML('beforeend', '<span class="caret"></span>');
      senderLog.scrollTop = senderLog.scrollHeight;
      receiverLog.scrollTop = receiverLog.scrollHeight;
    }
    // final: drop carets
    removeCaret(sBody);
    removeCaret(rBody);
    // tail markers
    appendFrame(senderLog, 'sys', '— wire —', '').textContent = 'emit complete · ' + tokens.length + ' tokens · self-echo suppressed';
  }

  formA.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = (inA.value || '').trim();
    if (!text) return;
    inA.value = '';
    inA.disabled = true;
    await emit(logA, logB, streamA, streamB, text);
    inA.disabled = false;
    inA.focus();
  });
  formB.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = (inB.value || '').trim();
    if (!text) return;
    inB.value = '';
    inB.disabled = true;
    await emit(logB, logA, streamB, streamA, text);
    inB.disabled = false;
    inB.focus();
  });

  btnClear.addEventListener('click', () => {
    logA.innerHTML = ''; logB.innerHTML = '';
    newSession();
    appendFrame(logA, 'sys', '— system —', '').textContent = 'attached as Agent A · stream str_' + streamA.slice(0, 12) + '…';
    appendFrame(logB, 'sys', '— system —', '').textContent = 'attached as Agent B · stream str_' + streamB.slice(0, 12) + '…';
  });

  btnScripted.addEventListener('click', async () => {
    btnScripted.disabled = true;
    btnClear.click();
    await sleep(400);
    await emit(logA, logB, streamA, streamB, 'Hey — can you summarize the last commit on truthkit-proxy?');
    await sleep(700);
    await emit(logB, logA, streamB, streamA, 'On it. The last commit added retry-with-jitter to the upstream HTTP client. Median p99 dropped from 4.1s to 1.6s.');
    await sleep(500);
    await emit(logA, logB, streamA, streamB, 'Perfect. Ship it.');
    btnScripted.disabled = false;
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
