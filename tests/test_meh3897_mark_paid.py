"""MEH-3897 — the business marks a prepaid surprise-bag reservation as paid.

The money went to its own Bit / PayBox (MEH-3895), so Mehamakor cannot see
it; like a manual-payment order on Shopify / WooCommerce, the reservation
stays unpaid until the business marks it. The buyer's screen reads paid_at.
"""

# ruff: noqa: F811 — fixtures reused from test_rescue.py are injected by name.

from tests.conftest import auth_header, make_producer, make_user
from tests.test_rescue import _seed_offer, rescue_on, shop  # noqa: F401


def _reserve(client, db, shop, email="buyer3897@example.com"):
    offer = _seed_offer(db, shop["location"])
    buyer = make_user(db, email=email)
    r = client.post(
        "/rescue/orders", json={"offer_id": str(offer.id), "qty": 1}, headers=auth_header(buyer)
    )
    assert r.status_code == 201, r.text
    return buyer, r.json()["id"]


def _paid(client, user, order_id, paid=True):
    return client.post(
        f"/rescue/orders/{order_id}/paid", json={"paid": paid}, headers=auth_header(user)
    )


def test_the_owner_marks_it_paid_and_the_buyer_sees_it(client, db, shop, rescue_on):
    buyer, oid = _reserve(client, db, shop)
    assert client.get("/rescue/orders/mine", headers=auth_header(buyer)).json()[0]["paid_at"] is None

    r = _paid(client, shop["owner"], oid)
    assert r.status_code == 200, r.text
    first = r.json()["paid_at"]
    assert first is not None

    # The business's own list and the buyer's screen both carry it.
    rows = client.get("/producers/me/rescue/orders", headers=auth_header(shop["owner"])).json()
    assert [row["paid_at"] for row in rows] == [first]
    assert client.get("/rescue/orders/mine", headers=auth_header(buyer)).json()[0]["paid_at"] == first

    # A second tap keeps the first time; «בטל» clears it.
    assert _paid(client, shop["owner"], oid).json()["paid_at"] == first
    assert _paid(client, shop["owner"], oid, paid=False).json()["paid_at"] is None


def test_nobody_else_can_mark_it(client, db, shop, rescue_on):
    buyer, oid = _reserve(client, db, shop)
    other = make_producer(db, name="מאפייה אחרת", city="חיפה")
    stranger = make_user(db, email="other-owner@example.com", role="producer")
    stranger.producer_id = other.id
    db.commit()
    assert _paid(client, stranger, oid).status_code == 403
    assert _paid(client, buyer, oid).status_code == 403  # the buyer cannot vouch for herself
    assert client.post(f"/rescue/orders/{oid}/paid", json={"paid": True}).status_code == 401


def test_a_cancelled_reservation_cannot_be_marked(client, db, shop, rescue_on):
    buyer, oid = _reserve(client, db, shop)
    assert client.post(f"/rescue/orders/{oid}/cancel", headers=auth_header(buyer)).status_code == 200
    r = _paid(client, shop["owner"], oid)
    assert r.status_code == 409
    assert "שריון פעיל" in r.json()["detail"]


def test_a_handed_bag_can_still_be_marked(client, db, shop, rescue_on):
    # Paid at the counter after the bag went out, or marked late.
    _, oid = _reserve(client, db, shop)
    assert client.post(f"/rescue/orders/{oid}/handed", headers=auth_header(shop["owner"])).status_code == 200
    assert _paid(client, shop["owner"], oid).json()["paid_at"] is not None


def test_the_list_says_whether_to_offer_the_mark(client, db, shop, rescue_on):
    from app.models.models import Producer

    _reserve(client, db, shop)
    rows = lambda: client.get("/producers/me/rescue/orders", headers=auth_header(shop["owner"])).json()  # noqa: E731
    assert [r["prepay"] for r in rows()] == [False]  # pays at the counter: no button
    p = db.get(Producer, shop["producer"].id)
    p.payment_info = {"methods": ["bit"], "timing": "advance", "note": None, "link": "https://www.bitpay.co.il/x"}
    db.commit()
    assert [r["prepay"] for r in rows()] == [True]
