"""Grill B8: changing the WhatsApp number drops the phone verification.

`phone_verified` is written only by the OTP confirm. Without this rule an
owner could verify number A, switch to number B in `PUT /producers/me`, and
still pass the submit gate (`submission_gate.py`) and the trust tier with a
number nobody verified (MEH-745 ruled the verified number a submit item).
A code sent to the old number must not verify the new one either.
"""

from datetime import timedelta

import pytest

from app.models.models import PhoneOtpToken
from app.utils.clock import utc_now
from conftest import auth_header, make_producer, make_user


def _verified_owner(db, status="draft"):
    producer = make_producer(db, name="חוות אימות", status=status)
    producer.phone = "0501234569"
    producer.phone_verified = True
    user = make_user(db, role="producer", email=f"reverify-{status}@example.com")
    user.producer_id = producer.id
    db.commit()
    return producer, user


@pytest.mark.parametrize("status", ["draft", "approved"])
def test_new_number_is_no_longer_verified(client, db, status):
    producer, user = _verified_owner(db, status)
    resp = client.put(
        "/producers/me", json={"phone": "0527654321"}, headers=auth_header(user)
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.phone_verified is False


def test_same_number_in_another_format_stays_verified(client, db):
    producer, user = _verified_owner(db)
    resp = client.put(
        "/producers/me", json={"phone": "050-123-4569"}, headers=auth_header(user)
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.phone_verified is True


def test_unrelated_save_keeps_verification(client, db):
    producer, user = _verified_owner(db)
    resp = client.put(
        "/producers/me", json={"description": "תיאור חדש לעסק"}, headers=auth_header(user)
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.phone_verified is True


def test_code_sent_to_old_number_cannot_verify_new_one(client, db):
    producer, user = _verified_owner(db)
    producer.phone_verified = False
    db.add(
        PhoneOtpToken(
            producer_id=producer.id,
            phone=producer.phone,
            code="123456",
            expires_at=utc_now() + timedelta(minutes=10),
        )
    )
    db.commit()
    client.put("/producers/me", json={"phone": "0527654321"}, headers=auth_header(user))
    resp = client.post(
        "/producers/me/verify-phone/confirm",
        json={"code": "123456"},
        headers=auth_header(user),
    )
    assert resp.status_code == 400
    db.refresh(producer)
    assert producer.phone_verified is False
