#!/usr/bin/env python3
"""
i18n-scan.py  —  Deterministic Hebrew string scanner (MEH-477).

Replaces the i18n-scanner subagent for full-scope sweeps that overflow
the 194-tool-call context limit. Applies MEH-373 externalize-to-scripts
pattern.

Usage (from repo root):
  python .claude/scripts/i18n-scan.py [--scope <path|glob>] [--format text|json]
  python .claude/scripts/i18n-scan.py --diff <baseline.json> [--scope <path|glob>]
  python .claude/scripts/i18n-scan.py --self-test

Default scope:
  frontend/components/**/*.{jsx,tsx}
  frontend/app/**/*.{js,jsx,ts,tsx}

Granularity: one finding per string literal or JSX text node, not per word.
Known limitation: Hebrew in end-of-line // comments is a false positive;
  ±5% baseline tolerance covers it.

Exit codes:
  0  — default scan; --diff with Δ ≤ 0 (improvement or no change); --self-test pass
  1  — --diff regression (Δ > 0); --self-test fail; --diff baseline unreadable
  2  — argparse error (e.g. --diff + --self-test combined)

History: MEH-477 (creation); MEH-623 (added --diff + --self-test).
"""

import argparse
import glob as glob_mod
import json
import os
import re
import sys

# ── Patterns ────────────────────────────────────────────────────────────────

_H = r"[֐-׿]"   # Hebrew Unicode block

HEBREW_CHAR_RE = re.compile(_H)

# Already-wrapped: t("...") / t('...') / t(`...`) and i18n variants.
# Template literal form covers interpolated strings e.g. t(`שלום ${name}`).
_WQD = rf'"[^"\n]*{_H}[^"\n]*"'
_WQS = rf"'[^'\n]*{_H}[^'\n]*'"
_WQT = rf"`[^`\n]*{_H}[^`\n]*`"
WRAPPED_RE = re.compile(
    r"(?:t|i18n)\s*\(\s*(?:" + _WQD + "|" + _WQS + "|" + _WQT + r")\s*\)"
)

# String literals that contain Hebrew — captures the content between quotes.
# Group 1: double-quoted, group 2: single-quoted, group 3: template literal.
HEBREW_STR_RE = re.compile(
    rf'"([^"\n]*{_H}[^"\n]*)"'   # double-quoted
    rf"|'([^'\n]*{_H}[^'\n]*)'"  # single-quoted
    rf"|`([^`\n]*{_H}[^`\n]*)`"  # template literal (single-line only)
)

# JSX text node between > and < that contains Hebrew.
HEBREW_JSX_RE = re.compile(rf">([^<>\n]*{_H}[^<>\n]*)<")

TRANS_DICT_RE = re.compile(r"translations\s*=\s*\{")
INLINE_BLOCK_RE = re.compile(r"/\*.*?\*/")   # single-line /* ... */ only


# ── Helpers ─────────────────────────────────────────────────────────────────

def _is_test_file(path: str) -> bool:
    return ".test." in path or ".spec." in path


def _snake_case(name: str) -> str:
    s = re.sub(r"[-\s]", "_", name)
    s = re.sub(r"([A-Z])", r"_\1", s).lstrip("_").lower()
    return re.sub(r"_+", "_", s)


def _suggested_key(filepath: str, index: int) -> str:
    """Advisory key only — not for production use."""
    stem = os.path.splitext(os.path.basename(filepath))[0]
    return f"{_snake_case(stem)}.text_{index}"


def _extract_hebrew_strings(line: str) -> list[str]:
    """
    Return Hebrew string values found on a single source line, one entry
    per string literal or JSX text node (not per Hebrew word).
    Falls back to individual word sequences for bare Hebrew (EOL comments etc.).
    """
    found: list[str] = []

    for m in HEBREW_STR_RE.finditer(line):
        text = (m.group(1) or m.group(2) or m.group(3) or "").strip()
        if text:
            found.append(text)

    for m in HEBREW_JSX_RE.finditer(line):
        text = m.group(1).strip()
        if text and HEBREW_CHAR_RE.search(text):
            found.append(text)

    # Fallback: Hebrew present but not in a string literal or JSX node.
    # Covers bare JSX text on its own line (opening > and closing < are on
    # different source lines so HEBREW_JSX_RE can't see them) and EOL //
    # comments (acknowledged false-positive class).
    # Report the maximal span from first to last Hebrew character as one
    # finding — not word-by-word.
    if not found and HEBREW_CHAR_RE.search(line):
        m = re.search(rf"{_H}.*{_H}|{_H}", line)
        if m:
            found.append(m.group(0).strip())

    return found


# ── Core scanner ─────────────────────────────────────────────────────────────

def scan_file(filepath: str) -> list[tuple[int, str]]:
    """Return (lineno, hebrew_text) pairs for reportable matches."""
    try:
        with open(filepath, encoding="utf-8") as fh:
            content = fh.read()
    except (OSError, UnicodeDecodeError):
        return []

    if _is_test_file(filepath):
        return []

    if TRANS_DICT_RE.search(content):
        return []

    lines = content.splitlines()
    findings: list[tuple[int, str]] = []
    in_block_comment = False

    for lineno, raw in enumerate(lines, 1):
        line = raw

        # Block comment state machine
        if in_block_comment:
            if "*/" in line:
                line = line[line.index("*/") + 2:]
                in_block_comment = False
            else:
                continue

        # Strip inline /* ... */ (non-greedy, single-line)
        line = INLINE_BLOCK_RE.sub("", line)

        # Block comment opens but doesn't close on this line
        if "/*" in line:
            line = line[: line.index("/*")]
            in_block_comment = True

        stripped = line.strip()
        if not stripped:
            continue

        if stripped.startswith("//"):
            continue

        if not HEBREW_CHAR_RE.search(line):
            continue

        # Remove already-wrapped calls; report what remains
        unwrapped = WRAPPED_RE.sub("", line)
        if not HEBREW_CHAR_RE.search(unwrapped):
            continue

        for text in _extract_hebrew_strings(unwrapped):
            findings.append((lineno, text))

    return findings


# ── File collection ──────────────────────────────────────────────────────────

def collect_files(scope: str | None) -> list[str]:
    """Resolve scope to a sorted, deduplicated list of paths."""
    if scope and os.path.isfile(scope):
        return [scope]

    if scope and os.path.isdir(scope):
        exts = ("jsx", "tsx", "js", "ts")
        patterns = [os.path.join(scope, "**", f"*.{e}") for e in exts]
    elif scope:
        patterns = [scope]
    else:
        base = "frontend"
        patterns = [
            os.path.join(base, "components", "**", "*.jsx"),
            os.path.join(base, "components", "**", "*.tsx"),
            os.path.join(base, "app", "**", "*.js"),
            os.path.join(base, "app", "**", "*.jsx"),
            os.path.join(base, "app", "**", "*.ts"),
            os.path.join(base, "app", "**", "*.tsx"),
        ]

    files: set[str] = set()
    for pat in patterns:
        files.update(glob_mod.glob(pat, recursive=True))
    return sorted(files)


# ── Shared scan helper (MEH-623) ─────────────────────────────────────────────

def _run_scan(scope: str | None) -> list[tuple[str, int, str]]:
    """Scan scope and return sorted (filepath, lineno, hebrew) findings."""
    files = collect_files(scope)
    findings: list[tuple[str, int, str]] = []
    for filepath in files:
        for lineno, hebrew in scan_file(filepath):
            findings.append((filepath, lineno, hebrew))
    findings.sort()
    return findings


# ── --diff (MEH-623) ──────────────────────────────────────────────────────────

def run_diff(baseline_path: str, scope: str | None) -> int:
    """Compare current scan against a previous --format json output.

    baseline.json is the array produced by `--format json` on a prior run.
    Total = len(array). Exit 0 if Δ ≤ 0 (improvement / no change), 1 if Δ > 0
    (regression) or baseline unreadable.
    """
    try:
        with open(baseline_path, encoding="utf-8") as fh:
            baseline = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR reading baseline {baseline_path}: {exc}", file=sys.stderr)
        return 1

    if not isinstance(baseline, list):
        print(
            f"ERROR: baseline {baseline_path} must be a JSON array "
            f"(got {type(baseline).__name__})",
            file=sys.stderr,
        )
        return 1

    previous = len(baseline)
    current = len(_run_scan(scope))
    delta = current - previous
    sign = "+" if delta > 0 else ""
    print(f"Previous: {previous} → Current: {current} (Δ {sign}{delta})")
    return 1 if delta > 0 else 0


# ── --self-test (MEH-623) ─────────────────────────────────────────────────────

# Expected: per-fixture (count, tolerance_pct). T3 carries the ±5% slack for
# the documented EOL-comment false-positive class; T1/T2 are exact-match.
_FIXTURE_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "test", "i18n-scan-fixtures"
)
_SELF_TEST_EXPECTED: dict[str, tuple[int, float]] = {
    "t1-literal.tsx": (1, 0.0),
    "t2-template.tsx": (1, 0.0),
    "t3-eol-comment.tsx": (1, 0.05),
}


def run_self_test() -> int:
    """Scan T1–T3 fixtures, assert expected counts, exit 0/1."""
    findings = _run_scan(_FIXTURE_DIR)
    by_file: dict[str, int] = {}
    for fp, _ln, _text in findings:
        by_file[os.path.basename(fp)] = by_file.get(os.path.basename(fp), 0) + 1

    all_pass = True
    for name, (expected, tol_pct) in _SELF_TEST_EXPECTED.items():
        actual = by_file.get(name, 0)
        tol = max(0, int(round(expected * tol_pct)))
        ok = abs(actual - expected) <= tol
        mark = "✓" if ok else "✗"
        suffix = f" (±{int(tol_pct * 100)}%)" if tol_pct > 0 else ""
        tn = name.split("-", 1)[0].upper()  # "t1-literal.tsx" -> "T1"
        print(f"{tn} {mark}  {name}: expected {expected}, got {actual}{suffix}")
        if not ok:
            all_pass = False

    print("\n" + ("All self-tests passed." if all_pass else "Self-test FAILED."))
    return 0 if all_pass else 1


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scan Mehamakor frontend for hardcoded Hebrew strings."
    )
    parser.add_argument(
        "--scope", default=None, metavar="PATH",
        help="File, directory, or glob. Default: full frontend scope.",
    )
    parser.add_argument(
        "--format", choices=["text", "json"], default="text",
        help="Output format (default: text, matches agent output format).",
    )
    parser.add_argument(
        "--diff", default=None, metavar="BASELINE_JSON",
        help="Compare current scan against a previous --format json output. "
             "Exits 1 on regression (Δ > 0).",
    )
    parser.add_argument(
        "--self-test", action="store_true",
        help="Run T1–T3 eval fixtures and exit 1 on mismatch.",
    )
    args = parser.parse_args()

    # MEH-623: --diff and --self-test are mutually exclusive subcommands.
    if args.diff and args.self_test:
        parser.error("--diff and --self-test are mutually exclusive")

    if args.self_test:
        sys.exit(run_self_test())
    if args.diff:
        sys.exit(run_diff(args.diff, args.scope))

    # Default path: scan + emit text/json (unchanged from MEH-477).
    all_findings = _run_scan(args.scope)

    if args.format == "json":
        output = [
            {
                "file": fp,
                "line": ln,
                "text": ht,
                "suggested_key": _suggested_key(fp, i),
            }
            for i, (fp, ln, ht) in enumerate(all_findings)
        ]
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return

    # Text format — matches "## Hardcoded Hebrew Strings" agent output
    print("## Hardcoded Hebrew Strings")
    files_seen: set[str] = set()
    for i, (fp, ln, ht) in enumerate(all_findings):
        print(f'{fp}:{ln} — "{ht}"  (suggested key: {_suggested_key(fp, i)})')
        files_seen.add(fp)

    n_strings = len(all_findings)
    n_files = len(files_seen)
    print(f"\nTotal: {n_strings} strings in {n_files} files")


if __name__ == "__main__":
    main()
