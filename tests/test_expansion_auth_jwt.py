"""Mutation-guided test expansion (2026-06, Refs MEH-214) — domain B3.

Auth/JWT gaps the audit found uncovered around an otherwise strong suite:
  - require_producer isolated 403 (JW-1);
  - get_current_user_optional MUST re-raise 403 for a blocked user rather
    than silently treating them as anonymous (JW-2) — this is the one
    behavior get_current_user_optional adds over swallowing everything;
  - an expired access token is rejected (JW-3);
  - a refresh-scope token presented as a Bearer access token is rejected
    (JW-4).

Backend tests — CI Postgres is the healer.
"""
from app.auth import create_access_token, create_refresh_token
from app.config import settings
from tests.conftest import auth_header, make_producer, make_user


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- JW-2 — blocked user via optional auth must 403, not None ----------

def test_blocked_user_gets_403_on_optional_auth_route(client, db):
    """GET /producers/{id} uses get_current_user_optional. A blocked user's
    token must surface 403, NOT be downgraded to anonymous (which would
    return the approved producer with 200).

    Kills JW-2: dropping the 403 re-raise in get_current_user_optional.
    """
    producer = make_producer(db, name="חוות מאושרת", status="approved")
    blocked = make_user(db, role="consumer", is_blocked=True)
    resp = client.get(f"/producers/{producer.id}", headers=auth_header(blocked))
    assert resp.status_code == 403


def test_active_user_optional_auth_still_works(client, db):
    """Control: a non-blocked user reads the same approved producer fine.
    Guards JW-2 from over-correcting into 'always 403'."""
    producer = make_producer(db, name="חוות מאושרת 2", status="approved")
    active = make_user(db, role="consumer")
    resp = client.get(f"/producers/{producer.id}", headers=auth_header(active))
    assert resp.status_code == 200


# ---------- JW-1 — require_producer guard ----------

def test_require_producer_rejects_consumer(client, db):
    """A consumer hitting a producer-only route → 403 (require_producer).

    Kills JW-1 (`role != 'producer'` → `==`).
    """
    consumer = make_user(db, role="consumer")
    resp = client.get("/producers/me/dashboard", headers=auth_header(consumer))
    assert resp.status_code == 403


# ---------- JW-3 — expired access token ----------

def test_expired_access_token_rejected(client, db, monkeypatch):
    """A token whose exp is in the past → 401.

    Kills JW-3 (skipping JWTClaimsRegistry().validate() would accept it).
    """
    user = make_user(db, role="consumer")
    # Mint a token with a negative TTL so exp lands in the past.
    monkeypatch.setattr(settings, "access_token_expire_minutes", -60)
    expired = create_access_token(user.id)
    resp = client.get("/auth/me", headers=_bearer(expired))
    assert resp.status_code == 401


def test_fresh_access_token_accepted(client, db):
    """Control: a normally-minted token works on /auth/me (proves the
    expiry test isn't passing for an unrelated reason)."""
    user = make_user(db, role="consumer")
    resp = client.get("/auth/me", headers=_bearer(create_access_token(user.id)))
    assert resp.status_code == 200


# ---------- JW-4 — refresh token rejected as access token ----------

def test_refresh_token_rejected_as_bearer_access(client, db):
    """Presenting a scope=refresh token as a Bearer access token → 401.

    Kills JW-4 (_validate_access_scope `scope != 'access'` → `==`).
    """
    user = make_user(db, role="consumer")
    refresh = create_refresh_token(user.id, 1)
    resp = client.get("/auth/me", headers=_bearer(refresh))
    assert resp.status_code == 401
