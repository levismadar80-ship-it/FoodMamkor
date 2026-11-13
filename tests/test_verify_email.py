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
from app.services.verify_session import SIGNUP_MARKER
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
    """MEH-3087 — the link signs in ONLY the browser that registered.

    The signup-marker cookie is what tells that browser apart. Every other
    holder of the link (another device, or someone whose email was registered
    by a stranger) gets the ack and logs in with a password, as before.
    """

    PAYLOAD = {
        "terms_accepted": True,
        "email": "erin@example.com",
        "name": "Erin",
        "password": "SecurePass123!",
    }

    def _register(self, client, db, **over):
        """Register for real; return (marker cookie, emailed token)."""
        with patch("app.routers.auth._send_verify_email"), patch(
            "app.routers.auth._send_welcome_email"
        ), patch("app.routers.auth._send_duplicate_attempt_email"):
            resp = client.post("/auth/register", json={**self.PAYLOAD, **over})
        assert resp.status_code == 200, resp.text
        marker = resp.cookies.get(SIGNUP_MARKER)
        client.cookies.clear()
        email = {**self.PAYLOAD, **over}["email"]
        user = db.query(User).filter(User.email == email).first()
        db.refresh(user)
        return marker, user.email_verify_token, user

    def _verify(self, client, token, cookies=None):
        client.cookies.clear()
        return client.get(
            "/auth/verify-email", params={"token": token}, cookies=cookies or {}
        )

    def test_same_browser_gets_a_working_session(self, client, db):
        marker, token, _ = self._register(client, db)
        resp = self._verify(client, token, {SIGNUP_MARKER: marker})
        assert resp.status_code == 200
        body = resp.json()
        assert body["token_type"] == "bearer"
        assert resp.headers["cache-control"] == "no-store"
        cookies = resp.headers.get_list("set-cookie")
        assert any(c.startswith("refresh_token=") for c in cookies)
        fgp = resp.cookies.get("__Secure-Fgp")
        # Behaviour, not shape: the token opens an authenticated route as her.
        client.cookies.clear()
        me = client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {body['access_token']}"},
            cookies={"__Secure-Fgp": fgp},
        )
        assert me.status_code == 200
        assert me.json()["email"] == "erin@example.com"
        assert me.json()["email_verified"] is True

    def test_another_browser_is_verified_but_not_signed_in(self, client, db):
        """The pre-registration attack: a stranger registered her email with
        his password. She opens the link — no marker in her browser."""
        _, token, user = self._register(client, db)
        resp = self._verify(client, token)
        assert resp.status_code == 200
        assert "access_token" not in resp.json()
        assert resp.headers.get_list("set-cookie") == []
        assert resp.headers["cache-control"] == "no-store"
        db.refresh(user)
        assert user.email_verified is True

    def test_a_marker_from_a_different_registration_does_not_sign_in(
        self, client, db
    ):
        other_marker, _, _ = self._register(client, db, email="mallory@example.com")
        _, token, _ = self._register(client, db)
        resp = self._verify(client, token, {SIGNUP_MARKER: other_marker})
        assert resp.status_code == 200
        assert "access_token" not in resp.json()
        assert resp.headers.get_list("set-cookie") == []

    def test_blocked_user_is_verified_but_not_signed_in(self, client, db):
        marker, token, user = self._register(client, db)
        user.is_blocked = True
        db.commit()
        resp = self._verify(client, token, {SIGNUP_MARKER: marker})
        assert resp.status_code == 200
        assert "access_token" not in resp.json()
        assert resp.headers.get_list("set-cookie") == []
        db.refresh(user)
        assert user.email_verified is True

    def test_a_browser_with_a_session_keeps_it(self, client, db):
        marker, token, _ = self._register(client, db)
        resp = self._verify(
            client, token, {SIGNUP_MARKER: marker, "refresh_token": "someone-else"}
        )
        assert resp.status_code == 200
        assert "access_token" not in resp.json()
        assert resp.headers.get_list("set-cookie") == []

    def test_expired_and_unknown_links_issue_no_session(self, client, db):
        marker, token, user = self._register(client, db)
        user.email_verify_expires = utc_now() - timedelta(seconds=1)
        db.commit()
        for tok, code in ((token, 410), ("no-such-token", 404)):
            resp = self._verify(client, tok, {SIGNUP_MARKER: marker})
            assert resp.status_code == code
            assert "access_token" not in resp.json()
            assert resp.headers.get_list("set-cookie") == []

    def test_used_link_cannot_sign_in_again(self, client, db):
        marker, token, _ = self._register(client, db)
        assert self._verify(client, token, {SIGNUP_MARKER: marker}).status_code == 200
        again = self._verify(client, token, {SIGNUP_MARKER: marker})
        assert again.status_code == 404
        assert "access_token" not in again.json()
        assert again.headers.get_list("set-cookie") == []

    def test_register_reply_carries_the_marker_and_no_session(self, client, db):
        with patch("app.routers.auth._send_verify_email"), patch(
            "app.routers.auth._send_welcome_email"
        ):
            resp = client.post("/auth/register", json=self.PAYLOAD)
        assert "access_token" not in resp.json()
        cookies = resp.headers.get_list("set-cookie")
        assert len(cookies) == 1 and cookies[0].startswith(f"{SIGNUP_MARKER}=")
        low = cookies[0].lower()
        assert "httponly" in low and "secure" in low and "path=/api/auth" in low

    def test_a_cross_site_form_cannot_plant_the_marker(self, client):
        """A plain HTML form can only send text/plain, form-urlencoded or
        multipart. If register parsed such a body, another site could make a
        visitor's browser register an email of its choosing and so plant a
        valid marker there. It must be refused before any cookie is set."""
        import json

        resp = client.post(
            "/auth/register",
            content=json.dumps(self.PAYLOAD),
            headers={"content-type": "text/plain"},
        )
        assert resp.status_code == 422
        assert resp.headers.get_list("set-cookie") == []
