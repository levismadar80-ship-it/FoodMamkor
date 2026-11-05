"""«עסק של מילואימניקים» — owner-declared reservist_owned flag, API half.

Covers chunk 1 of the reservist badge:
  - a new business defaults to False (nobody is marked without opting in);
  - owner PUT /producers/me persists True and back to False (round-trip);
  - an explicit null → 422 (the column is NOT NULL; a null write would 500);
  - the owner write touches only the caller's own business;
  - the flag is served on the public listing and detail payloads.

REUSES: tests/test_dietary_scope_io.py:20 (_producer_user owner wiring).
"""

from tests.conftest import auth_header, make_producer, make_user


def _producer_user(db, name="מאפיית המילואים"):
    producer = make_producer(db, name=name)
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def test_new_business_defaults_to_not_reservist_owned(db):
    producer = make_producer(db, name="משק ברירת מחדל")
    db.refresh(producer)
    assert producer.reservist_owned is False


def test_owner_put_round_trips_reservist_owned(client, db):
    user, producer = _producer_user(db)

    resp = client.put("/producers/me", json={"reservist_owned": True}, headers=auth_header(user))
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.reservist_owned is True

    resp = client.put("/producers/me", json={"reservist_owned": False}, headers=auth_header(user))
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.reservist_owned is False


def test_owner_put_explicit_null_returns_422(client, db):
    user, producer = _producer_user(db)
    resp = client.put("/producers/me", json={"reservist_owned": None}, headers=auth_header(user))
    assert resp.status_code == 422, resp.text
    db.refresh(producer)
    assert producer.reservist_owned is False


def test_owner_put_does_not_touch_another_business(client, db):
    user, _ = _producer_user(db)
    other = make_producer(db, name="משק השכנים")
    resp = client.put("/producers/me", json={"reservist_owned": True}, headers=auth_header(user))
    assert resp.status_code == 200, resp.text
    db.refresh(other)
    assert other.reservist_owned is False


def test_public_payloads_serve_reservist_owned(client, db):
    user, producer = _producer_user(db)
    client.put("/producers/me", json={"reservist_owned": True}, headers=auth_header(user))

    detail = client.get(f"/producers/{producer.id}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["reservist_owned"] is True

    listing = client.get("/producers", params={"limit": 100})
    assert listing.status_code == 200, listing.text
    rows = {str(p["id"]): p for p in listing.json()}
    assert rows[str(producer.id)]["reservist_owned"] is True


def test_admin_put_can_set_reservist_owned(client, db):
    """Admin PUT shares ProducerUpdate (bulk setattr): it may correct the flag."""
    producer = make_producer(db, name="משק אדמין מילואים")
    admin = make_user(db, role="admin")
    resp = client.put(
        f"/admin/producers/{producer.id}", json={"reservist_owned": True}, headers=auth_header(admin)
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.reservist_owned is True
