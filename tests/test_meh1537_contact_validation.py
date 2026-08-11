"""MEH-1537 — contact-field validation parity (contact_email / phone / whatsapp_group).

Sapir's QA showed the dashboard accepting malformed contact data. The server is
now the source of truth on EVERY Producer write path: a malformed phone (which
silently breaks the wa.me button), a malformed email (a dead contact channel),
and a non-chat.whatsapp.com group link are all rejected with a Hebrew 422; an
empty/whitespace value normalises to None so a cleared field never 422s.

Two layers:
  * Pure-Pydantic tests — prove each write schema (ProducerRegister,
    ProducerCreate, ProducerAdminCreate, ProducerUpdate) enforces one shared
    definition. No HTTP/DB/auth needed (mirrors test_meh1222_image_url_validation).
  * HTTP tests on PUT /producers/me — prove the Hebrew detail reaches the client
    (the negative API probe) and that existing valid payloads still round-trip.

Phone validity mirrors the ticket's Railway audit SQL exactly
(`regexp_replace(phone,'[^0-9]','') ~ '^(972)?0?[0-9]{8,9}$'`), so a row the
audit flags is a row the validator rejects, and vice-versa.
"""

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.schemas import (
    ProducerAdminCreate,
    ProducerCreate,
    ProducerRegister,
    ProducerUpdate,
)
from tests.conftest import auth_header, make_producer, make_user


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _producer_user(db):
    """Owner wiring reused across the HTTP tests (see test_dietary_scope_io)."""
    producer = make_producer(db, name="חוות ולידציה")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def _register(**overrides):
    base = dict(producer_name="חוות בדיקה", category_ids=[1])
    base.update(overrides)
    return ProducerRegister(**base)


def _admin_create(**overrides):
    base = dict(name="חוות אדמין")
    base.update(overrides)
    return ProducerAdminCreate(**base)


VALID_PHONES = [
    "0501234567",
    "050-123-4567",
    "+972 50 123 4567",
    "972501234567",
    "0812345678",
]
INVALID_PHONES = ["12345", "0", "abc", "0" * 21, "+972-50", "555"]


# --------------------------------------------------------------------------- #
# phone — every write schema
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("bad", INVALID_PHONES)
def test_phone_invalid_rejected_producer_update(bad):
    # ProducerUpdate has no required fields, so phone is the ONLY possible cause.
    with pytest.raises(ValidationError):
        ProducerUpdate(phone=bad)


@pytest.mark.parametrize("bad", INVALID_PHONES)
def test_phone_invalid_rejected_producer_create(bad):
    # name + category_ids satisfied so the phone validator is the only failure.
    with pytest.raises(ValidationError):
        ProducerCreate(name="חווה", category_ids=[1], phone=bad)


@pytest.mark.parametrize("good", VALID_PHONES)
def test_phone_valid_accepted_and_separators_stripped(good):
    obj = ProducerUpdate(phone=good)
    # separators removed, +/digits kept as typed (wa.me builders re-normalise).
    assert obj.phone == good.replace(" ", "").replace("-", "").replace("(", "").replace(
        ")", ""
    )


def test_phone_empty_and_whitespace_become_none():
    assert ProducerUpdate(phone="").phone is None
    assert ProducerUpdate(phone="   ").phone is None
    assert ProducerUpdate(phone=None).phone is None


def test_phone_invalid_on_register_and_admin_create():
    with pytest.raises(ValidationError):
        _register(phone="12345")
    with pytest.raises(ValidationError):
        _admin_create(phone="12345")


# --------------------------------------------------------------------------- #
# contact_email — EmailStr write schemas + empty→None
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("schema_factory", [ProducerUpdate, _register, _admin_create])
def test_contact_email_invalid_rejected(schema_factory):
    with pytest.raises(ValidationError):
        schema_factory(contact_email="not-an-email")


@pytest.mark.parametrize("schema_factory", [ProducerUpdate, _register, _admin_create])
def test_contact_email_empty_becomes_none(schema_factory):
    # EmailStr alone would 422 on "" — the mode="before" normaliser turns a
    # cleared field into None so the dashboard save is not blocked.
    assert schema_factory(contact_email="").contact_email is None
    assert schema_factory(contact_email="   ").contact_email is None


@pytest.mark.parametrize("schema_factory", [ProducerUpdate, _register, _admin_create])
def test_contact_email_valid_accepted(schema_factory):
    assert (
        schema_factory(contact_email="owner@example.com").contact_email
        == "owner@example.com"
    )


# --------------------------------------------------------------------------- #
# whatsapp_group — scheme + host guard (Admin/Update only carry the field)
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("schema_factory", [ProducerUpdate, _admin_create])
def test_whatsapp_group_valid_accepted(schema_factory):
    url = "https://chat.whatsapp.com/ABCdef123"
    assert schema_factory(whatsapp_group=url).whatsapp_group == url


@pytest.mark.parametrize(
    "bad",
    [
        "http://chat.whatsapp.com/x",  # wrong scheme
        "https://wa.me/123",  # wrong host
        "https://www.chat.whatsapp.com/x",  # subdomain drift
        "chat.whatsapp.com/x",  # no scheme
        "https://evil.com/chat.whatsapp.com",  # host is evil.com
    ],
)
@pytest.mark.parametrize("schema_factory", [ProducerUpdate, _admin_create])
def test_whatsapp_group_invalid_rejected(schema_factory, bad):
    with pytest.raises(ValidationError):
        schema_factory(whatsapp_group=bad)


def test_whatsapp_group_empty_becomes_none():
    assert ProducerUpdate(whatsapp_group="").whatsapp_group is None
    assert ProducerUpdate(whatsapp_group="   ").whatsapp_group is None


# --------------------------------------------------------------------------- #
# HTTP — PUT /producers/me surfaces the Hebrew 422 (negative API probe)
# --------------------------------------------------------------------------- #
def _detail_text(resp):
    detail = resp.json()["detail"]
    if isinstance(detail, str):
        return detail
    return " · ".join(str(item.get("msg", "")) for item in detail)


def test_put_me_invalid_email_returns_422_hebrew(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"contact_email": "not-an-email"},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text
    assert "כתובת אימייל לא תקינה" in _detail_text(resp)


def test_put_me_invalid_phone_returns_422_hebrew(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me", json={"phone": "12345"}, headers=auth_header(user)
    )
    assert resp.status_code == 422, resp.text
    assert "מספר טלפון לא תקין" in _detail_text(resp)


def test_put_me_invalid_whatsapp_group_returns_422_hebrew(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"whatsapp_group": "https://wa.me/123"},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text
    assert "chat.whatsapp.com" in _detail_text(resp)


def test_put_me_valid_contact_fields_persist(client, db):
    """Regression: a fully valid payload round-trips (200) and stores the
    separator-stripped phone + the email/group as given."""
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={
            "phone": "050-123-4567",
            "contact_email": "owner@example.com",
            "whatsapp_group": "https://chat.whatsapp.com/ABCdef123",
        },
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.phone == "0501234567"
    assert producer.contact_email == "owner@example.com"
    assert producer.whatsapp_group == "https://chat.whatsapp.com/ABCdef123"


def test_put_me_clearing_email_with_empty_string_is_not_422(client, db):
    """The dashboard sends "" for a cleared field — must normalise to None, not 422."""
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me", json={"contact_email": ""}, headers=auth_header(user)
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.contact_email is None
