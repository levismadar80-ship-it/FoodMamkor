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


# ---------- MEH-870: punctuation-only floor on register/producer tagline + address ----------
# The PUBLIC registration path now rejects punctuation-only short_description
# (tagline) and address. Two floors by field semantics: short_description needs
# ≥3 letters (like ProducerCreate.name); address needs only ≥1 letter-or-digit
# so valid Israeli forms ("ת.ד. 123", "רח' הרצל 5") aren't over-rejected.
# Optional fields: a punctuation-only value is 422; absent stays valid.


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
    # Address floor is ≥1 letter-or-digit; "רח' הרצל 5" has both.
    r = client.post(
        "/auth/register/producer",
        json=_producer_payload(address="רח' הרצל 5"),
    )
    assert r.status_code == 200, r.text


def test_register_producer_accepts_po_box_address(client):
    # MEH-870 review catch: the ≥3-letter floor would reject the Israeli P.O.
    # box "ת.ד. 123" (→ "תד", 2 letters). The ≥1-alphanumeric address floor
    # accepts it (contains digits).
    r = client.post(
        "/auth/register/producer",
        json=_producer_payload(address="ת.ד. 123"),
    )
    assert r.status_code == 200, r.text


# ---------- MEH-1623: producer_name floor + sanitize on the PUBLIC path ----------
# ProducerRegister.producer_name carried NO validator at all while its
# admin-side twin (ProducerCreate.name) has had _min_letters_validator since
# MEH-555 — so the public registration path accepted "???", whitespace, and raw
# HTML as a business name. Stacked bleach→floor, mirroring short_description.


def test_register_producer_rejects_punctuation_only_producer_name(client):
    # The MEH-555 pattern on the field it had never been applied to.
    r = client.post(
        "/auth/register/producer",
        json=_producer_payload(producer_name="???"),
    )
    assert r.status_code == 422
    assert any("producer_name" in str(e.get("loc", "")) for e in r.json()["detail"])


def test_register_producer_rejects_whitespace_only_producer_name(client):
    # sanitize_text strips to "" → returns None; _min_letters_validator coerces
    # None → "" and raises a clean ValueError (422), NOT AttributeError (500).
    # This is the HOT-003 path documented at schemas.py:59.
    r = client.post(
        "/auth/register/producer",
        json=_producer_payload(producer_name="   "),
    )
    assert r.status_code == 422
    assert any("producer_name" in str(e.get("loc", "")) for e in r.json()["detail"])


def test_register_producer_strips_html_from_producer_name(client, db):
    # Sanitization is observable only in what gets PERSISTED — the response is
    # an anti-enumeration ack (MEH-328) that echoes nothing back.
    from app.models.models import Producer

    r = client.post(
        "/auth/register/producer",
        json=_producer_payload(producer_name="<b>מאפיית שקד</b>"),
    )
    assert r.status_code == 200, r.text
    stored = db.query(Producer).one()
    assert stored.name == "מאפיית שקד"


def test_register_producer_rejects_html_wrapping_a_too_short_name(client):
    # The ticket's literal example, pinned to its ACTUAL behaviour: bleach
    # strips to "שם" = 2 letters, which is below the ≥3-letter floor → 422.
    # The floor runs on the POST-sanitize value, so HTML cannot be used to pad
    # a name past it.
    r = client.post(
        "/auth/register/producer",
        json=_producer_payload(producer_name="<b>שם</b>"),
    )
    assert r.status_code == 422
    assert any("producer_name" in str(e.get("loc", "")) for e in r.json()["detail"])


def test_register_producer_accepts_legitimate_hebrew_producer_name(client):
    # Regression floor: the fix must not reject a real business name.
    r = client.post(
        "/auth/register/producer",
        json=_producer_payload(producer_name="מאפיית שקד"),
    )
    assert r.status_code == 200, r.text


def test_producer_register_has_exactly_12_validated_fields():
    """MEH-1623 verification_step: the AST count that proves the field is
    actually wired, not just that a validator function exists.

    Counts DISTINCT field names targeted by @field_validator on
    ProducerRegister — 11 before this change, 12 after (producer_name).
    Reads Pydantic's own validator registry rather than re-parsing the
    source, so a validator declared but bound to a typo'd field name
    cannot pass.
    """
    from app.schemas.schemas import ProducerRegister

    validators = ProducerRegister.__pydantic_decorators__.field_validators
    fields = {name for v in validators.values() for name in v.info.fields}
    assert "producer_name" in fields, sorted(fields)
    assert len(fields) == 12, sorted(fields)


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
