"""MEH-3262 — on-site ordering, stage 2a: what a business offers.

Weekly ordering windows, a product's ordering fields, the slots cut from the
windows, the public order menu, and the rule that a business with an open
order cannot be hard-deleted.

The slot cases pass `now` in explicitly (the service reads no clock), and the
expected UTC instants are written out by hand: Israel is UTC+2 in winter and
UTC+3 in summer, so a slot computed with the wrong offset misses by an hour.
"""

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from pathlib import Path

import pytest

from app.models.models import Producer, Product
from app.models.product_orders import (
    PRODUCT_ORDER_FULFILMENTS,
    PRODUCT_ORDER_MAX_LEAD_HOURS,
    PRODUCT_ORDER_MAX_WINDOWS,
    PRODUCT_ORDER_SLOT_MINUTES,
    ProducerOrderSettings,
    ProducerOrderWindow,
    ProductOrder,
)
from app.routers import product_order_offer as offer_module
from app.routers import product_orders as orders_module
from app.services.product_order_slots import ClosedDays, SlotRules, compute_slots
from tests.conftest import auth_header, make_producer, make_user

# 0 = Sunday, as in producers.order_window — not date.weekday().
SUN, MON, TUE, WED, THU, FRI, SAT = range(7)

REVISION = (
    Path(__file__).resolve().parent.parent
    / "backend/alembic/versions/20261114_2230_e6b9d4f1a2c7_meh3262_order_windows.py"
)


@dataclass
class W:
    weekday: int
    start_time: time
    end_time: time
    fulfilment: str = "pickup"


def rules(slot=60, lead=0, shabbat=False) -> SlotRules:
    return SlotRules(slot_minutes=slot, lead_time_hours=lead, shabbat_observant=shabbat)


@pytest.fixture
def flag_on(monkeypatch):
    monkeypatch.setattr(orders_module, "product_orders_enabled", lambda: True)


def _owner(db, **producer_fields):
    producer = make_producer(db, name=f"מאפייה {uuid.uuid4().hex[:6]}")
    for field, value in producer_fields.items():
        setattr(producer, field, value)
    user = make_user(db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com")
    user.producer_id = producer.id
    user.is_producer = True
    db.commit()
    db.refresh(user)
    return user, producer


def _enable(db, producer, **fields):
    fields.setdefault("business_id_number", "512345678")
    row = ProducerOrderSettings(producer_id=producer.id, enabled=True, **fields)
    db.add(row)
    db.commit()
    return row


def valid_windows_payload() -> dict:
    return {
        "windows": [
            {
                "weekday": MON,
                "start_time": "10:00",
                "end_time": "12:00",
                "fulfilment": "pickup",
            },
            {
                "weekday": THU,
                "start_time": "16:00",
                "end_time": "19:00",
                "fulfilment": "delivery",
            },
        ]
    }


def valid_ordering_payload() -> dict:
    return {
        "is_orderable": True,
        "in_stock": False,
        "price_unit": "kg",
        "contains_alcohol": False,
    }


def _order(db, producer, status):
    now = datetime(2026, 11, 20, 10, 0)
    order = ProductOrder(
        producer_id=producer.id,
        customer_name="דנה לוי",
        customer_phone="+972501234567",
        fulfilment="pickup",
        slot_start=now,
        slot_end=now + timedelta(hours=1),
        estimated_total_agorot=5000,
        status=status,
    )
    db.add(order)
    db.commit()
    return order


# --- slots: pure function, explicit clock ----------------------------------


def test_a_winter_window_becomes_hourly_slots_two_hours_ahead_of_utc():
    sunday_morning = datetime(2026, 11, 15, 8, 0)  # UTC
    slots = compute_slots([W(MON, time(10), time(12))], rules(), sunday_morning)
    assert [(s.start, s.end) for s in slots] == [
        (datetime(2026, 11, 16, 8, 0), datetime(2026, 11, 16, 9, 0)),
        (datetime(2026, 11, 16, 9, 0), datetime(2026, 11, 16, 10, 0)),
        (datetime(2026, 11, 23, 8, 0), datetime(2026, 11, 23, 9, 0)),
        (datetime(2026, 11, 23, 9, 0), datetime(2026, 11, 23, 10, 0)),
    ]


def test_a_summer_window_is_three_hours_ahead_of_utc():
    slots = compute_slots(
        [W(MON, time(10), time(11))], rules(), datetime(2026, 7, 5, 0, 0)
    )
    assert slots[0].start == datetime(2026, 7, 6, 7, 0)


def test_a_slot_closer_than_the_lead_time_is_not_offered():
    # Monday 10:00 Israel is 08:00 UTC — 23.5 hours from now, under the 24.
    now = datetime(2026, 11, 15, 8, 30)
    slots = compute_slots([W(MON, time(10), time(12))], rules(lead=24), now)
    assert slots[0].start == datetime(2026, 11, 16, 9, 0)


def test_a_window_shorter_than_one_slot_offers_nothing():
    slots = compute_slots(
        [W(MON, time(10), time(10, 45))], rules(slot=60), datetime(2026, 11, 15, 8, 0)
    )
    assert slots == []


def test_on_the_spring_clock_change_only_real_hours_are_offered():
    # 26/03/2027: 02:00 jumps to 03:00 in Israel. Of a 01:00-04:00 window,
    # 01:00-02:00 and 03:00-04:00 are real hours; 02:00-03:00 never happens.
    slots = compute_slots(
        [W(FRI, time(1), time(4))], rules(), datetime(2027, 3, 22, 0, 0)
    )
    that_night = [(s.start, s.end) for s in slots if s.start < datetime(2027, 3, 27)]
    assert that_night == [
        (datetime(2027, 3, 25, 23, 0), datetime(2027, 3, 26, 0, 0)),
        (datetime(2027, 3, 26, 0, 0), datetime(2027, 3, 26, 1, 0)),
    ]


def test_on_the_autumn_clock_change_the_two_hour_hour_is_not_offered():
    # 31/10/2027: 02:00 falls back to 01:00, so wall-clock 01:00-02:00 lasts
    # two real hours. A one-hour slot there would be a lie; it is dropped.
    slots = compute_slots(
        [W(SUN, time(0), time(3))], rules(), datetime(2027, 10, 28, 0, 0)
    )
    that_night = [(s.start, s.end) for s in slots if s.start < datetime(2027, 11, 1)]
    assert that_night == [
        (datetime(2027, 10, 30, 21, 0), datetime(2027, 10, 30, 22, 0)),
        (datetime(2027, 10, 31, 0, 0), datetime(2027, 10, 31, 1, 0)),
    ]


def test_a_weekday_number_means_sunday_first():
    # 15/11/2026 is a Sunday. Window 0 must land on it, not on Monday.
    slots = compute_slots(
        [W(0, time(10), time(11))], rules(), datetime(2026, 11, 14, 0, 0)
    )
    assert slots[0].start == datetime(2026, 11, 15, 8, 0)


@pytest.mark.parametrize(
    ("closed", "expected_days"),
    [
        (ClosedDays(), [16, 23]),
        (ClosedDays(dates=frozenset({date(2026, 11, 16)})), [23]),
        (ClosedDays(until=date(2026, 11, 16)), [23]),
        (ClosedDays(until=date(2026, 11, 15)), [16, 23]),
        (ClosedDays(open_ended=True), []),
    ],
    ids=[
        "nothing closed",
        "a date she closed",
        "vacation through that Monday",
        "vacation ends the day before",
        "vacation with no return date",
    ],
)
def test_closed_dates_and_vacation_remove_whole_days(closed, expected_days):
    slots = compute_slots(
        [W(MON, time(10), time(11))], rules(), datetime(2026, 11, 15, 8, 0), closed
    )
    assert [s.start.day for s in slots] == expected_days


def test_shabbat_hours_are_dropped_only_for_an_observant_business():
    windows = [W(FRI, time(12), time(16)), W(SAT, time(18), time(23))]
    now = datetime(2026, 11, 15, 8, 0)
    week_one = datetime(2026, 11, 22)

    observant = [
        s.start
        for s in compute_slots(windows, rules(shabbat=True), now)
        if s.start < week_one
    ]
    # Friday 12:00 and 13:00, Saturday 21:00 and 22:00 (Israel) -> UTC+2.
    assert observant == [
        datetime(2026, 11, 20, 10, 0),
        datetime(2026, 11, 20, 11, 0),
        datetime(2026, 11, 21, 19, 0),
        datetime(2026, 11, 21, 20, 0),
    ]
    everyone = [s for s in compute_slots(windows, rules(), now) if s.start < week_one]
    assert len(everyone) == 9


def test_night_slots_are_marked_as_not_for_alcohol():
    windows = [W(MON, time(6), time(8)), W(MON, time(22), time(23, 30))]
    slots = compute_slots(windows, rules(slot=30), datetime(2026, 11, 15, 8, 0))
    first_monday = [s for s in slots if s.start < datetime(2026, 11, 17)]
    # 06:00 06:30 | 07:00 07:30 | 22:00 22:30 | 23:00
    assert [s.alcohol_ok for s in first_monday] == [
        False,
        False,
        True,
        True,
        True,
        True,
        False,
    ]


# --- the revision mirrors the model constants ---------------------------------


def test_the_revision_checks_match_the_model_constants():
    source = REVISION.read_text(encoding="utf-8")
    minutes = ", ".join(str(m) for m in PRODUCT_ORDER_SLOT_MINUTES)
    fulfilments = ", ".join(f"'{f}'" for f in PRODUCT_ORDER_FULFILMENTS)
    for literal in (
        f"slot_minutes IN ({minutes})",
        f"lead_time_hours <= {PRODUCT_ORDER_MAX_LEAD_HOURS}",
        f"fulfilment IN ({fulfilments})",
        "weekday >= 0 AND weekday <= 6",
        "end_time > start_time",
    ):
        assert literal in source, literal


# --- flag off -----------------------------------------------------------------


def test_every_route_is_404_while_the_flag_is_off(client, db):
    owner, producer = _owner(db)
    _enable(db, producer)
    product = Product(producer_id=producer.id, name="חלה", price_min=28)
    db.add(product)
    db.commit()
    headers = auth_header(owner)
    answers = [
        client.get("/producers/me/order-windows", headers=headers),
        client.put(
            "/producers/me/order-windows", json=valid_windows_payload(), headers=headers
        ),
        client.put(
            f"/producers/me/products/{product.id}/ordering",
            json=valid_ordering_payload(),
            headers=headers,
        ),
        client.get(f"/producers/{producer.id}/order-menu"),
        client.get("/producers/me/products/ordering", headers=headers),
    ]
    assert [a.status_code for a in answers] == [404, 404, 404, 404, 404]
    assert db.query(ProducerOrderWindow).count() == 0


# --- windows ------------------------------------------------------------------


def test_owner_saves_her_week_and_reads_it_back_in_order(client, db, flag_on):
    owner, _ = _owner(db)
    saved = client.put(
        "/producers/me/order-windows",
        json=valid_windows_payload(),
        headers=auth_header(owner),
    )
    assert saved.status_code == 200
    read = client.get("/producers/me/order-windows", headers=auth_header(owner)).json()
    assert read == {
        "windows": [
            {
                "weekday": MON,
                "start_time": "10:00:00",
                "end_time": "12:00:00",
                "fulfilment": "pickup",
            },
            {
                "weekday": THU,
                "start_time": "16:00:00",
                "end_time": "19:00:00",
                "fulfilment": "delivery",
            },
        ]
    }


def test_saving_replaces_the_week_and_leaves_other_businesses_alone(
    client, db, flag_on
):
    owner_a, producer_a = _owner(db)
    owner_b, producer_b = _owner(db)
    for owner in (owner_a, owner_b):
        client.put(
            "/producers/me/order-windows",
            json=valid_windows_payload(),
            headers=auth_header(owner),
        )
    client.put(
        "/producers/me/order-windows",
        json={"windows": []},
        headers=auth_header(owner_a),
    )
    counts = {
        p.id: db.query(ProducerOrderWindow).filter_by(producer_id=p.id).count()
        for p in (producer_a, producer_b)
    }
    assert counts == {producer_a.id: 0, producer_b.id: 2}


def test_windows_routes_refuse_anonymous_and_non_business_callers(client, db, flag_on):
    consumer = make_user(db)
    put_anon = client.put("/producers/me/order-windows", json=valid_windows_payload())
    put_consumer = client.put(
        "/producers/me/order-windows",
        json=valid_windows_payload(),
        headers=auth_header(consumer),
    )
    get_anon = client.get("/producers/me/order-windows")
    get_consumer = client.get(
        "/producers/me/order-windows", headers=auth_header(consumer)
    )
    assert [
        put_anon.status_code,
        put_consumer.status_code,
        get_anon.status_code,
        get_consumer.status_code,
    ] == [401, 403, 401, 403]
    assert db.query(ProducerOrderWindow).count() == 0


def test_a_week_longer_than_the_cap_is_refused_in_hebrew(client, db, flag_on):
    owner, _ = _owner(db)
    window = {
        "weekday": MON,
        "start_time": "10:00",
        "end_time": "11:00",
        "fulfilment": "pickup",
    }
    res = client.put(
        "/producers/me/order-windows",
        json={"windows": [window] * (PRODUCT_ORDER_MAX_WINDOWS + 1)},
        headers=auth_header(owner),
    )
    assert res.status_code == 422
    assert "חלונות זמן" in res.text
    assert db.query(ProducerOrderWindow).count() == 0


@pytest.mark.parametrize(
    ("second", "phrase"),
    [
        (
            {
                "weekday": MON,
                "start_time": "11:00",
                "end_time": "13:00",
                "fulfilment": "pickup",
            },
            "חופפים",
        ),
        (
            {
                "weekday": TUE,
                "start_time": "12:00",
                "end_time": "12:00",
                "fulfilment": "pickup",
            },
            "אחרי שעת ההתחלה",
        ),
    ],
    ids=["two pickup windows overlap on Monday", "a window ends when it starts"],
)
def test_a_week_that_makes_no_sense_is_refused(client, db, flag_on, second, phrase):
    owner, _ = _owner(db)
    body = valid_windows_payload()
    body["windows"].append(second)
    res = client.put(
        "/producers/me/order-windows", json=body, headers=auth_header(owner)
    )
    assert res.status_code == 422
    assert phrase in res.text
    assert db.query(ProducerOrderWindow).count() == 0


def test_pickup_and_delivery_may_share_an_hour(client, db, flag_on):
    owner, _ = _owner(db)
    body = valid_windows_payload()
    body["windows"].append(
        {
            "weekday": MON,
            "start_time": "10:00",
            "end_time": "12:00",
            "fulfilment": "delivery",
        }
    )
    res = client.put(
        "/producers/me/order-windows", json=body, headers=auth_header(owner)
    )
    assert res.status_code == 200
    assert db.query(ProducerOrderWindow).count() == 3


# --- a product's ordering fields ----------------------------------------------


def test_owner_sets_her_products_ordering_fields(client, db, flag_on):
    owner, producer = _owner(db)
    product = Product(producer_id=producer.id, name="גבינה", price_min=120)
    db.add(product)
    db.commit()
    res = client.put(
        f"/producers/me/products/{product.id}/ordering",
        json=valid_ordering_payload(),
        headers=auth_header(owner),
    )
    assert res.status_code == 200
    db.refresh(product)
    assert (product.is_orderable, product.in_stock, product.price_unit) == (
        True,
        False,
        "kg",
    )


def test_another_businesss_product_is_404_and_untouched(client, db, flag_on):
    owner_a, _ = _owner(db)
    _, producer_b = _owner(db)
    theirs = Product(producer_id=producer_b.id, name="יין", price_min=80)
    db.add(theirs)
    db.commit()
    res = client.put(
        f"/producers/me/products/{theirs.id}/ordering",
        json=valid_ordering_payload(),
        headers=auth_header(owner_a),
    )
    assert res.status_code == 404
    db.refresh(theirs)
    assert (theirs.in_stock, theirs.price_unit) == (True, "unit")


def test_product_ordering_refuses_anonymous_and_non_business_callers(
    client, db, flag_on
):
    _, producer = _owner(db)
    product = Product(producer_id=producer.id, name="לחם", price_min=20)
    db.add(product)
    db.commit()
    url = f"/producers/me/products/{product.id}/ordering"
    anon = client.put(url, json=valid_ordering_payload())
    consumer = client.put(
        url, json=valid_ordering_payload(), headers=auth_header(make_user(db))
    )
    assert (anon.status_code, consumer.status_code) == (401, 403)
    db.refresh(product)
    assert product.price_unit == "unit"


def test_a_product_without_a_price_cannot_be_made_orderable(client, db, flag_on):
    owner, producer = _owner(db)
    product = Product(producer_id=producer.id, name="עוגה", is_orderable=False)
    db.add(product)
    db.commit()
    res = client.put(
        f"/producers/me/products/{product.id}/ordering",
        json=valid_ordering_payload(),
        headers=auth_header(owner),
    )
    assert res.status_code == 422
    assert "מחיר" in res.text
    db.refresh(product)
    assert product.is_orderable is False


def test_owner_lists_only_her_own_products_with_their_ordering_fields(
    client, db, flag_on
):
    """MEH-3216 gaps: the orders tab lists her products with two switches."""
    owner, producer = _owner(db)
    _, other = _owner(db)
    db.add_all(
        [
            Product(
                producer_id=producer.id, name="חלה", price_min=28, is_orderable=True
            ),
            Product(producer_id=producer.id, name="עוגה", in_stock=False),
            Product(producer_id=other.id, name="של אחרת", price_min=5),
        ]
    )
    db.commit()
    res = client.get("/producers/me/products/ordering", headers=auth_header(owner))
    assert res.status_code == 200
    rows = {p["name"]: p for p in res.json()["products"]}
    assert set(rows) == {"חלה", "עוגה"}
    assert (rows["חלה"]["has_price"], rows["חלה"]["is_orderable"]) == (True, True)
    assert (rows["עוגה"]["has_price"], rows["עוגה"]["in_stock"]) == (False, False)


def test_the_product_list_refuses_anonymous_and_non_business_callers(
    client, db, flag_on
):
    _, producer = _owner(db)
    db.add(Product(producer_id=producer.id, name="לחם", price_min=20))
    db.commit()
    url = "/producers/me/products/ordering"
    anon = client.get(url)
    consumer = client.get(url, headers=auth_header(make_user(db)))
    assert (anon.status_code, consumer.status_code) == (401, 403)
    assert "לחם" not in anon.text + consumer.text


def test_a_business_with_no_products_gets_an_empty_list(client, db, flag_on):
    owner, _ = _owner(db)
    res = client.get("/producers/me/products/ordering", headers=auth_header(owner))
    assert res.json() == {"products": []}


# --- the public order menu ----------------------------------------------------


def _menu_fixture(db, **settings_fields):
    _, producer = _owner(db)
    _enable(db, producer, lead_time_hours=0, **settings_fields)
    db.add_all(
        [
            Product(producer_id=producer.id, name="חלה", price_min=28, price_max=28),
            Product(
                producer_id=producer.id,
                name="גבינה",
                price_min=110,
                price_max=130,
                price_unit="kg",
            ),
            Product(producer_id=producer.id, name="בלי מחיר"),
            Product(
                producer_id=producer.id,
                name="לא להזמנה",
                price_min=10,
                is_orderable=False,
            ),
            Product(
                producer_id=producer.id, name="יין", price_min=90, contains_alcohol=True
            ),
            ProducerOrderWindow(
                producer_id=producer.id,
                weekday=MON,
                start_time=time(10),
                end_time=time(12),
                fulfilment="pickup",
            ),
        ]
    )
    db.commit()
    return producer


def test_the_menu_lists_only_what_can_be_ordered_with_prices_in_agorot(
    client, db, flag_on, monkeypatch
):
    producer = _menu_fixture(db)
    monkeypatch.setattr(offer_module, "utc_now", lambda: datetime(2026, 11, 15, 8, 0))
    res = client.get(f"/producers/{producer.id}/order-menu")
    assert res.status_code == 200
    menu = res.json()
    by_name = {p["name"]: p for p in menu["products"]}
    assert set(by_name) == {"חלה", "גבינה"}
    assert (
        by_name["חלה"]["price_min_agorot"],
        by_name["חלה"]["price_max_agorot"],
        by_name["חלה"]["price_is_estimate"],
    ) == (2800, 2800, False)
    assert (
        by_name["גבינה"]["price_min_agorot"],
        by_name["גבינה"]["price_max_agorot"],
        by_name["גבינה"]["price_is_estimate"],
    ) == (11000, 13000, True)
    assert [s["start"] for s in menu["slots"]][:2] == [
        "2026-11-16T08:00:00Z",
        "2026-11-16T09:00:00Z",
    ]


def test_the_menu_offers_nothing_on_a_date_the_owner_closed_or_on_vacation(
    client, db, flag_on, monkeypatch
):
    monkeypatch.setattr(offer_module, "utc_now", lambda: datetime(2026, 11, 15, 8, 0))
    producer = _menu_fixture(db)

    def slot_days():
        menu = client.get(f"/producers/{producer.id}/order-menu").json()
        return sorted({s["start"][:10] for s in menu["slots"]})

    assert slot_days() == ["2026-11-16", "2026-11-23"]

    producer.special_hours = {"2026-11-16": {"ranges": [], "note": "סגור"}}
    db.commit()
    assert slot_days() == ["2026-11-23"]

    producer.availability_state = "on_vacation"
    producer.vacation_until = date(2026, 11, 30)
    db.commit()
    assert slot_days() == []


def test_alcohol_is_on_the_menu_only_for_a_licensed_business(client, db, flag_on):
    plain = _menu_fixture(db)
    licensed = _menu_fixture(db, alcohol_licensed=True)
    names = {
        p.id: {
            item["name"]
            for item in client.get(f"/producers/{p.id}/order-menu").json()["products"]
        }
        for p in (plain, licensed)
    }
    assert "יין" not in names[plain.id]
    assert "יין" in names[licensed.id]


def test_a_weighed_product_at_one_price_is_still_an_estimate(client, db, flag_on):
    _, producer = _owner(db)
    _enable(db, producer)
    db.add(
        Product(producer_id=producer.id, name="זיתים", price_min=40, price_unit="kg")
    )
    db.commit()
    menu = client.get(f"/producers/{producer.id}/order-menu").json()
    assert menu["products"][0]["price_is_estimate"] is True


@pytest.mark.parametrize(
    "case",
    ["never enabled", "switched off", "not approved", "test row", "unknown id"],
)
def test_the_menu_is_404_whenever_ordering_is_not_open(client, db, flag_on, case):
    _, producer = _owner(db)
    target = producer.id
    if case == "switched off":
        db.add(ProducerOrderSettings(producer_id=producer.id, enabled=False))
    elif case == "not approved":
        _enable(db, producer)
        producer.status = "pending"
    elif case == "test row":
        _enable(db, producer)
        producer.is_test = True
    elif case == "unknown id":
        _enable(db, producer)
        target = uuid.uuid4()
    db.commit()
    assert client.get(f"/producers/{target}/order-menu").status_code == 404


# --- a business with an open order is not deleted -------------------------------


# Written out, not read from the service: a status dropped from the service's
# tuple must fail here by name.
@pytest.mark.parametrize(
    "open_status", ["pending", "change_proposed", "confirmed", "ready"]
)
def test_owner_cannot_delete_her_account_while_an_order_is_open(
    client, db, open_status
):
    owner, producer = _owner(db)
    _order(db, producer, open_status)
    res = client.post(
        "/auth/me/delete", json={"password": "Zx7Yp9Mq2Lr4"}, headers=auth_header(owner)
    )
    assert res.status_code == 409
    assert "הזמנות פתוחות" in res.text
    db.expire_all()
    assert db.query(Producer).filter(Producer.id == producer.id).count() == 1
    assert db.query(ProductOrder).count() == 1


def test_admin_cannot_delete_a_business_while_an_order_is_open(client, db):
    _, producer = _owner(db)
    _order(db, producer, "confirmed")
    admin = make_user(db, role="admin", email="adm@example.com")
    res = client.delete(f"/admin/producers/{producer.id}", headers=auth_header(admin))
    assert res.status_code == 409
    db.expire_all()
    assert db.query(Producer).filter(Producer.id == producer.id).count() == 1


@pytest.mark.parametrize("who", ["owner", "admin"])
def test_closed_orders_do_not_block_a_delete_and_go_with_the_business(client, db, who):
    owner, producer = _owner(db)
    producer_id = producer.id
    _order(db, producer, "handed")
    _order(db, producer, "cancelled")
    if who == "owner":
        res = client.post(
            "/auth/me/delete",
            json={"password": "Zx7Yp9Mq2Lr4"},
            headers=auth_header(owner),
        )
    else:
        admin = make_user(db, role="admin", email="adm@example.com")
        res = client.delete(
            f"/admin/producers/{producer_id}", headers=auth_header(admin)
        )
    assert res.status_code == 200
    db.expire_all()
    assert db.query(Producer).filter(Producer.id == producer_id).count() == 0
    assert db.query(ProductOrder).count() == 0
