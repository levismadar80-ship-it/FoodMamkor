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

from app.routers.producers import _PUBLIC_CATALOG_CACHE
from tests.conftest import auth_header, make_category, make_producer, make_user

EXPECTED = "public, s-maxage=60, stale-while-revalidate=300"


def test_policy_constant_is_the_locked_string():
    """The routers share one constant; pin its value so a silent edit fails."""
    assert _PUBLIC_CATALOG_CACHE == EXPECTED


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
