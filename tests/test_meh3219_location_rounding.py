"""MEH-3219 (B17) — the server never uses a visitor's exact point.

The frontend rounds before it sends (lib/user-location.js roundCoord); these
tests pin the server half, so a client that skips it — an old tab, a script —
still has its point cut to 2 decimals (~1 km) before any query sees it.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.routers import producers as producers_router
from app.routers import rescue as rescue_router
from app.utils.pii import round_coord
from tests.test_rescue import _seed_offer, rescue_on, shop  # noqa: F401 — fixtures


@pytest.mark.parametrize(
    ("raw", "rounded"),
    [(32.085312, 32.09), (34.781799, 34.78), (-0.004, -0.0), (None, None)],
)
def test_round_coord(raw, rounded):
    assert round_coord(raw) == rounded


def test_producer_list_queries_with_the_rounded_point(client, monkeypatch):
    seen: dict[str, Any] = {}
    real = producers_router.build_producers_query

    def spy(db, **kwargs):
        seen.update(lat=kwargs.get("lat"), lng=kwargs.get("lng"))
        return real(db, **kwargs)

    monkeypatch.setattr(producers_router, "build_producers_query", spy)
    r = client.get("/producers", params={"lat": 32.085312, "lng": 34.781799})
    assert r.status_code == 200
    assert seen == {"lat": 32.09, "lng": 34.78}


def test_rescue_offers_measure_from_the_rounded_point(
    client,
    db,
    shop,  # noqa: F811 — pytest fixture
    rescue_on,  # noqa: F811 — pytest fixture
    monkeypatch,
):
    location = shop["location"]
    _seed_offer(db, location)
    seen: list[tuple[float, float]] = []
    real = rescue_router._haversine_km

    def spy(lat1, lng1, lat2, lng2):
        seen.append((lat1, lng1))
        return real(lat1, lng1, lat2, lng2)

    monkeypatch.setattr(rescue_router, "_haversine_km", spy)
    r = client.get("/rescue/offers", params={"lat": 32.085312, "lng": 34.781799})
    assert r.status_code == 200
    assert seen, "the offer was not measured — the test proves nothing"
    assert set(seen) == {(32.09, 34.78)}
