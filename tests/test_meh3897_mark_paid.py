"""MEH-3897 — the business marks a prepaid surprise-bag reservation as paid.

The money went to its own Bit / PayBox (MEH-3895), so Mehamakor cannot see
it; like a manual-payment order on Shopify / WooCommerce, the reservation
stays unpaid until the business marks it. The buyer's screen reads paid_at,
and a cancelled paid order sends the owners a firm refund email.
"""

# ruff: noqa: F811 — fixtures reused from test_rescue.py are injected by name.

from uuid import uuid4

import app.services.rescue_business_emails as mails
from app.models.models import Producer
from tests.conftest import auth_header, make_producer, make_user
from tests.test_rescue import _seed_offer, rescue_on, shop  # noqa: F401

BIT = "https://www.bitpay.co.il/app/me/ABCD-1234"


def _prepay(db, shop, timing="advance", link=BIT):
    p = db.get(Producer, shop["producer"].id)
    p.payment_info = {"methods": ["bit"], "timing": timing, "note": None, "link": link}
    db.commit()


def _reserve(client, db, shop, email="buyer3897@example.com", offer=None):
    offer = offer or _seed_offer(db, shop["location"])
    buyer = make_user(db, email=email)
    r = client.post(
        "/rescue/orders",
        json={"offer_id": str(offer.id), "qty": 1},
        headers=auth_header(buyer),
    )
    assert r.status_code == 201, r.text
    return buyer, r.json()["id"]


def _paid(client, user, order_id, paid=True):
    return client.post(
        f"/rescue/orders/{order_id}/paid",
        json={"paid": paid},
        headers=auth_header(user),
    )


def _capture(monkeypatch):
    sent = []
    monkeypatch.setattr(
        mails,
        "send_email",
        lambda to, subject, body, html=None, test_cause=False, kind=None: sent.append(
            {"to": to, "subject": subject, "body": body}
        ),
    )
    monkeypatch.setattr("app.services.rescue_emails.send_email", lambda *a, **kw: None)
    return sent


def _refunds(sent):
    return [m for m in sent if m["subject"].startswith("בוטל שריון")]


def test_the_owner_marks_it_paid_and_the_buyer_sees_it(client, db, shop, rescue_on):
    _prepay(db, shop)
    buyer, oid = _reserve(client, db, shop)
    assert (
        client.get("/rescue/orders/mine", headers=auth_header(buyer)).json()[0][
            "paid_at"
        ]
        is None
    )

    r = _paid(client, shop["owner"], oid)
    assert r.status_code == 200, r.text
    first = r.json()["paid_at"]
    assert first is not None

    # The business's own list and the buyer's screen both carry it.
    rows = client.get(
        "/producers/me/rescue/orders", headers=auth_header(shop["owner"])
    ).json()
    assert [row["paid_at"] for row in rows] == [first]
    assert (
        client.get("/rescue/orders/mine", headers=auth_header(buyer)).json()[0][
            "paid_at"
        ]
        == first
    )

    # A second tap keeps the first time; «ביטול הסימון» clears it.
    assert _paid(client, shop["owner"], oid).json()["paid_at"] == first
    assert _paid(client, shop["owner"], oid, paid=False).json()["paid_at"] is None


def test_nobody_else_can_mark_it(client, db, shop, rescue_on):
    _prepay(db, shop)
    buyer, oid = _reserve(client, db, shop)
    other = make_producer(db, name="מאפייה אחרת", city="חיפה")
    stranger = make_user(db, email="other-owner@example.com", role="producer")
    stranger.producer_id = other.id
    db.commit()
    assert _paid(client, stranger, oid).status_code == 403
    assert (
        _paid(client, buyer, oid).status_code == 403
    )  # the buyer cannot vouch for herself
    assert (
        client.post(f"/rescue/orders/{oid}/paid", json={"paid": True}).status_code
        == 401
    )
    assert _paid(client, shop["owner"], uuid4()).status_code == 404


def test_an_admin_can_mark_it(client, db, shop, rescue_on):
    _prepay(db, shop)
    _, oid = _reserve(client, db, shop)
    admin = make_user(db, email="admin3897@example.com", role="admin")
    r = _paid(client, admin, oid)
    assert r.status_code == 200, r.text
    assert r.json()["paid_at"] is not None


def test_a_cancelled_reservation_cannot_be_marked(client, db, shop, rescue_on):
    _prepay(db, shop)
    buyer, oid = _reserve(client, db, shop)
    assert (
        client.post(
            f"/rescue/orders/{oid}/cancel", headers=auth_header(buyer)
        ).status_code
        == 200
    )
    r = _paid(client, shop["owner"], oid)
    assert r.status_code == 409
    assert "שריון פעיל" in r.json()["detail"]


def test_a_no_show_cannot_be_marked(client, db, shop, rescue_on):
    from datetime import timedelta

    from app.utils.clock import utc_now

    _prepay(db, shop)
    now = utc_now()
    offer = _seed_offer(
        db,
        shop["location"],
        pickup_start=now - timedelta(hours=1),
        pickup_end=now + timedelta(hours=1),
    )
    _, oid = _reserve(client, db, shop, offer=offer)
    offer.pickup_end = now - timedelta(minutes=1)  # the window closed
    db.commit()
    assert (
        client.post(
            f"/rescue/orders/{oid}/no-show", headers=auth_header(shop["owner"])
        ).status_code
        == 200
    )
    assert _paid(client, shop["owner"], oid).status_code == 409


def test_a_handed_bag_can_be_marked_and_unmarked(client, db, shop, rescue_on):
    # Paid ahead but marked late, after the bag went out.
    _prepay(db, shop)
    _, oid = _reserve(client, db, shop)
    assert (
        client.post(
            f"/rescue/orders/{oid}/handed", headers=auth_header(shop["owner"])
        ).status_code
        == 200
    )
    assert _paid(client, shop["owner"], oid).json()["paid_at"] is not None
    assert _paid(client, shop["owner"], oid, paid=False).json()["paid_at"] is None


def test_a_business_paid_at_the_counter_cannot_mark(client, db, shop, rescue_on):
    # No link: the buyer would read «בית העסק אישר שהתשלום התקבל» for nothing.
    _, oid = _reserve(client, db, shop)
    r = _paid(client, shop["owner"], oid)
    assert r.status_code == 409
    assert "תשלום מראש" in r.json()["detail"]


def test_a_mark_survives_the_link_being_removed_and_can_still_be_undone(
    client, db, shop, rescue_on
):
    _prepay(db, shop)
    _, oid = _reserve(client, db, shop)
    assert _paid(client, shop["owner"], oid).status_code == 200
    _prepay(db, shop, timing="pickup", link=None)
    rows = client.get(
        "/producers/me/rescue/orders", headers=auth_header(shop["owner"])
    ).json()
    assert [(r["prepay"], r["paid_at"] is not None) for r in rows] == [(False, True)]
    assert _paid(client, shop["owner"], oid, paid=False).json()["paid_at"] is None


def test_the_list_says_whether_to_offer_the_mark(client, db, shop, rescue_on):
    _reserve(client, db, shop)
    rows = lambda: client.get(
        "/producers/me/rescue/orders", headers=auth_header(shop["owner"])
    ).json()  # noqa: E731
    assert [r["prepay"] for r in rows()] == [False]  # pays at the counter: no button
    _prepay(db, shop, timing="deposit")
    assert [r["prepay"] for r in rows()] == [True]
    _prepay(db, shop, timing="advance")
    assert [r["prepay"] for r in rows()] == [True]


def test_a_paid_order_the_buyer_cancels_gets_a_firm_refund_email(
    client, db, shop, rescue_on, monkeypatch
):
    sent = _capture(monkeypatch)
    _prepay(db, shop)
    buyer, oid = _reserve(client, db, shop)
    _paid(client, shop["owner"], oid)
    assert (
        client.post(
            f"/rescue/orders/{oid}/cancel", headers=auth_header(buyer)
        ).status_code
        == 200
    )
    [mail] = _refunds(sent)
    assert "סימנת שהתשלום מראש התקבל, ולכן צריך להחזיר 15 ₪" in mail["body"]
    assert "אם התשלום" not in mail["body"]


def test_a_paid_order_still_gets_the_email_after_the_link_is_gone(
    client, db, shop, rescue_on, monkeypatch
):
    sent = _capture(monkeypatch)
    _prepay(db, shop)
    buyer, oid = _reserve(client, db, shop)
    _paid(client, shop["owner"], oid)
    _prepay(db, shop, timing="pickup", link=None)
    assert (
        client.post(
            f"/rescue/orders/{oid}/cancel", headers=auth_header(buyer)
        ).status_code
        == 200
    )
    assert len(_refunds(sent)) == 1


def test_the_business_cancelling_the_bag_is_told_to_refund_the_paid_ones(
    client, db, shop, rescue_on, monkeypatch
):
    sent = _capture(monkeypatch)
    _prepay(db, shop)
    offer = _seed_offer(db, shop["location"])
    _, paid_oid = _reserve(client, db, shop, email="paid3897@example.com", offer=offer)
    _reserve(client, db, shop, email="unpaid3897@example.com", offer=offer)
    _paid(client, shop["owner"], paid_oid)
    r = client.post(
        f"/rescue/offers/{offer.id}/cancel", headers=auth_header(shop["owner"])
    )
    assert r.status_code == 200, r.text
    refunds = _refunds(sent)
    assert len(refunds) == 1  # the paid one only
    assert "סימנת שהתשלום מראש התקבל" in refunds[0]["body"]
