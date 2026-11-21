"""Part 2 of 4 of `action_map.py` (MEH-3542 mechanical split).

Moved verbatim, dependencies first: this module imports only from the
parts before it. `action_map.py` re-exports every name, so callers and
tests keep using that module.
"""

from __future__ import annotations
import ast
import re
import warnings
from dataclasses import dataclass, field
from pathlib import Path

from _action_map_p01 import ACTOR_RANK  # noqa: E402
from _action_map_p01 import AUTH_PATH_RE  # noqa: E402
from _action_map_p01 import Call  # noqa: E402
from _action_map_p01 import ERR_ASSERT_RE  # noqa: E402
from _action_map_p01 import FOLLOWUP_WINDOW  # noqa: E402
from _action_map_p01 import GAP  # noqa: E402
from _action_map_p01 import HTTP_METHODS  # noqa: E402
from _action_map_p01 import MONEY_PATH_RE  # noqa: E402
from _action_map_p01 import MUTATIONS  # noqa: E402
from _action_map_p01 import NEG_ASSERT_RE  # noqa: E402
from _action_map_p01 import NEG_WINDOW  # noqa: E402
from _action_map_p01 import PAGES_ROOT  # noqa: E402
from _action_map_p01 import PLACEHOLDER  # noqa: E402
from _action_map_p01 import PLAYWRIGHT_CONFIG  # noqa: E402
from _action_map_p01 import POS_ASSERT_RE  # noqa: E402
from _action_map_p01 import PRIVILEGE_PATH_RE  # noqa: E402
from _action_map_p01 import PRIVILEGE_WEIGHT  # noqa: E402
from _action_map_p01 import PUBLIC_TARGET_RE  # noqa: E402
from _action_map_p01 import PytestIndex  # noqa: E402
from _action_map_p01 import ROOT  # noqa: E402
from _action_map_p01 import Route  # noqa: E402
from _action_map_p01 import SCAN_EXCLUDE  # noqa: E402
from _action_map_p01 import STATUS_ANY_RE  # noqa: E402
from _action_map_p01 import TESTS_DIR  # noqa: E402
from _action_map_p01 import TestFunc  # noqa: E402
from _action_map_p01 import VISIBILITY_PATH_RE  # noqa: E402
from _action_map_p01 import VITEST_DIR  # noqa: E402
from _action_map_p01 import _assign_env  # noqa: E402
from _action_map_p01 import _class_envs  # noqa: E402
from _action_map_p01 import _eval_str  # noqa: E402
from _action_map_p01 import _function_spans  # noqa: E402
from _action_map_p01 import _innermost  # noqa: E402
from _action_map_p01 import _is_client_receiver  # noqa: E402
from _action_map_p01 import _nodes  # noqa: E402
from _action_map_p01 import _parametrize_rows  # noqa: E402
from _action_map_p01 import _table_rows  # noqa: E402
from _action_map_p01 import _tracked  # noqa: E402
from _action_map_p01 import _url_helpers  # noqa: E402
from _action_map_p01 import normalise_path  # noqa: E402
from _action_map_p01 import rel  # noqa: E402
from _action_map_p01 import resolve_route  # noqa: E402
from _action_map_p01 import tracked_under  # noqa: E402


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


def build_vitest_index_for(files: list[Path]) -> VitestIndex:
    return build_vitest_index(files=files)


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
        # Unrolled loop (non-quote run, then "string" + non-quote run)*: one way
        # to match each input, so no exponential backtracking (CodeQL
        # py/redos, alert 46; the old `(?:\s*"..."\s*,?)*` was ambiguous).
        refs_m = re.search(r"codeRef:\s*\[([^\]\"]*(?:\"[^\"]*\"[^\]\"]*)*)\]", ln)
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
