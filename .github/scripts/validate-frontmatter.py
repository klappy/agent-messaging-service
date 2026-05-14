#!/usr/bin/env python3
"""Validate YAML frontmatter on changed canon/writings markdown files.

Reads a list of changed file paths from argv[1] (one per line) and, for
each path that matches canon/**/*.md or writings/**/*.md:

  - Extracts the frontmatter block between the opening `---` and the
    next `---` on its own line.
  - Asserts the block parses cleanly as YAML.
  - Asserts the required keys are present: uri, title, status.
  - Asserts uri starts with `ams://` or `klappy://` (URI scheme sanity).

This is the mechanical smoke check. It does NOT verify URI resolution,
claim coherence, or canon-code drift — those are the expensive probes'
jobs. The point here is to catch broken YAML cheaply so the Claude-
driven probes don't spend money on PRs that fail at the parse layer.

Usage:
  python3 validate-frontmatter.py /tmp/changed.txt

Exit codes:
  0 — all checked files pass (or no in-scope files in the diff)
  1 — at least one file failed validation

The script never raises uncaught exceptions; every failure mode is
converted to a structured error line on stderr so the GitHub Actions
log is grep-able.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print(
        "::error::pyyaml not installed; the smoke job must install it before running this script.",
        file=sys.stderr,
    )
    sys.exit(1)


REQUIRED_KEYS: tuple[str, ...] = ("uri", "title", "status")
URI_SCHEMES: tuple[str, ...] = ("ams://", "klappy://")


def extract_frontmatter(text: str) -> str | None:
    """Return the YAML frontmatter block content, or None if no block found.

    A valid frontmatter block starts with `---` on the first line and
    ends at the next `---` on its own line. Anything else (BOMs, leading
    blank lines, code-fenced YAML) is treated as no-frontmatter.
    """
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return None
    end_idx: int | None = None
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            end_idx = i
            break
    if end_idx is None:
        return None
    return "\n".join(lines[1:end_idx])


def validate_file(path: Path) -> list[str]:
    """Return a list of error strings; empty list means pass."""
    errors: list[str] = []
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        # File deleted in this PR — nothing to validate.
        return errors
    except UnicodeDecodeError as exc:
        errors.append(f"file is not valid UTF-8: {exc}")
        return errors

    block = extract_frontmatter(text)
    if block is None:
        errors.append(
            "no YAML frontmatter block found (expected `---` fence on lines 1 and N)"
        )
        return errors

    try:
        data = yaml.safe_load(block)
    except yaml.YAMLError as exc:
        errors.append(f"YAML parse failed: {exc}")
        return errors

    if not isinstance(data, dict):
        errors.append(
            f"frontmatter parsed as {type(data).__name__}, expected a mapping"
        )
        return errors

    for key in REQUIRED_KEYS:
        if key not in data:
            errors.append(f"missing required key `{key}` in frontmatter")
        elif not isinstance(data[key], str) or not data[key].strip():
            errors.append(f"key `{key}` is empty or not a string")

    uri = data.get("uri")
    if isinstance(uri, str) and not any(uri.startswith(scheme) for scheme in URI_SCHEMES):
        errors.append(
            f"uri `{uri}` does not start with a known scheme ({', '.join(URI_SCHEMES)})"
        )

    return errors


def main() -> int:
    if len(sys.argv) != 2:
        print(
            "::error::usage: validate-frontmatter.py <changed-files-manifest>",
            file=sys.stderr,
        )
        return 1

    manifest_path = Path(sys.argv[1])
    if not manifest_path.exists():
        print(
            f"::error::changed-files manifest not found: {manifest_path}",
            file=sys.stderr,
        )
        return 1

    candidates: list[Path] = []
    for line in manifest_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith(("canon/", "writings/")) and line.endswith(".md"):
            candidates.append(Path(line))

    if not candidates:
        print("No canon/**/*.md or writings/**/*.md files changed; skipping.")
        return 0

    print(f"Validating frontmatter on {len(candidates)} file(s):")
    any_failure = False
    for path in candidates:
        errors = validate_file(path)
        if errors:
            any_failure = True
            for err in errors:
                # GitHub Actions error annotation format — surfaces inline
                # on the PR diff for the offending file.
                print(f"::error file={path}::{err}")
            print(f"  ❌ {path}")
        else:
            print(f"  ✅ {path}")

    return 1 if any_failure else 0


if __name__ == "__main__":
    sys.exit(main())
