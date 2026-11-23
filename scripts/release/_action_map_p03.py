"""Part 3 of 4 of `action_map.py` (MEH-3542 mechanical split).

Moved verbatim, dependencies first: this module imports only from the
parts before it. `action_map.py` re-exports every name, so callers and
tests keep using that module.
"""

from __future__ import annotations
import ast
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

from _action_map_p01 import ACTOR_RANK  # noqa: E402
from _action_map_p01 import APP_DIR  # noqa: E402
from _action_map_p01 import AUDIT_PATH  # noqa: E402
from _action_map_p01 import CLOCK_RE  # noqa: E402
from _action_map_p01 import Call  # noqa: E402
from _action_map_p01 import DRIFT_TOLERANCE  # noqa: E402
from _action_map_p01 import FEATURES_PATH  # noqa: E402
from _action_map_p01 import GAP  # noqa: E402
from _action_map_p01 import HELPER_HOPS  # noqa: E402
from _action_map_p01 import LOCK_RE  # noqa: E402
from _action_map_p01 import ROOT  # noqa: E402
from _action_map_p01 import ROUTERS_DIR  # noqa: E402
from _action_map_p01 import Route  # noqa: E402
from _action_map_p01 import SERVICES_DIR  # noqa: E402
from _action_map_p01 import THREAD_RE  # noqa: E402
from _action_map_p01 import TestFunc  # noqa: E402
from _action_map_p01 import collect_routes  # noqa: E402
from _action_map_p01 import non_api_paths  # noqa: E402
from _action_map_p02 import Cell  # noqa: E402
from _action_map_p02 import Evidence  # noqa: E402
from _action_map_p02 import PageRow  # noqa: E402
from _action_map_p02 import RouteRow  # noqa: E402
from _action_map_p02 import STATUS_ORDER  # noqa: E402
from _action_map_p02 import Tool  # noqa: E402
from _action_map_p02 import ToolRow  # noqa: E402
from _action_map_p02 import _files_under  # noqa: E402
from _action_map_p02 import _python_module_import  # noqa: E402
from _action_map_p02 import _strip_ext  # noqa: E402
from _action_map_p02 import base_score  # noqa: E402
from _action_map_p02 import best  # noqa: E402
from _action_map_p02 import build_e2e_index  # noqa: E402
from _action_map_p02 import build_page_rows  # noqa: E402
from _action_map_p02 import build_pytest_index  # noqa: E402
from _action_map_p02 import build_route_rows  # noqa: E402
from _action_map_p02 import build_vitest_index  # noqa: E402
from _action_map_p02 import collect_pages  # noqa: E402
from _action_map_p02 import parse_business_features  # noqa: E402
from _action_map_p02 import worst  # noqa: E402


def build_tool_rows(
    ev: Evidence,
    tools: list[Tool],
    page_rows: list[PageRow],
    route_rows: list[RouteRow],
) -> list[ToolRow]:
    by_page_file = {pr.page.file: pr for pr in page_rows}
    by_page_route = {pr.page.route: pr for pr in page_rows}
    rows = []
    for t in tools:
        backend_cells, unit_cells, page_cells = [], [], []
        for ref in t.code_refs:
            for f in _files_under(ref):
                if f.startswith("backend/app/routers/"):
                    module = Path(f).stem
                    rr = [
                        x
                        for x in route_rows
                        if x.route.module == module and not x.route.internal_reason
                    ]
                    cov = [x for x in rr if x.verdict.status == "covered"]
                    # A router file is many tools' file: it counts as covered
                    # only when every route in it is; otherwise `weak`, with
                    # the count, because the covered route may be another
                    # tool's.
                    if cov:
                        status = "covered" if len(cov) == len(rr) else "weak"
                        backend_cells.append(
                            Cell(
                                status,
                                cov[0].verdict.where,
                                f"{len(cov)}/{len(rr)} routes in file",
                            )
                        )
                    elif rr:
                        backend_cells.append(Cell(GAP, note=f"0/{len(rr)} routes"))
                elif f.endswith(".py"):
                    strong, weak = _python_module_import(ev, f)
                    backend_cells.append(strong or weak or Cell(GAP))
                else:
                    imp = ev.vitest.imports.get(_strip_ext(f))
                    if imp:
                        unit_cells.append(Cell("covered", "%s:%d" % imp[0]))
                    else:
                        needle = f.removeprefix("frontend/")
                        hit = None
                        for vf in sorted(ev.vitest.texts):
                            idx = ev.vitest.texts[vf].find(needle)
                            if idx >= 0:
                                hit = Cell(
                                    "weak",
                                    f"{vf}:{ev.vitest.texts[vf].count(chr(10), 0, idx) + 1}",
                                    "names the file",
                                )
                                break
                        unit_cells.append(hit or Cell(GAP))
                    if f in by_page_file:
                        page_cells.append(by_page_file[f].e2e)
        if t.dashboard and t.dashboard in by_page_route:
            page_cells.append(by_page_route[t.dashboard].e2e)
        backend = best(backend_cells) if backend_cells else Cell("n/a")
        unit = best(unit_cells) if unit_cells else Cell("n/a")
        page = best(page_cells) if page_cells else Cell("n/a")
        verdict = best([backend, unit, page])
        has_router = any(r.startswith("backend/app/routers/") for r in t.code_refs)
        if has_router and STATUS_ORDER[backend.status] > STATUS_ORDER[verdict.status]:
            # The tool's server side is its router: a Vitest import of some
            # component cannot make the tool better covered than its routes.
            verdict = Cell(backend.status, backend.where, "capped by its router")
        rows.append(ToolRow(t, backend, unit, page, verdict))
    return rows


# ── state machines (the audit) ───────────────────────────────────────────────


@dataclass
class MachineRow:
    section: int
    title: str
    transition: str
    site: str
    refs: list[tuple[str, int]]
    routes: list[str]
    verdict: Cell
    note: str = ""


SECTION_RE = re.compile(r"^## (\d+)\. (.+)$", re.M)
REF_RE = re.compile(r"([a-z_]+\.py):(\d+)")
CONT_RE = re.compile(r"`:(\d+)")
ROUTE_MENTION_RE = re.compile(r"\b(GET|POST|PUT|PATCH|DELETE) (/[^\s`)]+)")


def parse_audit_sections(text: str) -> dict[int, tuple[str, str]]:
    out = {}
    matches = list(SECTION_RE.finditer(text))
    for i, m in enumerate(matches):
        n = int(m.group(1))
        body = text[
            m.end() : matches[i + 1].start() if i + 1 < len(matches) else len(text)
        ]
        out[n] = (m.group(2).strip(), body)
    return out


# Audit sections that describe no state machine, each with why. Every OTHER
# `## N.` heading must produce at least one row — a section added to the audit
# later gets a row (at worst one whole-section row), never silence; and an
# entry here whose heading disappears fails the guard (a stale exemption).
AUDIT_EXEMPT_SECTIONS: dict[int, str] = {
    0: "what the audit could not verify — a scope note, no machine",
    10: "the psql queries for staging — verification steps, no machine",
    11: "cross-cutting patterns — a summary of §1–§9, no machine of its own",
}


def _site_tables(body: str) -> list[tuple[str, str]]:
    """(transition, site) for every data row of a table whose header has a
    `Site` column."""
    rows = []
    lines = body.splitlines()
    i = 0
    while i < len(lines):
        ln = lines[i]
        if (
            ln.startswith("|")
            and i + 1 < len(lines)
            and re.match(r"^\|[\s\-|]+\|$", lines[i + 1])
        ):
            header = [c.strip() for c in ln.strip("|").split("|")]
            site_idx = next((k for k, h in enumerate(header) if h == "Site"), None)
            i += 2
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip("|").split("|")]
                if site_idx is not None and site_idx < len(cells):
                    other = [c for k, c in enumerate(cells) if k != site_idx]
                    rows.append(
                        (
                            other[0] if other else "",
                            cells[site_idx] + " " + " ".join(other[1:]),
                        )
                    )
                i += 1
            continue
        i += 1
    return rows


def _refs(text: str) -> list[tuple[str, int]]:
    refs: list[tuple[str, int]] = []
    last = None
    for m in re.finditer(r"([a-z_]+\.py):(\d+)|`:(\d+)", text):
        if m.group(1):
            last = m.group(1)
            refs.append((last, int(m.group(2))))
        elif last:
            refs.append((last, int(m.group(3))))
    return [r for r in refs if r[0] != "models.py"]


class ModuleMap:
    """file:line in the audit → the API routes whose handler reaches it."""

    def __init__(self, routes: list[Route]):
        self.routes = routes
        self._cache: dict[str, tuple[list, dict]] = {}

    def _module(self, fname: str):
        if fname in self._cache:
            return self._cache[fname]
        path = None
        for d in (ROUTERS_DIR, SERVICES_DIR, APP_DIR):
            if (d / fname).exists():
                path = d / fname
                break
        if path is None:
            self._cache[fname] = ([], {})
            return self._cache[fname]
        tree = ast.parse(path.read_text(encoding="utf-8"))
        spans = []
        calls: dict[str, set[str]] = {}
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                start = min([d.lineno for d in node.decorator_list] + [node.lineno])
                spans.append((start, node.end_lineno, node.name))
                # Every name the function references, not only direct calls:
                # handlers hand helpers to run_in_threadpool / BackgroundTasks.
                calls[node.name] = {
                    n.id for n in ast.walk(node) if isinstance(n, ast.Name)
                }
        self._cache[fname] = (spans, calls)
        return self._cache[fname]

    def routes_for(
        self, fname: str, line: int, write: bool = True
    ) -> tuple[list[Route], str | None, str | None]:
        """(routes, enclosing function, note). The audit's line numbers are as
        of the day it was written; a file edited since can move them. Two
        documented fallbacks, each leaving a note on the row:
          - the line is in no function → the nearest function within
            DRIFT_TOLERANCE lines;
          - a WRITE row landed only on read (GET) handlers → the nearest
            mutation handler of the same module within DRIFT_TOLERANCE."""
        spans, calls = self._module(fname)
        note = None
        span = next((s for s in spans if s[0] <= line <= s[1]), None)
        if span is None:
            near = sorted((min(abs(line - s[0]), abs(line - s[1])), s) for s in spans)
            if not near or near[0][0] > DRIFT_TOLERANCE:
                return [], None, None
            span = near[0][1]
            note = "nearest function — audit line may have drifted"
        func = span[2]
        module = fname[:-3]
        mod_routes = [r for r in self.routes if r.module == module]
        found = [r for r in mod_routes if r.func == func]
        if not found:
            targets, frontier = {func}, {func}
            for _ in range(HELPER_HOPS):
                frontier = {f for f, refs in calls.items() if refs & frontier} - targets
                targets |= frontier
            found = [r for r in mod_routes if r.func in targets]
        if write and found and not any(r.is_mutation for r in found):
            by_name = {s[2]: s for s in spans}
            cands = sorted(
                (
                    min(abs(line - by_name[r.func][0]), abs(line - by_name[r.func][1])),
                    r.key,
                    r,
                )
                for r in mod_routes
                if r.is_mutation and r.func in by_name
            )
            if cands and cands[0][0] <= DRIFT_TOLERANCE:
                found = [cands[0][2]]
                note = "nearest write handler — audit line may have drifted"
        return found, func, note


def audit_entries(audit_text: str) -> list[tuple[int, str, str, str]]:
    """(section, title, transition, site text) for every row the audit yields.
    Stdlib only."""
    out = []
    sections = parse_audit_sections(audit_text)
    for n in sorted(sections):
        if n in AUDIT_EXEMPT_SECTIONS:
            continue
        title, body = sections[n]
        entries = _site_tables(body)
        if not entries and n == 9:
            for m in re.finditer(
                r"^- \*\*(.+?)\*\*(.*?)(?=^- \*\*|^###|\Z)", body, re.M | re.S
            ):
                entries.append((m.group(1), m.group(2)))
            nc = re.search(r"### Not covered.*?\n(.*?)(?=^---|\Z)", body, re.M | re.S)
            if nc:
                entries.append(("not covered by the audit (time box)", nc.group(1)))
        if not entries:
            head = body.split("### Finding")[0]
            entries.append((f"§{n} — whole section", head))
        out.extend((n, title, transition, site) for transition, site in entries)
    return out


def site_column(refs: list[tuple[str, int]]) -> str:
    return ", ".join(f"{f}:{ln}" for f, ln in refs[:4]) + (
        " …" if len(refs) > 4 else ""
    )


_DELETE_WORDS = re.compile(r"(?i)delet|remov|cancel|leave|deletion")


def _method_disagreement(transition: str, found: list[Route]) -> set[str]:
    """A transition whose words and handler method disagree is a sign the
    audit's line points at the wrong handler — say so on the row."""
    deletes = [r for r in found if "DELETE" in r.methods]
    if deletes and not _DELETE_WORDS.search(transition):
        return {"a DELETE handler for a non-delete transition — audit line may be off"}
    if re.search(r"(?i)\bdelete\b", transition) and found and not deletes:
        return {"a delete transition reached no DELETE handler — audit line may be off"}
    return set()


def _name_weak(ev: Evidence, names: set[str]) -> Cell | None:
    for name in sorted(names):
        if len(name) < 6:
            continue
        rx = re.compile(r"\b" + re.escape(name) + r"\b")
        for f in sorted(ev.pytest.texts):
            for i, ln in enumerate(ev.pytest.texts[f], 1):
                if rx.search(ln):
                    return Cell("weak", f"{f}:{i}", f"names {name}")
    return None


def _clean(s: str) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    return s.replace("|", "\\|")


def build_machine_rows(
    ev: Evidence, audit_text: str, route_rows: list[RouteRow]
) -> list[MachineRow]:
    mm = ModuleMap(ev.routes)
    verdict_by_key = {rr.route.key: rr.verdict for rr in route_rows}
    mounted_modules = {r.module for r in ev.routes}
    rows: list[MachineRow] = []
    for n, title, transition, site in audit_entries(audit_text):
        refs = _refs(site)
        found: list[Route] = []
        helper_names = set()
        notes = set()
        for fname, line in refs:
            rs, func, note = mm.routes_for(fname, line)
            found.extend(x for x in rs if x not in found)
            if func:
                helper_names.add(func)
            if note and rs:
                notes.add(note)
        # `request_producer_changes` named in the row with no line → its route
        for name in re.findall(r"`(\w+)`", site):
            for r in ev.routes:
                if r.func == name and r not in found:
                    found.append(r)
        for meth, p in ROUTE_MENTION_RE.findall(site):
            for r in ev.routes:
                tail = p.split("...")[-1]
                if meth in r.methods and (
                    r.path == p or ("..." in p and r.path.endswith(tail))
                ):
                    if r not in found:
                        found.append(r)
        cells = [verdict_by_key[r.key] for r in found]
        notes |= _method_disagreement(transition + " " + site, found)
        first = refs[0][0] if refs else ""
        if (
            first
            and (ROUTERS_DIR / first).exists()
            and first[:-3] not in mounted_modules
        ):
            # The row's own site is in a router the app does not mount (§8).
            verdict, found, notes = (
                Cell("n/a", note=f"{first} is not mounted"),
                [],
                set(),
            )
        elif cells:
            # Every write site the row names must be evidenced: the row is
            # as covered as the WORST route it reaches, never the best
            # (a helper hop can reach a well-tested unrelated handler).
            verdict = worst(cells)
        else:
            verdict = _name_weak(ev, helper_names) or Cell(GAP)
        rows.append(
            MachineRow(
                section=n,
                title=title,
                transition=_clean(transition),
                site=site_column(refs),
                refs=refs,
                routes=[r.key for r in found],
                verdict=verdict,
                note="; ".join(sorted(notes)),
            )
        )
    return rows


# ── mandatory extra rows (§B.3) ──────────────────────────────────────────────


@dataclass
class Extra:
    id: str
    kind: str  # negative | time | race
    title: str
    # every group must appear in one test function; any route of a group does
    groups: list[list[str]]
    window: str | None = None  # regex on the window of the first group's call
    body: str | None = None  # regex on the test function's source
    min_calls: int = 1  # calls to the first group in that function
    grep: str | None = None  # fallback: regex anywhere in a test function → weak
    # min_calls >= 2 only: True = a repeat call by the SAME actor as the first
    # (double submit), False = by a DIFFERENT actor (two customers).
    same_actor: bool | None = None


BUSINESS_MUTATIONS = "@business-mutations"

EXTRAS: list[Extra] = [
    # ── negative paths
    Extra(
        "neg-otp-wrong",
        "negative",
        "wrong phone OTP code is refused",
        [["POST /producers/me/verify-phone/confirm"]],
        window=r"\b(400|401|403|409|422)\b",
        body=r"(?i)wrong|invalid|incorrect|mismatch|bad_code",
    ),
    Extra(
        "neg-otp-expired",
        "negative",
        "expired phone OTP code is refused",
        [["POST /producers/me/verify-phone/confirm"]],
        window=r"\b(400|401|403|409|410|422)\b",
        body=r"(?i)expir",
    ),
    Extra(
        "neg-reset-expired",
        "negative",
        "expired password-reset token is refused",
        [["POST /auth/reset-password"]],
        window=r"\b(400|401|410|422)\b",
        body=r"(?i)expir",
    ),
    Extra(
        "neg-verify-expired",
        "negative",
        "expired email-verify token is refused",
        [["GET /auth/verify-email"]],
        window=r"\b(400|410)\b",
        body=r"(?i)expir",
    ),
    Extra(
        "neg-double-submit-review",
        "negative",
        "double submit-for-review",
        [["POST /producers/me/submit-for-review"]],
        min_calls=2,
        window=r"\b(400|409)\b",
        same_actor=True,
    ),
    Extra(
        "neg-double-commit",
        "negative",
        "double join (commit) on a group buy",
        [["POST /group-buys/{group_buy_id}/commit"]],
        min_calls=2,
        window=r"\b(400|409)\b",
        same_actor=True,
    ),
    Extra(
        "neg-double-reserve",
        "negative",
        "double reserve of a rescue bag",
        [["POST /rescue/orders"]],
        min_calls=2,
        window=r"\b(400|409)\b",
        same_actor=True,
    ),
    Extra(
        "neg-cancel-rescue",
        "negative",
        "cancel a rescue reservation midway",
        [["POST /rescue/orders"], ["POST /rescue/orders/{order_id}/cancel"]],
    ),
    Extra(
        "neg-cancel-registration",
        "negative",
        "cancel an event/experience registration midway",
        [
            [
                "POST /events/{event_id}/registrations",
                "POST /experiences/{experience_id}/registrations",
            ],
            ["POST /registrations/{token}/cancel"],
        ],
    ),
    Extra(
        "neg-rejected-acting",
        "negative",
        "a rejected business acting (business mutation → 403/409)",
        [[BUSINESS_MUTATIONS]],
        window=r"\b(403|409)\b",
        body=r"status\s*=\s*[\"']rejected[\"']|\.status\s*=\s*[\"']rejected",
    ),
    Extra(
        "neg-429-login",
        "negative",
        "rate limit 429 on login",
        [["POST /auth/login"]],
        window=r"\b429\b",
    ),
    Extra(
        "neg-429-otp",
        "negative",
        "rate limit 429 on phone OTP",
        [
            [
                "POST /producers/me/verify-phone",
                "POST /producers/me/verify-phone/confirm",
            ]
        ],
        window=r"\b429\b",
    ),
    # ── time-dependent
    Extra(
        "time-rescue-before",
        "time",
        "rescue: handover / no-show before the pickup window closed",
        [
            [
                "POST /rescue/orders/{order_id}/no-show",
                "POST /rescue/orders/{order_id}/handed",
            ]
        ],
        window=r"\b(400|409|422)\b",
        body=r"(?i)only_after|before|too_early|not_yet",
    ),
    Extra(
        "time-rescue-inside",
        "time",
        "rescue: reserve inside the window, up to the cutoff",
        [["POST /rescue/orders"]],
        window=r"\b20[01]\b",
        body=r"(?i)cutoff|close_15|minutes_before",
    ),
    Extra(
        "time-rescue-after",
        "time",
        "rescue: reserve / list after the window or cutoff",
        [
            [
                "POST /rescue/orders",
                "GET /rescue/offers",
                "POST /rescue/orders/{order_id}/cancel",
            ]
        ],
        body=r"(?i)after_the_cutoff|window_ended|ended_is_not|close_15",
    ),
    Extra(
        "time-groupbuy-deadline",
        "time",
        "group buy: commit after the deadline passed",
        [["POST /group-buys/{group_buy_id}/commit"]],
        window=r"\b(400|409|410|422)\b",
        body=r"(?i)deadline",
    ),
    Extra(
        "time-event-ended",
        "time",
        "ended event / experience: registration refused",
        [
            [
                "POST /events/{event_id}/registrations",
                "POST /experiences/{experience_id}/registrations",
            ]
        ],
        window=r"\b(400|404|409|410|422)\b",
        body=r"(?i)past|ended|expired",
    ),
    Extra(
        "time-holiday-mode",
        "time",
        "Friday / holiday mode",
        [
            [
                "GET /holiday-mode",
                "POST /admin/settings/vacation",
                "GET /admin/settings/vacation",
            ]
        ],
    ),
    Extra(
        "time-special-hours",
        "time",
        "special hours on a date (clock frozen)",
        [
            [
                "PUT /producers/me",
                "GET /producers/{producer_id}",
                "GET /producers/by-slug/{slug}",
            ]
        ],
        body=r"special_hours",
        grep=r"special_hours",
    ),
    Extra(
        "time-wa-24h",
        "time",
        "the 24 h WhatsApp customer-service window",
        [["POST /webhook/whatsapp"]],
        body=r"window_expired|131047|re-engagement",
        grep=r"window_expired|131047|re-engagement",
    ),
    Extra(
        "time-sla-ageing",
        "time",
        "SLA ageing in the admin queue",
        [
            [
                "GET /admin/producers/pending",
                "GET /admin/producers",
                "GET /admin/dashboard",
            ]
        ],
        body=r"(?i)sla|business_days_waiting|waiting",
        grep=r"business_days_waiting",
    ),
    # ── two-actor races
    Extra(
        "race-groupbuy-owner-admin",
        "race",
        "owner and admin move the same group buy (#4250)",
        [
            ["PATCH /group-buys/{group_buy_id}/status"],
            ["PATCH /admin/group-buys/{group_buy_id}/status"],
        ],
    ),
    Extra(
        "race-rescue-handed-cancel",
        "race",
        "«נמסר» vs cancel on one rescue order (#4249)",
        [
            ["POST /rescue/orders/{order_id}/handed"],
            ["POST /rescue/orders/{order_id}/cancel"],
        ],
    ),
    Extra(
        "race-rescue-last-bag",
        "race",
        "two customers take the last rescue bag",
        [["POST /rescue/orders"]],
        min_calls=2,
        body=r"(?i)last|qty_total\s*=\s*1|qty_left\s*=\s*1",
        same_actor=False,
    ),
    Extra(
        "race-owner-edit-admin-approve",
        "race",
        "the owner edits while the admin approves",
        [["PUT /producers/me"], ["POST /admin/producers/{producer_id}/approve"]],
    ),
]


@dataclass
class ExtraRow:
    extra: Extra
    verdict: Cell
    note: str
    score: int
    primary: str


def _resolve_group(ev: Evidence, group: list[str]) -> set[str]:
    keys = set()
    for item in group:
        if item == BUSINESS_MUTATIONS:
            keys |= {
                r.key for r in ev.routes if r.actor == "business" and r.is_mutation
            }
            continue
        meth, path = item.split(" ", 1)
        for r in ev.routes:
            if r.path == path and meth in r.methods:
                keys.add(r.key)
    return keys


def build_extra_rows(ev: Evidence, route_rows: list[RouteRow]) -> list[ExtraRow]:
    by_key = {rr.route.key: rr for rr in route_rows}
    call_route: dict[int, str] = {}
    for key, calls in ev.calls_by_route.items():
        for c in calls:
            call_route[id(c)] = key
    # Same-file functions (helpers, fixtures) that freeze the clock: a test
    # that calls or requests one runs on a frozen clock too.
    clock_helpers: dict[str, set[str]] = {}
    for tf in ev.pytest.funcs:
        if CLOCK_RE.search(tf.source):
            clock_helpers.setdefault(tf.file, set()).add(tf.name)

    def frozen(tf: TestFunc) -> bool:
        if CLOCK_RE.search(tf.source):
            return True
        return any(
            name != tf.name and re.search(r"\b" + re.escape(name) + r"\b", tf.source)
            for name in clock_helpers.get(tf.file, ())
        )

    rows = []
    for ex in EXTRAS:
        groups = [_resolve_group(ev, g) for g in ex.groups]
        missing = [g for g, keys in zip(ex.groups, groups) if not keys]
        if missing:
            raise ValueError(
                f"extra row {ex.id}: route(s) {missing} do not exist — update EXTRAS"
            )
        hits: list[tuple[TestFunc, Call]] = []
        for tf in ev.pytest.funcs:
            if not tf.all_calls:
                continue
            keys_here = [call_route.get(id(c)) for c in tf.all_calls]
            first = [c for c in tf.all_calls if call_route.get(id(c)) in groups[0]]
            if len(first) < ex.min_calls:
                continue
            if ex.same_actor is not None and ex.min_calls >= 2:
                # Repeats judged against the first call's actor (headers=…).
                lead = first[0].actor
                repeats = [c for c in first[1:] if (c.actor == lead) == ex.same_actor]
                if not repeats:
                    continue
                first = [first[0], *repeats]
            if not all(any(k in g for k in keys_here) for g in groups[1:]):
                continue
            if ex.body and not re.search(ex.body, tf.source):
                continue
            if ex.window:
                # A double submit is judged on the REPEAT call(s): the first
                # one is expected to succeed.
                pool = first[1:] if ex.min_calls >= 2 else first
                pool = [c for c in pool if re.search(ex.window, c.window)]
                if not pool:
                    continue
                first = pool
            # A repeat-call row cites the REPEAT (with a window, `first` is
            # already the repeats; without one, it is [lead, *repeats]).
            cite = first[1] if ex.min_calls >= 2 and not ex.window else first[0]
            hits.append((tf, cite))
        if ex.kind == "time":
            # Prefer a test that freezes the clock (testing.md, MEH-2290).
            hits.sort(key=lambda h: not frozen(h[0]))
        if hits:
            tf, c = hits[0]
            if c in tf.calls:
                verdict = Cell("covered", f"{c.file}:{c.line}")
            else:  # the call sits in a helper the test invokes — cite the test
                verdict = Cell(
                    "covered", f"{tf.file}:{tf.start}", f"via helper {c.func_name}"
                )
            hit_tf: TestFunc | None = tf
        else:
            verdict, hit_tf = Cell(GAP), None
            if ex.grep:
                for tf in ev.pytest.funcs:
                    if tf.name.startswith("test") and re.search(ex.grep, tf.source):
                        verdict = Cell(
                            "weak", f"{tf.file}:{tf.start}", "grep, no route call"
                        )
                        hit_tf = tf
                        break
        src = hit_tf.source if hit_tf else ""
        notes = []
        if ex.kind == "time" and hit_tf is not None:
            notes.append("clock frozen" if frozen(hit_tf) else "real clock")
        if ex.kind == "race" and verdict.status != GAP:
            if THREAD_RE.search(src):
                notes.append("concurrent threads")
            elif LOCK_RE.search(src):
                notes.append("lock asserted")
            else:
                notes.append("sequential interleave only")
        primary_key = (
            sorted(groups[0])[0] if ex.groups[0] != [BUSINESS_MUTATIONS] else ""
        )
        base = by_key[primary_key] if primary_key else None
        if base:
            score, _ = base_score(base.route)
        else:
            score = 3 + ACTOR_RANK["business"]  # any business mutation
        score += {"race": 3, "time": 2, "negative": 2}[ex.kind]
        score += {GAP: 4, "weak": 2}.get(verdict.status, 0)
        rows.append(
            ExtraRow(
                ex,
                verdict,
                ", ".join(notes),
                score,
                primary_key or "business mutations",
            )
        )
    return rows


# ═════════════════════════════════════════════════════════════════════════════
# 5. Assemble + render
# ═════════════════════════════════════════════════════════════════════════════


@dataclass
class ActionMap:
    route_rows: list[RouteRow]
    internal_rows: list[RouteRow]
    non_api: list[str]
    tool_rows: list[ToolRow]
    page_rows: list[PageRow]
    machine_rows: list[MachineRow]
    extra_rows: list[ExtraRow]


def load_app():
    os.environ.setdefault("ENV", "test")
    backend = str(ROOT / "backend")
    if backend not in sys.path:
        sys.path.insert(0, backend)
    from app.main import app

    return app


def generate(app=None) -> ActionMap:
    """Build every table of the report from the app's routes and the repo's
    tracked files. `app` defaults to `app.main:app` (imported, never
    connected to a database)."""
    app = app if app is not None else load_app()
    routes = collect_routes(app)
    non_api = non_api_paths(app)
    ev = Evidence(
        routes=routes,
        pytest=build_pytest_index(),
        e2e=build_e2e_index(),
        vitest=build_vitest_index(),
    ).index()
    all_rows = build_route_rows(ev)
    route_rows = [r for r in all_rows if not r.route.internal_reason]
    internal_rows = [r for r in all_rows if r.route.internal_reason]
    pages = collect_pages()
    page_rows = build_page_rows(ev, pages)
    tools = parse_business_features(FEATURES_PATH.read_text(encoding="utf-8"))
    tool_rows = build_tool_rows(ev, tools, page_rows, all_rows)
    machine_rows = build_machine_rows(
        ev, AUDIT_PATH.read_text(encoding="utf-8"), all_rows
    )
    extra_rows = build_extra_rows(ev, all_rows)
    return ActionMap(
        route_rows,
        internal_rows,
        non_api or [],
        tool_rows,
        page_rows,
        machine_rows,
        extra_rows,
    )


def _count(cells) -> dict[str, int]:
    out = {k: 0 for k in ("covered", "weak", GAP, "n/a", "e2e-mock")}
    for c in cells:
        out[c.status] += 1
    return out


def _counts_line(d: dict[str, int]) -> str:
    return " | ".join(str(d[k]) for k in ("covered", "weak", GAP, "n/a"))


def top_gaps(am: ActionMap, n: int = 20) -> list[tuple[int, str, str, str, str]]:
    """(score, what, actor, why, evidence) — routes whose verdict is not
    covered or whose negative cell is a GAP, plus extra rows that are not
    covered."""
    items = []
    for rr in am.route_rows:
        if rr.verdict.status != "covered" or (rr.route.gated and rr.neg.status == GAP):
            items.append(
                (
                    rr.score,
                    f"`{rr.route.key}`",
                    rr.route.actor_label,
                    ", ".join(rr.why) or "—",
                    f"pos {rr.verdict.render()} · neg {rr.neg.render()}",
                )
            )
    for er in am.extra_rows:
        if er.verdict.status != "covered":
            items.append(
                (
                    er.score,
                    f"[{er.extra.kind}] {er.extra.title}",
                    "—",
                    f"{er.extra.kind} row on `{er.primary}`",
                    er.verdict.render(),
                )
            )
    # Ties: a privilege change ranks first (Sapir 10/11 — role and permission
    # changes rank HIGHEST), then the label.
    items.sort(key=lambda x: (-x[0], "privilege change" not in x[3], x[1]))
    return items[:n]


def render_pages(page_rows: list[PageRow]) -> list[str]:
    """The «Pages» section of the report."""
    out = ["## Pages (`frontend/app/[locale]/**/page.*`)"]
    for grp in ("public", "dashboard", "admin"):
        out += ["", f"### {grp.capitalize()}", ""]
        out.append("| Route | E2E (`goto`) | Unit (import) | Verdict |")
        out.append("|---|---|---|---|")
        for pr in [r for r in page_rows if r.page.group == grp]:
            out.append(
                f"| `{pr.page.route}` | {pr.e2e.render()} | {pr.unit.render()} | {pr.verdict.status} |"
            )
    out.append("")
    return out
