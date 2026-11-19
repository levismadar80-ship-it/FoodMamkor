"""
Module:   clone_ratchet
Purpose:  Find blocks of code copied between two files (8+ meaningful lines in
          a row, the same after whitespace) and compare them with a frozen
          baseline, so the copy-paste debt can only shrink.
Touches:  nothing — reads tracked source files, prints, exits 0/1.
Does NOT: judge whether a copy is fine (that is a reviewer's call), look inside
          one file, or count tests / generated code / alembic revisions.
Related:  scripts/checks/clone-ratchet.sh (the guard), clone-baseline.txt.
History:  MEH-3464 (creation, the whole-codebase duplication sweep).

The industry form of this is a duplication scanner with a ratchet (SonarQube
"duplicated lines on new code", jscpd with a threshold); this is the same idea
with no new dependency.
"""
from __future__ import annotations

import hashlib
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

WINDOW = 8
ROOTS = ("backend/app/", "frontend/app/", "frontend/components/", "frontend/lib/")
SOURCE = re.compile(r"\.(py|js|jsx|ts|tsx|mjs)$")
SKIP = re.compile(r"(^|/)(__tests__|tests?|e2e)/|\.test\.|\.spec\.|^frontend/lib/generated/")
# A line that carries no logic of its own: blank, comment, import, or bare
# punctuation. Dropped before windows are formed, so two files that share only
# boilerplate do not count as a copy.
NOISE = re.compile(
    r"^($|//|/\*|\*|#|\"\"\"|import |from \S+ import |export \{|[\s\)\]\}\(\[\{;,:<>/]*$|\"use client\")"
)


def meaningful_lines(text: str) -> list[str]:
    out = []
    for raw in text.splitlines():
        line = " ".join(raw.split())
        if NOISE.match(line) or len(line) < 4:
            continue
        out.append(line)
    return out


def tracked_sources(root: Path) -> list[str]:
    files = subprocess.run(
        ["git", "ls-files", *ROOTS], cwd=root, capture_output=True, text=True, check=True
    ).stdout.split()
    return [f for f in files if SOURCE.search(f) and not SKIP.search(f)]


def clone_pairs(root: Path, files: list[str]) -> dict[str, int]:
    """Return {"a|b": shared-window-count} for every pair of files sharing a window."""
    owners: dict[str, set[str]] = defaultdict(set)
    for f in files:
        p = root / f
        if not p.is_file():
            continue
        lines = meaningful_lines(p.read_text(encoding="utf-8", errors="replace"))
        for i in range(len(lines) - WINDOW + 1):
            digest = hashlib.sha1("\n".join(lines[i : i + WINDOW]).encode()).hexdigest()
            owners[digest].add(f)
    pairs: dict[str, int] = defaultdict(int)
    for group in owners.values():
        if len(group) < 2:
            continue
        ordered = sorted(group)
        for i, a in enumerate(ordered):
            for b in ordered[i + 1 :]:
                pairs[f"{a}|{b}"] += 1
    return dict(pairs)


def read_baseline(path: Path) -> dict[str, int]:
    base: dict[str, int] = {}
    if not path.is_file():
        return base
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        count, pair = line.split(maxsplit=1)
        base[pair] = int(count)
    return base


def write_baseline(path: Path, pairs: dict[str, int]) -> None:
    header = (
        "# clone-ratchet baseline (MEH-3464): <shared 8-line windows> <file-a>|<file-b>\n"
        "# Copy-paste debt that existed when the guard landed. Lines only go away or\n"
        "# get smaller; a new pair or a bigger number fails Repo guards.\n"
    )
    body = "".join(f"{n} {pair}\n" for pair, n in sorted(pairs.items()))
    path.write_text(header + body, encoding="utf-8")


def compare(found: dict[str, int], base: dict[str, int]) -> tuple[list[str], list[str]]:
    grown = [
        f"{pair.replace('|', '  ↔  ')}: {n} shared windows (baseline {base.get(pair, 0)})"
        for pair, n in sorted(found.items())
        if n > base.get(pair, 0)
    ]
    shrunk = [pair for pair, n in sorted(base.items()) if found.get(pair, 0) < n]
    return grown, shrunk


def self_test() -> int:
    """Control: a copied block between two fake files must be found; boilerplate must not."""
    block = "\n".join(f"const value{i} = compute(input, {i});" for i in range(WINDOW))
    assert len(meaningful_lines(block)) == WINDOW
    assert meaningful_lines("import x from 'y';\n}\n// c\n\n") == []
    import tempfile

    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        (root / "a.js").write_text("let a = 1;\n" + block + "\n")
        (root / "b.js").write_text(block + "\nlet b = 2;\n")
        (root / "c.js").write_text("import z from 'z';\n}\n")
        pairs = clone_pairs(root, ["a.js", "b.js", "c.js"])
    assert pairs == {"a.js|b.js": 1}, pairs
    grown, shrunk = compare({"a.js|b.js": 2}, {"a.js|b.js": 1})
    assert len(grown) == 1 and shrunk == []
    grown, shrunk = compare({}, {"a.js|b.js": 1})
    assert grown == [] and shrunk == ["a.js|b.js"]
    print("clone-ratchet self-test: ok (copy found, boilerplate ignored, grow → red, shrink → note)")
    return 0


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        return self_test()
    root = Path(argv[1]) if len(argv) > 1 and not argv[1].startswith("--") else Path(".")
    baseline = root / "scripts/checks/clone-baseline.txt"
    files = tracked_sources(root)
    if len(files) < 100:
        print(f"clone-ratchet: only {len(files)} source files found — the scan would see nothing; failing.")
        return 1
    found = clone_pairs(root, files)
    if "--update-baseline" in argv:
        write_baseline(baseline, found)
        print(f"clone-ratchet: baseline written, {len(found)} pairs.")
        return 0
    grown, shrunk = compare(found, read_baseline(baseline))
    for pair in shrunk:
        print(f"  note: {pair.replace('|', '  ↔  ')} shrank — run with --update-baseline to lock it in.")
    if grown:
        print("clone-ratchet: code copied between files (8+ lines the same). Use the existing one,")
        print("or extract a shared helper / component; see frontend/components/CLAUDE.md.")
        for line in grown:
            print(f"  NEW  {line}")
        return 1
    print(f"clone-ratchet: ok — {len(files)} files, {len(found)} known pairs, no new copy.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
