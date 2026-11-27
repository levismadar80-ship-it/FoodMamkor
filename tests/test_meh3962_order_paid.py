"""MEH-3962 — the business marks an order paid, takes the mark back, and lists
the orders it is still owed for.

The buyer pays the business directly (ADR-042 §5); the mark is the business's
own record. Built on the MEH-3263 fixtures (Shop, stored_order).
"""

from app.models.product_orders import ProductOrder, ProductOrderEvent
from app.services import product_order_paid as paid_module
from tests.test_meh3263_order_route import (  # noqa: F401  (fixtures)
    Shop,
    flag_on,
    stored_order,
)


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
    db.expire_all()
    assert db.get(ProductOrder, order.id).paid_at is not None

    # A second tap keeps the first time it was marked.
    assert _paid(client, shop, order).json()["paid_at"] == first

    back = _paid(client, shop, order, paid=False)
    assert (back.status_code, back.json()["paid_at"]) == (200, None)
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
    order = stored_order(db, shop, "handed")
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
    also_owed = {str(stored_order(db, shop, s).id) for s in ("ready", "handed")}
    marked = stored_order(db, shop, "confirmed")
    _paid(client, shop, marked)
    not_owed = ("pending", "declined", "cancelled", "no_show")
    for state in not_owed:
        stored_order(db, shop, state)
    many = client.get(url, headers=shop.headers).json()
    assert {o["id"] for o in many["orders"]} == also_owed | {str(owed.id)}
    assert many["total"] == 3

    # Without the filter every order is listed, and only the marked one is paid.
    everything = client.get(
        "/producers/me/product-orders?limit=50", headers=shop.headers
    ).json()
    created = 1 + len(also_owed) + 1 + len(not_owed)
    assert everything["total"] == created
    paid_ids = [o["id"] for o in everything["orders"] if o["paid_at"]]
    assert paid_ids == [str(marked.id)]


def test_the_buyer_view_does_not_carry_the_mark(client, db, flag_on):
    from app.services import product_order_views as views

    shop = Shop(db)
    order = stored_order(db, shop, "confirmed")
    _paid(client, shop, order)
    db.expire_all()
    stored = db.get(ProductOrder, order.id)
    assert stored.paid_at is not None
    assert "paid_at" not in views.buyer_view(db, stored)
    assert views.business_view(stored)["paid_at"] is not None
