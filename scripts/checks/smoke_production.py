#!/usr/bin/env python3
"""
Module:   smoke_production
Purpose:  Post-release read-only smoke of the live public surface. Answers
          "is production actually serving" rather than "does production say
          it is fine" — every check prints what it measured, not just a verdict.
Touches:  Nothing. GET requests only, no auth, no writes, no DB, no Alembic.
Does NOT: check security posture (that is scripts/smoke_test.py, MEH-259) and
          does NOT exercise the signup pipeline (that is
          .github/scripts/staging_smoke.py, MEH-671 — which DOES write).
Related:  backend/app/routers/health.py:60 (readiness) vs :138 (the alias that
          cannot fail) · frontend/app/sitemap.js:79 (producer URLs) ·
          scripts/checks/data-readiness.py (the GET-only idiom reused here)
History:  MEH-2088 (creation, post-Release-#2 smoke for MEH-1909 / MEH-2083)

Usage
-----
    python scripts/checks/smoke_production.py                    # production
    python scripts/checks/smoke_production.py --base-url https://…
    python scripts/checks/smoke_production.py --prove-control    # see below

Exit codes
----------
    0  every check passed (INFO / SKIP lines do not fail the run)
    1  one or more checks FAILED
    2  the CONTROL failed — the harness itself is not trustworthy, and every
       other line in that run is void regardless of what it printed

Why a Python script and not a Playwright spec
---------------------------------------------
Every assertion here is an HTTP status or a response body; none needs a
rendering engine. The "an image actually loads" check is deliberately a
**status check on the Cloudinary URL**, not a rendered pixel — markup can
reference an image that 404s, which is the thing worth catching. A spec would
drag in the Playwright runner, its config and a browser download for zero
added signal, and Sapir runs this from Git Bash on Windows. stdlib only
(urllib), so it needs neither the backend venv nor `requests`.

The control is not decoration
-----------------------------
A smoke script is the one program nobody smoke-tests. If its fetch layer
breaks in the reassuring direction — every request reported as 200 — it prints
a clean board while production burns. So the run OPENS with a two-sided
control that exercises the real fetch function against a URL that must 200 and
one that must 404. If it cannot tell those apart, the run aborts with exit 2
rather than printing results nobody should read.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SEED_FILE = REPO_ROOT / "backend" / "seed_data.py"

DEFAULT_BASE_URL = "https://mehamakor.co.il"
TIMEOUT_S = 25

# A path that must never exist. Used by the control, and by nothing else.
CONTROL_404_PATH = "/__smoke-control-must-404__"

# Static routes frontend/app/sitemap.js:49-67 emits. Used ONLY to label which
# sitemap URLs are producer pages in the printout — every sitemap URL is
# fetched and 404-checked regardless, so a wrong label here cannot turn a
# broken URL into a pass.
STATIC_SITEMAP_PATHS = {
    "", "/map", "/events", "/about", "/experiences", "/group-buys",
    "/about/process", "/about/for-businesses", "/about/why-local",
    "/register/producer", "/terms", "/producers",
}

PASS, FAIL, INFO, SKIP = "PASS", "FAIL", "INFO", "SKIP"


class Board:
    """Collects results. FAIL sets the exit code; INFO and SKIP never do."""

    def __init__(self) -> None:
        self.rows: list[tuple[str, str, str]] = []

    def add(self, verdict: str, name: str, measured: str) -> None:
        self.rows.append((verdict, name, measured))
        print(f"  [{verdict:4}] {name}\n         └─ {measured}")

    @property
    def failed(self) -> int:
        return sum(1 for v, _, _ in self.rows if v == FAIL)

    @property
    def skipped(self) -> int:
        return sum(1 for v, _, _ in self.rows if v == SKIP)


def fetch(url: str) -> tuple[int, bytes, dict]:
    """GET a URL. Returns (status, body, headers). Never raises on HTTP status.

    The ONLY network primitive in this file — so the control below, which calls
    this same function, genuinely validates the path every other check uses. A
    second copy for the control would be free to drift from the one that
    matters (.claude/rules/testing.md — "exercise the real implementation").
    """
    req = urllib.request.Request(url, headers={"User-Agent": "mehamakor-smoke/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:  # noqa: S310
            return resp.status, resp.read(), _headers(resp.headers)
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read(), _headers(exc.headers)
    except Exception as exc:  # DNS, TLS, timeout — a transport failure, not a status
        return 0, f"{type(exc).__name__}: {exc}".encode(), {}


def _headers(raw) -> dict:
    """Lower-case the header keys.

    urllib hands back an ``email.message.Message``, which IS case-insensitive —
    but ``dict()`` on it is NOT, and HTTP/1.1 may send ``Age`` where HTTP/2
    sends ``age``. The first version of this file did the plain ``dict()`` and
    silently lost the sitemap's cache age (printed ``age ?``) and the image
    ``content-type``, i.e. the two headers the run exists to read.
    """
    return {k.lower(): v for k, v in (raw or {}).items()}


# ------------------------------------------------------------------ control


def run_control(base: str, fetch_fn) -> bool:
    """Two-sided discrimination control. Runs FIRST; a failure voids the run.

    Positive leg: a URL that must serve.       Negative leg: a URL that must 404.
    A harness that always reports 200 passes the first and fails the second,
    which is precisely the failure mode this exists to catch — an instrument
    whose reassuring answer is also its broken answer.
    """
    print("── CONTROL (proves the harness can detect failure) " + "─" * 26)
    ok = True

    status, body, _ = fetch_fn(f"{base}/api/health/liveness")
    good = status == 200
    print(f"  [{PASS if good else FAIL:4}] positive leg — /api/health/liveness must be 200")
    print(f"         └─ measured {status}{_why(status, body)}")
    ok &= good

    status, body, _ = fetch_fn(f"{base}{CONTROL_404_PATH}")
    good = status == 404
    print(f"  [{PASS if good else FAIL:4}] negative leg — {CONTROL_404_PATH} must be 404")
    print(f"         └─ measured {status}{_why(status, body)}"
          + ("" if good else "  ← harness cannot detect a failing URL"))
    ok &= good

    print()
    return ok


def _why(status: int, body: bytes) -> str:
    """Surface the transport error behind a status of 0.

    ``measured 0`` on its own sends the reader off to diagnose by hand; the
    reason is already in ``body`` (fetch puts it there) and a control that
    hides it is failing the same "print what you measured" bar it enforces
    on everything else. Real case: a proxied sandbox returns
    ``Tunnel connection failed: 403`` — a network gate, not a broken harness,
    and the two need different responses.
    """
    if status != 0:
        return ""
    return f"  ← {body.decode('utf-8', 'replace')[:120]}"


# ------------------------------------------------------------------ checks


def check_readiness(base: str, board: Board) -> None:
    """/health/readiness — the one that CAN fail. Never the /health alias.

    Both are printed side by side on purpose: the alias hardcodes
    ``{"status": "ok"}`` (health.py:154) and returns 200 even while its own
    body reports ``db_init: failed``. Seeing the two together is what makes
    the difference legible instead of arguable.
    """
    status, body, _ = fetch(f"{base}/api/health/readiness")
    text = body.decode("utf-8", "replace")[:200]
    ready = status == 200 and '"status":"ready"' in text.replace(" ", "")
    board.add(
        PASS if ready else FAIL,
        "readiness — /api/health/readiness reports ready",
        f"HTTP {status} · body {text}",
    )

    alias_status, alias_body, _ = fetch(f"{base}/api/health")
    board.add(
        INFO,
        "the /health alias, for contrast (never a pass signal)",
        f"HTTP {alias_status} · body {alias_body.decode('utf-8', 'replace')[:200]}",
    )


def check_pages(base: str, board: Board, detail_slug: str | None) -> None:
    """Home, catalog, map, and one producer detail page must all serve 200."""
    targets = [("home", "/"), ("catalog", "/producers"), ("map", "/map")]
    if detail_slug:
        targets.append((f"producer detail ({detail_slug})", f"/{detail_slug}"))

    for name, path in targets:
        status, body, _ = fetch(f"{base}{path}")
        board.add(
            PASS if status == 200 else FAIL,
            f"page 200 — {name}",
            f"HTTP {status} · {len(body):,} bytes · {base}{path}",
        )

    if not detail_slug:
        board.add(
            SKIP,
            "page 200 — producer detail",
            "the catalog returned no producer, so there was no detail page to "
            "fetch. Expected AFTER the fixtures are suspended; a finding BEFORE.",
        )


def check_sitemap(base: str, board: Board) -> None:
    """Fetch sitemap.xml, then fetch every URL it lists. Any 404 is a FAIL.

    This is the check that catches a build-pinned sitemap. sitemap.js is
    generated at build time and served from Vercel's edge, so suspending a
    producer does NOT change it — it keeps advertising pages that now 404
    until a fresh deploy. Cache age is printed because that is the evidence.
    """
    status, body, headers = fetch(f"{base}/sitemap.xml")
    if status != 200:
        board.add(FAIL, "sitemap.xml fetched", f"HTTP {status}")
        return

    age = headers.get("age", "?")
    age_note = ""
    if age.isdigit():
        age_note = f" ({int(age) / 86400:.2f} days old)"
    board.add(
        INFO,
        "sitemap.xml cache state",
        f"HTTP 200 · age {age}{age_note} · x-vercel-cache "
        f"{headers.get('x-vercel-cache', '?')} — a stale age here means a "
        f"deploy is still needed for any catalog change to reach Google",
    )

    urls = re.findall(r"<loc>([^<]+)</loc>", body.decode("utf-8", "replace"))
    if not urls:
        board.add(FAIL, "sitemap.xml lists URLs", "zero <loc> entries parsed")
        return

    producer_urls = [u for u in urls if _is_producer_url(u)]
    board.add(
        INFO,
        "sitemap.xml producer URLs listed",
        f"{len(producer_urls)} of {len(urls)} total: "
        + (", ".join(producer_urls) if producer_urls else "(none)"),
    )

    broken = []
    for url in urls:
        st, _, _ = fetch(url)
        if st == 404:
            broken.append(f"{url} → 404")
    board.add(
        FAIL if broken else PASS,
        f"every sitemap URL resolves ({len(urls)} fetched)",
        "; ".join(broken) if broken
        else f"all {len(urls)} returned non-404 — nothing advertised to Google is missing",
    )


def _is_producer_url(url: str) -> bool:
    """Label-only. A wrong answer here cannot mask a 404 — every URL is fetched."""
    path = urllib.parse.urlparse(url).path.rstrip("/")
    if path.startswith("/en"):
        path = path[3:]
    if path in STATIC_SITEMAP_PATHS or "/" in path.lstrip("/"):
        return False
    return bool(path)


def check_fixture_slugs(base: str, board: Board, slugs: list[str]) -> None:
    """Report what the five seed slugs return. Deliberately asserts NO direction.

    Sapir runs this at two points — before suspending the fixtures (expect 200)
    and after (expect 404). Baking in either expectation would make the script
    wrong at one of them, so this prints and does not judge.
    """
    if not slugs:
        board.add(
            SKIP,
            "seed fixture slugs",
            f"could not read slugs from {SEED_FILE} — run from inside the repo, "
            "or pass --slugs a,b,c. NOT a pass: nothing was checked.",
        )
        return

    results = []
    for slug in slugs:
        status, _, _ = fetch(f"{base}/{slug}")
        results.append(f"{slug} → {status}")
    board.add(
        INFO,
        f"seed fixture slugs ({len(slugs)}) — no direction asserted",
        " · ".join(results)
        + "  |  BEFORE suspending expect 200, AFTER expect 404",
    )


def check_cloudinary_image(base: str, board: Board, producers: list[dict]) -> None:
    """Fetch a real image URL and check it serves — status, not markup.

    Markup can reference an image that 404s, so counting <img> tags proves
    nothing. If no producer carries an image URL this reports SKIP with the
    reason, never PASS: "nothing to check" and "everything is fine" are
    different answers and must not print the same way.
    """
    for p in producers:
        url = _first_image_url(p)
        if url:
            status, body, headers = fetch(url)
            ok = status == 200 and headers.get("content-type", "").startswith("image/")
            board.add(
                PASS if ok else FAIL,
                "an image actually loads from Cloudinary",
                f"HTTP {status} · content-type {headers.get('content-type', '?')} · "
                f"{len(body):,} bytes · {url[:110]}",
            )
            return

    board.add(
        SKIP,
        "an image actually loads from Cloudinary",
        f"no image URL found on any of the {len(producers)} catalog producers "
        "(images[], product image_url, owner_photo_url, story_card_url all "
        "empty) — there was nothing to fetch. NOT a pass.",
    )


def _first_image_url(p: dict) -> str | None:
    for url in p.get("images") or []:
        if url:
            return url
    for product in p.get("products") or []:
        if product.get("image_url"):
            return product["image_url"]
    return p.get("owner_photo_url") or p.get("story_card_url") or None


def check_sentry(board: Board) -> None:
    """Sentry cannot be verified from here, and this says so rather than guessing.

    Firing a test event is a WRITE to Sentry, and retrieving it needs an auth
    token this repo does not hold. Both are outside a read-only smoke. The
    manual step is named instead, because an unverifiable check that prints
    PASS is worse than one that prints why it cannot.
    """
    board.add(
        SKIP,
        "Sentry test event fires and is retrievable",
        "CANNOT VERIFY from a read-only smoke: firing an event is a write to "
        "Sentry and reading it back needs an auth token this repo does not "
        "carry. Manual step for Sapir — Sentry → Issues, filter environment: "
        "production, confirm the release appears after deploy. Standing gap: "
        "MEH-1905 records zero production Sentry events in 90 days, so an "
        "empty Sentry is NOT evidence of a healthy release.",
    )


# ------------------------------------------------------------------ inputs


def seed_slugs() -> list[str]:
    """Fixture slugs, read from backend/seed_data.py. Never hardcoded here.

    One owner for the fact. Returns [] (→ a loud SKIP) rather than a guess when
    the file is unreadable or its shape changed.
    """
    if not SEED_FILE.is_file():
        return []
    found = re.findall(r'"slug":\s*"([a-z0-9-]+)"', SEED_FILE.read_text("utf-8"))
    return sorted(set(found))


def catalog(base: str) -> list[dict]:
    """The public catalog as the API returns it. [] is a legitimate answer."""
    status, body, _ = fetch(f"{base}/api/producers?limit=100&offset=0")
    if status != 200:
        return []
    try:
        data = json.loads(body.decode("utf-8"))
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, UnicodeDecodeError):
        return []


def detail_producers(base: str, listing: list[dict]) -> list[dict]:
    """Detail payloads for the catalog — the listing shape omits image fields."""
    out = []
    for p in listing[:5]:
        if not p.get("slug"):
            continue
        status, body, _ = fetch(f"{base}/api/producers/by-slug/{p['slug']}")
        if status == 200:
            try:
                out.append(json.loads(body.decode("utf-8")))
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass
    return out


# ------------------------------------------------------------------ main


def main() -> int:
    ap = argparse.ArgumentParser(description="Read-only production smoke (MEH-2088).")
    ap.add_argument("--base-url", default=DEFAULT_BASE_URL)
    ap.add_argument("--slugs", help="comma-separated override for the fixture slugs")
    ap.add_argument(
        "--prove-control",
        action="store_true",
        help="Demonstrate the control WORKS by feeding it a deliberately broken "
             "fetch that reports 200 for everything — the classic always-passes "
             "harness. Expected result: the control goes red and the run aborts "
             "with exit 2. Proves the green in a normal run means something.",
    )
    args = ap.parse_args()
    base = args.base_url.rstrip("/")

    print(f"\nmehamakor production smoke — MEH-2088   ·   target {base}")
    print("read-only: GET requests only, zero writes\n")

    # A fetch that claims everything is fine — the failure mode being guarded.
    broken_fetch = (lambda url: (200, b"", {})) if args.prove_control else fetch
    if args.prove_control:
        print("!! --prove-control: fetch replaced with an always-200 stub.\n")

    if not run_control(base, broken_fetch):
        print("CONTROL FAILED — the harness cannot distinguish a working URL "
              "from a broken one.\nEvery other result in this run is void. "
              "Fix the harness or the network path first.\n")
        return 2

    board = Board()
    print("── CHECKS " + "─" * 66)

    check_readiness(base, board)
    listing = catalog(base)
    board.add(
        INFO,
        "public catalog size",
        f"{len(listing)} producer(s) served by GET /api/producers",
    )
    check_pages(base, board, listing[0].get("slug") if listing else None)
    check_sitemap(base, board)
    check_fixture_slugs(
        base, board,
        [s.strip() for s in args.slugs.split(",")] if args.slugs else seed_slugs(),
    )
    check_cloudinary_image(base, board, detail_producers(base, listing))
    check_sentry(board)

    print("\n" + "─" * 76)
    print(f"{len(board.rows)} lines · {board.failed} FAIL · {board.skipped} SKIP")
    if board.skipped:
        print("SKIP is not PASS — each one names what went unchecked and why.")
    print("PRODUCTION SMOKE FAILED" if board.failed else "production smoke clean")
    return 1 if board.failed else 0


if __name__ == "__main__":
    sys.exit(main())
