"""
Module:   test_meh1471_referral_source
Purpose:  Contract for the self-reported attribution field ("מאיפה שמעת
          עלינו?") added to producer registration — a valid key persists,
          an unknown key 422s, and "other" + free text persists both columns.
Touches:  POST /auth/register/producer (new-registration path), producers
          table (referral_source / referral_source_other columns).
Does NOT: exercise the admin display (frontend) or the MEH-143 upgrade path
          beyond the nullable-absence regression here.
Related:  backend/app/schemas/schemas.py (ProducerRegister validators),
          backend/app/constants.py:REFERRAL_SOURCE_KEYS,
          backend/app/routers/auth.py (Producer creation sites).
History:  MEH-1471 (creation, 2026-07-22).
"""
from app.models.models import Producer
from conftest import valid_producer_register_payload

REGISTER_URL = "/auth/register/producer"
VALID_PHONE = "0521234567"


def _new_registration(**overrides) -> dict:
    """Schema-valid NEW (unauthenticated) producer registration payload.

    Mirrors tests/test_register_personas.py: builds on the shared helper
    (non-license category + declaration_accepted) and adds the phone that the
    default whatsapp contact method requires.
    """
    return valid_producer_register_payload() | {"phone": VALID_PHONE} | overrides


def test_valid_referral_source_persists(client, db):
    """A known key from REFERRAL_SOURCE_KEYS is accepted and stored verbatim;
    referral_source_other stays NULL when not supplied."""
    resp = client.post(
        REGISTER_URL,
        json=_new_registration(
            email="ref-valid@example.com", referral_source="instagram"
        ),
    )
    assert resp.status_code == 200, resp.text

    producer = db.query(Producer).one()
    assert producer.referral_source == "instagram"
    assert producer.referral_source_other is None


def test_invalid_referral_source_is_422(client, db):
    """An unknown key is rejected at the schema boundary (422) and no producer
    row is created."""
    resp = client.post(
        REGISTER_URL,
        json=_new_registration(
            email="ref-bad@example.com", referral_source="tiktok"
        ),
    )
    assert resp.status_code == 422, resp.text
    assert db.query(Producer).count() == 0


def test_other_with_text_persists_both_columns(client, db):
    """referral_source='other' plus a free-text answer persists BOTH columns."""
    resp = client.post(
        REGISTER_URL,
        json=_new_registration(
            email="ref-other@example.com",
            referral_source="other",
            referral_source_other="שמעתי עליכם בשוק האיכרים",
        ),
    )
    assert resp.status_code == 200, resp.text

    producer = db.query(Producer).one()
    assert producer.referral_source == "other"
    assert producer.referral_source_other == "שמעתי עליכם בשוק האיכרים"


def test_prefer_not_to_say_persists(client, db):
    """'prefer_not_to_say' is a first-class allowed key (not a rejected value),
    so the required dropdown never forces a channel disclosure."""
    resp = client.post(
        REGISTER_URL,
        json=_new_registration(
            email="ref-pns@example.com", referral_source="prefer_not_to_say"
        ),
    )
    assert resp.status_code == 200, resp.text
    assert db.query(Producer).one().referral_source == "prefer_not_to_say"


def test_absent_referral_source_is_nullable(client, db):
    """The column is nullable and the field optional at the API layer — an
    absent value keeps registration working (existing producers / MEH-143
    upgrade path) and persists NULL."""
    resp = client.post(
        REGISTER_URL, json=_new_registration(email="ref-absent@example.com")
    )
    assert resp.status_code == 200, resp.text

    producer = db.query(Producer).one()
    assert producer.referral_source is None
    assert producer.referral_source_other is None
