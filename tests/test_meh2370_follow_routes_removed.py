"""MEH-2370: the follow endpoints are gone.

MEH-1363 removed the follow button and MEH-1364 moved the follower count onto
`favorites`, so nothing in the product called these routes; they only widened
the authenticated write surface. The `producer_followers` table is untouched
(its drop is a separate Expand-Contract step).

DISCRIMINATION: on the old code all four (method, path) pairs are mounted,
so the assertion lists them and goes red.
"""

from app.main import app

REMOVED = {
    ("POST", "/producers/{producer_id}/follow"),
    ("DELETE", "/producers/{producer_id}/follow"),
    ("GET", "/producers/{producer_id}/follow-status"),
    ("GET", "/users/me/following"),
}


def _mounted_routes(routes, out):
    """Every (METHOD, path) the app can serve, including routes hidden from the
    schema with include_in_schema=False. On this FastAPI an included router
    shows up in `app.routes` as an `_IncludedRouter` wrapper whose real routes
    live on `.original_router`, so the walk follows that."""
    for r in routes:
        inner = getattr(r, "original_router", None)
        if inner is not None:
            _mounted_routes(inner.routes, out)
            continue
        path, methods = getattr(r, "path", None), getattr(r, "methods", None)
        if path and methods:
            out.update((m.upper(), path) for m in methods)
    return out


def test_follow_routes_are_not_mounted():
    mounted = _mounted_routes(app.routes, set())
    assert REMOVED & mounted == set()
    # Controls: the walk reached the included routers, and a known route is
    # there, so an empty intersection above is not an empty route table.
    assert ("GET", "/producers/{producer_id}") in mounted
    assert len(mounted) > 100


def test_follow_routes_are_not_in_the_schema():
    # The published contract (openapi.json / lib/generated) is built from this.
    in_schema = {
        (method.upper(), path)
        for path, ops in app.openapi()["paths"].items()
        for method in ops
    }
    assert REMOVED & in_schema == set()
    assert ("GET", "/producers/{producer_id}") in in_schema
