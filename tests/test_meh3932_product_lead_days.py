"""MEH-3932 — how many days ahead a product must be ordered (Fischgrund
bakery, 27/11/2026).

The cells: no rule = no change · a slot sooner than the lead is refused with
the product's name · the boundary day (exactly lead days ahead) is open ·
with two lines, the limited one is named · days are counted on the Israel
clock · the owner sets, keeps and clears it on her own product only, 1..14 ·
the menu carries it · a time the business proposes herself is not checked.
"""

from datetime import UTC, datetime

from app.services import product_lead_days as ld
from _test_meh3263_order_route__common import (  # noqa: F401 — fixtures
    Shop,
    code_for,
    flag_on,
    sent,
    stored_order,
    valid_order_payload,
)
from tests.conftest import auth_header, make_producer, make_user


def _menu(client, shop):
    return client.get(f"/producers/{shop.id}/order-menu").json()


def _now():
    return datetime.now(UTC)


def _ahead(slot):
    return ld.days_ahead(datetime.fromisoformat(slot), _now())


def _pickups(client, shop):
    # [1:]: the first slot can start at the next full hour (see slot_of).
    return [s["start"] for s in _menu(client, shop)["slots"] if s["fulfilment"] == "pickup"][1:]


def _soonest_and_later(client, shop):
    """The soonest slot, and the first slot on a later Israel day."""
    starts = _pickups(client, shop)
    soonest = starts[0]
    later = next(s for s in starts if _ahead(s) > _ahead(soonest))
    return soonest, later


def _order(client, shop, sent, slot, products):
    code = code_for(client, shop, sent)
    items = [{"product_id": str(p.id), "qty": 1} for p in products]
    body = valid_order_payload(shop, slot, code, items=items)
    return client.post("/product-orders", json=body)


# --- the order route ----------------------------------------------------------


def test_no_rule_takes_the_soonest_slot(client, db, flag_on, sent):
    shop = Shop(db)
    soonest, _ = _soonest_and_later(client, shop)
    res = _order(client, shop, sent, soonest, [shop.bread])
    assert res.status_code == 201, res.text


def test_a_slot_sooner_than_the_lead_is_refused_with_the_name(client, db, flag_on, sent):
    shop = Shop(db)
    soonest, later = _soonest_and_later(client, shop)
    shop.bread.lead_days = _ahead(later)
    db.commit()
    res = _order(client, shop, sent, soonest, [shop.bread])
    assert res.status_code == 409
    assert res.json()["detail"] == ld.too_soon_detail("חלה", _ahead(later))


def test_the_day_exactly_lead_days_ahead_is_open(client, db, flag_on, sent):
    shop = Shop(db)
    _, later = _soonest_and_later(client, shop)
    shop.bread.lead_days = _ahead(later)
    db.commit()
    res = _order(client, shop, sent, later, [shop.bread])
    assert res.status_code == 201, res.text


def test_with_two_lines_the_limited_one_is_named(client, db, flag_on, sent):
    shop = Shop(db)
    soonest, later = _soonest_and_later(client, shop)
    shop.cheese.lead_days = _ahead(later)
    db.commit()
    res = _order(client, shop, sent, soonest, [shop.bread, shop.cheese])
    assert res.status_code == 409
    assert res.json()["detail"] == ld.too_soon_detail("גבינה", _ahead(later))
    assert "«חלה»" not in res.json()["detail"]


def test_the_menu_carries_the_lead(client, db, flag_on):
    shop = Shop(db)
    shop.bread.lead_days = 2
    db.commit()
    products = {p["id"]: p for p in _menu(client, shop)["products"]}
    assert products[str(shop.bread.id)]["lead_days"] == 2
    assert products[str(shop.cheese.id)]["lead_days"] is None


# --- the Israel clock ---------------------------------------------------------


def test_days_are_counted_on_the_israel_clock():
    # 27/11 is winter (UTC+2): 22:30Z on Thursday is already Friday in Israel.
    friday_pickup = datetime(2026, 11, 27, 8, 0, tzinfo=UTC)
    assert ld.days_ahead(friday_pickup, datetime(2026, 11, 26, 21, 30, tzinfo=UTC)) == 1
    assert ld.days_ahead(friday_pickup, datetime(2026, 11, 26, 22, 30, tzinfo=UTC)) == 0
    # A naive start is UTC, as the order rows store it.
    assert ld.days_ahead(datetime(2026, 11, 27, 22, 30), datetime(2026, 11, 26, 8, 0, tzinfo=UTC)) == 2


def test_the_reason_reads_one_two_and_many_days():
    assert "יום אחד מראש" in ld.too_soon_detail("חלה", 1)
    assert "יומיים מראש" in ld.too_soon_detail("חלה", 2)
    assert "3 ימים מראש" in ld.too_soon_detail("חלה", 3)


# --- the owner's switch -------------------------------------------------------


def _put(client, shop, product, **over):
    body = {"is_orderable": True, "in_stock": True, "contains_alcohol": False, **over}
    return client.put(
        f"/producers/me/products/{product.id}/ordering", json=body, headers=shop.headers
    )


def test_owner_sets_keeps_and_clears_the_lead(client, db, flag_on):
    shop = Shop(db)
    res = _put(client, shop, shop.bread, lead_days=3)
    assert res.status_code == 200, res.text
    assert res.json()["lead_days"] == 3
    listed = client.get("/producers/me/products/ordering", headers=shop.headers).json()
    bread = next(p for p in listed["products"] if p["id"] == str(shop.bread.id))
    assert bread["lead_days"] == 3
    assert _put(client, shop, shop.bread).json()["lead_days"] == 3  # omitted = keep
    assert _put(client, shop, shop.bread, lead_days=None).json()["lead_days"] is None


def test_lead_out_of_range_is_refused(client, db, flag_on):
    shop = Shop(db)
    assert _put(client, shop, shop.bread, lead_days=0).status_code == 422
    assert _put(client, shop, shop.bread, lead_days=15).status_code == 422
    assert _put(client, shop, shop.bread, lead_days=14).status_code == 200


def test_another_business_cannot_set_my_lead(client, db, flag_on):
    shop = Shop(db)
    stranger = make_user(db, email="other-lead@example.com", role="producer")
    stranger.producer_id = make_producer(db, name="עסק אחר").id
    stranger.is_producer = True
    db.commit()
    res = client.put(
        f"/producers/me/products/{shop.bread.id}/ordering",
        json={"is_orderable": True, "in_stock": True, "contains_alcohol": False, "lead_days": 5},
        headers=auth_header(stranger),
    )
    assert res.status_code == 404
    db.refresh(shop.bread)
    assert shop.bread.lead_days is None


# --- a time the business proposes ----------------------------------------------


def test_a_time_the_business_proposes_is_not_checked(client, db, flag_on, sent):
    shop = Shop(db)
    soonest, later = _soonest_and_later(client, shop)
    res = _order(client, shop, sent, later, [shop.bread])
    assert res.status_code == 201, res.text
    shop.bread.lead_days = _ahead(later)
    db.commit()
    moved = client.post(
        f"/producers/me/product-orders/{res.json()['id']}/propose-change",
        json={"slot_start": soonest, "note": "מוקדם יותר"},
        headers=shop.headers,
    )
    assert moved.status_code == 200, moved.text
