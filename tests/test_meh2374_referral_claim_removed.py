"""MEH-2374: the friend-referral claim endpoint is gone.

No screen ever showed a user her referral link, and since MEH-328 the only
caller (RegisterClient, right after signup) ran unauthenticated and got a 401.
Registration stopped minting `users.referral_code` under MEH-2393; the
column and the `referral_clicks` table go in the Expand-Contract drop.

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
    # MEH-2393, Contract step 1: nothing reads users.referral_code, so the
    # register paths stop writing it and UserOut stops exposing it. The drop
    # migration can then remove the column without any live writer.
    # DISCRIMINATION: on the old code every register path set an 8-hex code
    # and UserOut carried the key, so both assertions go red.
    from app.models.models import User
    from tests.conftest import auth_header, valid_user_register_payload

    payload = valid_user_register_payload()
    resp = client.post("/auth/register", json=payload)
    assert resp.status_code == 200, resp.text

    user = db.query(User).filter(User.email == payload["email"]).one()
    assert user.referral_code is None

    # /auth/register answers with a neutral detail only, so read the UserOut
    # shape where it is served: GET /auth/me.
    me = client.get("/auth/me", headers=auth_header(user))
    assert me.status_code == 200, me.text
    assert "referral_code" not in me.json()
    # Control: this is the real user payload, not an error body.
    assert me.json()["email"] == payload["email"]
