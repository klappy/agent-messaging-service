#!/usr/bin/env python3
"""
audit-via-agent.py — Dispatch a Managed Agent for the AMS canon-code-sync audit.

Conformance:
  klappy://canon/constraints/audit-gates-are-managed-agents   (Tier-1, klappy.dev)
  ams://canon/constraints/canon-code-sync-via-managed-agent   (AMS adoption)

Inputs (env):
  ANTHROPIC_API_KEY  — required, for the Managed Agents API
  PR_NUMBER          — PR number under audit
  PR_HEAD_SHA        — head SHA of the PR
  PR_HEAD_REF        — head branch name
  PR_BASE_REF        — base branch name (e.g. main)
  REPO_FULL          — owner/name of the repo (e.g. klappy/agent-messaging-service)

Outputs (stdout, machine-readable):
  A single JSON object with shape:
    {"verdict": "PASS"|"FAIL"|"ERROR",
     "comment_body": "<markdown the workflow posts to the PR>",
     "session_id": "<sesn_…>",
     "agent_id":   "<agnt_…>",
     "duration_s": <float>,
     "error":      "<string, only on ERROR>"}

Exit codes:
  0  — JSON written; verdict field carries PASS / FAIL / ERROR.
  2  — fatal pre-dispatch failure (missing env var, API key rejected, etc.).

Architecture choices that matter:
  * Watches the /events stream for a TERMINAL SENTINEL — the agent's final
    message is itself a fenced JSON object, parsed and used directly. No
    marker envelopes, no regex on prose.
  * Does NOT poll session.status. Status flips to 'idle' before the worker
    picks up the dispatched user.message (observed race window 280–500 ms),
    which made the previous workflow exit before the agent ran. Termination
    here is event-shape-driven, not status-driven.
  * The launcher does not encode audit logic. The agent fetches canon at
    runtime via oddkit_get / oddkit_search; this script only carries the
    role, the output contract, and the PR coordinates.
"""

from __future__ import annotations

import base64
import binascii
import json
import os
import sys
import time
import urllib.error
import urllib.request

# ---------------------------------------------------------------- constants --

API_BASE     = "https://api.anthropic.com/v1"
BETA_HEADER  = "managed-agents-2026-04-01"
ENV_ID       = "env_016RffZyqSdHeb5s3Z6UABw8"
MODEL_ID     = "claude-sonnet-4-6"
ODDKIT_URL   = "https://oddkit.klappy.dev/mcp"

# Termination tuning. The agent typically finishes in 1–5 minutes.
POLL_INTERVAL_S = 6     # poll events every 6s
MAX_WAIT_S      = 600   # 10-minute ceiling
SETTLE_S        = 12    # require event count stable for this long after a final agent.message

# ------------------------------------------------------------- system prompt --

SYSTEM_PROMPT = """\
## Identity of Proactive Integrity

Before I speak, I observe. Before I claim, I verify. Before I confirm, I prove.
What I have not seen, I do not know. What I have not verified, I will not imply.

## Foundational Axioms
1. Reality Is Sovereign — observe before asserting.
2. A Claim Is a Debt — every assertion requires evidence. Silence > ungrounded speech.
3. Integrity Is Non-Negotiable Efficiency — a false "done" costs more than an honest "I haven't checked."
4. You Cannot Verify What You Did Not Observe — if you didn't look, you don't know.

## Epistemic Backbone: oddkit
You have access to the oddkit MCP server.
- search before claiming
- get to fetch canonical documents
- catalog to discover what exists
- encode findings as durable records (output does NOT persist — save to file)

## Your Role

You are the canon-code sync auditor for klappy/agent-messaging-service. The
merge gate for governance audits in this repo is a Managed Agent — that is
you — per:

  klappy://canon/constraints/audit-gates-are-managed-agents (your charter)
  ams://canon/constraints/canon-code-sync-via-managed-agent (project adoption)

Your charter forbids the alternative architecture (a hand-rolled regex script
as the merge gate). You replace that script. You exercise LLM-grade judgment
that mechanical pattern matchers cannot. You read prose, recognize equivalence
under renaming, follow supersession chains, and cross-reference adjacent
canon. Do not behave like a regex.

## What You Are Auditing

AMS-specific drift surfaces, in order of importance:

1. Canon ↔ deployment config — does anything in canon/ contradict the actual
   contents of packages/*/wrangler.toml or worker/wrangler.toml on this PR's
   branch?
2. Canon ↔ code — does any constraint, decision, or charter description
   still match the TypeScript implementation in worker/src/ or packages/*/src/
   as of this PR?
3. Cross-canon — do any docs added or edited in this PR contradict adjacent
   canon already on main? Use oddkit_search to find adjacent constraints/
   decisions for each touched concept; oddkit_get to read them; compare claims.
4. Handoffs and writings ↔ shipped reality — if a handoff doc recommends an
   approach, has it since been superseded? Look in journal/ for evidence.
5. Supersession chains — if a doc claims to supersede another, does the other
   carry the matching superseded_by frontmatter?

You are NOT looking for: typos, formatting, prose style, frontmatter schema
violations (a separate structural check handles those). Your job is the
LLM-judgment audit only.

## Output Contract — Final Message Is JSON With base64-Encoded Body

You have NO GitHub credentials and you do NOT post the comment yourself. The
CI workflow extracts your final message and posts the comment to the PR
using its own GITHUB_TOKEN.

YOUR FINAL ASSISTANT MESSAGE MUST BE EXACTLY ONE FENCED JSON BLOCK and
NOTHING ELSE. The workflow's terminal-sentinel parser locates the block,
parses it, decodes the base64 comment body, and posts that markdown
verbatim to the PR.

The fenced block has this exact shape:

```
{
  "verdict": "PASS",
  "summary": "one-line summary for the CI logs",
  "comment_body_b64": "<base64-encoded markdown — no whitespace, single line>"
}
```

Why base64: the comment body is markdown that often contains double-quotes
(e.g. quoting canon prose), and writing those inline inside a JSON string
without escape errors is fragile. Base64 sidesteps this entirely.

How to produce comment_body_b64 reliably: write the markdown to a file
inside your sandbox, then base64-encode it with bash and read the result:

  cat > /tmp/comment.md <<'COMMENT'
  ## Canon-Code Sync Audit (Managed Agent)
  ...your full markdown comment body, ANY content, no escapes needed...
  COMMENT
  base64 -w 0 /tmp/comment.md

Take the single-line base64 output and place it as the value of
`comment_body_b64` in the JSON. Do not wrap it, do not break lines.

Field rules:

- "verdict" MUST be exactly "PASS" or "FAIL".
  - PASS = no substantive findings. Cosmetic items are fine to PASS with.
  - FAIL = at least one substantive finding (canon claims something the
    repo does not; code violates a constraint; handoff recommends a
    superseded approach; broken supersession chain).
- "summary" is a single line for CI logs. Plain text, no markdown.
- "comment_body_b64" is base64 (standard, not URL-safe) of the UTF-8
  markdown the workflow will post verbatim. Include the verdict, the files
  reviewed, the canon documents fetched, the findings (severity / location
  / claim / reality / suggested fix), and any notes. If verdict is PASS
  with no findings, say so plainly inside the comment body.
- Output ONLY the fenced JSON block as your final message. No preamble, no
  closing remarks. The fence is your terminal sentinel.

## How to Operate

1. Clone the public AMS repo unauthenticated. You have no GitHub credentials
   and do not need them — the repo is public:
     git clone --quiet https://github.com/${REPO_FULL}.git /tmp/repo
     cd /tmp/repo
     git fetch --quiet origin pull/${PR_NUMBER}/head:pr
     git checkout --quiet pr
     git diff --name-only origin/${PR_BASE_REF}...HEAD > /tmp/changed.txt
2. For each changed file, decide which kind of audit applies (canon, code,
   config, handoff) and which canon documents are relevant.
3. Use oddkit_search / oddkit_get / oddkit_catalog to fetch applicable canon.
4. For each touched concept, also search adjacent canon — a canon edit often
   has implications for sibling docs that aren't in the PR.
5. Render judgments. Do not flag patterns; flag drift. A `**NEW**` marker is
   meaningless to you; what matters is whether the claim matches reality.
6. Emit your final message as a single fenced JSON block per the contract.
"""

# ------------------------------------------------------------ task template --

TASK_TEMPLATE = """\
Audit klappy/agent-messaging-service PR #{pr_number} for canon ↔ code ↔
deployed-config coherence.

PR context:
  repo:        {repo_full}
  PR number:   {pr_number}
  head branch: {pr_head_ref}
  head SHA:    {pr_head_sha}
  base branch: {pr_base_ref}

Repository: clone the public AMS repo unauthenticated from inside your
sandbox (`git clone https://github.com/{repo_full}.git`). The repo is public
and requires no credentials.

You have NO GitHub credentials, by design. Do not attempt to call the GitHub
API or post a PR comment yourself. The CI workflow will parse your final
message (a single fenced JSON block) and post comment_body to the PR using
the runner's own GITHUB_TOKEN.

Follow the operating procedure in your system prompt:
  1. Clone the public AMS repo, fetch PR head, checkout, diff vs origin/{pr_base_ref}.
  2. Identify applicable canon for each touched surface.
  3. oddkit_search + oddkit_get the relevant canon. Use oddkit_catalog to discover.
  4. Render LLM-grade judgments. Flag drift, not patterns.
  5. Write your full markdown comment to a file in your sandbox, run
     `base64 -w 0` on it via bash, and place the base64 string in
     comment_body_b64 of the final JSON. Output ONLY the fenced JSON block.
     The JSON shape: {{"verdict": "PASS"|"FAIL", "summary": "...", "comment_body_b64": "..."}}

You have ~10 minutes. Be thorough but efficient. Do not re-fetch canon docs
you have already read this session.
"""

# ----------------------------------------------------------- HTTP utilities --

def _api_request(method: str, path: str, *, body: dict | None = None,
                 api_key: str, timeout: float = 30.0) -> tuple[int, dict | None]:
    """Bare urllib request to the Anthropic API. Returns (status, json|None)."""
    url = f"{API_BASE}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("x-api-key", api_key)
    req.add_header("anthropic-version", "2023-06-01")
    req.add_header("anthropic-beta", BETA_HEADER)
    if data is not None:
        req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = resp.read()
            status = resp.status
    except urllib.error.HTTPError as e:
        return e.code, _safe_json(e.read())
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"[warn] transient API error on {method} {path}: {e}", file=sys.stderr)
        return 0, None
    return status, _safe_json(payload)


def _safe_json(b: bytes | None) -> dict | None:
    if not b:
        return None
    try:
        return json.loads(b.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None


# --------------------------------------------------------------- step impls --

def create_agent(api_key: str) -> str:
    """Create the auditor agent. Returns agent id."""
    body = {
        "name":  "ams-canon-code-sync-auditor",
        "model": MODEL_ID,
        "system": SYSTEM_PROMPT,
        "tools": [
            {"type": "agent_toolset_20260401"},
            {"type": "mcp_toolset", "mcp_server_name": "oddkit",
             "default_config": {"permission_policy": {"type": "always_allow"}}},
        ],
        "mcp_servers": [
            {"type": "url", "name": "oddkit", "url": ODDKIT_URL},
        ],
    }
    status, resp = _api_request("POST", "/agents", body=body, api_key=api_key)
    if status != 200 or not resp or "id" not in resp:
        raise RuntimeError(f"create agent failed: HTTP {status} body={resp!r}")
    return resp["id"]


def create_session(api_key: str, agent_id: str, pr_number: str) -> str:
    """Create a session bound to the agent in the reusable cloud env."""
    body = {
        "agent": agent_id,
        "environment_id": ENV_ID,
        "title": f"Canon-code sync audit PR #{pr_number}",
    }
    status, resp = _api_request("POST", "/sessions", body=body, api_key=api_key)
    if status != 200 or not resp or "id" not in resp:
        raise RuntimeError(f"create session failed: HTTP {status} body={resp!r}")
    return resp["id"]


def dispatch_task(api_key: str, session_id: str, task_text: str) -> None:
    body = {
        "events": [
            {"type": "user.message",
             "content": [{"type": "text", "text": task_text}]},
        ],
    }
    status, resp = _api_request(
        "POST", f"/sessions/{session_id}/events", body=body, api_key=api_key
    )
    if status not in (200, 201, 202):
        raise RuntimeError(f"dispatch failed: HTTP {status} body={resp!r}")


def fetch_events(api_key: str, session_id: str) -> list[dict]:
    status, resp = _api_request(
        "GET", f"/sessions/{session_id}/events", api_key=api_key
    )
    if status != 200 or not resp:
        return []
    return resp.get("data", []) or []


# --------------------------------------------- terminal-sentinel extraction --

def _last_agent_message_text(events: list[dict]) -> str | None:
    """Latest agent.message text, or None if not present."""
    for e in reversed(events):
        if e.get("type") != "agent.message":
            continue
        for c in e.get("content", []) or []:
            if c.get("type") == "text" and c.get("text"):
                return c["text"]
    return None


def _last_event_index_after_user(events: list[dict]) -> int:
    """Index of the most recent event AFTER the latest user.message.

    The agent has 'finished' a turn when, since our user.message, an
    agent.message has appeared and the event count holds steady (i.e. no
    further tool_use / message events for SETTLE_S).
    """
    last_user = -1
    for i, e in enumerate(events):
        if e.get("type") == "user.message":
            last_user = i
    return last_user


def _extract_fenced_json(text: str) -> dict | None:
    """Locate a ```json … ``` fence in the agent's final message and parse it.

    Falls back to a generic ``` … ``` fence if no language tag was used.
    Falls back to the largest balanced {…} block if no fence is present.
    Returns the parsed object or None.
    """
    # Preferred: fenced ```json … ```
    for fence_open in ("```json", "```JSON"):
        i = text.rfind(fence_open)
        if i != -1:
            j = text.find("```", i + len(fence_open))
            if j != -1:
                inner = text[i + len(fence_open):j].strip()
                obj = _safe_json(inner.encode("utf-8"))
                if isinstance(obj, dict):
                    return obj
    # Fallback: any ``` … ```
    i = text.rfind("```")
    if i != -1:
        # find the matching opening fence before this one
        j = text.rfind("```", 0, i)
        if j != -1 and j != i:
            inner = text[j + 3:i].strip()
            # strip an optional language tag on the first line
            if "\n" in inner:
                first, rest = inner.split("\n", 1)
                if not first.strip().startswith("{"):
                    inner = rest
            obj = _safe_json(inner.encode("utf-8"))
            if isinstance(obj, dict):
                return obj
    # Final fallback: the longest balanced {…} substring
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        obj = _safe_json(text[start:end + 1].encode("utf-8"))
        if isinstance(obj, dict):
            return obj
    return None


# --------------------------------------------------------------- main loop --

def _normalize_result(parsed: dict) -> dict:
    """Apply the comment_body_b64 → comment_body decode and field defaults.

    Accepts either contract: comment_body_b64 (preferred, robust) OR
    comment_body (legacy, brittle on markdown). Coerces verdict to a known
    value; missing/unrecognized verdicts fail closed to FAIL.
    """
    verdict = str(parsed.get("verdict", "")).upper().strip()
    if verdict not in ("PASS", "FAIL"):
        verdict = "FAIL"

    comment_body = ""
    b64 = parsed.get("comment_body_b64")
    if isinstance(b64, str) and b64.strip():
        try:
            comment_body = base64.b64decode(
                b64.strip(), validate=False
            ).decode("utf-8", errors="replace")
        except (binascii.Error, ValueError) as e:
            comment_body = (
                f"## Canon-Code Sync Audit (Managed Agent)\n\n"
                f"**Verdict:** {verdict}\n\n"
                f"_(comment_body_b64 failed to decode: {e})_"
            )
    elif isinstance(parsed.get("comment_body"), str):
        comment_body = parsed["comment_body"]

    summary = parsed.get("summary", "") if isinstance(parsed.get("summary"), str) else ""
    return {
        "verdict":      verdict,
        "comment_body": comment_body
                        or f"## Canon-Code Sync Audit (Managed Agent)\n\n**Verdict:** {verdict}\n\n(no comment_body emitted)",
        "summary":      summary,
    }


def _has_session_idle(events: list[dict]) -> bool:
    """True if any event of type session.status_idle has appeared."""
    for e in events:
        if e.get("type") == "session.status_idle":
            return True
    return False


def watch_for_terminal_sentinel(api_key: str, session_id: str) -> dict:
    """Poll events. Return the parsed JSON object once one of two terminal
    sentinels has been observed AND the event count has been stable for
    SETTLE_S:

      1. (Preferred) The latest agent.message contains a parseable fenced
         JSON object with a "verdict" field.
      2. (Fallback) A session.status_idle event has appeared. The agent
         has stopped working; we accept whatever we can extract from the
         latest agent.message (or fail closed if nothing extractable).

    The fallback exists because LLMs sometimes emit JSON with unescaped
    internal quotes (markdown content with double-quotes inside a JSON
    string). When that happens, _extract_fenced_json returns None and the
    primary sentinel never fires. In that case the session does still go
    idle, and we must terminate.

    Raises RuntimeError on timeout.
    """
    started = time.time()
    last_event_count = -1
    last_change_at   = started
    last_status_log  = 0.0

    while time.time() - started < MAX_WAIT_S:
        events = fetch_events(api_key, session_id)
        n = len(events)

        if n != last_event_count:
            last_event_count = n
            last_change_at = time.time()

        # Periodic progress to CI logs.
        if time.time() - last_status_log > 30:
            elapsed = int(time.time() - started)
            last_kind = events[-1].get("type", "?") if events else "(none)"
            print(f"[watch] elapsed={elapsed}s events={n} last={last_kind}",
                  file=sys.stderr)
            last_status_log = time.time()

        last_user_idx = _last_event_index_after_user(events)
        has_agent_after_user = last_user_idx >= 0 and any(
            e.get("type") == "agent.message"
            for e in events[last_user_idx + 1:]
        )
        idle_seen = _has_session_idle(events)
        settled  = (time.time() - last_change_at) >= SETTLE_S

        if has_agent_after_user and settled:
            text = _last_agent_message_text(events)

            # Primary sentinel: parseable JSON with verdict field.
            if text:
                obj = _extract_fenced_json(text)
                if isinstance(obj, dict) and "verdict" in obj:
                    return obj

            # Fallback sentinel: session is idle, settled, and we cannot
            # parse JSON. Surface what we have so the caller can fail-closed
            # with a useful comment for the operator.
            if idle_seen:
                return {
                    "verdict": "FAIL",
                    "summary": "agent finished but emitted no parseable JSON verdict",
                    "comment_body": (
                        "## Canon-Code Sync Audit (Managed Agent)\n\n"
                        "**Verdict:** FAIL (no parseable JSON)\n\n"
                        "The auditor agent reached `session.status_idle` "
                        "without emitting a fenced JSON block matching the "
                        "output contract. The most common cause is markdown "
                        "content with internal double-quotes inside a JSON "
                        "string — the agent forgot to base64-encode the "
                        "comment body per the contract.\n\n"
                        f"Session for manual inspection: `{session_id}`. "
                        f"Final agent message text length: {len(text or '')} chars."
                    ),
                }

        time.sleep(POLL_INTERVAL_S)

    raise RuntimeError(
        f"timeout: no terminal sentinel within {MAX_WAIT_S}s "
        f"(events={last_event_count}, session={session_id})"
    )


# --------------------------------------------------------------------- main --

def _require_env(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        print(f"::error::missing required env: {name}", file=sys.stderr)
        sys.exit(2)
    return v


def main() -> int:
    api_key      = _require_env("ANTHROPIC_API_KEY")
    pr_number    = _require_env("PR_NUMBER")
    pr_head_sha  = _require_env("PR_HEAD_SHA")
    pr_head_ref  = _require_env("PR_HEAD_REF")
    pr_base_ref  = _require_env("PR_BASE_REF")
    repo_full    = _require_env("REPO_FULL")

    started = time.time()
    agent_id = ""
    session_id = ""

    try:
        agent_id = create_agent(api_key)
        print(f"[step] agent={agent_id}", file=sys.stderr)

        session_id = create_session(api_key, agent_id, pr_number)
        print(f"[step] session={session_id}", file=sys.stderr)

        task = TASK_TEMPLATE.format(
            pr_number=pr_number, pr_head_sha=pr_head_sha,
            pr_head_ref=pr_head_ref, pr_base_ref=pr_base_ref,
            repo_full=repo_full,
        )
        dispatch_task(api_key, session_id, task)
        print("[step] task dispatched", file=sys.stderr)

        result = watch_for_terminal_sentinel(api_key, session_id)

    except Exception as e:  # noqa: BLE001 — top-level catch is intentional
        duration = time.time() - started
        out = {
            "verdict":      "ERROR",
            "comment_body": (
                "## Canon-Code Sync Audit (Managed Agent)\n\n"
                "**Verdict:** ERROR\n\n"
                f"The auditor dispatcher failed before producing a verdict:\n\n"
                f"```\n{e}\n```\n\n"
                f"Session for manual inspection: `{session_id or '(not created)'}`."
            ),
            "session_id":   session_id,
            "agent_id":     agent_id,
            "duration_s":   round(duration, 2),
            "error":        str(e),
        }
        print(json.dumps(out))
        return 0  # workflow inspects verdict; non-2 exit is reserved for fatal pre-dispatch

    # Normal path: hand the agent's structured output back, plus dispatcher metadata.
    duration = time.time() - started
    norm = _normalize_result(result)
    out = {
        "verdict":      norm["verdict"],
        "comment_body": norm["comment_body"],
        "summary":      norm["summary"],
        "session_id":   session_id,
        "agent_id":     agent_id,
        "duration_s":   round(duration, 2),
    }
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
