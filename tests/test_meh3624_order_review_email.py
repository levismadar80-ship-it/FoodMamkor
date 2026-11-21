"""MEH-3624 — the «איך היה?» email: a day after a business marks an order
handed over, the buyer (when she has an account) gets one email with the
verified-review link. Nothing is sent when she already reviewed the business,
when the business is no longer live, or when there is no address.
"""

from datetime import timedelta

from app.models.engagement import ProducerReview
from app.models.product_orders import ProductOrderNotification
from app.services import product_order_outbox as outbox
from app.services.product_order_state import Actor, apply_transition
from app.utils.clock import utc_now
from tests.conftest import make_user
from tests.test_meh3263_order_route import Shop
from tests.test_meh3296_order_notifications import (
    Wire,
    due_order,
    outcome_of,
    owe_now,
    owed,
)

BUSINESS = Actor("business")


def _handed(db, shop, buyer):
    order = due_order(db, shop, "ready", user_id=buyer.id if buyer else None)
    apply_transition(db, order, "handed", BUSINESS)
    db.commit()
    return order


def test_handing_over_owes_an_account_buyer_one_email_a_day_later(db):
    shop = Shop(db)
    buyer = make_user(db, email="buyer-3624@example.com")
    before = utc_now()
    order = _handed(db, shop, buyer)
    assert owed(db, order.id) == [("review_request", "email")]
    row = db.query(ProductOrderNotification).filter_by(order_id=order.id).one()
    assert before + outbox.REVIEW_REQUEST_AFTER <= row.send_after
    assert row.send_after <= utc_now() + outbox.REVIEW_REQUEST_AFTER


def test_a_guest_buyer_is_owed_no_email(db):
    shop = Shop(db)
    order = _handed(db, shop, None)
    assert owed(db, order.id) == []


def test_no_other_move_owes_the_review_email(db):
    shop = Shop(db)
    buyer = make_user(db)
    order = due_order(db, shop, "ready", user_id=buyer.id)
    apply_transition(db, order, "no_show", BUSINESS)
    db.commit()
    assert ("review_request", "email") not in owed(db, order.id)


def test_nothing_goes_out_before_the_day_is_up(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    _handed(db, shop, make_user(db))
    later = utc_now() + outbox.REVIEW_REQUEST_AFTER - timedelta(minutes=5)
    assert outbox.dispatch_due(db, now=later) == 0
    assert wire.mail == []


def test_the_email_carries_the_business_name_and_the_verified_review_link(
    db, monkeypatch
):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    buyer = make_user(db, email="buyer-link@example.com")
    order = due_order(db, shop, "handed", user_id=buyer.id)
    row = owe_now(db, order, "review_request", "email")
    assert outbox.dispatch_due(db) == 1
    assert outcome_of(db, row) == ("sent", None, 0)
    to, subject, body, test = wire.mail[0]
    assert to == "buyer-link@example.com" and test is False
    name = shop.producer.name
    assert subject == f"איך היה אצל {name}?"
    assert body.startswith(f"תודה שהזמנתם מ{name} דרך מהמקור.")
    path = (
        f"/p/{shop.producer.slug}?rt="
        if shop.producer.slug
        else f"/producer/{shop.producer.id}?rt="
    )
    assert path in body
    assert outbox.dispatch_due(db) == 0  # sent once


def test_a_buyer_who_already_reviewed_the_business_is_not_asked(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    buyer = make_user(db)
    db.add(ProducerReview(producer_id=shop.producer.id, user_id=buyer.id, stars=5))
    db.commit()
    row = owe_now(
        db, due_order(db, shop, "handed", user_id=buyer.id), "review_request", "email"
    )
    outbox.dispatch_due(db)
    assert outcome_of(db, row) == ("skipped", "already_reviewed", 0)
    assert wire.mail == []


def test_a_review_of_another_business_does_not_count(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop, other = Shop(db), Shop(db)
    buyer = make_user(db)
    db.add(ProducerReview(producer_id=other.producer.id, user_id=buyer.id, stars=4))
    db.commit()
    owe_now(
        db, due_order(db, shop, "handed", user_id=buyer.id), "review_request", "email"
    )
    outbox.dispatch_due(db)
    assert len(wire.mail) == 1


def test_a_business_no_longer_live_sends_nothing(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    shop.producer.status = "pending"
    db.commit()
    row = owe_now(
        db,
        due_order(db, shop, "handed", user_id=make_user(db).id),
        "review_request",
        "email",
    )
    outbox.dispatch_due(db)
    assert outcome_of(db, row) == ("skipped", "not_live", 0)
    assert wire.mail == []


def test_a_row_with_no_buyer_account_is_skipped(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    row = owe_now(db, due_order(db, shop, "handed"), "review_request", "email")
    outbox.dispatch_due(db)
    assert outcome_of(db, row) == ("skipped", "no_address", 0)
    assert wire.mail == []
