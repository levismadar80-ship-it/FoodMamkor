"""MEH-745: OTP confirm releases pending_whatsapp producers into pending.

confirm_phone_otp (producer_me.py) sets phone_verified=True and, only for a
producer still in `pending_whatsapp`, advances status to `pending` so the
business enters the normal admin-review queue. No other status is touched, and
an invalid code changes nothing.

Mirrors the fixture + token pattern in tests/test_trust_ladder.py.
"""
from datetime import datetime, timedelta

from app.models.models import PhoneOtpToken

from tests.conftest import auth_header, make_producer, make_user


def _setup(db, status):
    producer = make_producer(db, name="חוות OTP", status=status)
    producer.phone = "0501234569"
    db.commit()
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return producer, user


def _add_token(db, producer, code="123456", minutes=10):
    db.add(
        PhoneOtpToken(
            producer_id=producer.id,
            phone=producer.phone,
            code=code,
            expires_at=datetime.utcnow() + timedelta(minutes=minutes),
        )
    )
    db.commit()


def test_confirm_from_pending_whatsapp_advances_to_pending(client, db):
    producer, user = _setup(db, "pending_whatsapp")
    _add_token(db, producer)

    r = client.post(
        "/producers/me/verify-phone/confirm",
        json={"code": "123456"},
        headers=auth_header(user),
    )
    assert r.status_code == 200, r.json()
    db.refresh(producer)
    assert producer.phone_verified is True
    assert producer.status == "pending"


def test_confirm_from_other_status_leaves_status_unchanged(client, db):
    # An approved producer verifying a (newly added) phone must NOT be demoted.
    producer, user = _setup(db, "approved")
    _add_token(db, producer)

    r = client.post(
        "/producers/me/verify-phone/confirm",
        json={"code": "123456"},
        headers=auth_header(user),
    )
    assert r.status_code == 200, r.json()
    db.refresh(producer)
    assert producer.phone_verified is True
    assert producer.status == "approved"


def test_invalid_code_does_not_transition(client, db):
    producer, user = _setup(db, "pending_whatsapp")
    _add_token(db, producer, code="123456")

    r = client.post(
        "/producers/me/verify-phone/confirm",
        json={"code": "000000"},
        headers=auth_header(user),
    )
    assert r.status_code == 400
    db.refresh(producer)
    assert producer.phone_verified is False
    assert producer.status == "pending_whatsapp"
