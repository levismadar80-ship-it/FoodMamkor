"""
Module:   test_meh3540_split_parts_collected
Purpose:  A test written in a `tests/_test_<stem>__pNN.py` part runs only if
          `tests/test_<stem>.py` imports it — pytest never collects the part
          itself (no `test_` prefix). This guard fails on a part test the
          aggregator does not import, so a new test cannot be silently skipped.
Does NOT: run the tests, or check the frontend splits (those are ordinary
          spec/test files that the runners collect directly).
Related:  tests/test_api.py (the largest aggregator) · MEH-3540 split.
History:  MEH-3540 (creation, after the fresh review named the gap).
"""

import ast
import re
from pathlib import Path

TESTS = Path(__file__).resolve().parent
PART_RE = re.compile(r"^_(test_.+)__p\d+\.py$")


def _is_test(node: ast.stmt) -> bool:
    if isinstance(node, ast.ClassDef):
        return node.name.startswith("Test")
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        return node.name.startswith("test_")
    return False


def defined_tests(source: str) -> set[str]:
    return {n.name for n in ast.parse(source).body if _is_test(n)}


def imported_from(source: str, module: str) -> set[str]:
    out: set[str] = set()
    for n in ast.parse(source).body:
        if isinstance(n, ast.ImportFrom) and n.module == module:
            out |= {a.asname or a.name for a in n.names}
    return out


def missing(part_name: str, part_src: str, agg_src: str) -> set[str]:
    return defined_tests(part_src) - imported_from(agg_src, part_name.removesuffix(".py"))


def parts() -> list[Path]:
    return sorted(p for p in TESTS.glob("_test_*__p*.py") if PART_RE.match(p.name))


def test_self_test_flags_a_test_the_aggregator_does_not_import():
    part = "class TestA:\n    pass\n\n\ndef test_b():\n    pass\n\n\ndef helper():\n    pass\n"
    agg_ok = "from _test_x__p01 import (  # noqa: F401\n    TestA,\n    test_b,\n)\n"
    agg_short = "from _test_x__p01 import TestA  # noqa: F401\n"
    assert missing("_test_x__p01.py", part, agg_ok) == set()
    assert missing("_test_x__p01.py", part, agg_short) == {"test_b"}


def test_self_test_on_a_real_part():
    # Anchored to a real file: the first test_api part and its aggregator.
    part = TESTS / "_test_api__p01.py"
    names = defined_tests(part.read_text(encoding="utf-8"))
    assert "TestAuth" in names
    agg = (TESTS / "test_api.py").read_text(encoding="utf-8")
    assert missing(part.name, part.read_text(encoding="utf-8"), agg) == set()
    # Dropping the part's import block must be seen.
    broken = re.sub(r"from _test_api__p01 import \([^)]*\)\n", "", agg, count=1)
    assert broken != agg, "control: the import block was not found"
    assert missing(part.name, part.read_text(encoding="utf-8"), broken) == {"TestAuth"}


def test_every_part_test_is_imported_by_its_aggregator():
    found = parts()
    assert len(found) >= 6, "control: no split parts found — the scan is looking in the wrong place"
    problems = []
    for part in found:
        stem = PART_RE.match(part.name).group(1)
        agg = TESTS / f"{stem}.py"
        if not agg.exists():
            problems.append(f"{part.name}: no aggregator tests/{stem}.py")
            continue
        gap = missing(part.name, part.read_text(encoding="utf-8"), agg.read_text(encoding="utf-8"))
        problems += [f"{part.name}::{name} is not imported by tests/{stem}.py — it never runs" for name in sorted(gap)]
    assert problems == []
