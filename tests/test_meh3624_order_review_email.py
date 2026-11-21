"""MEH-3624 — the «איך היה?» email: a day after a business marks an order
handed over, the buyer (when she has a verified account) gets one email with
the verified-review link. At most one per buyer per business. Nothing is sent
when she already reviewed the business, when the business is no longer live,
when the order is not handed, or when there is no usable address.
"""

from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse

import pytest

from app.auth import decode_review_invite_token
from app.models.engagement import ProducerReview
from app.models.product_orders import ProducerOrderSettings, ProductOrderNotification
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
REVIEW = ("review_request", "email")


def _handed(db, shop, buyer):
    order = due_order(db, shop, "ready", user_id=buyer.id if buyer else None)
    apply_transition(db, order, "handed", BUSINESS)
    db.commit()
    return order


def _owe_review(db, shop, buyer, status="handed"):
    return owe_now(db, due_order(db, shop, status, user_id=buyer.id), *REVIEW)


def test_handing_over_owes_an_account_buyer_one_email_a_day_later(db):
    shop = Shop(db)
    buyer = make_user(db, email="buyer-3624@example.com")
    before = utc_now()
    order = _handed(db, shop, buyer)
    assert owed(db, order.id) == [REVIEW]
    row = db.query(ProductOrderNotification).filter_by(order_id=order.id).one()
    assert before + outbox.REVIEW_REQUEST_AFTER <= row.send_after
    assert row.send_after <= utc_now() + outbox.REVIEW_REQUEST_AFTER


def test_a_guest_buyer_is_owed_no_email(db):
    shop = Shop(db)
    order = _handed(db, shop, None)
    assert owed(db, order.id) == []


def test_a_no_show_owes_the_buyer_nothing(db):
    shop = Shop(db)
    order = due_order(db, shop, "ready", user_id=make_user(db).id)
    apply_transition(db, order, "no_show", BUSINESS)
    db.commit()
    assert owed(db, order.id) == []


def test_the_row_a_hand_over_writes_goes_out_after_the_day_and_not_before(
    db, monkeypatch
):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    _handed(db, shop, make_user(db, email="later@example.com"))
    day = outbox.REVIEW_REQUEST_AFTER
    assert outbox.dispatch_due(db, now=utc_now() + day - timedelta(minutes=5)) == 0
    assert wire.mail == []
    assert outbox.dispatch_due(db, now=utc_now() + day + timedelta(minutes=1)) == 1
    assert [m[0] for m in wire.mail] == ["later@example.com"]


def test_the_email_carries_the_business_name_and_its_verified_review_link(
    db, monkeypatch
):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    shop.producer.slug = f"bakery-{shop.producer.id.hex[:6]}"
    db.commit()
    buyer = make_user(db, email="buyer-link@example.com")
    row = _owe_review(db, shop, buyer)
    assert outbox.dispatch_due(db) == 1
    assert outcome_of(db, row) == ("sent", None, 0)
    to, subject, body, test = wire.mail[0]
    assert to == "buyer-link@example.com" and test is False
    name = shop.producer.name
    assert subject == f"איך היה אצל {name}?"
    assert body.startswith(f"תודה על ההזמנה אצל {name} דרך מהמקור.")
    link = urlparse(body.rsplit(" ", 1)[-1])
    assert link.path == f"/p/{shop.producer.slug}"
    claims = decode_review_invite_token(parse_qs(link.query)["rt"][0])
    assert claims is not None and str(claims["producer_id"]) == str(shop.producer.id)
    assert outbox.dispatch_due(db) == 0  # sent once


def test_a_second_order_from_the_same_business_is_not_asked_again(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop, other = Shop(db), Shop(db)
    buyer = make_user(db)
    _owe_review(db, shop, buyer)
    outbox.dispatch_due(db)
    again = _owe_review(db, shop, buyer)
    elsewhere = _owe_review(db, other, buyer)
    outbox.dispatch_due(db)
    assert outcome_of(db, again) == ("skipped", "asked_before", 0)
    assert outcome_of(db, elsewhere)[0] == "sent"  # another business: asked once
    assert len(wire.mail) == 2


def test_a_buyer_who_already_reviewed_the_business_is_not_asked(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    buyer = make_user(db)
    db.add(ProducerReview(producer_id=shop.producer.id, user_id=buyer.id, stars=5))
    db.commit()
    row = _owe_review(db, shop, buyer)
    outbox.dispatch_due(db)
    assert outcome_of(db, row) == ("skipped", "already_reviewed", 0)
    assert wire.mail == []


def test_a_review_of_another_business_does_not_count(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop, other = Shop(db), Shop(db)
    buyer = make_user(db)
    db.add(ProducerReview(producer_id=other.producer.id, user_id=buyer.id, stars=4))
    db.commit()
    _owe_review(db, shop, buyer)
    outbox.dispatch_due(db)
    assert len(wire.mail) == 1


@pytest.mark.parametrize(
    ("change", "code"),
    [
        (lambda shop, buyer: setattr(shop.producer, "status", "pending"), "not_live"),
        (lambda shop, buyer: setattr(buyer, "email_verified", False), "no_address"),
        (lambda shop, buyer: setattr(buyer, "is_blocked", True), "not_eligible"),
        (
            lambda shop, buyer: setattr(buyer, "producer_id", shop.producer.id),
            "not_eligible",
        ),
    ],
    ids=["business-not-approved", "email-unverified", "buyer-blocked", "own-shop"],
)
def test_no_email_when_it_should_not_go(db, monkeypatch, change, code):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    buyer = make_user(db)
    change(shop, buyer)
    db.commit()
    row = _owe_review(db, shop, buyer)
    outbox.dispatch_due(db)
    assert outcome_of(db, row) == ("skipped", code, 0)
    assert wire.mail == []


def test_an_order_that_is_not_handed_sends_nothing(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    row = _owe_review(db, shop, make_user(db), status="cancelled")
    outbox.dispatch_due(db)
    assert outcome_of(db, row) == ("skipped", "not_live", 0)
    assert wire.mail == []


def test_a_row_with_no_buyer_account_is_skipped(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    row = owe_now(db, due_order(db, shop, "handed"), *REVIEW)
    outbox.dispatch_due(db)
    assert outcome_of(db, row) == ("skipped", "no_address", 0)
    assert wire.mail == []


def test_a_test_business_is_never_mailed_for_real(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    shop.producer.is_test = True
    db.commit()
    row = _owe_review(db, shop, make_user(db))
    outbox.dispatch_due(db)
    assert wire.mail[0][3] is True  # handed to the sender as a test send
    assert outcome_of(db, row)[0] == "skipped"


def test_an_observant_business_holds_it_until_shabbat_ends_and_then_sends(
    db, monkeypatch
):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    db.query(ProducerOrderSettings).filter_by(producer_id=shop.producer.id).update(
        {"shabbat_observant": True}
    )
    db.commit()
    row = _owe_review(db, shop, make_user(db))
    saturday_noon = datetime(2026, 11, 28, 10)  # 12:00 Israel, inside rest
    row.send_after = saturday_noon - timedelta(minutes=1)
    db.commit()
    outbox.dispatch_due(db, now=saturday_noon)
    db.expire_all()
    held = db.get(ProductOrderNotification, row.id)
    assert held.outcome == "pending" and held.send_after == datetime(2026, 11, 28, 19)
    assert wire.mail == []
    outbox.dispatch_due(db, now=datetime(2026, 11, 28, 19, 2))
    assert outcome_of(db, row)[0] == "sent"  # not dropped as stale


def test_an_unknown_buyer_kind_is_never_sent_as_closed():
    with pytest.raises(ValueError):
        outbox._buyer_template("someday_new_kind", None, "x", "y")  # type: ignore[arg-type]
