"""MEH-2080 chunk 2 — /auth/google and /auth/apple record the terms consent.

The email path stamps users.terms_accepted_at / terms_version from the
/register checkbox (MEH-1995, #3458), and the owner paths stamp it at Step 2
and at /claim. A consumer who signed up from /register with Google or Apple
left both columns NULL even after ticking the same checkbox. The flag is
optional: /login sends nothing, and an absent or False flag never writes or
erases a record (NULL stays the honest state).
"""

from datetime import datetime, timezone

import pytest

from app.config import settings
from app.constants import TERMS_VERSION
from app.models import User
from app.routers import auth as auth_router
from conftest import make_user

EMAIL = "noa@example.com"


@pytest.fixture
def oauth_ok(monkeypatch):
    """Both providers configured, each verifier returning one fixed identity."""
    monkeypatch.setattr(settings, "google_client_id", "dummy-google-id")
    monkeypatch.setattr(
        auth_router,
        "_verify_google_token",
        lambda token: {"sub": "g-sub-1", "email": EMAIL, "name": "נועה"},
    )
    monkeypatch.setattr(auth_router, "_upload_google_avatar_or_none", lambda url: None)
    monkeypatch.setattr(settings, "apple_client_id", "dummy-apple-id")
    monkeypatch.setattr(
        auth_router, "_verify_apple_token", lambda token: {"sub": "a-sub-1", "email": EMAIL}
    )


def _user(db):
    db.expire_all()
    return db.query(User).filter(User.email == EMAIL).one()


@pytest.mark.parametrize("provider", ["google", "apple"])
def test_new_oauth_user_with_consent_gets_it_recorded(client, db, oauth_ok, provider):
    r = client.post(f"/auth/{provider}", json={"id_token": "x", "terms_accepted": True})
    assert r.status_code == 200, r.text
    user = _user(db)
    assert user.terms_accepted_at is not None
    assert user.terms_version == TERMS_VERSION


@pytest.mark.parametrize("body", [{"id_token": "x"}, {"id_token": "x", "terms_accepted": False}])
@pytest.mark.parametrize("provider", ["google", "apple"])
def test_no_consent_flag_leaves_the_record_null(client, db, oauth_ok, provider, body):
    r = client.post(f"/auth/{provider}", json=body)
    assert r.status_code == 200, r.text
    user = _user(db)
    assert user.terms_accepted_at is None
    assert user.terms_version is None


def test_login_without_the_flag_never_erases_an_existing_consent(client, db, oauth_ok):
    existing = make_user(db, email=EMAIL)
    existing.google_id = "g-sub-1"
    existing.terms_version = "2026-01-v1"
    stamped = datetime(2026, 1, 5, tzinfo=timezone.utc)
    existing.terms_accepted_at = stamped
    db.commit()

    r = client.post("/auth/google", json={"id_token": "x"})
    assert r.status_code == 200, r.text
    user = _user(db)
    assert user.terms_accepted_at == stamped
    assert user.terms_version == "2026-01-v1"
