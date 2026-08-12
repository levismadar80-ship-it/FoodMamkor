"""MEH-1626 chunk 1 — domain types (Pydantic annotated pattern).

Pins the fields that chunk 1 newly brought under validation, one bad input
and one good HEBREW input each. Pure-Pydantic (no DB, no client) — these
assert the schema boundary itself, which is where the types live. Router
behaviour for the same fields is already covered by the existing suites.

The Hebrew "good" half is not decoration: sanitize_text runs bleach, and a
regression that over-strips would silently mangle real Hebrew business data
while every 422 assertion still passed.

Related: backend/app/schemas/schemas.py (the 5 domain types) ·
tests/test_meh1537_contact_validation.py (the phone helper's own pins) ·
tests/test_validation_hardening.py (producer_name, MEH-1623).
"""
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from app.schemas.schemas import (
    EventCreate,
    EventUpdate,
    GroupBuyCreate,
    ProducerLocationCreate,
    ProducerLocationUpdate,
    ProducerRegister,
    UserRegister,
)
from pydantic import ValidationError


def _group_buy(**overrides):
    return {
        "title": "מארז ירקות",
        "product_name": "עגבניות",
        "price_per_unit_regular": Decimal("10"),
        "price_per_unit_group": Decimal("8"),
        "min_participants": 2,
        "deadline": datetime.utcnow() + timedelta(days=7),
        **overrides,
    }


def _event(**overrides):
    return {
        "title": "שוק איכרים",
        "event_date": date.today(),
        "category": "שוק",
        # MEH-2013: EventCreate.city is required now. Fixture only — every
        # test in this file is about title/description sanitisation.
        "city": "תל אביב",
        **overrides,
    }


def _user_register(**overrides):
    return {
        "email": "a@example.com",
        "name": "גל",
        "password": "Zx7Yp9Mq2Lr4",
        **overrides,
    }


# ---------- SanitizedAddressField ----------


def test_location_address_punctuation_only_rejected():
    with pytest.raises(ValidationError):
        ProducerLocationCreate(kind="branch", address="---")


def test_location_address_hebrew_accepted():
    loc = ProducerLocationCreate(kind="branch", address="רחוב הרצל 5")
    assert loc.address == "רחוב הרצל 5"


def test_location_address_strips_html():
    loc = ProducerLocationCreate(kind="branch", address="<b>רחוב הרצל 5</b>")
    assert loc.address == "רחוב הרצל 5"


def test_location_update_address_punctuation_only_rejected():
    with pytest.raises(ValidationError):
        ProducerLocationUpdate(address="...")


def test_location_update_address_omitted_stays_none():
    """The union's None branch must bypass the validator entirely — otherwise
    a partial PATCH that never mentions address would 422."""
    assert ProducerLocationUpdate(city="חיפה").address is None


# ---------- PhoneNumberField ----------


def test_location_phone_garbage_rejected():
    with pytest.raises(ValidationError):
        ProducerLocationCreate(kind="pickup", phone="לא-טלפון")


def test_location_phone_valid_strips_separators():
    loc = ProducerLocationCreate(kind="pickup", phone="050-123-4567")
    assert loc.phone == "0501234567"


def test_location_phone_empty_becomes_none():
    """MEH-1537 convention, preserved verbatim through the type."""
    assert ProducerLocationCreate(kind="pickup", phone="   ").phone is None


def test_location_update_phone_garbage_rejected():
    with pytest.raises(ValidationError):
        ProducerLocationUpdate(phone="abc")


# MEH-1651 removed the two GroupBuyCommitRequest phone tests that sat here.
# The field itself is gone: nothing in the repo ever read the column, so
# MEH-1626's intent — no silently broken WhatsApp link — is served by not
# collecting the number rather than by validating one nobody dials. The other
# validators in this module are untouched.


def test_user_register_phone_garbage_rejected():
    with pytest.raises(ValidationError):
        UserRegister(**_user_register(phone="not-a-phone"))


def test_user_register_phone_valid_accepted():
    assert UserRegister(**_user_register(phone="052-999-8888")).phone == "0529998888"


# ---------- SanitizedTitleField ----------


def test_group_buy_title_punctuation_only_rejected():
    with pytest.raises(ValidationError):
        GroupBuyCreate(**_group_buy(title="???"))


def test_group_buy_title_hebrew_accepted():
    assert GroupBuyCreate(**_group_buy(title="מארז ירקות")).title == "מארז ירקות"


def test_group_buy_title_strips_html():
    assert GroupBuyCreate(**_group_buy(title="<b>מארז ירקות</b>")).title == "מארז ירקות"


def test_event_title_punctuation_only_rejected():
    with pytest.raises(ValidationError):
        EventCreate(**_event(title="!!!"))


def test_event_title_hebrew_accepted():
    assert EventCreate(**_event(title="שוק איכרים")).title == "שוק איכרים"


def test_event_title_strips_html():
    assert EventCreate(**_event(title="<i>שוק איכרים</i>")).title == "שוק איכרים"


def test_event_update_title_punctuation_only_rejected():
    with pytest.raises(ValidationError):
        EventUpdate(title="---")


def test_event_update_title_omitted_stays_none():
    assert EventUpdate(city="חיפה").title is None


# ---------- GroupBuyCreate.description (plain validator, not a 6th type) ----------


def test_group_buy_description_strips_html():
    """bleach(tags=[], strip=True) removes the TAGS and keeps their text — the
    same behaviour every other description field in this module has had since
    MEH-329. Asserted explicitly so nobody later "fixes" it into content
    removal."""
    gb = GroupBuyCreate(**_group_buy(description="<b>תיאור</b> של המארז"))
    assert gb.description == "תיאור של המארז"


# ---------- SanitizedPersonNameField ----------


@pytest.mark.parametrize("short_name", ["גל", "טל", "בר", "רן"])
def test_person_name_two_letter_hebrew_names_accepted(short_name):
    """THE regression guard for this chunk.

    Business names carry a >=3-letter floor; person names must NOT. Two-letter
    Hebrew given names are common and legitimate, so applying the business
    floor here would lock real people out of registration. If someone later
    "unifies" the two name types, this is what goes red.
    """
    assert UserRegister(**_user_register(name=short_name)).name == short_name


def test_person_name_empty_after_sanitize_rejected():
    """users.name is NOT NULL (models.py:387): sanitize returning None must
    raise a 422 here rather than reach the DB as a 500."""
    with pytest.raises(ValidationError):
        UserRegister(**_user_register(name="<b></b>"))


def test_person_name_whitespace_only_rejected():
    with pytest.raises(ValidationError):
        UserRegister(**_user_register(name="   "))


def test_person_name_strips_html_but_keeps_hebrew():
    assert UserRegister(**_user_register(name="<b>שרה לוי</b>")).name == "שרה לוי"


def test_producer_register_person_name_two_letters_accepted():
    """ProducerRegister.name is the account holder, not the business —
    same person-name rule as UserRegister."""
    reg = ProducerRegister(
        email="p@example.com",
        name="גל",
        password="Zx7Yp9Mq2Lr4",
        producer_name="מאפיית שקד",
        category_ids=[1],
        declaration_accepted=True,
    )
    assert reg.name == "גל"


def test_producer_register_person_name_omitted_stays_none():
    """The MEH-143 upgrade path sends no name — the None branch must bypass
    the validator or every upgrade would 422."""
    reg = ProducerRegister(
        producer_name="מאפיית שקד",
        category_ids=[1],
        declaration_accepted=True,
    )
    assert reg.name is None


# ---------- SanitizedBusinessNameField (parity with MEH-1623) ----------


def test_business_name_keeps_three_letter_floor():
    """producer_name's behaviour must be byte-identical to what MEH-1623
    shipped — the floor that person names deliberately lack."""
    with pytest.raises(ValidationError):
        ProducerRegister(
            producer_name="אב",  # 2 letters — business floor rejects
            category_ids=[1],
            declaration_accepted=True,
        )


def test_business_name_hebrew_accepted():
    reg = ProducerRegister(
        producer_name="<b>מאפיית שקד</b>",
        category_ids=[1],
        declaration_accepted=True,
    )
    assert reg.producer_name == "מאפיית שקד"
