"""MEH-3660: the owner's email confirmation is a submit requirement.

The dashboard checklist shows «אישור כתובת האימייל» as a row, and the server
gate is the same rule, so a business is never told "ready" while the server
would refuse, and the «אושרת» email reaches an address that works.
"""

from app.services.submission_gate import (
    MISSING_EMAIL_VERIFIED,
    SUBMISSION_REQUIREMENTS,
    submission_missing_items,
)
from tests.conftest import auth_header, make_submit_ready_producer


def test_verified_owner_is_not_asked_for_email(db):
    producer, _user = make_submit_ready_producer(db)
    assert MISSING_EMAIL_VERIFIED not in submission_missing_items(producer)


def test_unverified_owner_blocks_on_email(db):
    producer, user = make_submit_ready_producer(db)
    user.email_verified = False
    db.commit()
    assert submission_missing_items(producer) == [MISSING_EMAIL_VERIFIED]


def test_email_is_the_last_business_requirement():
    assert SUBMISSION_REQUIREMENTS[-1] == MISSING_EMAIL_VERIFIED


def test_submit_422_names_email_for_an_unverified_owner(client, db):
    producer, user = make_submit_ready_producer(db)
    user.email_verified = False
    db.commit()
    res = client.post("/producers/me/submit-for-review", headers=auth_header(user))
    assert res.status_code == 422, res.text
    assert res.json()["detail"]["params"]["missing"] == [MISSING_EMAIL_VERIFIED]
    db.refresh(producer)
    assert producer.status == "draft"


def test_submit_passes_once_the_email_is_confirmed(client, db):
    producer, user = make_submit_ready_producer(db)
    res = client.post("/producers/me/submit-for-review", headers=auth_header(user))
    assert res.status_code == 200, res.text


def test_producers_me_exposes_the_owner_email_flag(client, db):
    """The client gate mirror reads this; it must track the same fact."""
    _producer, user = make_submit_ready_producer(db)
    assert client.get("/producers/me", headers=auth_header(user)).json()["owner_email_verified"] is True
    user.email_verified = False
    db.commit()
    assert client.get("/producers/me", headers=auth_header(user)).json()["owner_email_verified"] is False
