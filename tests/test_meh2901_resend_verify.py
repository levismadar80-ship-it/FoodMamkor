"""MEH-2901 — POST /auth/resend-verify had no test at all.

The handler (backend/app/routers/auth.py, ``resend_verify``) is:

- authenticated (``Depends(get_current_user)``) — it takes no email from the
  caller; the address is always the logged-in user's own row;
- rate-limited ``3/hour`` per client IP (``@limiter.limit("3/hour")``);
- for an unverified user: rotates ``email_verify_token`` (24 h expiry) and
  sends ONE verify email to ``user.email`` carrying that token;
- for an already-verified user: answers 200 "האימייל כבר מאומת" and sends
  nothing.

The send layer is recorded by replacing the router's alias
``app.routers.auth._send_verify_email`` (the same seam
tests/test_verify_email.py and tests/test_api.py use), so nothing is ever
sent for real. The slowapi counters are reset before each test by the
autouse ``_reset_rate_limiter`` fixture in tests/conftest.py.

Account-existence: the route does not accept an email without auth. The
card's enumeration case is therefore pinned as "an unauthenticated caller
who supplies an email gets the identical 401 for a known and an unknown
address, and no mail is sent" — plus the authenticated twin: an email in
the body cannot redirect the verify mail to someone else's address.
"""
from datetime import timedelta

import pytest

from app.models.models import User
from app.utils.clock import utc_now
from conftest import auth_header, make_user

URL = "/auth/resend-verify"
SENT_DETAIL = "אימייל אימות נשלח"
ALREADY_VERIFIED_DETAIL = "האימייל כבר מאומת"


@pytest.fixture
def sent(monkeypatch):
    """Record every verify-email send instead of sending it."""
    calls: list[tuple[str, str, str]] = []

    def _record(email, name, token):
        calls.append((email, name, token))
        return True

    monkeypatch.setattr("app.routers.auth._send_verify_email", _record)
    return calls


def test_unverified_user_gets_200_and_exactly_one_verify_email_to_own_address(
    client, db, sent
):
    user = make_user(
        db, email="unverified2901@test.com", name="דנה", email_verified=False
    )
    before = utc_now()

    resp = client.post(URL, headers=auth_header(user))

    assert resp.status_code == 200
    assert resp.json() == {"detail": SENT_DETAIL}
    assert len(sent) == 1, f"expected exactly one verify email, got {sent!r}"
    to, name, token = sent[0]
    assert to == "unverified2901@test.com"
    assert name == "דנה"

    db.expire_all()
    row = db.get(User, user.id)
    # The mailed token is the one the DB will accept, and it lives ~24 h.
    assert row.email_verify_token == token
    assert len(token) >= 32
    assert (
        before + timedelta(hours=23)
        < row.email_verify_expires
        <= utc_now() + timedelta(hours=24)
    )
    assert row.email_verified is False


def test_already_verified_user_gets_already_verified_and_no_email(
    client, db, sent
):
    user = make_user(db, email="verified2901@test.com", email_verified=True)

    resp = client.post(URL, headers=auth_header(user))

    assert resp.status_code == 200
    assert resp.json() == {"detail": ALREADY_VERIFIED_DETAIL}
    assert sent == []
    db.expire_all()
    row = db.get(User, user.id)
    assert row.email_verify_token is None, "verified user must not get a fresh token"


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Basic dXNlcjpwYXNz"}],
    ids=["no-authorization-header", "non-bearer-scheme"],
)
def test_no_bearer_token_is_401_and_sends_nothing(client, db, sent, headers):
    make_user(db, email="someone2901@test.com", email_verified=False)

    resp = client.post(URL, headers=headers)

    assert resp.status_code == 401
    assert sent == []


def test_unauthenticated_email_known_and_unknown_get_identical_401(
    client, db, sent
):
    """No account-existence signal: the route answers a supplied email the
    same way whether or not an account holds it — and never mails it."""
    make_user(db, email="known2901@test.com", email_verified=False)

    known = client.post(URL, json={"email": "known2901@test.com"})
    unknown = client.post(URL, json={"email": "nobody2901@test.com"})

    assert known.status_code == 401
    assert (unknown.status_code, unknown.content) == (
        known.status_code,
        known.content,
    )
    assert sent == []


def test_body_email_cannot_redirect_verify_mail_to_another_address(
    client, db, sent
):
    """An authenticated caller naming someone else's address still gets the
    mail sent to her OWN address — the body is not an input."""
    me = make_user(db, email="me2901@test.com", email_verified=False)
    other = make_user(db, email="other2901@test.com", email_verified=False)

    resp = client.post(
        URL, headers=auth_header(me), json={"email": "other2901@test.com"}
    )

    assert resp.status_code == 200
    assert [to for to, _, _ in sent] == ["me2901@test.com"]
    db.expire_all()
    assert db.get(User, other.id).email_verify_token is None


def test_fourth_request_in_an_hour_is_429_and_sends_no_email(client, db, sent):
    user = make_user(db, email="limited2901@test.com", email_verified=False)
    headers = auth_header(user)

    statuses = [client.post(URL, headers=headers).status_code for _ in range(4)]

    assert statuses == [200, 200, 200, 429]
    assert len(sent) == 3, "the rate-limited request must not send mail"
