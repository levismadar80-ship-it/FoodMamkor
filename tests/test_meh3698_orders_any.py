"""
Module:   test_meh3698_orders_any
Purpose:  GET /users/me/orders/any answers whether the caller has anything for
          «ההזמנות שלי» to show — an order, a group buy or a surprise bag —
          in ONE request, so the menu gate costs one per-IP read per page load
          and not three (testing.md, MEH-2972). A source whose flag is off
          never counts: its list would be empty.
Related:  backend/app/routers/my_orders_any.py, frontend/lib/use-my-orders-nav-gate.js
History:  MEH-3698 (creation)
"""

# ruff: noqa: F811 — fixtures reused from test_rescue.py are injected by name.

from datetime import timedelta

import pytest

from app.models.models import GroupBuyCommit, RescueOrder
from app.models.product_orders import ProductOrder
from app.routers import product_orders as orders_module
from app.utils.clock import utc_now
from tests.conftest import auth_header, make_user
from tests.test_group_buys_api import _make_group_buy, _producer_user
from tests.test_rescue import _seed_offer, rescue_on, shop  # noqa: F401

URL = "/users/me/orders/any"


@pytest.fixture
def orders_on(monkeypatch):
    monkeypatch.setattr(orders_module, "product_orders_enabled", lambda: True)


def _any(client, user):
    r = client.get(URL, headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert "no-store" in r.headers["cache-control"]
    return r.json()["any"]


def _product_order(db, producer, user, **over):
    now = utc_now()
    fields = {
        "producer_id": producer.id,
        "user_id": user.id,
        "customer_name": "דנה לוי",
        "customer_phone": "972501234567",
        "fulfilment": "pickup",
        "slot_start": now + timedelta(days=1),
        "slot_end": now + timedelta(days=1, hours=1),
        "estimated_total_agorot": 5600,
        "status": "pending",
    }
    fields.update(over)
    db.add(ProductOrder(**fields))
    db.commit()


def test_signed_out_is_401(client):
    assert client.get(URL).status_code == 401


def test_false_with_nothing_anywhere(client, db, orders_on, rescue_on):
    assert _any(client, make_user(db, email="none3698a@example.com")) is False


def test_a_group_buy_counts(client, db):
    producer, _ = _producer_user(db, email="gbowner3698@example.com")
    me = make_user(db, email="gb3698@example.com")
    gb = _make_group_buy(db, producer)
    db.add(GroupBuyCommit(group_buy_id=gb.id, user_id=me.id, quantity=1))
    db.commit()
    assert _any(client, me) is True


def test_a_group_buy_of_a_business_no_longer_public_does_not_count(client, db):
    """/users/me/group-buys hides it (_public_group_buys), so the menu must
    not lead to a list that has nothing in it."""
    producer, _ = _producer_user(db, email="gone3698@example.com")
    me = make_user(db, email="gbgone3698@example.com")
    gb = _make_group_buy(db, producer)
    db.add(GroupBuyCommit(group_buy_id=gb.id, user_id=me.id, quantity=1))
    producer.status = "suspended"
    db.commit()
    assert _any(client, me) is False
    listed = client.get("/users/me/group-buys", headers=auth_header(me)).json()
    assert listed["group_buys"] == []  # the list agrees


def test_a_product_order_counts_only_while_ordering_is_on(
    client, db, shop, monkeypatch
):
    me = make_user(db, email="po3698@example.com")
    _product_order(db, shop["producer"], me)
    assert _any(client, me) is False  # flag off: /my-orders would show none
    monkeypatch.setattr(orders_module, "product_orders_enabled", lambda: True)
    assert _any(client, me) is True


def test_an_order_closed_too_long_ago_does_not_count(client, db, shop, orders_on):
    me = make_user(db, email="old3698@example.com")
    _product_order(
        db,
        shop["producer"],
        me,
        status="handed",
        closed_at=utc_now() - timedelta(days=31),
    )
    assert _any(client, me) is False


def test_a_bag_counts_only_while_the_pilot_is_on(client, db, shop, monkeypatch):
    me = make_user(db, email="bag3698@example.com")
    offer = _seed_offer(db, shop["location"])
    db.add(
        RescueOrder(
            offer_id=offer.id,
            user_id=me.id,
            qty=1,
            pickup_code="1234",
            status="handed",
        )
    )
    db.commit()
    assert _any(client, me) is False
    from app.routers import rescue as rescue_module

    monkeypatch.setattr(rescue_module, "rescue_bags_enabled", lambda: True)
    assert _any(client, me) is True


def test_someone_elses_rows_do_not_count(client, db, shop, orders_on, rescue_on):
    me = make_user(db, email="me3698@example.com")
    other = make_user(db, email="them3698@example.com")
    _product_order(db, shop["producer"], other)
    offer = _seed_offer(db, shop["location"])
    db.add(
        RescueOrder(
            offer_id=offer.id,
            user_id=other.id,
            qty=1,
            pickup_code="4321",
            status="reserved",
        )
    )
    db.commit()
    assert _any(client, me) is False
