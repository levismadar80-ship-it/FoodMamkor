"""MEH-669 — admin accounts cannot self-register as producer.

Two endpoints are guarded:

  - POST /auth/register/producer        (auth.py upgrade path, password flow)
  - POST /auth/register/producer/oauth  (auth.py OAuth Step 0)

Both raise 403 with the same Hebrew copy when the authenticated caller's
role is "admin", instead of silently overwriting role to "producer" and
locking the admin out of /admin.

Includes regression coverage for the two paths that MUST stay open:
authenticated consumer upgrading to producer (200), and anonymous new
producer signup (200).
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.config import settings
from app.models import User
from app.routers import auth as auth_router

from tests.conftest import auth_header, make_user


ADMIN_EMAIL = "admin@example.com"
CONSUMER_EMAIL = "consumer@example.com"
NEW_PRODUCER_EMAIL = "newp@example.com"

# Mirrors tests/test_auth.py::TestProducerSignupPolicy.VALID_REG body
# minus the email/name/password fields the upgrade path ignores.
UPGRADE_BODY = {
    "producer_name": "חוות הניסוי",
    "phone": "0501234567",
    "category_ids": [],
    "primary_contact_method": "whatsapp",
}

# 12-char SAFE_PASSWORD per MEH-306 PasswordField floor; matches
# conftest.make_user default + valid_producer_register_payload.
SAFE_PASSWORD = "Zx7Yp9Mq2Lr4"

ADMIN_ERROR_FRAGMENT = "מנהלת מערכת לא יכולה להירשם כבית עסק"


class TestRegisterProducerAdminLockout:
    """POST /auth/register/producer — password/upgrade flow."""

    def test_admin_upgrade_rejected_with_403(self, client, db):
        admin = make_user(db, email=ADMIN_EMAIL, role="admin")
        resp = client.post(
            "/auth/register/producer",
            json=UPGRADE_BODY,
            headers=auth_header(admin),
        )
        assert resp.status_code == 403, resp.json()
        assert ADMIN_ERROR_FRAGMENT in resp.json()["detail"]

        # Crucial post-condition: admin row is untouched.
        db.refresh(admin)
        assert admin.role == "admin"
        assert admin.producer_id is None
        assert admin.is_producer is False

    def test_consumer_upgrade_still_succeeds(self, client, db):
        # Regression — MEH-143 upgrade path must remain open for consumers.
        consumer = make_user(db, email=CONSUMER_EMAIL, role="consumer")
        resp = client.post(
            "/auth/register/producer",
            json=UPGRADE_BODY,
            headers=auth_header(consumer),
        )
        assert resp.status_code == 200, resp.json()
        db.refresh(consumer)
        assert consumer.role == "producer"
        assert consumer.producer_id is not None
        assert consumer.is_producer is True

    def test_anonymous_new_signup_still_succeeds(self, client, db):
        # Regression — non-upgrade path (MEH-328 OWASP anti-enum) unchanged.
        body = {
            **UPGRADE_BODY,
            "email": NEW_PRODUCER_EMAIL,
            "name": "יצרנית חדשה",
            "password": SAFE_PASSWORD,
        }
        resp = client.post("/auth/register/producer", json=body)
        assert resp.status_code == 200, resp.json()
        # MEH-328 Chunk B: non-upgrade returns RegisterAck (no access_token).
        assert "access_token" not in resp.json()
        user = db.query(User).filter(User.email == NEW_PRODUCER_EMAIL).first()
        assert user is not None
        assert user.role == "producer"


class TestRegisterProducerOAuthAdminLockout:
    """POST /auth/register/producer/oauth — Step 0 OAuth flow."""

    OAUTH_SUB = "google-admin-sub"

    @pytest.fixture
    def google_verified(self, monkeypatch):
        # REUSES: tests/test_producer_oauth.py:23 — same stub shape.
        monkeypatch.setattr(settings, "google_client_id", "dummy-google-id")
        monkeypatch.setattr(
            auth_router,
            "_verify_google_token",
            lambda token: {
                "sub": self.OAUTH_SUB,
                "email": ADMIN_EMAIL,
                "name": "מנהלת",
            },
        )

    def test_admin_oauth_rejected_with_403(self, client, db, google_verified):
        # Admin whose Google account is linked tries the producer-OAuth
        # entry. Endpoint must reject before issuing a Step-2 token.
        db.add(
            User(
                email=ADMIN_EMAIL,
                name="מנהלת",
                google_id=self.OAUTH_SUB,
                role="admin",
                referral_code="adm12345",
            )
        )
        db.commit()

        resp = client.post(
            "/auth/register/producer/oauth",
            json={"provider": "google", "id_token": "ignored"},
        )
        assert resp.status_code == 403, resp.json()
        assert ADMIN_ERROR_FRAGMENT in resp.json()["detail"]

        # Admin row untouched.
        admin = db.query(User).filter(User.email == ADMIN_EMAIL).one()
        assert admin.role == "admin"
        assert admin.producer_id is None
        assert admin.is_producer is False
