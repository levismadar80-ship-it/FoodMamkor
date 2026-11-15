"""
Module:   test_honesty
Purpose:  Find tests that can pass without checking anything: a pytest test
          with no verification, a skip/xfail without a card, a non-strict
          xfail, a focused (`.only`) or skipped vitest test without a card.
Touches:  reads tests/**/*.py and frontend/__tests__/** only.
Does NOT: judge whether an assertion is strong — mutation testing does that
          (scripts/mutation/run.sh). Does not see vitest tests with no
          `expect`: vitest's own `expect.requireAssertions` fails those at run
          time (frontend/vitest.config.js).
Related:  scripts/checks/test-honesty-guard.sh (the guard),
          scripts/checks/test-honesty-baseline.txt (findings that predate it),
          tests/test_meh3295_test_honesty.py (self-test on real repo files).
History:  MEH-3295 (creation).

A finding has a stable key `<kind> <file>::<test>` so the baseline survives
line moves. Escape hatch on the def line or within its body:
`# no-assert: <reason>` (a test whose whole point is "does not raise").
"""

from __future__ import annotations

import ast
import re
import sys
import warnings
from pathlib import Path

# A test file's own invalid escape sequences are not this scan's business.
warnings.simplefilter("ignore", SyntaxWarning)

VERIFY_NAMES = {"raises", "warns", "fail", "deprecated_call", "approx"}
VERIFY_PREFIXES = (
    "assert",
    "_assert",
    "expect",
    "_expect",
    "check",
    "_check",
    "verify",
    "_verify",
)
CARD = re.compile(r"MEH-\d+")
NO_ASSERT_OK = re.compile(r"#\s*no-assert:\s*\S")


def _call_name(node: ast.Call) -> str:
    f = node.func
    if isinstance(f, ast.Attribute):
        return f.attr
    if isinstance(f, ast.Name):
        return f.id
    return ""


def _verifies_directly(fn: ast.AST, helpers: set[str]) -> bool:
    for n in ast.walk(fn):
        if isinstance(n, (ast.Assert, ast.Raise)):
            return True
        if isinstance(n, ast.Call):
            name = _call_name(n)
            if (
                name in VERIFY_NAMES
                or name.startswith(VERIFY_PREFIXES)
                or name in helpers
            ):
                return True
    return False


def _verifying_helpers(tree: ast.Module) -> set[str]:
    """Module functions (incl. methods) that verify, to a fixed point."""
    funcs = [
        n
        for n in ast.walk(tree)
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        and not n.name.startswith("test")
    ]
    helpers: set[str] = set()
    changed = True
    while changed:
        changed = False
        for f in funcs:
            if f.name not in helpers and _verifies_directly(f, helpers):
                helpers.add(f.name)
                changed = True
    return helpers


def _marker_text(dec: ast.expr, src: str) -> str:
    return ast.get_source_segment(src, dec) or ""


def _kw(dec: ast.Call, name: str) -> ast.expr | None:
    for k in dec.keywords:
        if k.arg == name:
            return k.value
    return None


def scan_python(path: Path, rel: str) -> list[tuple[str, int]]:
    src = path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return []
    lines = src.splitlines()
    helpers = _verifying_helpers(tree)
    out: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if not isinstance(
            node, (ast.FunctionDef, ast.AsyncFunctionDef)
        ) or not node.name.startswith("test"):
            continue
        body_text = "\n".join(lines[node.lineno - 1 : node.end_lineno or node.lineno])
        if not _verifies_directly(node, helpers) and not NO_ASSERT_OK.search(body_text):
            out.append((f"no-verify {rel}::{node.name}", node.lineno))
        for dec in node.decorator_list:
            text = _marker_text(dec, src)
            if not re.search(r"\bmark\.(skip|skipif|xfail)\b", text):
                continue
            near = "\n".join(
                lines[max(0, dec.lineno - 2) : (dec.end_lineno or dec.lineno) + 1]
            )
            if not CARD.search(near):
                out.append((f"skip-no-card {rel}::{node.name}", dec.lineno))
            if "xfail" in text:
                strict = _kw(dec, "strict") if isinstance(dec, ast.Call) else None
                if not (isinstance(strict, ast.Constant) and strict.value is True):
                    out.append((f"xfail-not-strict {rel}::{node.name}", dec.lineno))
    return out


JS_FOCUS = re.compile(r"\b(?:it|test|describe)\.only\s*\(")
JS_SKIP = re.compile(r"\b(?:it|test|describe)\.(?:skip|todo)\s*\(\s*([\"'`])(.*?)\1")


def scan_js(path: Path, rel: str) -> list[tuple[str, int]]:
    out: list[tuple[str, int]] = []
    lines = path.read_text(encoding="utf-8").splitlines()
    for i, line in enumerate(lines, 1):
        if JS_FOCUS.search(line):
            out.append((f"only {rel}:{i}", i))
        m = JS_SKIP.search(line)
        if m:
            near = "\n".join(lines[max(0, i - 2) : i])  # this line or the one above
            if not CARD.search(near):
                out.append((f"skip-no-card {rel}::{m.group(2)[:80]}", i))
    return out


def scan(root: Path) -> list[tuple[str, str, int]]:
    """[(key, rel_path, line)] over the whole repo, sorted."""
    found: list[tuple[str, str, int]] = []
    for p in sorted((root / "tests").rglob("test_*.py")):
        rel = p.relative_to(root).as_posix()
        found += [(k, rel, ln) for k, ln in scan_python(p, rel)]
    js_root = root / "frontend" / "__tests__"
    for p in sorted(js_root.rglob("*")):
        if p.suffix in {".js", ".jsx", ".ts", ".tsx", ".mjs"} and p.is_file():
            rel = p.relative_to(root).as_posix()
            found += [(k, rel, ln) for k, ln in scan_js(p, rel)]
    return found


def main(argv: list[str]) -> int:
    root = Path(argv[1])
    baseline_path = Path(argv[2])
    baseline = {
        line.strip()
        for line in baseline_path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    }
    found = scan(root)
    keys = {k for k, _, _ in found}
    new = [(k, f, ln) for k, f, ln in found if k not in baseline]
    for k, f, ln in new:
        kind = k.split(" ", 1)[0]
        print(f"{f}:{ln}: {kind} — {k}")
    for k in sorted(baseline - keys):
        print(f"WARNING: baseline line no longer found (fixed? delete it): {k}")
    print(
        f"test-honesty: {len(found)} findings, {len(found) - len(new)} in baseline, {len(new)} new"
    )
    return 1 if new else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
