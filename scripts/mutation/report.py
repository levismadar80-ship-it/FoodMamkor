"""
Module:   report (mutation)
Purpose:  Turn a finished mutmut run into a per-file score and a list of NEW
          surviving mutants — ones not explained in the survivors file.
Touches:  reads backend/mutants/**/*.meta and backend/mutants/**/*.py only.
Does NOT: run mutmut (scripts/mutation/run.sh does) or pick files/tests
          ([tool.mutmut] in backend/pyproject.toml does).
Related:  scripts/mutation/run.sh, backend/mutation-survivors.txt,
          tests/test_meh3295_mutation_report.py (self-test against a real run's shape).
History:  MEH-3295 (creation).

A mutant is identified by a FINGERPRINT, not by mutmut's name: mutmut numbers
mutants per function (`x_require_admin__mutmut_7`) and the numbers shift when
the function changes. The fingerprint is `<file>::<function>: <old> => <new>`,
built from the first line that differs between the original function and the
mutant, so an unrelated edit leaves it unchanged.

Exit codes: 0 = no new survivor · 1 = at least one new survivor ·
2 = the run is void (no mutants, or nothing killed — a dead runner looks like a
perfect score).
"""

from __future__ import annotations

import argparse
import ast
import difflib
import json
import sys
from collections import Counter
from pathlib import Path

# REUSES: mutmut/stats.py status_by_exit_code (mutmut 3.8.1).
KILLED = {1, 3, 37}
SURVIVED = {0}
NO_TESTS = {5, 33}
TIMEOUT = {24, -24, 36, 152, 255}

MARK = "__mutmut_"


def _functions(source: str) -> dict[str, str]:
    """Name -> source text of every function definition in a mutants file."""
    tree = ast.parse(source)
    out: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            seg = ast.get_source_segment(source, node)
            if seg is not None:
                out[node.name] = seg
    return out


def _body(src: str) -> list[str]:
    """Function lines without the `def` line, so the name does not differ."""
    lines = src.splitlines()
    for i, line in enumerate(lines):
        if line.rstrip().endswith(":"):
            return [x.strip() for x in lines[i + 1 :]]
    return [x.strip() for x in lines[1:]]


def fingerprint(rel_file: str, mutant_key: str, funcs: dict[str, str]) -> str:
    """`app/auth.py::require_admin: if user.role != "admin": => if user.role == "admin":`."""
    func_name = mutant_key.rsplit(".", 1)[-1]
    base = func_name.split(MARK)[0]
    orig = funcs.get(base + MARK + "orig")
    mut = funcs.get(func_name)
    human = base[2:] if base.startswith("x_") else base
    human = human.replace("ǁ", ".").strip(".")
    if orig is None or mut is None:
        return f"{rel_file}::{human}: <source not found for {func_name}>"
    old, new = _body(orig), _body(mut)
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=old, b=new).get_opcodes():
        if tag != "equal":
            before = " / ".join(old[i1:i2]) or "<nothing>"
            after = " / ".join(new[j1:j2]) or "<nothing>"
            return f"{rel_file}::{human}: {before} => {after}"
    return f"{rel_file}::{human}: <identical body>"


def load_explained(path: Path) -> dict[str, str]:
    """Survivors file: `<fingerprint>  ## <reason>` per line, `#` comments."""
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.lstrip().startswith("# "):
            continue
        fp, _, reason = raw.partition("  ## ")
        out[fp.strip()] = reason.strip()
    return out


def collect(mutants_dir: Path) -> tuple[dict[str, Counter[str]], list[str]]:
    per_file: dict[str, Counter[str]] = {}
    survivors: list[str] = []
    for meta in sorted(mutants_dir.rglob("*.py.meta")):
        rel = meta.relative_to(mutants_dir).as_posix()[: -len(".meta")]
        data = json.loads(meta.read_text(encoding="utf-8"))
        codes = data.get("exit_code_by_key", {})
        if not codes:
            continue  # copied for imports only (source_paths = app), not mutated
        src_path = meta.with_suffix("")
        funcs = _functions(src_path.read_text(encoding="utf-8"))
        c: Counter[str] = Counter()
        for key, code in codes.items():
            if code in KILLED:
                c["killed"] += 1
            elif code in SURVIVED:
                c["survived"] += 1
                survivors.append(fingerprint(rel, key, funcs))
            elif code in NO_TESTS:
                c["no tests"] += 1
                survivors.append(fingerprint(rel, key, funcs) + "  [no test runs this]")
            elif code in TIMEOUT:
                c["timeout"] += 1
            elif code is None:
                c["not checked"] += 1
            else:
                c["suspicious"] += 1
        per_file[rel] = c
    return per_file, survivors


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mutants", type=Path, required=True)
    ap.add_argument("--survivors", type=Path, required=True)
    args = ap.parse_args(argv)

    per_file, survivors = collect(args.mutants)
    total = sum(sum(c.values()) for c in per_file.values())
    killed = sum(c["killed"] for c in per_file.values())
    if total == 0 or killed == 0:
        print(
            f"MUTATION VOID: {total} mutants, {killed} killed — the runner did not run; every number here is meaningless."
        )
        return 2

    print("file | mutants | killed | survived | no tests | timeout | score")
    for rel, c in per_file.items():
        n = sum(c.values())
        denom = c["killed"] + c["survived"] + c["no tests"]
        score = f"{100 * c['killed'] / denom:.1f}%" if denom else "n/a"
        print(
            f"{rel} | {n} | {c['killed']} | {c['survived']} | {c['no tests']} | {c['timeout']} | {score}"
        )
    print(f"TOTAL | {total} | {killed} | {len(survivors)} survivors (incl. no-tests)")

    explained = load_explained(args.survivors)
    new = [s for s in survivors if s.split("  [")[0] not in explained]
    stale = sorted(set(explained) - {s.split("  [")[0] for s in survivors})
    for s in new:
        print(f"NEW SURVIVOR: {s}")
    for s in stale:
        print(f"STALE EXPLANATION (no longer survives — delete the line): {s}")
    print(
        f"new survivors: {len(new)} · explained: {len(survivors) - len(new)} · stale lines: {len(stale)}"
    )
    return 1 if new else 0


if __name__ == "__main__":
    sys.exit(main())
