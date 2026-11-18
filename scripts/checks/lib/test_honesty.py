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

# `pytest.approx` is not here: alone it compares nothing, it only builds a value.
VERIFY_NAMES = {"raises", "warns", "fail", "deprecated_call", "expect"}
# By name, only `assert…` / `expect…` followed by `_` or a capital
# (`assert_called_once`, `assertEqual`, `expect_ok`). `check_*` / `verify_*`
# are product names as often as checks (`verify_token`), so they count only as
# a helper in the same file that really asserts (`_verifying_helpers`).
# Measured 18/11: dropping them added no finding over tests/.
VERIFY_PREFIX = re.compile(r"^_?(?:assert|expect)(?:_|[A-Z])|^_?assert$")
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
            if name in VERIFY_NAMES or VERIFY_PREFIX.search(name) or name in helpers:
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


SKIP_MARK = re.compile(r"\bmark\.(skip|skipif|xfail)\b")


def _near(lines: list[str], first: int, last: int) -> str:
    """Source lines first-1 .. last+1 (1-based), where a card may be written."""
    return "\n".join(lines[max(0, first - 2) : last + 1])


def _check_markers(decs, src, lines, key, out) -> None:
    for dec in decs:
        text = _marker_text(dec, src)
        if not SKIP_MARK.search(text):
            continue
        if not CARD.search(_near(lines, dec.lineno, dec.end_lineno or dec.lineno)):
            out.append((f"skip-no-card {key}", dec.lineno))
        if "xfail" in text:
            strict = _kw(dec, "strict") if isinstance(dec, ast.Call) else None
            if not (isinstance(strict, ast.Constant) and strict.value is True):
                out.append((f"xfail-not-strict {key}", dec.lineno))


def _tests(body, prefix: str = ""):
    """(qualified name, node, enclosing class decorators) for every test."""
    for n in body:
        if isinstance(n, ast.ClassDef):
            yield from _tests(n.body, f"{prefix}{n.name}.")
        elif isinstance(
            n, (ast.FunctionDef, ast.AsyncFunctionDef)
        ) and n.name.startswith("test"):
            yield f"{prefix}{n.name}", n


def scan_python(path: Path, rel: str) -> list[tuple[str, int]]:
    src = path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return []
    lines = src.splitlines()
    helpers = _verifying_helpers(tree)
    out: list[tuple[str, int]] = []
    # Module-wide skip: `pytestmark = pytest.mark.skip(...)` (or a list of marks).
    for n in tree.body:
        if isinstance(n, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "pytestmark" for t in n.targets
        ):
            elts = (
                n.value.elts
                if isinstance(n.value, (ast.List, ast.Tuple))
                else [n.value]
            )
            _check_markers(elts, src, lines, f"{rel}::pytestmark", out)
    # Class-wide skip: a decorator on the class.
    for n in ast.walk(tree):
        if isinstance(n, ast.ClassDef):
            _check_markers(n.decorator_list, src, lines, f"{rel}::{n.name}", out)
    for qual, node in _tests(tree.body):
        key = f"{rel}::{qual}"
        body_text = "\n".join(lines[node.lineno - 1 : node.end_lineno or node.lineno])
        if not _verifies_directly(node, helpers) and not NO_ASSERT_OK.search(body_text):
            out.append((f"no-verify {key}", node.lineno))
        _check_markers(node.decorator_list, src, lines, key, out)
        # Imperative skip inside the test: `pytest.skip("...")` / `pytest.xfail(...)`.
        for c in ast.walk(node):
            if (
                isinstance(c, ast.Call)
                and isinstance(c.func, ast.Attribute)
                and c.func.attr in {"skip", "xfail"}
                and isinstance(c.func.value, ast.Name)
                and c.func.value.id == "pytest"
                and not CARD.search(_near(lines, c.lineno, c.end_lineno or c.lineno))
            ):
                out.append((f"skip-no-card {key}", c.lineno))
    return out


JS_FOCUS = re.compile(r"\b(?:it|test|describe)\.only\b")
# .skip / .todo / .skipIf / .runIf, also chained (.skip.each, .skipIf(x)(...)).
JS_SKIP = re.compile(r"\b(?:it|test|describe)\.(?:skip|todo|skipIf|runIf)\b")
JS_TITLE = re.compile(r"([\"'`])(.*?)\1")


def scan_js(path: Path, rel: str) -> list[tuple[str, int]]:
    out: list[tuple[str, int]] = []
    lines = path.read_text(encoding="utf-8").splitlines()
    for i, line in enumerate(lines, 1):
        if line.lstrip().startswith(("//", "*", "/*")):
            continue  # a comment that mentions `test.skip` is not a skip
        if JS_FOCUS.search(line):
            out.append((f"only {rel}:{i}", i))
        m = JS_SKIP.search(line)
        if m:
            near = "\n".join(lines[max(0, i - 2) : i])  # this line or the one above
            if not CARD.search(near):
                # Title on this line or the next (a title wrapped by prettier).
                t = JS_TITLE.search(line[m.end() :]) or (
                    JS_TITLE.search(lines[i]) if i < len(lines) else None
                )
                title = t.group(2)[:80] if t else line.strip()[:80]
                out.append((f"skip-no-card {rel}::{title}", i))
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
    grown: list[str] = []
    if len(argv) > 3:  # the baseline as it is on the base branch
        base = {
            line.strip()
            for line in Path(argv[3]).read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.startswith("#")
        }
        grown = sorted(baseline - base)
        for k in grown:
            print(
                f"baseline grew: {k} — fix the test instead (the baseline only shrinks)"
            )
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
    return 1 if new or grown else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
