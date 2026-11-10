"""MEH-2894 — every backend route and every business tool has a row in the
action map (docs/release/action-map.md).

The map is a generated REPORT (Sapir 10/11, option ג): nothing here compares
its cells or its `file:line` citations with the code — those are information
and drift until the next `python scripts/release/action_map.py --write`.
What IS guarded is completeness, matched by identity and never by line:

  - a route the app serves  → a row with the same METHOD, path and handler
    (`module.function`) in the «API routes» table or the allowlisted
    «Internal routes» table;
  - a tool in frontend/lib/business-features.js → a row with the same id.

Runs where pytest runs (backend PRs and the pre-release full run). No
database: the app is imported, never connected to; the repo conftest's DB
fixtures are not used by these tests.

Fix when red: `PYTHONPATH=backend:. python scripts/release/action_map.py --write`.
"""

from __future__ import annotations

import importlib.util
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("ENV", "test")

_SPEC = importlib.util.spec_from_file_location(
    "action_map", ROOT / "scripts" / "release" / "action_map.py"
)
am = importlib.util.module_from_spec(_SPEC)
sys.modules["action_map"] = am  # dataclasses resolve their module by name
_SPEC.loader.exec_module(am)

DOC = ROOT / "docs" / "release" / "action-map.md"
FIX = "run: PYTHONPATH=backend:. python scripts/release/action_map.py --write"


def _cells(line: str) -> list[str]:
    return [c.strip() for c in re.split(r"(?<!\\)\|", line.strip())[1:-1]]


def _doc_route_rows(doc: str) -> set[tuple[str, str, str]]:
    """(METHODS, path, module.function) of every row of the two route tables,
    read straight from the committed report — not through the generator."""
    rows, inside = set(), False
    for line in doc.splitlines():
        if line.startswith("## "):
            inside = line.startswith("## API routes")
            continue
        if not inside or not line.startswith("| "):
            continue
        c = _cells(line)
        if len(c) >= 4 and c[0].isdigit():  # `| # | Method | Path | Handler | …`
            rows.add((c[1], c[2].strip("`"), c[3].strip("`")))
    return rows


def _doc_tool_ids(doc: str) -> set[str]:
    ids, inside = set(), False
    for line in doc.splitlines():
        if line.startswith("## "):
            inside = line.startswith("## Business tools")
            continue
        if inside and line.startswith("| `"):
            ids.add(_cells(line)[0].strip("`"))
    return ids


def _app_routes() -> set[tuple[str, str, str]]:
    routes = am.collect_routes(am.load_app())
    return {(",".join(r.methods), r.path, f"{r.module}.{r.func}") for r in routes}


def missing_route_rows(app_routes, doc: str) -> set[tuple[str, str, str]]:
    return set(app_routes) - _doc_route_rows(doc)


def test_every_backend_route_has_a_row():
    app_routes = _app_routes()
    # Controls: the walk reached the included routers (the app's own OpenAPI
    # schema is a subset of what was collected), and the report's table parsed.
    schema = {
        (m.upper(), p)
        for p, ops in am.load_app().openapi()["paths"].items()
        for m in ops
    }
    collected = {(m, p) for ms, p, _ in app_routes for m in ms.split(",")}
    assert len(app_routes) > 200 and schema <= collected
    doc = DOC.read_text(encoding="utf-8")
    assert len(_doc_route_rows(doc)) > 200, "the report's route tables did not parse"

    missing = missing_route_rows(app_routes, doc)
    assert not missing, f"routes with no row in {DOC.name} — {FIX}:\n" + "\n".join(
        f"  {m} {p} ({h})" for m, p, h in sorted(missing, key=lambda x: (x[1], x[0]))
    )


def test_every_internal_allowlist_entry_is_a_real_route():
    """INTERNAL_ROUTES exempts paths from the actor table; an entry whose
    route was removed or renamed would exempt nothing and say so nowhere."""
    served = {p for _, p, _ in _app_routes()}
    stale = set(am.INTERNAL_ROUTES) - served
    assert not stale, (
        f"INTERNAL_ROUTES entries that resolve to no route: {sorted(stale)}"
    )


def test_every_business_tool_has_a_row():
    text = am.FEATURES_PATH.read_text(encoding="utf-8")
    block = text[text.index("export const BUSINESS_FEATURES") :]
    block = block[: block.index("\n];")]
    # An independent reading of the registry (a plain `id:` regex), so a
    # parser that silently skips an entry cannot agree with itself.
    registry = set(re.findall(r"\bid:\s*\"([^\"]+)\"", block))
    assert len(registry) > 40, "the registry reading found too few tools"
    assert registry == {t.id for t in am.parse_business_features(text)}

    missing = registry - _doc_tool_ids(DOC.read_text(encoding="utf-8"))
    assert not missing, f"tools with no row in {DOC.name} — {FIX}: {sorted(missing)}"


def test_the_guard_reports_a_route_without_a_row():
    """The guard itself can fail: a route the report has never heard of — or
    one whose handler was renamed — is reported, by identity, not by line."""
    doc = DOC.read_text(encoding="utf-8")
    real = next(iter(sorted(_doc_route_rows(doc))))
    new = ("POST", "/zz-never-in-the-report", "zz.handler")
    renamed = (real[0], real[1], real[2] + "_renamed")
    assert missing_route_rows({real, new, renamed}, doc) == {new, renamed}
