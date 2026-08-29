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
from collections import Counter, defaultdict
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
    # frontend/app/[locale]/admin/recipes/page.js:97 (MEH-997) — endpoint is
    # "request-changes" or "reject" (ternary on modalAction, same file :96);
    # 1:1 mirror of the experiences queue above.
    ("POST", "/admin/recipes/{_}/{_}"): [
        ("POST", "/admin/recipes/{_}/request-changes"),
        ("POST", "/admin/recipes/{_}/reject"),
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


# --- Probe verdict contract (MEH-2077) -------------------------------------
#
# The probe used to fail on ONE literal status: `if str(status) == "404"`. Every
# other answer — 302, 500, a transport error — printed and returned exit 0. On
# 2026-08-14 all ~160 routes against staging returned 302 (Vercel Deployment
# Protection redirecting to `vercel.com/sso-api`); nothing was verified and the
# gate reported success. "Didn't 404" is not "passed", the same defect as
# AsyncHttpClient#1421 where a test passed because it only proved the request
# had not timed out.
#
# So the probe now states, per route, which statuses it will ACCEPT, and treats
# everything else as a failure that names itself.
#
# What the contract accepts: an answer only a served route can produce. The
# probe sends no credentials and a placeholder UUID, so the app's legitimate
# replies include the auth layer (401/403), the validation layer (400/422), a
# conflict (409) and the rate limiter (429) — each proves the request reached
# the router. What it rejects, and why each is not "noise to tolerate":
#
#   3xx  never expected. `grep -rn "RedirectResponse\|status_code=30" backend/app/`
#        returns nothing (2026-08-14), so NO route in this app redirects by
#        design. A 3xx therefore means something IN FRONT of the app answered —
#        which is exactly the MEH-2077 case. Requests are sent with
#        allow_redirects=False (see run_probe), so this is the status of the
#        route itself, not of whatever it pointed at.
#   404  the path is not served — deploy drift. The original, kept.
#   405  the path is served under a different verb — a method mismatch, the
#        same defect static mode reports.
#   5xx  the app errored (e.g. MEH-1906's by-slug 500 on staging).
#   ERR  no HTTP response at all — DNS, TLS, timeout.
#
# If a route ever legitimately redirects, give _verdict an explicit per-route
# exception with the route named; do not widen ACCEPTED_STATUSES.
ACCEPTED_STATUSES = frozenset({200, 201, 202, 204, 400, 401, 403, 409, 422, 429})

# Share of probed routes answering with the SAME non-2xx status above which the
# verdict is about the ENVIRONMENT, not about N individually broken routes.
UNIFORM_FAILURE_RATIO = 0.20


def _is_2xx(status: object) -> bool:
    return isinstance(status, int) and 200 <= status < 300


def _verdict(method: str, path: str, status: object) -> tuple[bool, str]:
    """Decide, for THIS route, whether `status` is an answer the app may give.

    Returns (accepted, reason). `reason` is empty when accepted.
    """
    if not isinstance(status, int):
        return False, f"no HTTP response ({status})"
    if 300 <= status < 400:
        return False, (
            "unexpected redirect — the probe does not follow redirects, so this "
            "is the route's own status; no route in this app redirects by design"
        )
    if status == 404:
        return False, "path not served by this deployment (deploy drift)"
    if status == 405:
        return False, f"path is served but not for {method} (method mismatch)"
    if status >= 500:
        return False, "server error"
    if status in ACCEPTED_STATUSES:
        return True, ""
    return False, "status outside the accepted contract"


def _aggregate_alarms(rows) -> list[str]:
    """Environment-level verdicts that per-route checks cannot express.

    A uniform answer across the surface means the environment is unreachable or
    walled off — one fact, not N.

    Counted over REJECTED statuses only, and that restriction is measured, not
    assumed. The first version of this counted every non-2xx status, on the
    reasoning that a wall of 401s is still a wall. Run against a target that
    answers correctly, it failed: 91 of 159 routes (57%) legitimately answer 401
    and 38 (24%) answer 422, because most routes in this app are behind auth and
    the probe sends no credentials. A guard that reds every healthy run is not a
    strict guard — it is one that gets weakened the first time it blocks a merge.

    The auth-walled case it gave up is recovered by the zero-2xx alarm below,
    which is specific to it and does not fire on a healthy mix.
    """
    total = len(rows)
    if total == 0:
        return [
            "probe covered ZERO routes — nothing was verified. An empty run is "
            "not a pass; the frontend-call extraction is broken or the filter "
            "matched nothing."
        ]
    alarms = []
    counts = Counter(
        str(s) for m, p, s, _ in rows if not _verdict(m, p, s)[0]
    )
    for status, n in counts.most_common():
        if n > total * UNIFORM_FAILURE_RATIO:
            alarms.append(
                f"{n} of {total} probed routes ({n / total:.0%}) returned "
                f"{status} — above the {UNIFORM_FAILURE_RATIO:.0%} uniform-failure "
                f"threshold. That is one environment-level fact (unreachable or "
                f"redirected), not {n} broken routes."
            )
    if not any(_is_2xx(s) for _, _, s, _ in rows):
        alarms.append(
            f"not one of {total} probed routes returned 2xx — no route answered "
            f"successfully. Every public GET returning 2xx is the baseline of a "
            f"reachable deployment; a run with none is walled off, not verified."
        )
    return alarms


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
            # allow_redirects=False is load-bearing, not a default: requests
            # follows redirects for every verb except HEAD, and a followed
            # redirect would report the STATUS OF THE DESTINATION (200 from
            # vercel.com/sso-api) as though the route had answered it. Keep it
            # explicit — _verdict's 3xx branch assumes the status is the route's
            # own. If a redirect is ever followed deliberately, assert the final
            # status; do not assert that a response arrived.
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
    """Report what was actually seen, then decide. Counts are derived, never
    stated — a summary line that cannot go stale (testing.md)."""
    total = len(rows)
    failures = [
        (method, path, status, reason)
        for method, path, status, _ in rows
        for accepted, reason in [_verdict(method, path, status)]
        if not accepted
    ]
    alarms = _aggregate_alarms(rows)

    print(f"Routes probed: {total}")
    print(f"Accepted:      {total - len(failures)}")
    print(f"Failed:        {len(failures)}")
    print("\nStatus breakdown:")
    counts = Counter(str(s) for _, _, s, _ in rows)
    for status, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        share = f"{n / total:.0%}" if total else "—"
        print(f"  {status:<12} {n:>4}  ({share})")

    print(f"\n{'VERDICT':<8} {'STATUS':<10} {'METHOD':<6} PATH")
    for method, path, status, _ in rows:
        accepted, _reason = _verdict(method, path, status)
        print(f"{'ok' if accepted else 'FAIL':<8} {str(status):<10} {method:<6} {path}")

    if failures:
        print(f"\nFailing routes ({len(failures)}):")
        for method, path, status, reason in failures:
            print(f"  {status:<10} {method:<6} {path}  — {reason}")
    if alarms:
        print("\nAGGREGATE:")
        for a in alarms:
            print(f"  {a}")

    if failures or alarms:
        print(
            f"\nPROBE FAILED — {len(failures)} of {total} route(s) answered "
            f"outside the contract"
            + (f"; {len(alarms)} aggregate alarm(s)" if alarms else "")
            + "."
        )
        return 1
    print(f"\nPROBE OK — {total} route(s) probed, all within the contract.")
    return 0


def _print_cross_env(rows) -> int:
    drift = 0
    print(f"{'METHOD':<6} {'STAGING':<10} {'PROD':<10} PATH")
    for method, path, s, p in rows:
        tag = ""
        if str(s) != str(p):
            drift += 1
            tag = "  ← DEPLOY DRIFT" if str(s) in ("200", "204") and str(p) == "404" else "  ← mismatch"
        print(f"{method:<6} {str(s):<10} {str(p):<10} {path}{tag}")
    print(f"\nRoutes compared: {len(rows)}")
    print(f"Drift count: {drift}")

    # Drift alone is a false green here for the same reason 404-only was in
    # probe mode: two environments that BOTH answer 302 to everything agree
    # perfectly, so drift is 0 and the gate passes having compared nothing.
    # Each side is judged on its own before their difference means anything.
    alarms = []
    for label, idx in (("staging", 2), ("prod", 3)):
        side = [(r[0], r[1], r[idx], "") for r in rows]
        alarms += [f"{label}: {a}" for a in _aggregate_alarms(side)]
    if alarms:
        print("\nAGGREGATE:")
        for a in alarms:
            print(f"  {a}")

    return 1 if drift or alarms else 0


def probe_self_test() -> int:
    """Known-answer check of the probe's verdict classifier (MEH-2077).

    Run this FIRST: if the classifier cannot tell a served route from a wall of
    redirects, nothing the probe reports afterwards is worth reading. The
    discrimination case at the end is the load-bearing one — it proves the new
    rule is red where the rule it REPLACES was green, which a suite of
    accept/reject cases alone does not establish (testing.md, MEH-1619).
    """
    failures = []
    ran = []

    # 302 is the MEH-2077 case; 500 is MEH-1906's by-slug on staging.
    STATUS_CASES = (
        [(s, True) for s in (200, 204, 401, 403, 422, 429)]
        + [(s, False) for s in (301, 302, 307, 404, 405, 500, 503, "ERR:ConnectionError")]
    )
    for status, accepted in STATUS_CASES:
        ran.append(status)
        got, _ = _verdict("GET", "/producers", status)
        if got is not accepted:
            failures.append(
                f"status {status!r}: accepted={got}, expected accepted={accepted}"
            )
    # 405 must name the verb it was refused for, not just fail.
    if "method mismatch" not in _verdict("POST", "/producers", 405)[1]:
        failures.append("405 verdict no longer explains itself as a method mismatch")

    all_302 = [("GET", f"/r{i}", 302, "u") for i in range(10)]
    all_200 = [("GET", f"/r{i}", 200, "u") for i in range(10)]
    one_404 = [("GET", "/r0", 404, "u")] + [("GET", f"/r{i}", 200, "u") for i in range(1, 10)]
    # The shape of a REAL healthy answer, taken from the control run against a
    # correctly-answering target: mostly 401 (authed routes, no credentials
    # sent), some 422 (POST/PUT with no body), the rest 200. This case is why
    # the aggregate counts rejected statuses only — the first version failed it.
    healthy_mix = (
        [("GET", f"/a{i}", 401, "u") for i in range(6)]
        + [("POST", f"/b{i}", 422, "u") for i in range(2)]
        + [("GET", f"/c{i}", 200, "u") for i in range(2)]
    )
    all_401 = [("GET", f"/r{i}", 401, "u") for i in range(10)]

    if not _aggregate_alarms(all_302):
        failures.append("uniform 302 raised no aggregate alarm")
    if _aggregate_alarms(all_200):
        failures.append("all-2xx raised an aggregate alarm")
    if _aggregate_alarms(one_404):
        failures.append("1-in-10 404 tripped the 20% uniform-failure threshold")
    if _aggregate_alarms(healthy_mix):
        failures.append(
            "a healthy 401/422/200 mix raised an aggregate alarm — the guard "
            "would red every good run"
        )
    if not _aggregate_alarms(all_401):
        failures.append("an all-401 wall (zero 2xx anywhere) raised no alarm")
    if not _aggregate_alarms([]):
        failures.append("a zero-route probe reported no alarm — an empty run must not pass")

    # Discrimination against the implementation this replaces. The old rule was
    # `any(str(status) == "404")`; on the all-302 fixture it is GREEN. If this
    # case ever stops holding, the self-test has stopped testing the change.
    if any(str(s) == "404" for _, _, s, _ in all_302):
        failures.append("fixture bug: the all-302 rows contain a 404")
    if not [r for r in all_302 if not _verdict(r[0], r[1], r[2])[0]]:
        failures.append("all-302 fixture produced no per-route failure")

    if failures:
        print("PROBE SELF-TEST FAILED")
        for f in failures:
            print("  -", f)
        return 1
    print(
        f"probe self-test OK — {len(ran)} status cases, 6 aggregate cases, "
        "1 discrimination case against the 404-only rule this replaces"
    )
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--probe", metavar="URL", help="HTTP-probe frontend paths against URL")
    ap.add_argument("--cross-env", action="store_true", help="Probe --staging + --prod")
    ap.add_argument("--staging", metavar="URL")
    ap.add_argument("--prod", metavar="URL")
    ap.add_argument("--json", action="store_true", help="Machine-readable static output")
    ap.add_argument(
        "--self-test",
        action="store_true",
        help="Known-answer check of the probe verdict classifier (no network)",
    )
    args = ap.parse_args()

    if args.self_test:
        return probe_self_test()

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
