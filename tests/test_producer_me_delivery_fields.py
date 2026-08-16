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

MEH-1577 extends this module with the structured delivery-cost pair
(delivery_fee / free_delivery_above): persistence, explicit-null clearing, and
the validator boundaries. Those validators are the ONLY guard on the two
columns — migration c7e2a4b91f38 ships no DB CHECK by design — so the boundary
cases live here rather than being folded into a generic invalid-input test.

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


# ---------- MEH-1577: delivery_fee + free_delivery_above ----------
#
# The ProducerUpdate validators (schemas.py) are the ONLY guard on these two
# columns — migration c7e2a4b91f38 ships no DB CHECK by design, so there is no
# second layer to catch a weakened validator. That is why the boundary values
# are pinned individually rather than via one "invalid input" test: the whole
# point is that delivery_fee and free_delivery_above disagree at exactly one
# value (0), and a test that only proves "negatives are rejected" would stay
# green if the two rules were accidentally collapsed into one.


def test_owner_put_persists_delivery_fee_fields(client, db):
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"delivery_fee": 35, "free_delivery_above": 250},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.delivery_fee == 35
    assert producer.free_delivery_above == 250


def test_owner_put_delivery_fee_zero_is_accepted(client, db):
    """0 is NOT a rejected edge — it is how an owner says "delivery is free",
    and it must survive the round-trip as 0, distinct from NULL."""
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"delivery_fee": 0},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.delivery_fee == 0
    # Explicitly not None — the public page branches on exactly this
    # distinction ("משלוח חינם" vs rendering no line at all).
    assert producer.delivery_fee is not None


def test_owner_put_free_delivery_above_zero_returns_422(client, db):
    """The one value where the two fields diverge: 0 is legal for
    delivery_fee (above) and illegal here — "free above ₪0" says nothing."""
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"free_delivery_above": 0},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_owner_put_negative_delivery_fee_returns_422(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"delivery_fee": -1},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_owner_put_negative_free_delivery_above_returns_422(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"free_delivery_above": -10},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_owner_put_absurd_delivery_fee_returns_422_not_500(client, db):
    """The columns are Postgres INTEGER (max 2147483647) and the validators had
    no upper bound, so a value above it passed validation and blew up at flush
    time as `integer out of range` — a 500, not a 422.

    That contradicts the reason the migration ships no DB CHECK in the first
    place: enforcement lives at the API boundary precisely so a bad payload is
    a clean 422. Without a ceiling the boundary only half-held.
    """
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"delivery_fee": 3_000_000_000},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_owner_put_absurd_free_delivery_above_returns_422_not_500(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"free_delivery_above": 3_000_000_000},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_owner_put_free_delivery_above_alone_is_legal(client, db):
    """The fields are independent: a threshold with no flat fee stated is a
    real state, and the frontend renders the threshold line on its own."""
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"free_delivery_above": 200},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.free_delivery_above == 200
    assert producer.delivery_fee is None


def test_owner_put_explicit_null_clears_delivery_fee(client, db):
    user, producer = _producer_user(db)
    client.put(
        "/producers/me",
        json={"delivery_fee": 35},
        headers=auth_header(user),
    )
    db.refresh(producer)
    assert producer.delivery_fee == 35

    resp = client.put(
        "/producers/me",
        json={"delivery_fee": None},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.delivery_fee is None


def test_public_detail_exposes_delivery_fee_fields(client, db):
    """The write path persisting is not the same claim as the READ path
    serializing. `alembic check` proves models match the migration and the
    tests above prove the column holds the value — neither would notice
    ProducerDetailOut omitting the fields, and the public page (chunk 3) reads
    exactly this response. Pinned at delivery_fee=0 because that is the value a
    falsy-filtering serializer would silently drop.
    """
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"delivery_fee": 0, "free_delivery_above": 150},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text

    detail = client.get(f"/producers/{producer.id}")
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert "delivery_fee" in body, f"absent from public contract: {sorted(body)}"
    assert "free_delivery_above" in body, f"absent from public contract: {sorted(body)}"
    assert body["delivery_fee"] == 0
    assert body["free_delivery_above"] == 150


def test_public_listing_exposes_delivery_fee_fields(client, db):
    """The LIST contract is a separate claim from the DETAIL one, and the
    detail test above cannot make it.

    ProducerDetailOut inherits from ProducerListOut, so declaring the fields on
    Detail satisfies `/producers/{id}` while leaving `/producers` without them —
    a card-level fee would then render from a field the listing never carried,
    and every other check in this suite stays green. Declaring on List covers
    both; this test is what holds that placement in place, so a future move back
    down to Detail reds here instead of shipping.

    Pinned at delivery_fee=0 for the same reason as the detail test: it is the
    value a falsy-filtering serializer drops without complaint.
    """
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"delivery_fee": 0, "free_delivery_above": 150},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text

    listing = client.get("/producers")
    assert listing.status_code == 200, listing.text
    rows = listing.json()
    row = next((r for r in rows if r["id"] == str(producer.id)), None)
    assert row is not None, f"producer absent from listing: {rows}"
    assert "delivery_fee" in row, f"absent from list contract: {sorted(row)}"
    assert "free_delivery_above" in row, f"absent from list contract: {sorted(row)}"
    assert row["delivery_fee"] == 0
    assert row["free_delivery_above"] == 150
