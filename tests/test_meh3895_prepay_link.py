"""MEH-3895 — the business's own prepay link (option A of
docs/research/rescue-prepay-2026-11.md).

payment_info carries an optional "link": https only, no credentials, ≤ 300
chars. A buyer is shown it only when the business said the money is paid
before pickup (timing advance / deposit). When a buyer cancels a bag at such a
business, the owner is emailed what to return.
"""

# ruff: noqa: F811 — fixtures reused from test_rescue.py are injected by name.

import pytest
from pydantic import ValidationError

from app.models.models import Producer
from app.schemas.payment_link import prepay_link
from app.schemas.schemas import ProducerUpdate
from app.services import rescue_business_emails as mod
from tests.conftest import auth_header, make_user
from tests.test_rescue import _seed_offer, rescue_on, shop  # noqa: F401

BIT = "https://www.bitpay.co.il/app/me/ABCD-1234"


def _upd(v):
    return ProducerUpdate(payment_info=v).payment_info


def test_a_link_is_stored_with_the_rest():
    out = _upd({"methods": ["bit"], "timing": "advance", "link": f"  {BIT}  "})
    assert out == {"methods": ["bit"], "timing": "advance", "note": None, "link": BIT}


def test_a_link_is_dropped_unless_paying_before_pickup():
    # A link on «באיסוף» could never be shown, and a stale one would come
    # back if the business later picked «מראש».
    assert _upd({"methods": ["bit"], "timing": "on_pickup", "link": BIT}) == {
        "methods": ["bit"], "timing": "on_pickup", "note": None,
    }
    assert _upd({"timing": None, "link": BIT}) is None


def test_no_link_keeps_the_old_shape():
    # Rows written before MEH-3895 have no "link" key; a save without one
    # must not add it.
    assert _upd({"methods": ["cash"], "timing": None, "note": None}) == {
        "methods": ["cash"], "timing": None, "note": None,
    }
    assert _upd({"methods": [], "link": "  "}) is None


@pytest.mark.parametrize(
    "bad",
    [
        "http://www.bitpay.co.il/x",  # not https
        "javascript:alert(1)",
        "data:text/html,hi",
        "https://user:pw@evil.example/x",  # shows one host, opens another
        "https://good.co.il\\@evil.example/x",  # a browser reads \\ as /
        "https://good.co.il:abc/x",  # a port that is not a number
        "https://good.co.il/\x00x",  # a control character
        "https://www.bitpay.co.il/a b",  # whitespace
        "https://localhost/pay",  # no dot in the host
        "https://" + "a" * 300 + ".co.il",  # too long
        42,
    ],
)
def test_a_bad_link_is_refused(bad):
    with pytest.raises(ValidationError):
        _upd({"timing": "advance", "link": bad})


def test_the_buyer_sees_it_only_when_paying_before_pickup():
    assert prepay_link({"timing": "advance", "link": BIT}) == BIT
    assert prepay_link({"timing": "deposit", "link": BIT}) == BIT
    assert prepay_link({"timing": "on_pickup", "link": BIT}) is None
    assert prepay_link({"timing": None, "link": BIT}) is None
    assert prepay_link({"timing": "advance"}) is None
    assert prepay_link(None) is None


def _pay(db, producer_id, info):
    p = db.get(Producer, producer_id)
    p.payment_info = info
    db.commit()


def test_the_bag_page_carries_the_link(client, db, shop, rescue_on):
    offer = _seed_offer(db, shop["location"])
    r = client.get(f"/rescue/offers/{offer.id}")
    assert r.status_code == 200, r.text
    assert r.json()["producer"]["prepay_link"] is None
    assert r.json()["producer"]["prepay_timing"] is None
    _pay(db, shop["producer"].id, {"methods": ["bit"], "timing": "advance", "note": None, "link": BIT})
    shown = client.get(f"/rescue/offers/{offer.id}").json()["producer"]
    assert (shown["prepay_link"], shown["prepay_timing"]) == (BIT, "advance")


def _capture(monkeypatch):
    sent = []
    monkeypatch.setattr(
        mod, "send_email",
        lambda to, subject, body, html=None, test_cause=False, kind=None: sent.append(
            {"to": to, "subject": subject, "body": body}
        ),
    )
    monkeypatch.setattr("app.services.rescue_emails.send_email", lambda *a, **kw: None)
    return sent


def _reserve_and_cancel(client, db, shop, qty):
    offer = _seed_offer(db, shop["location"])
    buyer = make_user(db, email=f"buyer3895-{qty}@example.com")
    r = client.post(
        "/rescue/orders", json={"offer_id": str(offer.id), "qty": qty}, headers=auth_header(buyer)
    )
    assert r.status_code == 201, r.text
    code = r.json()["pickup_code"]
    c = client.post(f"/rescue/orders/{r.json()['id']}/cancel", headers=auth_header(buyer))
    assert c.status_code == 200, c.text
    return code


def test_a_cancel_of_a_prepaid_bag_tells_the_owner_what_to_return(
    client, db, shop, rescue_on, monkeypatch
):
    sent = _capture(monkeypatch)
    _pay(db, shop["producer"].id, {"methods": ["bit"], "timing": "advance", "note": None, "link": BIT})
    code = _reserve_and_cancel(client, db, shop, qty=2)
    refunds = [m for m in sent if m["subject"].startswith("בוטל שריון")]
    assert [m["to"] for m in refunds] == ["owner@example.com"]
    body = refunds[0]["body"]
    assert refunds[0]["subject"] == "בוטל שריון של סל הפתעה במאפיית ההצלה"
    assert f"שריון של שני סלים בוטל עכשיו (קוד האיסוף {code})." in body
    assert "צריך להחזיר 30 ₪" in body  # 2 × 15 ₪


def test_a_deposit_names_no_amount(client, db, shop, rescue_on, monkeypatch):
    sent = _capture(monkeypatch)
    _pay(db, shop["producer"].id, {"methods": ["bit"], "timing": "deposit", "note": None, "link": BIT})
    _reserve_and_cancel(client, db, shop, qty=1)
    (m,) = [m for m in sent if m["subject"].startswith("בוטל שריון")]
    assert "אם המקדמה כבר התקבלה, צריך להחזיר אותה" in m["body"]
    assert "₪" not in m["body"]


def test_a_failing_refund_email_leaves_the_cancel_done(client, db, shop, rescue_on, monkeypatch):
    _capture(monkeypatch)
    _pay(db, shop["producer"].id, {"methods": ["bit"], "timing": "advance", "note": None, "link": BIT})

    def boom(*a, **kw):
        raise RuntimeError("queue down")

    monkeypatch.setattr("app.routers.rescue.queue_business_refund_email", boom)
    _reserve_and_cancel(client, db, shop, qty=1)  # asserts the cancel answered 200


def test_no_link_no_refund_email(client, db, shop, rescue_on, monkeypatch):
    sent = _capture(monkeypatch)
    # Paying at pickup: nothing was paid ahead, so there is nothing to return.
    _pay(db, shop["producer"].id, {"methods": ["bit"], "timing": "on_pickup", "note": None})
    _reserve_and_cancel(client, db, shop, qty=1)
    assert not [m for m in sent if m["subject"].startswith("בוטל שריון")]
