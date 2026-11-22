"""MEH-3691 — a business buys from other businesses like any customer, but
not from itself: no order to its own business, no join of its own group buy.

A self-join counted towards the group's minimum and told the other buyers the
group was closer to happening than it was (Sapir 22/11)."""

from datetime import datetime, timezone

from app.models.models import GroupBuyCommit
from app.models.product_orders import ProductOrder
from _test_meh3263_order_route__common import (  # noqa: F401
    PHONE,
    Shop,
    flag_on,
    slot_of,
    valid_order_payload,
)
from test_group_buys_api import _make_group_buy, _producer_user
from tests.conftest import auth_header

OWN_ORDER_DETAIL = "אי אפשר להזמין מבית העסק שלך"
OWN_GROUP_DETAIL = "אי אפשר להצטרף לקבוצת הרכישה של בית העסק שלך"


def _verified(db, user):
    """Verified phone = the codeless path (MEH-3680), so a refusal can only
    come from the ownership check, not from a missing code."""
    user.phone = PHONE
    user.phone_verified_at = datetime.now(timezone.utc)
    db.commit()
    return user


def _order(client, shop, user):
    body = valid_order_payload(shop, slot_of(client, shop), None, phone=PHONE)
    body.pop("code")
    return client.post("/product-orders", json=body, headers=auth_header(user))


def test_an_owner_cannot_order_from_her_own_business(client, db, flag_on):
    shop = Shop(db)
    res = _order(client, shop, _verified(db, shop.owner))
    assert res.status_code == 403, res.text
    assert res.json()["detail"] == OWN_ORDER_DETAIL
    assert db.query(ProductOrder).count() == 0


def test_an_owner_of_another_business_orders_like_a_customer(client, db, flag_on):
    shop = Shop(db)
    other = Shop(db)
    res = _order(client, shop, _verified(db, other.owner))
    assert res.status_code == 201, res.text
    assert db.query(ProductOrder).one().producer_id == shop.producer.id


def test_an_owner_cannot_join_her_own_group_buy(client, db):
    producer, owner = _producer_user(db, email="selfjoin@example.com")
    gb = _make_group_buy(db, producer)
    res = client.post(
        f"/group-buys/{gb.id}/commit", json={"quantity": 1}, headers=auth_header(owner)
    )
    assert res.status_code == 403, res.text
    assert res.json()["detail"] == OWN_GROUP_DETAIL
    assert db.query(GroupBuyCommit).count() == 0


def test_an_owner_of_another_business_joins_like_a_customer(client, db):
    producer, _ = _producer_user(db, email="gbhost@example.com")
    _, buyer = _producer_user(db, email="gbbuyer@example.com")
    gb = _make_group_buy(db, producer)
    res = client.post(
        f"/group-buys/{gb.id}/commit", json={"quantity": 1}, headers=auth_header(buyer)
    )
    assert res.status_code == 201, res.text
    assert db.query(GroupBuyCommit).one().user_id == buyer.id
