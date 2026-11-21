"""MEH-3617 — a product with sizes or flavours.

The cells of the card's acceptance_criteria, one test each:
0 variants (as before) · 1 variant (applied with no choice) · many (a choice
is required) · one out of stock (the others still order) · all out (the
product is out) · the price comes from the server, never the client · only the
owner or an admin writes the list (IDOR) · the cap of 10 is a 409 in Hebrew.
"""

import uuid

import pytest

from app.limits import MAX_VARIANTS_PER_PRODUCT
from app.models.catalog import ProductVariant
from app.models.product_orders import ProductOrder
from app.services import product_variants as pv
from _test_meh3263_order_route__common import (  # noqa: F401 — fixtures
    Shop,
    code_for,
    flag_on,
    sent,
    slot_of,
    valid_order_payload,
)
from tests.conftest import auth_header, make_producer, make_user


def _variants(db, product, *rows):
    """rows: (name, price_agorot | None, in_stock)."""
    made = []
    for position, (name, price, stock) in enumerate(rows):
        v = ProductVariant(
            product_id=product.id,
            name=name,
            price_agorot=price,
            in_stock=stock,
            position=position,
        )
        db.add(v)
        made.append(v)
    db.commit()
    db.refresh(product)
    return made


def _order(client, shop, sent, items):
    slot = slot_of(client, shop)
    body = valid_order_payload(shop, slot, code_for(client, shop, sent), items=items)
    return client.post("/product-orders", json=body)


def _menu_bread(client, shop):
    menu = client.get(f"/producers/{shop.id}/order-menu").json()
    return next(p for p in menu["products"] if p["id"] == str(shop.bread.id))


# --- 0 variants ---------------------------------------------------------------


def test_zero_variants_orders_exactly_as_before(client, db, flag_on, sent):
    shop = Shop(db)
    assert _menu_bread(client, shop)["variants"] == []
    res = _order(client, shop, sent, [{"product_id": str(shop.bread.id), "qty": 2}])
    assert res.status_code == 201, res.text
    line = res.json()["items"][0]
    assert line["name"] == "חלה"
    assert line["variant_name"] is None
    assert line["unit_price_agorot"] == 2800
    assert res.json()["estimated_total_agorot"] == 5600


def test_zero_variants_refuses_a_made_up_variant_id(client, db, flag_on, sent):
    shop = Shop(db)
    res = _order(
        client,
        shop,
        sent,
        [{"product_id": str(shop.bread.id), "variant_id": str(uuid.uuid4()), "qty": 1}],
    )
    assert res.status_code == 409
    assert res.json()["detail"] == pv.VARIANT_GONE_DETAIL


# --- 1 variant ----------------------------------------------------------------


def test_one_variant_is_applied_without_a_choice(client, db, flag_on, sent):
    shop = Shop(db)
    (big,) = _variants(db, shop.bread, ("גדולה", 3500, True))
    res = _order(client, shop, sent, [{"product_id": str(shop.bread.id), "qty": 1}])
    assert res.status_code == 201, res.text
    line = res.json()["items"][0]
    assert line["variant_name"] == "גדולה"
    assert line["unit_price_agorot"] == 3500
    stored = db.query(ProductOrder).one().items[0]
    assert stored.variant_id == big.id


# --- many variants ------------------------------------------------------------


def test_many_variants_require_a_choice(client, db, flag_on, sent):
    shop = Shop(db)
    _variants(db, shop.bread, ("קטנה", 2000, True), ("גדולה", 3500, True))
    res = _order(client, shop, sent, [{"product_id": str(shop.bread.id), "qty": 1}])
    assert res.status_code == 422
    assert res.json()["detail"] == pv.VARIANT_REQUIRED_DETAIL
    assert db.query(ProductOrder).count() == 0


def test_many_variants_two_sizes_are_two_lines_each_at_its_price(
    client, db, flag_on, sent
):
    shop = Shop(db)
    small, big = _variants(
        db, shop.bread, ("קטנה", 2000, True), ("גדולה", None, True)
    )
    items = [
        {"product_id": str(shop.bread.id), "variant_id": str(small.id), "qty": 2},
        {"product_id": str(shop.bread.id), "variant_id": str(big.id), "qty": 1},
    ]
    res = _order(client, shop, sent, items)
    assert res.status_code == 201, res.text
    lines = res.json()["items"]
    assert [(ln["variant_name"], ln["unit_price_agorot"]) for ln in lines] == [
        ("קטנה", 2000),
        ("גדולה", 2800),  # no own price = the product's price
    ]
    assert res.json()["estimated_total_agorot"] == 2 * 2000 + 2800


def test_the_same_variant_twice_is_refused(client, db, flag_on, sent):
    shop = Shop(db)
    small, _ = _variants(db, shop.bread, ("קטנה", 2000, True), ("גדולה", 3500, True))
    line = {"product_id": str(shop.bread.id), "variant_id": str(small.id), "qty": 1}
    res = _order(client, shop, sent, [line, dict(line)])
    assert res.status_code == 422


def test_a_variant_of_another_product_is_refused(client, db, flag_on, sent):
    shop = Shop(db)
    _variants(db, shop.bread, ("קטנה", 2000, True), ("גדולה", 3500, True))
    (foreign,) = _variants(db, shop.cheese, ("חצי", 5000, True))
    res = _order(
        client,
        shop,
        sent,
        [{"product_id": str(shop.bread.id), "variant_id": str(foreign.id), "qty": 1}],
    )
    assert res.status_code == 409
    assert res.json()["detail"] == pv.VARIANT_GONE_DETAIL


# --- stock --------------------------------------------------------------------


def test_one_variant_out_of_stock_the_others_still_order(client, db, flag_on, sent):
    shop = Shop(db)
    small, big = _variants(
        db, shop.bread, ("קטנה", 2000, False), ("גדולה", 3500, True)
    )
    menu = _menu_bread(client, shop)
    assert menu["in_stock"] is True
    assert [v["in_stock"] for v in menu["variants"]] == [False, True]
    gone = _order(
        client,
        shop,
        sent,
        [{"product_id": str(shop.bread.id), "variant_id": str(small.id), "qty": 1}],
    )
    assert gone.status_code == 409
    ok = _order(
        client,
        shop,
        sent,
        [{"product_id": str(shop.bread.id), "variant_id": str(big.id), "qty": 1}],
    )
    assert ok.status_code == 201, ok.text


def test_all_variants_out_means_the_product_is_out(client, db, flag_on):
    shop = Shop(db)
    _variants(db, shop.bread, ("קטנה", 2000, False), ("גדולה", 3500, False))
    assert _menu_bread(client, shop)["in_stock"] is False


# --- price comes from the server ----------------------------------------------


def test_a_client_price_is_never_read(client, db, flag_on, sent):
    """The request has no price field; one sent anyway is refused and nothing
    is written, and the stored price is the variant's."""
    shop = Shop(db)
    (_, big) = _variants(db, shop.bread, ("קטנה", 2000, True), ("גדולה", 3500, True))
    line = {"product_id": str(shop.bread.id), "variant_id": str(big.id), "qty": 1}
    tampered = _order(client, shop, sent, [{**line, "unit_price_agorot": 1}])
    assert tampered.status_code == 422
    assert db.query(ProductOrder).count() == 0
    honest = _order(client, shop, sent, [line])
    assert honest.status_code == 201
    assert honest.json()["estimated_total_agorot"] == 3500


def test_the_quote_prices_a_variant_like_the_order(client, db, flag_on):
    shop = Shop(db)
    (_, big) = _variants(db, shop.bread, ("קטנה", 2000, True), ("גדולה", 3500, True))
    res = client.post(
        "/product-orders/quote",
        json={
            "producer_id": shop.id,
            "items": [
                {"product_id": str(shop.bread.id), "variant_id": str(big.id), "qty": 2}
            ],
            "fulfilment": "pickup",
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["subtotal_agorot"] == 7000


# --- writing the list: owner / admin / anyone else ----------------------------


def _put(client, product_id, headers, variants):
    return client.put(
        f"/products/{product_id}/variants",
        json={"variants": variants},
        headers=headers,
    )


def test_owner_writes_reorders_and_empties_the_list(client, db):
    shop = Shop(db)
    res = _put(
        client,
        shop.bread.id,
        shop.headers,
        [{"name": " קטנה ", "price_agorot": 2000}, {"name": "גדולה"}],
    )
    assert res.status_code == 200, res.text
    first = res.json()["variants"]
    assert [v["name"] for v in first] == ["קטנה", "גדולה"]
    # Reorder keeping the ids, mark one out of stock.
    res = _put(
        client,
        shop.bread.id,
        shop.headers,
        [
            {"id": first[1]["id"], "name": "גדולה", "in_stock": False},
            {"id": first[0]["id"], "name": "קטנה", "price_agorot": 2000},
        ],
    )
    second = res.json()["variants"]
    assert [v["id"] for v in second] == [first[1]["id"], first[0]["id"]]
    assert second[0]["in_stock"] is False
    # The page read carries them, in that order.
    mine = client.get("/producers/me/products", headers=shop.headers).json()
    bread = next(p for p in mine if p["id"] == str(shop.bread.id))
    assert [v["name"] for v in bread["variants"]] == ["גדולה", "קטנה"]
    # Empty = no variants, the product as before.
    assert _put(client, shop.bread.id, shop.headers, []).json() == {"variants": []}
    assert db.query(ProductVariant).count() == 0


def test_another_business_cannot_write_the_list(client, db):
    shop = Shop(db)
    other = make_producer(db, name="אחרת")
    intruder = make_user(db, role="producer", email=f"x{uuid.uuid4().hex[:8]}@example.com")
    intruder.producer_id = other.id
    db.commit()
    res = _put(client, shop.bread.id, auth_header(intruder), [{"name": "קטנה"}])
    assert res.status_code == 404
    assert db.query(ProductVariant).count() == 0


def test_a_consumer_cannot_write_the_list(client, db):
    shop = Shop(db)
    buyer = make_user(db, role="consumer", email=f"c{uuid.uuid4().hex[:8]}@example.com")
    res = _put(client, shop.bread.id, auth_header(buyer), [{"name": "קטנה"}])
    assert res.status_code == 404
    assert _put(client, shop.bread.id, {}, [{"name": "קטנה"}]).status_code == 401


def test_an_admin_can_write_the_list(client, db):
    shop = Shop(db)
    admin = make_user(db, role="admin", email=f"a{uuid.uuid4().hex[:8]}@example.com")
    res = _put(client, shop.bread.id, auth_header(admin), [{"name": "קטנה"}])
    assert res.status_code == 200, res.text
    assert db.query(ProductVariant).count() == 1


def test_an_id_of_another_products_variant_is_a_new_row_not_a_move(client, db):
    shop = Shop(db)
    (cheese_half,) = _variants(db, shop.cheese, ("חצי", 5000, True))
    res = _put(
        client, shop.bread.id, shop.headers, [{"id": str(cheese_half.id), "name": "x1"}]
    )
    assert res.status_code == 200
    assert res.json()["variants"][0]["id"] != str(cheese_half.id)
    db.refresh(cheese_half)
    assert cheese_half.product_id == shop.cheese.id


# --- limits -------------------------------------------------------------------


def test_the_eleventh_variant_is_a_409_in_hebrew(client, db):
    shop = Shop(db)
    rows = [{"name": f"אפשרות {n}"} for n in range(MAX_VARIANTS_PER_PRODUCT)]
    assert _put(client, shop.bread.id, shop.headers, rows).status_code == 200
    res = _put(client, shop.bread.id, shop.headers, [*rows, {"name": "עוד אחת"}])
    assert res.status_code == 409
    assert "עד 10 אפשרויות" in res.json()["detail"]


@pytest.mark.parametrize("name", ["", "   ", "!!"])
def test_a_variant_needs_a_name(client, db, name):
    shop = Shop(db)
    res = _put(client, shop.bread.id, shop.headers, [{"name": name}])
    assert res.status_code == 422


def test_two_variants_with_one_name_are_refused(client, db):
    shop = Shop(db)
    res = _put(client, shop.bread.id, shop.headers, [{"name": "קטנה"}, {"name": "קטנה"}])
    assert res.status_code == 422


# --- the pure rules -----------------------------------------------------------


def test_unit_price_rules():
    v = ProductVariant(name="x", price_agorot=1500, in_stock=True)
    assert pv.unit_price(2000, 2000, v) == (1500, False)
    assert pv.unit_price(2000, 2500, None) == (2500, True)
    assert pv.unit_price(2000, 2500, ProductVariant(name="y", price_agorot=None)) == (
        2500,
        True,
    )
