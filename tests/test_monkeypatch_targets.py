"""MEH-3293 — a test must patch a name where the code reads it.

`monkeypatch.setattr(mod, "name", fake)` and `patch("app.x.name")` replace
`name` only in `mod`'s namespace. Code that does `from app.x import name`
keeps its own reference, so after a split moves a function to a new module, a
test that still patches the old module stops reaching the code under test.
When the stub was load-bearing the test goes red (17 did in MEH-3293). When it
only silenced a side effect (a mail sender, a token verifier) the test stays
green and quietly runs the real thing — a test passing for the wrong reason.

Two checks, both over every test file:

1. Dead patch: the target module merely imports the name and never reads it,
   so the patch can reach no code.
2. Half patch (the silent one): a test calls a route of module B, stubs a name
   on module A, and B holds its own module-level copy of that name which the
   test leaves real. Found in MEH-3293: the old tests/test_oauth_verify_4xx.py
   stubbed the Google/Apple verifiers on auth.py only and still passed against
   the split code, because the real verifier also rejects a junk token.

Granularity is one test function plus the same-file fixtures and helpers it
reaches. Out of reach (stated, not hidden): fixtures in conftest.py, paths
built at run time (f-strings), and names a module reads through another
module's attribute (`mod.name`), which a patch on `mod` does reach.
"""
from __future__ import annotations

import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
TESTS = ROOT / "tests"


def _module_file(dotted: str) -> Path | None:
    base = BACKEND.joinpath(*dotted.split("."))
    for cand in (base.with_suffix(".py"), base / "__init__.py"):
        if cand.is_file():
            return cand
    return None


def _split_target(target: str) -> tuple[str, str] | None:
    """'app.routers.auth._send_x' -> ('app.routers.auth', '_send_x')."""
    parts = target.split(".")
    for cut in range(len(parts) - 1, 0, -1):
        if _module_file(".".join(parts[:cut])) is not None:
            return ".".join(parts[:cut]), ".".join(parts[cut:])
    return None


_FACTS: dict[str, tuple[set[str], set[str], set[str]]] = {}


def _facts(dotted: str) -> tuple[set[str], set[str], set[str]]:
    """(names read, names defined, names imported) for a backend module."""
    if dotted not in _FACTS:
        path = _module_file(dotted)
        assert path is not None, dotted
        _FACTS[dotted] = _facts_of(ast.parse(path.read_text(encoding="utf-8")))
    return _FACTS[dotted]


_FUNCS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)


def _module_level(tree: ast.AST):
    """Nodes that run at import time — everything outside function bodies.
    An import inside a function looks the name up when it runs, so it sees a
    patch; only a module-level import binds a copy early."""
    todo = list(ast.iter_child_nodes(tree))
    while todo:
        node = todo.pop()
        yield node
        if isinstance(node, _FUNCS):
            continue
        todo += list(ast.iter_child_nodes(node))


def _facts_of(tree: ast.AST) -> tuple[set[str], set[str], set[str]]:
    read = {
        n.id for n in ast.walk(tree)
        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)
    }
    defined: set[str] = set()
    imported: set[str] = set()
    for node in _module_level(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            defined.add(node.name)
        elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            defined.add(node.id)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                imported.add(alias.asname or alias.name.split(".")[0])
    # `__all__ = [...]` re-exports are reads by another name.
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "__all__" for t in node.targets
        ):
            for elt in getattr(node.value, "elts", []):
                if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
                    read.add(elt.value)
    return read, defined, imported


def _module_aliases(scope: ast.AST) -> dict[str, str]:
    """Names bound to a backend module: a file's module-level imports, or the
    imports inside one function (the same alias can mean a different module
    in another test)."""
    nodes = ast.walk(scope) if isinstance(scope, _FUNCS) else _module_level(scope)
    out: dict[str, str] = {}
    for node in nodes:
        if isinstance(node, ast.Import):
            for a in node.names:
                if a.name.startswith("app.") and a.asname and _module_file(a.name):
                    out[a.asname] = a.name
        elif isinstance(node, ast.ImportFrom) and node.module and (
            node.module == "app" or node.module.startswith("app.")
        ):
            for a in node.names:
                full = f"{node.module}.{a.name}"
                if _module_file(full):
                    out[a.asname or a.name] = full
    return out


def patch_sites(source: str) -> list[tuple[int, str, str]]:
    """(line, module, name) for every statically readable patch in a test."""
    tree = ast.parse(source)
    top = _module_aliases(tree)
    sites = set(_sites_in_module_level(tree, top))
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            sites |= set(_sites_in(node, top | _module_aliases(node)))
    return sorted(sites)


def _sites_in_module_level(tree: ast.AST, aliases: dict[str, str]):
    holder = ast.Module(
        body=[n for n in tree.body if not isinstance(n, (*_FUNCS, ast.ClassDef))],
        type_ignores=[],
    )
    return _sites_in(holder, aliases)


def _sites_in(scope: ast.AST, aliases: dict[str, str]) -> list[tuple[int, str, str]]:
    sites = []
    for node in ast.walk(scope):
        if not isinstance(node, ast.Call):
            continue
        fn = node.func
        attr = fn.attr if isinstance(fn, ast.Attribute) else getattr(fn, "id", "")
        args = node.args
        if (
            attr in ("setattr", "object", "delattr")
            and len(args) >= 2
            and isinstance(args[0], ast.Name)
            and args[0].id in aliases
            and isinstance(args[1], ast.Constant)
            and isinstance(args[1].value, str)
        ):
            sites.append((node.lineno, aliases[args[0].id], args[1].value))
        elif (
            attr in ("patch", "setattr")
            and args
            and isinstance(args[0], ast.Constant)
            and isinstance(args[0].value, str)
            and args[0].value.startswith("app.")
        ):
            split = _split_target(args[0].value)
            if split and "." not in split[1]:
                sites.append((node.lineno, *split))
    return sites


def dead_patches(source: str) -> list[str]:
    out = []
    for line, module, name in patch_sites(source):
        read, defined, imported = _facts(module)
        if name in imported and name not in read and name not in defined:
            out.append(f"line {line}: {module}.{name} is imported there but never read")
    return out


# --- self-test: the classifier against the REAL modules (testing.md MEH-1909)

def test_classifier_flags_a_patch_on_a_module_that_only_imports_the_name(monkeypatch):
    # The MEH-3293 shape: the old module keeps a re-export of a function that
    # moved, and a test still patches it there. auth.py's facts are replaced
    # by a module that imports score_producer and never reads it.
    tree = ast.parse("from app.services.producer_risk import score_producer\n")
    monkeypatch.setitem(_FACTS, "app.routers.auth", _facts_of(tree))
    src = 'def t(m):\n    m.setattr("app.routers.auth.score_producer", 1)\n'
    assert dead_patches(src) == [
        "line 2: app.routers.auth.score_producer is imported there but never read"
    ]


def test_classifier_passes_a_patch_where_the_name_is_read():
    # Real case: the business-registration router reads score_producer.
    src = (
        "import app.routers.auth_register_producer as reg\n"
        "def test_x(monkeypatch):\n"
        "    monkeypatch.setattr(reg, 'score_producer', lambda *a: None)\n"
    )
    assert patch_sites(src) == [(3, "app.routers.auth_register_producer", "score_producer")]
    assert dead_patches(src) == []


def test_classifier_reads_the_string_target_form():
    src = 'def t(m):\n    m.setattr("app.routers.auth_register_producer._send_welcome_email", 1)\n'
    assert patch_sites(src) == [
        (2, "app.routers.auth_register_producer", "_send_welcome_email")
    ]


# --- the guard -----------------------------------------------------------

def test_no_test_patches_a_name_where_no_code_reads_it():
    files = sorted(TESTS.rglob("test_*.py"))
    seen = 0
    problems = []
    for path in files:
        source = path.read_text(encoding="utf-8")
        seen += len(patch_sites(source))
        problems += [f"{path.relative_to(ROOT)} {p}" for p in dead_patches(source)]
    # Control: the scan must actually find patch sites, or a clean result
    # means nothing (testing.md «a null output is not evidence»).
    assert seen > 100, f"only {seen} patch sites found — the scanner is broken"
    assert not problems, (
        "These patches reach no code — the module imports the name but never "
        "reads it, so the code under test keeps the real one. Patch the module "
        "that calls it:\n  " + "\n  ".join(problems)
    )


# --- the shared-name case: a name with two copies, patched in only one -----
#
# A module that does `from app.services.x import send` holds its own `send`.
# After MEH-3293, auth.py and auth_register_producer.py each hold a copy of the
# mail senders and the OAuth verifiers. A test that calls a route of module B
# but stubs the name only on module A runs B's real copy — and stays green
# when the stub only silenced a side effect. That is the silent case.

_ROUTES: list[tuple[re.Pattern[str], str]] = []


def _route_modules() -> list[tuple[re.Pattern[str], str]]:
    """(path regex, module of the endpoint) for every route the app serves."""
    if not _ROUTES:
        # app.routes is filled lazily in this app, so read each router module's
        # own APIRouter (its route paths already carry the prefix).
        from importlib import import_module

        for path in sorted((BACKEND / "app" / "routers").glob("*.py")):
            module = import_module(f"app.routers.{path.stem}")
            for route in getattr(getattr(module, "router", None), "routes", []):
                endpoint = getattr(route, "endpoint", None)
                if endpoint is None:
                    continue
                pattern = re.sub(r"\{[^}]+\}", "[^/]+", route.path)
                _ROUTES.append((re.compile(f"^{pattern}$"), endpoint.__module__))
    return _ROUTES


_VERBS = {"get", "post", "put", "patch", "delete"}


def _paths_called(scope: ast.AST) -> set[str]:
    out = set()
    for node in ast.walk(scope):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in _VERBS
            and node.args
            and isinstance(node.args[0], ast.Constant)
            and isinstance(node.args[0].value, str)
            and node.args[0].value.startswith("/")
        ):
            out.add(node.args[0].value.split("?", 1)[0])
    return out


def _modules_for(paths: set[str]) -> set[str]:
    return {mod for p in paths for rx, mod in _route_modules() if rx.match(p)}


def _helper_names(func: ast.AST) -> set[str]:
    """Same-file helpers a function reaches: fixtures it requests, functions
    it calls by name, and `self.method(...)` calls."""
    names = set()
    if isinstance(func, (ast.FunctionDef, ast.AsyncFunctionDef)):
        names |= {a.arg for a in func.args.args}
    for node in ast.walk(func):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                names.add(node.func.id)
            elif (
                isinstance(node.func, ast.Attribute)
                and isinstance(node.func.value, ast.Name)
                and node.func.value.id == "self"
            ):
                names.add(node.func.attr)
    return names


def per_test(source: str) -> list[tuple[str, list[tuple[int, str, str]], set[str]]]:
    """(test name, patch sites, router modules called) for each test function,
    following same-file fixtures and helpers (transitively)."""
    tree = ast.parse(source)
    aliases = _module_aliases(tree)
    funcs: dict[str, ast.AST] = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            funcs.setdefault(node.name, node)
    out = []
    tests = [
        n for n in ast.walk(tree)
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        and n.name.startswith("test_")
    ]
    for func in tests:
        name = func.name
        seen, todo = set(), [name]
        while todo:
            cur = todo.pop()
            node = func if cur == name else funcs.get(cur)
            if cur in seen or node is None:
                continue
            seen.add(cur)
            todo += sorted(_helper_names(node) - seen)
        scopes = [func] + [funcs[f] for f in sorted(seen - {name})]
        sites = [
            s for sc in scopes
            for s in _sites_in(sc, aliases | _module_aliases(sc))
        ]
        paths = set().union(*(_paths_called(sc) for sc in scopes))
        out.append((name, sites, _modules_for(paths)))
    return out


def called_modules(source: str) -> set[str]:
    """Router modules whose routes this source calls by a literal path."""
    return _modules_for(_paths_called(ast.parse(source)))


def half_patched(source: str) -> list[str]:
    out = []
    for test, sites, called in per_test(source):
        patched = {(m, n) for _, m, n in sites}
        for line, module, name in sites:
            if not module.startswith("app.routers."):
                continue
            for other in sorted(called - {module}):
                read, _defined, imported = _facts(other)
                if name in read and name in imported and (other, name) not in patched:
                    out.append(
                        f"{test} line {line}: patches {module}.{name}, but the "
                        f"test calls routes in {other}, which reads its own "
                        f"copy — patch {other}.{name} too"
                    )
    return sorted(set(out))


def test_half_patch_classifier_on_the_real_split():
    # Real modules, real routes: /auth/register/producer/oauth is served by
    # auth_register_producer, which imports its own _verify_google_token.
    half = (
        "import app.routers.auth as a\n"
        "def test_t(client, monkeypatch):\n"
        "    monkeypatch.setattr(a, '_verify_google_token', lambda t: None)\n"
        "    client.post('/auth/register/producer/oauth', json={})\n"
    )
    assert called_modules(half) == {"app.routers.auth_register_producer"}
    assert half_patched(half) == [
        "test_t line 3: patches app.routers.auth._verify_google_token, but the "
        "test calls routes in app.routers.auth_register_producer, which reads "
        "its own copy — patch app.routers.auth_register_producer._verify_google_token too"
    ]
    both = half.replace(
        "    client.post",
        "    monkeypatch.setattr('app.routers.auth_register_producer."
        "_verify_google_token', lambda t: None)\n    client.post",
    )
    assert half_patched(both) == []


def test_no_test_stubs_only_one_copy_of_a_shared_name():
    files = sorted(TESTS.rglob("test_*.py"))
    calls = 0
    problems = []
    for path in files:
        source = path.read_text(encoding="utf-8")
        calls += len(called_modules(source))
        problems += [f"{path.relative_to(ROOT)} {p}" for p in half_patched(source)]
    assert calls > 100, f"only {calls} (file, router) pairs found — the scanner is broken"
    assert not problems, (
        "These files stub a name in one module but call routes of another "
        "module that holds its own copy, so those routes run the real one:\n  "
        + "\n  ".join(problems)
    )
