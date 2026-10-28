"""MEH-2374: the friend-referral claim endpoint is gone.

No screen ever showed a user her referral link, and since MEH-328 the only
caller (RegisterClient, right after signup) ran unauthenticated and got a 401.
Registration stopped minting `users.referral_code` (MEH-2393 chunk 1); chunk 2
dropped `referral_clicks` and unmapped the column; chunk 3 dropped it.

DISCRIMINATION: on the old code `POST /referral/claim` is mounted, so the
assertion lists it and goes red.
"""

from app.main import app


def test_referral_claim_route_is_not_mounted():
    paths = app.openapi()["paths"]
    assert not [p for p in paths if p.startswith("/referral")]
    # Control: the schema is the real one, not an empty dict.
    assert "/auth/register" in paths


def test_referral_claim_returns_404(client):
    # The schema check above cannot see a route re-mounted with
    # include_in_schema=False; the wire can. MANUAL_TESTING.md promises 404.
    resp = client.post("/referral/claim", json={"code": "ABCDEF"})
    assert resp.status_code == 404


def test_registration_no_longer_mints_a_referral_code(client, db):
    # MEH-2393: the register paths stopped writing users.referral_code
    # (chunk 1), the ORM stopped mapping it (chunk 2) and chunk 3 dropped it
    # from the table. DISCRIMINATION: before chunk 1 every register path set
    # an 8-hex code and UserOut carried the key; before chunk 2 the column was
    # mapped; before chunk 3 it was still in User.__table__.
    from sqlalchemy import inspect as sa_inspect

    from app.models.models import User
    from tests.conftest import auth_header, valid_user_register_payload

    payload = valid_user_register_payload()
    resp = client.post("/auth/register", json=payload)
    assert resp.status_code == 200, resp.text

    user = db.query(User).filter(User.email == payload["email"]).one()
    assert "referral_code" not in sa_inspect(User).attrs
    assert "referral_code" not in User.__table__.c
    # Control: the column collection is the real one, not an empty set.
    assert "email" in User.__table__.c

    # /auth/register answers with a neutral detail only, so read the UserOut
    # shape where it is served: GET /auth/me.
    me = client.get("/auth/me", headers=auth_header(user))
    assert me.status_code == 200, me.text
    assert "referral_code" not in me.json()
    # Control: this is the real user payload, not an error body.
    assert me.json()["email"] == payload["email"]
