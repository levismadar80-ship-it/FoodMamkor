"""MEH-1816: the review-ready ping must also fire from the OTP confirm site.

MEH-1351 wired the "העסק מוכן לאישור" admin ping to PUT /producers/me only,
and gated it on status=="pending". A self-registered business that uploads its
image while still in `pending_whatsapp` and only then verifies its phone
crossed the approvability threshold at the OTP site — where nothing checked —
so the ping was swallowed and the business sat in the queue unannounced.

confirm_phone_otp now snapshots approvability before the pending_whatsapp →
pending flip and reuses `_maybe_fire_review_ready`, so the false→true
transition check is literally the same one PUT /producers/me runs. The snapshot
is what keeps the already-pending path silent: such a producer is approvable
*before* the call, so `not was_approvable` is False and nothing fires.

Mirrors the fixture pattern in tests/test_otp_pending_whatsapp_transition.py
and the patch-at-import-site pattern in tests/test_meh1351_review_ready_ping.py.
"""

from datetime import datetime, timedelta
from unittest.mock import patch

from app.models.models import PhoneOtpToken

from tests.conftest import auth_header, make_category, make_producer, make_user

PATCH_TARGET = "app.routers.producer_me.notify_admin_producer_review_ready"

IMAGE = "https://res.cloudinary.com/demo/image/upload/v1/otp.jpg"


def _setup(db, status, *, images=None):
    # make_category default (ירקות אורגניים) is NOT license-required, so an
    # image alone decides approvability — the license axis is MEH-1351's.
    cat = make_category(db)
    producer = make_producer(
        db, name="חוות האישור", status=status, images=images, category=cat
    )
    producer.phone = "0501234569"
    db.commit()
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return producer, user


def _add_token(db, producer, code="123456"):
    db.add(
        PhoneOtpToken(
            producer_id=producer.id,
            phone=producer.phone,
            code=code,
            expires_at=datetime.utcnow() + timedelta(minutes=10),
        )
    )
    db.commit()


def _confirm(client, user, code="123456"):
    return client.post(
        "/producers/me/verify-phone/confirm",
        json={"code": code},
        headers=auth_header(user),
    )


def test_image_before_otp_fires_the_ping(client, db):
    """The MEH-1816 bug: image uploaded first, OTP second → ping must fire."""
    producer, user = _setup(db, "pending_whatsapp", images=[IMAGE])
    _add_token(db, producer)

    with patch(PATCH_TARGET) as ping:
        r = _confirm(client, user)

    assert r.status_code == 200, r.json()
    db.refresh(producer)
    assert producer.status == "pending"
    ping.assert_called_once_with("חוות האישור", producer.city)


def test_no_image_at_otp_does_not_fire(client, db):
    """Transition alone is not enough — an unapprovable producer stays quiet."""
    producer, user = _setup(db, "pending_whatsapp")
    _add_token(db, producer)

    with patch(PATCH_TARGET) as ping:
        r = _confirm(client, user)

    assert r.status_code == 200, r.json()
    db.refresh(producer)
    assert producer.status == "pending"
    ping.assert_not_called()


def test_already_pending_confirm_does_not_fire(client, db):
    """No pending_whatsapp → no transition. An already-approvable pending
    producer verifying its phone must not re-announce itself."""
    producer, user = _setup(db, "pending", images=[IMAGE])
    _add_token(db, producer)

    with patch(PATCH_TARGET) as ping:
        r = _confirm(client, user)

    assert r.status_code == 200, r.json()
    db.refresh(producer)
    assert producer.status == "pending"
    ping.assert_not_called()
