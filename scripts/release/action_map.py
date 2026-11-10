#!/usr/bin/env python3
"""
Module:   scripts/release/action_map.py
Purpose:  Generate docs/release/action-map.md — every action an actor can take
          (API route, business tool, page, state transition) crossed with the
          test that covers it, as `file:line` evidence or `GAP`. Package B of
          the anchor-release plan (MEH-2892 §B, card MEH-2894).
Touches:  READS the app's own route table (imports `app.main:app`, never
          connects to a database), frontend/lib/business-features.js,
          frontend/app/[locale]/**/page.*, docs/audits/2026-11-implicit-state-
          machines.md, tests/**/*.py, frontend/__tests__/**, and the Playwright
          specs the CI config runs. WRITES only docs/release/action-map.md, and
          only with --write.
Does NOT: run any test, measure runtime coverage, or claim a test PASSES. A
          cell says "a test exercises this" — by a static match, documented
          below — never "this works". Does not touch the DB.
Related:  tests/test_action_map_complete.py (the only guard: rows exist),
          MEH-2892 §B (the spec — anchor-plan.md on PR #4284).

CLI
  python scripts/release/action_map.py            print the summary
  python scripts/release/action_map.py --write    regenerate the report
  Needs PYTHONPATH=backend:. and the env the app imports with (ENV, SECRET_KEY).

A REPORT, NOT A GATE (Sapir 10/11, option ג). The doc is regenerated with
--write when someone wants a fresh picture; nothing compares its cells or its
`file:line` citations with the code, and no check pins a line number. The ONE
guard is tests/test_action_map_complete.py: every backend route (method + path
+ handler) and every business tool (id) has a row. It runs where pytest runs.

THE MATCHER — what counts as evidence (and its limits)
  pytest   every `<x>client<y>.<method>(path, ...)` / `c.<method>(...)` /
           `TestClient(...).<method>(...)` / `client.request("M", path)` call in
           tests/**/*.py, found with `ast`. The path is the first argument: a
           string, an f-string, a `+` concatenation, a name bound to one of
           those in the module / class (`self.URL`) / enclosing function, or a
           call to a same-file `def f(...): return "<path>"` helper. Every
           `{...}` it cannot resolve becomes a placeholder segment. Rows of a
           `(method, path, ...)` table that a test parametrizes or loops over
           (`getattr(client, method)(path)`) count too, judged by the source of
           the test(s) that consume the table. The path is
           then resolved the way FastAPI resolves it: routes in registration
           order, first one whose path regex AND method match. So `/producers/me`
           resolves to the `me` route, not `/producers/{producer_id}`.
           A cell cites the first such call (files sorted, then line order),
           preferring one whose window asserts a 2xx. A call that is only ever
           asserted refused (401/403) is a negative test, not a positive one: a
           route reached only that way is `weak` ("only refused calls").
  negative a gated route's negative cell needs a matching call whose window —
           the call itself plus up to NEG_WINDOW lines after it, cut at the next
           client call — has a line asserting 401 or 403.
  weak     no call matched, but a test names the route: a string literal that
           resolves to the route's path (e.g. a parametrize table driving
           `client.request(method, path)`), or the endpoint function's name in a
           test file that also references its router module. Marked `weak`.
  e2e-mock a Playwright `page.route("<glob>", ...)` whose glob matches the route
           path. Those responses are MOCKED — the backend never ran — so it is
           INFORMATION in its own column and never counts as coverage, never
           enters the verdict or the score. A `${…}` in a template glob is
           resolved from a literal `for (const x of ["a", "b"])` list when
           there is one; otherwise it matches exactly one path segment.
  pages    `<x>.goto(path)` in the specs `playwright.config.ts` actually runs
           (its `testMatch`), resolved against the page tree the way Next.js
           does: static segments beat dynamic ones. A Vitest file under
           frontend/__tests__ that imports the page module also counts.
  tools    a tool row is covered when any of its codeRef files is: a router
           file → its routes' coverage; any other file → a test that IMPORTS it
           (pytest `app.services.x`, Vitest `@/…` or a relative specifier;
           `vi.mock` is a mock, not a test, and is ignored). A test that only
           names the file (e.g. reads it as text) is `weak`. A router file
           counts as covered only when every route in it is (it is shared by
           many tools), else `weak` with the count. The tool's
           dashboard page counts through the page cell.
  Not seen: a URL built by a helper in another file or with more than one
  `return`, a client call made inside a helper (counted for the helper's own
  line, and for §B.3 rows one hop up), schemathesis fuzzing, and E2E flows that
  hit a real backend without `page.route` (counted as page coverage only). A GAP is
  therefore "no static evidence", which is what the anchor needs to know.

RISK SCORE (deterministic, used for "Top gaps by risk")
  The terms and weights are the table RISK_LEGEND below, rendered verbatim
  into the report's «Risk score» section; base_score() + route_score() apply
  exactly those terms, and each route's «Why» names the ones that applied, so
  any score can be recomputed by hand. Privilege changes (/role, /block,
  /admin/users/… mutations) carry the highest single weight (+8, Sapir 10/11).
  The object-id term (+2) covers /me/…/{id} too, except /users/me/favorites|
  saved/… (public targets). E2E mocks never enter the score.
"""

from __future__ import annotations

import argparse
import ast
import functools
import inspect
import os
import re
import subprocess
import sys
import warnings
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOC_PATH = ROOT / "docs" / "release" / "action-map.md"
FEATURES_PATH = ROOT / "frontend" / "lib" / "business-features.js"
AUDIT_PATH = ROOT / "docs" / "audits" / "2026-11-implicit-state-machines.md"
PAGES_ROOT = ROOT / "frontend" / "app" / "[locale]"
TESTS_DIR = ROOT / "tests"
VITEST_DIR = ROOT / "frontend" / "__tests__"
PLAYWRIGHT_CONFIG = ROOT / "frontend" / "playwright.config.ts"
ROUTERS_DIR = ROOT / "backend" / "app" / "routers"
SERVICES_DIR = ROOT / "backend" / "app" / "services"
APP_DIR = ROOT / "backend" / "app"

# The guard test lives in tests/ and holds synthetic paths for its self-test;
# scanning it would let the map cite its own guard as coverage.
SCAN_EXCLUDE = {"tests/test_action_map_complete.py"}

MUTATIONS = {"POST", "PUT", "PATCH", "DELETE"}
HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}
NEG_WINDOW = 8
FOLLOWUP_WINDOW = 12
HELPER_HOPS = 6  # audit site → handler: helper calls followed inside one module
DRIFT_TOLERANCE = 25  # lines; see ModuleMap.routes_for
GAP = "GAP"

# ── Internal routes: explicit, with reasons. Not actor actions, so they get no
# actor/negative cell and no risk rank — but they are still listed (with
# coverage) in their own table, and tests/test_action_map_complete.py fails if
# an entry here stops resolving to a real route (a stale allowlist would
# otherwise hide nothing, silently).
INTERNAL_ROUTES: dict[str, str] = {
    "/": "service banner (system.root) — no actor action",
    "/health": "uptime / Railway probe alias — no actor action",
    "/health/liveness": "Railway liveness probe — no actor action",
    "/health/readiness": "Railway readiness probe — no actor action",
    "/health/places": "Google Places key probe for a cron / uptime monitor (MEH-2482)",
    "/webhook/whatsapp": "Meta webhook — the caller is Meta, HMAC-verified in the handler, not a user",
}
# FastAPI's own generated documentation routes (plain Starlette routes).
INTERNAL_NON_API_ROUTES: dict[str, str] = {
    "/openapi.json": "FastAPI-generated schema",
    "/docs": "FastAPI-generated Swagger UI",
    "/docs/oauth2-redirect": "FastAPI-generated Swagger OAuth redirect",
    "/redoc": "FastAPI-generated ReDoc",
}

ACTOR_RANK = {"admin": 2, "business": 2, "registered": 1, "anonymous": 0}

AUTH_PATH_RE = re.compile(
    r"auth|login|register|password|verify|otp|claim|token|reset", re.IGNORECASE
)
MONEY_PATH_RE = re.compile(r"^/group-buys/\{[^}]+\}/commit$|^/rescue/orders")
VISIBILITY_PATH_RE = re.compile(
    r"approve|reject|publish|toggle-status|/hide|/unhide|verified|ambassador|"
    r"story-card|request-changes|revoke"
)
# Who-can-do-what changes: role grants, blocks, anything on /admin/users/.
PRIVILEGE_WEIGHT = 8

# The risk legend, in the order base_score/route_score apply it. Rendered into
# the report so a reader can recompute every score.
RISK_LEGEND = [
    ("method: POST / PUT / PATCH / DELETE", "3"),
    ("method: GET / HEAD", "1"),
    ("actor: admin or business", "+2"),
    ("actor: registered user", "+1"),
    ("anonymous mutation (public write)", "+1"),
    ("DELETE", "+1"),
    (
        "auth: path has auth / login / register / password / verify / otp / claim / token / reset",
        "+3",
    ),
    ("money-like mutation: `/group-buys/{id}/commit`, `/rescue/orders…`", "+3"),
    (
        "sends email/WhatsApp: the handler (or a same-module helper) calls a name imported from a notification service module",
        "+2",
    ),
    (
        "object id in path: a non-admin mutation with an `{…}` segment (`/me/…/{id}` included; not `/users/me/favorites/…` or `/users/me/saved/…`)",
        "+2",
    ),
    ("site-wide settings: a mutation under `/admin/settings`", "+3"),
    (
        "public visibility: approve / reject / publish / toggle-status / hide / unhide / verified / ambassador / story-card / request-changes / revoke, on a mutation",
        "+2",
    ),
    (
        "**privilege change**: a mutation on `/role`, `/block` or `/admin/users/…` — the highest single weight",
        "+8",
    ),
    ("no test calls the route and asserts its result (GAP)", "+4"),
    ("only `weak` evidence (named, or no success asserted)", "+2"),
    ("a gated route with no 401/403 test", "+2"),
]
# `/users/me/favorites/{id}`, `/users/me/saved/{type}/{id}`: the {id} is a
# public item the caller bookmarks, not an object someone owns.
PUBLIC_TARGET_RE = re.compile(r"^/users/me/(?:favorites|saved)/")
PRIVILEGE_PATH_RE = re.compile(r"/role\b|/block\b|^/admin/users/")
# A route "sends" when its handler calls — directly, or through up to
# HELPER_HOPS same-module helpers — a name imported from one of the app's
# email / WhatsApp / push / notification service modules. Anchored on those
# modules, not on a word: `User.email.ilike(` and `email.lower()` send nothing.
NOTIFY_MODULE_RE = re.compile(
    r"^app\.services\.(?!.*(?:branding|templates))\w*(?:email|whatsapp|notif|mail|push|digest|nudge)\w*$"
)
STATUS_ANY_RE = re.compile(r"status_code\s*(?:==|!=|\bin\b)|\.is_success\b|\.ok\b")
ERR_ASSERT_RE = re.compile(
    r"(?:assert|status_code|==|\bin\b).*\b[45]\d\d\b|HTTP_[45]\d\d"
)


def _status_assert_re(values: str) -> re.Pattern:
    r"""`status_code == V` or `status_code in (V, V…)` where EVERY value is one
    of `values` (a regex over a number, optionally `status.HTTP_<n>_…`). A
    `!=`, a mixed tuple such as `in (200, 403)`, a `range(200)` or a message
    string ("expected 200") never matches. `\s` spans newlines, so a
    multi-line `assert (\n r.status_code\n == 403\n)` still matches."""
    v = r"(?:status\.)?(?:HTTP_)?(?:" + values + r")(?:_[A-Z_]+)?\b"
    return re.compile(
        r"status_code\s*==\s*"
        + v
        + r"|status_code\s+in\s*[\(\[\{]\s*"
        + v
        + r"(?:\s*,\s*"
        + v
        + r")*\s*,?\s*[\)\]\}]"
    )


NEG_ASSERT_RE = _status_assert_re(r"40[13]")
POS_ASSERT_RE = re.compile(
    _status_assert_re(r"2\d\d|30[1-8]").pattern
    + r"|\.is_success\b|raise_for_status\(|\bassert\s+\w+\.ok\b"
)
CLOCK_RE = re.compile(
    r"israel_days_ago|setattr\([^)]*(?:israel_today|israel_now|_now|utcnow|"
    r"datetime|date\b)|freeze_time|freezegun|_NOW\b"
)
LOCK_RE = re.compile(r"with_for_update|populate_existing|FOR UPDATE|for_update")
THREAD_RE = re.compile(
    r"threading|Barrier|ThreadPool|concurrent\.futures|asyncio\.gather"
)


def rel(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


@functools.lru_cache(maxsize=1)
def _tracked() -> frozenset[str]:
    """Files git tracks (index), that exist. An untracked scratch file in a
    developer's tree must not change the map; CI has only tracked files, so
    this is also what makes a local run equal CI's."""
    try:
        out = subprocess.run(
            ["git", "ls-files", "-z"],
            cwd=ROOT,
            capture_output=True,
            check=True,
        ).stdout.decode("utf-8")
    except (OSError, subprocess.CalledProcessError) as exc:
        raise SystemExit(
            f"action_map: `git ls-files` failed ({exc}) — run inside the repo"
        )
    return frozenset(f for f in out.split("\0") if f and (ROOT / f).is_file())


def tracked_under(directory: Path, suffix_re: str = "") -> list[Path]:
    prefix = rel(directory) + "/"
    rx = re.compile(suffix_re) if suffix_re else None
    return sorted(
        ROOT / f
        for f in _tracked()
        if f.startswith(prefix) and (rx is None or rx.search(f))
    )


# ═════════════════════════════════════════════════════════════════════════════
# 1. API routes
# ═════════════════════════════════════════════════════════════════════════════


@dataclass
class Route:
    methods: tuple[str, ...]
    path: str
    module: str  # e.g. "producer_me"
    func: str
    endpoint: object
    deps: frozenset[str]
    actor: str = "anonymous"
    actor_label: str = "anonymous"
    flags: tuple[str, ...] = ()
    source: str = ""
    regex: re.Pattern | None = None
    internal_reason: str | None = None
    notifies: bool = False
    order: int = 0  # registration order — the doc's `#` column

    @property
    def key(self) -> str:
        return f"{','.join(self.methods)} {self.path}"

    @property
    def is_mutation(self) -> bool:
        return bool(MUTATIONS & set(self.methods))

    @property
    def gated(self) -> bool:
        return self.actor != "anonymous"


def path_regex(path: str) -> re.Pattern:
    out = []
    for part in re.split(r"(\{[^}]+\})", path):
        if part.startswith("{") and part.endswith("}"):
            out.append(".+" if part.endswith(":path}") else "[^/]+")
        else:
            out.append(re.escape(part))
    return re.compile("^" + "".join(out) + "$")


def _dep_names(dependant, acc: set[str]) -> set[str]:
    for sub in getattr(dependant, "dependencies", []) or []:
        call = getattr(sub, "call", None)
        name = getattr(call, "__name__", None)
        if name:
            acc.add(name)
        _dep_names(sub, acc)
    return acc


def _iter_api_routes(app):
    """Yield (methods, path, endpoint, dependant) for every APIRoute the app
    serves. This FastAPI wraps each included router in a lazy `_IncludedRouter`
    whose effective (prefixed) routes come from `effective_route_contexts()`;
    plain APIRoutes appear directly. Both are walked, in registration order."""
    from fastapi.routing import APIRoute

    for r in app.routes:
        if isinstance(r, APIRoute):
            yield tuple(sorted(r.methods)), r.path, r.endpoint, r.dependant
        elif hasattr(r, "effective_route_contexts"):
            for ctx in r.effective_route_contexts():
                if isinstance(getattr(ctx, "original_route", None), APIRoute):
                    yield (
                        tuple(sorted(ctx.methods)),
                        ctx.path,
                        ctx.endpoint,
                        ctx.dependant,
                    )


@functools.lru_cache(maxsize=None)
def notifying_functions(module: str) -> frozenset[str]:
    """Top-level functions of backend/app/routers/<module>.py that send a
    notification, directly or via same-module helpers. Stdlib only."""
    path = ROUTERS_DIR / f"{module}.py"
    if not path.is_file():
        return frozenset()
    tree = ast.parse(path.read_text(encoding="utf-8"))
    senders: set[str] = set()  # imported callables / module aliases
    for node in _nodes(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            if NOTIFY_MODULE_RE.match(node.module):
                senders |= {a.asname or a.name for a in node.names}
            elif node.module == "app.services":
                senders |= {
                    a.asname or a.name
                    for a in node.names
                    if NOTIFY_MODULE_RE.match(f"app.services.{a.name}")
                }
    refs: dict[str, set[str]] = {}
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            refs[node.name] = {n.id for n in ast.walk(node) if isinstance(n, ast.Name)}
    out = {f for f, names in refs.items() if names & senders}
    for _ in range(HELPER_HOPS):
        out |= {f for f, names in refs.items() if names & out}
    return frozenset(out)


def classify_actor(deps: frozenset[str], source: str) -> tuple[str, str, tuple]:
    flags = []
    if "require_rescue_enabled" in deps:
        flags.append("flag: rescue")
    if "require_verified_email" in deps or "require_verified_producer" in deps:
        flags.append("verified email")
    if "require_admin" in deps:
        return "admin", "admin", tuple(flags)
    if "require_producer" in deps or "require_verified_producer" in deps:
        # Organizers are producers with kind == "organizer": require_producer
        # gates on role alone, so they pass unless the handler refuses kind.
        if re.search(r"kind\s*!=\s*[\"']producer[\"']", source):
            return "business", "business (organizer refused)", tuple(flags)
        return "business", "business/organizer", tuple(flags)
    # get_current_user_optional / get_current_user_lenient return None for a
    # missing or bad token (auth.py:401, :441) — an anonymous caller gets in,
    # so there is no 401/403 to test. Only a hard get_current_user gates.
    if "get_current_user" in deps:
        return "registered", "registered user", tuple(flags)
    if deps & {"get_current_user_optional", "get_current_user_lenient"}:
        return "anonymous", "anonymous (optional auth)", tuple(flags)
    return "anonymous", "anonymous", tuple(flags)


def collect_routes(app) -> list[Route]:
    routes: list[Route] = []
    for methods, path, endpoint, dependant in _iter_api_routes(app):
        fn = inspect.unwrap(endpoint)
        try:
            source = inspect.getsource(fn)
        except (OSError, TypeError):
            source = ""
        deps = frozenset(_dep_names(dependant, set()))
        actor, label, flags = classify_actor(deps, source)
        if actor == "anonymous" and re.search(
            r"\{token\}|prefill|claim|unsubscribe|host-confirm", path
        ):
            label = "anonymous (token in request)"
        module = fn.__module__.rsplit(".", 1)[-1]
        routes.append(
            Route(
                methods=methods,
                path=path,
                module=module,
                func=fn.__name__,
                endpoint=fn,
                deps=deps,
                actor=actor,
                actor_label=label,
                flags=flags,
                source=source,
                regex=path_regex(path),
                internal_reason=INTERNAL_ROUTES.get(path),
                notifies=fn.__name__ in notifying_functions(module),
                order=len(routes) + 1,
            )
        )
    return routes


def non_api_paths(app) -> list[str]:
    from fastapi.routing import APIRoute

    return sorted(
        r.path
        for r in app.routes
        if not isinstance(r, APIRoute)
        and not hasattr(r, "effective_route_contexts")
        and getattr(r, "path", None)
    )


def resolve_route(routes: list[Route], method: str | None, path: str) -> Route | None:
    """FastAPI order: first route whose path AND method match. `method=None`
    (E2E globs) accepts any method."""
    for r in routes:
        if r.regex.match(path) and (method is None or method in r.methods):
            return r
    return None


# ═════════════════════════════════════════════════════════════════════════════
# 2. pytest call index (ast)
# ═════════════════════════════════════════════════════════════════════════════

PLACEHOLDER = "__p__"


@dataclass
class Call:
    file: str
    line: int
    end: int
    method: str
    path: str
    func_name: str
    func_start: int
    func_end: int
    window: str = ""
    # A row of a (method, path, ...) table that a test loops / parametrizes
    # over: `window` is then the source of the test(s) consuming the table,
    # and evidence cites the row itself.
    table: bool = False
    # Source of the `headers=` argument ("" when absent): who is calling.
    # Two calls with the same text are the same actor (same fixture user).
    actor: str = ""
    # When the call sits in a helper that RETURNS the response
    # (`return client.put(...)`), the assertions live at the helper's call
    # sites: their windows, judged like this call's own.
    outer_windows: list[str] = field(default_factory=list)
    # The source of the statement holding the call (for `.json()` chaining).
    stmt: str = ""
    # First line of the simple statement holding the call — `assert (` may
    # open on the line above `client.get(...)`. The window starts here.
    wstart: int = 0
    # The call is the value of a `return` (a helper handing the response to
    # its caller): only then do its caller's windows count (outer_windows).
    in_return: bool = False
    # `r = client.post(...)` → "r"; "" when the response is not bound.
    var: str = ""
    # Up to FOLLOWUP_WINDOW lines after the call, cut at the next mutating
    # client call and at the function end: where `db.refresh(x)` / a re-read
    # GET and their assertions live when the call itself is not asserted.
    after: str = ""


@dataclass
class TestFunc:
    file: str
    name: str
    start: int
    end: int
    source: str
    calls: list[Call] = field(default_factory=list)
    # own calls + calls made by same-file helpers it invokes (one hop), e.g.
    # `self._patch(client, gb, "open", admin)` in test_group_buys_api.py
    all_calls: list[Call] = field(default_factory=list)


def _is_client_receiver(node: ast.AST) -> bool:
    if isinstance(node, ast.Name):
        return "client" in node.id.lower() or node.id == "c"
    if isinstance(node, ast.Attribute):
        return "client" in node.attr.lower()
    if isinstance(node, ast.Call):
        f = node.func
        return isinstance(f, ast.Name) and f.id == "TestClient"
    return False


def _eval_str(node, env: dict[str, str], depth: int = 0) -> str | None:
    if depth > 5 or node is None:
        return None
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        parts = []
        for v in node.values:
            if isinstance(v, ast.Constant):
                parts.append(str(v.value))
            elif isinstance(v, ast.FormattedValue):
                # A name / helper call / class attribute that is itself a
                # path is spliced in; anything else is one placeholder.
                inner = _eval_str(v.value, env, depth + 1)
                parts.append(inner if inner is not None else "\x00")
        return "".join(parts)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        a = _eval_str(node.left, env, depth + 1)
        b = _eval_str(node.right, env, depth + 1)
        return None if a is None or b is None else a + b
    if isinstance(node, ast.Name):
        return env.get(node.id)
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
        # `self.URL` / `cls.URL` / `TestX.URL` → a class attribute
        return env.get(f"{node.value.id}.{node.attr}") or env.get(f"self.{node.attr}")
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        # `_checks_url(pid)` → the helper's single `return f"..."`, with its
        # parameters left as placeholders
        return env.get(f"{node.func.id}()")
    return None


def _url_helpers(tree: ast.Module, env: dict[str, str]) -> dict[str, str]:
    """Module-level `def f(...): return "<path>"` helpers, evaluated with their
    parameters unresolved (each becomes a placeholder segment)."""
    out = {}
    for node in tree.body:
        if not isinstance(node, ast.FunctionDef):
            continue
        rets = [n for n in ast.walk(node) if isinstance(n, ast.Return)]
        if len(rets) != 1 or rets[0].value is None:
            continue
        params = {a.arg for a in node.args.args}
        local = {k: v for k, v in env.items() if k not in params}
        val = _eval_str(rets[0].value, local)
        if val is not None and val.startswith(("/", "\x00/")):
            out[f"{node.name}()"] = val
    return out


def _class_envs(
    tree: ast.Module, env: dict[str, str]
) -> list[tuple[int, int, dict[str, str]]]:
    """(start, end, env) per class: its string attributes as `self.X`."""
    out = []
    for node in _nodes(tree):
        if isinstance(node, ast.ClassDef):
            cls_env = _assign_env(node.body, env)
            extra = {f"self.{k}": v for k, v in cls_env.items() if k not in env}
            extra.update({f"{node.name}.{k[5:]}": v for k, v in extra.items()})
            out.append((node.lineno, node.end_lineno, {**env, **extra}))
    return out


PARAM_PRODUCT_CAP = 64


def _parametrize_rows(fn: ast.AST, env: dict[str, str]) -> list[dict[str, str]]:
    """`@pytest.mark.parametrize("path", ["/a", "/b"])` (and "m,p" tuples,
    `pytest.param(...)`, stacked decorators) → one env per case, string
    values only. A test calling `client.post(path)` then counts for each."""
    rows: list[dict[str, str]] = [{}]
    for dec in getattr(fn, "decorator_list", []):
        if not (
            isinstance(dec, ast.Call)
            and isinstance(dec.func, ast.Attribute)
            and dec.func.attr == "parametrize"
            and len(dec.args) >= 2
        ):
            continue
        names_node, values_node = dec.args[0], dec.args[1]
        if isinstance(names_node, ast.Constant) and isinstance(names_node.value, str):
            names = [n.strip() for n in names_node.value.split(",") if n.strip()]
        elif isinstance(names_node, (ast.List, ast.Tuple)):
            names = [e.value for e in names_node.elts if isinstance(e, ast.Constant)]
        else:
            continue
        if isinstance(values_node, ast.Name):
            continue  # a module table — _table_rows' business, not this one
        if not isinstance(values_node, (ast.List, ast.Tuple)):
            continue
        cases = []
        for v in values_node.elts:
            if (
                isinstance(v, ast.Call)
                and isinstance(v.func, ast.Attribute)
                and v.func.attr == "param"
            ):
                vals = v.args
            elif len(names) == 1:
                vals = [v]
            elif isinstance(v, (ast.Tuple, ast.List)):
                vals = v.elts
            else:
                continue
            case = {}
            for n, node in zip(names, vals):
                sv = _eval_str(node, env)
                if sv is not None:
                    case[n] = sv
            cases.append(case)
        if cases:
            rows = [{**a, **b} for a in rows for b in cases][:PARAM_PRODUCT_CAP]
    return rows


def _assign_env(body, env: dict[str, str]) -> dict[str, str]:
    out = dict(env)
    for stmt in body:
        if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1:
            tgt = stmt.targets[0]
            if isinstance(tgt, ast.Name):
                val = _eval_str(stmt.value, out)
                if val is not None:
                    out[tgt.id] = val
        elif isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
            val = _eval_str(stmt.value, out)
            if val is not None:
                out[stmt.target.id] = val
    return out


def normalise_path(raw: str) -> str | None:
    s = raw.strip()
    s = re.sub(r"^https?://[^/]+", "", s)
    s = s.split("?", 1)[0].split("#", 1)[0]
    if not s.startswith("/"):
        return None
    s = s.replace("\x00", PLACEHOLDER)
    if len(s) > 1:
        s = s.rstrip("/") or "/"
    return s


def _function_spans(tree: ast.AST) -> list[tuple[int, int, str, ast.AST]]:
    spans = []
    for node in _nodes(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            start = min([d.lineno for d in node.decorator_list] + [node.lineno])
            spans.append((start, node.end_lineno, node.name, node))
    return spans


_SPAN_INDEX: dict[int, list] = {}
_NODES: dict[int, tuple] = {}


def _nodes(tree: ast.AST) -> list[ast.AST]:
    """Every node of `tree`, walked ONCE and reused (the index used to walk
    each test file seven times; that walk dominated the run time)."""
    got = _NODES.get(id(tree))
    if got is None or got[0] is not tree:
        got = (tree, list(ast.walk(tree)))
        _NODES[id(tree)] = got
    return got[1]


def _innermost(spans, line: int):
    """Innermost function span holding `line`. Spans sorted by start and
    painted onto a per-line array once per span list (nested spans start
    later, so they overwrite their parent) — O(lines), not O(nodes × spans)."""
    idx = _SPAN_INDEX.get(id(spans))
    if idx is None or idx[0] is not spans:
        top = max((s[1] for s in spans), default=0)
        arr = [None] * (top + 2)
        for sp in sorted(spans, key=lambda x: (x[0], -x[1])):
            for ln in range(sp[0], sp[1] + 1):
                arr[ln] = sp
        idx = (spans, arr)
        _SPAN_INDEX[id(spans)] = idx
    arr = idx[1]
    return arr[line] if 0 <= line < len(arr) else None


@dataclass
class PytestIndex:
    calls: list[Call]
    funcs: list[TestFunc]
    literals: list[tuple[str, int, str]]  # (file, line, normalised path)
    texts: dict[str, list[str]]


_GETATTR_RE = re.compile(r"getattr\(\s*[\w.]*client\w*\s*,\s*(\w+)\s*\)")
_REQUEST_RE = re.compile(r"[\w.]*client\w*\.request\(\s*(\w+)\s*,\s*(\w+)")
_HELPER_CALL_RE = re.compile(r"\b(\w+)\(\s*[\w.]*client\w*\s*,\s*(\w+)\s*,\s*(\w+)")


def _bound_names(fn: ast.AST, owner: str) -> set[str]:
    """Names a function binds FROM the table `owner`: `for m, p in OWNER`
    targets, and `@pytest.mark.parametrize("m,p", OWNER)` argnames."""
    names: set[str] = set()
    for n in ast.walk(fn):
        if isinstance(n, (ast.For, ast.comprehension)) and isinstance(n.iter, ast.Name):
            if n.iter.id == owner:
                names |= {e.id for e in ast.walk(n.target) if isinstance(e, ast.Name)}
    for dec in getattr(fn, "decorator_list", []):
        if (
            isinstance(dec, ast.Call)
            and isinstance(dec.func, ast.Attribute)
            and dec.func.attr == "parametrize"
            and len(dec.args) >= 2
            and isinstance(dec.args[1], ast.Name)
            and dec.args[1].id == owner
            and isinstance(dec.args[0], ast.Constant)
        ):
            names |= {x.strip() for x in str(dec.args[0].value).split(",")}
    return names


def _drives_requests(src: str, bound: set[str], dyn_helpers: set[str]) -> bool:
    """The consumer makes a request whose method AND path come from the table:
    `getattr(client, m)(p)`, `client.request(m, p)`, or a same-file helper
    that itself does one of those, called as `helper(client, m, p)`."""
    if any(m.group(1) in bound for m in _GETATTR_RE.finditer(src)):
        return True
    if any({m.group(1), m.group(2)} <= bound for m in _REQUEST_RE.finditer(src)):
        return True
    return any(
        m.group(1) in dyn_helpers and {m.group(2), m.group(3)} <= bound
        for m in _HELPER_CALL_RE.finditer(src)
    )


def _table_rows(fname, tree, lines, spans, func_envs, base_env) -> list[Call]:
    """`("post", f"/admin/producers/{_U}/approve")` rows of an endpoint table
    (e.g. tests/test_expansion_admin_authz.py) — the test calls
    `getattr(client, method)(path)`, which no literal call shows."""
    owners = []  # (start, end, name) of module-level assignments
    for stmt in tree.body:
        if isinstance(stmt, ast.Assign) and isinstance(stmt.targets[0], ast.Name):
            owners.append((stmt.lineno, stmt.end_lineno, stmt.targets[0].id))
    dyn_helpers = {
        sp[2]
        for sp in spans
        if _GETATTR_RE.search("\n".join(lines[sp[0] - 1 : sp[1]]))
        or _REQUEST_RE.search("\n".join(lines[sp[0] - 1 : sp[1]]))
    }
    out = []
    for node in _nodes(tree):
        if not isinstance(node, (ast.Tuple, ast.List)) or len(node.elts) < 2:
            continue
        head = node.elts[0]
        # cheap pre-filter: a table row starts with a method string
        if not (
            isinstance(head, ast.Constant)
            and isinstance(head.value, str)
            and head.value.lower() in HTTP_METHODS
        ):
            continue
        span = _innermost(spans, node.lineno)
        env = func_envs.get(span[0]) if span else base_env(node.lineno)
        m = _eval_str(node.elts[0], env)
        if not m or m.lower() not in HTTP_METHODS:
            continue
        raw = _eval_str(node.elts[1], env)
        path = normalise_path(raw) if raw else None
        if path is None:
            continue
        if span:
            # a table inside a function: its owner is the assignment holding it
            owner = next(
                (
                    a.targets[0].id
                    for a in ast.walk(span[3])
                    if isinstance(a, ast.Assign)
                    and isinstance(a.targets[0], ast.Name)
                    and a.lineno <= node.lineno <= (a.end_lineno or a.lineno)
                ),
                None,
            )
            consumers = [span] if owner else []
        else:
            owner = next((o[2] for o in owners if o[0] <= node.lineno <= o[1]), None)
            if owner is None:
                continue
            rx = re.compile(r"\b" + re.escape(owner) + r"\b")
            consumers = [
                sp for sp in spans if rx.search("\n".join(lines[sp[0] - 1 : sp[1]]))
            ]
        # The table must actually DRIVE a request with ITS values: a consumer
        # whose dynamic call takes method and path from names bound by
        # iterating / parametrizing over this very table. A table that is only
        # diffed against an inventory (test_meh1979's DELIBERATELY_UNLIMITED),
        # or a consumer that calls an unrelated helper, is not a request.
        consumers = [
            sp
            for sp in consumers
            if _drives_requests(
                "\n".join(lines[sp[0] - 1 : sp[1]]),
                _bound_names(sp[3], owner),
                dyn_helpers,
            )
        ]
        if not consumers:
            continue
        window = "\n".join("\n".join(lines[sp[0] - 1 : sp[1]]) for sp in consumers)
        out.append(
            Call(
                fname,
                node.lineno,
                node.end_lineno or node.lineno,
                m.upper(),
                path,
                consumers[0][2],
                consumers[0][0],
                consumers[0][1],
                window,
                table=True,
            )
        )
    return out


def build_pytest_index(tests_dir: Path = TESTS_DIR) -> PytestIndex:
    """Every client call, test function and path literal in the git-tracked
    `tests_dir/**/*.py` (minus SCAN_EXCLUDE), parsed with `ast`."""
    sources = {}
    for p in tracked_under(tests_dir, r"\.py$"):
        r = rel(p)
        if r in SCAN_EXCLUDE:
            continue
        sources[r] = p.read_text(encoding="utf-8")
    calls: list[Call] = []
    funcs: list[TestFunc] = []
    literals: list[tuple[str, int, str]] = []
    texts: dict[str, list[str]] = {}
    for fname in sorted(sources):
        text = sources[fname]
        lines = text.splitlines()
        texts[fname] = lines
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", SyntaxWarning)
                tree = ast.parse(text)
        except SyntaxError:
            continue
        module_env = _assign_env(tree.body, {})
        module_env.update(_url_helpers(tree, module_env))
        class_envs = _class_envs(tree, module_env)
        spans = _function_spans(tree)

        def _base_env(line: int) -> dict[str, str]:
            inner = [c for c in class_envs if c[0] <= line <= c[1]]
            return max(inner, key=lambda c: c[0])[2] if inner else module_env

        assigns = sorted(
            (n for n in _nodes(tree) if isinstance(n, (ast.Assign, ast.AnnAssign))),
            key=lambda n: n.lineno,
        )
        func_envs = {
            s[0]: _assign_env(
                [a for a in assigns if s[0] <= a.lineno <= s[1]], _base_env(s[0])
            )
            for s in spans
        }
        param_rows = {s[0]: _parametrize_rows(s[3], func_envs[s[0]]) for s in spans}
        in_fstring = {
            id(v)
            for n in _nodes(tree)
            if isinstance(n, ast.JoinedStr)
            for v in n.values
        }
        file_calls: list[Call] = []
        for node in _nodes(tree):
            if (
                isinstance(node, ast.Constant)
                and isinstance(node.value, str)
                and id(node) not in in_fstring
            ):
                p = normalise_path(node.value)
                if p and re.match(r"^/[a-z]", p):
                    literals.append((fname, node.lineno, p))
            if not isinstance(node, ast.Call) or not isinstance(
                node.func, ast.Attribute
            ):
                continue
            attr = node.func.attr
            if not _is_client_receiver(node.func.value):
                continue
            span = _innermost(spans, node.lineno)
            env = func_envs.get(span[0], module_env) if span else _base_env(node.lineno)
            seen = set()
            for row in param_rows.get(span[0], [{}]) if span else [{}]:
                env_row = {**env, **row}
                if attr in HTTP_METHODS and node.args:
                    method, arg = attr.upper(), node.args[0]
                elif attr == "request" and len(node.args) >= 2:
                    m = _eval_str(node.args[0], env_row)
                    if not m or m.lower() not in HTTP_METHODS:
                        continue
                    method, arg = m.upper(), node.args[1]
                else:
                    continue
                raw = _eval_str(arg, env_row)
                if raw is None:
                    continue
                path = normalise_path(raw)
                if path is None or (method, path) in seen:
                    continue
                seen.add((method, path))
                file_calls.append(
                    Call(
                        file=fname,
                        line=node.lineno,
                        end=node.end_lineno or node.lineno,
                        method=method,
                        path=path,
                        func_name=span[2] if span else "<module>",
                        func_start=span[0] if span else 0,
                        func_end=span[1] if span else 0,
                        actor=next(
                            (
                                ast.unparse(k.value)
                                for k in node.keywords
                                if k.arg == "headers"
                            ),
                            "",
                        ),
                    )
                )
        file_calls.sort(key=lambda c: (c.line, c.method, c.path))
        simple = [
            (n.lineno, n.end_lineno or n.lineno, n)
            for n in _nodes(tree)
            if isinstance(
                n,
                (
                    ast.Assert,
                    ast.Assign,
                    ast.AnnAssign,
                    ast.AugAssign,
                    ast.Expr,
                    ast.Return,
                ),
            )
        ]
        for c in file_calls:
            holders = [(a, n) for a, b, n in simple if a <= c.line <= b]
            if holders:
                c.wstart, stmt = max(holders, key=lambda h: h[0])
                c.in_return = isinstance(stmt, ast.Return)
                c.stmt = "\n".join(
                    lines[stmt.lineno - 1 : stmt.end_lineno or stmt.lineno]
                )
                if (
                    isinstance(stmt, ast.Assign)
                    and len(stmt.targets) == 1
                    and isinstance(stmt.targets[0], ast.Name)
                ):
                    c.var = stmt.targets[0].id
            else:
                c.wstart = c.line
            # the follow-up: past the call, up to the next MUTATING call
            stop = c.end + FOLLOWUP_WINDOW
            if c.func_end:
                stop = min(stop, c.func_end)
            nxt = [
                d.line for d in file_calls if d.line > c.end and d.method in MUTATIONS
            ]
            if nxt:
                stop = min(stop, min(nxt) - 1)
            c.after = "\n".join(lines[c.end : max(stop, c.end)])
        for i, c in enumerate(file_calls):
            stop = c.end + NEG_WINDOW
            if c.func_end:
                stop = min(stop, c.func_end)  # never into the next test
            if i + 1 < len(file_calls) and file_calls[i + 1].line > c.line:
                stop = min(stop, file_calls[i + 1].line - 1)
            c.window = "\n".join(lines[c.wstart - 1 : max(stop, c.end)])
        calls.extend(file_calls)
        calls.extend(_table_rows(fname, tree, lines, spans, func_envs, _base_env))
        for start, end, name, _node in sorted(spans, key=lambda s: s[0]):
            tf = TestFunc(fname, name, start, end, "\n".join(lines[start - 1 : end]))
            tf.calls = [
                c for c in file_calls if c.func_start == start and c.func_name == name
            ]
            funcs.append(tf)
        file_funcs = [f for f in funcs if f.file == fname]
        helpers = {
            f.name: f for f in file_funcs if f.calls and not f.name.startswith("test")
        }
        for hname, helper in helpers.items():
            rx = re.compile(r"\b" + re.escape(hname) + r"\(")
            for tf in file_funcs:
                if tf is helper:
                    continue
                for off, ln in enumerate(tf.source.splitlines()):
                    if rx.search(ln):
                        start = tf.start + off
                        stop = min(start + NEG_WINDOW, tf.end)
                        win = "\n".join(lines[start - 1 : stop])
                        for c in helper.calls:
                            c.outer_windows.append(win)
        for tf in file_funcs:
            tf.all_calls = list(tf.calls)
            for hname, helper in helpers.items():
                if hname != tf.name and re.search(
                    r"\b" + re.escape(hname) + r"\(", tf.source
                ):
                    tf.all_calls.extend(helper.calls)
    return PytestIndex(calls, funcs, literals, texts)


# ═════════════════════════════════════════════════════════════════════════════
# 3. Frontend: pages, Playwright, Vitest
# ═════════════════════════════════════════════════════════════════════════════


@dataclass
class Page:
    file: str
    route: str
    group: str
    regex: re.Pattern
    static_segments: int


def page_route_from_file(page_file: Path) -> str:
    parts = page_file.relative_to(PAGES_ROOT).parts[:-1]
    segs = [
        p
        for p in parts
        if not (p.startswith("(") and p.endswith(")")) and not p.startswith("@")
    ]
    return "/" + "/".join(segs) if segs else "/"


def collect_pages(root: Path = PAGES_ROOT) -> list[Page]:
    pages = []
    files = tracked_under(root, r"/page\.(jsx?|tsx?)$")
    for f in files:
        route = page_route_from_file(f)
        if route.startswith("/admin"):
            group = "admin"
        elif route.startswith("/producer/dashboard"):
            group = "dashboard"
        else:
            group = "public"
        rx, static = [], 0
        for seg in [s for s in route.split("/") if s]:
            if seg.startswith("[[...") or seg.startswith("[..."):
                rx.append("(?:/.*)?" if seg.startswith("[[") else "/.+")
            elif seg.startswith("["):
                rx.append("/[^/]+")
            else:
                rx.append("/" + re.escape(seg))
                static += 1
        regex = re.compile("^" + ("".join(rx) or "/") + "$")
        pages.append(Page(rel(f), route, group, regex, static))
    return pages


def resolve_page(pages: list[Page], path: str) -> Page | None:
    candidates = [p for p in pages if p.regex.match(path)]
    if not candidates:
        return None
    return max(candidates, key=lambda p: (p.static_segments, -len(p.route)))


def playwright_spec_files() -> list[Path]:
    text = PLAYWRIGHT_CONFIG.read_text(encoding="utf-8")
    m = re.search(r"testMatch:\s*\[([^\]]*)\]", text)
    globs = re.findall(r"[\"']([^\"']+)[\"']", m.group(1)) if m else []
    out: set[Path] = set()
    for g in globs:
        out.update((ROOT / "frontend").glob(g))
    tracked = _tracked()
    return sorted(p for p in out if rel(p) in tracked)


_TS_STR = r"(\"[^\"\n]*\"|'[^'\n]*'|`[^`]*`)"


def _ts_str_value(lit: str, consts: dict[str, str]) -> str:
    body = lit[1:-1]
    if lit.startswith("`"):

        def sub(m):
            name = m.group(1).strip()
            return consts.get(name, "\x00")

        body = re.sub(r"\$\{([^}]*)\}", sub, body)
    return body


def _ts_consts(text: str) -> dict[str, str]:
    consts: dict[str, str] = {}
    for m in re.finditer(r"\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*" + _TS_STR, text):
        consts[m.group(1)] = _ts_str_value(m.group(2), consts)
    return consts


def _strip_locale(path: str) -> list[str]:
    segs = [s for s in path.split("/") if s]
    variants = [path]
    if segs and (segs[0] in {"he", "en"} or segs[0] == PLACEHOLDER):
        variants.append("/" + "/".join(segs[1:]))
    return variants


@dataclass
class E2EIndex:
    gotos: list[tuple[str, int, str, bool]]  # file, line, path, guest-redirect?
    mocks: list[tuple[str, int, re.Pattern]]  # file, line, url regex
    files: list[str] = field(default_factory=list)


def _glob_to_regex(glob: str) -> re.Pattern | None:
    g = glob
    if re.match(r"^https?://", g):
        return None  # a third-party origin (wa.me, tiles, fonts) — not our API
    any_prefix = g.startswith("**")
    g = re.sub(r"^\*\*", "", g)
    if re.match(r"^/api(?=/)", g):
        g, any_prefix = g[4:], False  # `/api` marks the route root
    prefix = "(?:/[^?]*)?" if any_prefix else ""
    if not g.startswith("/"):
        return None
    if not re.search(r"[A-Za-z]", g):
        return None  # a catch-all (`**/api/**`) names no route, so it covers none
    out = []
    i = 0
    while i < len(g):
        if g[i] == "\x00":
            # an unresolved `${…}`: exactly ONE path segment, never a subtree;
            # a `*` / `**` right after it is the query-string tail
            out.append("[^/?]+")
            i += 1
            if g[i:] in ("*", "**"):
                out.append("(?:\\?.*)?")
                i = len(g)
        elif g.startswith("/**", i):
            out.append("(?:/.*)?")
            i += 3
        elif g.startswith("**", i):
            out.append("(?:[?/].*)?" if i + 2 == len(g) else ".*")
            i += 2
        elif g[i] == "*":
            out.append("(?:\\?.*)?" if i + 1 == len(g) else "[^/]*")
            i += 1
        else:
            out.append(re.escape(g[i]))
            i += 1
    return re.compile("^" + prefix + "".join(out) + "$")


def _regex_literal_to_regex(lit: str) -> re.Pattern | None:
    # /\/api\/events\/upcoming\/?$/  →  ^/events/upcoming/?$
    m = re.search(r"\\/api((?:\\/[\w\-{}]+)+)", lit)
    if not m:
        return None
    path = m.group(1).replace("\\/", "/")
    return re.compile("^" + re.escape(path) + "/?$")


REDIRECT_LOOKAHEAD = 6
REDIRECT_RE = r"(?:waitForURL|toHaveURL)\([^)\n]*login"


def build_e2e_index(spec_files: list[Path] | None = None) -> E2EIndex:
    files = spec_files if spec_files is not None else playwright_spec_files()
    gotos, mocks = [], []
    for f in files:
        text = f.read_text(encoding="utf-8")
        consts = _ts_consts(text)
        loops = {
            lm.group(1): re.findall(r"[\"']([^\"']*)[\"']", lm.group(2))
            for lm in re.finditer(
                r"for\s*\(\s*(?:const|let)\s+(\w+)\s+of\s+\[([^\]]*)\]\s*\)", text
            )
        }
        r = rel(f)
        for m in re.finditer(
            r"\b\w+\.goto\(\s*(" + _TS_STR[1:-1] + r"|[A-Za-z_$][\w$]*)", text
        ):
            tok = m.group(1)
            line = text.count("\n", 0, m.start()) + 1
            val = (
                consts.get(tok) if tok[0] not in "\"'`" else _ts_str_value(tok, consts)
            )
            if val is None:
                continue
            if val.startswith("\x00/"):
                val = val[1:]  # a leading ${base} origin
            p = normalise_path(val)
            if p:
                # A goto whose next lines wait for / assert a /login URL is a
                # guest-redirect check: the page itself never rendered.
                after = text[m.end() :].split("\n")[1 : 1 + REDIRECT_LOOKAHEAD]
                tail = []
                for ln in after:
                    if re.search(r"\btest\(|\.goto\(", ln):
                        break
                    tail.append(ln)
                redirect = bool(re.search(REDIRECT_RE, "\n".join(tail)))
                gotos.append((r, line, p, redirect))
        for m in re.finditer(
            r"\.route\(\s*("
            + _TS_STR[1:-1]
            + r"|[A-Za-z_$][\w$]*|\([^)]*\)\s*=>[^,]*)",
            text,
        ):
            tok = m.group(1)
            line = text.count("\n", 0, m.start()) + 1
            if tok[0] in "\"'`":
                # `for (const sub of ["a", "b"]) page.route(`…/${sub}**`)`:
                # one mock per literal value. Any other `${…}` stays a
                # placeholder that matches exactly one path segment.
                used = [v for v in loops if "${" + v + "}" in tok]
                envs = [{}]
                for v in used:
                    envs = [{**e, v: val} for e in envs for val in loops[v]]
                rxs = [
                    _glob_to_regex(_ts_str_value(tok, {**consts, **e})) for e in envs
                ]
            elif tok in consts:
                rxs = [_glob_to_regex(consts[tok])]
            else:
                rxs = [_regex_literal_to_regex(tok)]
            for rx in rxs:
                if rx is not None:
                    mocks.append((r, line, rx))
    return E2EIndex(gotos, mocks, [rel(f) for f in files])


@dataclass
class VitestIndex:
    imports: dict[str, list[tuple[str, int]]]  # resolved module (no ext) → (file, line)
    texts: dict[str, str]


def _strip_ext(p: str) -> str:
    return re.sub(r"\.(jsx?|tsx?|mjs)$", "", p)


def build_vitest_index_for(files: list[Path]) -> VitestIndex:
    return build_vitest_index(files=files)


def build_vitest_index(
    test_dir: Path = VITEST_DIR, files: list[Path] | None = None
) -> VitestIndex:
    imports: dict[str, list[tuple[str, int]]] = {}
    texts: dict[str, str] = {}
    if files is None:
        files = tracked_under(test_dir, r"\.test\.(jsx?|tsx?)$")
    spec_re = re.compile(
        r"(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)[\"']([^\"']+)[\"']",
        re.M,
    )
    for f in files:
        text = f.read_text(encoding="utf-8")
        r = rel(f)
        texts[r] = text
        for m in spec_re.finditer(text):
            spec = m.group(1)
            if spec.startswith("@/"):
                target = "frontend/" + spec[2:]
            elif spec.startswith("."):
                target = (
                    rel((f.parent / spec).resolve())
                    if (f.parent / spec).resolve().is_relative_to(ROOT)
                    else None
                )
            else:
                continue
            if not target:
                continue
            line = text.count("\n", 0, m.start()) + 1
            imports.setdefault(_strip_ext(target), []).append((r, line))
    return VitestIndex(imports, texts)


# ═════════════════════════════════════════════════════════════════════════════
# 4. Coverage cells
# ═════════════════════════════════════════════════════════════════════════════


@dataclass
class Cell:
    status: str  # covered | e2e-mock | weak | GAP | n/a
    where: str = ""
    note: str = ""

    def render(self) -> str:
        if self.status in (GAP, "n/a"):
            return self.status + (f" ({self.note})" if self.note else "")
        tag = "" if self.status == "covered" else f"{self.status} "
        return f"{tag}`{self.where}`" + (f" ({self.note})" if self.note else "")


STATUS_ORDER = {"covered": 0, "e2e-mock": 1, "weak": 2, GAP: 3, "n/a": 4}


def worst(cells: list[Cell]) -> Cell:
    cells = [c for c in cells if c is not None and c.status != "n/a"]
    if not cells:
        return Cell("n/a")
    return max(cells, key=lambda c: STATUS_ORDER[c.status])


def best(cells: list[Cell]) -> Cell:
    cells = [c for c in cells if c is not None]
    if not cells:
        return Cell(GAP)
    return min(cells, key=lambda c: STATUS_ORDER[c.status])


@dataclass
class Evidence:
    """Everything the matcher found, indexed for the row builders."""

    routes: list[Route]
    pytest: PytestIndex
    e2e: E2EIndex
    vitest: VitestIndex
    calls_by_route: dict[str, list[Call]] = field(default_factory=dict)
    literals_by_route: dict[str, list[tuple[str, int]]] = field(default_factory=dict)

    def index(self) -> "Evidence":
        for c in self.pytest.calls:
            r = resolve_route(self.routes, c.method, c.path)
            if r is not None:
                self.calls_by_route.setdefault(r.key, []).append(c)
        for f, line, p in self.pytest.literals:
            for r in self.routes:
                if r.regex.match(p):
                    self.literals_by_route.setdefault(r.key, []).append((f, line))
                    break
        return self


def _is_refusal(c: Call) -> bool:
    return NEG_ASSERT_RE.search(c.window) is not None


_ASSERT_LINE_RE = re.compile(r"^\s*assert\b.*$", re.M)


def _body_succeeds(win: str, var: str, chained: bool) -> bool:
    """Success shown by the response BODY: an assert that reads this call's
    `.json()` (chained on the call, or through the variable it was bound to),
    no assertion of a 4xx/5xx, and no assertion about an error `detail`."""
    if ERR_ASSERT_RE.search(win):
        return False
    asserts = _ASSERT_LINE_RE.findall(win)
    if any(re.search(r"[\"']detail[\"']", a) for a in asserts):
        return False
    if chained:
        return bool(asserts)
    if var:
        names = {var}
        # `body = r.json()` then `assert body…`
        for m in re.finditer(
            r"^\s*(\w+)\s*=\s*" + re.escape(var) + r"\.json\(\)", win, re.M
        ):
            names.add(m.group(1))
        return any(
            re.search(r"\b" + re.escape(n) + r"\b", a) for a in asserts for n in names
        ) and (f"{var}.json()" in win)
    return False


def _followup_succeeds(c: Call) -> bool:
    """An unasserted mutation whose effect the test reads back: `db.refresh(x)`
    or a GET, followed by an `assert`, with no 4xx/5xx asserted anywhere in
    the call's window or the follow-up (tests/test_report_lifecycle.py's
    dismiss, tests/test_outreach_prefill_edge_cases.py's PATCH)."""
    if c.method not in MUTATIONS or STATUS_ANY_RE.search(c.window):
        return False
    if ERR_ASSERT_RE.search(c.window) or ERR_ASSERT_RE.search(c.after):
        return False
    lines = c.after.splitlines()
    for i, ln in enumerate(lines):
        if re.search(r"db\.refresh\(|\bclient\w*\.get\(", ln):
            # the read itself inside an assert, or an assert after it
            return any(re.match(r"\s*assert\b", x) for x in lines[i:])
    return False


def _window_succeeds(c: Call, win: str) -> bool:
    if POS_ASSERT_RE.search(win):
        return True
    return _body_succeeds(win, c.var, chained=".json()" in c.stmt)


def _call_succeeds(c: Call) -> bool:
    if _window_succeeds(c, c.window) or _followup_succeeds(c):
        return True
    # A helper that RETURNS the response: judged at its call sites.
    return c.in_return and any(_window_succeeds(c, w) for w in c.outer_windows)


def route_positive(ev: Evidence, r: Route) -> Cell:
    """A call that is only ever asserted refused (401/403) does not exercise
    the handler — it is a negative test. Positive needs some other call."""
    calls = ev.calls_by_route.get(r.key, [])
    # `covered` needs a call whose window ASSERTS success (2xx/3xx). A call
    # asserted 400/404/422/500, or not asserted at all, exercises an error
    # path at best — the handler's success path is not evidenced by it.
    ok = [c for c in calls if _call_succeeds(c)]
    if ok:
        c = ok[0]
        return Cell("covered", f"{c.file}:{c.line}")
    if calls:
        if all(_is_refusal(c) for c in calls):
            note = "only refused calls"
        elif all(ERR_ASSERT_RE.search(c.window) for c in calls):
            note = "only error-path calls"
        else:
            note = "no success asserted"
        return Cell("weak", f"{calls[0].file}:{calls[0].line}", note)
    return route_weak(ev, r) or Cell(GAP)


def route_weak(ev: Evidence, r: Route) -> Cell | None:
    lits = ev.literals_by_route.get(r.key)
    if lits:
        f, line = lits[0]
        return Cell("weak", f"{f}:{line}", "path literal")
    name_re = re.compile(r"\b" + re.escape(r.func) + r"\b")
    mod_re = re.compile(
        r"routers(?:\.|\s+import\s+(?:\(?[\w\s,]*\b))" + re.escape(r.module) + r"\b"
    )
    for f in sorted(ev.pytest.texts):
        lines = ev.pytest.texts[f]
        text = "\n".join(lines)
        if mod_re.search(text):
            for i, ln in enumerate(lines, 1):
                if name_re.search(ln):
                    return Cell("weak", f"{f}:{i}", "name")
    return None


def route_negative(ev: Evidence, r: Route) -> Cell:
    if not r.gated:
        return Cell("n/a")
    for c in ev.calls_by_route.get(r.key, []):
        # The negative cell is the ROLE gate. A 403 for an admin-gated route
        # asserted on a call made AS an admin (e.g. the protected-owner rule,
        # tests/test_meh2890_super_admin_env.py) is a business rule, not the
        # gate refusing a wrong role — it does not count.
        if r.actor == "admin" and re.search(r"\badmin", c.actor, re.I):
            continue
        m = NEG_ASSERT_RE.search(c.window)
        if m:
            if c.table:
                return Cell("covered", f"{c.file}:{c.line}", "table row")
            off = c.window[: m.end()].count("\n")
            return Cell("covered", f"{c.file}:{(c.wstart or c.line) + off}")
    return Cell(GAP)


def route_e2e(ev: Evidence, r: Route) -> Cell | None:
    sample = re.sub(r"\{[^}]+\}", PLACEHOLDER, r.path)
    for f, line, rx in ev.e2e.mocks:
        if rx.match(sample):
            return Cell("e2e-mock", f"{f}:{line}")
    return None


def base_score(r: Route) -> tuple[int, list[str]]:
    """The route's own weight, before any coverage term. Shared by route rows
    and §B.3 extra rows so the two scales cannot drift apart."""
    why = []
    score = 3 if r.is_mutation else 1
    if "DELETE" in r.methods:
        score += 1
        why.append("delete")
    score += ACTOR_RANK[r.actor]
    if r.actor == "anonymous" and r.is_mutation:
        score += 1
        why.append("public write")
    if AUTH_PATH_RE.search(r.path):
        score += 3
        why.append("auth")
    if MONEY_PATH_RE.search(r.path) and r.is_mutation:
        score += 3
        why.append("money-like")
    if r.notifies:
        score += 2
        why.append("sends email/WhatsApp")
    if (
        r.is_mutation
        and r.actor != "admin"
        and re.search(r"\{[^}]+\}", r.path)
        and not PUBLIC_TARGET_RE.search(r.path)
    ):
        # An object addressed by id — `/me/…/{id}` included: being logged in as
        # "me" does not make the {id} mine. The refusal of a stranger is a 404 /
        # ownership check that a 401/403 cell can never credit. Excluded: the
        # caller's own list of PUBLIC targets (favorite / save a public item).
        score += 2
        why.append("object id in path (IDOR-shaped)")
    if r.path.startswith("/admin/settings") and r.is_mutation:
        score += 3
        why.append("site-wide settings")
    if VISIBILITY_PATH_RE.search(r.path) and r.is_mutation:
        score += 2
        why.append("public visibility")
    if PRIVILEGE_PATH_RE.search(r.path) and r.is_mutation:
        # The highest single weight (Sapir 10/11): a wrong role / block is
        # worse than any one surface above.
        score += PRIVILEGE_WEIGHT
        why.append("privilege change")
    return score, why


def route_score(r: Route, pos: Cell, neg: Cell) -> tuple[int, list[str]]:
    score, why = base_score(r)
    score += {GAP: 4, "weak": 2}.get(pos.status, 0)
    if pos.status == GAP:
        why.append("no test")
    elif pos.status != "covered":
        why.append(f"only {pos.status}")
    if r.gated and neg.status == GAP:
        score += 2
        why.append("no 401/403 test")
    return score, why


@dataclass
class RouteRow:
    route: Route
    pos: Cell
    neg: Cell
    e2e: Cell | None
    verdict: Cell
    score: int
    why: list[str]


def build_route_rows(ev: Evidence) -> list[RouteRow]:
    rows = []
    for r in ev.routes:
        pos = route_positive(ev, r)
        e2e = route_e2e(ev, r)
        neg = route_negative(ev, r)
        # Coverage = a test that CALLS the route and asserts its result. An
        # E2E `page.route` mock never runs the backend: it is shown in its own
        # column as information and never counts toward the verdict.
        verdict = pos
        score, why = route_score(r, verdict, neg)
        rows.append(RouteRow(r, pos, neg, e2e, verdict, score, why))
    return rows


# ── pages ────────────────────────────────────────────────────────────────────


@dataclass
class PageRow:
    page: Page
    e2e: Cell
    unit: Cell
    verdict: Cell


def build_page_rows(ev: Evidence, pages: list[Page]) -> list[PageRow]:
    hits: dict[str, tuple[str, int]] = {}
    redirect_only: dict[str, tuple[str, int]] = {}
    for f, line, path, redirect in ev.e2e.gotos:
        for variant in _strip_locale(path):
            pg = resolve_page(pages, variant)
            if pg is not None:
                (redirect_only if redirect else hits).setdefault(pg.file, (f, line))
                break
    rows = []
    for pg in pages:
        if pg.file in hits:
            e2e = Cell("covered", "%s:%d" % hits[pg.file])
        elif pg.file in redirect_only:
            e2e = Cell(
                "weak", "%s:%d" % redirect_only[pg.file], "only a guest-redirect check"
            )
        else:
            e2e = Cell(GAP)
        imp = ev.vitest.imports.get(_strip_ext(pg.file))
        unit = Cell("covered", "%s:%d" % imp[0]) if imp else Cell(GAP)
        rows.append(PageRow(pg, e2e, unit, best([e2e, unit])))
    return rows


# ── business tools ───────────────────────────────────────────────────────────


@dataclass
class Tool:
    id: str
    group: str
    status: str
    code_refs: list[str]
    dashboard: str | None
    line: int


FEATURE_LINE_RE = re.compile(r"^\s*\{\s*id:\s*\"([a-z0-9_]+)\"")


def parse_business_features(text: str) -> list[Tool]:
    """One entry per line inside `export const BUSINESS_FEATURES = [ ... ];`."""
    start = text.find("export const BUSINESS_FEATURES")
    if start < 0:
        raise ValueError("BUSINESS_FEATURES not found")
    end = text.find("\n];", start)
    first_line = text.count("\n", 0, start) + 1
    tools = []
    for i, ln in enumerate(text[start:end].splitlines()):
        m = FEATURE_LINE_RE.match(ln)
        if not m:
            continue
        group = re.search(r"group:\s*\"([a-z]+)\"", ln)
        status = re.search(r"status:\s*\"([a-z]+)\"", ln)
        # Paths contain `[locale]` / `[id]`, so the list ends at the first `]`
        # that is not inside a string — match the strings, not the brackets.
        refs_m = re.search(r"codeRef:\s*\[((?:\s*\"[^\"]*\"\s*,?)*)\s*\]", ln)
        dash = re.search(r"dashboard:\s*\{[^}]*href:\s*\"([^\"]+)\"", ln)
        tools.append(
            Tool(
                id=m.group(1),
                group=group.group(1) if group else "?",
                status=status.group(1) if status else "?",
                code_refs=re.findall(r"\"([^\"]+)\"", refs_m.group(1))
                if refs_m
                else [],
                dashboard=dash.group(1) if dash else None,
                line=first_line + i,
            )
        )
    return tools


@dataclass
class ToolRow:
    tool: Tool
    backend: Cell
    unit: Cell
    page: Cell
    verdict: Cell


def _files_under(ref: str) -> list[str]:
    p = ROOT / ref
    if p.is_dir():
        return [rel(x) for x in tracked_under(p, r"\.(jsx?|tsx?|py)$")]
    return [ref]


def _python_module_import(ev: Evidence, ref: str) -> tuple[Cell | None, Cell | None]:
    mod = (
        Path(ref)
        .with_suffix("")
        .as_posix()
        .replace("backend/", "", 1)
        .replace("/", ".")
    )
    short = mod.rsplit(".", 1)[-1]
    pkg = mod.rsplit(".", 1)[0]
    imp_re = re.compile(
        r"^\s*(?:from\s+"
        + re.escape(mod)
        + r"\s+import|import\s+"
        + re.escape(mod)
        + r"\b|from\s+"
        + re.escape(pkg)
        + r"\s+import\s+.*\b"
        + re.escape(short)
        + r"\b)"
    )
    weak = None
    for f in sorted(ev.pytest.texts):
        for i, ln in enumerate(ev.pytest.texts[f], 1):
            if imp_re.search(ln):
                return Cell("covered", f"{f}:{i}", "imports module"), None
            if weak is None and (short in ln and (f"{short}." in ln or ref in ln)):
                weak = Cell("weak", f"{f}:{i}", "name")
    return None, weak


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
                "POST /rescue/orders/{order_id}/no_show",
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


if __name__ == "__main__":
    sys.exit(main())
