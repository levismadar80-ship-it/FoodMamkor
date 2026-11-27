"""Daily stock (Fischgrund bakery, 27/11/2026) — how many of a product, or
of one of its variants, can be ordered for one pickup day.

The cells of the card's acceptance_criteria:
no limit = no change · limit 1: the first order fills it, the second is
refused that day and open on another · a variant counts alone, the product
across its variants · declined / cancelled / expired give units back ·
"only N left" vs "sold out" · the menu reports units left per offered day ·
the owner sets limits only on her own product and its own variants · the
prep list: 0 days / one / many lines, confirmed apart from waiting ·
the new-order email names what sold out.
"""

import uuid
from datetime import date, datetime, timedelta

from app.models.catalog import ProductVariant
from app.models.product_orders import ProductOrder, ProductOrderItem
from app.services import product_daily_stock as ds
from app.services import product_order_outbox as outbox
from _test_meh3263_order_route__common import (  # noqa: F401 — fixtures
    OTHER_PHONE,
    Shop,
    code_for,
    flag_on,
    sent,
    slot_of,
    stored_order,
    valid_order_payload,
)
from tests.conftest import auth_header, make_producer, make_user


def _order(client, shop, sent, slot, items, phone=None):
    code = (
        code_for(client, shop, sent, phone) if phone else code_for(client, shop, sent)
    )
    over = {"items": items}
    if phone:
        over["phone"] = phone
    body = valid_order_payload(shop, slot, code, **over)
    return client.post("/product-orders", json=body)


def _line(product, qty=1, variant=None):
    out = {"product_id": str(product.id), "qty": qty}
    if variant is not None:
        out["variant_id"] = str(variant.id)
    return out


def _booked(db, shop, slot, product, qty, status="pending", variant=None):
    """An order already on the books for the slot's day."""
    start = datetime.fromisoformat(slot).replace(tzinfo=None)
    order = stored_order(
        db, shop, status=status, slot_start=start, slot_end=start + timedelta(hours=1)
    )
    db.add(
        ProductOrderItem(
            order_id=order.id,
            product_id=product.id,
            name=product.name,
            variant_id=variant.id if variant else None,
            variant_name=variant.name if variant else None,
            unit_price_agorot=2800,
            price_unit="unit",
            qty=qty,
        )
    )
    db.commit()
    return order


def _variants(db, product, *names):
    made = []
    for position, name in enumerate(names):
        v = ProductVariant(product_id=product.id, name=name, position=position)
        db.add(v)
        made.append(v)
    db.commit()
    return made


def _menu(client, shop):
    return client.get(f"/producers/{shop.id}/order-menu").json()


def _day_of(slot):
    return ds.israel_day(datetime.fromisoformat(slot)).isoformat()


# --- no limit: no change ----------------------------------------------------


def test_no_limit_orders_and_menu_as_before(client, db, flag_on, sent):
    shop = Shop(db)
    slot = slot_of(client, shop)
    _booked(db, shop, slot, shop.bread, 50)
    assert _menu(client, shop)["stock"] == []
    res = _order(client, shop, sent, slot, [_line(shop.bread, 30)])
    assert res.status_code == 201, res.text


# --- the product's limit ----------------------------------------------------


def test_limit_one_first_order_fills_the_day_second_is_refused(
    client, db, flag_on, sent
):
    shop = Shop(db)
    shop.bread.daily_limit = 1
    db.commit()
    slot = slot_of(client, shop)
    first = _order(client, shop, sent, slot, [_line(shop.bread)])
    assert first.status_code == 201, first.text
    second = _order(client, shop, sent, slot, [_line(shop.bread)], phone=OTHER_PHONE)
    assert second.status_code == 409
    assert second.json()["detail"] == ds.sold_out_detail("חלה")


def test_a_full_day_leaves_another_day_open(client, db, flag_on, sent):
    shop = Shop(db)
    shop.bread.daily_limit = 2
    db.commit()
    slot = slot_of(client, shop)
    _booked(db, shop, slot, shop.bread, 2)
    menu = _menu(client, shop)
    other = next(
        s["start"]
        for s in menu["slots"]
        if s["fulfilment"] == "pickup" and _day_of(s["start"]) != _day_of(slot)
    )
    res = _order(client, shop, sent, other, [_line(shop.bread, 2)])
    assert res.status_code == 201, res.text


def test_asking_more_than_left_names_what_is_left(client, db, flag_on, sent):
    shop = Shop(db)
    shop.bread.daily_limit = 5
    db.commit()
    slot = slot_of(client, shop)
    _booked(db, shop, slot, shop.bread, 3)
    res = _order(client, shop, sent, slot, [_line(shop.bread, 3)])
    assert res.status_code == 409
    assert res.json()["detail"] == ds.only_left_detail("חלה", 2)
    ok = _order(client, shop, sent, slot, [_line(shop.bread, 2)])
    assert ok.status_code == 201, ok.text


def test_closed_orders_give_their_units_back(client, db, flag_on, sent):
    shop = Shop(db)
    shop.bread.daily_limit = 2
    db.commit()
    slot = slot_of(client, shop)
    for state in ("declined", "cancelled", "expired", "no_show"):
        _booked(db, shop, slot, shop.bread, 2, status=state)
    res = _order(client, shop, sent, slot, [_line(shop.bread, 2)])
    assert res.status_code == 201, res.text


def test_handed_and_confirmed_orders_keep_their_units(client, db, flag_on, sent):
    shop = Shop(db)
    shop.bread.daily_limit = 2
    db.commit()
    slot = slot_of(client, shop)
    _booked(db, shop, slot, shop.bread, 1, status="handed")
    _booked(db, shop, slot, shop.bread, 1, status="confirmed")
    res = _order(client, shop, sent, slot, [_line(shop.bread)])
    assert res.status_code == 409


# --- variants -----------------------------------------------------------------


def test_a_variant_limit_counts_that_variant_alone(client, db, flag_on, sent):
    shop = Shop(db)
    plain, olives = _variants(db, shop.bread, "רגיל", "זיתים")
    olives.daily_limit = 1
    db.commit()
    slot = slot_of(client, shop)
    _booked(db, shop, slot, shop.bread, 5, variant=plain)
    ok = _order(client, shop, sent, slot, [_line(shop.bread, 1, olives)])
    assert ok.status_code == 201, ok.text
    refused = _order(
        client, shop, sent, slot, [_line(shop.bread, 1, olives)], phone=OTHER_PHONE
    )
    assert refused.status_code == 409
    assert refused.json()["detail"] == ds.sold_out_detail("חלה – זיתים")


def test_the_product_limit_counts_across_its_variants(client, db, flag_on, sent):
    shop = Shop(db)
    plain, olives = _variants(db, shop.bread, "רגיל", "זיתים")
    shop.bread.daily_limit = 3
    db.commit()
    slot = slot_of(client, shop)
    _booked(db, shop, slot, shop.bread, 2, variant=plain)
    res = _order(
        client,
        shop,
        sent,
        slot,
        [_line(shop.bread, 1, plain), _line(shop.bread, 1, olives)],
    )
    assert res.status_code == 409
    assert res.json()["detail"] == ds.only_left_detail("חלה", 1)


# --- the menu -----------------------------------------------------------------


def test_menu_reports_units_left_per_offered_day(client, db, flag_on, sent):
    shop = Shop(db)
    (olives,) = _variants(db, shop.bread, "זיתים")
    shop.bread.daily_limit = 10
    olives.daily_limit = 4
    db.commit()
    slot = slot_of(client, shop)
    _booked(db, shop, slot, shop.bread, 3, variant=olives)
    stock = _menu(client, shop)["stock"]
    day = _day_of(slot)
    left = {(r["day"], r["variant_id"]): r["left"] for r in stock}
    assert left[(day, None)] == 7
    assert left[(day, str(olives.id))] == 1
    # Another offered day is untouched.
    other_days = {r["day"] for r in stock} - {day}
    assert other_days
    assert all(
        left[(d, None)] == 10 and left[(d, str(olives.id))] == 4 for d in other_days
    )


# --- the owner sets limits ------------------------------------------------------


def _put(client, shop, product, **over):
    body = {
        "is_orderable": True,
        "in_stock": True,
        "contains_alcohol": False,
        **over,
    }
    return client.put(
        f"/producers/me/products/{product.id}/ordering", json=body, headers=shop.headers
    )


def test_owner_sets_and_clears_product_and_variant_limits(client, db, flag_on):
    shop = Shop(db)
    (olives,) = _variants(db, shop.bread, "זיתים")
    res = _put(
        client,
        shop,
        shop.bread,
        daily_limit=20,
        variant_limits=[{"id": str(olives.id), "daily_limit": 8}],
    )
    assert res.status_code == 200, res.text
    assert res.json()["daily_limit"] == 20
    assert res.json()["variants"][0]["daily_limit"] == 8
    listed = client.get("/producers/me/products/ordering", headers=shop.headers).json()
    bread = next(p for p in listed["products"] if p["id"] == str(shop.bread.id))
    assert bread["daily_limit"] == 20
    # Omitted = keep; null = no limit.
    kept = _put(client, shop, shop.bread)
    assert kept.json()["daily_limit"] == 20
    cleared = _put(
        client,
        shop,
        shop.bread,
        daily_limit=None,
        variant_limits=[{"id": str(olives.id), "daily_limit": None}],
    )
    assert cleared.json()["daily_limit"] is None
    assert cleared.json()["variants"][0]["daily_limit"] is None


def test_limit_out_of_range_is_refused(client, db, flag_on):
    shop = Shop(db)
    assert _put(client, shop, shop.bread, daily_limit=0).status_code == 422
    assert _put(client, shop, shop.bread, daily_limit=1000).status_code == 422


def test_a_variant_of_another_product_is_not_written(client, db, flag_on):
    shop = Shop(db)
    (other,) = _variants(db, shop.cheese, "צעירה")
    res = _put(
        client,
        shop,
        shop.bread,
        variant_limits=[{"id": str(other.id), "daily_limit": 3}],
    )
    assert res.status_code == 404
    db.refresh(other)
    assert other.daily_limit is None


def test_another_business_cannot_set_my_limit(client, db, flag_on):
    shop = Shop(db)
    stranger = make_user(
        db, role="producer", email=f"s{uuid.uuid4().hex[:8]}@example.com"
    )
    stranger.producer_id = make_producer(db, name="אחר").id
    stranger.is_producer = True
    db.commit()
    res = client.put(
        f"/producers/me/products/{shop.bread.id}/ordering",
        json={
            "is_orderable": True,
            "in_stock": True,
            "contains_alcohol": False,
            "daily_limit": 1,
        },
        headers=auth_header(stranger),
    )
    assert res.status_code == 404
    db.refresh(shop.bread)
    assert shop.bread.daily_limit is None


# --- the prep list «מה להכין» -----------------------------------------------------


def _prep(client, shop):
    res = client.get("/producers/me/orders/prep", headers=shop.headers)
    assert res.status_code == 200, res.text
    return res.json()["days"]


def test_prep_list_empty_with_no_orders(client, db, flag_on):
    assert _prep(client, Shop(db)) == []


def test_prep_list_one_line_confirmed_apart_from_waiting(client, db, flag_on):
    shop = Shop(db)
    shop.bread.daily_limit = 20
    db.commit()
    slot = slot_of(client, shop)
    _booked(db, shop, slot, shop.bread, 3, status="confirmed")
    _booked(db, shop, slot, shop.bread, 2, status="pending")
    _booked(db, shop, slot, shop.bread, 9, status="declined")
    days = _prep(client, shop)
    assert [d["day"] for d in days] == [_day_of(slot)]
    (line,) = days[0]["lines"]
    assert (line["name"], line["confirmed"], line["waiting"], line["limit"]) == (
        "חלה",
        3,
        2,
        20,
    )


def test_prep_list_many_lines_by_variant(client, db, flag_on):
    shop = Shop(db)
    plain, olives = _variants(db, shop.bread, "רגיל", "זיתים")
    olives.daily_limit = 5
    db.commit()
    slot = slot_of(client, shop)
    _booked(db, shop, slot, shop.bread, 4, status="confirmed", variant=plain)
    _booked(db, shop, slot, shop.bread, 1, status="ready", variant=olives)
    _booked(db, shop, slot, shop.cheese, 2, status="pending")
    (day,) = _prep(client, shop)
    got = {
        (l["name"], l["variant_name"]): (l["confirmed"], l["waiting"], l["limit"])
        for l in day["lines"]
    }
    assert got == {
        ("חלה", "רגיל"): (4, 0, None),
        ("חלה", "זיתים"): (1, 0, 5),
        ("גבינה", None): (0, 2, None),
    }


def test_prep_list_leaves_out_days_past_the_week(client, db, flag_on):
    shop = Shop(db)
    slot = slot_of(client, shop)
    _booked(db, shop, slot, shop.bread, 3, status="confirmed")
    long_ago = ds.israel_day(datetime.fromisoformat(slot)) - timedelta(days=30)
    days = ds.prep_list(db, shop.producer.id, long_ago)
    assert days == []


# --- the new-order email --------------------------------------------------------


def test_new_order_email_names_what_sold_out(client, db, flag_on, sent):
    shop = Shop(db)
    shop.bread.daily_limit = 2
    db.commit()
    slot = slot_of(client, shop)
    res = _order(client, shop, sent, slot, [_line(shop.bread, 2)])
    assert res.status_code == 201, res.text
    order = db.query(ProductOrder).one()
    line = outbox.sold_out_line(db, order)
    assert "«חלה»" in line and "כבר אזל" in line


def test_new_order_email_says_nothing_while_units_are_left(client, db, flag_on, sent):
    shop = Shop(db)
    shop.bread.daily_limit = 3
    db.commit()
    slot = slot_of(client, shop)
    res = _order(client, shop, sent, slot, [_line(shop.bread, 2)])
    assert res.status_code == 201, res.text
    assert outbox.sold_out_line(db, db.query(ProductOrder).one()) == ""


# --- the Israel day ---------------------------------------------------------------


def test_israel_day_of_a_late_utc_start_is_the_next_date():
    # 22:30 UTC Thursday 19/11 = 00:30 Friday 20/11 in Israel (winter).
    assert ds.israel_day(datetime(2026, 11, 19, 22, 30)) == date(2026, 11, 20)


def test_booked_counts_on_the_israel_day_across_midnight(db):
    # Winter (UTC+2): 21:30 UTC is 23:30 on 3/12, 22:30 UTC is 00:30 on 4/12.
    shop = Shop(db)
    late = "2026-12-03T21:30:00+00:00"
    after_midnight = "2026-12-03T22:30:00+00:00"
    _booked(db, shop, late, shop.bread, 1)
    _booked(db, shop, after_midnight, shop.bread, 2)
    taken = ds.booked(db, shop.producer.id, [date(2026, 12, 3), date(2026, 12, 4)])
    assert taken.product[(date(2026, 12, 3), shop.bread.id)] == 1
    assert taken.product[(date(2026, 12, 4), shop.bread.id)] == 2


def test_every_open_status_holds_units_and_closed_ones_do_not(db):
    shop = Shop(db)
    slot = "2026-12-03T10:00:00+00:00"
    held = ("pending", "change_proposed", "confirmed", "ready", "handed")
    for state in (*held, "declined", "cancelled", "expired", "no_show"):
        _booked(db, shop, slot, shop.bread, 1, status=state)
    taken = ds.booked(db, shop.producer.id, [date(2026, 12, 3)])
    assert taken.product[(date(2026, 12, 3), shop.bread.id)] == len(held)


def test_booked_leaves_out_the_order_being_moved(db):
    shop = Shop(db)
    slot = "2026-12-03T10:00:00+00:00"
    moving = _booked(db, shop, slot, shop.bread, 2, status="confirmed")
    _booked(db, shop, slot, shop.bread, 1, status="confirmed")
    day = date(2026, 12, 3)
    assert ds.booked(db, shop.producer.id, [day]).product[(day, shop.bread.id)] == 3
    left_out = ds.booked(db, shop.producer.id, [day], exclude_order=moving.id)
    assert left_out.product[(day, shop.bread.id)] == 1


# --- a change of slot (propose / accept) ------------------------------------------


def _two_days(client, shop):
    """Two pickup slots on different Israel days, and one more on the first."""
    starts = [s["start"] for s in _menu(client, shop)["slots"] if s["fulfilment"] == "pickup"]
    first = starts[0]
    other = next(s for s in starts if _day_of(s) != _day_of(first))
    same = next((s for s in starts if s != first and _day_of(s) == _day_of(first)), None)
    return first, other, same


def _propose(client, shop, order_id, slot):
    return client.post(
        f"/producers/me/product-orders/{order_id}/propose-change",
        json={"slot_start": slot, "note": "מועד אחר"},
        headers=shop.headers,
    )


def test_proposing_a_day_that_has_no_room_is_refused(client, db, flag_on, sent):
    shop = Shop(db)
    shop.bread.daily_limit = 2
    db.commit()
    first, other, _ = _two_days(client, shop)
    created = _order(client, shop, sent, first, [_line(shop.bread, 2)]).json()
    _booked(db, shop, other, shop.bread, 1, status="confirmed")
    res = _propose(client, shop, created["id"], other)
    assert res.status_code == 409
    assert res.json()["detail"] == ds.only_left_detail("חלה", 1)


def test_accepting_a_day_that_sold_out_since_the_proposal_is_refused(
    client, db, flag_on, sent
):
    shop = Shop(db)
    shop.bread.daily_limit = 2
    db.commit()
    first, other, _ = _two_days(client, shop)
    created = _order(client, shop, sent, first, [_line(shop.bread, 2)]).json()
    assert _propose(client, shop, created["id"], other).status_code == 200
    _booked(db, shop, other, shop.bread, 2, status="confirmed")
    ref = {"token": created["status_token"]}
    res = client.post("/product-orders/status/accept-change", json=ref)
    assert res.status_code == 409
    assert res.json()["detail"] == ds.sold_out_detail("חלה")
    db.expire_all()
    order = db.get(ProductOrder, uuid.UUID(created["id"]))
    assert order.status == "change_proposed"


def test_moving_within_the_same_day_does_not_count_the_order_twice(
    client, db, flag_on, sent
):
    shop = Shop(db)
    shop.bread.daily_limit = 2
    db.commit()
    first, _, same = _two_days(client, shop)
    assert same is not None, "the shop's window offers one slot a day"
    created = _order(client, shop, sent, first, [_line(shop.bread, 2)]).json()
    assert _propose(client, shop, created["id"], same).status_code == 200
    ref = {"token": created["status_token"]}
    res = client.post("/product-orders/status/accept-change", json=ref)
    assert res.status_code == 200, res.text


# --- who reads the prep list --------------------------------------------------------


def test_prep_list_needs_a_login(client, db, flag_on):
    Shop(db)
    assert client.get("/producers/me/orders/prep").status_code == 401


def test_prep_list_is_404_while_ordering_is_off(client, db):
    shop = Shop(db)
    res = client.get("/producers/me/orders/prep", headers=shop.headers)
    assert res.status_code == 404


def test_another_business_sees_only_its_own_prep_list(client, db, flag_on):
    shop = Shop(db)
    slot = "2026-12-03T10:00:00+00:00"
    _booked(db, shop, slot, shop.bread, 3, status="confirmed")
    other = Shop(db)
    assert _prep(client, other) == []


def test_orders_staff_read_the_prep_list(client, db, flag_on, sent, monkeypatch):
    from app.models.producer_staff import ProducerStaff

    shop = Shop(db)
    slot = slot_of(client, shop)
    _booked(db, shop, slot, shop.bread, 3, status="confirmed")
    person = make_user(db, email=f"staff{uuid.uuid4().hex[:6]}@example.com")
    db.add(
        ProducerStaff(
            producer_id=shop.producer.id,
            user_id=person.id,
            invited_email=person.email,
            expires_at=datetime(2030, 1, 1),
            invited_by=shop.owner.id,
            status="active",
        )
    )
    db.commit()
    res = client.get("/producers/me/orders/prep", headers=auth_header(person))
    assert res.status_code == 200, res.text
    assert res.json()["days"][0]["lines"][0]["confirmed"] == 3


def test_prep_list_leaves_out_what_was_already_handed_over(client, db, flag_on):
    shop = Shop(db)
    slot = "2026-12-03T10:00:00+00:00"
    _booked(db, shop, slot, shop.bread, 2, status="handed")
    _booked(db, shop, slot, shop.bread, 1, status="ready")
    days = ds.prep_list(db, shop.producer.id, date(2026, 12, 3))
    assert days[0]["lines"][0]["confirmed"] == 1


# --- the new-order email, through the outbox ------------------------------------------


def test_the_sent_new_order_email_carries_the_sold_out_line(db, monkeypatch):
    from tests.test_meh3296_order_notifications import Wire, owe_now

    wire = Wire(monkeypatch)
    shop = Shop(db)
    shop.bread.daily_limit = 2
    db.commit()
    order = _booked(db, shop, "2026-12-03T10:00:00+00:00", shop.bread, 2)
    order.idempotency_key = str(uuid.uuid4())
    db.commit()
    owe_now(db, order, "new_order", "email")
    outbox.dispatch_due(db)
    (mail,) = wire.mail
    assert "כבר אזל: «חלה»" in mail[2]
