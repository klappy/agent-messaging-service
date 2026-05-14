#!/usr/bin/env python3
"""Validate Dolcheo+ TSV shape on changed journal entries.

Reads a list of changed file paths from argv[1] (one per line) and, for
each path that matches journal/**/*.tsv:

  - Asserts every row has at least 3 tab-separated fields.
  - Asserts the first field of every row is exactly one character and
    is a canonical Dolcheo letter: D, O, L, C, H, E.
  - Asserts no row contains embedded newlines that would break the TSV
    one-row-per-line invariant (rows with literal `\n` in a field need
    to be `\\n`-escaped or kept on a single line).
  - Asserts the file uses tabs (not multiple spaces) as the delimiter.

This is the mechanical smoke check. It does NOT verify Dolcheo+ semantics
(e.g., whether an `O` row is truly an Observation rather than misclassified
as an Open) — that's the output-artifact validator probe's job.

Usage:
  python3 validate-tsv-shape.py /tmp/changed.txt

Exit codes:
  0 — all checked files pass (or no in-scope files)
  1 — at least one file failed
"""

from __future__ import annotations

import sys
from pathlib import Path


VALID_DOLCHEO_LETTERS: frozenset[str] = frozenset("DOLCHE")

# Known first-field tokens that indicate a legacy header row (case-insensitive).
HEADER_FIRST_FIELDS: frozenset[str] = frozenset({"type", "typename", "letter"})


def validate_file(path: Path) -> list[str]:
    """Return a list of error strings; empty list means pass."""
    errors: list[str] = []
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return errors
    except UnicodeDecodeError as exc:
        errors.append(f"file is not valid UTF-8: {exc}")
        return errors

    if not text.strip():
        errors.append("file is empty")
        return errors

    lines = text.split("\n")
    # Trailing newline is fine; treat empty final element as blank.
    if lines and lines[-1] == "":
        lines = lines[:-1]

    # Tolerate a header row at line 1 if present. Newer canon (per the
    # output-artifact-validator's read of Dolcheo+ format) requires no
    # header — first row is a D artifact. Older journals have a
    # `type\tsummary\tdetail` header. The output-artifact-validator
    # probe flags header presence as a semantic finding; smoke doesn't
    # block PRs on it. Skip a line 1 only when its first field is a
    # known header keyword; a malformed first data row (e.g. typo'd
    # type letter, or a row with no tabs) must still be flagged.
    start_line_no = 1
    if lines:
        first_fields = lines[0].split("\t")
        if first_fields and first_fields[0].strip().lower() in HEADER_FIRST_FIELDS:
            # Treat line 1 as header; skip it for shape validation.
            lines = lines[1:]
            start_line_no = 2

    for offset, line in enumerate(lines):
        line_no = start_line_no + offset
        if not line:
            errors.append(f"line {line_no}: blank row (TSV files should not contain blank lines)")
            continue

        if "\t" not in line:
            errors.append(
                f"line {line_no}: no tab characters found — TSV requires tab-separated fields, not spaces"
            )
            continue

        fields = line.split("\t")
        if len(fields) < 3:
            errors.append(
                f"line {line_no}: only {len(fields)} field(s); Dolcheo+ requires at least 3 (type, summary, detail)"
            )
            continue

        type_field = fields[0]
        if len(type_field) != 1:
            errors.append(
                f"line {line_no}: type field is `{type_field!r}` ({len(type_field)} chars); expected exactly one letter"
            )
            continue

        if type_field not in VALID_DOLCHEO_LETTERS:
            errors.append(
                f"line {line_no}: type letter `{type_field}` is not in the canonical Dolcheo+ set ({''.join(sorted(VALID_DOLCHEO_LETTERS))})"
            )
            continue

    return errors


def main() -> int:
    if len(sys.argv) != 2:
        print("::error::usage: validate-tsv-shape.py <changed-files-manifest>", file=sys.stderr)
        return 1

    manifest_path = Path(sys.argv[1])
    if not manifest_path.exists():
        print(f"::error::changed-files manifest not found: {manifest_path}", file=sys.stderr)
        return 1

    candidates: list[Path] = []
    for line in manifest_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("journal/") and line.endswith(".tsv"):
            candidates.append(Path(line))

    if not candidates:
        print("No journal/**/*.tsv files changed; skipping.")
        return 0

    print(f"Validating Dolcheo+ TSV shape on {len(candidates)} file(s):")
    any_failure = False
    for path in candidates:
        errors = validate_file(path)
        if errors:
            any_failure = True
            for err in errors:
                print(f"::error file={path}::{err}")
            print(f"  ❌ {path}")
        else:
            print(f"  ✅ {path}")

    return 1 if any_failure else 0


if __name__ == "__main__":
    sys.exit(main())
