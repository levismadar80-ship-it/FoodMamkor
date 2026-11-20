"""MEH-3475 — the admin fills a business's delivery day + minimum per city,
its order window and its payment info, through the admin producer PUT, with
the same validation the owner's PUT /producers/me applies.

Every guard test sends a schema-valid body (Regression rule 6).
"""

import uuid

from app.models import DeliveryArea
from tests.conftest import auth_header, make_producer, make_user


def _admin(db):
    return make_user(db, role="admin", email=f"a{uuid.uuid4().hex[:8]}@example.com")


def _owner_of(db, producer):
    user = make_user(db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com")
    user.producer_id = producer.id
    user.is_producer = True
    db.commit()
    db.refresh(user)
    return user


def _rows():
    return [
        {"city": "חיפה", "delivery_day": "שלישי", "min_order": 150, "delivery_fee": None},
        {"city": "עכו", "delivery_day": "שלישי", "min_order": None, "delivery_fee": 0},
        {"city": "נהריה", "delivery_day": None, "min_order": 200, "delivery_fee": None},
    ]


def _areas(db, producer):
    db.expire_all()
    return {
        a.city: (a.delivery_day, a.min_order, a.delivery_fee)
        for a in db.query(DeliveryArea).filter(DeliveryArea.producer_id == producer.id)
    }


def _body():
    return {"offers_delivery": True, "delivery_nationwide": False, "delivery_areas": _rows()}


def test_admin_saves_day_and_minimum_per_city(client, db):
    producer = make_producer(db)
    r = client.put(f"/admin/producers/{producer.id}", json=_body(), headers=auth_header(_admin(db)))
    assert r.status_code == 200, r.text
    assert _areas(db, producer) == {
        "חיפה": ("שלישי", 150, None),
        "עכו": ("שלישי", None, 0),
        "נהריה": (None, 200, None),
    }
    out = {a["city"]: a for a in r.json()["delivery_areas"]}
    assert out["חיפה"]["delivery_day"] == "שלישי"
    assert out["נהריה"]["min_order"] == 200


def test_admin_day_outside_the_whitelist_is_422_and_nothing_written(client, db):
    producer = make_producer(db, delivery_cities=["חיפה"])
    body = _body()
    body["delivery_areas"][0]["delivery_day"] = "יום ג"
    r = client.put(f"/admin/producers/{producer.id}", json=body, headers=auth_header(_admin(db)))
    before = _areas(db, producer)
    assert r.status_code == 422
    assert _areas(db, producer) == before


def test_city_list_save_keeps_existing_days(client, db):
    # The admin ProducerForm still sends the flat city list. A save that keeps
    # a city must not wipe the day the admin set on it.
    producer = make_producer(db)
    h = auth_header(_admin(db))
    assert client.put(f"/admin/producers/{producer.id}", json=_body(), headers=h).status_code == 200
    r = client.put(
        f"/admin/producers/{producer.id}",
        json={"delivery_area_cities": ["חיפה", "נהריה", "צפת"]},
        headers=h,
    )
    assert r.status_code == 200, r.text
    assert _areas(db, producer) == {
        "חיפה": ("שלישי", 150, None),
        "נהריה": (None, 200, None),
        "צפת": (None, None, None),
    }


def test_admin_saves_order_window_and_payment_info(client, db):
    producer = make_producer(db)
    body = {
        "order_window": {"sunday": [{"open": "09:00", "close": "13:00"}]},
        "payment_info": {"methods": ["credit_card"], "timing": None, "note": "הסכום הסופי אחרי שקילה"},
    }
    r = client.put(f"/admin/producers/{producer.id}", json=body, headers=auth_header(_admin(db)))
    assert r.status_code == 200, r.text
    db.refresh(producer)
    assert producer.order_window == {"sunday": [{"open": "09:00", "close": "13:00"}]}
    assert producer.payment_info["methods"] == ["credit_card"]
    assert producer.payment_info["note"] == "הסכום הסופי אחרי שקילה"


def test_non_admin_is_refused_and_nothing_written(client, db):
    producer = make_producer(db, delivery_cities=["חיפה"])
    before = _areas(db, producer)
    consumer = make_user(db, role="consumer", email=f"c{uuid.uuid4().hex[:8]}@example.com")
    for who in (consumer, _owner_of(db, producer)):
        r = client.put(f"/admin/producers/{producer.id}", json=_body(), headers=auth_header(who))
        assert r.status_code == 403, (who.role, r.text)
    assert client.put(f"/admin/producers/{producer.id}", json=_body()).status_code == 401
    assert _areas(db, producer) == before
