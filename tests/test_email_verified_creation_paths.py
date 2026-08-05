"""MEH-1553 — email_verified pinning across every user-creation path.

Pins the expected `email_verified` value for each of the 6 paths that
create a `User`, so a future change to any of them (or a new one that
leans on the column default) fails loudly instead of silently reverting
the MEH-170 gap this ticket closed.

Expected matrix:

  path                                    email_verified  notes
  --------------------------------------  --------------  ----------------
  POST /auth/register (password)          False           + verify token
  POST /auth/register/producer (new)      False           + verify token
  POST /auth/google (new user)            True            provider verified
  POST /auth/apple (new user)             True            provider verified
  POST /auth/register/producer/oauth      True            <- central regression pin (MEH-170)
  scripts/create_admin.py (both branches) True            provisioned admin

The OAuth verifier helpers are monkey-patched at the router level (same
pattern as tests/test_producer_oauth.py) — no real network call is made.
"""
import importlib.util
import os
import sys

import pytest

from app.config import settings
from app.models import User
from app.routers import auth as auth_router

from conftest import valid_producer_register_payload, valid_user_register_payload

GOOGLE_SUB = "google-sub-1553"
APPLE_SUB = "apple-sub-1553"


# ----------------------------------------------------------------------
# OAuth verifier stubs (mirror tests/test_producer_oauth.py)
# ----------------------------------------------------------------------
@pytest.fixture
def google_verified(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "dummy-google-id")
    monkeypatch.setattr(
        auth_router,
        "_verify_google_token",
        lambda token: {
            "sub": GOOGLE_SUB,
            "email": "google-new@example.com",
            "name": "לקוחה גוגל",
            "picture": "https://example.com/g.jpg",
        },
    )


@pytest.fixture
def apple_verified(monkeypatch):
    monkeypatch.setattr(settings, "apple_client_id", "dummy-apple-id")
    monkeypatch.setattr(
        auth_router,
        "_verify_apple_token",
        lambda token: {"sub": APPLE_SUB, "email": "apple-new@example.com"},
    )


# ----------------------------------------------------------------------
# Password paths → email_verified=False + verify token set
# ----------------------------------------------------------------------
class TestPasswordPathsUnverified:
    def test_register_consumer_is_unverified_with_token(self, client, db):
        payload = valid_user_register_payload()
        resp = client.post("/auth/register", json=payload)
        assert resp.status_code == 200, resp.text

        user = db.query(User).filter(User.email == payload["email"]).one()
        assert user.email_verified is False
        assert user.email_verify_token  # a token was minted

    def test_register_producer_new_is_unverified_with_token(self, client, db):
        # phone is mandatory for the default whatsapp contact method (auth.py).
        payload = valid_producer_register_payload() | {"phone": "0501234567"}
        resp = client.post("/auth/register/producer", json=payload)
        assert resp.status_code == 200, resp.text

        user = db.query(User).filter(User.email == payload["email"]).one()
        assert user.email_verified is False
        assert user.email_verify_token


# ----------------------------------------------------------------------
# OAuth paths → email_verified=True (provider already verified the email)
# ----------------------------------------------------------------------
class TestOAuthPathsVerified:
    def test_google_new_user_is_verified(self, client, db, google_verified):
        resp = client.post("/auth/google", json={"id_token": "ignored"})
        assert resp.status_code == 200, resp.text

        user = db.query(User).filter(User.email == "google-new@example.com").one()
        assert user.email_verified is True

    def test_apple_new_user_is_verified(self, client, db, apple_verified):
        resp = client.post("/auth/apple", json={"id_token": "ignored"})
        assert resp.status_code == 200, resp.text

        user = db.query(User).filter(User.email == "apple-new@example.com").one()
        assert user.email_verified is True

    def test_producer_oauth_google_new_user_is_verified(
        self, client, db, google_verified
    ):
        # Central regression pin for MEH-170: the Step-0 OAuth producer
        # signup must stamp email_verified=True like its /auth/google and
        # /auth/apple siblings, or the producer is blocked on the money path
        # by require_verified_producer (MEH-1164).
        resp = client.post(
            "/auth/register/producer/oauth",
            json={"provider": "google", "id_token": "ignored"},
        )
        assert resp.status_code == 200, resp.text

        user = db.query(User).filter(User.email == "google-new@example.com").one()
        assert user.email_verified is True

    def test_producer_oauth_apple_new_user_is_verified(
        self, client, db, apple_verified
    ):
        resp = client.post(
            "/auth/register/producer/oauth",
            json={"provider": "apple", "id_token": "ignored", "name": "לקוחה אפל"},
        )
        assert resp.status_code == 200, resp.text

        user = db.query(User).filter(User.email == "apple-new@example.com").one()
        assert user.email_verified is True


# ----------------------------------------------------------------------
# create_admin.py → email_verified=True on both branches
# ----------------------------------------------------------------------
def _load_create_admin():
    """Import scripts/create_admin.py by path.

    conftest already set DATABASE_URL to the test DB and imported
    app.database, so the script's `setdefault` is a no-op and its
    SessionLocal targets the same test engine.
    """
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(root, "scripts", "create_admin.py")
    spec = importlib.util.spec_from_file_location("create_admin", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestCreateAdminVerified:
    def test_new_admin_is_verified(self, db, monkeypatch):
        create_admin = _load_create_admin()
        email = "brand-new-admin@example.com"
        monkeypatch.setattr(sys, "argv", ["create_admin.py", email, "AdminPass123"])

        assert create_admin.main() == 0

        # The script commits in its OWN session — drop any state this session
        # already cached so the assertions read the row the script wrote.
        db.expire_all()
        user = db.query(User).filter(User.email == email).one()
        assert user.role == "admin"
        assert user.email_verified is True

    def test_upgraded_existing_user_is_verified(self, db, monkeypatch):
        # Pre-existing, *unverified* consumer — the pre-fix upgrade branch
        # left email_verified untouched (False), so this pins the flip.
        email = "existing-consumer@example.com"
        db.add(
            User(
                email=email,
                name="צרכנית קיימת",
                password_hash="$argon2id$dummy",
                role="consumer",
                referral_code="exi15530",
                email_verified=False,
            )
        )
        db.commit()

        create_admin = _load_create_admin()
        monkeypatch.setattr(sys, "argv", ["create_admin.py", email, "AdminPass123"])
        assert create_admin.main() == 0

        db.expire_all()  # see the sibling test — cross-session read
        user = db.query(User).filter(User.email == email).one()
        assert user.role == "admin"
        assert user.email_verified is True
