"""MEH-3484 — named delivery zones, several delivery days per city, and a
free-delivery threshold per zone.

The zone is stored on producers.delivery_zones; membership on
delivery_areas.zone_name; the zone's days / minimum / fee / threshold are
copied onto each of its cities' rows by services/delivery_zones.py, so every
existing reader of a city row answers from the zone without changing.

Every guard test sends a schema-valid body apart from the one field it tests
(Regression rule 6).
"""

import uuid

from app.limits import MAX_CITIES_PER_ZONE, MAX_DELIVERY_ZONES
from app.models import DeliveryArea
from app.services import product_order_delivery as pod
from tests.conftest import auth_header, make_producer, make_user


def _owner(db, **producer_kw):
    producer = make_producer(db, **producer_kw)
    user = make_user(db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com")
    user.producer_id = producer.id
    user.is_producer = True
    db.commit()
    db.refresh(user)
    return producer, user


def _zone(name="קריות", cities=("קריית ביאליק", "קריית מוצקין"), **kw):
    return {
        "name": name,
        "cities": list(cities),
        "delivery_days": kw.get("days", ["חמישי", "שני"]),
        "min_order": kw.get("min_order", 120),
        "delivery_fee": kw.get("fee", 25),
        "free_delivery_above": kw.get("free", 300),
    }


def _body(zones, rows=None):
    body = {
        "offers_delivery": True,
        "delivery_nationwide": False,
        "delivery_zones": zones,
    }
    if rows is not None:
        body["delivery_areas"] = rows
    return body


def _rows_of(db, producer):
    db.expire_all()
    return {
        a.city: a
        for a in db.query(DeliveryArea).filter(DeliveryArea.producer_id == producer.id)
    }


def _put(client, user, body):
    return client.put("/producers/me", json=body, headers=auth_header(user))


# ---------- the write ----------


def test_a_zone_gives_its_cities_its_days_minimum_fee_and_threshold(client, db):
    producer, user = _owner(db)
    rows = [{"city": "חיפה", "delivery_day": "ראשון", "min_order": 80}]
    r = _put(client, user, _body([_zone()], rows))
    assert r.status_code == 200, r.text
    areas = _rows_of(db, producer)
    assert set(areas) == {"חיפה", "קריית ביאליק", "קריית מוצקין"}
    kb = areas["קריית ביאליק"]
    # Days come back in week order; the single column holds the first one.
    assert kb.delivery_days == ["שני", "חמישי"] and kb.delivery_day == "שני"
    assert (kb.zone_name, kb.min_order, kb.delivery_fee, kb.free_delivery_above) == (
        "קריות",
        120,
        25,
        300,
    )
    haifa = areas["חיפה"]  # not in a zone: its own values, untouched
    assert (haifa.zone_name, haifa.delivery_day, haifa.min_order) == (None, "ראשון", 80)
    zones = r.json()["delivery_zones"]
    assert [(z["name"], sorted(z["cities"])) for z in zones] == [
        ("קריות", ["קריית ביאליק", "קריית מוצקין"])
    ]


def test_the_public_page_shows_each_citys_days_zone_and_threshold(client, db):
    producer, user = _owner(db)
    _put(client, user, _body([_zone()], [{"city": "חיפה", "delivery_day": "ראשון"}]))
    r = client.get(f"/producers/{producer.id}")
    assert r.status_code == 200, r.text
    out = {a["city"]: a for a in r.json()["delivery_areas"]}
    assert out["קריית מוצקין"]["delivery_days"] == ["שני", "חמישי"]
    assert out["קריית מוצקין"]["zone_name"] == "קריות"
    assert out["קריית מוצקין"]["free_delivery_above"] == 300
    # A single-day row reads back as a one-day list.
    assert (
        out["חיפה"]["delivery_days"] == ["ראשון"] and out["חיפה"]["zone_name"] is None
    )
    assert (
        "delivery_zones" not in r.json()
    )  # the editor shape stays off the public page


def test_several_days_on_one_city_without_a_zone(client, db):
    producer, user = _owner(db)
    rows = [{"city": "עכו", "delivery_days": ["שישי", "שלישי", "שלישי", ""]}]
    assert (
        _put(
            client, user, {"offers_delivery": True, "delivery_areas": rows}
        ).status_code
        == 200
    )
    akko = _rows_of(db, producer)["עכו"]
    assert akko.delivery_days == ["שלישי", "שישי"] and akko.delivery_day == "שלישי"


def test_the_day_filter_matches_any_of_a_citys_days(client, db):
    producer, user = _owner(db, name="בית עסק של קריות")
    _put(client, user, _body([_zone()]))
    names = lambda day: {  # noqa: E731
        p["name"]
        for p in client.get("/producers", params={"delivery_days": day}).json()
    }
    assert "בית עסק של קריות" in names("חמישי")  # the SECOND day
    assert "בית עסק של קריות" in names("שני")
    assert "בית עסק של קריות" not in names("ראשון")


def test_a_save_that_sends_only_the_cities_keeps_each_city_in_its_zone(client, db):
    producer, user = _owner(db)
    _put(client, user, _body([_zone()]))
    # The old dashboard shape: rows only, no zones key, stale per-city values.
    rows = [
        {"city": "קריית ביאליק", "delivery_day": "ראשון", "min_order": 1},
        {"city": "נהריה", "delivery_day": "רביעי"},
    ]
    assert (
        _put(
            client, user, {"offers_delivery": True, "delivery_areas": rows}
        ).status_code
        == 200
    )
    areas = _rows_of(db, producer)
    kb = areas["קריית ביאליק"]
    assert (kb.zone_name, kb.delivery_days, kb.min_order) == (
        "קריות",
        ["שני", "חמישי"],
        120,
    )
    assert "קריית מוצקין" not in areas  # she removed it from her cities
    assert areas["נהריה"].zone_name is None


def test_removing_the_zones_keeps_each_citys_values(client, db):
    producer, user = _owner(db)
    _put(client, user, _body([_zone()]))
    assert _put(client, user, _body([])).status_code == 200
    kb = _rows_of(db, producer)["קריית ביאליק"]
    assert kb.zone_name is None and kb.free_delivery_above is None  # zone-only
    assert (kb.delivery_days, kb.min_order, kb.delivery_fee) == (
        ["שני", "חמישי"],
        120,
        25,
    )
    assert db.get(type(producer), producer.id).delivery_zones is None


def test_an_unrelated_save_changes_nothing(client, db):
    producer, user = _owner(db)
    _put(client, user, _body([_zone()]))
    assert (
        _put(client, user, {"short_description": "לחם טרי כל בוקר"}).status_code == 200
    )
    assert _rows_of(db, producer)["קריית ביאליק"].zone_name == "קריות"


# ---------- a business with no zones answers as before ----------


def test_no_zones_rows_are_written_exactly_as_before(client, db):
    producer, user = _owner(db)
    rows = [
        {"city": "חיפה", "delivery_day": "שלישי", "min_order": 150, "delivery_fee": 0}
    ]
    assert (
        _put(
            client, user, {"offers_delivery": True, "delivery_areas": rows}
        ).status_code
        == 200
    )
    haifa = _rows_of(db, producer)["חיפה"]
    assert (haifa.delivery_day, haifa.min_order, haifa.delivery_fee) == (
        "שלישי",
        150,
        0,
    )
    assert (haifa.zone_name, haifa.delivery_days, haifa.free_delivery_above) == (
        None,
        None,
        None,
    )
    assert db.get(type(producer), producer.id).delivery_zones is None


# ---------- the order flow uses the zone's threshold ----------


def test_an_order_to_a_zone_city_is_free_above_the_zone_threshold(client, db):
    producer, user = _owner(db)
    _put(client, user, _body([_zone(free=300)]))
    producer.delivery_fee = 30
    producer.free_delivery_above = 1000
    db.commit()
    facts = pod.facts_for(db, producer, "קריית ביאליק")
    assert facts.free_above == 300
    assert pod.quote(facts, "קריית ביאליק", 300 * 100) == 0
    assert pod.quote(facts, "קריית ביאליק", 299 * 100) == 25 * 100
    # A city outside every zone keeps the business threshold.
    _put(client, user, _body([_zone(free=300)], [{"city": "חיפה"}]))
    assert pod.facts_for(db, producer, "חיפה").free_above == 1000


# ---------- 422s, in Hebrew ----------


def _detail(r):
    assert r.status_code == 422, r.text
    return str(r.json())


def test_a_city_in_two_zones_is_refused(client, db):
    _, user = _owner(db)
    zones = [_zone(), _zone(name="צפון", cities=["קריית ביאליק", "נהריה"])]
    assert "קריית ביאליק מופיעה ביותר מאזור אחד" in _detail(
        _put(client, user, _body(zones))
    )


def test_a_zone_without_a_name_is_refused(client, db):
    _, user = _owner(db)
    assert "צריך לתת שם לאזור." in _detail(
        _put(client, user, _body([_zone(name="  ")]))
    )


def test_two_zones_with_one_name_are_refused(client, db):
    _, user = _owner(db)
    zones = [_zone(cities=["עכו"]), _zone(cities=["נהריה"])]
    assert "יש שני אזורים בשם «קריות»" in _detail(_put(client, user, _body(zones)))


def test_an_unknown_day_and_money_out_of_range_are_refused(client, db):
    _, user = _owner(db)
    assert "יום משלוח לא מוכר" in _detail(
        _put(client, user, _body([_zone(days=["friday"])]))
    )
    assert "עלות משלוח לא יכולה להיות שלילית" in _detail(
        _put(client, user, _body([_zone(fee=-1)]))
    )
    assert "מינימום הזמנה גבוה מדי" in _detail(
        _put(client, user, _body([_zone(min_order=10_000_000)]))
    )
    assert "סף למשלוח חינם חייב להיות גדול מאפס" in _detail(
        _put(client, user, _body([_zone(free=0)]))
    )


def test_the_caps_on_zones_and_on_cities_per_zone(client, db):
    _, user = _owner(db)
    many = [_zone(name=f"אזור {i}", cities=[]) for i in range(MAX_DELIVERY_ZONES + 1)]
    assert f"אפשר עד {MAX_DELIVERY_ZONES} אזורי משלוח." in _detail(
        _put(client, user, _body(many))
    )
    at_cap = [_zone(name=f"אזור {i}", cities=[]) for i in range(MAX_DELIVERY_ZONES)]
    assert _put(client, user, _body(at_cap)).status_code == 200
    cities = [f"עיר {i}" for i in range(MAX_CITIES_PER_ZONE + 1)]
    assert f"אפשר עד {MAX_CITIES_PER_ZONE} ערים באזור אחד." in _detail(
        _put(client, user, _body([_zone(cities=cities)]))
    )


# MEH-3511 reversed the MEH-3484 rule that refused zones on a nationwide
# business: «כל הארץ» plus areas on other terms («גוש דן, אקספרס») is now the
# shape Cardinal needs. tests/test_meh3511_delivery_terms.py covers it.


# ---------- the admin writes the same way ----------


def _admin(db):
    return make_user(db, role="admin", email=f"a{uuid.uuid4().hex[:8]}@example.com")


def test_the_admin_saves_zones_and_her_flat_city_list_keeps_them(client, db):
    producer = make_producer(db)
    admin = auth_header(_admin(db))
    r = client.put(
        f"/admin/producers/{producer.id}", json=_body([_zone()]), headers=admin
    )
    assert r.status_code == 200, r.text
    assert [z["name"] for z in r.json()["delivery_zones"]] == ["קריות"]
    flat = {"delivery_area_cities": ["קריית ביאליק", "קריית מוצקין", "חיפה"]}
    assert (
        client.put(
            f"/admin/producers/{producer.id}", json=flat, headers=admin
        ).status_code
        == 200
    )
    kb = _rows_of(db, producer)["קריית ביאליק"]
    assert (kb.zone_name, kb.delivery_days, kb.min_order) == (
        "קריות",
        ["שני", "חמישי"],
        120,
    )


# ---------- rule-5a review fixes ----------


def test_a_zone_sent_without_days_saves_and_reads_back(client, db):
    producer, user = _owner(db)
    zone = {"name": "צפון", "cities": ["חיפה"]}
    r = _put(client, user, _body([zone]))
    assert r.status_code == 200, r.text
    assert r.json()["delivery_zones"][0]["delivery_days"] == []
    again = client.get("/producers/me", headers=auth_header(user))
    assert again.status_code == 200, again.text
    assert _rows_of(db, producer)["חיפה"].delivery_days == []


def test_zone_cities_count_toward_the_delivery_city_cap(client, db, monkeypatch):
    from app.services import delivery_zones as dz

    monkeypatch.setattr(dz, "MAX_DELIVERY_CITIES", 3)
    producer, user = _owner(db)
    zones = [_zone("א", ["חיפה", "עכו"]), _zone("ב", ["נהריה", "צפת"])]
    r = _put(client, user, _body(zones))
    assert r.status_code == 422, r.text
    assert r.json()["detail"] == dz.DELIVERY_CITIES_DETAIL
    assert _rows_of(db, producer) == {}


def test_zones_on_a_nationwide_business_write_only_the_zone_cities(client, db):
    # MEH-3511: before, a nationwide business silently dropped its zones.
    producer, user = _owner(db)
    producer.offers_delivery = True
    producer.delivery_nationwide = True
    db.commit()
    r = client.put(
        "/producers/me",
        json={"delivery_zones": [_zone("צפון", ["חיפה"])]},
        headers=auth_header(user),
    )
    assert r.status_code == 200, r.text
    assert set(_rows_of(db, producer)) == {"חיפה"}
    db.refresh(producer)
    assert [z["name"] for z in producer.delivery_zones] == ["צפון"]


def test_a_city_a_zone_keeps_is_not_reported_as_new(db):
    from app.routers.producer_me import _sync_delivery_areas
    from app.schemas.catalog import DeliveryZoneIn

    producer, _ = _owner(db)
    producer.offers_delivery = True
    db.add(DeliveryArea(producer_id=producer.id, city="חיפה"))
    db.commit()
    db.refresh(producer)
    zone = DeliveryZoneIn(name="צפון", cities=["חיפה", "עכו"])
    added = _sync_delivery_areas(db, producer, [], None, [zone])
    assert added == ["עכו"]


def test_a_zone_name_loses_its_markup_and_a_long_city_is_dropped():
    from app.schemas.catalog import DeliveryZoneIn

    zone = DeliveryZoneIn(name="<b>צפון</b>", cities=["חיפה", "א" * 101])
    assert zone.name == "צפון"
    assert zone.cities == ["חיפה"]
