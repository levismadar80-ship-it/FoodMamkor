"""MEH-3813 — a Google account whose email Google has not verified cannot sign
in, register, accept an owner invite or confirm an account deletion.

The check lives in ONE place, `verify_google_token`
(backend/app/services/oauth_verifiers.py), so every consumer gets it. Before
this card only `/auth/google/code` (MEH-3690) and the owner invite checked
`email_verified`; a token sent straight to `/auth/google` skipped it, and the
route then matched an existing account by that unproven email.

What is real here: every route and `verify_google_token`. Only Google is
faked — google-auth's `verify_oauth2_token` (the signature/aud check) returns
the claims each test chooses, so the refusal runs through our own code.
"""

from __future__ import annotations

import time

import pytest

from app.config import settings
from app.models.models import User
from app.services import oauth_verifiers, owner_invite_google
from tests.conftest import auth_header, make_user

CLIENT_ID = "ours.apps.googleusercontent.com"
SUB = "google-sub-3813"
EMAIL = "google-3813@example.com"


def _claims(**over):
    base = {
        "sub": SUB,
        "email": EMAIL,
        "email_verified": True,
        "name": "Google 3813",
        "aud": CLIENT_ID,
        "iat": int(time.time()) - 5,
    }
    return base | over


@pytest.fixture
def google(monkeypatch):
    """Fake Google's signature check; `state["claims"]` is what it returns."""
    from google.oauth2 import id_token as google_id_token

    state = {"claims": _claims()}
    monkeypatch.setattr(settings, "google_client_id", CLIENT_ID)
    monkeypatch.setattr(
        google_id_token,
        "verify_oauth2_token",
        lambda token, request, audience: state["claims"],
    )
    return state


# Claim shapes that are NOT a verified email. Google sends a bool; a string
# "true", a missing claim or None must fail closed too.
UNVERIFIED = [
    pytest.param({"email_verified": False}, id="false"),
    pytest.param({"email_verified": None}, id="none"),
    pytest.param({"email_verified": "true"}, id="string-true"),
    pytest.param({"email_verified": "__missing__"}, id="missing"),
]


def _unverified(over):
    claims = _claims()
    if over.get("email_verified") == "__missing__":
        claims.pop("email_verified")
        return claims
    return claims | over


# --- the verifier itself --------------------------------------------------


@pytest.mark.parametrize("over", UNVERIFIED)
def test_verifier_refuses_an_unverified_email(google, over):
    google["claims"] = _unverified(over)
    assert oauth_verifiers.verify_google_token("tok") is None


def test_verifier_passes_a_verified_email_through(google):
    assert oauth_verifiers.verify_google_token("tok") == google["claims"]


# --- 1. POST /auth/google ---------------------------------------------------


@pytest.mark.parametrize("over", UNVERIFIED)
def test_auth_google_refuses_unverified_and_creates_nobody(client, db, google, over):
    google["claims"] = _unverified(over)
    r = client.post("/auth/google", json={"id_token": "tok"})
    assert r.status_code == 401, r.text
    assert r.json()["detail"] == "אסימון Google לא תקין"
    assert db.query(User).filter(User.email == EMAIL).first() is None


def test_auth_google_does_not_match_an_existing_account_by_unproven_email(
    client, db, google
):
    """The takeover shape: an existing account linked to this Google sub
    (or found by email) must not be signed into by an unverified token."""
    user = make_user(db, email=EMAIL)
    user.google_id = SUB  # type: ignore[assignment]
    db.commit()
    google["claims"] = _claims(email_verified=False)
    r = client.post("/auth/google", json={"id_token": "tok"})
    assert r.status_code == 401, r.text
    assert "access_token" not in r.json()


def test_auth_google_signs_in_a_verified_account_as_today(client, db, google):
    r = client.post("/auth/google", json={"id_token": "tok"})
    assert r.status_code == 200, r.text
    assert db.query(User).filter(User.email == EMAIL).one().google_id == SUB


# --- 2. POST /auth/register/producer/oauth ---------------------------------


def test_producer_oauth_refuses_unverified(client, db, google):
    google["claims"] = _claims(email_verified=False)
    r = client.post(
        "/auth/register/producer/oauth",
        json={"provider": "google", "id_token": "tok"},
    )
    assert r.status_code == 401, r.text
    assert r.json()["detail"] == "אסימון Google לא תקין"
    assert db.query(User).filter(User.email == EMAIL).first() is None


def test_producer_oauth_accepts_verified_as_today(client, db, google):
    r = client.post(
        "/auth/register/producer/oauth",
        json={"provider": "google", "id_token": "tok"},
    )
    assert r.status_code == 200, r.text


# --- 3. owner invite: a fresh Google sign-in --------------------------------


def _linked_user(db):
    user = make_user(db, email=EMAIL)
    user.google_id = SUB  # type: ignore[assignment]
    db.commit()
    return user


def test_owner_invite_refuses_unverified(db, google):
    from datetime import datetime, timezone

    user = _linked_user(db)
    google["claims"] = _claims(email_verified=False)
    now = datetime.now(timezone.utc)
    assert owner_invite_google.fresh_google_signin_matches("tok", user, now) is False


def test_owner_invite_accepts_verified(db, google):
    from datetime import datetime, timezone

    user = _linked_user(db)
    now = datetime.now(timezone.utc)
    assert owner_invite_google.fresh_google_signin_matches("tok", user, now) is True


# --- 4. POST /auth/me/delete (re-confirm with Google) ----------------------


def _oauth_only_user(db):
    user = _linked_user(db)
    user.password_hash = None  # type: ignore[assignment]
    db.commit()
    db.refresh(user)
    return user


def _gone(db, user_id) -> bool:
    db.expire_all()
    return db.query(User).filter(User.id == user_id).first() is None


def test_account_delete_refuses_unverified(client, db, google):
    user = _oauth_only_user(db)
    google["claims"] = _claims(email_verified=False)
    r = client.post(
        "/auth/me/delete", json={"id_token": "tok"}, headers=auth_header(user)
    )
    assert r.status_code == 403, r.text
    assert not _gone(db, user.id)


def test_account_delete_accepts_verified(client, db, google):
    user = _oauth_only_user(db)
    r = client.post(
        "/auth/me/delete", json={"id_token": "tok"}, headers=auth_header(user)
    )
    assert r.status_code == 200, r.text
    assert _gone(db, user.id)
