"""MEH-1979 — rate limits on the previously-unprotected public endpoints.

These assert **behaviour**, never that a decorator is present. A test that
greps for `@limiter.limit` passes an inert change by construction (workflow
§3.6): the decorator can sit on the wrong function, carry the wrong key, or
ride a route nothing mounts, and the grep stays green through all of it. The
last of those is not hypothetical here — see `TestHomeProductsIsNotMounted`.

`tests/conftest.py:203` resets `limiter._storage` between tests (autouse), so
every case starts from an empty bucket.

Boundary cases run one endpoint per *distinct limit value among the mounted
routes*. Driving 121 requests × 11 endpoints buys no extra discrimination for
several times the runtime, so the remaining endpoints are covered by
`TestLimiterEngagesOnEveryMountedEndpoint`, which still proves the limiter
engages on each one.

Audit + per-endpoint rationale: MEH-1979 comment of 2026-08-09, as corrected
by this file (see the class docstring below).
"""

import uuid

import pytest

# Mounted public endpoints this ticket newly limited · budget per minute.
# Data, not prose: change a limit in a router and the matching case fails
# loudly instead of drifting.
MOUNTED = [
    ("/experiences", 120),
    ("/group-buys", 120),
    ("/events/upcoming", 120),
    ("/experiences/count", 60),
    ("/search/trending", 60),
    ("/categories", 60),
    ("/stats", 60),
]

# Needs a required query param; the value may be a miss — the limiter counts
# the request either way, which is the property under test.
REVIEWS = f"/reviews?producer_id={uuid.uuid4()}"
PRODUCER_REVIEWS = f"/producers/{uuid.uuid4()}/reviews"


def _statuses(client, path, n):
    return [client.get(path).status_code for _ in range(n)]


class TestBoundaryPerDistinctLimit:
    """N pass, N+1 is refused — the exact boundary, not merely "a 429 occurred"."""

    def test_60_per_minute_boundary(self, client):
        codes = _statuses(client, "/search/trending", 61)
        assert 429 not in codes[:60], "a request inside the budget was refused"
        assert codes[60] == 429, "the 61st request was not refused"

    def test_120_per_minute_boundary(self, client):
        codes = _statuses(client, "/group-buys", 121)
        assert 429 not in codes[:120], "a request inside the budget was refused"
        assert codes[120] == 429, "the 121st request was not refused"

    def test_limit_counts_misses_not_just_hits(self, client):
        """A limiter that only counted successful lookups would leave an
        enumeration loop unbounded — the guesser never hits. Drive a route
        whose id does not exist and require the refusal anyway.
        """
        codes = _statuses(client, PRODUCER_REVIEWS, 61)
        assert codes[60] == 429, "misses are not counted — enumeration stays unbounded"
        assert 429 not in codes[:60]

    def test_required_query_param_route_is_limited(self, client):
        codes = _statuses(client, REVIEWS, 61)
        assert codes[60] == 429
        assert 429 not in codes[:60]


class TestLimiterEngagesOnEveryMountedEndpoint:
    @pytest.mark.parametrize("path,budget", MOUNTED, ids=[p for p, _ in MOUNTED])
    def test_engages(self, client, path, budget):
        codes = _statuses(client, path, budget + 1)
        assert codes[budget] == 429, f"{path} never refused a request at budget+1"


class TestHomeProductsIsNotMounted:
    """The audit's own measurement error, pinned so it cannot recur.

    MEH-1979's inventory listed four `/home-products/*` routes as *public and
    unlimited*, including two flagged 🔴. They are neither: `home_products.router`
    is **deliberately not registered** (`app/router_registry.py:89`, brand LOCK
    under MEH-1406 — licensed businesses only). The audit script scanned router
    *files* and never asked the *app* what it serves, so an unmounted route was
    indistinguishable from an exposed one.

    The limiter decorators were still added to that router, deliberately: the
    registry comment spells out how to re-enable it, and a route that arrives
    pre-limited is the state we want if that ever happens. This test records
    that they are dormant, and fails the day the router is mounted without the
    exposure being re-reasoned.
    """

    @pytest.mark.parametrize(
        "path",
        [
            "/home-products",
            "/home-products/rate/sometoken",
            f"/home-products/{uuid.uuid4()}/ratings",
        ],
    )
    def test_routes_are_absent(self, client, path):
        assert client.get(path).status_code == 404, (
            "home_products is mounted — MEH-1406's brand LOCK was lifted. "
            "Re-check the MEH-1979 exposure table before deleting this test."
        )


class TestHealthMustStayUnlimited:
    """The green row of the audit table, defended.

    `railway.json:8` sets `healthcheckPath: /health`. Railway probes it
    frequently; a 429 there is a failed healthcheck, i.e. a **restart loop in
    production**. This test exists so a future "protect every public endpoint"
    sweep cannot quietly take the platform down — the naive reading of
    MEH-1979 would have done exactly that.
    """

    @pytest.mark.parametrize("path", ["/health", "/health/liveness", "/health/readiness"])
    def test_probe_endpoints_never_429(self, client, path):
        codes = _statuses(client, path, 150)
        assert 429 not in codes, (
            f"{path} is rate-limited — Railway's probe would fail and restart the service"
        )
