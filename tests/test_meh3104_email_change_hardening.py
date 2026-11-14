"""MEH-3104: three holes around changing the account email.

1. PATCH /users/me changed the email without the current password, so a
   stolen session could move the account to an attacker's address, ask for a
   password reset there, and take the account. A pending reset token for the
   old address also survived the change.
2. The Google / Apple email fallback refused only when the matched account had
   NO provider id (`if not user.google_id`); an account linked to a DIFFERENT
   Google / Apple identity passed, was marked verified, and was signed in.
3. The protected owner account (SUPER_ADMIN_EMAIL, exact match) lost its
   protection the moment its email changed.

Behaviour pinned, not implementation.
"""
from datetime import timedelta
from unittest.mock import patch

import pytest

from app.config import settings
from app.models.models import User
from app.routers import admin_extra
from app.routers import auth as auth_router
from app.utils.clock import utc_now
from conftest import auth_header, make_user

SEND = "app.routers.users_me.send_verify_email"
PASSWORD = "Zx7Yp9Mq2Lr4"  # guard-ok: test fixture, make_user default password, not a credential


def _patch(client, user, body):
    with patch(SEND) as send:
        res = client.patch("/users/me", json=body, headers=auth_header(user))
    return res, send


class TestEmailChangeNeedsThePassword:
    def test_no_password_changes_nothing(self, client, db):
        user = make_user(db, email="pw1@example.com", email_verified=True)
        res, send = _patch(client, user, {"email": "attacker@example.com"})
        assert res.status_code == 403, res.text
        db.refresh(user)
        assert user.email == "pw1@example.com"
        assert user.email_verified is True
        assert send.call_count == 0

    def test_wrong_password_changes_nothing(self, client, db):
        user = make_user(db, email="pw2@example.com", email_verified=True)
        res, _ = _patch(
            client, user, {"email": "attacker2@example.com", "current_password": "wrong-one-123"}
        )
        assert res.status_code == 403, res.text
        db.refresh(user)
        assert user.email == "pw2@example.com"

    def test_right_password_changes_it_and_kills_a_pending_reset(self, client, db):
        user = make_user(db, email="pw3@example.com", email_verified=True)
        user.reset_token = "example-pending-reset-token"
        user.reset_token_expires_at = utc_now() + timedelta(hours=1)
        db.commit()
        res, send = _patch(
            client, user, {"email": "pw3-new@example.com", "current_password": PASSWORD}
        )
        assert res.status_code == 200, res.text
        db.refresh(user)
        assert user.email == "pw3-new@example.com"
        assert user.reset_token is None
        assert user.reset_token_expires_at is None
        assert send.call_count == 1

    def test_same_address_needs_no_password(self, client, db):
        user = make_user(db, email="pw4@example.com")
        res, _ = _patch(client, user, {"email": "pw4@example.com", "name": "שם חדש"})
        assert res.status_code == 200, res.text

    def test_name_only_needs_no_password(self, client, db):
        user = make_user(db, email="pw5@example.com")
        res, _ = _patch(client, user, {"name": "שם אחר"})
        assert res.status_code == 200, res.text


class TestTheOwnerAccountKeepsItsAddress:
    def test_super_admin_cannot_change_email(self, client, db, monkeypatch):
        monkeypatch.setattr(admin_extra.settings, "super_admin_email", "owner@example.com")
        owner = make_user(db, email="owner@example.com", role="admin", email_verified=True)
        res, send = _patch(
            client, owner, {"email": "elsewhere@example.com", "current_password": PASSWORD}
        )
        assert res.status_code == 400, res.text
        db.refresh(owner)
        assert owner.email == "owner@example.com"
        assert send.call_count == 0


EMAIL = "linked@example.com"


@pytest.fixture
def oauth_ok(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "dummy-google-id")
    monkeypatch.setattr(
        auth_router,
        "_verify_google_token",
        lambda token: {"sub": "g-attacker", "email": EMAIL, "name": "x"},
    )
    monkeypatch.setattr(auth_router, "_upload_google_avatar_or_none", lambda url: None)
    monkeypatch.setattr(settings, "apple_client_id", "dummy-apple-id")
    monkeypatch.setattr(
        auth_router, "_verify_apple_token", lambda token: {"sub": "a-attacker", "email": EMAIL}
    )


class TestProviderIdMustMatch:
    def test_google_linked_to_another_identity_is_refused(self, client, db, oauth_ok):
        victim = make_user(db, email=EMAIL)
        victim.google_id = "g-victim"
        db.commit()
        res = client.post("/auth/google", json={"id_token": "x"})
        assert res.status_code == 409, res.text
        assert "access_token" not in res.json()
        db.refresh(victim)
        assert victim.google_id == "g-victim"

    def test_apple_linked_to_another_identity_is_refused(self, client, db, oauth_ok):
        victim = make_user(db, email=EMAIL)
        victim.apple_id = "a-victim"
        db.commit()
        res = client.post("/auth/apple", json={"id_token": "x"})
        assert res.status_code == 409, res.text
        assert "access_token" not in res.json()

    def test_the_same_google_identity_still_signs_in(self, client, db, oauth_ok):
        user = make_user(db, email=EMAIL)
        user.google_id = "g-attacker"  # the identity the token carries
        db.commit()
        res = client.post("/auth/google", json={"id_token": "x"})
        assert res.status_code == 200, res.text
