"""MEH-2447 — the owner answers «איסוף או ביקור בתיאום מראש» herself.

`producers.by_arrangement` is written by registration, the owner PUT and the
admin create, and is read only together with has_physical_location. The
filter side (no «קנייה במקום» for it) is in test_meh2598_on_site_filter.py.

DISCRIMINATION: before MEH-2447 none of the three write paths knew the field —
Pydantic dropped it, so every "stored True" assertion below read False, and
the contradictory payload (by_arrangement without a place) was accepted.
Every guard case sends a schema-valid body apart from the field under test.
"""

import uuid

from app.models import Producer
from tests.conftest import (
    auth_header,
    make_producer,
    make_user,
    valid_producer_register_payload,
)


def _owner(db):
    producer = make_producer(db, name="משק בתיאום")
    user = make_user(db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com")
    user.producer_id = producer.id
    user.is_producer = True
    db.commit()
    db.refresh(user)
    return producer, user


def _stored(db, producer_id):
    db.expire_all()
    return db.get(Producer, producer_id).by_arrangement


def test_owner_put_stores_by_arrangement_and_serves_it(client, db):
    producer, user = _owner(db)
    resp = client.put(
        "/producers/me",
        json={"has_physical_location": True, "by_arrangement": True},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["by_arrangement"] is True
    assert _stored(db, producer.id) is True
    # And back: unticking it is a real write too.
    resp = client.put("/producers/me", json={"by_arrangement": False}, headers=auth_header(user))
    assert resp.status_code == 200, resp.text
    assert _stored(db, producer.id) is False


def test_owner_put_rejects_arrangement_without_a_place(client, db):
    producer, user = _owner(db)
    resp = client.put(
        "/producers/me",
        json={
            "has_physical_location": False,
            "offers_delivery": True,
            "delivery_nationwide": True,
            "by_arrangement": True,
        },
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text
    assert _stored(db, producer.id) is False


def test_turning_the_place_off_alone_does_not_500(client, db):
    """No CHECK on purpose: a stale True under has_physical_location=False is
    harmless because every reader ANDs the two."""
    producer, user = _owner(db)
    producer.by_arrangement = True
    db.commit()
    resp = client.put(
        "/producers/me",
        json={"has_physical_location": False, "offers_delivery": True, "delivery_nationwide": True},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text


def test_registration_stores_by_arrangement(client, db):
    email = f"r{uuid.uuid4().hex[:8]}@example.com"
    body = valid_producer_register_payload() | {
        "email": email,
        "phone": "0501234567",
        "has_physical_location": True,
        "by_arrangement": True,
    }
    resp = client.post("/auth/register/producer", json=body)
    assert resp.status_code in (200, 201), resp.text
    db.expire_all()
    rows = db.query(Producer).filter(Producer.name == body["producer_name"]).all()
    assert [r.by_arrangement for r in rows] == [True]


def test_registration_rejects_arrangement_without_a_place(client, db):
    body = valid_producer_register_payload() | {
        "email": f"r{uuid.uuid4().hex[:8]}@example.com",
        "phone": "0501234567",
        "has_physical_location": False,
        "offers_delivery": True,
        "delivery_nationwide": True,
        "by_arrangement": True,
    }
    resp = client.post("/auth/register/producer", json=body)
    assert resp.status_code == 422, resp.text
