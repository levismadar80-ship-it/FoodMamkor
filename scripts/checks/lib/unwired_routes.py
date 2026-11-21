#!/usr/bin/env python3
"""
Module:   unwired_routes
Purpose:  Fail when a backend route has no caller anywhere in the frontend and
          is not listed, with a reason, in unwired-route-baseline.txt. A route
          built on the server with no button on the site is a dead feature
          (Sapir 20/11: «שזה לא יקרה שוב שיהיו פיצרים מתים»).
Touches:  nothing: reads the repo through scripts/check_api_contract.py's static
          scan and prints.
Does NOT: decide what a caller is. That is run_static() in
          scripts/check_api_contract.py (MEH-245), the one owner of the
          frontend-call / backend-route diff. This file only turns its
          `orphan_backend` list, which used to be printed and read by no one,
          into a gate.
Related:  scripts/checks/unwired-route-guard.sh (the wrapper run-all.sh finds) ·
          scripts/checks/unwired-route-baseline.txt (the frozen list).
History:  MEH-3523 (creation, 2026-11-20). Found MEH-3182 marked Done with its
          owner screen never built, MEH-3524 (no way to grant «מאומת»),
          MEH-3525 (no «ההזמנות שלי»).

BASELINE FORMAT (tab-separated, one route per line, `#` comments):

    METHOD <TAB> PATH <TAB> REASON [<TAB> DETAIL]

PATH is as the scanner prints it ({_} for a path parameter). REASON is one of:

    scanner-miss  DETAIL = the frontend file that really calls it. The scanner
                  misses calls built from a variable (`${basePath}/…`); this
                  guard then checks that the file exists and contains the
                  path's literal segments (bar the generic ones), so the reason cannot rot.
    webhook       called by an outside service, never by the site.
    health        called by the platform or monitoring.
    ops-manual    DETAIL = the doc that tells an operator how to call it by hand
                  (MEH-3527: POST /admin/seed-cities). The guard checks that the
                  doc exists and spells the full path, so the reason cannot rot.
    pending-ui    DETAIL = MEH-<N>: the card that builds its screen.
    admin-no-ui   DETAIL = MEH-<N>: an admin tool with no screen yet.
    unused        DETAIL = MEH-<N>: the card that deletes or documents it.

A route that is unwired and not listed fails. A listed route that is no longer
an orphan (it got a caller, or it was deleted) fails too, so the list only
shrinks.
"""
from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
BASELINE = REPO / "scripts" / "checks" / "unwired-route-baseline.txt"
GUARD = "scripts/checks/unwired-route-guard.sh"

NO_DETAIL = {"webhook", "health"}
NEEDS_CARD = {"pending-ui", "admin-no-ui", "unused"}
REASONS = NO_DETAIL | NEEDS_CARD | {"scanner-miss", "ops-manual"}
CARD_RE = re.compile(r"^MEH-[0-9]+$")


def _load_scanner():
    path = REPO / "scripts" / "check_api_contract.py"
    spec = importlib.util.spec_from_file_location("check_api_contract", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def orphans() -> dict[tuple[str, str], tuple[str, int]]:
    """(METHOD, PATH) → (backend file, line), straight from the scanner."""
    result = _load_scanner().run_static()
    out: dict[tuple[str, str], tuple[str, int]] = {}
    for path, methods, file, line in result["orphan_backend"]:
        for method in methods:
            out[(method, path)] = (str(file), int(line))
    return out


# Segments that half the routes share; requiring them proves nothing.
GENERIC = {"producers", "me", "admin", "users"}


def required_literals(path: str) -> list[str]:
    """Every literal segment a real caller must spell, minus the generic ones."""
    segs = [s for s in path.split("/") if s and not s.startswith("{")]
    specific = [s for s in segs if s not in GENERIC]
    return specific or segs


def parse_baseline(text: str) -> tuple[dict[tuple[str, str], tuple[str, str, int]], list[str]]:
    """→ ({(METHOD, PATH): (reason, detail, lineno)}, [format errors])."""
    rows: dict[tuple[str, str], tuple[str, str, int]] = {}
    errors: list[str] = []
    for n, raw in enumerate(text.splitlines(), 1):
        line = raw.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = line.split("\t")
        where = f"scripts/checks/unwired-route-baseline.txt:{n}"
        if len(parts) < 3:
            errors.append(f"{where}: needs METHOD<TAB>PATH<TAB>REASON[<TAB>DETAIL]")
            continue
        method, path, reason = parts[0].strip(), parts[1].strip(), parts[2].strip()
        detail = parts[3].strip() if len(parts) > 3 else ""
        if reason not in REASONS:
            errors.append(f"{where}: unknown reason «{reason}» (one of {sorted(REASONS)})")
        elif reason in NEEDS_CARD and not CARD_RE.match(detail):
            errors.append(f"{where}: reason «{reason}» needs a MEH-<N> card, got «{detail}»")
        elif reason == "scanner-miss" and not detail:
            errors.append(f"{where}: scanner-miss needs the frontend file that calls it")
        elif reason == "ops-manual" and not detail:
            errors.append(f"{where}: ops-manual needs the doc that tells the operator to call it")
        if (method, path) in rows:
            errors.append(f"{where}: duplicate of line {rows[(method, path)][2]}")
        rows[(method, path)] = (reason, detail, n)
    return rows, errors


_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
# `//` at line start or after whitespace: a comment. Not `https://` inside a string.
_LINE_COMMENT = re.compile(r"(^|\s)//[^\n]*")


def strip_comments(src: str) -> str:
    """JS/JSX source minus comments, so a path named only in prose (MEH-3523
    review: sitemap.js explained why it did NOT call /producers/cities) does
    not count as a caller."""
    return _LINE_COMMENT.sub(r"\1", _BLOCK_COMMENT.sub("", src))


def check_scanner_miss(path: str, detail: str, where: str) -> str | None:
    target = REPO / detail
    if not target.is_file():
        return f"{where}: scanner-miss file {detail} does not exist"
    body = strip_comments(target.read_text(encoding="utf-8", errors="replace"))
    # Path-shaped: `/cities`, not the word `cities` in a variable name.
    missing = [s for s in required_literals(path) if f"/{s}" not in body]
    if missing:
        return f"{where}: {detail} does not contain {missing} — is it really the caller of {path}?"
    return None


def check_ops_manual(path: str, detail: str, where: str) -> str | None:
    target = REPO / detail
    if not target.is_file():
        return f"{where}: ops-manual doc {detail} does not exist"
    # The doc must name the exact path: an operator copies it from there.
    if path not in target.read_text(encoding="utf-8", errors="replace"):
        return f"{where}: {detail} does not name {path} — where does an operator learn to call it?"
    return None


def evaluate(found: dict[tuple[str, str], tuple[str, int]], text: str) -> list[str]:
    rows, errors = parse_baseline(text)
    for key, (file, line) in sorted(found.items()):
        if key not in rows:
            method, path = key
            errors.append(
                f"{file}:{line}: {method} {path} has no caller in frontend/ — a server feature "
                f"with no button on the site. Wire it to a screen, delete it, or add a line to "
                f"scripts/checks/unwired-route-baseline.txt with a reason (see {GUARD})."
            )
    for key, (reason, detail, n) in sorted(rows.items(), key=lambda kv: kv[1][2]):
        where = f"scripts/checks/unwired-route-baseline.txt:{n}"
        if key not in found:
            errors.append(
                f"{where}: {key[0]} {key[1]} is no longer unwired (it got a caller or was deleted) "
                f"— remove this line; the list only shrinks."
            )
            continue
        if reason == "scanner-miss":
            err = check_scanner_miss(key[1], detail, where)
            if err:
                errors.append(err)
        elif reason == "ops-manual":
            err = check_ops_manual(key[1], detail, where)
            if err:
                errors.append(err)
    return errors


def self_test() -> int:
    """Known answers, against the real evaluate() — including one case anchored
    to a real repo file (MEH-1909)."""
    found = {("GET", "/a/x"): ("backend/app/routers/a.py", 3),
             ("POST", "/b/{_}/y"): ("backend/app/routers/b.py", 9)}
    ok_text = "GET\t/a/x\twebhook\nPOST\t/b/{_}/y\tpending-ui\tMEH-1\n"
    cases = [
        ("listed with reasons → clean", found, ok_text, 0),
        ("new orphan not listed → red", {**found, ("PUT", "/c"): ("x.py", 1)}, ok_text, 1),
        ("listed but wired now → red", {("GET", "/a/x"): ("a.py", 3)}, ok_text, 1),
        ("pending-ui without card → red", found, "GET\t/a/x\twebhook\nPOST\t/b/{_}/y\tpending-ui\n", 1),
        ("unknown reason → red", found, "GET\t/a/x\tbecause\nPOST\t/b/{_}/y\tpending-ui\tMEH-1\n", 1),
        # Real repo file: WeeklySummaryToggle.jsx calls /producers/me/weekly-summary.
        ("scanner-miss, real caller → clean",
         {("GET", "/producers/me/weekly-summary"): ("r.py", 1)},
         "GET\t/producers/me/weekly-summary\tscanner-miss\tfrontend/components/producer/WeeklySummaryToggle.jsx\n", 0),
        ("scanner-miss, wrong file → red",
         {("GET", "/producers/me/weekly-summary"): ("r.py", 1)},
         "GET\t/producers/me/weekly-summary\tscanner-miss\tfrontend/components/ShareButton.jsx\n", 1),
        # Real repo file: sitemap.js names /producers/cities only in comments.
        ("scanner-miss, named only in a comment → red",
         {("GET", "/producers/cities"): ("r.py", 1)},
         "GET\t/producers/cities\tscanner-miss\tfrontend/app/sitemap.js\n", 1),
        ("strip_comments keeps code, drops prose", None, None, None),
        # Real repo file: DEPLOYMENT.md tells the operator to POST /admin/seed-cities.
        ("ops-manual, doc names the path → clean",
         {("POST", "/admin/seed-cities"): ("r.py", 1)},
         "POST\t/admin/seed-cities\tops-manual\tdocs/DEPLOYMENT.md\n", 0),
        ("ops-manual, doc does not name it → red",
         {("POST", "/admin/seed-cities"): ("r.py", 1)},
         "POST\t/admin/seed-cities\tops-manual\tdocs/BRAND.md\n", 1),
        ("ops-manual without a doc → red",
         {("POST", "/admin/seed-cities"): ("r.py", 1)},
         "POST\t/admin/seed-cities\tops-manual\n", 1),
        ("scanner-miss, missing file → red",
         {("GET", "/producers/me/weekly-summary"): ("r.py", 1)},
         "GET\t/producers/me/weekly-summary\tscanner-miss\tfrontend/nope.jsx\n", 1),
    ]
    failed = 0
    for name, f, text, want in cases:
        if f is None:
            src = 'const u = "https://x/a"; // calls /cities\n/* /cities */ api.get(`/cities`)'
            out = strip_comments(src)
            verdict = "https://x/a" in out and out.count("/cities") == 1
            print(f"{'ok  ' if verdict else 'FAIL'} {name}")
            failed += 0 if verdict else 1
            continue
        got = len(evaluate(f, text))
        verdict = (got == 0) if want == 0 else (got >= want)
        print(f"{'ok  ' if verdict else 'FAIL'} {name} (errors={got})")
        failed += 0 if verdict else 1
    print(f"self-test: {len(cases) - failed}/{len(cases)} passed")
    return 1 if failed else 0


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        return self_test()
    found = orphans()
    if not found:
        # A scan that finds zero orphans in a repo that has webhooks is broken.
        print(f"{GUARD}:1: the scanner reported 0 unwired routes — the scan itself is broken")
        return 1
    if not BASELINE.is_file():
        print(f"{BASELINE.relative_to(REPO)}:1: baseline missing")
        return 1
    errors = evaluate(found, BASELINE.read_text(encoding="utf-8"))
    for e in errors:
        print(e)
    print(f"unwired-route-guard: {len(found)} unwired routes, {len(errors)} problems")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
