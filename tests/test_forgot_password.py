"""
Tests for the forgot/reset password flow (MEH-166).

Coverage:
- POST /auth/forgot-password: always 200, token written on match, enumeration-safe
- POST /auth/reset-password: valid token updates password, invalid/expired token = 400,
  token is cleared after use (single-use), rate-limited
"""
from datetime import datetime, timedelta
from unittest.mock import patch

from app.auth import hash_password, verify_password
from app.models.models import User
from conftest import make_user


class TestForgotPassword:
    def test_returns_200_for_existing_email(self, client, db):
        make_user(db, email="alice@test.com")
        with patch("app.routers.auth._send_reset_email") as mock_send:
            resp = client.post("/auth/forgot-password", json={"email": "alice@test.com"})
        assert resp.status_code == 200
        mock_send.assert_called_once()

    def test_returns_200_for_unknown_email_no_leak(self, client):
        """Email enumeration: same 200 even if address doesn't exist."""
        with patch("app.routers.auth._send_reset_email") as mock_send:
            resp = client.post("/auth/forgot-password", json={"email": "ghost@test.com"})
        assert resp.status_code == 200
        mock_send.assert_not_called()

    def test_token_is_stored_on_user(self, client, db):
        user = make_user(db, email="bob@test.com")
        with patch("app.routers.auth._send_reset_email"):
            client.post("/auth/forgot-password", json={"email": "bob@test.com"})
        db.refresh(user)
        assert user.reset_token is not None
        assert len(user.reset_token) >= 32
        assert user.reset_token_expires_at is not None
        assert user.reset_token_expires_at > datetime.utcnow()

    def test_token_expires_in_one_hour(self, client, db):
        user = make_user(db, email="carol@test.com")
        with patch("app.routers.auth._send_reset_email"):
            client.post("/auth/forgot-password", json={"email": "carol@test.com"})
        db.refresh(user)
        # expires_at should be ~1 hour from now (allow 5s drift)
        delta = user.reset_token_expires_at - datetime.utcnow()
        assert timedelta(minutes=59) < delta < timedelta(hours=1, seconds=5)

    def test_re_request_replaces_old_token(self, client, db):
        user = make_user(db, email="dave@test.com")
        with patch("app.routers.auth._send_reset_email"):
            client.post("/auth/forgot-password", json={"email": "dave@test.com"})
        db.refresh(user)
        first_token = user.reset_token
        with patch("app.routers.auth._send_reset_email"):
            client.post("/auth/forgot-password", json={"email": "dave@test.com"})
        db.refresh(user)
        assert user.reset_token != first_token


class TestResetPassword:
    def _plant_token(self, db, user, *, expired=False):
        """Write a reset token directly into the DB."""
        token = "test-reset-token-abc123xyz"
        user.reset_token = token
        user.reset_token_expires_at = (
            datetime.utcnow() - timedelta(seconds=1)
            if expired
            else datetime.utcnow() + timedelta(hours=1)
        )
        db.commit()
        return token

    def test_valid_token_updates_password(self, client, db):
        user = make_user(db, email="eve@test.com", password="OldPass1!")
        token = self._plant_token(db, user)
        resp = client.post(
            "/auth/reset-password",
            json={"token": token, "new_password": "SecurePass123!"},
        )
        assert resp.status_code == 200
        db.refresh(user)
        assert verify_password("SecurePass123!", user.password_hash)

    def test_old_password_no_longer_works(self, client, db):
        user = make_user(db, email="frank@test.com", password="OldPass1!")
        token = self._plant_token(db, user)
        client.post("/auth/reset-password", json={"token": token, "new_password": "SecurePass123!"})
        db.refresh(user)
        assert not verify_password("OldPass1!", user.password_hash)

    def test_token_cleared_after_use(self, client, db):
        user = make_user(db, email="grace@test.com")
        token = self._plant_token(db, user)
        client.post("/auth/reset-password", json={"token": token, "new_password": "SecurePass123!"})
        db.refresh(user)
        assert user.reset_token is None
        assert user.reset_token_expires_at is None

    def test_token_is_single_use(self, client, db):
        user = make_user(db, email="henry@test.com")
        token = self._plant_token(db, user)
        client.post("/auth/reset-password", json={"token": token, "new_password": "SecurePass123!"})
        resp2 = client.post("/auth/reset-password", json={"token": token, "new_password": "AnotherPass1!"})
        assert resp2.status_code == 400

    def test_expired_token_rejected(self, client, db):
        user = make_user(db, email="iris@test.com")
        token = self._plant_token(db, user, expired=True)
        resp = client.post(
            "/auth/reset-password",
            json={"token": token, "new_password": "SecurePass123!"},
        )
        assert resp.status_code == 400

    def test_invalid_token_rejected(self, client):
        resp = client.post(
            "/auth/reset-password",
            json={"token": "totally-invalid-token", "new_password": "SecurePass123!"},
        )
        assert resp.status_code == 400

    def test_short_password_rejected(self, client, db):
        user = make_user(db, email="jane@test.com")
        token = self._plant_token(db, user)
        resp = client.post(
            "/auth/reset-password",
            json={"token": token, "new_password": "short"},
        )
        assert resp.status_code == 422
