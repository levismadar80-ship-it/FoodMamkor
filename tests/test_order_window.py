"""MEH-1543 — producers.order_window (weekly order-acceptance window).

Backend chunk 1/3 of the "חלון הזמנות" feature. Covers the ORM column +
Pydantic validation + owner write path (PUT /producers/me) + public read
(GET /producers/{id} → ProducerDetailOut.order_window).

Validation contract (schemas.ProducerUpdate._validate_order_window):
  - keys ∈ {sunday..saturday}; a day absent = orders closed that day
  - each present day = {"open": "HH:MM", "close": "HH:MM"} 24h zero-padded
  - close strictly after open
  - explicit null clears; NULL = feature unused (nothing rendered)

REUSES: tests/test_producer_me_delivery_fields.py:19 (_producer_user owner-
wiring pattern — make_producer + make_user(role="producer") + producer_id link).
"""
from tests.conftest import auth_header, make_producer, make_user

VALID_WINDOW = {
    "sunday": {"open": "09:00", "close": "14:00"},
    "monday": {"open": "08:30", "close": "18:00"},
    "thursday": {"open": "10:00", "close": "23:00"},
}


def _producer_user(db):
    producer = make_producer(db, name="חוות חלון ההזמנות")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def test_valid_order_window_persists_and_returns(client, db):
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"order_window": VALID_WINDOW},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    # Round-trips on the owner response shape (ProducerOwnerOut inherits it).
    assert resp.json()["order_window"] == VALID_WINDOW

    db.refresh(producer)
    assert producer.order_window == VALID_WINDOW


def test_invalid_day_key_rejected_422(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"order_window": {"funday": {"open": "09:00", "close": "14:00"}}},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text
    assert "funday" in resp.text


def test_invalid_time_format_rejected_422(client, db):
    user, _ = _producer_user(db)
    # "9:00" is not zero-padded 24h; the regex requires a two-digit hour.
    resp = client.put(
        "/producers/me",
        json={"order_window": {"sunday": {"open": "9:00", "close": "14:00"}}},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_out_of_range_hour_rejected_422(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"order_window": {"sunday": {"open": "09:00", "close": "25:00"}}},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_close_not_after_open_rejected_422(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"order_window": {"sunday": {"open": "14:00", "close": "14:00"}}},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_missing_close_rejected_422(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"order_window": {"sunday": {"open": "09:00"}}},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_explicit_null_clears_window(client, db):
    user, producer = _producer_user(db)
    # Seed a window first.
    client.put(
        "/producers/me",
        json={"order_window": VALID_WINDOW},
        headers=auth_header(user),
    )
    db.refresh(producer)
    assert producer.order_window == VALID_WINDOW

    # Explicit null clears it.
    resp = client.put(
        "/producers/me",
        json={"order_window": None},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["order_window"] is None

    db.refresh(producer)
    assert producer.order_window is None


def test_omitted_field_leaves_window_untouched(client, db):
    user, producer = _producer_user(db)
    client.put(
        "/producers/me",
        json={"order_window": VALID_WINDOW},
        headers=auth_header(user),
    )
    # A later PUT that omits order_window must not wipe it (exclude_unset).
    resp = client.put(
        "/producers/me",
        json={"short_description": "עדכון לא קשור"},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.order_window == VALID_WINDOW


def test_order_window_appears_in_public_detail(client, db):
    _, producer = _producer_user(db)
    producer.order_window = VALID_WINDOW
    db.commit()

    resp = client.get(f"/producers/{producer.id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["order_window"] == VALID_WINDOW


def test_null_window_in_public_detail(client, db):
    _, producer = _producer_user(db)
    resp = client.get(f"/producers/{producer.id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["order_window"] is None
