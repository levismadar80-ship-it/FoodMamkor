"""
MEH-1483 — GET /producers ?sort= axis.

Locks the backend contract the new /producers sort select drives:

  * ?sort=rating  → avg_rating DESC, NULLs LAST, tiebreak reviews_count DESC,
                    then created_at DESC.
  * no sort / ?sort=newest → created_at DESC (default, unchanged).
  * an unknown ?sort value → 422 (the router's manual-422 pattern), never a
    silent fallback.

Note on NULLs: `Producer.avg_rating` defaults to 0 and `ProducerListOut`
serializes it as a required float, so a NULL rating can never round-trip
through the API — an "unrated" producer has rating 0, which the DESC order
already puts last. The explicit NULLs-last order key is therefore defensive;
it is exercised directly at the service layer (`TestNullsLastAtServiceLayer`)
where the raw ORM rows bypass response serialization.

Only the non-geo listing path is exercised — geo results always order by
distance and ignore the sort axis (producer_listing.py:_build_base_queries).

MEH-1829 — ?sort=distance (TestSortDistance):

  * ?sort=distance&lat&lng → nearest-location Haversine ASC (MEH-1402
    `haversine_min_km`), a producer with NO location row sorts LAST — it is
    never dropped, because this is a sort and not the geo radius filter.
  * X-Total-Count is the same number under sort=distance and sort=newest —
    the numeric "sorting hides nothing" assertion.
  * ?sort=distance without lat/lng → 422 (Hebrew detail).
  * lat/lng WITHOUT ?sort= do not change the default order (no radius_km
    → not geo mode; no sort → created_at DESC, byte-identical).
"""

from __future__ import annotations

from datetime import datetime, timedelta

from app.models import ProducerLocation
from app.services.producer_listing import build_producers_query
from tests.conftest import make_producer

BASE = datetime(2026, 1, 1, 12, 0, 0)

# MEH-1829 — Tel Aviv origin + three points at known distances from it
# (same coordinates as tests/test_producer_locations_geo.py).
ORIGIN = {"lat": 32.0853, "lng": 34.7818}
NEAR = (32.0860, 34.7825)  # ~0.1 km
MID = (33.0000, 35.0000)  # ~104 km
FAR = (29.5500, 34.9500)  # ~281 km (Eilat) — far outside any /map radius


def _add_location(db, producer, coords, *, kind="branch"):
    """MEH-1829: `make_producer` writes the legacy Producer.lat/lng mirror but
    NO producer_locations row, and `haversine_min_km` reads ONLY the rows
    (MEH-1938 chunk 5a) — so a producer gets a distance only through this."""
    lat, lng = coords
    db.add(ProducerLocation(producer_id=producer.id, kind=kind, lat=lat, lng=lng))
    db.commit()


def _set(db, producer, *, avg_rating, reviews_count, created_at):
    producer.avg_rating = avg_rating
    producer.reviews_count = reviews_count
    producer.created_at = created_at
    db.commit()
    db.refresh(producer)


def _names(resp):
    return [row["name"] for row in resp.json()]


class TestSortRating:
    def test_rating_desc_unrated_last(self, client, db):
        top = make_producer(db, name="Top")
        mid = make_producer(db, name="Mid")
        unrated = make_producer(db, name="Unrated")
        _set(db, top, avg_rating=5.0, reviews_count=1, created_at=BASE)
        _set(db, mid, avg_rating=4.5, reviews_count=100, created_at=BASE)
        # rating 0 is the real "unrated" state (column default) — sorts LAST
        # under DESC despite the highest review count.
        _set(db, unrated, avg_rating=0.0, reviews_count=999, created_at=BASE)

        resp = client.get("/producers", params={"sort": "rating"})
        assert resp.status_code == 200
        assert _names(resp) == ["Top", "Mid", "Unrated"]

    def test_tiebreak_reviews_then_created_at(self, client, db):
        # All three share avg_rating 4.0 → the tiebreaks decide the order:
        # reviews_count DESC first, then created_at DESC.
        many = make_producer(db, name="ManyReviews")
        new = make_producer(db, name="FewNew")
        old = make_producer(db, name="FewOld")
        _set(db, many, avg_rating=4.0, reviews_count=50, created_at=BASE - timedelta(days=5))
        _set(db, new, avg_rating=4.0, reviews_count=5, created_at=BASE)
        _set(db, old, avg_rating=4.0, reviews_count=5, created_at=BASE - timedelta(days=10))

        resp = client.get("/producers", params={"sort": "rating"})
        assert resp.status_code == 200
        # ManyReviews (reviews 50) first; then the reviews=5 pair broken by
        # created_at DESC → FewNew before FewOld.
        assert _names(resp) == ["ManyReviews", "FewNew", "FewOld"]


class TestNullsLastAtServiceLayer:
    def test_null_rating_sorts_after_zero_and_positive(self, db):
        rated = make_producer(db, name="Rated")
        zero = make_producer(db, name="Zero")
        nullish = make_producer(db, name="Null")
        _set(db, rated, avg_rating=4.0, reviews_count=10, created_at=BASE)
        _set(db, zero, avg_rating=0.0, reviews_count=10, created_at=BASE)
        # A raw NULL rating — only reachable via a direct DB write, never the API.
        _set(db, nullish, avg_rating=None, reviews_count=10, created_at=BASE)

        results, _ = build_producers_query(db, sort="rating")
        names = [p.name for p in results]
        # 4.0 first, then 0.0, then NULL LAST (the defensive `is_(None)` key).
        assert names == ["Rated", "Zero", "Null"]


class TestSortDefault:
    def test_default_and_newest_are_created_at_desc(self, client, db):
        first = make_producer(db, name="First")
        second = make_producer(db, name="Second")
        third = make_producer(db, name="Third")
        # Deliberately give the OLDEST row the highest rating so a default sort
        # can't accidentally look rating-ordered.
        _set(db, first, avg_rating=5.0, reviews_count=9, created_at=BASE - timedelta(days=2))
        _set(db, second, avg_rating=1.0, reviews_count=1, created_at=BASE - timedelta(days=1))
        _set(db, third, avg_rating=1.0, reviews_count=1, created_at=BASE)

        default = client.get("/producers")
        newest = client.get("/producers", params={"sort": "newest"})
        assert default.status_code == 200
        assert newest.status_code == 200
        # created_at DESC → Third (newest), Second, First (oldest).
        assert _names(default) == ["Third", "Second", "First"]
        assert _names(newest) == _names(default)


class TestSortValidation:
    def test_unknown_sort_value_is_422(self, client, db):
        make_producer(db, name="Whatever")
        resp = client.get("/producers", params={"sort": "bogus"})
        assert resp.status_code == 422


class TestSortDistance:
    """MEH-1829 — ?sort=distance orders, never filters."""

    def test_orders_by_nearest_location_asc_and_attaches_distance_km(self, client, db):
        # Created FAR → NEAR so the default (created_at DESC) order is the
        # REVERSE of the distance order — a distance-sorted result cannot pass
        # by accident of insertion order.
        far = make_producer(db, name="Far")
        mid = make_producer(db, name="Mid")
        near = make_producer(db, name="Near")
        _set(db, far, avg_rating=5.0, reviews_count=9, created_at=BASE - timedelta(days=2))
        _set(db, mid, avg_rating=1.0, reviews_count=1, created_at=BASE - timedelta(days=1))
        _set(db, near, avg_rating=1.0, reviews_count=1, created_at=BASE)
        _add_location(db, far, FAR)
        _add_location(db, mid, MID)
        _add_location(db, near, NEAR)

        resp = client.get("/producers", params={"sort": "distance", **ORIGIN})
        assert resp.status_code == 200
        assert _names(resp) == ["Near", "Mid", "Far"]
        # distance_km rides on each row (ProducerListOut already carries it)
        # and is strictly ascending — the order is the distance, not a proxy.
        distances = [row["distance_km"] for row in resp.json()]
        assert distances == sorted(distances)
        assert distances[0] < 1.0
        assert distances[-1] > 200.0
        # No radius filter: the Eilat producer (~281 km) is still in the page.
        assert len(resp.json()) == 3

    def test_nearest_of_several_locations_wins(self, client, db):
        # A business with a far primary branch AND a near pickup point sorts by
        # the pickup point — MIN over its rows, the MEH-1402 expression — so it
        # beats a single-location business sitting at MID.
        multi = make_producer(db, name="Multi")
        single = make_producer(db, name="Single")
        _add_location(db, multi, FAR)
        _add_location(db, multi, NEAR, kind="pickup")
        _add_location(db, single, MID)

        resp = client.get("/producers", params={"sort": "distance", **ORIGIN})
        assert resp.status_code == 200
        assert _names(resp) == ["Multi", "Single"]
        # One row per business, not one per location.
        assert len(resp.json()) == 2

    def test_null_coords_sort_last_and_are_not_hidden(self, client, db):
        # NoCoords is the NEWEST row, so under the default sort it would come
        # first; under distance it must be LAST — and present, with a null
        # distance, never dropped.
        located = make_producer(db, name="Located")
        no_coords = make_producer(db, name="NoCoords")
        _set(db, located, avg_rating=1.0, reviews_count=1, created_at=BASE - timedelta(days=1))
        _set(db, no_coords, avg_rating=1.0, reviews_count=1, created_at=BASE)
        _add_location(db, located, MID)

        resp = client.get("/producers", params={"sort": "distance", **ORIGIN})
        assert resp.status_code == 200
        assert _names(resp) == ["Located", "NoCoords"]
        rows = resp.json()
        assert rows[0]["distance_km"] is not None
        assert rows[1]["distance_km"] is None

    def test_total_count_equals_newest_total(self, client, db):
        # Three approved producers (one coordinate-less) plus one PENDING, so
        # the count is neither "everything in the table" nor "rows with a
        # distance". Both headers must read exactly 3 — the numeric assertion
        # that sorting hides nothing.
        near = make_producer(db, name="Near")
        far = make_producer(db, name="Far")
        make_producer(db, name="NoCoords")
        make_producer(db, name="Pending", status="pending")
        _add_location(db, near, NEAR)
        _add_location(db, far, FAR)

        newest = client.get("/producers", params={"sort": "newest"})
        distance = client.get("/producers", params={"sort": "distance", **ORIGIN})
        assert newest.status_code == 200
        assert distance.status_code == 200
        assert newest.headers["X-Total-Count"] == "3"
        assert distance.headers["X-Total-Count"] == newest.headers["X-Total-Count"]
        # The page agrees with the header on both axes.
        assert len(distance.json()) == 3
        assert sorted(_names(distance)) == sorted(_names(newest))

    def test_distance_without_coords_is_422(self, client, db):
        make_producer(db, name="Whatever")
        missing_both = client.get("/producers", params={"sort": "distance"})
        missing_lng = client.get("/producers", params={"sort": "distance", "lat": ORIGIN["lat"]})
        assert missing_both.status_code == 422
        assert missing_lng.status_code == 422
        # Hebrew detail (routers/CLAUDE.md) that names the axis, not a generic
        # pydantic error — the router's manual-422 pattern.
        assert "מרחק" in missing_both.json()["detail"]

    def test_coords_without_sort_keep_the_default_order(self, client, db):
        # lat/lng alone (no radius_km, no sort) is NOT geo mode and NOT a
        # distance sort: the default created_at DESC must hold — Far is the
        # newest row and stays first even though it is 281 km away.
        near = make_producer(db, name="Near")
        far = make_producer(db, name="Far")
        _set(db, near, avg_rating=1.0, reviews_count=1, created_at=BASE - timedelta(days=1))
        _set(db, far, avg_rating=1.0, reviews_count=1, created_at=BASE)
        _add_location(db, near, NEAR)
        _add_location(db, far, FAR)

        resp = client.get("/producers", params=ORIGIN)
        assert resp.status_code == 200
        assert _names(resp) == ["Far", "Near"]
        # And the service-level contract: no distance is attached off-axis.
        results, _ = build_producers_query(db, lat=ORIGIN["lat"], lng=ORIGIN["lng"])
        assert [p.name for p in results] == ["Far", "Near"]
