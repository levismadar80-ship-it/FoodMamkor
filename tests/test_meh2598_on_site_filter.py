"""MEH-2598 — `?on_site=true` («קנייה במקום») and its `sells_on_site` flag.

"Buy on site" = a physical store with stated opening hours: the primary
location's hours, else the legacy business-level field (resolveStoreHours in
frontend/lib/hours.js). It is a third PEER of the service group — OR-ed with
delivery and pickup, never AND-ed.

DISCRIMINATION: before MEH-2598 the router had no `on_site` param, so FastAPI
ignored it and every test below that seeds an excluded business returned the
whole feed; the flag did not exist, so the parity test KeyErrors. Every test
seeds at least one business that must be excluded, for the reason
test_meh2046_pickup_filter.py spells out (an inert filter otherwise passes).
"""

from app.models import ProducerLocation

from tests.conftest import make_producer

ON_SITE = {"on_site": "true"}
PICKUP = {"pickup_points": "true"}
DELIVERY = {"has_delivery": "true"}


def _names(resp):
    assert resp.status_code == 200, resp.text
    return sorted(p["name"] for p in resp.json())


def _store(db, name, **shape):
    hours = shape.get("hours", "א-ה 8:00-14:00")
    primary = shape.get("primary", True)
    physical = shape.get("physical", True)
    legacy = shape.get("legacy")
    producer = make_producer(db, name=name)
    producer.has_physical_location = physical
    if not physical:
        # DB CHECK: has_physical_location OR offers_delivery.
        producer.offers_delivery = True
        producer.delivery_nationwide = True
    producer.opening_hours = legacy
    db.add(
        ProducerLocation(
            producer_id=producer.id,
            kind="branch",
            is_primary=primary,
            city="חיפה",
            lat=32.79,
            lng=34.98,
            opening_hours=hours,
        )
    )
    db.commit()
    db.refresh(producer)
    return producer


def _seed_matrix(db):
    _store(db, "חנות עם שעות")
    _store(db, "חנות בלי שעות", hours=None)
    _store(db, "שעות רווח בלבד", hours="   ")
    _store(db, "שעות רק בסניף", primary=False)
    _store(db, "שעות ישנות בלבד", hours=None, legacy="ו 8-13")
    _store(db, "בלי חנות פיזית", physical=False)
    make_producer(db, name="משלוחים בלבד", delivery_cities=["עכו"])


def test_on_site_matches_stores_with_hours_only(client, db):
    _seed_matrix(db)
    assert _names(client.get("/producers", params=ON_SITE)) == sorted(
        ["חנות עם שעות", "שעות ישנות בלבד"]
    )


def test_on_site_is_or_ed_with_delivery(client, db):
    _seed_matrix(db)
    got = _names(client.get("/producers", params={**ON_SITE, **DELIVERY}))
    assert got == sorted(
        ["חנות עם שעות", "שעות ישנות בלבד", "משלוחים בלבד", "בלי חנות פיזית"]
    )


def test_sells_on_site_matches_filter_membership(client, db):
    """Anti-drift: the Python flag and the SQL predicate agree on every shape."""
    _seed_matrix(db)
    everything = client.get("/producers")
    assert len(everything.json()) == 7, "all seven shapes are in the unfiltered feed"
    on_site = set(_names(client.get("/producers", params=ON_SITE)))
    for row in everything.json():
        assert row["sells_on_site"] is (row["name"] in on_site), (
            f"{row['name']}: sells_on_site={row['sells_on_site']} but "
            f"{'in' if row['name'] in on_site else 'not in'} the on_site filter"
        )
    assert on_site, "the matrix is populated — the loop is not vacuous"


def test_control_pickup_alone_is_unchanged(client, db):
    """Control (passes before AND after): pickup without on_site is untouched."""
    _seed_matrix(db)
    assert _names(client.get("/producers", params=PICKUP)) == []
