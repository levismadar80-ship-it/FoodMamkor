"""MEH-3510 — what the business-page chat learned after MEH-3481: several
delivery days per city and zones (MEH-3484), the next delivery date computed on
the server (MEH-3485, never by the model), product groups (MEH-3055), the
price unit in the page's words («למארז»), and the business's public events,
workshops and open group buys.

`next_delivery` is checked against frontend/lib/next-delivery.js's rule with
the clock frozen; activities go through the site's own «public» queries, so a
hidden one stays out.
"""

import json
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from conftest import make_producer, make_user

from app.models import Event, Experience, Product
from app.models.catalog import DeliveryArea
from app.models.events import GroupBuy
from app.services import chat_business_context as ctx
from app.services import chat_business_extras as extras
from app.utils.clock import ISRAEL_TZ, israel_today


def _at(weekday_sun0, hour, minute=0):
    # 2026-11-22 is a Sunday.
    return datetime(2026, 11, 22 + weekday_sun0, hour, minute, tzinfo=ISRAEL_TZ)


TUESDAY_ORDERS = {"tuesday": [{"open": "08:00", "close": "18:00"}]}


# ---------- next delivery (pure) ----------


def test_no_order_cutoff_the_next_delivery_day_from_tomorrow():
    # Sunday 10:00, delivers Sunday and Wednesday → Wednesday (today never counts).
    got = extras.next_delivery(["ראשון", "רביעי"], None, False, _at(0, 10))
    assert got == {"date": "2026-11-25", "day": "רביעי"}


def test_one_order_day_the_first_delivery_on_or_after_it():
    # Orders close Tuesday 18:00; delivery Tuesday and Thursday.
    days = ["שלישי", "חמישי"]
    before = extras.next_delivery(days, TUESDAY_ORDERS, False, _at(2, 17, 59))
    assert before == {"date": "2026-11-24", "day": "שלישי"}
    after = extras.next_delivery(days, TUESDAY_ORDERS, False, _at(2, 18, 0))
    assert after == {"date": "2026-12-01", "day": "שלישי"}
    sunday = extras.next_delivery(["חמישי"], TUESDAY_ORDERS, False, _at(0, 9))
    assert sunday == {"date": "2026-11-26", "day": "חמישי"}


def test_two_order_days_are_ambiguous_so_from_tomorrow():
    window = {**TUESDAY_ORDERS, "thursday": [{"open": "08:00", "close": "12:00"}]}
    got = extras.next_delivery(["שני"], window, False, _at(0, 10))
    assert got == {"date": "2026-11-23", "day": "שני"}


def test_vacation_or_no_day_gives_no_date():
    assert extras.next_delivery(["רביעי"], None, True, _at(0, 10)) is None
    assert extras.next_delivery([], None, False, _at(0, 10)) is None


# ---------- facts ----------


def _business(db, **extra):
    p = make_producer(db, name="מאפיית הדגמה", city="חיפה")
    for k, v in extra.items():
        setattr(p, k, v)
    db.add(
        DeliveryArea(
            producer_id=p.id,
            city="קריית ביאליק",
            delivery_day="ראשון",
            delivery_days=["ראשון", "רביעי"],
            zone_name="הקריות",
            free_delivery_above=250,
        )
    )
    db.commit()
    db.refresh(p)
    return p


def test_a_multi_day_city_carries_all_days_zone_and_the_next_date(db):
    p = _business(db)
    area = next(
        a
        for a in ctx.facts(p, "מתי משלוח?", now=_at(0, 10))["delivery"]["areas"]
        if a["city"] == "קריית ביאליק"
    )
    assert area["days"] == ["ראשון", "רביעי"]
    assert area["zone"] == "הקריות"
    assert area["free_above"] == "250 ₪"
    assert area["next_delivery"] == {"date": "2026-11-25", "day": "רביעי"}


def test_on_vacation_no_city_has_a_next_date(db):
    p = _business(
        db,
        availability_state="on_vacation",
        vacation_until=israel_today() + timedelta(days=5),
    )
    areas = ctx.facts(p, "מתי משלוח?", now=_at(0, 10))["delivery"]["areas"]
    assert areas and all(a["next_delivery"] is None for a in areas)


def test_the_price_unit_is_the_page_word_and_the_group_is_named(db):
    p = make_producer(db, name="מאפיית הדגמה")
    p.product_groups = [{"id": "g1", "name": "עוגות"}]
    db.add_all(
        [
            Product(
                producer_id=p.id,
                name="מארז עוגיות",
                price_min=60,
                price_unit="pack",
                group_id="g1",
            ),
            Product(producer_id=p.id, name="לחם", price_min=20, price_unit="kg"),
        ]
    )
    db.commit()
    db.refresh(p)
    items = {i["name"]: i for i in ctx.facts(p, "מה יש?")["products"]}
    assert items["מארז עוגיות"]["per"] == "למארז"
    assert items["מארז עוגיות"]["group"] == "עוגות"
    assert items["לחם"]["per"] == "לק״ג" and "group" not in items["לחם"]


# ---------- activities ----------


def _host(db, producer):
    host = make_user(db, email=f"host-{uuid4().hex[:8]}@example.com")
    host.producer_id = producer.id
    db.commit()
    return host


def _experience(db, host, **extra):
    fields = {
        "title": "סדנת מחמצת",
        "description": "סדנה מעשית של שלוש שעות, מהתחלה ועד הסוף.",
        "category": "בישול",
        "host_user_id": host.id,
        "event_date": israel_today() + timedelta(days=7),
        "location_type": "home",
        "city": "חיפה",
        "max_participants": 10,
        "price_per_person": Decimal(150),
        "status": "approved",
        "moderation_status": "APPROVED",
        **extra,
    }
    db.add(Experience(**fields))


def _group_buy(db, producer, title, **extra):
    fields = {
        "producer_id": producer.id,
        "title": title,
        "product_name": "קמח מלא",
        "price_per_unit_regular": 120,
        "price_per_unit_group": 90,
        "min_participants": 5,
        "deadline": datetime.now(UTC) + timedelta(days=3),
        "status": "open",
        **extra,
    }
    db.add(GroupBuy(**fields))


def test_public_activities_reach_the_chat_and_hidden_ones_do_not(db):
    p = make_producer(db, name="מאפיית הדגמה")
    host = _host(db, p)
    future = israel_today() + timedelta(days=10)
    db.add_all(
        [
            Event(
                producer_id=p.id,
                title="שוק איכרים",
                event_date=future,
                price=0,
                category="שוק",
            ),
            Event(
                producer_id=p.id,
                title="אירוע שבוטל",
                event_date=future,
                is_active=False,
                category="שוק",
            ),
            Event(
                producer_id=p.id,
                title="אירוע שעבר",
                event_date=israel_today() - timedelta(days=1),
                category="שוק",
            ),
        ]
    )
    _experience(db, host)
    _experience(db, host, title="סדנה שממתינה", status="pending")
    _experience(
        db,
        host,
        title="סדנה כל שישי",
        event_date=israel_today() - timedelta(days=30),
        is_recurring=True,
        recurring_schedule="כל שישי 9:00-12:00",
    )
    _group_buy(db, p, "רכש קמח")
    _group_buy(db, p, "רכש שנסגר", status="fulfilled")
    _group_buy(
        db,
        p,
        "רכש שעבר זמנו",
        deadline=datetime.now(UTC) - timedelta(hours=1),
    )
    db.commit()
    db.refresh(p)

    got = ctx.facts(p, "יש סדנאות?")["activities"]
    assert [e["title"] for e in got["events"]] == ["שוק איכרים"]
    assert got["events"][0]["price"] == "חינם"
    workshops = {w["title"]: w for w in got["workshops_and_experiences"]}
    assert set(workshops) == {"סדנת מחמצת", "סדנה כל שישי"}
    assert workshops["סדנת מחמצת"]["price_per_person"] == "150.00 ₪"
    assert workshops["סדנה כל שישי"]["recurring"] == "כל שישי 9:00-12:00"
    assert workshops["סדנה כל שישי"]["date"] is None
    assert [g["title"] for g in got["open_group_buys"]] == ["רכש קמח"]


def test_another_business_activities_stay_out_and_none_is_null(db):
    mine = make_producer(db, name="מאפיית הדגמה")
    other = make_producer(db, name="חוות אחרת")
    db.add(
        Event(
            producer_id=other.id,
            title="שוק של מישהו אחר",
            event_date=date(2099, 1, 1),
            category="שוק",
        )
    )
    db.commit()
    db.refresh(mine)
    assert ctx.facts(mine, "יש אירועים?")["activities"] is None


def test_the_preamble_says_the_dates_are_computed_and_reviews_are_opinions():
    assert "next_delivery" in ctx.PREAMBLE
    assert "activities" in ctx.PREAMBLE
    assert "reviews" in ctx.PREAMBLE
    assert "לקוחות כתבו ש" in ctx.PREAMBLE
    assert "אל תציגי ביקורת כעובדה" in ctx.PREAMBLE


def test_the_order_cutoff_moves_the_next_delivery_through_facts(db):
    p = _business(db, order_window=TUESDAY_ORDERS)

    def wednesday_after(now):
        areas = ctx.facts(p, "מתי משלוח?", now=now)["delivery"]["areas"]
        return next(a for a in areas if a["city"] == "קריית ביאליק")["next_delivery"]

    assert wednesday_after(_at(2, 17, 59)) == {"date": "2026-11-25", "day": "רביעי"}
    assert wednesday_after(_at(2, 18, 0)) == {"date": "2026-12-02", "day": "רביעי"}


def test_a_producer_without_a_db_session_gives_no_activities_or_reviews():
    bare = SimpleNamespace(id=uuid4())
    assert extras.activities(bare) is None
    assert extras.reviews(bare) is None
    area = SimpleNamespace(
        city="חיפה", delivery_day="שני", min_order=None, delivery_fee=None
    )
    producer = SimpleNamespace(
        offers_delivery=True,
        delivery_nationwide=False,
        delivery_excluded_cities=None,
        delivery_areas=[area],
        delivery_fee=None,
        free_delivery_above=None,
    )
    got = ctx._delivery(producer, False, _at(0, 10))["areas"][0]
    assert got["zone"] is None and got["free_above"] is None
    assert got["next_delivery"] == {"date": "2026-11-23", "day": "שני"}


def test_a_group_buy_deadline_is_the_israel_date(db):
    p = make_producer(db, name="מאפיית הדגמה")
    late = datetime.now(UTC).replace(hour=22, minute=30, second=0, microsecond=0)
    late += timedelta(days=3)
    _group_buy(db, p, "קמח בקבוצה", deadline=late.replace(tzinfo=None))
    db.commit()
    buys = extras.activities(p)["open_group_buys"]
    assert buys[0]["until"] == late.astimezone(ISRAEL_TZ).date().isoformat()
    assert buys[0]["until"] != late.date().isoformat()


# ---------- reviews ----------


def test_the_reviews_the_page_shows_without_names_and_hidden_ones_out(db):
    from app.models.engagement import ProducerReview

    p = make_producer(db, name="מאפיית הדגמה")
    writer = make_user(db, email=f"r-{uuid4().hex[:8]}@example.com", name="שם המבקרת")
    hider = make_user(db, email=f"h-{uuid4().hex[:8]}@example.com")
    db.add_all(
        [
            ProducerReview(
                producer_id=p.id,
                user_id=writer.id,
                stars=5,
                body="הלחם הכי טרי שיש",
                reply="תודה רבה!",
            ),
            ProducerReview(
                producer_id=p.id,
                user_id=hider.id,
                stars=1,
                body="ביקורת מוסתרת",
                is_hidden=True,
            ),
        ]
    )
    p.avg_rating, p.reviews_count = 5.0, 1
    db.commit()
    db.refresh(p)
    got = ctx.facts(p, "מה אומרים על הלחם?")
    assert got["reviews"] == [
        {"stars": 5, "text": "הלחם הכי טרי שיש", "business_reply": "תודה רבה!"}
    ]
    assert got["rating"] == {"average": 5.0, "count": 1}
    assert "שם המבקרת" not in json.dumps(got, ensure_ascii=False)


def test_no_reviews_is_null(db):
    p = make_producer(db, name="מאפיית הדגמה")
    got = ctx.facts(p, "ביקורות?")
    assert got["reviews"] is None and got["rating"] is None
