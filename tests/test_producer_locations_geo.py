"""MEH-1402 (MEH-1388 chunk 2): backend geo over producer_locations.

Purpose:  Prove the multi-location geo rewire — MIN(haversine) across a
          producer's location rows, radius matches if ANY location is in
          range, sort by the per-producer nearest point, DISTINCT count
          (a 10-location producer is ONE business), and the scoped MEH-213
          reversal (delivery-only WITH a pickup/market_stand row becomes
          map-pinnable; a producer with no such row stays hidden).
Touches:  producer_locations + producers tables (read-only queries via
          build_producers_query); schema built by conftest create_all.
Does NOT: exercise the map UI (chunk 3) or delivery_areas logic (MEH-903).
Related:  backend/app/services/producer_queries.py (haversine_min_km),
          backend/app/services/producer_listing.py (_build_base_queries).
History:  MEH-1402 (creation).
"""

from app.models import ProducerLocation
from app.services.producer_listing import build_producers_query
from tests.conftest import make_producer

# Tel Aviv origin + a spread of points at known-ish distances from it.
ORIGIN = (32.0853, 34.7818)
NEAR = (32.0860, 34.7825)  # ~0.1 km
NEAR_2 = (32.0900, 34.7820)  # ~0.5 km
MID = (33.0000, 35.0000)  # ~104 km
FAR = (29.5500, 34.9500)  # ~281 km (Eilat)
RADIUS_KM = 25.0


def _add_location(db, producer, coords, *, kind="branch", is_primary=False):
    lat, lng = coords
    db.add(
        ProducerLocation(
            producer_id=producer.id,
            kind=kind,
            lat=lat,
            lng=lng,
            is_primary=is_primary,
        )
    )


def _geo(db, *, require_physical=False):
    lat, lng = ORIGIN
    return build_producers_query(
        db, lat=lat, lng=lng, radius_km=RADIUS_KM, require_physical=require_physical
    )


def _set_point(db, producer, coords):
    """Force the producer's own lat/lng mirror (make_producer defaults to TLV,
    which would mask the location-driven distance)."""
    producer.lat, producer.lng = coords if coords else (None, None)
    db.commit()


def test_ten_location_producer_counts_as_one_business(db):
    """The non-negotiable count guard: 10 location rows → ONE result, count==1."""
    p = make_producer(db, name="הלחם של גל")
    _set_point(db, p, FAR)  # own point far away — only a location is in range
    # 9 far locations + 1 near the origin, all in one city.
    for _ in range(9):
        _add_location(db, p, MID)
    _add_location(db, p, NEAR, is_primary=True)
    db.commit()

    results, total = _geo(db)

    assert total == 1, f"10-location producer must count once, got {total}"
    assert len(results) == 1
    assert results[0].id == p.id


def test_distance_is_nearest_location_not_primary_or_own_point(db):
    """Sort/distance uses MIN across locations (nearest point), not the primary
    row and not the far Producer.lat/lng mirror."""
    p = make_producer(db)
    _set_point(db, p, FAR)
    _add_location(db, p, MID, is_primary=True)  # primary is far
    _add_location(db, p, NEAR)  # a non-primary point is nearest
    db.commit()

    results, _ = _geo(db)

    assert len(results) == 1
    # NEAR is ~0.1 km; MID ~104 km; FAR ~281 km. Nearest wins.
    assert results[0].distance_km < 2.0


def test_two_producers_sharing_exact_coordinates_both_returned(db):
    """Distinct businesses at the same point are two results, count==2."""
    a = make_producer(db, name="עסק א")
    b = make_producer(db, name="עסק ב")
    _set_point(db, a, FAR)
    _set_point(db, b, FAR)
    _add_location(db, a, NEAR)
    _add_location(db, b, NEAR)  # identical coordinates
    db.commit()

    results, total = _geo(db)

    assert total == 2
    assert {r.id for r in results} == {a.id, b.id}


def test_location_with_lat_but_null_lng_is_excluded_no_crash(db):
    """A half-filled location (lat, NULL lng) is not a candidate point; a
    producer whose only geo signal is that broken row drops out cleanly."""
    p = make_producer(db)
    _set_point(db, p, None)  # no own point either
    db.add(ProducerLocation(producer_id=p.id, kind="pickup", lat=NEAR[0], lng=None))
    db.commit()

    results, total = _geo(db)  # must not raise

    assert total == 0
    assert p.id not in {r.id for r in results}


def test_radius_matches_if_any_location_in_range(db):
    """One far location + one near location → the producer matches (any-in-range)."""
    p = make_producer(db)
    _set_point(db, p, FAR)
    _add_location(db, p, MID)  # out of the 25 km radius
    _add_location(db, p, NEAR_2)  # in range
    db.commit()

    results, total = _geo(db)

    assert total == 1
    assert results[0].id == p.id
    assert results[0].distance_km < 2.0


def test_delivery_only_with_pickup_reappears_on_map(db):
    """Scoped MEH-213 reversal: has_physical_location=False + a pickup row →
    pinnable under require_physical=True. A delivery-only producer with NO
    location row stays hidden."""
    with_pickup = make_producer(db, name="delivery+pickup")
    with_pickup.has_physical_location = False
    with_pickup.offers_delivery = True
    _set_point(db, with_pickup, FAR)  # own point irrelevant — pin is the pickup
    _add_location(db, with_pickup, NEAR, kind="pickup")

    hidden = make_producer(db, name="delivery-only, no points")
    hidden.has_physical_location = False
    hidden.offers_delivery = True
    _set_point(db, hidden, NEAR)  # in range, but no location row → stays hidden
    db.commit()

    results, total = build_producers_query(
        db,
        lat=ORIGIN[0],
        lng=ORIGIN[1],
        radius_km=RADIUS_KM,
        require_physical=True,
    )
    ids = {r.id for r in results}

    assert with_pickup.id in ids, "delivery-only WITH a pickup row must be pinnable"
    assert hidden.id not in ids, "delivery-only with NO location row stays hidden"
    assert total == 1


def test_physical_producer_still_pinnable_via_backfilled_point(db):
    """A normal physical producer with only its Producer.lat/lng (no location
    row yet — Expand overlap) still appears via the COALESCE fallback."""
    p = make_producer(db)  # has_physical_location defaults True
    _set_point(db, p, NEAR)  # own point in range, zero location rows
    db.commit()

    results, total = _geo(db, require_physical=True)

    assert total == 1
    assert results[0].id == p.id
