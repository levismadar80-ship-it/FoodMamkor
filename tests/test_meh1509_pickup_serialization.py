"""MEH-1509 (MEH-1388, chunk-1 backend): ProducerLocationOut serializes
opening_hours + phone on the public detail payload.

Purpose:  Prove the two chunk-1 fields reach the wire on GET
          /producers/by-slug/{slug} for a pickup location, and that the
          street `address` stays OFF the public shape (MEH-829).
Touches:  producer_locations + producers tables (read-only via the detail
          route); schema built by conftest create_all.
Does NOT: exercise the frontend render (DeliveryBlock — chunk 2) or the map
          surfaces (chunk 3). Serialization contract only.
Related:  backend/app/schemas/schemas.py (ProducerLocationOut),
          backend/app/routers/producers.py (get_producer_by_slug),
          backend/app/models/models.py (ProducerLocation).
History:  MEH-1509 (creation).
"""

from app.models import ProducerLocation
from tests.conftest import make_producer


def _seed_pickup_producer(db, slug="pickup-hours-slug"):
    producer = make_producer(db, name="חוות האיסוף")
    producer.slug = slug
    db.add(
        ProducerLocation(
            producer_id=producer.id,
            kind="pickup",
            label="נקודת איסוף מרכזית",
            city="חיפה",
            address="רחוב הרצל 10",  # must NOT leak to the public payload
            lat=32.7940,
            lng=34.9896,
            opening_hours="ראשון-חמישי 09:00-18:00",
            phone="050-1234567",
            is_primary=False,
        )
    )
    db.commit()
    return producer, slug


def _pickup_row(payload):
    locs = payload["locations"]
    assert isinstance(locs, list) and len(locs) == 1, f"expected 1 location, got {locs}"
    return locs[0]


def test_by_slug_serializes_pickup_opening_hours(client, db):
    _producer, slug = _seed_pickup_producer(db)

    res = client.get(f"/producers/by-slug/{slug}")
    assert res.status_code == 200, res.text

    row = _pickup_row(res.json())
    assert row["kind"] == "pickup"
    assert row["opening_hours"] == "ראשון-חמישי 09:00-18:00"


def test_by_slug_serializes_pickup_phone(client, db):
    _producer, slug = _seed_pickup_producer(db)

    res = client.get(f"/producers/by-slug/{slug}")
    assert res.status_code == 200, res.text

    row = _pickup_row(res.json())
    assert row["phone"] == "050-1234567"


def test_by_slug_never_leaks_pickup_street_address(client, db):
    """MEH-829 LOCK: the exact street address stays admin/owner-only. The public
    detail payload must not carry an `address` key on any location row, even
    though the ORM row has one."""
    _producer, slug = _seed_pickup_producer(db)

    res = client.get(f"/producers/by-slug/{slug}")
    assert res.status_code == 200, res.text

    row = _pickup_row(res.json())
    assert "address" not in row, f"street address leaked to public payload: {row}"
