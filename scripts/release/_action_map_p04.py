"""Part 4 of 4 of `action_map.py` (MEH-3542 mechanical split).

Moved verbatim, dependencies first: this module imports only from the
parts before it. `action_map.py` re-exports every name, so callers and
tests keep using that module.
"""

from __future__ import annotations

import argparse

from _action_map_p01 import DOC_PATH  # noqa: E402
from _action_map_p01 import GAP  # noqa: E402
from _action_map_p01 import INTERNAL_NON_API_ROUTES  # noqa: E402
from _action_map_p01 import RISK_LEGEND  # noqa: E402
from _action_map_p01 import rel  # noqa: E402
from _action_map_p03 import ActionMap  # noqa: E402
from _action_map_p03 import _count  # noqa: E402
from _action_map_p03 import _counts_line  # noqa: E402
from _action_map_p03 import generate  # noqa: E402
from _action_map_p03 import render_pages  # noqa: E402
from _action_map_p03 import top_gaps  # noqa: E402


def render(am: ActionMap) -> str:
    L: list[str] = []
    a = L.append
    a(
        "<!-- GENERATED — do not edit; run python scripts/release/action_map.py --write -->"
    )
    a("# Action map")
    a("")
    a(
        "> **GENERATED — do not edit; run `python scripts/release/action_map.py --write`**"
    )
    a("> (with `PYTHONPATH=backend:.`, `ENV=test` and a `SECRET_KEY` set). Guarded by")
    a(
        "> `tests/test_action_map_complete.py`. Spec: MEH-2892 §B — anchor-plan.md on PR #4284 (card MEH-2894)."
    )
    a(">")
    a(
        "> **A report, not a gate.** Each cell is `file:line` evidence or `GAP` — a static match, never a"
    )
    a(
        "> claim that a test passes. Citations are information: nothing checks them, and they drift as"
    )
    a(
        "> tests are edited until the next `--write`. Coverage = a test that calls the route and asserts"
    )
    a(
        "> its result; `weak` = named only, or no success asserted. `e2e-mock` (a Playwright `page.route`"
    )
    a(
        "> mock — the backend never ran) is shown as information and never counts. The one guard,"
    )
    a(
        "> `tests/test_action_map_complete.py`: every backend route and every business tool has a row."
    )
    a("")
    a("## Summary")
    a("")
    rv = _count(r.verdict for r in am.route_rows)
    rn = _count(r.neg for r in am.route_rows if r.route.gated)
    tv = _count(r.verdict for r in am.tool_rows)
    pv = _count(r.verdict for r in am.page_rows)
    mv = _count(r.verdict for r in am.machine_rows)
    ev = _count(r.verdict for r in am.extra_rows)
    a("| Rows | Count | covered | weak | GAP | n/a |")
    a("|---|---|---|---|---|---|")
    a(f"| API routes (actor actions) | {len(am.route_rows)} | {_counts_line(rv)} |")
    a(
        f"| — negative cell of gated routes (401/403) | {sum(1 for r in am.route_rows if r.route.gated)} | {_counts_line(rn)} |"
    )
    a(
        f"| Internal routes (allowlisted) | {len(am.internal_rows)} + {len(am.non_api)} docs | — | — | — | — |"
    )
    a(f"| Business tools | {len(am.tool_rows)} | {_counts_line(tv)} |")
    for grp in ("public", "dashboard", "admin"):
        g = [r for r in am.page_rows if r.page.group == grp]
        a(
            f"| Pages — {grp} | {len(g)} | {_counts_line(_count(r.verdict for r in g))} |"
        )
    a(
        f"| State-machine rows (audit, every non-exempt section) | {len(am.machine_rows)} | {_counts_line(mv)} |"
    )
    a(f"| Mandatory extra rows (§B.3) | {len(am.extra_rows)} | {_counts_line(ev)} |")
    gap_total = rv[GAP] + rn[GAP] + tv[GAP] + pv[GAP] + mv[GAP] + ev[GAP]
    by_e2e = sum(1 for r in am.page_rows if r.e2e.status == "covered")
    a("")
    a(
        f"Pages opened by a CI-run Playwright spec: **{by_e2e} / {len(am.page_rows)}** — the rest are "
        "covered only by a Vitest import (which may test no more than the page's metadata)."
    )
    a("")
    a(
        f"**GAP cells in total: {gap_total}** (route positive {rv[GAP]} · route negative {rn[GAP]} · "
        f"tools {tv[GAP]} · pages {pv[GAP]} · machine rows {mv[GAP]} · extra rows {ev[GAP]}). "
        'Not a gate yet — the plan\'s gate is "no *new* GAP" (a ratchet), later.'
    )
    a("")
    a("## Top gaps by risk")
    a("")
    a(
        "Score: see «Risk score» at the end. Routes whose verdict is not `covered` or whose 401/403 cell is a GAP, plus extra rows that are not `covered`."
    )
    a("")
    a("| # | Score | Route / row | Actor | Why it is risky | Evidence |")
    a("|---|---|---|---|---|---|")
    for i, (score, what, actor, why, evid) in enumerate(top_gaps(am, 30), 1):
        a(f"| {i} | {score} | {what} | {actor} | {why} | {evid} |")
    a("")
    a("## API routes")
    a("")
    a(
        "Registration order of the app. Actor from the dependency tree: `require_admin` → admin; "
        "`require_producer` / `require_verified_producer` → business (organizers are producers with "
        '`kind == "organizer"` and pass unless the handler refuses that kind); `get_current_user` → '
        "registered user; otherwise anonymous."
    )
    a("")
    a(
        "| # | Method | Path | Handler | Actor | Positive | Negative (401/403) | E2E | Score |"
    )
    a("|---|---|---|---|---|---|---|---|---|")
    for rr in am.route_rows:
        r = rr.route
        actor = r.actor_label + (f" · {', '.join(r.flags)}" if r.flags else "")
        e2e = rr.e2e.render() if rr.e2e else "—"
        a(
            f"| {r.order} | {','.join(r.methods)} | `{r.path}` | `{r.module}.{r.func}` | {actor} | {rr.pos.render()} | "
            f"{rr.neg.render()} | {e2e} | {rr.score} |"
        )
    a("")
    a("### Internal routes (allowlisted — not actor actions)")
    a("")
    a("| # | Method | Path | Handler | Reason | Test |")
    a("|---|---|---|---|---|---|")
    for rr in am.internal_rows:
        r = rr.route
        a(
            f"| {r.order} | {','.join(r.methods)} | `{r.path}` | `{r.module}.{r.func}` | {r.internal_reason} | {rr.pos.render()} |"
        )
    for p in am.non_api:
        a(
            f"| — | GET | `{p}` | — | {INTERNAL_NON_API_ROUTES.get(p, 'not an API route (NOT ALLOWLISTED)')} | n/a |"
        )
    a("")
    a("## Business tools (`frontend/lib/business-features.js`)")
    a("")
    a(
        "| Tool | Group | Status | Dashboard | Backend | Unit (import) | E2E page | Verdict |"
    )
    a("|---|---|---|---|---|---|---|---|")
    for tr in am.tool_rows:
        t = tr.tool
        a(
            f"| `{t.id}` | {t.group} | {t.status} | {('`' + t.dashboard + '`') if t.dashboard else '—'} | "
            f"{tr.backend.render()} | {tr.unit.render()} | {tr.page.render()} | "
            f"{tr.verdict.status}{' (capped by its router)' if tr.verdict.note == 'capped by its router' else ''} |"
        )
    a("")
    L.extend(render_pages(am.page_rows))
    a("## State machines (`docs/audits/2026-11-implicit-state-machines.md`)")
    a("")
    a(
        "A site `file:line` is mapped to the route whose handler contains it (or reaches it within six "
        "helper hops in the same module); the row takes the WORST verdict of the routes it reaches. The audit's line numbers "
        "are as of 09/11 — where a file moved since, the row says so (see `ModuleMap.routes_for`)."
    )
    a("")
    a("| § | Transition / write | Site | Routes reached | Verdict | Note |")
    a("|---|---|---|---|---|---|")
    for mr in am.machine_rows:
        routes = ", ".join(f"`{k}`" for k in mr.routes) or "—"
        a(
            f"| {mr.section} | {mr.transition} | {mr.site or '—'} | {routes} | {mr.verdict.render()} | {mr.note or '—'} |"
        )
    a("")
    a("## Mandatory extra rows (§B.3)")
    a("")
    a(
        "A row is covered when one test function calls the listed route(s) and matches the row's "
        "condition (status in the call window, a word in the test). `weak` = only a grep hit, no route call."
    )
    a("")
    a("| Kind | Row | Evidence | Note | Score |")
    a("|---|---|---|---|---|")
    for er in am.extra_rows:
        a(
            f"| {er.extra.kind} | {er.extra.title} | {er.verdict.render()} | {er.note or '—'} | {er.score} |"
        )
    a("")
    a("## Risk score")
    a("")
    a(
        "Add up, for a route: its method and actor terms, then every other term that applies — the «Why» "
        "column of «Top gaps» names those (method and actor are in the row: «Route» and «Actor»)."
    )
    a("")
    a("| Term | Weight |")
    a("|---|---|")
    for term, weight in RISK_LEGEND:
        a(f"| {term} | {weight} |")
    a("")
    a(
        "A §B.3 extra row: its primary route's terms above (the coverage terms excluded), plus race 3 / "
        "time 2 / negative 2, plus 4 if GAP or 2 if weak. The «business mutations» row uses 3 + 2."
    )
    a("")
    return "\n".join(L)


def summary_text(am: ActionMap) -> str:
    out = []
    rv = _count(r.verdict for r in am.route_rows)
    rn = _count(r.neg for r in am.route_rows if r.route.gated)
    out.append(f"routes {len(am.route_rows)} (+{len(am.internal_rows)} internal): {rv}")
    out.append(
        f"route negatives (gated {sum(1 for r in am.route_rows if r.route.gated)}): {rn}"
    )
    out.append(f"tools {len(am.tool_rows)}: {_count(r.verdict for r in am.tool_rows)}")
    out.append(f"pages {len(am.page_rows)}: {_count(r.verdict for r in am.page_rows)}")
    out.append(
        f"machine rows {len(am.machine_rows)}: {_count(r.verdict for r in am.machine_rows)}"
    )
    out.append(
        f"extra rows {len(am.extra_rows)}: {_count(r.verdict for r in am.extra_rows)}"
    )
    out.append("top gaps:")
    for i, (score, what, actor, why, evid) in enumerate(top_gaps(am, 20), 1):
        out.append(f"  {i:2}. [{score}] {what} — {actor} — {why}")
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument(
        "--write", action="store_true", help="regenerate docs/release/action-map.md"
    )
    args = ap.parse_args(argv)
    am = generate()
    if args.write:
        DOC_PATH.parent.mkdir(parents=True, exist_ok=True)
        DOC_PATH.write_text(render(am), encoding="utf-8")
        print(f"wrote {rel(DOC_PATH)}")
    print(summary_text(am))
    return 0
