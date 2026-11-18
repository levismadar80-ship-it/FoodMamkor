"""No long list written on a single line in tracked source/config files.

Why (14/11/2026): `[tool.mypy].files` in backend/pyproject.toml was one
~3,900-character line with 127 entries. Every PR that typed a new module
edited that same line, so any two such PRs conflicted (19 of 45 open branches
touched it). Resolving a one-line conflict by hand is where an entry can be
dropped silently, and a dropped entry means that module quietly loses strict
mypy. Lists like that go one entry per line, sorted, so parallel additions
land on different lines.

Rule: a tracked line longer than MAX_LEN characters that holds MIN_ITEMS or
more quoted list items fails. Generated, vendored, data and lock files are
skipped. A line can opt out with `guard-ok:` on it.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MAX_LEN = 400
MIN_ITEMS = 15
SKIP = re.compile(
    r"\.(json|lock|svg|map|tsv|txt|md|webp|png|jpe?g|gif|csv|patch|html|ico|woff2?|pdf|bundle|snap)$"
    r"|(^|/)generated/|^design-reference/|^qa-artifacts/"
)
ITEM = re.compile(r"""["'][^"'\n]{1,120}["']\s*,\s*""")


def offending_lines(text: str) -> list[int]:
    """1-based numbers of the lines that are long one-line lists."""
    out = []
    for i, line in enumerate(text.split("\n"), 1):
        if len(line) > MAX_LEN and "guard-ok:" not in line:
            if len(ITEM.findall(line)) >= MIN_ITEMS:
                out.append(i)
    return out


def _tracked_files() -> list[str]:
    res = subprocess.run(
        ["git", "ls-files"], cwd=REPO, capture_output=True, text=True, check=True
    )
    return [f for f in res.stdout.split("\n") if f]


def test_classifier_self_check() -> None:
    one_line = "files = [" + ", ".join(f'"app/m{i}.py"' for i in range(40)) + "]"
    per_line = "files = [\n" + "".join(f'    "app/m{i}.py",\n' for i in range(40)) + "]"
    prose = "x = '" + "word " * 200 + "'"
    assert offending_lines(one_line) == [1]
    assert offending_lines(per_line) == []
    assert offending_lines(prose) == []
    assert offending_lines(one_line + "  # guard-ok: reason") == []


def test_classifier_flags_real_pyproject_collapsed() -> None:
    """Anchored to the real file: the mypy list collapsed back to one line is caught."""
    import tomllib

    real = (REPO / "backend/pyproject.toml").read_text(encoding="utf-8")
    entries = tomllib.loads(real)["tool"]["mypy"]["files"]
    assert len(entries) >= 100
    collapsed = "files = [" + ", ".join(f'"{e}"' for e in entries) + "]"
    assert offending_lines(collapsed) == [1]
    assert offending_lines(real) == []


def test_no_long_one_line_lists_in_repo() -> None:
    files = _tracked_files()
    # Control: the listing itself must work, or every pass is void.
    assert len(files) > 1000, f"git ls-files listed {len(files)} files — listing is broken"
    assert "backend/pyproject.toml" in files
    bad = []
    for rel in files:
        if SKIP.search(rel):
            continue
        path = REPO / rel
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        bad += [f"{rel}:{n}" for n in offending_lines(text)]
    assert not bad, (
        "Long list on one line (put one entry per line, sorted): " + ", ".join(bad)
    )
