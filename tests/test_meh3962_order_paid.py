"""MEH-3962 — the business marks an order paid, takes the mark back, and lists
the orders it is still owed for.

The buyer pays the business directly (ADR-042 §5); the mark is the business's
own record. Built on the MEH-3263 fixtures (Shop, stored_order).
"""

import uuid
from datetime import datetime, timedelta

import pytest

from app.models.producer_staff import ProducerStaff
from app.models.product_orders import ProductOrder, ProductOrderEvent
from app.services import product_order_paid as paid_module
from app.utils.clock import utc_now
from tests.conftest import auth_header, make_user
from tests import test_meh3263_order_route as route
from tests.test_meh3263_order_route import Shop, stored_order

flag_on = route.flag_on

# The real cutoff is a fixed date (28/11/2026); an order handed "now" in a test
# run before it would not be owed. Pin a cutoff in the past, so every test
# reads the same at any hour; the cutoff test moves orders around it.
SINCE = datetime(2026, 1, 1)


@pytest.fixture(autouse=True)
def _cutoff(monkeypatch):
    monkeypatch.setattr(paid_module, "OWED_HANDED_SINCE", SINCE)


def _handed(db, shop, at=None, **over):
    """A handed order; handed now unless `at` says otherwise."""
    return stored_order(db, shop, "handed", handed_at=at or utc_now(), **over)


def _staff(db, shop, **over):
    person = make_user(db, email=f"staff{uuid.uuid4().hex[:6]}@example.com")
    fields = {
        "producer_id": shop.producer.id,
        "user_id": person.id,
        "invited_email": person.email,
        "expires_at": datetime(2030, 1, 1),
        "invited_by": shop.owner.id,
        "status": "active",
    }
    fields.update(over)
    db.add(ProducerStaff(**fields))
    db.commit()
    return auth_header(person)


def _paid(client, shop, order, paid=True, headers=None):
    return client.post(
        f"/producers/me/product-orders/{order.id}/paid",
        json={"paid": paid},
        headers=headers or shop.headers,
    )


def test_a_confirmed_order_is_marked_paid_and_back(client, db, flag_on):
    shop = Shop(db)
    order = stored_order(db, shop, "confirmed")
    events_before = db.query(ProductOrderEvent).count()

    res = _paid(client, shop, order)
    assert res.status_code == 200
    first = res.json()["paid_at"]
    assert first is not None
    assert res.json()["owed"] is False
    db.expire_all()
    assert db.get(ProductOrder, order.id).paid_at is not None

    # A second tap keeps the first time it was marked.
    assert _paid(client, shop, order).json()["paid_at"] == first

    back = _paid(client, shop, order, paid=False)
    assert (back.status_code, back.json()["paid_at"]) == (200, None)
    assert back.json()["owed"] is True
    db.expire_all()
    stored = db.get(ProductOrder, order.id)
    assert stored.paid_at is None
    # Paid is not a state: the status and the event log are untouched.
    assert stored.status == "confirmed"
    assert db.query(ProductOrderEvent).count() == events_before


def test_an_order_not_taken_on_cannot_be_marked_paid(client, db, flag_on):
    shop = Shop(db)
    for state in ("pending", "change_proposed", "declined", "cancelled", "expired"):
        order = stored_order(db, shop, state)
        res = _paid(client, shop, order)
        assert res.status_code == 409, state
        assert paid_module.NOT_PAYABLE_DETAIL in res.text
        db.expire_all()
        assert db.get(ProductOrder, order.id).paid_at is None


def test_a_mark_can_be_taken_back_after_the_order_closed(client, db, flag_on):
    shop = Shop(db)
    order = _handed(db, shop)
    assert _paid(client, shop, order).status_code == 200
    db.query(ProductOrder).update({"status": "cancelled"})
    db.commit()
    res = _paid(client, shop, order, paid=False)
    assert (res.status_code, res.json()["paid_at"]) == (200, None)


def test_another_business_gets_404_and_no_mark(client, db, flag_on):
    shop, other = Shop(db), Shop(db)
    order = stored_order(db, shop, "confirmed")
    res = _paid(client, shop, order, headers=other.headers)
    assert res.status_code == 404
    db.expire_all()
    assert db.get(ProductOrder, order.id).paid_at is None


def test_signed_out_is_refused(client, db, flag_on):
    shop = Shop(db)
    order = stored_order(db, shop, "confirmed")
    res = client.post(
        f"/producers/me/product-orders/{order.id}/paid", json={"paid": True}
    )
    assert res.status_code == 401
    db.expire_all()
    assert db.get(ProductOrder, order.id).paid_at is None


def test_the_body_must_say_paid_or_not(client, db, flag_on):
    shop = Shop(db)
    order = stored_order(db, shop, "confirmed")
    url = f"/producers/me/product-orders/{order.id}/paid"
    assert client.post(url, json={}, headers=shop.headers).status_code == 422
    extra = {"paid": True, "paid_at": "2020-01-01T00:00:00Z"}
    assert client.post(url, json=extra, headers=shop.headers).status_code == 422


def test_the_unpaid_filter_lists_only_orders_owed(client, db, flag_on):
    shop = Shop(db)
    url = "/producers/me/product-orders?payment=unpaid"

    # 0: nothing owed yet.
    none = client.get(url, headers=shop.headers).json()
    assert (none["total"], none["orders"]) == (0, [])

    owed = stored_order(db, shop, "confirmed")
    # 1
    one = client.get(url, headers=shop.headers).json()
    assert [o["id"] for o in one["orders"]] == [str(owed.id)]

    # many, among orders that are not owed
    also_owed = {str(stored_order(db, shop, "ready").id), str(_handed(db, shop).id)}
    marked = stored_order(db, shop, "confirmed")
    _paid(client, shop, marked)
    not_owed = ("pending", "declined", "cancelled", "no_show")
    for state in not_owed:
        stored_order(db, shop, state)
    # Handed before the mark existed: its paid_at is NULL, and it is not owed.
    _handed(db, shop, at=SINCE - timedelta(minutes=1))
    many = client.get(url, headers=shop.headers).json()
    assert {o["id"] for o in many["orders"]} == also_owed | {str(owed.id)}
    assert many["total"] == 3

    # Without the filter every order is listed, and only the marked one is paid.
    everything = client.get(
        "/producers/me/product-orders?limit=50", headers=shop.headers
    ).json()
    created = 1 + len(also_owed) + 1 + len(not_owed) + 1
    assert everything["total"] == created
    paid_ids = [o["id"] for o in everything["orders"] if o["paid_at"]]
    assert paid_ids == [str(marked.id)]
    # The view's `owed` and the filter are one definition.
    owed_ids = {o["id"] for o in everything["orders"] if o["owed"]}
    assert owed_ids == also_owed | {str(owed.id)}

    # Combined with ?status=: only the owed handed one.
    handed = client.get(f"{url}&status=handed", headers=shop.headers).json()
    assert [o["status"] for o in handed["orders"]] == ["handed"]
    assert handed["total"] == 1


def test_the_buyer_view_does_not_carry_the_mark(client, db, flag_on):
    from app.services import product_order_views as views

    shop = Shop(db)
    order = stored_order(db, shop, "confirmed")
    _paid(client, shop, order)
    db.expire_all()
    stored = db.get(ProductOrder, order.id)
    assert stored.paid_at is not None
    assert "paid_at" not in views.buyer_view(db, stored)
    assert "owed" not in views.buyer_view(db, stored)
    assert views.business_view(stored)["paid_at"] is not None


def test_a_handed_order_is_owed_only_from_the_cutoff(db, flag_on):
    shop = Shop(db)
    before = _handed(db, shop, at=SINCE - timedelta(seconds=1))
    at = _handed(db, shop, at=SINCE)
    assert paid_module.is_owed(before) is False
    assert paid_module.is_owed(at) is True
    owed = paid_module.only_unpaid(db.query(ProductOrder)).all()
    assert [o.id for o in owed] == [at.id]


def test_active_staff_may_mark_and_a_stale_closed_order_is_404(client, db, flag_on):
    shop = Shop(db)
    headers = _staff(db, shop)
    order = stored_order(db, shop, "confirmed")
    assert _paid(client, shop, order, headers=headers).status_code == 200
    old = _handed(db, shop, closed_at=utc_now() - timedelta(days=8))
    assert _paid(client, shop, old, headers=headers).status_code == 404
    db.expire_all()
    assert db.get(ProductOrder, old.id).paid_at is None
