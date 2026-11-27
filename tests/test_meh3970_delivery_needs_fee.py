"""MEH-3970: a delivery that cannot be priced is not offered.

A business that added delivery windows but published no delivery fee (none for
the business, none for any of her cities) was offered as «משלוח» in the order
form. The buyer picked a time, typed her city, and only then read that the
business takes pickup only. With a small cart she first met the minimum, and
after adding items, the missing fee: two dead ends in a row.
"""

import pytest

from app.models.models import DeliveryArea
from app.models.product_orders import ProducerOrderSettings
from app.services import product_order_delivery as delivery
from app.services.product_order_menu import offered_slots
from app.utils.clock import utc_now
from tests import test_meh3263_order_route as route
from tests.test_meh3263_order_route import Shop

flag_on = route.flag_on
sent = route.sent


def _ways(client, shop) -> set[str]:
    menu = client.get(f"/producers/{shop.id}/order-menu").json()
    return {slot["fulfilment"] for slot in menu["slots"]}


def _delivers(db, shop, fee=None, cities=("חיפה",)):
    shop.producer.offers_delivery = True
    shop.producer.delivery_cities = list(cities)
    shop.producer.delivery_fee = fee
    db.commit()


def test_no_fee_anywhere_offers_pickup_only(client, db, flag_on):
    shop = Shop(db)
    _delivers(db, shop, fee=None)
    assert _ways(client, shop) == {"pickup"}


def test_a_business_fee_offers_delivery(client, db, flag_on):
    shop = Shop(db)
    _delivers(db, shop, fee=20)
    assert _ways(client, shop) == {"pickup", "delivery"}


def test_a_fee_on_one_city_only_offers_delivery(client, db, flag_on):
    shop = Shop(db)
    _delivers(db, shop, fee=None, cities=())
    db.add(DeliveryArea(producer_id=shop.producer.id, city="עכו", delivery_fee=12))
    db.commit()
    assert _ways(client, shop) == {"pickup", "delivery"}


def test_a_city_without_its_own_fee_and_no_business_fee_offers_pickup_only(
    client, db, flag_on
):
    shop = Shop(db)
    _delivers(db, shop, fee=None, cities=())
    db.add(DeliveryArea(producer_id=shop.producer.id, city="עכו", min_order=100))
    db.commit()
    assert _ways(client, shop) == {"pickup"}


def test_a_fee_with_no_city_served_offers_pickup_only(client, db, flag_on):
    shop = Shop(db)
    _delivers(db, shop, fee=20, cities=())
    assert _ways(client, shop) == {"pickup"}


def test_delivery_switched_off_offers_pickup_only(client, db, flag_on):
    shop = Shop(db)
    _delivers(db, shop, fee=20)
    shop.producer.offers_delivery = False
    db.commit()
    assert _ways(client, shop) == {"pickup"}


def test_the_missing_fee_is_told_before_the_minimum():
    facts = delivery.DeliveryFacts(
        offers_delivery=True,
        nationwide=False,
        cities=frozenset(),
        excluded_cities=frozenset(),
        fee=None,
        free_above=None,
        has_area=True,
        area_min_order=100,
    )
    with pytest.raises(delivery.DeliveryRefused) as refused:
        delivery.quote(facts, "חדרה", 1000)
    assert refused.value.detail == delivery.FEE_NOT_PUBLISHED_DETAIL


def test_the_windows_route_tells_her_when_delivery_is_not_priced(client, db, flag_on):
    shop = Shop(db)
    _delivers(db, shop, fee=None)
    got = client.get("/producers/me/order-windows", headers=shop.headers)
    assert got.status_code == 200, got.text
    assert got.json()["delivery_priced"] is False
    shop.producer.delivery_fee = 20
    db.commit()
    week = got.json()["windows"][:2]
    put = client.put(
        "/producers/me/order-windows", json={"windows": week}, headers=shop.headers
    )
    assert put.status_code == 200, put.text
    assert put.json()["delivery_priced"] is True


def test_the_business_proposing_a_time_still_sees_delivery_slots(db):
    shop = Shop(db)
    _delivers(db, shop, fee=None)
    row = db.query(ProducerOrderSettings).filter_by(producer_id=shop.producer.id).one()
    slots = offered_slots(db, shop.producer, row, utc_now(), as_business=True)
    kinds = {slot.fulfilment for slot in slots}
    assert kinds == {"pickup", "delivery"}
