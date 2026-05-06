"""MEH-458 — ADR-006 R1 enforcement.

Walks every .py file under backend/app/routers/ and asserts that no
class is defined with a direct BaseModel base. Per ADR-006 R1, all
Pydantic schemas live in backend/app/schemas/.

This catches the recurrence pattern that motivated MEH-433 audit
Drift #2 (Event + Review schemas embedded in routers).

ALLOWLIST: pre-existing R1 violations (audit Drift #2 was an
under-count). Tracked under MEH-460 with a 5-package cleanup plan.
This list shrinks over time, never grows.
"""
import ast
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ROUTERS_DIR = REPO_ROOT / "backend" / "app" / "routers"

# Pre-existing R1 violations from before MEH-458. New entries are NOT
# permitted — to add a class to a router, instead move it to
# backend/app/schemas/schemas.py per R1. Cleanup plan: MEH-460.
ALLOWLIST: dict[str, frozenset[str]] = {
    "backend/app/routers/alerts.py":      frozenset({"AlertPrefsIn", "AlertPrefsOut", "AlertContent"}),
    "backend/app/routers/chat.py":        frozenset({"ChatMessage", "ChatRequest", "ChatResponse"}),
    "backend/app/routers/producers.py":   frozenset({"ContactClickIn"}),
    "backend/app/routers/referrals.py":   frozenset({"ClaimReferralRequest"}),
    "backend/app/routers/marketing.py":   frozenset({"StatsOut", "NewsletterIn", "ContactIn"}),
    "backend/app/routers/search.py":      frozenset({"ProducerHit", "ProductHit", "CategoryHit", "SearchOut"}),
}


def _find_basemodel_classes(py_path: Path) -> set[str]:
    """Return names of classes in py_path with a direct BaseModel base."""
    tree = ast.parse(py_path.read_text(encoding="utf-8"), filename=str(py_path))
    names: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        for base in node.bases:
            base_name = base.id if isinstance(base, ast.Name) else None
            if base_name == "BaseModel":
                names.add(node.name)
                break
    return names


def test_no_unallowlisted_basemodel_in_routers():
    """ADR-006 R1: Pydantic schemas in backend/app/schemas/, never routers/.

    Allowlist documents pre-existing violations from before MEH-458; new
    violations are not permitted. To remove an entry: move the class to
    backend/app/schemas/schemas.py per R1, then drop the row here.
    """
    new_violations: dict[str, set[str]] = {}
    for py in sorted(ROUTERS_DIR.rglob("*.py")):
        if py.name == "__init__.py":
            continue
        rel = str(py.relative_to(REPO_ROOT)).replace("\\", "/")
        found = _find_basemodel_classes(py)
        allowed = ALLOWLIST.get(rel, frozenset())
        unexpected = found - allowed
        if unexpected:
            new_violations[rel] = unexpected

    if new_violations:
        msg_lines = [
            "ADR-006 R1 violation — new Pydantic schemas embedded in backend/app/routers/.",
            "Move them to backend/app/schemas/schemas.py per ADR-006 R1.",
            "If pre-existing tech debt: track under MEH-460 + add to ALLOWLIST in this file.",
            "",
        ]
        for path, names in sorted(new_violations.items()):
            msg_lines.append(f"  {path}:")
            for n in sorted(names):
                msg_lines.append(f"    - class {n}(BaseModel)")
        raise AssertionError("\n".join(msg_lines))


def test_allowlist_entries_still_exist():
    """Sanity: every ALLOWLIST entry must still match a real class.

    Prevents stagnation — if a class was moved to schemas/ but the entry
    stayed, that's silent debt that would mask a future real violation
    under the same name. Drop stale rows when MEH-460 closes them out.
    """
    stale: list[tuple[str, str]] = []
    for rel_path, allowed_names in ALLOWLIST.items():
        py = REPO_ROOT / rel_path
        if not py.exists():
            stale.append((rel_path, "<file missing>"))
            continue
        found = _find_basemodel_classes(py)
        for name in allowed_names:
            if name not in found:
                stale.append((rel_path, name))

    assert not stale, (
        "Stale ALLOWLIST entries (move R1-respect lines to schemas/ AND remove allowlist row):\n"
        + "\n".join(f"  {p}: {n}" for p, n in stale)
    )
