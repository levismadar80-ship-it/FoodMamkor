"""MEH-170 — OAuth Step 0 on producer signup.

POST /auth/register/producer/oauth reuses the existing Google / Apple
verification helpers but returns 409 when the authenticated user already
has a producer linked (the UI redirects to /login in that case).

The verify helpers are monkey-patched at the router level; no real
network call is made.
"""
import pytest

from app.config import settings
from app.models import Producer, User
from app.routers import auth as auth_router


GOOGLE_SUB = "google-sub-123"
APPLE_SUB = "apple-sub-456"
EMAIL = "yael@example.com"
NAME = "יעל כהן"


@pytest.fixture
def google_verified(monkeypatch):
    """Stub the Google verifier to return a predictable user_info dict."""
    monkeypatch.setattr(settings, "google_client_id", "dummy-google-id")
    monkeypatch.setattr(
        auth_router,
        "_verify_google_token",
        lambda token: {
            "sub": GOOGLE_SUB,
            "email": EMAIL,
            "name": NAME,
            "picture": "https://example.com/yael.jpg",
        },
    )


@pytest.fixture
def apple_verified(monkeypatch):
    monkeypatch.setattr(settings, "apple_client_id", "dummy-apple-id")
    monkeypatch.setattr(
        auth_router,
        "_verify_apple_token",
        lambda token: {"sub": APPLE_SUB, "email": EMAIL},
    )


class TestProducerOAuthSignup:
    # Happy paths ----------------------------------------------------------

    def test_google_happy_path_creates_consumer_and_returns_token(
        self, client, db, google_verified
    ):
        resp = client.post(
            "/auth/register/producer/oauth",
            json={"provider": "google", "id_token": "ignored"},
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]
        assert token

        user = db.query(User).filter(User.email == EMAIL).one()
        assert user.google_id == GOOGLE_SUB
        assert user.role == "consumer"
        assert user.producer_id is None
        assert user.avatar_url == "https://example.com/yael.jpg"

    def test_apple_happy_path_creates_consumer_and_returns_token(
        self, client, db, apple_verified
    ):
        resp = client.post(
            "/auth/register/producer/oauth",
            json={"provider": "apple", "id_token": "ignored", "name": NAME},
        )
        assert resp.status_code == 200
        user = db.query(User).filter(User.email == EMAIL).one()
        assert user.apple_id == APPLE_SUB
        assert user.name == NAME
        assert user.role == "consumer"

    # Role upgrade (MEH-143 pattern) --------------------------------------

    def test_existing_consumer_via_same_provider_logs_in(
        self, client, db, google_verified
    ):
        db.add(
            User(
                email=EMAIL,
                name="יעל קיימת",
                google_id=GOOGLE_SUB,
                role="consumer",
                referral_code="abc12345",
            )
        )
        db.commit()

        resp = client.post(
            "/auth/register/producer/oauth",
            json={"provider": "google", "id_token": "ignored"},
        )
        assert resp.status_code == 200
        # Same user — no duplicate row.
        assert db.query(User).filter(User.email == EMAIL).count() == 1

    # MEH-166 email-collision guard ---------------------------------------

    def test_email_collision_with_password_account_returns_409(
        self, client, db, google_verified
    ):
        db.add(
            User(
                email=EMAIL,
                name="יעל",
                password_hash="$argon2id$dummy",
                role="consumer",
                referral_code="zzz12345",
            )
        )
        db.commit()

        resp = client.post(
            "/auth/register/producer/oauth",
            json={"provider": "google", "id_token": "ignored"},
        )
        assert resp.status_code == 409
        assert "סיסמה" in resp.json()["detail"]

    # Already a producer -------------------------------------------------

    def test_existing_producer_returns_409(self, client, db, google_verified):
        producer = Producer(name="העסק של יעל", city="תל אביב", status="approved")
        db.add(producer)
        db.flush()
        db.add(
            User(
                email=EMAIL,
                name="יעל",
                google_id=GOOGLE_SUB,
                role="producer",
                producer_id=producer.id,
                is_producer=True,
                referral_code="prd12345",
            )
        )
        db.commit()

        resp = client.post(
            "/auth/register/producer/oauth",
            json={"provider": "google", "id_token": "ignored"},
        )
        assert resp.status_code == 409
        assert "עסק" in resp.json()["detail"]

    # Provider misconfigured ---------------------------------------------

    def test_google_unconfigured_returns_503(self, client, monkeypatch):
        monkeypatch.setattr(settings, "google_client_id", "")
        resp = client.post(
            "/auth/register/producer/oauth",
            json={"provider": "google", "id_token": "whatever"},
        )
        assert resp.status_code == 503
        assert "Google" in resp.json()["detail"]

    # Invalid token ------------------------------------------------------

    def test_invalid_google_token_returns_401(self, client, monkeypatch):
        monkeypatch.setattr(settings, "google_client_id", "dummy-google-id")
        monkeypatch.setattr(auth_router, "_verify_google_token", lambda t: None)
        resp = client.post(
            "/auth/register/producer/oauth",
            json={"provider": "google", "id_token": "bad"},
        )
        assert resp.status_code == 401

    # Schema validation --------------------------------------------------

    def test_unknown_provider_returns_422(self, client):
        resp = client.post(
            "/auth/register/producer/oauth",
            json={"provider": "facebook", "id_token": "x"},
        )
        assert resp.status_code == 422
