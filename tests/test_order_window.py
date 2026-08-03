"""MEH-1543 — producers.order_window (weekly order-acceptance window).

Backend chunk 1/3 of the "חלון הזמנות" feature. Covers the ORM column +
Pydantic validation + owner write path (PUT /producers/me) + public read
(GET /producers/{id} → ProducerDetailOut.order_window).

Validation contract (schemas.ProducerUpdate._validate_order_window):
  - keys ∈ {sunday..saturday}; a day absent = orders closed that day
  - each present day = a LIST of 1..3 {"open": "HH:MM", "close": "HH:MM"}
    ranges, 24h zero-padded, close strictly after open, ascending and
    non-overlapping (MEH-1869)
  - the legacy single-dict shape is ACCEPTED and normalised to a one-element
    list, so rows written before the MEH-1869 cutover keep validating
  - explicit null clears; NULL = feature unused (nothing rendered)

MEH-1869 note: this is a JSONB VALUE-shape change. The column is untouched,
so there is deliberately no Alembic revision in that PR.

REUSES: tests/test_producer_me_delivery_fields.py:19 (_producer_user owner-
wiring pattern — make_producer + make_user(role="producer") + producer_id link).
"""
from tests.conftest import auth_header, make_producer, make_user

# The pre-MEH-1869 shape. Still a legal INPUT; it is normalised on write.
LEGACY_WINDOW = {
    "sunday": {"open": "09:00", "close": "14:00"},
    "monday": {"open": "08:30", "close": "18:00"},
    "thursday": {"open": "10:00", "close": "23:00"},
}

# What LEGACY_WINDOW must become once stored.
LEGACY_NORMALIZED = {
    "sunday": [{"open": "09:00", "close": "14:00"}],
    "monday": [{"open": "08:30", "close": "18:00"}],
    "thursday": [{"open": "10:00", "close": "23:00"}],
}

# The canonical shape: a split day (lunch break) beside single-range days.
VALID_WINDOW = {
    "sunday": [{"open": "09:00", "close": "13:00"}, {"open": "16:00", "close": "20:00"}],
    "monday": [{"open": "08:30", "close": "18:00"}],
    "friday": [
        {"open": "08:00", "close": "11:00"},
        {"open": "12:00", "close": "14:00"},
        {"open": "19:00", "close": "22:00"},
    ],
}


def _producer_user(db):
    producer = make_producer(db, name="חוות חלון ההזמנות")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def test_valid_order_window_persists_and_returns(client, db):
    """The canonical list shape round-trips byte-for-byte, split day included."""
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
    # The split day really did keep BOTH ranges — the whole point of MEH-1869.
    assert len(producer.order_window["sunday"]) == 2
    assert len(producer.order_window["friday"]) == 3


def test_legacy_dict_shape_is_accepted_and_normalized(client, db):
    """MEH-1869 parallel change: the pre-cutover shape still writes, and the
    row it leaves behind is the canonical list shape — not the dict it came in
    as. Asserting the STORED value (not just a 200) is what makes this a
    normalisation test rather than a "didn't 422" test."""
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"order_window": LEGACY_WINDOW},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["order_window"] == LEGACY_NORMALIZED

    db.refresh(producer)
    assert producer.order_window == LEGACY_NORMALIZED
    assert all(isinstance(v, list) for v in producer.order_window.values())


def test_adjacent_ranges_are_allowed(client, db):
    """next.open == prev.close is contiguous, not overlapping."""
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"order_window": {"sunday": [
            {"open": "09:00", "close": "13:00"},
            {"open": "13:00", "close": "17:00"},
        ]}},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text


def test_overlapping_ranges_rejected_422(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"order_window": {"sunday": [
            {"open": "09:00", "close": "13:00"},
            {"open": "12:00", "close": "17:00"},
        ]}},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_unsorted_ranges_rejected_422(client, db):
    """Same guard as overlap: a later range may not start before the previous
    one ended, which catches out-of-order input too."""
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"order_window": {"sunday": [
            {"open": "16:00", "close": "20:00"},
            {"open": "09:00", "close": "13:00"},
        ]}},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_more_than_three_ranges_rejected_422(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"order_window": {"sunday": [
            {"open": "06:00", "close": "07:00"},
            {"open": "08:00", "close": "09:00"},
            {"open": "10:00", "close": "11:00"},
            {"open": "12:00", "close": "13:00"},
        ]}},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_empty_range_list_rejected_422(client, db):
    """A present day with no ranges is not "closed" — closed is the day being
    ABSENT. An empty list is a malformed row and must not silently store."""
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"order_window": {"sunday": []}},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_bad_time_inside_second_range_rejected_422(client, db):
    """The per-range checks apply to EVERY range, not just the first."""
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"order_window": {"sunday": [
            {"open": "09:00", "close": "13:00"},
            {"open": "16:00", "close": "16:00"},
        ]}},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_invalid_day_key_rejected_422(client, db):
    # NB: the guard tests below deliberately send the LEGACY single-dict form.
    # They now also prove the per-range checks fire through the normalisation
    # path, not only on already-list input.
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
