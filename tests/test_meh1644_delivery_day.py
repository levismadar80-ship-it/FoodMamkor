"""
MEH-1644 — structured delivery-day capture: whitelist validator + owner rows path.

Two layers:
  1. Pure-Pydantic pins on DeliveryDayField (DeliveryAreaCreate.delivery_day):
     all 7 canonical Hebrew days accepted verbatim, None legal ("בתיאום מראש"),
     blank normalizes to None, and free-text variants ("ימי שישי", "friday",
     "יום שישי") 422 — the write boundary the MEH-1644 backfill script relies
     on to keep new rows canonical.
  2. Router pins on PUT /producers/me delivery_areas (the new structured-rows
     path): delivery_day + min_order persist per city, the flat
     delivery_area_cities path is unchanged, rows take precedence when both
     are sent, and the nationwide XOR fires for rows exactly like it does for
     the flat list.

Expand-only guarantee: DeliveryAreaOut carries NO whitelist — a legacy row
with free-text day must still serialize (asserted via GET after seeding a
legacy-shaped row directly).

REUSES: tests/test_producer_me_delivery_fields.py (_producer_user pattern) ·
tests/test_meh1626_domain_types.py (pure-Pydantic schema pins).
"""

import pytest
from pydantic import ValidationError

from app.models import DeliveryArea
from app.schemas.schemas import DELIVERY_DAYS, DeliveryAreaCreate, ProducerUpdate
from tests.conftest import auth_header, make_producer, make_user


def _producer_user(db):
    producer = make_producer(db, name="חוות ימי משלוח")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


# --- 1. schema boundary -----------------------------------------------------


@pytest.mark.parametrize("day", DELIVERY_DAYS)
def test_all_canonical_days_accepted(day):
    assert DeliveryAreaCreate(city="חיפה", delivery_day=day).delivery_day == day


def test_none_and_blank_mean_arranged():
    assert DeliveryAreaCreate(city="חיפה").delivery_day is None
    assert DeliveryAreaCreate(city="חיפה", delivery_day=None).delivery_day is None
    assert DeliveryAreaCreate(city="חיפה", delivery_day="  ").delivery_day is None


@pytest.mark.parametrize(
    "bad", ["ימי שישי", "יום שישי", "friday", "Friday", "א", "ששי"]
)
def test_free_text_variants_rejected(bad):
    with pytest.raises(ValidationError):
        DeliveryAreaCreate(city="חיפה", delivery_day=bad)


def test_producer_update_nationwide_xor_covers_rows():
    with pytest.raises(ValidationError):
        ProducerUpdate(
            delivery_nationwide=True,
            delivery_areas=[{"city": "חיפה", "delivery_day": "שישי"}],
        )
    # Omitting the field entirely must NOT trip the XOR (partial update).
    assert ProducerUpdate(delivery_nationwide=True).delivery_nationwide is True


# --- 2. owner rows path -----------------------------------------------------


def test_owner_put_rows_persist_day_and_min_order(client, db):
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={
            "offers_delivery": True,
            "delivery_nationwide": False,
            "delivery_areas": [
                {"city": "חיפה", "delivery_day": "שישי", "min_order": 100},
                {"city": "עכו", "delivery_day": None},
            ],
        },
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    rows = {da.city: da for da in producer.delivery_areas}
    assert rows["חיפה"].delivery_day == "שישי"
    assert rows["חיפה"].min_order == 100
    assert rows["עכו"].delivery_day is None


def test_owner_put_rows_invalid_day_422(client, db):
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"delivery_areas": [{"city": "חיפה", "delivery_day": "בשישי בערב"}]},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text
    # Nothing persisted — the 422 fires at the schema boundary.
    db.refresh(producer)
    assert producer.delivery_areas == []


def test_owner_put_rows_take_precedence_over_flat_list(client, db):
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={
            "delivery_areas": [{"city": "חיפה", "delivery_day": "רביעי"}],
            "delivery_area_cities": ["תל אביב-יפו"],
        },
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert [da.city for da in producer.delivery_areas] == ["חיפה"]
    assert producer.delivery_areas[0].delivery_day == "רביעי"


def test_owner_put_flat_path_unchanged(client, db):
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"delivery_area_cities": ["חיפה", "עכו"]},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert {da.city for da in producer.delivery_areas} == {"חיפה", "עכו"}
    assert all(da.delivery_day is None for da in producer.delivery_areas)


def test_owner_put_rows_nationwide_xor_422(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={
            "delivery_nationwide": True,
            "delivery_areas": [{"city": "חיפה"}],
        },
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


# --- 3. expand-only: legacy free-text rows still serialize ------------------


def test_legacy_free_text_day_still_serializes(client, db):
    _, producer = _producer_user(db)
    producer.status = "approved"
    db.add(DeliveryArea(producer_id=producer.id, city="חיפה", delivery_day="ימי שישי"))
    db.commit()
    resp = client.get(f"/producers/{producer.id}")
    assert resp.status_code == 200, resp.text
    areas = resp.json()["delivery_areas"]
    assert areas[0]["delivery_day"] == "ימי שישי"  # read model has NO whitelist
