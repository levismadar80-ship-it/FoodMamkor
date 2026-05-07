#!/usr/bin/env python3
"""
i18n-scan.py  —  Deterministic Hebrew string scanner (MEH-477).

Replaces the i18n-scanner subagent for full-scope sweeps that overflow
the 194-tool-call context limit. Applies MEH-373 externalize-to-scripts
pattern.

Usage (from repo root):
  python .claude/scripts/i18n-scan.py [--scope <path|glob>] [--format text|json]

Default scope:
  frontend/components/**/*.{jsx,tsx}
  frontend/app/**/*.{js,jsx,ts,tsx}

Granularity: one finding per string literal or JSX text node, not per word.
Known limitation: Hebrew in end-of-line // comments is a false positive;
  ±5% baseline tolerance covers it.
Exit code: always 0. Caller inspects the Total line.
"""

import argparse
import glob as glob_mod
import json
import os
import re

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
    args = parser.parse_args()

    files = collect_files(args.scope)
    all_findings: list[tuple[str, int, str]] = []

    for filepath in files:
        for lineno, hebrew in scan_file(filepath):
            all_findings.append((filepath, lineno, hebrew))

    # Sort for determinism: file path → line number → text
    all_findings.sort()

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
