"""
Module:   test_meh3768_delist_open_orders
Purpose:  MEH-3768. When the site hides a business (admin pause, a blocked
          owner), the on-site orders it never accepted (pending,
          change_proposed) are cancelled by the system and each buyer is owed
          the «closed» WhatsApp. Orders it accepted (confirmed, ready) stay
          open, and the owner's email says she still hands them over.
Touches:  Postgres test DB via TestClient; the owner email sender patched
          where booking_cancellations looks it up.
Related:  backend/app/services/booking_cancellations.py · tests/test_meh3227_delist_cascade.py
History:  MEH-3768 (creation)
"""

from datetime import timedelta

import pytest

from app.models.product_orders import (
    ProductOrder,
    ProductOrderEvent,
    ProductOrderNotification,
)
from app.services.product_order_actions import DELISTED_ORDER_NOTE
from app.utils.clock import utc_now
from conftest import auth_header, make_producer, make_user


@pytest.fixture
def owner_mail(monkeypatch):
    import app.services.booking_cancellations as bc

    calls: list[dict] = []
    monkeypatch.setattr(
        bc,
        "send_owner_delisted",
        lambda to, name, **kw: calls.append({"to": to, **kw}),
    )
    return calls


def _business(db):
    producer = make_producer(db, name="מאפיית הגליל", status="approved", city="חיפה")
    owner = make_user(
        db,
        role="producer",
        email=f"owner-{producer.id}@example.com",
        email_verified=True,
    )
    owner.producer_id = producer.id
    owner.is_producer = True
    db.commit()
    return producer


def _order(db, producer, status):
    now = utc_now()
    order = ProductOrder(
        producer_id=producer.id,
        customer_name="דנה לוי",
        customer_phone="+972501234567",
        fulfilment="pickup",
        slot_start=now + timedelta(days=2),
        slot_end=now + timedelta(days=2, hours=2),
        estimated_total_agorot=8600,
        status=status,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def _hide(client, db, producer):
    admin = make_user(db, role="admin", email="admin@example.com")
    r = client.post(
        f"/admin/producers/{producer.id}/toggle-status", headers=auth_header(admin)
    )
    assert r.status_code == 200, r.text


def _status(db, order):
    db.expire_all()
    return db.get(ProductOrder, order.id).status


def _closed_owed(db, order):
    return (
        db.query(ProductOrderNotification)
        .filter(
            ProductOrderNotification.order_id == order.id,
            ProductOrderNotification.kind == "closed",
        )
        .count()
    )


def test_unaccepted_orders_are_cancelled_by_the_system_and_the_buyer_told(
    client, db, owner_mail
):
    producer = _business(db)
    pending = _order(db, producer, "pending")
    proposed = _order(db, producer, "change_proposed")
    _hide(client, db, producer)

    for order in (pending, proposed):
        assert _status(db, order) == "cancelled"
        event = (
            db.query(ProductOrderEvent)
            .filter(ProductOrderEvent.order_id == order.id)
            .order_by(ProductOrderEvent.created_at.desc())
            .first()
        )
        assert (event.actor, event.note) == ("system", DELISTED_ORDER_NOTE)
        assert _closed_owed(db, order) == 1
    assert owner_mail[0]["cancelled_any"] is False  # bags, sign-ups, group buys only
    assert owner_mail[0]["orders_cancelled"] is True
    assert owner_mail[0]["orders_kept"] is False


def test_accepted_orders_stay_open_and_the_owner_is_told_to_hand_them_over(
    client, db, owner_mail
):
    producer = _business(db)
    confirmed = _order(db, producer, "confirmed")
    ready = _order(db, producer, "ready")
    handed = _order(db, producer, "handed")
    _hide(client, db, producer)

    assert _status(db, confirmed) == "confirmed"
    assert _status(db, ready) == "ready"
    assert _status(db, handed) == "handed"
    assert _closed_owed(db, confirmed) == 0
    assert owner_mail[0]["orders_cancelled"] is False
    assert owner_mail[0]["orders_kept"] is True
    assert owner_mail[0]["cancelled_any"] is False


def test_another_businesss_orders_are_left(client, db, owner_mail):
    producer = _business(db)
    other = make_producer(db, name="משק אחר", status="approved", city="חיפה")
    theirs = _order(db, other, "pending")
    _hide(client, db, producer)
    assert _status(db, theirs) == "pending"


def test_owner_mail_lines(monkeypatch):
    from app.services import booking_cancellations as bc

    out = []
    monkeypatch.setattr(bc, "send_email", lambda *a, **k: out.append(a))
    bc.send_owner_delisted(
        "o@example.com",
        "מאפיית הגליל",
        deleted=False,
        cancelled_any=True,
        orders_cancelled=True,
        orders_kept=True,
    )
    body = out[0][2]
    assert "הזמנות שעוד לא אישרתם בוטלו, והלקוחות קיבלו על כך הודעה." in body
    assert (
        "הזמנות שכבר אישרתם נשארות בתוקף. צריך למסור אותן ללקוחות כרגיל, דרך לוח הבקרה."
        in body
    )

    out.clear()
    bc.send_owner_delisted(
        "o@example.com", "מאפיית הגליל", deleted=False, cancelled_any=False
    )
    assert "הזמנות" not in out[0][2]
