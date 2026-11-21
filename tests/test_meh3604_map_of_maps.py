"""MEH-3604 — docs/ARCHITECTURE.md §5 is the list of every inventory in the repo.

Three checks, each a place where something new used to arrive unregistered:
  1. every path the §5 table names exists (a list that moved or was deleted
     leaves a pointer to nothing);
  2. every tracked folder directly under backend/app/ and frontend/ is named in
     §5, so a new kind of code needs a decision on where its list lives;
  3. every table a model declares (`__tablename__`) is named in docs/DATA.md —
     `category_requests` had been missing since MEH-141.

Source-text by nature (it checks docs against the tree, testing.md MEH-3531).
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ARCH = REPO / "docs" / "ARCHITECTURE.md"
DATA = REPO / "docs" / "DATA.md"
SECTION = "## 5. Every inventory in the repo"


def _section() -> str:
    text = ARCH.read_text(encoding="utf-8")
    assert SECTION in text, f"docs/ARCHITECTURE.md lost its «{SECTION}» heading"
    rest = text[text.index(SECTION) :]
    nxt = re.search(r"\n## ", rest[3:])
    return rest[: nxt.start() + 3] if nxt else rest


def _named_paths(section: str) -> set[str]:
    out = set()
    for span in re.findall(r"`([^`\s]+)`", section):
        if "*" in span:
            continue
        if "/" in span or span.endswith((".md", ".py", ".js", ".json", ".sh", ".txt")):
            out.add(span.rstrip("/"))
    return out


def _tracked_folders() -> set[str]:
    files = subprocess.run(
        ["git", "ls-files", "backend/app", "frontend"],
        cwd=REPO, capture_output=True, text=True, check=True,
    ).stdout.splitlines()
    out = set()
    for f in files:
        parts = f.split("/")
        depth = 3 if parts[0] == "backend" else 2
        if len(parts) > depth:
            out.add("/".join(parts[:depth]))
    return out


def _model_tables() -> set[str]:
    tables = set()
    for p in (REPO / "backend" / "app" / "models").glob("*.py"):
        tables |= set(re.findall(r"__tablename__\s*=\s*[\"']([a-z_0-9]+)", p.read_text(encoding="utf-8")))
    return tables


def test_every_path_in_the_inventory_table_exists():
    missing = sorted(p for p in _named_paths(_section()) if not (REPO / p).exists())
    assert not missing, (
        "docs/ARCHITECTURE.md §5 names paths that do not exist — fix the row "
        "(the list moved) or delete it (the list is gone):\n  " + "\n  ".join(missing)
    )


def test_every_code_folder_is_named_in_the_inventory_section():
    named = _named_paths(_section())
    unnamed = sorted(d for d in _tracked_folders() if d not in named)
    assert not unnamed, (
        "A tracked folder is not named in docs/ARCHITECTURE.md §5 «Where each code "
        "folder is listed». Say which list covers it (CODE_INDEX, DATA.md, …):\n  "
        + "\n  ".join(unnamed)
    )


def test_every_model_table_is_in_data_md():
    data = DATA.read_text(encoding="utf-8")
    missing = sorted(t for t in _model_tables() if not re.search(rf"\b{t}\b", data))
    assert not missing, (
        "These tables are declared in backend/app/models/ but not described in "
        "docs/DATA.md «DB Schema»:\n  " + "\n  ".join(missing)
    )


def test_the_collectors_see_the_real_tree():
    """Control (testing.md «null output»): each collector must find known items,
    or every green above is void."""
    assert {"producers", "users", "category_requests"} <= _model_tables()
    assert {"backend/app/routers", "frontend/lib", "frontend/app"} <= _tracked_folders()
    assert "docs/CODE_INDEX.md" in _named_paths(_section())
