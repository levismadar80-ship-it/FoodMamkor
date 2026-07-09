#!/usr/bin/env python3
"""
Module:   validate-registry-paths
Purpose:  Assert every repo file path listed in a guard/config registry still
          resolves to a real file/dir, so a registry can't silently disable
          the guard it feeds after a refactor renames/moves files.
Touches:  nothing (read-only filesystem check).
Does NOT: validate schema, syntax, ownership, or fix anything — path existence
          only. The registries' own consumers (pre-edit-guard.js, check-rtl.sh)
          own their semantics.
Related:  .claude/central-components.json (MEH-1026 [locale] drift),
          .claude/hooks/rtl-allowlist.txt (MEH-668 [locale] drift),
          .pre-commit-config.yaml (wiring), .claude/rules/testing.md (docs).
History:  MEH-1030 (creation — recurrence-prevention for the MEH-668/1026 class).

Usage:    python3 scripts/validate-registry-paths.py
          exit 0 = every registry path resolves; exit 1 = offenders listed.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def _parse_json_array(path: Path, key: str) -> list[tuple[int, str]]:
    """Paths live in a top-level JSON array under `key`. Line number is a
    best-effort lookup of the raw string in the file (registries are tiny)."""
    text = path.read_text(encoding="utf-8")
    entries = json.loads(text).get(key, [])
    lines = text.splitlines()
    out: list[tuple[int, str]] = []
    for entry in entries:
        lineno = next(
            (i + 1 for i, ln in enumerate(lines) if f'"{entry}"' in ln), 0
        )
        out.append((lineno, entry))
    return out


def _parse_rtl_allowlist(path: Path) -> list[tuple[int, str]]:
    """rtl-allowlist.txt has two sections. Only the PATH EXCEPTIONS section
    (between the two `# ==== ... ====` header markers) holds file paths; the
    CONTENT PATTERNS section holds inline markers (e.g. `rtl-ok`), NOT paths.
    Skip `#` comments and blank lines."""
    out: list[tuple[int, str]] = []
    in_paths = False
    for i, ln in enumerate(path.read_text(encoding="utf-8").splitlines()):
        stripped = ln.strip()
        if stripped.startswith("#") and "PATH EXCEPTIONS" in stripped:
            in_paths = True
            continue
        if stripped.startswith("#") and "CONTENT PATTERNS" in stripped:
            in_paths = False
            continue
        if in_paths and stripped and not stripped.startswith("#"):
            out.append((i + 1, stripped))
    return out


# Add a registry = one entry. `parser` returns [(lineno, repo_relative_path)].
REGISTRIES = [
    {
        "file": ".claude/central-components.json",
        "parser": lambda p: _parse_json_array(p, "components"),
    },
    {
        "file": ".claude/hooks/rtl-allowlist.txt",
        "parser": _parse_rtl_allowlist,
    },
]


def main() -> int:
    offenders: list[str] = []
    checked = 0
    for reg in REGISTRIES:
        reg_path = REPO / reg["file"]
        if not reg_path.exists():
            offenders.append(f"{reg['file']}: registry file itself is missing")
            continue
        entries = reg["parser"](reg_path)
        if not entries:
            # A parser yielding nothing means the format drifted out from under
            # it (renamed section marker, changed JSON key) — the validator
            # would silently no-op for this registry, the exact failure mode
            # MEH-1030 exists to prevent. Surface it loudly (stderr, non-fatal
            # so a genuinely empty registry doesn't hard-fail).
            sys.stderr.write(
                f"warning: parsed 0 paths from {reg['file']} — registry format "
                "may have changed; the validator is no longer covering it.\n"
            )
        for lineno, rel in entries:
            checked += 1
            if not (REPO / rel).exists():
                loc = f"{reg['file']}:{lineno}" if lineno else reg["file"]
                offenders.append(f"{loc} -> missing path: {rel}")

    if offenders:
        print("Registry path drift — these listed paths do not resolve:\n")
        for o in offenders:
            print(f"  ✗ {o}")
        print(
            f"\n{len(offenders)} stale path(s) across "
            f"{len(REGISTRIES)} registries. Update the registry to the file's "
            "real current location (or remove the dead entry).",
        )
        return 1

    print(f"OK — {checked} paths across {len(REGISTRIES)} registries all resolve.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
