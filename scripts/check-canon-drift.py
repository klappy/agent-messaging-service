#!/usr/bin/env python3
"""
Canon drift checker — validates that file paths referenced in canon, writings,
handoffs, and proposals match the repo's actual state on the target branch.

Implements the validation rules in:
  ams://canon/constraints/canon-implementation-path-integrity

Patterns checked:
  - **NEW** `path`            → path MUST NOT exist
  - **EDIT** `path`           → path MUST exist
  - **REPLACE** `path`        → path MUST exist
  - **DELETE** `path`         → path MUST exist
  - "new file: `path`"        → path MUST NOT exist
  - "create at `path`"        → path MUST NOT exist
  - "located at `path`"       → path MUST exist
  - "lives at `path`"         → path MUST exist

Skipped:
  - Lines inside ```aspirational or ```future fenced code blocks
  - Lines inside sections titled "Future Work", "Aspirational", or "Open Questions"
  - Paths that don't look like project file paths (URLs, npm packages, etc.)

Output:
  - Human-readable findings to stdout
  - Markdown findings to drift-findings.md (consumed by the workflow's PR comment step)

Exit codes:
  0 — no drift
  1 — drift detected
  2 — script error
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

CANON_DIRS = ['canon', 'writings', 'docs/handoffs', 'proposals']

CLAIM_MUST_NOT_EXIST = 'must_not_exist'
CLAIM_MUST_EXIST = 'must_exist'

# (regex, claim_type) — claim_type indicates what the doc asserts about the path
PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'\*\*NEW\*\*\s+`([^`]+)`'), CLAIM_MUST_NOT_EXIST),
    (re.compile(r'\*\*EDIT\*\*\s+`([^`]+)`'), CLAIM_MUST_EXIST),
    (re.compile(r'\*\*REPLACE\*\*\s+`([^`]+)`'), CLAIM_MUST_EXIST),
    (re.compile(r'\*\*DELETE\*\*\s+`([^`]+)`'), CLAIM_MUST_EXIST),
    (re.compile(r'(?:new file(?:\s+at)?|create(?:\s+file)?(?:\s+at)?):?\s*`([^`]+)`', re.IGNORECASE), CLAIM_MUST_NOT_EXIST),
    (re.compile(r'(?:located at|lives at|exists at|file at):?\s*`([^`]+)`', re.IGNORECASE), CLAIM_MUST_EXIST),
]

ASPIRATIONAL_FENCE_RE = re.compile(r'^```(?:aspirational|future)\b')
PLAIN_FENCE_RE = re.compile(r'^```')
SKIP_SECTION_HEADINGS = {'future work', 'aspirational', 'open questions', 'open questions for canon refinement'}
HEADING_RE = re.compile(r'^#{1,6}\s+(.+?)\s*$')


@dataclass
class DriftFinding:
    file: Path
    line: int
    path: str
    claim: str
    error: str

    def format_human(self) -> str:
        return f'  {self.file}:{self.line}  `{self.path}` — {self.error}'

    def format_md(self) -> str:
        return f'- `{self.file}:{self.line}` — `{self.path}` — *{self.error}*'


def find_canon_files(repo_root: Path) -> list[Path]:
    files: list[Path] = []
    for d in CANON_DIRS:
        path = repo_root / d
        if path.exists():
            files.extend(sorted(path.rglob('*.md')))
    return files


def filter_to_canon(repo_root: Path, paths: list[str]) -> list[Path]:
    """Restrict an explicit path list to existing .md files under CANON_DIRS.

    Used to scope validation to a PR's changed files per
    ams://canon/constraints/canon-implementation-path-integrity §"The Validation Rules"
    ("every path reference in the changed files").
    """
    canon_roots = [(repo_root / d).resolve() for d in CANON_DIRS]
    selected: list[Path] = []
    for raw in paths:
        raw = raw.strip()
        if not raw:
            continue
        candidate = (repo_root / raw).resolve()
        if not candidate.exists() or candidate.suffix != '.md':
            continue
        for root in canon_roots:
            try:
                candidate.relative_to(root)
            except ValueError:
                continue
            selected.append(candidate)
            break
    # Stable, de-duplicated order
    seen: set[Path] = set()
    unique: list[Path] = []
    for p in sorted(selected):
        if p not in seen:
            seen.add(p)
            unique.append(p)
    return unique


def is_project_path(s: str) -> bool:
    """Heuristic: project paths look like 'a/b/c.ext' but not URLs, MIME types, etc."""
    if not s or s.startswith(('http://', 'https://', '@', '#', '/')):
        return False
    if '://' in s or s.startswith('mailto:'):
        return False
    if '/' not in s:
        return False
    # Must look like a path with an extension
    if not re.match(r'^[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+$', s):
        return False
    # Reject obvious MIME types (e.g. application/json, text/markdown).
    # Restrict the prefix to known IANA top-level MIME types so that
    # single-depth lowercase paths like `worker/package.json` aren't dropped.
    if re.match(r'^(?:application|audio|font|image|message|model|multipart|text|video)/[a-z][a-z0-9.+-]*$', s):
        return False
    return True


def extract_claims(file_path: Path) -> list[tuple[str, str, int]]:
    """Returns list of (path, claim_type, line_number) for each claim in the file."""
    claims: list[tuple[str, str, int]] = []
    in_aspirational_fence = False
    in_plain_fence = False
    in_skip_section = False
    aspirational_section_level = 0

    try:
        lines = file_path.read_text(encoding='utf-8').splitlines()
    except (OSError, UnicodeDecodeError) as e:
        print(f'  warning: could not read {file_path}: {e}', file=sys.stderr)
        return []

    for line_num, line in enumerate(lines, 1):
        # Track aspirational fences (skip everything inside).
        # The opening fence is e.g. ```aspirational; the closing fence is a plain ```.
        if in_aspirational_fence:
            if PLAIN_FENCE_RE.match(line):
                in_aspirational_fence = False
            continue
        if ASPIRATIONAL_FENCE_RE.match(line):
            in_aspirational_fence = True
            continue

        # Track plain fences (still extract paths inside? Yes — code blocks contain real refs.)
        # But only TOGGLE the state; don't skip content
        if PLAIN_FENCE_RE.match(line):
            in_plain_fence = not in_plain_fence

        # Track section headings — skip aspirational/future-work sections.
        # Only honor headings outside fenced code blocks; otherwise a markdown
        # example like `## Future Work` inside a ```markdown block would silently
        # disable drift checks for the rest of the file.
        if not in_plain_fence:
            heading_match = HEADING_RE.match(line)
            if heading_match:
                heading_text = heading_match.group(1).lower().strip().rstrip('.,:;')
                # Count leading '#' characters directly so tab-indented headings
                # (matched by HEADING_RE's `\s+`) don't crash line.index(' ').
                heading_level = len(line) - len(line.lstrip('#'))
                if heading_text in SKIP_SECTION_HEADINGS:
                    in_skip_section = True
                    aspirational_section_level = heading_level
                    continue
                # Any heading at or above the aspirational section's level closes it
                if in_skip_section and heading_level <= aspirational_section_level:
                    in_skip_section = False

        if in_skip_section:
            continue

        # Apply patterns
        for pattern, claim_type in PATTERNS:
            for match in pattern.finditer(line):
                path = match.group(1).strip()
                if is_project_path(path):
                    claims.append((path, claim_type, line_num))

    return claims


def validate_claim(repo_root: Path, path: str, claim_type: str) -> str | None:
    """Returns error message if drift, None if OK."""
    target = repo_root / path
    exists = target.exists()
    if claim_type == CLAIM_MUST_NOT_EXIST and exists:
        return 'doc claims this path is NEW, but it already exists in the repo'
    if claim_type == CLAIM_MUST_EXIST and not exists:
        return 'doc claims this path exists or is to be edited, but it does not exist in the repo'
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--repo-root', default='.', help='Repo root (default: cwd)')
    parser.add_argument('--findings-md', default='drift-findings.md', help='Output path for markdown findings')
    parser.add_argument(
        '--files-from',
        default=None,
        help=(
            'File containing newline-delimited paths (relative to --repo-root) to validate. '
            'Paths outside CANON_DIRS or non-.md files are ignored. '
            'Used by CI to scope validation to the PR\'s changed files per '
            'ams://canon/constraints/canon-implementation-path-integrity. '
            'If omitted, the script scans every .md under CANON_DIRS.'
        ),
    )
    parser.add_argument(
        'files',
        nargs='*',
        help='Specific files to validate (alternative to --files-from). Same scoping rules.',
    )
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    if not repo_root.exists():
        print(f'error: --repo-root does not exist: {repo_root}', file=sys.stderr)
        return 2

    explicit_paths: list[str] | None = None
    if args.files_from:
        try:
            explicit_paths = (Path(args.files_from)).read_text(encoding='utf-8').splitlines()
        except OSError as e:
            print(f'error: could not read --files-from {args.files_from}: {e}', file=sys.stderr)
            return 2
    elif args.files:
        explicit_paths = args.files

    if explicit_paths is not None:
        canon_files = filter_to_canon(repo_root, explicit_paths)
        print(
            f'Scanning {len(canon_files)} changed markdown file(s) under '
            f'{", ".join(CANON_DIRS)} for path drift...'
        )
    else:
        canon_files = find_canon_files(repo_root)
        print(f'Scanning {len(canon_files)} markdown files in {", ".join(CANON_DIRS)} for path drift...')

    findings: list[DriftFinding] = []
    for f in canon_files:
        for path, claim_type, line_num in extract_claims(f):
            error = validate_claim(repo_root, path, claim_type)
            if error:
                findings.append(DriftFinding(
                    file=f.relative_to(repo_root),
                    line=line_num,
                    path=path,
                    claim=claim_type,
                    error=error,
                ))

    if not findings:
        print('No drift detected.')
        return 0

    print(f'\n{len(findings)} drift finding(s):\n')
    for d in findings:
        print(d.format_human())
    print('\nFix the canon to match reality, or wrap aspirational paths in a `future` / `aspirational` annotation.')
    print('See ams://canon/constraints/canon-implementation-path-integrity for the discipline.')

    # Write markdown for the workflow's PR comment
    findings_md_path = repo_root / args.findings_md
    findings_md_path.write_text('\n'.join(f.format_md() for f in findings) + '\n', encoding='utf-8')

    return 1


if __name__ == '__main__':
    sys.exit(main())
