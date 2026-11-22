"""MEH-3618 — a product made only on some days (challah on Friday).

The cells of the card's acceptance_criteria:
NULL mask = no change · a cart with 0 limited products / 1 / many with a
shared day / many with none · the weekday is the Israel clock's (Thursday
23:30 Israel = Thursday 21:30 UTC is Thursday; Friday 00:30 Israel is Friday
although its UTC date is Thursday) · mask ↔ days is a property test · only
the owner or an admin writes the mask (IDOR).
"""

import uuid
from datetime import datetime

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.models.product_orders import ProductOrder
from app.services import chat_business_context
from app.services import product_weekdays as pw
from app.utils import weekdays as wd
from _test_meh3263_order_route__common import (  # noqa: F401 — fixtures
    Shop,
    code_for,
    flag_on,
    sent,
    slot_of,
    valid_order_payload,
)
from tests.conftest import auth_header, make_producer, make_user

FRIDAY_ONLY = 1 << 5  # 32
THURSDAY = 4
FRIDAY = 5


def _bit(weekday):
    return 1 << weekday


def _slot_and_day(client, shop):
    slot = slot_of(client, shop)
    return slot, pw.slot_weekday(datetime.fromisoformat(slot))


def _order(client, shop, sent, slot, items):
    body = valid_order_payload(shop, slot, code_for(client, shop, sent), items=items)
    return client.post("/product-orders", json=body)


def _line(product, qty=1):
    return {"product_id": str(product.id), "qty": qty}


def _limit(db, product, mask):
    product.available_weekdays = mask
    db.commit()


# --- NULL mask: no change -----------------------------------------------------


def test_null_mask_orders_and_reads_exactly_as_before(client, db, flag_on, sent):
    shop = Shop(db)
    menu = client.get(f"/producers/{shop.id}/order-menu").json()
    bread = next(p for p in menu["products"] if p["id"] == str(shop.bread.id))
    assert bread["available_weekdays"] is None
    slot, _ = _slot_and_day(client, shop)
    res = _order(client, shop, sent, slot, [_line(shop.bread, 2)])
    assert res.status_code == 201, res.text
    mine = client.get("/producers/me/products", headers=shop.headers).json()
    assert next(p for p in mine if p["id"] == str(shop.bread.id))[
        "available_weekdays"
    ] is None


# --- the cart: 0 / 1 / many with a shared day / many without -------------------


def test_zero_limited_products_in_the_cart_order_on_any_offered_day(
    client, db, flag_on, sent
):
    shop = Shop(db)
    _limit(db, shop.wine, FRIDAY_ONLY)  # limited, but not in the cart
    slot, _ = _slot_and_day(client, shop)
    res = _order(client, shop, sent, slot, [_line(shop.bread), _line(shop.cheese)])
    assert res.status_code == 201, res.text


def test_one_limited_product_orders_on_its_day_and_not_on_another(
    client, db, flag_on, sent
):
    shop = Shop(db)
    slot, day = _slot_and_day(client, shop)
    _limit(db, shop.bread, _bit((day + 1) % 7))  # made only the day after
    refused = _order(client, shop, sent, slot, [_line(shop.bread)])
    assert refused.status_code == 409
    assert refused.json()["detail"] == pw.day_closed_detail("חלה")
    assert db.query(ProductOrder).count() == 0

    _limit(db, shop.bread, _bit(day) | _bit((day + 1) % 7))
    ok = _order(client, shop, sent, slot, [_line(shop.bread)])
    assert ok.status_code == 201, ok.text


def test_many_limited_products_with_a_shared_day_order_on_it(
    client, db, flag_on, sent
):
    shop = Shop(db)
    slot, day = _slot_and_day(client, shop)
    _limit(db, shop.bread, _bit(day) | _bit((day + 2) % 7))
    _limit(db, shop.cheese, _bit(day) | _bit((day + 3) % 7))
    res = _order(client, shop, sent, slot, [_line(shop.bread), _line(shop.cheese)])
    assert res.status_code == 201, res.text


def test_many_limited_products_with_no_shared_day_are_refused_by_name(
    client, db, flag_on, sent
):
    shop = Shop(db)
    slot, day = _slot_and_day(client, shop)
    _limit(db, shop.bread, _bit(day))
    _limit(db, shop.cheese, _bit((day + 1) % 7))
    res = _order(client, shop, sent, slot, [_line(shop.bread), _line(shop.cheese)])
    assert res.status_code == 409
    assert res.json()["detail"] == pw.day_closed_detail("גבינה")
    assert db.query(ProductOrder).count() == 0


# --- the Israel clock -----------------------------------------------------------


def test_thursday_2330_israel_is_thursday():
    # Winter (UTC+2): Thursday 19/11/2026 23:30 Israel = 21:30 UTC.
    assert pw.slot_weekday(datetime(2026, 11, 19, 21, 30)) == THURSDAY


def test_friday_0030_israel_is_friday_although_its_utc_date_is_thursday():
    # 00:30 Friday Israel = 22:30 Thursday UTC; the UTC date would say Thursday.
    start = datetime(2026, 11, 19, 22, 30)
    assert start.weekday() == 3  # Thursday on the UTC calendar
    assert pw.slot_weekday(start) == FRIDAY
    assert not wd.is_open(_bit(THURSDAY), pw.slot_weekday(start))


def test_summer_time_keeps_the_israel_day():
    # Summer (UTC+3): Friday 17/07/2026 00:30 Israel = Thursday 21:30 UTC.
    assert pw.slot_weekday(datetime(2026, 7, 16, 21, 30)) == FRIDAY
    assert pw.slot_weekday(datetime(2026, 7, 16, 20, 30)) == THURSDAY


# --- mask ↔ days ----------------------------------------------------------------


@given(st.integers(min_value=1, max_value=wd.ALL_DAYS_MASK - 1))
def test_a_mask_survives_the_round_trip_through_its_days(mask):
    days = wd.days_of(mask)
    assert days == sorted(set(days))
    assert all(0 <= d < wd.DAYS_IN_WEEK for d in days)
    assert wd.mask_of(days) == mask
    # Independent oracle: the bits of the number, read Sunday first.
    assert days == [d for d in range(7) if format(mask, "07b")[::-1][d] == "1"]


@given(st.sets(st.integers(min_value=0, max_value=6), min_size=1))
def test_days_survive_the_round_trip_through_their_mask(days):
    mask = wd.mask_of(days)
    if len(days) == wd.DAYS_IN_WEEK:
        assert mask is None  # one spelling of «every day»
        assert wd.days_of(mask) == list(range(7))
    else:
        assert 1 <= mask <= wd.ALL_DAYS_MASK - 1
        assert wd.days_of(mask) == sorted(days)
    for d in range(7):
        assert wd.is_open(mask, d) == (d in days)


def test_no_day_is_refused():
    with pytest.raises(ValueError):
        wd.mask_of([])
    for bad in (0, -1, 128, True):
        with pytest.raises(ValueError):
            wd.weekdays_mask(bad)
    assert wd.weekdays_mask(127) is None
    assert wd.weekdays_mask(None) is None


# --- writing the mask: owner / admin / anyone else ------------------------------


def _put(client, product, headers, mask):
    return client.put(
        f"/producers/me/products/{product.id}",
        json={"available_weekdays": mask},
        headers=headers,
    )


def test_owner_sets_clears_and_cannot_save_no_day(client, db):
    shop = Shop(db)
    res = _put(client, shop.bread, shop.headers, FRIDAY_ONLY)
    assert res.status_code == 200, res.text
    assert res.json()["available_weekdays"] == FRIDAY_ONLY
    # A PUT that does not send it keeps it.
    kept = client.put(
        f"/producers/me/products/{shop.bread.id}",
        json={"name": "חלה מתוקה"},
        headers=shop.headers,
    )
    assert kept.json()["available_weekdays"] == FRIDAY_ONLY
    # No day, or a bit past Saturday: refused, nothing written.
    for bad in (0, 128):
        assert _put(client, shop.bread, shop.headers, bad).status_code == 422
    db.refresh(shop.bread)
    assert shop.bread.available_weekdays == FRIDAY_ONLY
    # Every day is stored as NULL, and null clears.
    assert _put(client, shop.bread, shop.headers, 127).json()["available_weekdays"] is None
    _put(client, shop.bread, shop.headers, FRIDAY_ONLY)
    assert _put(client, shop.bread, shop.headers, None).json()["available_weekdays"] is None


def test_another_business_cannot_write_the_mask(client, db):
    shop = Shop(db)
    other = make_producer(db, name="אחרת")
    owner = make_user(db, role="producer", email=f"x{uuid.uuid4().hex[:8]}@example.com")
    owner.producer_id = other.id
    db.commit()
    assert _put(client, shop.bread, auth_header(owner), FRIDAY_ONLY).status_code == 404
    db.refresh(shop.bread)
    assert shop.bread.available_weekdays is None


def test_a_consumer_or_nobody_cannot_write_the_mask(client, db):
    shop = Shop(db)
    consumer = make_user(db, role="consumer", email=f"c{uuid.uuid4().hex[:8]}@example.com")
    assert _put(client, shop.bread, auth_header(consumer), FRIDAY_ONLY).status_code == 403
    assert _put(client, shop.bread, {}, FRIDAY_ONLY).status_code == 401
    db.refresh(shop.bread)
    assert shop.bread.available_weekdays is None


def test_an_admin_sets_the_mask_on_a_draft_business_product(client, db):
    draft = make_producer(db, status="draft")
    admin = make_user(db, role="admin", email=f"a{uuid.uuid4().hex[:8]}@example.com")
    res = client.post(
        f"/admin/producers/{draft.id}/products",
        json={"name": "חלה", "price_min": "28", "available_weekdays": FRIDAY_ONLY},
        headers=auth_header(admin),
    )
    assert res.status_code == 201, res.text
    assert res.json()["available_weekdays"] == FRIDAY_ONLY


# --- the assistant chat ---------------------------------------------------------


def test_the_chat_names_the_days_only_for_a_limited_product(db):
    shop = Shop(db)
    assert "made_only_on_days" not in chat_business_context._product(shop.bread)
    _limit(db, shop.bread, _bit(THURSDAY) | FRIDAY_ONLY)
    facts = chat_business_context._product(shop.bread)
    assert facts["made_only_on_days"] == ["חמישי", "שישי"]


# --- the Israel clock, end to end ------------------------------------------------

# Thursday 19/11/2026 20:00 UTC = 22:00 Israel. Thursday's 08–20 window is over;
# the next slot is Friday 00:00 Israel, whose UTC date is still Thursday.
_THURSDAY_EVENING_UTC = datetime(2026, 11, 19, 20, 0)
_FRIDAY_MIDNIGHT_UTC = "2026-11-19T22:00:00"


def _friday_midnight_slot(client, db, monkeypatch, shop):
    from datetime import time

    from app.models.product_orders import ProducerOrderWindow
    from app.routers import product_order_offer
    from app.services import product_order_create

    for mod in (product_order_offer, product_order_create):
        monkeypatch.setattr(mod, "utc_now", lambda: _THURSDAY_EVENING_UTC)
    db.add(
        ProducerOrderWindow(
            producer_id=shop.producer.id,
            weekday=FRIDAY,
            start_time=time(0),
            end_time=time(1),
            fulfilment="pickup",
        )
    )
    db.commit()
    menu = client.get(f"/producers/{shop.id}/order-menu").json()
    starts = [s["start"] for s in menu["slots"] if s["fulfilment"] == "pickup"]
    slot = next(s for s in starts if s.startswith(_FRIDAY_MIDNIGHT_UTC))
    assert slot == starts[0]  # the first slot offered, on the UTC Thursday
    return slot


def test_a_friday_only_product_orders_the_friday_midnight_slot(
    client, db, flag_on, sent, monkeypatch
):
    shop = Shop(db)
    _limit(db, shop.bread, FRIDAY_ONLY)
    slot = _friday_midnight_slot(client, db, monkeypatch, shop)
    res = _order(client, shop, sent, slot, [_line(shop.bread)])
    assert res.status_code == 201, res.text


def test_a_thursday_only_product_cannot_take_the_friday_midnight_slot(
    client, db, flag_on, sent, monkeypatch
):
    shop = Shop(db)
    _limit(db, shop.bread, _bit(THURSDAY))
    slot = _friday_midnight_slot(client, db, monkeypatch, shop)
    res = _order(client, shop, sent, slot, [_line(shop.bread)])
    assert res.status_code == 409
    assert res.json()["detail"] == pw.day_closed_detail("חלה")


def test_the_product_named_is_the_first_closed_line(client, db, flag_on, sent):
    shop = Shop(db)
    slot, day = _slot_and_day(client, shop)
    closed = _bit((day + 1) % 7)
    _limit(db, shop.bread, closed)
    _limit(db, shop.cheese, closed)
    first_cheese = _order(client, shop, sent, slot, [_line(shop.cheese), _line(shop.bread)])
    assert first_cheese.json()["detail"] == pw.day_closed_detail("גבינה")
    first_bread = _order(client, shop, sent, slot, [_line(shop.bread), _line(shop.cheese)])
    assert first_bread.json()["detail"] == pw.day_closed_detail("חלה")


def test_true_is_not_a_mask(client, db):
    shop = Shop(db)
    assert _put(client, shop.bread, shop.headers, True).status_code == 422
    db.refresh(shop.bread)
    assert shop.bread.available_weekdays is None
