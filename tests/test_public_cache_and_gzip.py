"""MEH-1833 — edge-cache headers + GZip on the public catalog GETs.

Three things are asserted here, and the third is the one that matters:

1. ``GET /producers`` and ``GET /categories`` carry the public CDN policy.
2. A large ``/producers`` payload comes back gzip-encoded.
3. An **authed** endpoint does NOT carry it.

(3) is the control. Without it, (1) passes just as happily if someone later
moves the header into a middleware that stamps every response — including
per-user ones — which is precisely the bug the ``public`` directive would
turn into a cross-user cache leak at the CDN. A test that only checks the
two happy paths cannot tell the correct implementation from that one.

`pip` is blocked in the CC sandbox, so this file was authored without a local
run; the required ``Backend tests (pytest)`` CI gate is its first execution.
That gate does run for this PR — the diff touches ``backend/``, so the
paths-filter does not skip it.
"""

import re
from pathlib import Path

from app.routers.producers import _PUBLIC_CATALOG_CACHE
from tests.conftest import auth_header, make_category, make_producer, make_user

EXPECTED = "public, s-maxage=30, stale-while-revalidate=30"

# MEH-1876: the bound the two stacked layers must respect together.
MAX_CUMULATIVE_STALENESS_SECONDS = 90


def test_policy_constant_is_the_locked_string():
    """The routers share one constant; pin its value so a silent edit fails."""
    assert _PUBLIC_CATALOG_CACHE == EXPECTED


def test_stacked_cache_window_stays_within_the_documented_bound():
    """MEH-1876 — the CROSS-LAYER assertion. This is the one that matters.

    Every other test in this file checks one layer in isolation, which is
    exactly how the original bug shipped: `s-maxage=60, swr=300` was defensible
    on its own line, and `revalidate: 60` was defensible on its own line, and
    nothing anywhere read them together. Measured consequence on staging
    (03/08): a removed offer stayed publicly visible for ~6 minutes.

    Next serves its cached copy for `revalidate`, and each refetch may itself be
    handed a response the edge has already held for `s-maxage + swr`. So the
    worst case a reader experiences is the SUM, and that sum is what this pins.

    Deliberately reads the real frontend file rather than restating its number
    (MEH-1909: a fixture-only guard proves the probe works on shapes you
    invented). If someone raises either side alone, this goes red.
    """
    page = (
        Path(__file__).resolve().parents[1]
        / "frontend"
        / "app"
        / "[locale]"
        / "producers"
        / "page.jsx"
    )
    source = page.read_text(encoding="utf-8")

    match = re.search(r"const CATALOG_REVALIDATE_SECONDS = (\d+)", source)
    assert match, (
        "CATALOG_REVALIDATE_SECONDS not found in producers/page.jsx — if it was "
        "renamed or inlined back to a literal, this cross-layer guard silently "
        "stops guarding. Update the pattern, do not delete the assertion."
    )
    next_revalidate = int(match.group(1))

    # Assert each match before .group(1): an absent token would otherwise raise
    # AttributeError on None instead of saying which directive went missing.
    # test_policy_constant_is_the_locked_string would normally catch a format
    # change first, but pytest ordering is not guaranteed under -k or
    # randomisation, so this test states its own precondition.
    s_maxage_m = re.search(r"s-maxage=(\d+)", _PUBLIC_CATALOG_CACHE)
    assert s_maxage_m, (
        f"s-maxage token absent from _PUBLIC_CATALOG_CACHE ({_PUBLIC_CATALOG_CACHE!r}) "
        "— the cumulative-window bound cannot be computed without it."
    )
    swr_m = re.search(r"stale-while-revalidate=(\d+)", _PUBLIC_CATALOG_CACHE)
    assert swr_m, (
        "stale-while-revalidate token absent from _PUBLIC_CATALOG_CACHE "
        f"({_PUBLIC_CATALOG_CACHE!r}) — the cumulative-window bound cannot be "
        "computed without it."
    )

    s_maxage = int(s_maxage_m.group(1))
    swr = int(swr_m.group(1))

    cumulative = next_revalidate + s_maxage + swr
    assert cumulative <= MAX_CUMULATIVE_STALENESS_SECONDS, (
        f"stacked cache window is {cumulative}s "
        f"(Next revalidate {next_revalidate} + s-maxage {s_maxage} + swr {swr}), "
        f"over the {MAX_CUMULATIVE_STALENESS_SECONDS}s bound. A removed offer "
        f"stays publicly visible for that long — see MEH-1876."
    )


def test_producers_listing_carries_public_cache_header(client, db):
    make_producer(db)
    db.commit()

    res = client.get("/producers")

    assert res.status_code == 200
    assert res.headers["cache-control"] == EXPECTED


def test_categories_listing_carries_public_cache_header(client, db):
    make_category(db)
    db.commit()

    res = client.get("/categories")

    assert res.status_code == 200
    assert res.headers["cache-control"] == EXPECTED


def test_authed_endpoint_does_not_carry_the_public_cache_header(client, db):
    """CONTROL — `public` on a per-user response is a cross-user cache leak.

    This is the assertion that discriminates: it fails if the header is ever
    applied broadly (middleware, dependency, decorator) instead of on the two
    enumerated public catalog routes.
    """
    user = make_user(db)
    db.commit()

    res = client.get("/auth/me", headers=auth_header(user))

    assert res.status_code == 200
    assert "public" not in res.headers.get("cache-control", "")


def test_large_producers_response_is_gzipped(client, db):
    """GZipMiddleware compresses a payload above its 1024-byte floor.

    The `Content-Encoding` header is the assertion, not the byte content:
    httpx (which TestClient wraps) transparently inflates a gzip body, so
    `res.content` is already decoded by the time a test can look at it. The
    JSON check below therefore proves the round trip survived compression,
    it does not re-prove the encoding.
    """
    for i in range(25):
        make_producer(db, name=f"יצרן בדיקה מספר {i} עם שם ארוך במיוחד לניפוח התגובה")
    db.commit()

    res = client.get("/producers", headers={"Accept-Encoding": "gzip"})

    assert res.status_code == 200
    assert res.headers.get("content-encoding") == "gzip"
    assert isinstance(res.json(), list)


def test_small_response_is_not_gzipped(client, db):
    """Below `minimum_size` GZip must stay out of the way (the other control).

    Pairs with the test above: together they show the middleware is size-gated
    rather than either always-on or absent.
    """
    res = client.get("/producers/count", headers={"Accept-Encoding": "gzip"})

    assert res.status_code == 200
    assert res.headers.get("content-encoding") != "gzip"
