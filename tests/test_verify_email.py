"""
Tests for the email-verification flow (MEH-198, diagnostics added in MEH-320).

Coverage:
- POST /auth/register: stores email_verify_token + expiry, fires _send_verify_email
- GET /auth/verify-email: valid token = 200 + clears token, expired = 410,
  invalid = 404, single-use (second call = 404)

Modeled after tests/test_forgot_password.py — reset-password got the same
404/410 split + structured logging treatment in MEH-304.
"""
from datetime import timedelta
from unittest.mock import patch

from app.models.models import User
from conftest import make_user
from app.utils.clock import utc_now


class TestVerifyEmail:
    def _plant_token(self, db, user, *, expired=False):
        """Write an email-verify token directly into the DB."""
        token = "test-verify-token-abc123xyz"
        user.email_verify_token = token
        user.email_verify_expires = (
            utc_now() - timedelta(seconds=1)
            if expired
            else utc_now() + timedelta(hours=24)
        )
        user.email_verified = False
        db.commit()
        return token

    def test_valid_token_verifies_email(self, client, db):
        user = make_user(db, email="alice@test.com", email_verified=False)
        token = self._plant_token(db, user)
        resp = client.get("/auth/verify-email", params={"token": token})
        assert resp.status_code == 200
        db.refresh(user)
        assert user.email_verified is True
        assert user.email_verify_token is None
        assert user.email_verify_expires is None

    def test_token_is_single_use(self, client, db):
        user = make_user(db, email="bob@test.com", email_verified=False)
        token = self._plant_token(db, user)
        client.get("/auth/verify-email", params={"token": token})
        resp2 = client.get("/auth/verify-email", params={"token": token})
        assert resp2.status_code == 404

    def test_expired_token_rejected(self, client, db):
        user = make_user(db, email="carol@test.com", email_verified=False)
        token = self._plant_token(db, user, expired=True)
        resp = client.get("/auth/verify-email", params={"token": token})
        assert resp.status_code == 410
        # Expired-but-known token should NOT flip email_verified.
        db.refresh(user)
        assert user.email_verified is False

    def test_invalid_token_rejected(self, client):
        resp = client.get(
            "/auth/verify-email", params={"token": "totally-invalid-token"}
        )
        assert resp.status_code == 404


class TestRegisterFiresVerifyEmail:
    def test_register_stores_token_and_sends_email(self, client, db):
        with patch("app.routers.auth._send_verify_email") as mock_send, patch(
            "app.routers.auth._send_welcome_email"
        ):
            resp = client.post(
                "/auth/register",
                json={"terms_accepted": True,
                    "email": "dave@test.com",
                    "name": "Dave",
                    "password": "SecurePass123!",
                },
            )
        assert resp.status_code == 200
        user = db.query(User).filter(User.email == "dave@test.com").first()
        assert user is not None
        assert user.email_verified is False
        assert user.email_verify_token is not None
        assert len(user.email_verify_token) >= 32
        assert user.email_verify_expires is not None
        assert user.email_verify_expires > utc_now()
        # Background task should have been called with the SAME token
        # that's now stored on the user — catches any "wrong token sent
        # in email" regression at the source.
        mock_send.assert_called_once()
        sent_email, sent_name, sent_token = mock_send.call_args.args
        assert sent_email == "dave@test.com"
        assert sent_token == user.email_verify_token


class TestVerifyLinkSignsIn:
    """MEH-3087 — the email link proves mailbox ownership, so it signs in."""

    def _plant(self, db, user):
        user.email_verify_token = "meh3087-token-abcdefgh"
        user.email_verify_expires = utc_now() + timedelta(hours=24)
        user.email_verified = False
        db.commit()
        return user.email_verify_token

    def test_valid_link_returns_a_working_session(self, client, db):
        user = make_user(db, email="erin@test.com", email_verified=False)
        token = self._plant(db, user)
        resp = client.get("/auth/verify-email", params={"token": token})
        assert resp.status_code == 200
        body = resp.json()
        assert body["token_type"] == "bearer"
        set_cookie = resp.headers.get("set-cookie", "")
        assert "refresh_token=" in set_cookie
        assert "__Secure-Fgp=" in set_cookie
        # Behaviour, not shape: the token opens an authenticated route as her.
        fgp = resp.cookies.get("__Secure-Fgp")
        me = client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {body['access_token']}"},
            cookies={"__Secure-Fgp": fgp},
        )
        assert me.status_code == 200
        assert me.json()["email"] == "erin@test.com"
        assert me.json()["email_verified"] is True

    def test_blocked_user_is_verified_but_not_signed_in(self, client, db):
        user = make_user(db, email="frank@test.com", email_verified=False)
        user.is_blocked = True
        token = self._plant(db, user)
        resp = client.get("/auth/verify-email", params={"token": token})
        assert resp.status_code == 200
        assert "access_token" not in resp.json()
        assert "set-cookie" not in resp.headers
        db.refresh(user)
        assert user.email_verified is True

    def test_failed_links_issue_no_session(self, client, db):
        user = make_user(db, email="gina@test.com", email_verified=False)
        token = self._plant(db, user)
        user.email_verify_expires = utc_now() - timedelta(seconds=1)
        db.commit()
        for tok in (token, "no-such-token"):
            resp = client.get("/auth/verify-email", params={"token": tok})
            assert resp.status_code in (404, 410)
            assert "access_token" not in resp.json()
            assert "set-cookie" not in resp.headers

    def test_used_link_cannot_sign_in_again(self, client, db):
        user = make_user(db, email="hana@test.com", email_verified=False)
        token = self._plant(db, user)
        assert client.get("/auth/verify-email", params={"token": token}).status_code == 200
        again = client.get("/auth/verify-email", params={"token": token})
        assert again.status_code == 404
        assert "access_token" not in again.json()
