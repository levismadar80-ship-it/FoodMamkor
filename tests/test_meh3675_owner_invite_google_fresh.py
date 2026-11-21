"""MEH-3675 — a fresh Google sign-in replaces the email code on
`/auth/owner-invite/accept-existing` (Sapir 22/11: «כן, רק בכניסה טרייה»).

Google's verifier is replaced by a stand-in that returns claims we choose, so
each test names the one claim it breaks. The real verifier is exercised once,
unconfigured, to show an unconfigured server never takes the Google path.
"""

import time
from unittest import mock

from conftest import auth_header, make_user
from app.models import User
from app.services import owner_invite_google as oig
from test_meh3256_owner_invite_existing import _arm, _invited
from test_producer_owner_invite import _row

ACCEPT_URL = "/auth/owner-invite/accept-existing"
GOOGLE_SUB = "google-sub-3675"


def _linked(db, user, sub=GOOGLE_SUB):
    """`make_user` takes no google_id; link it the way `/auth/google` does."""
    user.google_id = sub
    db.commit()
    return user


def _google_user(db):
    return _linked(db, make_user(db, role="consumer", email="google-3675@example.com"))


def _claims(**over):
    base = {
        "sub": GOOGLE_SUB,
        "email": "google-3675@example.com",
        "email_verified": True,
        "iat": int(time.time()) - 10,
    }
    return base | over


def _accept(client, token, user, **over):
    body = {
        "token": token,
        "google_id_token": "stand-in-google-token",
        "terms_accepted": True,
        "declaration_accepted": True,
    }
    return client.post(ACCEPT_URL, json=body | over, headers=auth_header(user))


def _with_claims(claims):
    return mock.patch.object(oig, "verify_google_token", return_value=claims)


def _not_accepted(db, producer, user):
    db.expire_all()
    assert _row(db, producer).owner_invite_accepted_at is None
    assert _row(db, producer).owner_invite_token_hash is not None
    assert db.get(User, user.id).role == "consumer"


def test_fresh_google_signin_accepts_without_a_code(client, db):
    producer, token = _invited(client, db)
    user = _google_user(db)
    with _with_claims(_claims()) as verifier:
        r = _accept(client, token, user)
    assert r.status_code == 200, r.text
    verifier.assert_called_once_with("stand-in-google-token")
    db.expire_all()
    u = db.get(User, user.id)
    assert (u.role, u.producer_id) == ("producer", producer.id)
    assert _row(db, producer).owner_invite_accepted_at is not None


def test_another_google_identity_is_refused_and_nothing_is_spent(client, db):
    producer, token = _invited(client, db)
    user = _google_user(db)
    with _with_claims(_claims(sub="someone-else")):
        r = _accept(client, token, user)
    assert r.status_code == 422
    assert "קוד" in r.json()["detail"]
    _not_accepted(db, producer, user)


def test_a_signin_older_than_the_window_is_refused(client, db):
    producer, token = _invited(client, db)
    user = _google_user(db)
    stale = int(time.time() - oig.GOOGLE_FRESH_SIGNIN_MAX_AGE.total_seconds() - 60)
    with _with_claims(_claims(iat=stale)):
        r = _accept(client, token, user)
    assert r.status_code == 422
    _not_accepted(db, producer, user)


def test_a_signin_just_inside_the_window_is_accepted(client, db):
    _, token = _invited(client, db)
    user = _google_user(db)
    edge = int(time.time() - oig.GOOGLE_FRESH_SIGNIN_MAX_AGE.total_seconds() + 30)
    with _with_claims(_claims(iat=edge)):
        r = _accept(client, token, user)
    assert r.status_code == 200, r.text


def test_unverified_google_email_is_refused(client, db):
    producer, token = _invited(client, db)
    user = _google_user(db)
    for flag in (False, None, "true"):
        with _with_claims(_claims(email_verified=flag)):
            r = _accept(client, token, user)
        assert r.status_code == 422, flag
    _not_accepted(db, producer, user)


def test_missing_iat_is_refused(client, db):
    producer, token = _invited(client, db)
    user = _google_user(db)
    claims = _claims()
    del claims["iat"]
    with _with_claims(claims):
        r = _accept(client, token, user)
    assert r.status_code == 422
    _not_accepted(db, producer, user)


def test_an_account_never_linked_to_google_keeps_the_code(client, db):
    """Same email, but no `google_id` on the account: the code stays."""
    producer, token = _invited(client, db)
    user = make_user(db, role="consumer", email="google-3675@example.com")
    with _with_claims(_claims()):
        r = _accept(client, token, user)
    assert r.status_code == 422
    _not_accepted(db, producer, user)


def test_a_rejected_google_token_does_not_burn_a_live_code(client, db):
    producer, token = _invited(client, db)
    user = _google_user(db)
    code = _arm(client, token, user)[2]
    with _with_claims(None):
        assert _accept(client, token, user).status_code == 422
    r = _accept(client, token, user, google_id_token=None, code=code)
    assert r.status_code == 200, r.text


def test_neither_a_code_nor_a_token_is_refused(client, db):
    producer, token = _invited(client, db)
    user = _google_user(db)
    r = _accept(client, token, user, google_id_token=None)
    assert r.status_code == 422
    assert "קוד" in r.json()["detail"]
    _not_accepted(db, producer, user)


def test_the_code_path_is_unchanged(client, db):
    _, token = _invited(client, db)
    user = _google_user(db)
    code = _arm(client, token, user)[2]
    r = _accept(client, token, user, google_id_token=None, code=code)
    assert r.status_code == 200, r.text


def test_an_unconfigured_server_never_takes_the_google_path(client, db, monkeypatch):
    """The REAL verifier, with no client id: it returns None, so 422."""
    from app.config import settings

    monkeypatch.setattr(settings, "google_client_id", "")
    producer, token = _invited(client, db)
    user = _google_user(db)
    r = _accept(client, token, user)
    assert r.status_code == 422
    _not_accepted(db, producer, user)


def test_an_admin_with_a_fresh_google_token_is_still_refused(client, db):
    _, token = _invited(client, db)
    admin = _linked(db, make_user(db, role="admin", email="admin-3675@example.com"))
    with _with_claims(_claims()) as verifier:
        r = _accept(client, token, admin)
    assert r.status_code == 403
    verifier.assert_not_called()
