"""MEH-3511 — delivery zones stage 2: delivery time in business days, an
order cutoff per zone, a business-wide minimum, and zones on a nationwide
business («כל הארץ» plus «גוש דן, אקספרס» on other terms).

Every guard test sends a schema-valid body apart from the one field it tests
(Regression rule 6).
"""

import uuid

from app.models import DeliveryArea
from app.services import product_order_delivery as pod
from tests.conftest import auth_header, make_producer, make_user


def _owner(db):
    producer = make_producer(db, name="Cardinal")
    user = make_user(db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com")
    user.producer_id = producer.id
    user.is_producer = True
    db.commit()
    db.refresh(user)
    return producer, user


def _put(client, user, body):
    return client.put("/producers/me", json=body, headers=auth_header(user))


def _rows(db, producer):
    db.expire_all()
    return {
        a.city: a
        for a in db.query(DeliveryArea).filter(DeliveryArea.producer_id == producer.id)
    }


def _express(**kw):
    zone = {
        "name": "גוש דן, אקספרס",
        "cities": ["תל אביב-יפו", "רמת גן"],
        "delivery_days": ["שלישי"],
        "min_order": 100,
        "delivery_fee": 40,
        "delivery_days_min": 1,
        "delivery_days_max": 2,
        "order_cutoff_day": "שני",
        "order_cutoff_time": "12:00",
    }
    zone.update(kw)
    return zone


def _nationwide(**kw):
    body = {
        "offers_delivery": True,
        "delivery_nationwide": True,
        "delivery_areas": [],
        "delivery_fee": 30,
        "delivery_min_order": 150,
        "delivery_days_min": None,
        "delivery_days_max": 5,
        "delivery_zones": [_express()],
    }
    body.update(kw)
    return body


def test_cardinal_nationwide_with_an_express_zone(client, db):
    producer, user = _owner(db)
    r = _put(client, user, _nationwide())
    assert r.status_code == 200, r.text
    rows = _rows(db, producer)
    assert set(rows) == {"תל אביב-יפו", "רמת גן"}
    tlv = rows["תל אביב-יפו"]
    assert (tlv.zone_name, tlv.min_order, tlv.delivery_fee) == ("גוש דן, אקספרס", 100, 40)
    assert (tlv.delivery_days_min, tlv.delivery_days_max) == (1, 2)
    assert (tlv.order_cutoff_day, tlv.order_cutoff_time) == ("שני", "12:00")
    db.refresh(producer)
    assert producer.delivery_nationwide is True
    assert (producer.delivery_min_order, producer.delivery_days_max) == (150, 5)


def test_the_public_page_carries_the_new_fields(client, db):
    producer, user = _owner(db)
    assert _put(client, user, _nationwide()).status_code == 200
    page = client.get(f"/producers/{producer.id}").json()
    assert (page["delivery_min_order"], page["delivery_days_max"]) == (150, 5)
    area = next(a for a in page["delivery_areas"] if a["city"] == "רמת גן")
    assert area["order_cutoff_day"] == "שני"
    assert area["delivery_days_min"] == 1
    owner = client.get("/producers/me", headers=auth_header(user)).json()
    zone = owner["delivery_zones"][0]
    assert zone["order_cutoff_time"] == "12:00"
    assert sorted(zone["cities"]) == ["רמת גן", "תל אביב-יפו"]


def test_an_order_outside_the_zone_meets_the_business_minimum(client, db):
    producer, user = _owner(db)
    assert _put(client, user, _nationwide()).status_code == 200
    db.refresh(producer)
    haifa = pod.facts_for(db, producer, "חיפה")
    assert haifa.area_min_order == 150  # the business-wide one
    tlv = pod.facts_for(db, producer, "תל אביב-יפו")
    assert tlv.area_min_order == 100  # the zone's own wins
    assert pod.quote(tlv, "תל אביב-יפו", 100_00) == 40_00


def test_removing_the_zones_from_a_nationwide_business_drops_their_rows(client, db):
    producer, user = _owner(db)
    assert _put(client, user, _nationwide()).status_code == 200
    assert _put(client, user, _nationwide(delivery_zones=[])).status_code == 200
    assert _rows(db, producer) == {}


def test_a_city_leaving_a_zone_loses_the_zone_only_terms(client, db):
    producer, user = _owner(db)
    body = {
        "offers_delivery": True,
        "delivery_nationwide": False,
        "delivery_areas": [{"city": "חיפה", "delivery_day": "ראשון"}],
        "delivery_zones": [_express(cities=["חיפה"])],
    }
    assert _put(client, user, body).status_code == 200
    body["delivery_zones"] = []
    assert _put(client, user, body).status_code == 200
    haifa = _rows(db, producer)["חיפה"]
    assert haifa.order_cutoff_day is None
    assert haifa.delivery_days_min is None
    assert haifa.zone_name is None


def test_a_business_that_fills_nothing_new_reads_as_before(client, db):
    producer, user = _owner(db)
    body = {
        "offers_delivery": True,
        "delivery_nationwide": False,
        "delivery_areas": [{"city": "חיפה", "delivery_day": "ראשון", "min_order": 80}],
    }
    assert _put(client, user, body).status_code == 200
    page = client.get(f"/producers/{producer.id}").json()
    assert page["delivery_min_order"] is None
    assert page["delivery_days_min"] is None and page["delivery_days_max"] is None
    area = page["delivery_areas"][0]
    assert area["order_cutoff_day"] is None and area["delivery_days_max"] is None
    db.refresh(producer)
    assert pod.facts_for(db, producer, "חיפה").area_min_order == 80


def _detail(r):
    assert r.status_code == 422, r.text
    return r.text


def test_a_reversed_or_out_of_range_delivery_time_is_a_hebrew_422(client, db):
    _, user = _owner(db)
    assert "קטן מהשני" in _detail(_put(client, user, {"delivery_days_min": 5, "delivery_days_max": 2}))
    assert "בין 1 ל-30" in _detail(_put(client, user, {"delivery_days_max": 31}))
    assert "בין 1 ל-30" in _detail(_put(client, user, _nationwide(delivery_zones=[_express(delivery_days_min=0)])))
    assert "קטן מהשני" in _detail(
        _put(client, user, _nationwide(delivery_zones=[_express(delivery_days_min=4, delivery_days_max=2)]))
    )


def test_a_bad_zone_cutoff_is_a_hebrew_422(client, db):
    _, user = _owner(db)
    bad_time = _nationwide(delivery_zones=[_express(order_cutoff_time="9:5")])
    assert "שעת סגירת ההזמנות לא תקינה" in _detail(_put(client, user, bad_time))
    half = _nationwide(delivery_zones=[_express(order_cutoff_day=None)])
    assert "גם יום וגם שעה" in _detail(_put(client, user, half))


def test_a_negative_business_minimum_is_refused(client, db):
    _, user = _owner(db)
    assert "שלילי" in _detail(_put(client, user, {"delivery_min_order": -1}))
