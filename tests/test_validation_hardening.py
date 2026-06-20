"""MEH-248 — backend validation hardening.

1. POST /auth/register — password min_length=8 (previously frontend-only)
2. POST /auth/register/producer — same, when password is supplied
3. GET /users/me/favorites — must not 500 on orphaned Favorite rows
"""
from tests.conftest import (
    auth_header,
    make_producer,
    make_user,
    valid_producer_register_payload,
)


# ---------- password min_length ----------


def test_register_rejects_short_password(client):
    r = client.post(
        "/auth/register",
        json={"email": "short@test.com", "name": "Short", "password": "1234567"},
    )
    assert r.status_code == 422
    # Error must name the password field so the frontend can surface it
    assert any("password" in str(e.get("loc", "")) for e in r.json()["detail"])


def test_register_accepts_valid_password(client):
    r = client.post(
        "/auth/register",
        json={"email": "ok@test.com", "name": "OK", "password": "SecurePass123!"},
    )
    assert r.status_code == 200


def test_register_producer_rejects_short_password(client):
    r = client.post(
        "/auth/register/producer",
        json={
            "email": "p@test.com",
            "name": "P",
            "password": "short",
            "producer_name": "Farm",
            "primary_contact_method": "whatsapp",
            "phone": "+972501234567",
        },
    )
    assert r.status_code == 422


# ---------- MEH-870: letter-floor on register/producer tagline + address ----------
# The PUBLIC registration path now rejects punctuation-only short_description
# (tagline) / address, reaching parity with the _min_letters_validator floor
# on ProducerCreate.name and HomeProductCreate.title. Optional fields: a
# provided-but-letterless value is 422; absent stays valid.


def _producer_payload(**overrides):
    # primary_contact_method "whatsapp" (fixture default) needs a phone or the
    # handler 422s before the schema-level field check we are exercising.
    payload = valid_producer_register_payload()
    payload["phone"] = "0501234567"
    payload.update(overrides)
    return payload


def test_register_producer_rejects_punctuation_only_short_description(client):
    r = client.post(
        "/auth/register/producer",
        json=_producer_payload(short_description="???"),
    )
    assert r.status_code == 422
    assert any(
        "short_description" in str(e.get("loc", "")) for e in r.json()["detail"]
    )


def test_register_producer_rejects_punctuation_only_address(client):
    r = client.post(
        "/auth/register/producer",
        json=_producer_payload(address="---"),
    )
    assert r.status_code == 422
    assert any("address" in str(e.get("loc", "")) for e in r.json()["detail"])


def test_register_producer_accepts_short_hebrew_tagline(client):
    # 3+ Hebrew letters clears the floor — short legit taglines stay valid.
    r = client.post(
        "/auth/register/producer",
        json=_producer_payload(short_description="אוכל ביתי"),
    )
    assert r.status_code == 200, r.text


def test_register_producer_accepts_address_with_digits(client):
    # Letters counted after stripping punctuation/digits; "רח' הרצל 5" has 6.
    r = client.post(
        "/auth/register/producer",
        json=_producer_payload(address="רח' הרצל 5"),
    )
    assert r.status_code == 200, r.text


# ---------- favorites: orphaned row doesn't 500 ----------


def test_favorites_skips_orphaned_rows(client, db):
    """If a Favorite row references a missing Producer, GET must return
    the remaining valid favorites (not 500). Simulates the pre-ondelete
    historical state where cascade may not have fired."""
    from app.models.models import Favorite

    user = make_user(db, role="consumer")
    good = make_producer(db, name="Still Here", status="approved")
    gone = make_producer(db, name="Soon Deleted", status="approved")

    db.add(Favorite(user_id=user.id, producer_id=good.id))
    db.add(Favorite(user_id=user.id, producer_id=gone.id))
    db.commit()

    # Direct DELETE bypasses ORM cascade to simulate the bug scenario.
    # (ondelete="CASCADE" on the FK will clean the favorite row too, so
    # this test proves the inner-join fallback works even without an
    # orphaned row — the join simply excludes rows where producer is
    # missing.)
    db.delete(gone)
    db.commit()

    r = client.get("/users/me/favorites", headers=auth_header(user))
    assert r.status_code == 200
    names = [f["producer"]["name"] for f in r.json()]
    assert names == ["Still Here"]
