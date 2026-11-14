"""MEH-3248 (B7 + D15) — the self-service account deletion re-checks who asks.

Before: a bodyless ``DELETE /auth/me`` deleted any account whose session it
carried, admins and the protected super-admin included. Now:
  * ``POST /auth/me/delete`` refuses admins (one rule with the admin door),
  * an account with a password must send it,
  * an account without one must send a fresh id_token from its own provider,
  * the old ``DELETE /auth/me`` is gone.
"""

from __future__ import annotations

import time

import pytest

from app.config import settings
from app.models.models import User
from app.services import account_guards, oauth_verifiers
from tests.conftest import auth_header, make_user

# guard-ok: make_user's default test password, not a credential
PASSWORD = "Zx7Yp9Mq2Lr4"
URL = "/auth/me/delete"


def _gone(db, user_id) -> bool:
    db.expire_all()
    return db.query(User).filter(User.id == user_id).first() is None


def _oauth_user(db, google_id: str = "g-sub-123") -> User:
    user = make_user(db)
    user.password_hash = None  # type: ignore[assignment]
    user.google_id = google_id  # type: ignore[assignment]
    db.commit()
    db.refresh(user)
    return user


# --- B7: admins never delete themselves here ---------------------------------


def test_admin_cannot_delete_own_account_even_with_right_password(client, db):
    admin = make_user(db, role="admin")
    r = client.post(URL, json={"password": PASSWORD}, headers=auth_header(admin))
    assert r.status_code == 403
    assert r.json()["detail"] == account_guards.SELF_DOOR_ADMIN
    assert not _gone(db, admin.id)


def test_admin_refusal_comes_before_the_password_check(client, db):
    """She must not type a password only to learn admins can't delete."""
    admin = make_user(db, role="admin")
    r = client.post(
        URL, json={"password": "wrong-password-1"}, headers=auth_header(admin)
    )
    assert r.status_code == 403
    assert r.json()["detail"] == account_guards.SELF_DOOR_ADMIN


def test_super_admin_cannot_delete_own_account(client, db, monkeypatch):
    owner = make_user(db, email="owner@example.com", role="consumer")
    monkeypatch.setattr(settings, "super_admin_email", "owner@example.com")
    r = client.post(URL, json={"password": PASSWORD}, headers=auth_header(owner))
    assert r.status_code == 403
    assert r.json()["detail"] == account_guards.SELF_DOOR_SUPER_ADMIN
    assert not _gone(db, owner.id)


# --- D15: a session alone is not enough --------------------------------------


@pytest.mark.parametrize(
    "body", [{}, {"password": ""}, {"password": "wrong-password-1"}]
)
def test_password_account_needs_its_password(client, db, body):
    user = make_user(db)
    r = client.post(URL, json=body, headers=auth_header(user))
    assert r.status_code == 403
    assert r.json()["detail"] == "הסיסמה הנוכחית שגויה"
    assert not _gone(db, user.id)


def test_password_account_cannot_use_a_provider_token_instead(client, db, monkeypatch):
    user = make_user(db)
    user.google_id = "g-linked"  # type: ignore[assignment]
    db.commit()
    monkeypatch.setattr(
        oauth_verifiers,
        "verify_google_token",
        lambda _t: {"sub": "g-linked", "iat": int(time.time())},
    )
    r = client.post(URL, json={"id_token": "tok"}, headers=auth_header(user))
    assert r.status_code == 403
    assert not _gone(db, user.id)


def test_password_account_deletes_with_right_password(client, db):
    user = make_user(db)
    r = client.post(URL, json={"password": PASSWORD}, headers=auth_header(user))
    assert r.status_code == 200
    assert _gone(db, user.id)


def test_oauth_account_without_token_is_told_to_sign_in_again(client, db):
    user = _oauth_user(db)
    r = client.post(URL, json={}, headers=auth_header(user))
    assert r.status_code == 403
    assert r.json()["detail"] == "כדי לאשר את המחיקה, התחברי שוב עם Google."
    assert not _gone(db, user.id)


@pytest.mark.parametrize(
    "claims",
    [
        None,  # token failed verification
        {"sub": "someone-else", "iat": "now"},  # valid token, other account
        {"sub": "g-sub-123", "iat": "old"},  # this account, but 10 minutes old
        {"sub": "g-sub-123"},  # this account, no iat at all
        {"iat": "now"},  # fresh, but no sub at all
    ],
    ids=["invalid-token", "other-account-sub", "stale-iat", "no-iat", "no-sub"],
)
def test_oauth_account_rejects_bad_tokens(client, db, monkeypatch, claims):
    user = _oauth_user(db)
    if claims is not None and "iat" in claims:
        now = int(time.time())
        claims = {**claims, "iat": now if claims["iat"] == "now" else now - 600}
    monkeypatch.setattr(oauth_verifiers, "verify_google_token", lambda _t: claims)
    r = client.post(URL, json={"id_token": "tok"}, headers=auth_header(user))
    assert r.status_code == 403
    assert not _gone(db, user.id)


def test_oauth_account_deletes_with_fresh_token_for_itself(client, db, monkeypatch):
    user = _oauth_user(db)
    monkeypatch.setattr(
        oauth_verifiers,
        "verify_google_token",
        lambda _t: {"sub": "g-sub-123", "iat": int(time.time())},
    )
    r = client.post(URL, json={"id_token": "tok"}, headers=auth_header(user))
    assert r.status_code == 200
    assert _gone(db, user.id)


def test_apple_account_is_checked_against_apple(client, db, monkeypatch):
    user = make_user(db)
    user.password_hash = None  # type: ignore[assignment]
    user.apple_id = "a-sub-9"  # type: ignore[assignment]
    db.commit()
    monkeypatch.setattr(oauth_verifiers, "verify_google_token", lambda _t: None)
    monkeypatch.setattr(
        oauth_verifiers,
        "verify_apple_token",
        lambda _t: {"sub": "a-sub-9", "iat": int(time.time())},
    )
    r = client.post(URL, json={"id_token": "tok"}, headers=auth_header(user))
    assert r.status_code == 200
    assert _gone(db, user.id)


def test_account_linked_to_both_can_confirm_with_apple(client, db, monkeypatch):
    """Review finding on PR #4603: Google was the only accepted provider when
    both were linked, so an Apple-first account could not be deleted."""
    user = _oauth_user(db)
    user.apple_id = "a-sub-both"  # type: ignore[assignment]
    db.commit()
    monkeypatch.setattr(oauth_verifiers, "verify_google_token", lambda _t: None)
    monkeypatch.setattr(
        oauth_verifiers,
        "verify_apple_token",
        lambda _t: {"sub": "a-sub-both", "iat": int(time.time())},
    )
    r = client.post(URL, json={"id_token": "tok"}, headers=auth_header(user))
    assert r.status_code == 200
    assert _gone(db, user.id)


# --- the old door is closed, the settings page knows which button to show ---


def test_old_bodyless_delete_route_is_gone(client, db):
    user = make_user(db)
    r = client.delete("/auth/me", headers=auth_header(user))
    assert r.status_code == 405
    assert not _gone(db, user.id)


def test_auth_me_reports_the_oauth_provider(client, db):
    assert (
        client.get("/auth/me", headers=auth_header(make_user(db))).json()[
            "oauth_provider"
        ]
        is None
    )
    oauth = _oauth_user(db)
    assert (
        client.get("/auth/me", headers=auth_header(oauth)).json()["oauth_provider"]
        == "google"
    )


def test_anonymous_gets_401(client):
    assert client.post(URL, json={"password": PASSWORD}).status_code == 401


def test_auth_me_flags_only_the_super_admin(client, db, monkeypatch):
    monkeypatch.setattr(settings, "super_admin_email", "owner@example.com")
    owner = make_user(db, email="owner@example.com", role="admin")
    other = make_user(db, role="admin")
    assert (
        client.get("/auth/me", headers=auth_header(owner)).json()["is_super_admin"]
        is True
    )
    assert (
        client.get("/auth/me", headers=auth_header(other)).json()["is_super_admin"]
        is False
    )
