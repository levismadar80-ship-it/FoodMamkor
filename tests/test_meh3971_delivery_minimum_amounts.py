"""MEH-3971: the minimum-order refusal for a delivery says how much.

«סכום ההזמנה נמוך מהמינימום למשלוח» left the buyer guessing: the minimum (100 ₪
for one city of the demo business) appeared nowhere in the order form.
"""

import pytest

from app.models.models import DeliveryArea
from app.services import product_order_delivery as delivery
from tests import test_meh3263_order_route as route
from tests.test_meh3263_order_route import Shop

flag_on = route.flag_on
sent = route.sent


def _facts(**over):
    base = {
        "offers_delivery": True,
        "nationwide": False,
        "cities": frozenset({"חדרה"}),
        "excluded_cities": frozenset(),
        "fee": 20,
        "free_above": None,
    }
    base.update(over)
    return delivery.DeliveryFacts(**base)


@pytest.mark.parametrize(
    ("subtotal", "missing"),
    [(7000, "30"), (9950, "0.50")],
)
def test_the_refusal_names_the_minimum_and_what_is_missing(subtotal, missing):
    with pytest.raises(delivery.DeliveryRefused) as refused:
        delivery.quote(_facts(area_min_order=100), "חדרה", subtotal)
    assert refused.value.detail == (
        f"המינימום להזמנה במשלוח הוא 100 ₪. חסרים עוד {missing} ₪."
    )


def test_at_the_minimum_the_delivery_is_quoted():
    assert delivery.quote(_facts(area_min_order=100), "חדרה", 10000) == 2000


def test_the_quote_route_carries_the_amounts(client, db, flag_on):
    shop = Shop(db)
    shop.producer.offers_delivery = True
    shop.producer.delivery_fee = 15
    db.add(DeliveryArea(producer_id=shop.producer.id, city="חדרה", min_order=100))
    db.commit()
    res = client.post(
        "/product-orders/quote",
        json={
            "producer_id": str(shop.producer.id),
            "items": [{"product_id": str(shop.bread.id), "qty": 1}],
            "fulfilment": "delivery",
            "delivery_city": "חדרה",
        },
    )
    assert res.status_code == 409, res.text
    assert res.json()["detail"] == "המינימום להזמנה במשלוח הוא 100 ₪. חסרים עוד 72 ₪."
