"""MEH-2894 — the generated action map (docs/release/action-map.md) is complete
and fresh.

Fails when:
  (a) a tool in frontend/lib/business-features.js has no row;
  (b) an API route the app serves has no row and is not on the explicit
      INTERNAL_ROUTES allowlist (and an allowlist entry that no longer resolves
      to a route also fails — a stale allowlist would hide nothing honestly);
  (c) a section §1–§9 of docs/audits/2026-11-implicit-state-machines.md has no
      row;
  (d) the committed doc differs from a fresh generation (line numbers of test
      citations masked — see DRIFT in scripts/release/action_map.py).

No database: the generator imports the app and reads `app.routes`; it never
connects. The repo's conftest still provisions one in CI (autouse fixtures);
nothing here uses it.

Every count below is checked against a second, independent reading of the same
source (a different regex, the app's own OpenAPI document), so a parser that
silently reads nothing cannot pass by agreeing with itself (testing.md, MEH-1619
and «A probe whose null output is also its reassuring output»).
"""

from __future__ import annotations

import functools
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


@functools.lru_cache(maxsize=1)
def _generated():
    """One real generation per session (~5 s): the map and its rendering."""
    m = am.generate()
    return m, am.render(m)


def _app():
    return am.load_app()


# ── (a) business tools ──────────────────────────────────────────────────────


def test_every_business_tool_has_a_row():
    text = am.FEATURES_PATH.read_text(encoding="utf-8")
    block = text[text.index("export const BUSINESS_FEATURES") :]
    block = block[: block.index("\n];")]
    # Independent reading: every `id: "…"` inside the array, by a different regex.
    independent = re.findall(r"\bid:\s*\"([^\"]+)\"", block)
    parsed = [t.id for t in am.parse_business_features(text)]
    # Control: the registry is not empty and the parser read all of it.
    assert len(independent) > 40, "the independent reading found too few tools"
    assert parsed == independent, set(independent) ^ set(parsed)

    m, _ = _generated()
    rows = [r.tool.id for r in m.tool_rows]
    assert rows == independent, f"tools without a row: {set(independent) - set(rows)}"


# ── (b) API routes ──────────────────────────────────────────────────────────


def test_every_route_has_a_row_or_a_reasoned_allowlist_entry():
    app = _app()
    m, _ = _generated()
    in_map = {(meth, r.route.path) for r in m.route_rows for meth in r.route.methods}
    internal = {
        (meth, r.route.path) for r in m.internal_rows for meth in r.route.methods
    }

    # Independent reading: the app's own OpenAPI document (FastAPI builds it
    # from the same routers by a different walk). HEAD is not in the schema.
    schema = {
        (method.upper(), path)
        for path, ops in app.openapi()["paths"].items()
        for method in ops
    }
    assert len(schema) > 200, "the OpenAPI reading found too few operations"
    missing = {(meth, p) for meth, p in schema if (meth, p) not in in_map | internal}
    assert not missing, f"routes with no row and no allowlist entry: {sorted(missing)}"

    # Every row is a route that exists (no phantom rows), and every allowlist
    # entry still names a served path.
    served = {(meth, r.path) for r in am.collect_routes(app) for meth in r.methods}
    assert in_map <= served
    served_paths = {p for _, p in served}
    stale = set(am.INTERNAL_ROUTES) - served_paths
    assert not stale, f"INTERNAL_ROUTES entries that resolve to no route: {stale}"
    assert set(m.non_api) <= set(am.INTERNAL_NON_API_ROUTES), (
        "a non-API route appeared without an allowlist reason: "
        f"{set(m.non_api) - set(am.INTERNAL_NON_API_ROUTES)}"
    )


# ── (c) audit sections ──────────────────────────────────────────────────────


def test_every_audit_section_has_a_row():
    text = am.AUDIT_PATH.read_text(encoding="utf-8")
    independent = sorted(
        int(n) for n in re.findall(r"(?m)^## (\d+)\. ", text) if 1 <= int(n) <= 9
    )
    assert independent == list(range(1, 10)), independent
    m, _ = _generated()
    with_rows = {r.section for r in m.machine_rows}
    assert set(independent) <= with_rows, (
        f"sections with no row: {set(independent) - with_rows}"
    )


# ── (d) freshness ───────────────────────────────────────────────────────────


def test_committed_doc_matches_a_fresh_generation():
    _, fresh = _generated()
    committed = am.DOC_PATH.read_text(encoding="utf-8")
    assert am.mask_lines(committed) == am.mask_lines(fresh), (
        "docs/release/action-map.md is stale — run: "
        "PYTHONPATH=backend:. python scripts/release/action_map.py --write"
    )


def test_line_mask_hides_only_line_numbers():
    """The mask must not hide a coverage change: a status flip or a different
    file still differs after masking; a moved line does not."""
    a = "| `tests/test_x.py:10` | GAP |"
    assert am.mask_lines(a) == am.mask_lines("| `tests/test_x.py:99` | GAP |")
    assert am.mask_lines(a) != am.mask_lines("| `tests/test_y.py:10` | GAP |")
    assert am.mask_lines(a) != am.mask_lines(
        "| `tests/test_x.py:10` | `tests/z.py:1` |"
    )


# ── self-test of the instrument (MEH-1909) ──────────────────────────────────


def _synthetic_app():
    from fastapi import Depends, FastAPI

    from app.auth import require_admin

    app = FastAPI()

    @app.post("/zz-selftest/{item_id}")
    def zz_selftest(item_id: str, user=Depends(require_admin)):
        return {}

    @app.get("/zz-never-called")
    def zz_never_called():
        return {}

    return app


_SYNTHETIC_TEST = """
BASE = "/zz-selftest"


def _url(x):
    return f"{BASE}/{x}"


def test_admin_can(client):
    r = client.post(_url("a"), headers={})
    assert r.status_code == 200


def test_consumer_cannot(client):
    r = client.post(f"/zz-selftest/{1}", headers={})
    assert r.status_code == 403
"""


def test_selftest_a_synthetic_route_is_reported_with_its_actor_and_cells():
    app = _synthetic_app()
    routes = am.collect_routes(app)
    by_path = {r.path: r for r in routes}
    assert by_path["/zz-selftest/{item_id}"].actor == "admin"
    assert by_path["/zz-never-called"].actor == "anonymous"

    ev = am.Evidence(
        routes=routes,
        pytest=am.build_pytest_index(
            sources={"tests/test_zz_synthetic.py": _SYNTHETIC_TEST}
        ),
        e2e=am.E2EIndex([], []),
        vitest=am.VitestIndex({}, {}),
    ).index()
    rows = {r.route.path: r for r in am.build_route_rows(ev)}

    gated = rows["/zz-selftest/{item_id}"]
    # The helper `_url(...)` and the module constant resolve; the call that is
    # only refused does not count as the positive cell.
    assert (
        gated.pos.status == "covered"
        and gated.pos.where == "tests/test_zz_synthetic.py:10"
    )
    assert (
        gated.neg.status == "covered"
        and gated.neg.where == "tests/test_zz_synthetic.py:16"
    )
    # Discrimination: a route no test calls is a GAP, not covered.
    assert rows["/zz-never-called"].pos.status == am.GAP


def test_selftest_a_synthetic_tool_line_is_parsed():
    text = am.FEATURES_PATH.read_text(encoding="utf-8")
    anchor = "export const BUSINESS_FEATURES = [\n"
    assert anchor in text
    fake = (
        '  { id: "zz_selftest_tool", group: "page", status: "live", codeRef: '
        '["frontend/app/[locale]/producer/[id]/x.jsx", "backend/app/routers/health.py"], '
        'dashboard: { home: "tools", href: "/producer/dashboard/zz" } },\n'
    )
    tools = {
        t.id: t for t in am.parse_business_features(text.replace(anchor, anchor + fake))
    }
    assert tools["zz_selftest_tool"].code_refs == [
        "frontend/app/[locale]/producer/[id]/x.jsx",
        "backend/app/routers/health.py",
    ]
    assert tools["zz_selftest_tool"].dashboard == "/producer/dashboard/zz"
    # Anchored to the real file: a known entry, with its `[locale]` codeRef intact.
    real = {t.id: t for t in am.parse_business_features(text)}
    assert real["group_buys"].dashboard == "/producer/dashboard/group-buys"
    assert real["gallery_story"].code_refs[0] == (
        "frontend/app/[locale]/producer/[id]/components/OwnerCard.jsx"
    )


def test_selftest_every_real_citation_points_at_what_it_claims():
    """Over the REAL corpus: every `covered` pytest cell cites a line holding
    an HTTP call (or a table row naming a method), every E2E page cell a line
    holding `.goto(`. A matcher that drifted onto the wrong line fails here."""
    m, _ = _generated()
    checked = 0
    for rr in m.route_rows + m.internal_rows:
        cell = rr.pos
        if cell.status != "covered":
            continue
        f, line = cell.where.rsplit(":", 1)
        src = (ROOT / f).read_text(encoding="utf-8").splitlines()[int(line) - 1]
        assert re.search(
            r"\.(get|post|put|patch|delete|head|request)\(|\"(get|post|put|patch|delete)\"",
            src,
            re.I,
        ), (
            rr.route.key,
            cell.where,
            src,
        )
        checked += 1
    for pr in m.page_rows:
        if pr.e2e.status == "covered":
            f, line = pr.e2e.where.rsplit(":", 1)
            src = (ROOT / f).read_text(encoding="utf-8").splitlines()[int(line) - 1]
            assert ".goto(" in src, (pr.page.route, pr.e2e.where, src)
            checked += 1
    assert checked > 250, f"only {checked} citations checked — the map is near-empty"
