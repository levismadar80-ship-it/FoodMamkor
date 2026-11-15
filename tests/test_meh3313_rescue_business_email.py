"""MEH-3313 — the business gets one email per owner login when a bag is reserved.

Before: only the buyer was mailed (rescue_emails.send_reservation_email), so
the counter learned about a reservation when the buyer walked in.
"""

# ruff: noqa: F811 — fixtures reused from test_rescue.py are injected by name.

from app.models.models import Producer, RescueOrder
from app.utils.clock import utc_now
from tests.conftest import auth_header, make_user
from tests.test_rescue import _seed_offer, rescue_on, shop  # noqa: F401

from app.services import rescue_business_emails as mod


def _capture(monkeypatch):
    sent = []
    monkeypatch.setattr(
        mod,
        "send_email",
        lambda to, subject, body, html=None, test_cause=False: sent.append(
            {"to": to, "subject": subject, "body": body, "test_cause": test_cause}
        ),
    )
    # The buyer's own email is not under test here.
    monkeypatch.setattr("app.services.rescue_emails.send_email", lambda *a, **kw: None)
    return sent


def _reserve(client, offer, buyer, qty=1):
    return client.post(
        "/rescue/orders",
        json={"offer_id": str(offer.id), "qty": qty},
        headers=auth_header(buyer),
    )


def test_a_reservation_emails_the_owner_once(client, db, shop, rescue_on, monkeypatch):
    sent = _capture(monkeypatch)
    offer = _seed_offer(db, shop["location"])
    buyer = make_user(db, email="buyer3313@example.com")
    r = _reserve(client, offer, buyer, qty=2)
    assert r.status_code == 201, r.text
    code = r.json()["pickup_code"]
    assert [m["to"] for m in sent] == ["owner@example.com"]
    m = sent[0]
    assert m["subject"] == "נשמר סל הפתעה במאפיית ההצלה"
    assert "נשמרו שני סלים עכשיו מסלי ההפתעה של היום." in m["body"]
    assert f"קוד האיסוף: {code}." in m["body"]
    assert "משלמים 30 ₪" in m["body"]  # 2 × 15 ₪
    assert "/producer/dashboard/rescue" in m["body"]
    assert m["test_cause"] is False


def test_one_bag_reads_in_the_singular(client, db, shop, rescue_on, monkeypatch):
    sent = _capture(monkeypatch)
    offer = _seed_offer(db, shop["location"])
    assert (
        _reserve(client, offer, make_user(db, email="b1@example.com")).status_code
        == 201
    )
    assert "נשמר סל אחד עכשיו" in sent[0]["body"]


def test_a_refused_reservation_sends_nothing(client, db, shop, rescue_on, monkeypatch):
    sent = _capture(monkeypatch)
    offer = _seed_offer(db, shop["location"], qty_total=1)
    r = _reserve(client, offer, make_user(db, email="b2@example.com"), qty=2)
    assert r.status_code == 409
    assert sent == []


def test_no_owner_with_an_email_still_reserves(
    client, db, shop, rescue_on, monkeypatch
):
    sent = _capture(monkeypatch)
    shop["owner"].producer_id = None
    db.commit()
    offer = _seed_offer(db, shop["location"])
    assert (
        _reserve(client, offer, make_user(db, email="b3@example.com")).status_code
        == 201
    )
    assert sent == []


def test_a_test_business_flags_test_cause(client, db, shop, rescue_on, monkeypatch):
    _capture(monkeypatch)
    offer = _seed_offer(db, shop["location"])
    # is_test rows are 404 to reserve (MEH-2952), so flip it after the seed
    # only on the email path: call the queue helper directly.
    producer = db.get(Producer, shop["producer"].id)
    producer.is_test = True
    db.commit()

    class _BT:
        def __init__(self):
            self.calls = []

        def add_task(self, fn, *a, **kw):
            self.calls.append(kw)

    order = RescueOrder(
        offer_id=offer.id,
        user_id=shop["owner"].id,
        qty=1,
        pickup_code="1234",
        status="reserved",
        created_at=utc_now(),
    )
    bt = _BT()
    assert mod.queue_business_reservation_email(bt, db, offer, order) == 1
    assert bt.calls == [{"test_cause": True}]
