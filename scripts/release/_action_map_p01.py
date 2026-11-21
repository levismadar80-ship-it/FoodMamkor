"""Part 1 of 4 of `action_map.py` (MEH-3542 mechanical split).

Moved verbatim, dependencies first: this module imports only from the
parts before it. `action_map.py` re-exports every name, so callers and
tests keep using that module.
"""

from __future__ import annotations
import ast
import functools
import inspect
import re
import subprocess
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


def _function_spans(tree: ast.AST) -> list[tuple[int, int, str, ast.AST]]:
    spans = []
    for node in _nodes(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            start = min([d.lineno for d in node.decorator_list] + [node.lineno])
            spans.append((start, node.end_lineno, node.name, node))
    return spans


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
