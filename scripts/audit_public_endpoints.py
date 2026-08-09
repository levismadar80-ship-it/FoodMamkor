#!/usr/bin/env python3
"""Public-endpoint × rate-limit inventory — read from the APP, never the files.

MEH-1979. The original audit produced this table with a script that walked
`backend/app/routers/*.py` and parsed decorators. It reported **20** public
unlimited endpoints. Four of them do not exist: `home_products.router` is
deliberately never registered (`app/router_registry.py:89`, brand LOCK under
MEH-1406), so a file-walking scan invented four phantom endpoints — including
**both** rows the audit flagged 🔴 as the critical exposures.

    An inventory reads the APP — the mounted routes — never the FILES.

A file cannot tell you what is served. Only the app knows: which routers were
included, under which prefix, behind which dependencies, with which limits.
That is the whole rule, and it generalises past this ticket: any question of
the form "what does the system expose?" has to be asked of the running system.

This script therefore introspects `app.routes` and reads `slowapi`'s own
metadata off the endpoint functions. It never greps source.

    usage:  python scripts/audit_public_endpoints.py            # the table
            python scripts/audit_public_endpoints.py --json     # machine form
            python scripts/audit_public_endpoints.py --self-test

`--self-test` is the discrimination check: it asserts the classifier sorts
routes whose answers are known **from this repo**, not from invented fixtures
(testing.md — anchor at least one case to a real file). It exits 1 on any
mismatch, so a classifier that has silently stopped distinguishing cannot
report a clean table.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))


def _load_app():
    from app.main import app  # noqa: PLC0415 — import after sys.path fixup

    return app


# Dependency callables that mean "not public". Derived from what the repo
# actually uses, not guessed from common FastAPI names — guessing is what made
# the first audit script misclassify every producer-dashboard route as public.
AUTH_DEPS = {
    "get_current_user",
    "get_current_user_optional_strict",
    "require_admin",
    "require_producer",
    "require_verified_producer",
    "require_role",
    "get_current_admin",
}


def _auth_deps_of(route) -> list[str]:
    """Every dependency callable name attached to this route, at any depth."""
    names = []
    dependant = getattr(route, "dependant", None)
    for dep in (dependant.dependencies if dependant else []):
        stack = [dep]
        while stack:
            d = stack.pop()
            call = getattr(d, "call", None)
            if call is not None and getattr(call, "__name__", None):
                names.append(call.__name__)
            stack.extend(getattr(d, "dependencies", []) or [])
    return names


def _limits_of(route, registry) -> list[str]:
    """slowapi's own registry is the source — not a regex, not a guess.

    `limiter._route_limits` is keyed `module.function` and is populated when
    the decorated module is imported. **Validated against a known answer
    before being trusted**: the first version of this read `fn._rate_limits`,
    which returns empty for `/search/trending` — a route that is definitely
    limited. An empty result there is indistinguishable from "no limit", which
    is exactly how a probe reports a reassuring wrong answer.
    """
    fn = getattr(route, "endpoint", None)
    if fn is None:
        return []
    key = f"{fn.__module__}.{fn.__name__}"
    return [str(getattr(lim, "limit", lim)) for lim in registry.get(key, [])]


def inventory() -> list[dict]:
    """Walk what the APP mounts.

    Routers are included lazily: `app.routes` holds `_IncludedRouter` wrappers,
    not `APIRoute`s, until something forces resolution. Reading `app.routes`
    naively reports **zero** API routes — a silent empty answer. `app.openapi()`
    forces it, and also populates slowapi's limit registry by importing the
    decorated modules.
    """
    from fastapi.routing import APIRoute  # noqa: PLC0415

    app = _load_app()
    app.openapi()  # force lazy router inclusion + decorator registration

    from app.rate_limit import limiter  # noqa: PLC0415

    registry = limiter._route_limits
    rows = []

    def _collect(route, prefix=""):
        if not isinstance(route, APIRoute):
            return
        deps = _auth_deps_of(route)
        authed = sorted(set(deps) & AUTH_DEPS)
        limits = _limits_of(route, registry)
        for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
            rows.append(
                {
                    "method": method,
                    "path": prefix + route.path,
                    "authed_by": authed,
                    "public": not authed,
                    "limits": limits,
                    "limited": bool(limits),
                }
            )

    for entry in app.routes:
        if type(entry).__name__ == "_IncludedRouter":
            ctx = entry.include_context
            for sub in entry.original_router.routes:
                _collect(sub, getattr(ctx, "prefix", "") or "")
        else:
            _collect(entry)

    # A probe that returns nothing must SAY SO, not report a clean sheet.
    #
    # `_IncludedRouter` is a private FastAPI internal. If upstream renames it,
    # every branch above falls through and `rows` comes back empty — and an
    # empty inventory reads as "no public unlimited endpoints", the most
    # reassuring answer this script can give, at the exact moment it knows
    # nothing. The ratchet test would then fail with "these were deliberately
    # unlimited and no longer are": true-sounding, and pointing at the wrong
    # culprit entirely.
    #
    # Same defect class as a downed Postgres reported as a failing test suite.
    # Raised by the CI reviewer on PR #2752.
    if not rows:
        raise RuntimeError(
            "endpoint inventory is EMPTY — the probe is broken, not the app. "
            "FastAPI's private `_IncludedRouter` name has most likely drifted; "
            "re-derive the route-walking in inventory(). Do NOT read this as "
            "'no exposed endpoints'."
        )
    return sorted(rows, key=lambda r: (r["path"], r["method"]))


def _print_table(rows: list[dict]) -> None:
    public = [r for r in rows if r["public"]]
    exposed = [r for r in public if not r["limited"]]
    print(f"routes (mounted)        : {len(rows)}")
    print(f"  behind auth           : {len(rows) - len(public)}")
    print(f"  public                : {len(public)}")
    print(f"    public + limited    : {len(public) - len(exposed)}")
    print(f"    public + UNLIMITED  : {len(exposed)}")
    print()
    if exposed:
        print("PUBLIC AND UNLIMITED")
        for r in exposed:
            print(f"  {r['method']:6} {r['path']}")
        print()
    print("PUBLIC AND LIMITED")
    for r in public:
        if r["limited"]:
            print(f"  {r['method']:6} {r['path']:45} {','.join(r['limits'])}")


def self_test() -> int:
    """Cases whose answers are known from THIS repo, not from fixtures.

    The first audit script passed a weaker self-test ("some routes are public
    and some are authed") that was green against a parser which had
    misclassified 29 routes — an assertion that cannot fail is not a check.
    Every case below names a specific route and the specific answer, so a
    classifier that stops distinguishing goes red.
    """
    rows = {(r["method"], r["path"]): r for r in inventory()}
    failures = []

    def expect(method, path, *, public=None, limited=None, must_exist=True):
        r = rows.get((method, path))
        if r is None:
            if must_exist:
                failures.append(f"{method} {path}: route not mounted (expected present)")
            return
        if not must_exist:
            failures.append(f"{method} {path}: route IS mounted (expected absent)")
            return
        if public is not None and r["public"] != public:
            failures.append(f"{method} {path}: public={r['public']} expected {public}")
        if limited is not None and r["limited"] != limited:
            failures.append(f"{method} {path}: limited={r['limited']} expected {limited}")

    # 1. Authed — the case the first script got wrong for 29 routes.
    expect("GET", "/producers/me", public=False)
    # 2. Public and limited by this ticket.
    expect("GET", "/search/trending", public=True, limited=True)
    # 3. Public and deliberately UNLIMITED — the production-outage guard.
    expect("GET", "/health", public=True, limited=False)
    # 4. The phantom class: present in the router file, absent from the app.
    #    This is the case that makes the script worth committing.
    expect("GET", "/home-products", must_exist=False)
    expect("POST", "/home-products/rate/{token}", must_exist=False)

    if failures:
        print("SELF-TEST FAILED")
        for f in failures:
            print("  -", f)
        return 1
    print("self-test OK — 5 known-answer cases, including the unmounted-router class")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        return self_test()
    rows = inventory()
    if args.json:
        print(json.dumps(rows, indent=2, ensure_ascii=False))
    else:
        _print_table(rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
