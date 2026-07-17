"""
MEH-1242 PR5 — owner permission-surface extension via PUT /producers/me.

Verifies the newly whitelisted fields (opening_hours + location mode:
has_physical_location / offers_delivery / delivery_nationwide) now PERSIST on
the owner path, and that the existing ProducerUpdate._validate_location_mode
invariants still fire there:
  - clearing BOTH location booleans -> 422
  - delivery_nationwide + specific cities -> 422 (XOR)

delivery_area_cities was already owner-processed (popped + _apply_delivery_cities);
included here to confirm the combined payload round-trips.

REUSES: tests/test_availability_validation.py:122 (_producer_user owner-wiring
pattern — make_producer + make_user(role="producer") + user.producer_id link).
"""
from tests.conftest import auth_header, make_producer, make_user


def _producer_user(db):
    producer = make_producer(db, name="חוות שעות ומשלוחים")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def test_owner_put_persists_opening_hours_and_location_mode(client, db):
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={
            "opening_hours": "א'-ה' 9:00-17:00",
            "has_physical_location": True,
            "offers_delivery": True,
            "delivery_nationwide": False,
            "delivery_area_cities": ["חיפה", "עכו"],
        },
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.opening_hours == "א'-ה' 9:00-17:00"
    assert producer.has_physical_location is True
    assert producer.offers_delivery is True
    assert producer.delivery_nationwide is False
    assert {da.city for da in producer.delivery_areas} == {"חיפה", "עכו"}


def test_owner_put_delivery_nationwide_persists(client, db):
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={
            "has_physical_location": False,
            "offers_delivery": True,
            "delivery_nationwide": True,
            "delivery_area_cities": [],
        },
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.has_physical_location is False
    assert producer.offers_delivery is True
    assert producer.delivery_nationwide is True


def test_owner_put_clearing_both_location_booleans_returns_422(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"has_physical_location": False, "offers_delivery": False},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_owner_put_nationwide_with_specific_cities_returns_422(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={
            "offers_delivery": True,
            "delivery_nationwide": True,
            "delivery_area_cities": ["חיפה"],
        },
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text
