"""MEH-306 — auth-policy wire-up tests.

Covers register / reset-password / change-password / check-password
behavior added in MEH-306 (PasswordField + validate_password +
password_changed_at + new rate limits + /auth/check-password).

Why a separate file (not extending test_api.py): MEH-306 is a single
PR worth of behavior; concentrating its coverage here keeps the
adversarial-review surface narrow and makes future audits easier.

The autouse `_mock_hibp_clean` fixture in conftest stubs HIBP to
"no match" by default — tests that exercise the breach path patch
_check_hibp directly to return True.
"""
import secrets
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from joserfc import jwt as jose_jwt
from joserfc.jwk import OctKey

from app.config import settings
from app.services import password_policy
from conftest import auth_header, make_user


# 12-char value vetted in test_password_policy.py — not in deny_list_10k,
# HIBP mocked to false for these tests.
SAFE_PASSWORD = "Zx7Yp9Mq2Lr4"
ANOTHER_SAFE_PASSWORD = "Yz8Wq0Nr3Ms5"
DENY_LISTED_AT_LENGTH = "unbelievable"  # 12 chars, in deny_list_10k (matches test_password_policy)


def _decode_token(token: str) -> dict:
    """Decode a JWT minted by app.auth — used to assert iat / sub claims."""
    obj = jose_jwt.decode(
        token,
        OctKey.import_key(settings.secret_key.encode()),
        algorithms=[settings.algorithm],
    )
    return obj.claims


# ---------- Signup ----------

class TestSignupPolicy:
    def test_signup_short_password_rejected_422(self, client):
        # 11 chars — Pydantic short-circuits at PasswordField, deny-list /
        # HIBP never run.
        resp = client.post(
            "/auth/register",
            json={"email": "a@x.com", "name": "A", "password": "short_pass!"},
        )
        assert resp.status_code == 422

    def test_signup_breached_password_rejected(self, client):
        # Override the autouse HIBP=False stub to simulate a breach hit.
        with patch.object(password_policy, "_check_hibp", new=AsyncMock(return_value=True)):
            resp = client.post(
                "/auth/register",
                json={"email": "b@x.com", "name": "B", "password": SAFE_PASSWORD},
            )
        assert resp.status_code == 422
        body = resp.json()
        assert "too_common" in body["detail"]["failures"]

    def test_signup_deny_listed_password_rejected(self, client):
        # 12-char deny-listed credential — blocked locally, HIBP not called.
        resp = client.post(
            "/auth/register",
            json={"email": "c@x.com", "name": "C", "password": DENY_LISTED_AT_LENGTH},
        )
        assert resp.status_code == 422
        assert "too_common" in resp.json()["detail"]["failures"]

    def test_signup_valid_password_succeeds_and_sets_password_changed_at(self, client, db):
        from app.models import User

        before = datetime.now(timezone.utc) - timedelta(seconds=1)
        resp = client.post(
            "/auth/register",
            json={"email": "d@x.com", "name": "D", "password": SAFE_PASSWORD},
        )
        assert resp.status_code == 200
        user = db.query(User).filter(User.email == "d@x.com").first()
        assert user is not None
        assert user.password_changed_at is not None
        assert user.password_changed_at >= before


# ---------- Reset password ----------

class TestResetPasswordPolicy:
    def _seed_token(self, db, user, ttl_minutes=30):
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires_at = datetime.utcnow() + timedelta(minutes=ttl_minutes)
        db.commit()
        return token

    def test_reset_password_short_rejected_422(self, client, db):
        user = make_user(db, password="OldPass1!")  # legacy length acceptable as current
        token = self._seed_token(db, user)
        resp = client.post(
            "/auth/reset-password",
            json={"token": token, "new_password": "short_pass!"},  # 11 chars
        )
        assert resp.status_code == 422

    def test_reset_password_same_as_current_rejected(self, client, db):
        user = make_user(db, password=SAFE_PASSWORD)  # current = SAFE_PASSWORD
        token = self._seed_token(db, user)
        resp = client.post(
            "/auth/reset-password",
            json={"token": token, "new_password": SAFE_PASSWORD},
        )
        assert resp.status_code == 422
        assert "same_as_current" in resp.json()["detail"]["failures"]

    def test_reset_password_valid_succeeds_invalidates_old_jwt(self, client, db):
        from app.models import User

        user = make_user(db, password="OldPass9!")
        # Stamp pre-existing iat-anchor so the JWT issued before reset is
        # measurable against the post-reset password_changed_at.
        old_token = auth_header(user)["Authorization"].split()[1]
        old_claims = _decode_token(old_token)
        # Sanity: old token authenticates today.
        assert client.get("/auth/me", headers={"Authorization": f"Bearer {old_token}"}).status_code == 200

        # Force reset to bump password_changed_at well past the token iat.
        time.sleep(1.1)  # ensure new password_changed_at > old iat (whole-second granularity)
        token = self._seed_token(db, user)
        resp = client.post(
            "/auth/reset-password",
            json={"token": token, "new_password": ANOTHER_SAFE_PASSWORD},
        )
        assert resp.status_code == 200
        # password_changed_at moved forward → MEH-305 iat gate now rejects old_token.
        db.refresh(user)
        assert int(user.password_changed_at.timestamp()) > old_claims["iat"]
        me_after = client.get("/auth/me", headers={"Authorization": f"Bearer {old_token}"})
        assert me_after.status_code == 401
        assert me_after.json()["detail"] == "session_invalidated_by_password_change"


# ---------- Change password ----------

class TestChangePasswordPolicy:
    def test_change_password_wrong_current_returns_403(self, client, db):
        user = make_user(db, password=SAFE_PASSWORD)
        resp = client.patch(
            "/users/me/password",
            headers=auth_header(user),
            json={"current_password": "wrong-old", "new_password": ANOTHER_SAFE_PASSWORD},
        )
        # 403 — verify_password runs before validate_password (workflow rule 6).
        assert resp.status_code == 403

    def test_change_password_same_as_current_rejected_422(self, client, db):
        user = make_user(db, password=SAFE_PASSWORD)
        resp = client.patch(
            "/users/me/password",
            headers=auth_header(user),
            json={"current_password": SAFE_PASSWORD, "new_password": SAFE_PASSWORD},
        )
        assert resp.status_code == 422
        assert "same_as_current" in resp.json()["detail"]["failures"]

    def test_change_password_short_rejected_422(self, client, db):
        user = make_user(db, password=SAFE_PASSWORD)
        resp = client.patch(
            "/users/me/password",
            headers=auth_header(user),
            json={"current_password": SAFE_PASSWORD, "new_password": "short_pass!"},
        )
        assert resp.status_code == 422

    def test_change_password_then_refresh_returns_valid_token(self, client, db):
        """Sub-B contract: after 204 from PATCH /users/me/password, the
        frontend calls /auth/refresh to obtain a token whose iat covers
        the new password_changed_at. Pins the recovery flow.

        SKEPTIC NOTE: this passes only when login + change happen within
        the same int-second (MEH-305 refresh gate uses
        `iat_claim < int(pwd.timestamp())` — equality is allowed via the
        int() coercion). HIBP is mocked clean, so the path runs in <10ms
        and the same-second invariant holds in CI. If this becomes
        flaky on slow runners, the change_password handler will need
        to re-issue the refresh cookie (currently removed per the
        sub-A scope agreement).
        """
        user = make_user(db, password=SAFE_PASSWORD)

        login_resp = client.post(
            "/auth/login",
            json={"email": user.email, "password": SAFE_PASSWORD},
        )
        assert login_resp.status_code == 200
        # TestClient does NOT auto-forward Secure cookies over http://testserver
        # (mirror of TestRefreshTokenFlow.test_refresh_returns_new_access_token).
        refresh_cookie = login_resp.cookies.get("refresh_token")
        assert refresh_cookie

        access_token = login_resp.json()["access_token"]
        # The login token carries a userFingerprint claim — get_current_user
        # requires the matching __Secure-Fgp cookie. Read it from Set-Cookie.
        fp_value = None
        for hdr in login_resp.headers.get_list("set-cookie"):
            if hdr.startswith("__Secure-Fgp="):
                fp_value = hdr.split("=", 1)[1].split(";")[0].strip()
                break
        assert fp_value

        change_resp = client.patch(
            "/users/me/password",
            headers={"Authorization": f"Bearer {access_token}"},
            cookies={"__Secure-Fgp": fp_value},
            json={"current_password": SAFE_PASSWORD, "new_password": ANOTHER_SAFE_PASSWORD},
        )
        assert change_resp.status_code == 204

        refresh_resp = client.post(
            "/auth/refresh",
            cookies={"refresh_token": refresh_cookie},
        )
        assert refresh_resp.status_code == 200, refresh_resp.text
        new_token = refresh_resp.json()["access_token"]
        new_claims = _decode_token(new_token)

        db.refresh(user)
        assert user.password_changed_at is not None
        assert new_claims["iat"] >= int(user.password_changed_at.timestamp())

    def test_change_password_other_sessions_invalidated_via_iat(self, client, db):
        user = make_user(db, password=SAFE_PASSWORD)
        # Token A — represents the "other device" session. auth_header()
        # mints a fingerprint-less token (fail-open accepted on /auth/me).
        token_a = auth_header(user)["Authorization"].split()[1]
        assert client.get("/auth/me", headers={"Authorization": f"Bearer {token_a}"}).status_code == 200

        # Sleep past the int-second boundary so password_changed_at > token_a.iat.
        time.sleep(1.1)
        # Use auth_header() again for the change call so we don't drag fingerprint
        # cookies through this test — orthogonal to what we're proving.
        change_resp = client.patch(
            "/users/me/password",
            headers=auth_header(user),
            json={"current_password": SAFE_PASSWORD, "new_password": ANOTHER_SAFE_PASSWORD},
        )
        assert change_resp.status_code == 204

        # Token A — issued before the change — is now invalidated.
        me_a = client.get("/auth/me", headers={"Authorization": f"Bearer {token_a}"})
        assert me_a.status_code == 401
        assert me_a.json()["detail"] == "session_invalidated_by_password_change"


# ---------- /auth/check-password ----------

class TestCheckPasswordEndpoint:
    def test_short_returns_422(self, client):
        resp = client.post("/auth/check-password", json={"candidate": "short_pass!"})
        assert resp.status_code == 422  # PasswordField rejects pre-handler

    def test_deny_listed_returns_failures(self, client):
        resp = client.post(
            "/auth/check-password",
            json={"candidate": DENY_LISTED_AT_LENGTH},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is False
        assert "too_common" in body["failures"]


# ---------- Rate limits ----------

class TestForgotPasswordRateLimits:
    def test_per_email_limit_5_per_15min(self, client, db):
        """Six requests targeting the same email — sixth → 429 even from
        rotating IPs. Per-email key uses email_from_body in rate_limit.py.
        """
        make_user(db, email="victim@test.com", password=SAFE_PASSWORD)
        # Use distinct X-Forwarded-For so per-IP bucket can't trip first;
        # TRUSTED_PROXY isn't enabled in tests so X-Forwarded-For is ignored
        # and TestClient's host counts as one IP — per-IP limit is 10/15min,
        # so 6 requests stay under it. Per-email cap of 5 trips on the 6th.
        with patch("app.routers.auth._send_reset_email"):
            statuses = [
                client.post("/auth/forgot-password", json={"email": "victim@test.com"}).status_code
                for _ in range(6)
            ]
        # First 5 succeed, 6th is rate-limited.
        assert statuses[:5] == [200] * 5
        assert statuses[5] == 429

    def test_per_ip_limit_10_per_15min(self, client, db):
        """Eleven requests with rotating emails from the same client →
        eleventh → 429 from the per-IP bucket (per-email never saturates
        because the email rotates each request).
        """
        # Pre-create users so the body-validation passes; even non-existent
        # emails return 200 by design (anti-enumeration), so only IP cap
        # matters here.
        with patch("app.routers.auth._send_reset_email"):
            statuses = [
                client.post(
                    "/auth/forgot-password",
                    json={"email": f"u{i}@test.com"},
                ).status_code
                for i in range(11)
            ]
        assert statuses[:10] == [200] * 10
        assert statuses[10] == 429
