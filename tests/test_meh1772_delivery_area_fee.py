"""
MEH-1772 — per-area delivery-fee override (chunk 2, API layer).

`delivery_areas.delivery_fee` overrides `producers.delivery_fee` (MEH-1577).
The three-value semantics are the whole point and every test below exists to
pin one of them:

    None  → inherit the producer-level fee   (NOT "no fee")
    0     → "משלוח חינם" to THIS area        (NOT absence)
    n > 0 → this area costs n

The 0-vs-None distinction is the fragile one: any read written as `if fee:`
instead of `if fee is not None:` collapses "free" into "inherit" and silently
publishes the producer's fee on an area the owner marked free. `test_zero_fee_*`
is the pin for that, and it fails against exactly that mistake.

Layers, mirroring tests/test_meh1644_delivery_day.py:
  1. Pure-Pydantic bounds on DeliveryAreaCreate.delivery_fee.
  2. Router pins on PUT /producers/me (the MEH-1644 structured-rows path).
  3. Serialization pin on DeliveryAreaOut.

REUSES: tests/test_meh1644_delivery_day.py (_producer_user + rows-PUT pattern) ·
tests/test_producer_me_delivery_fields.py (MEH-1577 producer-level fee bounds).
"""

import pytest
from pydantic import ValidationError

from app.schemas.schemas import (
    MAX_DELIVERY_MONEY,
    DeliveryAreaCreate,
    DeliveryAreaOut,
)
from tests.conftest import auth_header, make_producer, make_user


def _producer_user(db):
    producer = make_producer(db, name="חוות עלות משלוח")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


# --- 1. schema boundary -----------------------------------------------------


def test_absent_and_explicit_none_both_mean_inherit():
    assert DeliveryAreaCreate(city="חיפה").delivery_fee is None
    assert DeliveryAreaCreate(city="חיפה", delivery_fee=None).delivery_fee is None


def test_zero_is_accepted_and_preserved_not_coerced_to_none():
    # "משלוח חינם" — the value that a truthiness check would destroy.
    area = DeliveryAreaCreate(city="חיפה", delivery_fee=0)
    assert area.delivery_fee == 0
    assert area.delivery_fee is not None


@pytest.mark.parametrize("fee", [1, 20, 40, MAX_DELIVERY_MONEY])
def test_positive_fees_accepted_up_to_the_cap(fee):
    assert DeliveryAreaCreate(city="חיפה", delivery_fee=fee).delivery_fee == fee


@pytest.mark.parametrize("bad", [-1, -20])
def test_negative_fee_rejected_with_hebrew_copy(bad):
    with pytest.raises(ValidationError) as exc:
        DeliveryAreaCreate(city="חיפה", delivery_fee=bad)
    assert "עלות משלוח לא יכולה להיות שלילית" in str(exc.value)


def test_fee_above_cap_rejected():
    # The bound is load-bearing, not decoration: the column is Postgres
    # INTEGER, so an unbounded value would reach flush and raise
    # NumericValueOutOfRange — a 500 instead of a clean 422.
    with pytest.raises(ValidationError) as exc:
        DeliveryAreaCreate(city="חיפה", delivery_fee=MAX_DELIVERY_MONEY + 1)
    assert "עלות משלוח גבוהה מדי" in str(exc.value)


# --- 2. router (PUT /producers/me structured rows) --------------------------


def test_owner_put_rows_persist_per_area_fee(client, db):
    """The headline case: two areas, two different fees, one inheriting."""
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={
            "offers_delivery": True,
            "delivery_nationwide": False,
            "delivery_areas": [
                {"city": "תל אביב", "delivery_fee": 20},
                {"city": "חיפה", "delivery_fee": 40},
                {"city": "עכו"},  # no override → inherits
            ],
        },
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    rows = {da.city: da for da in producer.delivery_areas}
    assert rows["תל אביב"].delivery_fee == 20
    assert rows["חיפה"].delivery_fee == 40
    assert rows["עכו"].delivery_fee is None


def test_zero_fee_persists_as_zero_not_null(client, db):
    """Free delivery to one area must NOT round-trip into "inherit".

    This is the assertion that discriminates: a writer using
    `row.get("delivery_fee") or None`, or a reader using `if fee:`, turns the
    0 into None here and the row silently starts advertising the producer's
    fee on an area the owner marked free.
    """
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={
            "offers_delivery": True,
            "delivery_nationwide": False,
            "delivery_areas": [{"city": "תל אביב", "delivery_fee": 0}],
        },
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    row = producer.delivery_areas[0]
    assert row.delivery_fee == 0
    assert row.delivery_fee is not None


def test_owner_put_negative_fee_422_and_nothing_persisted(client, db):
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"delivery_areas": [{"city": "חיפה", "delivery_fee": -5}]},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text
    # The 422 fires at the schema boundary, before any delete+insert runs —
    # so a rejected payload must not have wiped the existing rows either.
    db.refresh(producer)
    assert producer.delivery_areas == []


def test_owner_put_fee_above_cap_422(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={
            "delivery_areas": [{"city": "חיפה", "delivery_fee": MAX_DELIVERY_MONEY + 1}]
        },
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_fee_survives_a_later_write_that_omits_it(client, db):
    """Rows are delete+insert, so an omitted fee clears it — pin the semantics.

    Not a bug: the rows array is the complete desired state (MEH-1644), so a
    row sent without `delivery_fee` means "this area inherits", exactly as a
    row sent without `min_order` means "no minimum". Pinned so a future change
    to merge-instead-of-replace has to confront it deliberately.
    """
    user, producer = _producer_user(db)
    client.put(
        "/producers/me",
        json={
            "offers_delivery": True,
            "delivery_nationwide": False,
            "delivery_areas": [{"city": "חיפה", "delivery_fee": 40}],
        },
        headers=auth_header(user),
    )
    resp = client.put(
        "/producers/me",
        json={
            "offers_delivery": True,
            "delivery_nationwide": False,
            "delivery_areas": [{"city": "חיפה"}],
        },
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.delivery_areas[0].delivery_fee is None


# --- 3. serialization -------------------------------------------------------


def test_delivery_area_out_emits_fee_including_zero():
    """The public shape must distinguish 0 from None, or chunk 3's
    "משלוח מ-X₪" variance line cannot be computed."""
    import uuid

    free = DeliveryAreaOut(id=uuid.uuid4(), city="תל אביב", delivery_fee=0)
    inherit = DeliveryAreaOut(id=uuid.uuid4(), city="עכו")
    paid = DeliveryAreaOut(id=uuid.uuid4(), city="חיפה", delivery_fee=40)

    assert free.model_dump()["delivery_fee"] == 0
    assert inherit.model_dump()["delivery_fee"] is None
    assert paid.model_dump()["delivery_fee"] == 40
