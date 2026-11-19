"""MEH-3216 stage 5c: the buyer sees the delivery fee and the total before she
sends. POST /product-orders/quote prices the picks the same way the order
route does — from the DB, a range at its high end, the fee from the business's
delivery rules — and writes nothing."""

import pytest

from app.models.product_orders import ProductOrder
from app.routers import product_orders as orders_module
from app.services import product_order_create as create_module
from app.services import product_order_delivery as delivery
from tests.test_meh3263_order_route import Shop


@pytest.fixture
def flag_on(monkeypatch):
    monkeypatch.setattr(orders_module, "product_orders_enabled", lambda: True)


def quote(client, shop, **over):
    body = {
        "producer_id": shop.id,
        "items": [{"product_id": str(shop.bread.id), "qty": 2}],
        "fulfilment": "pickup",
    }
    body.update(over)
    return client.post("/product-orders/quote", json=body)


def test_the_quote_is_404_while_the_flag_is_off(client, db):
    shop = Shop(db)
    assert quote(client, shop).status_code == 404


def test_a_pickup_quote_prices_from_the_db_and_writes_nothing(client, db, flag_on):
    shop = Shop(db)
    res = quote(
        client,
        shop,
        items=[
            {"product_id": str(shop.bread.id), "qty": 2},
            {"product_id": str(shop.cheese.id), "qty": 1},
        ],
    )
    assert res.status_code == 200, res.text
    # 2 × 28 ₪ + the cheese at the HIGH end of its range (130 ₪), as stored.
    assert res.json() == {
        "subtotal_agorot": 2 * 2800 + 13000,
        "delivery_fee_agorot": 0,
        "total_agorot": 2 * 2800 + 13000,
        "has_estimate": True,
    }
    assert db.query(ProductOrder).count() == 0


def test_a_delivery_quote_carries_the_city_fee(client, db, flag_on):
    shop = Shop(db)
    shop.producer.offers_delivery = True
    shop.producer.delivery_cities = ["חיפה"]
    shop.producer.delivery_fee = 30
    db.commit()
    res = quote(client, shop, fulfilment="delivery", delivery_city="חיפה")
    assert res.status_code == 200, res.text
    assert res.json()["delivery_fee_agorot"] == 3000
    assert res.json()["total_agorot"] == 2 * 2800 + 3000
    assert res.json()["has_estimate"] is False


def test_a_city_the_business_does_not_serve_is_refused_in_hebrew(client, db, flag_on):
    shop = Shop(db)
    shop.producer.offers_delivery = True
    shop.producer.delivery_cities = ["חיפה"]
    shop.producer.delivery_fee = 30
    db.commit()
    res = quote(client, shop, fulfilment="delivery", delivery_city="אילת")
    assert res.status_code == 409
    assert res.json()["detail"] == delivery.CITY_NOT_SERVED_DETAIL


def test_a_delivery_quote_without_a_city_is_refused(client, db, flag_on):
    shop = Shop(db)
    assert quote(client, shop, fulfilment="delivery").status_code == 422


def test_below_the_minimum_and_a_gone_product_answer_as_the_order_route_does(
    client, db, flag_on
):
    shop = Shop(db, min_order_agorot=10000)
    res = quote(client, shop)
    assert res.status_code == 409
    assert res.json()["detail"] == create_module.BELOW_MINIMUM_DETAIL
    shop.bread.in_stock = False
    db.commit()
    res = quote(client, shop, items=[{"product_id": str(shop.bread.id), "qty": 1}])
    assert res.status_code == 409
    assert res.json()["detail"] == create_module.PRODUCT_GONE_DETAIL


def test_a_business_that_does_not_take_orders_has_no_quote(client, db, flag_on):
    shop = Shop(db, enabled=False)
    assert quote(client, shop).status_code == 404


def test_the_request_cannot_carry_a_price(client, db, flag_on):
    shop = Shop(db)
    assert quote(client, shop, total_agorot=1).status_code == 422
