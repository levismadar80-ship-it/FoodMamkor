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
    # Six the ORIGINAL file-walking audit never saw. The app-introspecting
    # inventory (scripts/audit_public_endpoints.py) found them: list and
    # detail reads that were public and unlimited the whole time.
    ("/events", 120),
    (f"/events/{uuid.uuid4()}", 120),
    (f"/experiences/{uuid.uuid4()}", 120),
    (f"/group-buys/{uuid.uuid4()}", 120),
    ("/producers/no-such-slug/recipes", 120),
    (f"/producers/no-such-slug/recipes/{uuid.uuid4()}", 120),
]

# The only public endpoints allowed to answer without a limit. Each is a
# reasoned decision, not an omission — see TestNoNewUnlimitedPublicEndpoint.
DELIBERATELY_UNLIMITED = {
    ("GET", "/"),
    ("GET", "/health"),
    ("GET", "/health/liveness"),
    ("GET", "/health/readiness"),
    ("GET", "/push-vapid-key"),
}

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


class TestWhatsAppWebhookIsLimited:
    """`/webhook/whatsapp` — both verbs, and neither was covered until the CI
    reviewer said so on PR #2752.

    `MOUNTED` above is GET-only (`_statuses` calls `client.get`), so the POST
    route had **no test at all** and the GET route was simply missing from the
    list. Deleting either decorator would have left the whole file green —
    which is the exact "a green with no discrimination" failure this file's
    own docstring lectures about. Recorded rather than quietly patched.

    Both verbs answer **403** unauthenticated (no `WHATSAPP_VERIFY_TOKEN`, no
    `X-Hub-Signature-256`). That is the point: the limiter must count rejected
    calls, or an attacker who never passes verification is unbounded.
    """

    def test_get_handshake_is_limited(self, client):
        codes = _statuses(client, "/webhook/whatsapp", 61)
        assert set(codes[:60]) == {403}, "expected unauthenticated rejections"
        assert codes[60] == 429, "the GET handshake is not rate-limited"

    def test_post_callback_is_limited(self, client):
        codes = [client.post("/webhook/whatsapp", json={}).status_code for _ in range(121)]
        assert set(codes[:120]) == {403}, "expected unauthenticated rejections"
        assert codes[120] == 429, "the POST callback is not rate-limited"


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

    _LIFTED = (
        "home_products is mounted — MEH-1406's brand LOCK was lifted. "
        "Re-check the MEH-1979 exposure table before deleting this test."
    )

    @pytest.mark.parametrize(
        "path",
        [
            "/home-products",
            "/home-products/rate/sometoken",
            f"/home-products/{uuid.uuid4()}/ratings",
        ],
    )
    def test_get_routes_are_absent(self, client, path):
        assert client.get(path).status_code == 404, self._LIFTED

    @pytest.mark.parametrize(
        "path",
        [
            "/home-products/rate/sometoken",
            "/home-products/validate",
            "/home-products",
            f"/home-products/{uuid.uuid4()}/whatsapp-click",
        ],
    )
    def test_post_routes_are_absent(self, client, path):
        """The GET sweep alone is not enough, and the gap is the exact threat
        this class describes.

        The two 🔴 rows the audit flagged were **writes**. If the router were
        ever partially re-registered — GET routes only, under a narrower
        MEH-1406 re-scope — the GET assertion above would still pass while the
        POST limiter decorators sat dormant on newly-live write routes. Then
        this class would be reporting "dormant" about the half that mattered
        least. Asserting the methods separately is what makes the guard match
        its own docstring. (Raised by the CI reviewer on PR #2752.)
        """
        assert client.post(path, json={}).status_code == 404, self._LIFTED


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


class TestNoNewUnlimitedPublicEndpoint:
    """The durable half of MEH-1979 — a ratchet, not a snapshot.

    Every check above tests endpoints someone remembered to list. This one
    asks the **app** what it currently exposes and requires that the set of
    public-and-unlimited routes has not grown. A new public endpoint added
    next month without a limit reds here, with no one having to remember this
    ticket existed.

    It reads the mounted routes, never the router files. That distinction is
    the whole lesson of this ticket: the original audit's file-walking script
    invented four endpoints that are not served (`home_products`, unregistered
    under MEH-1406) **and missed six that are** — `/events`, `/events/{id}`,
    `/experiences/{id}`, `/group-buys/{id}` and the two public recipe reads.
    Wrong in both directions, which is what a source scan buys you.
    """

    def test_unlimited_public_set_has_not_grown(self):
        import sys
        from pathlib import Path

        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
        from audit_public_endpoints import inventory  # noqa: PLC0415

        exposed = {
            (r["method"], r["path"])
            for r in inventory()
            if r["public"] and not r["limited"]
        }
        new = exposed - DELIBERATELY_UNLIMITED
        assert not new, (
            "public endpoint(s) with no rate limit: "
            + ", ".join(f"{m} {p}" for m, p in sorted(new))
            + " — add a limit, or add to DELIBERATELY_UNLIMITED with the reason."
        )
        # And the converse: if a deliberate green quietly gained a limit, the
        # decision was reversed without anyone re-reading why. /health gaining
        # one is a production restart loop.
        gone = DELIBERATELY_UNLIMITED - exposed
        assert not gone, (
            "these were deliberately unlimited and no longer are: "
            + ", ".join(f"{m} {p}" for m, p in sorted(gone))
        )
