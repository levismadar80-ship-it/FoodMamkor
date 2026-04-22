#!/usr/bin/env python3
"""MEH-245 deployment verification tool — see docs/AUDIT-API-CONTRACT.md.

Modes:
  static (default)  grep frontend calls + parse backend routes, diff both.
  --probe URL       HTTP-request every unique frontend path against URL.
  --cross-env       probe --staging and --prod, flag paths that disagree.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FRONTEND = REPO / "frontend"
BACKEND_ROUTERS = REPO / "backend" / "app" / "routers"
BACKEND_MAIN = REPO / "backend" / "app" / "main.py"

# Dynamic frontend paths where a non-id variable segment evaluates to one of
# several known literals, each of which IS wired on the backend. Add a new
# entry only when the variable is constrained to a finite set in the same
# file — link the call site in the comment.
KNOWN_DYNAMIC_EXPANSIONS: dict[tuple[str, str], list[tuple[str, str]]] = {
    # frontend/app/admin/experiences/page.js:95 — endpoint is "request-changes"
    # or "reject" (see lines 93-94 in the same file).
    ("POST", "/admin/experiences/{_}/{_}"): [
        ("POST", "/admin/experiences/{_}/request-changes"),
        ("POST", "/admin/experiences/{_}/reject"),
    ],
}

FRONTEND_EXTS = {".js", ".jsx", ".ts", ".tsx"}
SKIP_DIR_PARTS = {"node_modules", ".next", "out", "dist", "build"}
SAFE_UUID = "00000000-0000-0000-0000-000000000000"

# api.get("/x") / chain-style `api\n  .post(...)`. DOTALL so newlines match \s.
API_CALL_RE = re.compile(
    r"""\bapi\s*\.\s*(?P<method>get|post|put|patch|delete)\s*\(\s*
        (?P<quote>["'`])(?P<path>[^"'`]+)(?P=quote)""",
    re.VERBOSE | re.DOTALL,
)
# fetch("..."). The method option, if present, is read from the balanced
# {...} options object that follows the URL and comma — e.g.
# fetch("/api/x", { method: "POST", ... }). Missing or unparsed option
# defaults to GET.
FETCH_CALL_RE = re.compile(
    r"""\bfetch\s*\(\s*(?P<quote>["'`])(?P<url>[^"'`]+)(?P=quote)""",
    re.VERBOSE | re.DOTALL,
)
FETCH_METHOD_RE = re.compile(
    r"""method\s*:\s*["'](?P<method>\w+)["']"""
)
# navigator.sendBeacon("...") — fire-and-forget POST.
SEND_BEACON_RE = re.compile(
    r"""\bsendBeacon\s*\(\s*(?P<quote>["'`])(?P<url>[^"'`]+)(?P=quote)""",
    re.VERBOSE | re.DOTALL,
)

ROUTER_DECL_RE = re.compile(
    r"""^(?P<var>\w+)\s*=\s*APIRouter\s*\((?P<args>[^)]*)\)""", re.MULTILINE
)
PREFIX_KWARG_RE = re.compile(r"""prefix\s*=\s*["'](?P<prefix>[^"']*)["']""")
ROUTE_DECORATOR_RE = re.compile(
    r"""^@(?P<var>\w+)\s*\.\s*(?P<method>get|post|put|patch|delete|api_route)
        \s*\(\s*["'](?P<path>[^"']*)["']""",
    re.MULTILINE | re.VERBOSE,
)
APP_ROUTE_RE = re.compile(
    r"""^@app\s*\.\s*(?P<method>get|post|put|patch|delete|api_route)
        \s*\(\s*["'](?P<path>[^"']*)["']""",
    re.MULTILINE | re.VERBOSE,
)
METHODS_KWARG_RE = re.compile(r"""methods\s*=\s*\[([^\]]+)\]""")


def normalise(path: str) -> str:
    path = path.split("?", 1)[0].split("#", 1)[0]
    path = re.sub(r"\$\{[^}]+\}", "{_}", path)
    path = re.sub(r"\{[^}]+\}", "{_}", path)
    return path[:-1] if len(path) > 1 and path.endswith("/") else path


def _strip_host_prefix(u: str) -> str | None:
    """Return the backend-relative path for a fetch/beacon URL, or None."""
    if re.match(r"https?://", u):
        return None
    u = re.sub(r"^\$\{[^}]+\}", "", u)
    if not u.startswith("/"):
        return None
    if u.startswith("/api/"):
        u = u[len("/api") :]
    elif u == "/api":
        u = "/"
    return u


def _fetch_options_object(text: str, url_end: int) -> str:
    """Return the literal chars of the `{ ... }` options object that
    follows a fetch URL, or "" if there isn't one.

    Skips whitespace, requires a `,`, skips more whitespace, then reads a
    balanced `{...}`. Using balanced braces (rather than a raw char
    window) prevents a `method:` key from an *unrelated* adjacent
    fetch/object from being misattributed to this call.
    """
    i = url_end
    while i < len(text) and text[i] in " \t\n\r":
        i += 1
    if i >= len(text) or text[i] != ",":
        return ""
    i += 1
    while i < len(text) and text[i] in " \t\n\r":
        i += 1
    if i >= len(text) or text[i] != "{":
        return ""
    depth = 1
    j = i + 1
    while j < len(text) and depth > 0:
        c = text[j]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        j += 1
    return text[i:j]


def extract_frontend_calls() -> list[tuple[str, str, str, int]]:
    calls: list[tuple[str, str, str, int]] = []
    for f in FRONTEND.rglob("*"):
        if f.suffix not in FRONTEND_EXTS:
            continue
        if any(part in SKIP_DIR_PARTS for part in f.parts):
            continue
        try:
            text = f.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        file_rel = str(f.relative_to(REPO))
        for m in API_CALL_RE.finditer(text):
            p = m.group("path")
            if not p.startswith("/"):
                continue
            line = text.count("\n", 0, m.start()) + 1
            calls.append((m.group("method").upper(), normalise(p), file_rel, line))
        for m in FETCH_CALL_RE.finditer(text):
            p = _strip_host_prefix(m.group("url"))
            if p is None:
                continue
            line = text.count("\n", 0, m.start()) + 1
            options = _fetch_options_object(text, m.end())
            mm = FETCH_METHOD_RE.search(options) if options else None
            method = mm.group("method").upper() if mm else "GET"
            calls.append((method, normalise(p), file_rel, line))
        for m in SEND_BEACON_RE.finditer(text):
            p = _strip_host_prefix(m.group("url"))
            if p is None:
                continue
            line = text.count("\n", 0, m.start()) + 1
            calls.append(("POST", normalise(p), file_rel, line))
    return calls


def _emit_route(text: str, m: re.Match, full: str, file_rel: str, out: list):
    method = m.group("method")
    line = text.count("\n", 0, m.start()) + 1
    if method != "api_route":
        out.append((method.upper(), normalise(full), file_rel, line))
        return
    close = text.find(")", m.end())
    block = text[m.start() : close + 1] if close != -1 else text[m.start() :]
    verbs = METHODS_KWARG_RE.search(block)
    if not verbs:
        return
    for verb in re.findall(r"""["'](\w+)["']""", verbs.group(1)):
        out.append((verb.upper(), normalise(full), file_rel, line))


def extract_backend_routes() -> list[tuple[str, str, str, int]]:
    routes: list[tuple[str, str, str, int]] = []
    for f in BACKEND_ROUTERS.glob("*.py"):
        text = f.read_text(encoding="utf-8")
        file_rel = str(f.relative_to(REPO))
        routers: dict[str, str] = {}
        for m in ROUTER_DECL_RE.finditer(text):
            pm = PREFIX_KWARG_RE.search(m.group("args"))
            routers[m.group("var")] = pm.group("prefix") if pm else ""
        for m in ROUTE_DECORATOR_RE.finditer(text):
            if m.group("var") not in routers:
                continue
            full = (routers[m.group("var")] + m.group("path")) or "/"
            _emit_route(text, m, full, file_rel, routes)
    text = BACKEND_MAIN.read_text(encoding="utf-8")
    file_rel = str(BACKEND_MAIN.relative_to(REPO))
    for m in APP_ROUTE_RE.finditer(text):
        _emit_route(text, m, m.group("path") or "/", file_rel, routes)
    return routes


def run_static():
    frontend_calls = extract_frontend_calls()
    backend_routes = extract_backend_routes()

    backend_by_path: dict[str, set[str]] = defaultdict(set)
    backend_locations: dict[tuple[str, str], tuple[str, int]] = {}
    for method, path, file, line in backend_routes:
        backend_by_path[path].add(method)
        backend_locations.setdefault((method, path), (file, line))

    frontend_by_path: dict[str, list[tuple[str, str, int]]] = defaultdict(list)
    for method, path, file, line in frontend_calls:
        frontend_by_path[path].append((method, file, line))

    orphan_frontend: list[tuple[str, list[tuple[str, str, int]]]] = []
    known_dynamic: list[tuple[str, str, list[tuple[str, str]]]] = []
    method_mismatch: list[tuple[str, str, set[str], str, int]] = []
    matches: set[tuple[str, str]] = set()
    dynamic_virtual: set[tuple[str, str]] = set()

    for path, callers in frontend_by_path.items():
        backend_methods = backend_by_path.get(path)
        if backend_methods is None:
            unmatched = []
            for method, file, line in callers:
                expansions = KNOWN_DYNAMIC_EXPANSIONS.get((method, path))
                if expansions and all(
                    vp in backend_by_path and vm in backend_by_path[vp]
                    for vm, vp in expansions
                ):
                    known_dynamic.append((method, path, expansions))
                    dynamic_virtual.update(expansions)
                else:
                    unmatched.append((method, file, line))
            if unmatched:
                orphan_frontend.append((path, unmatched))
            continue
        for method, file, line in callers:
            if method in backend_methods:
                matches.add((method, path))
            else:
                method_mismatch.append((method, path, backend_methods, file, line))

    orphan_backend: list[tuple[str, set[str], str, int]] = []
    for path, methods in backend_by_path.items():
        if path in frontend_by_path or path == "/":
            continue
        for method in sorted(methods):
            if (method, path) in dynamic_virtual:
                continue
            file, line = backend_locations[(method, path)]
            orphan_backend.append((path, {method}, file, line))

    return {
        "frontend_calls": frontend_calls,
        "backend_routes": backend_routes,
        "frontend_unique_paths": sorted(frontend_by_path),
        "backend_unique_paths": sorted(backend_by_path),
        "orphan_frontend": orphan_frontend,
        "orphan_backend": orphan_backend,
        "method_mismatch": method_mismatch,
        "known_dynamic": known_dynamic,
        "matches": sorted(matches),
    }


def _probe_url(base: str, path: str) -> str:
    return base.rstrip("/") + "/api" + path.replace("{_}", SAFE_UUID)


def run_probe(base_url: str, static_result):
    import requests  # lazy — not needed for static mode

    session = requests.Session()
    session.headers.update({"User-Agent": "meh-245-probe/1.0"})
    unique = sorted({(m, p) for m, p, _, _ in static_result["frontend_calls"]})
    rows = []
    for method, path in unique:
        url = _probe_url(base_url, path)
        try:
            r = session.request(method, url, timeout=10, allow_redirects=False)
            status: object = r.status_code
        except Exception as exc:
            status = f"ERR:{type(exc).__name__}"
        rows.append((method, path, status, url))
    return rows


def run_cross_env(staging_url: str, prod_url: str, static_result):
    staging = run_probe(staging_url, static_result)
    prod = run_probe(prod_url, static_result)
    s_idx = {(m, p): s for m, p, s, _ in staging}
    p_idx = {(m, p): s for m, p, s, _ in prod}
    return [
        (m, p, s_idx.get((m, p), "MISSING"), p_idx.get((m, p), "MISSING"))
        for (m, p) in sorted(set(s_idx) | set(p_idx))
    ]


def _print_static(result, *, json_output: bool) -> int:
    if json_output:
        print(json.dumps({
            "frontend_call_sites": len(result["frontend_calls"]),
            "frontend_unique_paths": len(result["frontend_unique_paths"]),
            "backend_routes": len(result["backend_routes"]),
            "orphan_frontend": [
                {"path": p, "callers": [{"method": m, "file": f, "line": l} for m, f, l in c]}
                for p, c in result["orphan_frontend"]
            ],
            "orphan_backend": [
                {"path": p, "method": next(iter(ms)), "file": f, "line": l}
                for p, ms, f, l in result["orphan_backend"]
            ],
            "method_mismatch": [
                {"called": m, "path": p, "allowed": sorted(a), "file": f, "line": l}
                for m, p, a, f, l in result["method_mismatch"]
            ],
        }, indent=2))
        return 1 if result["orphan_frontend"] or result["method_mismatch"] else 0
    print(f"Frontend call sites:   {len(result['frontend_calls'])}")
    print(f"Frontend unique paths: {len(result['frontend_unique_paths'])}")
    print(f"Backend routes:        {len(result['backend_routes'])}")
    print(f"Orphan frontend (404 risk): {len(result['orphan_frontend'])}")
    print(f"Orphan backend (dead code candidates): {len(result['orphan_backend'])}")
    print(f"Method mismatches: {len(result['method_mismatch'])}")
    print(f"Known dynamic expansions matched: {len(result['known_dynamic'])}")
    if result["orphan_frontend"]:
        print("\nOrphan frontend calls (404 risk):")
        for path, callers in result["orphan_frontend"]:
            methods = sorted({m for m, _, _ in callers})
            print(f"  {','.join(methods):<8} {path}")
            for m, f, l in callers:
                print(f"      called at {f}:{l}")
    if result["method_mismatch"]:
        print("\nMethod mismatches:")
        for m, p, allowed, f, l in result["method_mismatch"]:
            print(f"  {m} {p} — backend allows {sorted(allowed)} ({f}:{l})")
    return 1 if result["orphan_frontend"] or result["method_mismatch"] else 0


def _print_probe(rows) -> int:
    any_404 = False
    print(f"{'STATUS':<10} {'METHOD':<6} PATH")
    for method, path, status, _ in rows:
        if str(status) == "404":
            any_404 = True
        print(f"{str(status):<10} {method:<6} {path}")
    return 1 if any_404 else 0


def _print_cross_env(rows) -> int:
    drift = 0
    print(f"{'METHOD':<6} {'STAGING':<10} {'PROD':<10} PATH")
    for method, path, s, p in rows:
        tag = ""
        if str(s) != str(p):
            drift += 1
            tag = "  ← DEPLOY DRIFT" if str(s) in ("200", "204") and str(p) == "404" else "  ← mismatch"
        print(f"{method:<6} {str(s):<10} {str(p):<10} {path}{tag}")
    print(f"\nDrift count: {drift}")
    return 1 if drift else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--probe", metavar="URL", help="HTTP-probe frontend paths against URL")
    ap.add_argument("--cross-env", action="store_true", help="Probe --staging + --prod")
    ap.add_argument("--staging", metavar="URL")
    ap.add_argument("--prod", metavar="URL")
    ap.add_argument("--json", action="store_true", help="Machine-readable static output")
    args = ap.parse_args()

    static_result = run_static()
    if args.cross_env:
        if not (args.staging and args.prod):
            ap.error("--cross-env requires --staging URL and --prod URL")
        return _print_cross_env(run_cross_env(args.staging, args.prod, static_result))
    if args.probe:
        return _print_probe(run_probe(args.probe, static_result))
    return _print_static(static_result, json_output=args.json)


if __name__ == "__main__":
    sys.exit(main())
