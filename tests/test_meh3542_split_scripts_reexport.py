"""
Module:   test_meh3542_split_scripts_reexport
Purpose:  `backend/scripts/seed_demo_business.py` and
          `scripts/release/action_map.py` keep their entry file and move the
          rest into `_<name>_pNN.py` parts. Callers and tests read names off the
          entry module (`seed_mod.RESERVE_CLOSES_BEFORE_END`,
          `from scripts.seed_demo_business import …`), so every module-level
          name a part binds — its defs, constants AND its imports — must be
          bound on the entry module too. This fails on one that is not.
Does NOT: check behaviour (the seed and action-map tests do), or check the
          test-file splits (tests/test_meh3540_split_parts_collected.py).
          Reads source as text on purpose: the question is which names a file
          binds, and importing the seed would need a database.
History:  MEH-3542 (creation — the first split dropped four imported names,
          and test_meh2808_rescue_bag_window caught one of them).
"""

import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PART_RE = re.compile(r"^_(.+)_p\d\d\.py$")
SCAN = [ROOT / "backend" / "scripts", ROOT / "scripts" / "release"]


def bound_names(source: str) -> set[str]:
    out: set[str] = set()
    for n in ast.parse(source).body:
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            out.add(n.name)
        elif isinstance(n, (ast.Import, ast.ImportFrom)):
            if isinstance(n, ast.ImportFrom) and n.module == "__future__":
                continue
            out |= {(a.asname or a.name).split(".")[0] for a in n.names}
        elif isinstance(n, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
            targets = n.targets if isinstance(n, ast.Assign) else [n.target]
            for t in targets:
                out |= {s.id for s in ast.walk(t) if isinstance(s, ast.Name)}
    return out


def missing(part_src: str, entry_src: str) -> set[str]:
    return bound_names(part_src) - bound_names(entry_src)


def split_parts() -> list[Path]:
    return sorted(p for d in SCAN for p in d.glob("_*_p[0-9][0-9].py") if PART_RE.match(p.name))


def test_self_test_flags_a_name_the_entry_does_not_bind():
    part = "import os\nfrom x import CONST\nLIMIT = 3\n\n\ndef helper():\n    pass\n"
    entry_ok = "from _m_p01 import (  # noqa: F401\n    CONST,\n    LIMIT,\n    helper,\n    os,\n)\n"
    entry_short = "from _m_p01 import LIMIT, helper  # noqa: F401\n"
    assert missing(part, entry_ok) == set()
    assert missing(part, entry_short) == {"CONST", "os"}


def test_self_test_on_the_real_seed_split():
    # Anchored to the real files: the import the first split dropped.
    part = (ROOT / "backend/scripts/_seed_demo_business_p01.py").read_text(encoding="utf-8")
    entry = (ROOT / "backend/scripts/seed_demo_business.py").read_text(encoding="utf-8")
    assert "RESERVE_CLOSES_BEFORE_END" in bound_names(part)
    assert missing(part, entry) == set()
    broken = re.sub(r"\n    RESERVE_CLOSES_BEFORE_END,\n", "\n", entry, count=1)
    assert broken != entry, "control: the re-export line was not found"
    assert missing(part, broken) == {"RESERVE_CLOSES_BEFORE_END"}


def test_every_part_name_is_bound_on_its_entry_module():
    found = split_parts()
    assert len(found) >= 6, "control: no split parts found — the scan is looking in the wrong place"
    problems = []
    for part in found:
        entry = part.with_name(PART_RE.match(part.name).group(1) + ".py")
        if not entry.exists():
            problems.append(f"{part.name}: no entry module {entry.name}")
            continue
        gap = missing(part.read_text(encoding="utf-8"), entry.read_text(encoding="utf-8"))
        problems += [f"{part.name}::{n} is not bound on {entry.name}" for n in sorted(gap)]
    assert problems == []
