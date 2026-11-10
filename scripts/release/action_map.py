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
Related:  tests/test_action_map_complete.py (the guard), docs/release/anchor-
          plan.md §B (the spec), scripts/checks/openapi-codegen-drift-guard.sh
          (the drift pattern this follows).

CLI
  python scripts/release/action_map.py            print the summary
  python scripts/release/action_map.py --write    regenerate the doc and its
                                                  sha256 manifest
  python scripts/release/action_map.py --check    exit 1 if the committed doc is
                                                  stale (see DRIFT below)
  python scripts/release/action_map.py --check --strict   byte-exact compare
  python3 scripts/release/action_map.py --check-static    the no-app tier (DRIFT)
  python3 scripts/release/action_map.py --self-test-static
  All but the two *-static modes need PYTHONPATH=backend:. and the env the app
  imports with (ENV, SECRET_KEY). The static modes are stdlib only.

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
           path. Those responses are MOCKED — the backend never ran — so this is
           shown in its own column and only counts when nothing better exists.
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
  method      mutation (POST/PUT/PATCH/DELETE) 3, read 1
  actor       admin 2, business 2, registered user 1, anonymous 0 (+1 when it
              is an anonymous mutation: public write surface)
  surface     auth (auth/login/register/password/verify/otp/claim/token/reset
              in the path) +3; money-like (group-buy commit, rescue orders) +3;
              notifications (the endpoint's own source sends email/WhatsApp)
              +2; public visibility (approve/reject/publish/toggle-status/hide/
              unhide/verified/ambassador/story-card/request-changes) +2;
              privilege change (/role, /block, /admin/users/… mutations) +3;
              DELETE +1
  coverage    positive GAP +4, only e2e-mock +3, only weak +2; a gated route
              with no negative (401/403) test +2
  Extra rows (§B.3) score as their primary route's base (the same function,
  `base_score`) plus: race +3, time +2,
  negative +2, then the same coverage weights.

DRIFT
  The doc cites test lines, and any PR that edits a test file moves them. A
  byte-exact drift check would turn nearly every backend PR red for a change
  that is not a coverage change, so `--check` (and the guard test) compare the
  doc with `tests/…:N` / `frontend/…:N` line numbers masked. What DOES fail:
  a new or removed route / tool / page / audit row, any cell flipping between
  covered / weak / e2e-mock / GAP, a citation moving to a different file, or a
  different score. `--check --strict` is the byte-exact form. Regenerate with
  `--write` whenever it fails.
  Two more checks run on the COMMITTED doc, in every mode that checks:
    - its sha256 must equal docs/release/action-map.sha256, which only --write
      writes: a hand edit of any cell (GAP → covered) goes red;
    - every `covered` citation must still hold what it claims (an HTTP call,
      a 401/403 assertion, a `.goto(`): a citation that line drift alone made
      stale goes red even though the masked compare is equal.
  TIERS. pytest runs only for some paths, so the checks that need no app import
  (manifest, citations, «Pages», tool ids, audit rows) also run on EVERY PR as
  scripts/checks/action-map-drift-guard.sh in Repo guards. The full compare,
  route table included, is tests/test_action_map_complete.py in the pytest job;
  docs/ci/action-map-pytest-filter.patch.md (staged for Sapir) widens the paths
  that trigger it.
"""

from __future__ import annotations

import argparse
import ast
import functools
import hashlib
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
HELPER_HOPS = 6  # audit site → handler: helper calls followed inside one module
DRIFT_TOLERANCE = 25  # lines; see ModuleMap.routes_for
GAP = "GAP"

# ── Internal routes: explicit, with reasons. Not actor actions, so they get no
# actor/negative cell and no risk rank — but they are still listed (with
# coverage) in their own table, and the guard fails if an entry here stops
# resolving to a real route (a stale allowlist hides nothing silently).
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
PRIVILEGE_PATH_RE = re.compile(r"/role\b|/block\b|^/admin/users/")
NOTIFY_SRC_RE = re.compile(
    r"send_\w*email|send_\w*whatsapp|\bemail\.\w+\(|whatsapp\w*\.\w+\(|"
    r"send_template|notify_\w+\(|_notify\w*\(|send_\w*mail\("
)
ERR_ASSERT_RE = re.compile(
    r"(?:assert|status_code|==|\bin\b).*\b[45]\d\d\b|HTTP_[45]\d\d"
)
NEG_ASSERT_RE = re.compile(r"(?:assert|status_code|==|\bin\b).*\b40[13]\b|HTTP_40[13]")
POS_ASSERT_RE = re.compile(
    r"(?:assert|status_code|==|\bin\b).*\b(?:20\d|30[1-8])\b|HTTP_(?:20\d|30[1-8])|"
    r"\.is_success\b|raise_for_status\(|\bassert\s+\w+\.ok\b"
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
    # First line of the simple statement holding the call — `assert (` may
    # open on the line above `client.get(...)`. The window starts here.
    wstart: int = 0


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
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            cls_env = _assign_env(node.body, env)
            extra = {f"self.{k}": v for k, v in cls_env.items() if k not in env}
            extra.update({f"{node.name}.{k[5:]}": v for k, v in extra.items()})
            out.append((node.lineno, node.end_lineno, {**env, **extra}))
    return out


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
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            start = min([d.lineno for d in node.decorator_list] + [node.lineno])
            spans.append((start, node.end_lineno, node.name, node))
    return spans


def _innermost(spans, line: int):
    best = None
    for s in spans:
        if s[0] <= line <= s[1] and (best is None or s[0] >= best[0]):
            best = s
    return best


@dataclass
class PytestIndex:
    calls: list[Call]
    funcs: list[TestFunc]
    literals: list[tuple[str, int, str]]  # (file, line, normalised path)
    texts: dict[str, list[str]]


DYNAMIC_CALL_RE = re.compile(
    r"getattr\(\s*[\w.]*client\w*\s*,\s*[a-z_]\w*\s*\)"  # getattr(client, method)(...)
    r"|[\w.]*client\w*\.request\(\s*[a-z_]\w*\s*,\s*[a-z_]\w*"  # client.request(m, p)
    r"|\b\w+\(\s*[\w.]*client\w*\s*,\s*[a-z_]\w*\s*,\s*[a-z_]\w*"  # _call(client, m, p)
)


def _table_rows(fname, tree, lines, spans, func_envs, base_env) -> list[Call]:
    """`("post", f"/admin/producers/{_U}/approve")` rows of an endpoint table
    (e.g. tests/test_expansion_admin_authz.py) — the test calls
    `getattr(client, method)(path)`, which no literal call shows."""
    owners = []  # (start, end, name) of module-level assignments
    for stmt in tree.body:
        if isinstance(stmt, ast.Assign) and isinstance(stmt.targets[0], ast.Name):
            owners.append((stmt.lineno, stmt.end_lineno, stmt.targets[0].id))
    out = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Tuple, ast.List)) or len(node.elts) < 2:
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
            consumers = [span]
        else:
            owner = next((o[2] for o in owners if o[0] <= node.lineno <= o[1]), None)
            if owner is None:
                continue
            rx = re.compile(r"\b" + re.escape(owner) + r"\b")
            consumers = [
                sp for sp in spans if rx.search("\n".join(lines[sp[0] - 1 : sp[1]]))
            ]
        # The table must actually DRIVE a request: a consumer whose client call
        # takes the method / path from a variable. A table that is only diffed
        # against an inventory (test_meh1979's DELIBERATELY_UNLIMITED) is not a
        # request to that route.
        consumers = [
            sp
            for sp in consumers
            if DYNAMIC_CALL_RE.search("\n".join(lines[sp[0] - 1 : sp[1]]))
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


def build_pytest_index(
    tests_dir: Path = TESTS_DIR, sources: dict[str, str] | None = None
) -> PytestIndex:
    """`sources` (rel path → text) replaces the filesystem — the self-test feeds
    synthetic files through the same code."""
    if sources is None:
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

        func_envs = {s[0]: _assign_env(ast.walk(s[3]), _base_env(s[0])) for s in spans}
        in_fstring = {
            id(v)
            for n in ast.walk(tree)
            if isinstance(n, ast.JoinedStr)
            for v in n.values
        }
        file_calls: list[Call] = []
        for node in ast.walk(tree):
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
            if attr in HTTP_METHODS and node.args:
                method, arg = attr.upper(), node.args[0]
            elif attr == "request" and len(node.args) >= 2:
                m = _eval_str(node.args[0], env)
                if not m or m.lower() not in HTTP_METHODS:
                    continue
                method, arg = m.upper(), node.args[1]
            else:
                continue
            raw = _eval_str(arg, env)
            if raw is None:
                continue
            path = normalise_path(raw)
            if path is None:
                continue
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
            (n.lineno, n.end_lineno or n.lineno)
            for n in ast.walk(tree)
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
            starts = [a for a, b in simple if a <= c.line <= b]
            c.wstart = max(starts) if starts else c.line
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


def _glob_to_regex(glob: str) -> re.Pattern | None:
    g = glob.replace("\x00", "*")
    if re.match(r"^https?://", g):
        return None  # a third-party origin (wa.me, tiles, fonts) — not our API
    g = re.sub(r"^\*\*", "", g)
    g = re.sub(r"^/api(?=/)", "", g)
    if not g.startswith("/"):
        return None
    if not re.search(r"[A-Za-z]", g):
        return None  # a catch-all (`**/api/**`) names no route, so it covers none
    out = []
    i = 0
    while i < len(g):
        if g.startswith("/**", i):
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
    return re.compile("^" + "".join(out) + "$")


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
                rx = _glob_to_regex(_ts_str_value(tok, consts))
            elif tok in consts:
                rx = _glob_to_regex(consts[tok])
            else:
                rx = _regex_literal_to_regex(tok)
            if rx is not None:
                mocks.append((r, line, rx))
    return E2EIndex(gotos, mocks)


@dataclass
class VitestIndex:
    imports: dict[str, list[tuple[str, int]]]  # resolved module (no ext) → (file, line)
    texts: dict[str, str]


def _strip_ext(p: str) -> str:
    return re.sub(r"\.(jsx?|tsx?|mjs)$", "", p)


def build_vitest_index(test_dir: Path = VITEST_DIR) -> VitestIndex:
    imports: dict[str, list[tuple[str, int]]] = {}
    texts: dict[str, str] = {}
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
    return any(NEG_ASSERT_RE.search(ln) for ln in c.window.splitlines())


def _window_succeeds(win: str) -> bool:
    """A window evidences the SUCCESS path when it asserts a 2xx/3xx, or when
    it asserts on the response body (`.json()`) and asserts no 4xx/5xx — a
    body assertion on an error response would not hold."""
    if POS_ASSERT_RE.search(win):
        return True
    return (
        ".json()" in win
        and re.search(r"^\s*assert\b", win, re.M) is not None
        and not ERR_ASSERT_RE.search(win)
    )


def _call_succeeds(c: Call) -> bool:
    return _window_succeeds(c.window) or any(
        _window_succeeds(w) for w in c.outer_windows
    )


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
        for off, ln in enumerate(c.window.splitlines()):
            if NEG_ASSERT_RE.search(ln):
                if c.table:
                    return Cell("covered", f"{c.file}:{c.line}", "table row")
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
    if NOTIFY_SRC_RE.search(r.source):
        score += 2
        why.append("sends email/WhatsApp")
    if VISIBILITY_PATH_RE.search(r.path) and r.is_mutation:
        score += 2
        why.append("public visibility")
    if PRIVILEGE_PATH_RE.search(r.path) and r.is_mutation:
        score += 3
        why.append("privilege change")
    return score, why


def route_score(r: Route, pos: Cell, neg: Cell) -> tuple[int, list[str]]:
    score, why = base_score(r)
    score += {GAP: 4, "e2e-mock": 3, "weak": 2}.get(pos.status, 0)
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
        verdict = best([pos, e2e]) if pos.status != "covered" else pos
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
    Stdlib only — the static drift tier (no app import) reads it too."""
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


def generate(
    app=None,
    *,
    features_text: str | None = None,
    pytest_sources: dict[str, str] | None = None,
) -> ActionMap:
    app = app if app is not None else load_app()
    routes = collect_routes(app)
    ev = Evidence(
        routes=routes,
        pytest=build_pytest_index(sources=pytest_sources),
        e2e=build_e2e_index(),
        vitest=build_vitest_index(),
    ).index()
    all_rows = build_route_rows(ev)
    route_rows = [r for r in all_rows if not r.route.internal_reason]
    internal_rows = [r for r in all_rows if r.route.internal_reason]
    pages = collect_pages()
    page_rows = build_page_rows(ev, pages)
    tools = parse_business_features(
        features_text
        if features_text is not None
        else FEATURES_PATH.read_text(encoding="utf-8")
    )
    tool_rows = build_tool_rows(ev, tools, page_rows, all_rows)
    machine_rows = build_machine_rows(
        ev, AUDIT_PATH.read_text(encoding="utf-8"), all_rows
    )
    extra_rows = build_extra_rows(ev, all_rows)
    return ActionMap(
        route_rows,
        internal_rows,
        non_api_paths(app),
        tool_rows,
        page_rows,
        machine_rows,
        extra_rows,
    )


def _count(cells) -> dict[str, int]:
    out = {k: 0 for k in ("covered", "e2e-mock", "weak", GAP, "n/a")}
    for c in cells:
        out[c.status] += 1
    return out


def _counts_line(d: dict[str, int]) -> str:
    return " | ".join(str(d[k]) for k in ("covered", "e2e-mock", "weak", GAP, "n/a"))


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
    items.sort(key=lambda x: (-x[0], x[1]))
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
        "> `tests/test_action_map_complete.py`. Spec: `docs/release/anchor-plan.md` §B (MEH-2892 / MEH-2894)."
    )
    a(">")
    a(
        "> Each cell is `file:line` evidence or `GAP` — a static match, never a claim that a test passes."
    )
    a(
        "> `weak` = the route/file is only *named* by a test. `e2e-mock` = a Playwright spec mocks the"
    )
    a(
        "> route with `page.route`, so the backend never ran. The matcher and its limits are documented"
    )
    a(
        "> at the top of the script. Line numbers drift as tests are edited; the drift check ignores"
    )
    a("> line-only drift and fails on any coverage change.")
    a("")
    a("## Summary")
    a("")
    rv = _count(r.verdict for r in am.route_rows)
    rn = _count(r.neg for r in am.route_rows if r.route.gated)
    tv = _count(r.verdict for r in am.tool_rows)
    pv = _count(r.verdict for r in am.page_rows)
    mv = _count(r.verdict for r in am.machine_rows)
    ev = _count(r.verdict for r in am.extra_rows)
    a("| Rows | Count | covered | e2e-mock | weak | GAP | n/a |")
    a("|---|---|---|---|---|---|---|")
    a(f"| API routes (actor actions) | {len(am.route_rows)} | {_counts_line(rv)} |")
    a(
        f"| — negative cell of gated routes (401/403) | {sum(1 for r in am.route_rows if r.route.gated)} | {_counts_line(rn)} |"
    )
    a(
        f"| Internal routes (allowlisted) | {len(am.internal_rows)} + {len(am.non_api)} docs | — | — | — | — | — |"
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
        "| Method | Path | Handler | Actor | Positive | Negative (401/403) | E2E | Score |"
    )
    a("|---|---|---|---|---|---|---|---|")
    for rr in am.route_rows:
        r = rr.route
        actor = r.actor_label + (f" · {', '.join(r.flags)}" if r.flags else "")
        e2e = rr.e2e.render() if rr.e2e else "—"
        a(
            f"| {','.join(r.methods)} | `{r.path}` | `{r.module}.{r.func}` | {actor} | {rr.pos.render()} | "
            f"{rr.neg.render()} | {e2e} | {rr.score} |"
        )
    a("")
    a("### Internal routes (allowlisted — not actor actions)")
    a("")
    a("| Method | Path | Reason | Test |")
    a("|---|---|---|---|")
    for rr in am.internal_rows:
        a(
            f"| {','.join(rr.route.methods)} | `{rr.route.path}` | {rr.route.internal_reason} | {rr.pos.render()} |"
        )
    for p in am.non_api:
        a(
            f"| GET | `{p}` | {INTERNAL_NON_API_ROUTES.get(p, 'not an API route (NOT ALLOWLISTED)')} | n/a |"
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
        "method: mutation 3, read 1 · actor: admin 2, business 2, registered 1, anonymous 0 (+1 anonymous "
        "mutation) · auth path +3 · money-like (group-buy commit, rescue orders) +3 · handler sends "
        "email/WhatsApp +2 · public visibility (approve/reject/publish/hide/verified…) +2 · privilege change "
        "(`/role`, `/block`, `/admin/users/…` mutations) +3 · DELETE +1 · positive GAP +4, "
        "only e2e-mock +3, only weak +2 · gated route without a 401/403 test +2. Extra rows: their primary "
        "route's base + race 3 / time 2 / negative 2 + GAP 4 / weak 2."
    )
    a("")
    return "\n".join(L)


def render_pages(page_rows: list[PageRow]) -> list[str]:
    """The «Pages» section. Needs no app import, so the static drift tier
    regenerates exactly this text and compares it with the committed doc."""
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


LINE_RE = re.compile(r"((?:tests|frontend)/[^\s`|:()]+):\d+")


def mask_lines(text: str) -> str:
    return LINE_RE.sub(r"\1:#", text)


# ═════════════════════════════════════════════════════════════════════════════
# 6. Verifying the COMMITTED doc (drift tiers)
# ═════════════════════════════════════════════════════════════════════════════

MANIFEST_PATH = DOC_PATH.with_suffix(".sha256")
CALL_SHAPE_RE = re.compile(
    r"\.(get|post|put|patch|delete|head|request)\(|^\s*\(?\s*[\"'](get|post|put|patch|delete|head)[\"']",
    re.I,
)
CITE_RE = re.compile(r"^`((?:tests|frontend)/[^`:]+):(\d+)`(?: \((.+)\))?$")


def doc_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _table_cells(line: str) -> list[str]:
    # `\|` inside a cell is an escaped pipe, not a column break
    parts = re.split(r"(?<!\\)\|", line.strip())
    return [c.strip() for c in parts[1:-1]]


def _sections(doc: str) -> dict[str, list[tuple[int, str]]]:
    """`## heading` → [(doc line number, line)], `###` lines included."""
    out: dict[str, list[tuple[int, str]]] = {}
    cur = ""
    for i, ln in enumerate(doc.splitlines(), 1):
        if ln.startswith("## "):
            cur = ln[3:].strip()
            out[cur] = []
        elif cur:
            out[cur].append((i, ln))
    return out


def _line_of(path: str, n: int) -> str | None:
    p = ROOT / path
    if not p.is_file():
        return None
    lines = p.read_text(encoding="utf-8").splitlines()
    return lines[n - 1] if 1 <= n <= len(lines) else None


def verify_citations(doc: str) -> list[str]:
    """Every `covered` citation in the COMMITTED doc must still point at what
    it claims: an API positive cell at an HTTP call (or an endpoint-table row),
    a negative cell at a 401/403 assertion (or a table row), a page's E2E cell
    at a `.goto(`. The masked drift check cannot see a citation that went stale
    by line drift alone; this does. Returns `action-map.md:<line>: …` problems."""
    problems = []
    doc_rel = rel(DOC_PATH)
    secs = _sections(doc)
    checks = []  # (doc line, cell, kind)
    for key, rows in secs.items():
        if key.startswith("API routes"):
            for n, ln in rows:
                if ln.startswith("### "):
                    break  # the internal table: different columns
                cells = _table_cells(ln) if ln.startswith("| ") else []
                if len(cells) == 8 and cells[0] not in ("Method", "---"):
                    checks += [(n, cells[4], "call"), (n, cells[5], "refusal")]
        elif key.startswith("Pages"):
            for n, ln in rows:
                cells = _table_cells(ln) if ln.startswith("| `") else []
                if len(cells) == 4:
                    checks.append((n, cells[1], "goto"))
    for n, cell, kind in checks:
        m = CITE_RE.match(cell)
        if not m:
            continue  # GAP / n/a / weak / e2e-mock — not a `covered` claim
        path, line, note = m.group(1), int(m.group(2)), m.group(3) or ""
        src = _line_of(path, line)
        where = f"{doc_rel}:{n}: `{path}:{line}`"
        if src is None:
            problems.append(f"{where} does not exist")
        elif kind == "call" and not CALL_SHAPE_RE.search(src):
            problems.append(f"{where} holds no HTTP call: {src.strip()[:80]}")
        elif kind == "refusal" and not (
            re.search(r"\b40[13]\b|HTTP_40[13]", src)
            or (note == "table row" and CALL_SHAPE_RE.search(src))
        ):
            problems.append(f"{where} asserts no 401/403: {src.strip()[:80]}")
        elif kind == "goto" and ".goto(" not in src:
            problems.append(f"{where} holds no .goto(: {src.strip()[:80]}")
    return problems


def check_manifest(doc: str) -> list[str]:
    if not MANIFEST_PATH.exists():
        return [f"{rel(MANIFEST_PATH)}:1: missing — run action_map.py --write"]
    want = MANIFEST_PATH.read_text(encoding="utf-8").split()[0]
    if want != doc_sha256(doc):
        return [
            f"{rel(DOC_PATH)}:1: does not match {rel(MANIFEST_PATH)} — the doc was edited "
            "by hand (or --write was not run); regenerate with action_map.py --write"
        ]
    return []


def check_static() -> list[str]:
    """The drift tier that needs no app import and no third-party package —
    what the always-run `Repo guards` job can afford. Checks the committed doc
    against: its manifest (hand edits), its own citations, a fresh «Pages»
    section, the registry's tool ids, and the audit's rows."""
    if not DOC_PATH.exists():
        return [f"{rel(DOC_PATH)}:1: missing — run action_map.py --write"]
    doc = DOC_PATH.read_text(encoding="utf-8")
    problems = check_manifest(doc) + verify_citations(doc)
    secs = _sections(doc)

    ev = Evidence(
        routes=[],
        pytest=PytestIndex([], [], [], {}),
        e2e=build_e2e_index(),
        vitest=build_vitest_index(),
    )
    fresh_pages = render_pages(build_page_rows(ev, collect_pages()))
    key = next((k for k in secs if k.startswith("Pages")), None)
    committed_pages = (["## " + key] + [ln for _, ln in secs[key]]) if key else []
    if mask_lines("\n".join(committed_pages).rstrip()) != mask_lines(
        "\n".join(fresh_pages).rstrip()
    ):
        problems.append(
            f"{rel(DOC_PATH)}:1: «Pages» section is stale (a page, spec or Vitest import changed)"
        )

    tools = [
        t.id for t in parse_business_features(FEATURES_PATH.read_text(encoding="utf-8"))
    ]
    key = next((k for k in secs if k.startswith("Business tools")), None)
    doc_tools = [
        _table_cells(ln)[0].strip("`")
        for _, ln in (secs[key] if key else [])
        if ln.startswith("| `")
    ]
    if doc_tools != tools:
        problems.append(
            f"{rel(FEATURES_PATH)}:1: business tools differ from the doc "
            f"(+{sorted(set(tools) - set(doc_tools))} -{sorted(set(doc_tools) - set(tools))})"
        )

    want = [
        (str(n), _clean(tr), site_column(_refs(site)) or "—")
        for n, _t, tr, site in audit_entries(AUDIT_PATH.read_text(encoding="utf-8"))
    ]
    key = next((k for k in secs if k.startswith("State machines")), None)
    have = []
    for _, ln in secs[key] if key else []:
        cells = _table_cells(ln) if re.match(r"^\| \d+ \|", ln) else []
        if len(cells) >= 3:
            have.append((cells[0], cells[1], cells[2]))
    if have != want:
        problems.append(
            f"{rel(AUDIT_PATH)}:1: audit rows differ from the doc (a section or transition changed)"
        )
    return problems


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


def self_test_static() -> list[str]:
    """Preflight for the static tier (scripts/checks contract): its checks
    must be able to fail. Synthetic cases first, then anchors on real files."""
    fails = []
    real_line = None
    # an anchor in the real corpus: some tests/ line holding a client call
    for f in sorted(_tracked()):
        if f.startswith("tests/") and f.endswith(".py"):
            for i, ln in enumerate(
                (ROOT / f).read_text(encoding="utf-8").splitlines(), 1
            ):
                if re.search(r"client\.post\(\s*\"/auth/login\"", ln):
                    real_line = (f, i)
                    break
        if real_line:
            break
    if real_line is None:
        return [
            'self-test: no `client.post("/auth/login"` anywhere in tests/ — the anchor is gone'
        ]
    f, i = real_line
    row = "| POST | `/auth/login` | `auth.login` | anonymous | `{cite}` | n/a | — | 9 |"
    good = "## API routes\n\n" + row.format(cite=f"{f}:{i}") + "\n"
    bad = "## API routes\n\n" + row.format(cite=f"{f}:{i + 100000}") + "\n"
    off = "## API routes\n\n" + row.format(cite="tests/conftest.py:1") + "\n"
    if verify_citations(good):
        fails.append(f"self-test: a real call citation {f}:{i} was rejected")
    if not verify_citations(bad):
        fails.append("self-test: a citation past the end of its file was accepted")
    if not verify_citations(off):
        fails.append("self-test: a citation to a line with no HTTP call was accepted")
    page = "## Pages (x)\n\n| `/` | `frontend/e2e/flows/01-home-load.spec.ts:1` | GAP | covered |\n"
    if not verify_citations(page):
        fails.append("self-test: a page citation to a line with no .goto( was accepted")
    if check_manifest("not the committed doc") == []:
        fails.append("self-test: the manifest accepted a different doc")
    tools = parse_business_features(FEATURES_PATH.read_text(encoding="utf-8"))
    if len(tools) < 40:
        fails.append(
            f"self-test: only {len(tools)} business tools parsed from the real registry"
        )
    if len(audit_entries(AUDIT_PATH.read_text(encoding="utf-8"))) < 9:
        fails.append("self-test: fewer audit rows than audit sections")
    return fails


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument(
        "--write", action="store_true", help="regenerate the doc and its manifest"
    )
    ap.add_argument(
        "--check", action="store_true", help="exit 1 if the committed doc is stale"
    )
    ap.add_argument(
        "--strict",
        action="store_true",
        help="with --check: byte-exact, line numbers included",
    )
    ap.add_argument(
        "--check-static",
        action="store_true",
        help="the no-app tier: manifest, citations, pages, tool ids, audit rows (stdlib only)",
    )
    ap.add_argument(
        "--self-test-static", action="store_true", help="prove the static tier can fail"
    )
    args = ap.parse_args(argv)
    if args.self_test_static or args.check_static:
        fails = self_test_static()
        if fails:
            print("\n".join(fails), file=sys.stderr)
            return 1
        if args.self_test_static:
            print("action-map static self-test: 7 cases passed")
            return 0
        problems = check_static()
        if problems:
            print("\n".join(problems), file=sys.stderr)
            print(
                "fix: PYTHONPATH=backend:. python scripts/release/action_map.py --write",
                file=sys.stderr,
            )
            return 1
        print(
            f"{rel(DOC_PATH)}: static tier clean (manifest, citations, pages, tools, audit rows)"
        )
        return 0
    am = generate()
    text = render(am)
    if args.write:
        DOC_PATH.parent.mkdir(parents=True, exist_ok=True)
        DOC_PATH.write_text(text, encoding="utf-8")
        MANIFEST_PATH.write_text(
            f"{doc_sha256(text)}  {DOC_PATH.name}\n", encoding="utf-8"
        )
        print(f"wrote {rel(DOC_PATH)} and {rel(MANIFEST_PATH)}")
    if args.check:
        committed = DOC_PATH.read_text(encoding="utf-8") if DOC_PATH.exists() else ""
        same = (
            committed == text
            if args.strict
            else mask_lines(committed) == mask_lines(text)
        )
        problems = check_manifest(committed) + verify_citations(committed)
        if not same:
            problems.append(f"{rel(DOC_PATH)}:1: stale — a fresh generation differs")
        if problems:
            print("\n".join(problems), file=sys.stderr)
            print(
                "fix: PYTHONPATH=backend:. python scripts/release/action_map.py --write",
                file=sys.stderr,
            )
            return 1
        print(
            f"{rel(DOC_PATH)} is fresh"
            + (" (strict)" if args.strict else " (line numbers masked)")
        )
        return 0
    print(summary_text(am))
    return 0


if __name__ == "__main__":
    sys.exit(main())
