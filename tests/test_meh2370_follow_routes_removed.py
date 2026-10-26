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


def test_follow_routes_are_not_mounted():
    # The OpenAPI schema is built from the mounted routes. `app.routes` is not
    # used: included routers are not flattened into it on this FastAPI.
    mounted = {
        (method.upper(), path)
        for path, ops in app.openapi()["paths"].items()
        for method in ops
    }
    assert REMOVED & mounted == set()
    # Control: the route table is real, not empty.
    assert ("GET", "/producers/{producer_id}") in mounted
