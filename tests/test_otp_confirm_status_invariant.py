"""MEH-2124 — confirming the OTP verifies the phone and touches NOTHING else.

This file replaces `tests/test_otp_pending_whatsapp_transition.py`, whose whole
subject was the branch this card deleted: MEH-745 parked a self-registered
business in a `pending_whatsapp` status and a successful confirm advanced it to
`pending`. Under the draft machine nothing ever entered that status, no row has
ever held it, and the value was removed in MEH-2124 — so the branch had an exit
and no entrance.

WHAT IS LEFT TO GUARD, and why it is worth a file rather than nothing: the
handler must now be a pure `phone_verified` writer. A future change that
re-introduces ANY status transition here — the old flip, or a new
"submit on verify" shortcut — would bypass the submit gate
(`submission_gate.py`), which is the one place allowed to decide that a
business is ready for the queue. These assertions go red on that, and they are
red-by-construction: restoring the two deleted lines

    if producer.status == "pending_whatsapp":
        producer.status = "pending"

does not fail them (that status no longer exists to be matched), but the
draft-shaped version of the same mistake — `producer.status = "pending"`
unconditionally — fails `test_confirm_on_a_draft_does_not_submit_it`
immediately. That is the mistake worth guarding, so that is the one the test
is built against.

Touches:  producers + phone_otp_tokens, via the standard test session.
Does NOT: cover the token-claim race (tests/test_otp_confirm_concurrency.py) or
          the review-ready ping (which this handler can no longer fire — see
          the MEH-2124 note in `confirm_phone_otp`).
History:  MEH-2124 (creation, replacing test_otp_pending_whatsapp_transition).
"""

from datetime import datetime, timedelta

import pytest

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


def _confirm(client, user, code="123456"):
    return client.post(
        "/producers/me/verify-phone/confirm",
        json={"code": code},
        headers=auth_header(user),
    )


def test_confirm_on_a_draft_does_not_submit_it(client, db):
    """THE case this file exists for.

    A draft that verifies its phone has satisfied ONE of the five submit
    requirements, not all of them. Only POST /producers/me/submit-for-review may
    move it into the queue, and only after `submission_missing_items` is empty.
    Goes red against a handler that sets `status = "pending"` here.
    """
    producer, user = _setup(db, "draft")
    _add_token(db, producer)

    r = _confirm(client, user)

    assert r.status_code == 200, r.json()
    db.refresh(producer)
    assert producer.phone_verified is True
    assert producer.status == "draft", (
        "confirming the OTP moved a draft into the review queue — only the "
        "submit gate may do that"
    )


@pytest.mark.parametrize("status", ["draft", "pending", "approved", "rejected", "inactive"])
def test_confirm_never_changes_status(client, db, status):
    """Every value of the 5-state machine, so a re-introduced transition cannot
    hide in the one status nobody parametrised."""
    producer, user = _setup(db, status)
    _add_token(db, producer)

    r = _confirm(client, user)

    assert r.status_code == 200, r.json()
    db.refresh(producer)
    assert producer.phone_verified is True
    assert producer.status == status


def test_invalid_code_verifies_nothing(client, db):
    producer, user = _setup(db, "draft")
    _add_token(db, producer, code="123456")

    r = _confirm(client, user, code="000000")

    assert r.status_code == 400
    db.refresh(producer)
    assert producer.phone_verified is False
    assert producer.status == "draft"
