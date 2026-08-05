"""MEH-1626 chunk 3 — items 2 and 3, the two intentional behaviour changes.

Item 2: ProducerCreate.name gains bleach (it had the >=3-letter floor but no
sanitize, unlike its two siblings). Found in review of chunk 2; invisible to
the asymmetry scan, which tests presence of a validator rather than
equivalence of rule.

Item 3: _url_scheme_validator normalizes empty input to None instead of "",
aligning every schema that shares it with the MEH-1537 convention already
followed by contact_email / phone / whatsapp_group.

Both are deliberate behaviour changes, so each gets an explicit pin rather
than riding on the guard.
"""
import pytest
from app.schemas.schemas import (
    OutreachLeadCreate,
    OutreachLeadUpdate,
    ProducerAdminCreate,
    ProducerCreate,
    ProducerRegister,
    ProducerUpdate,
)
from pydantic import ValidationError


def _producer_create(**over):
    return ProducerCreate(**{"name": "מאפיית שקד", "category_ids": [1], **over})


# ---------- Item 2: ProducerCreate.name ----------


def test_producer_create_name_html_wrapping_short_name_is_422():
    """THE pin the chunk-3 brief named.

    Before this change "<b>אב</b>" was ACCEPTED: the floor ran on the raw
    string, where the ASCII tag letters (b, b) counted toward the >=3-letter
    requirement alongside the 2 Hebrew ones. Bleaching first leaves "אב" — 2
    letters — so it now correctly 422s. Markup can no longer pad the floor.
    """
    with pytest.raises(ValidationError):
        _producer_create(name="<b>אב</b>")


def test_producer_create_name_is_bleached():
    assert _producer_create(name="<b>מאפיית שקד</b>").name == "מאפיית שקד"


def test_producer_create_name_matches_its_siblings_exactly():
    """The point of item 2: three write paths for the same column must agree.
    A future divergence on any one of them turns this red."""
    raw = "<b>מאפיית שקד</b>"
    assert (
        _producer_create(name=raw).name
        == ProducerAdminCreate(name=raw).name
        == ProducerUpdate(name=raw).name
        == "מאפיית שקד"
    )


def test_producer_create_name_keeps_meh229_length_semantics():
    """MEH-229: over-length must be a clean 422, never a DB-level 500. The
    domain type's validator never returns None (the floor raises), so the
    outer Field(max_length=200) is safe here and still fires."""
    with pytest.raises(ValidationError):
        _producer_create(name="א" * 250)


def test_producer_create_name_accepts_a_normal_hebrew_business_name():
    assert _producer_create(name="חוות הזית").name == "חוות הזית"


# ---------- Item 3: website ""->None ----------


@pytest.mark.parametrize(
    "factory",
    [
        lambda v: OutreachLeadCreate(name="ליד בדיקה", website=v),
        lambda v: OutreachLeadUpdate(website=v),
        lambda v: ProducerUpdate(website=v),
        lambda v: ProducerCreate(name="מאפיית שקד", category_ids=[1], website=v),
        lambda v: ProducerAdminCreate(name="מאפיית שקד", website=v),
    ],
    ids=[
        "OutreachLeadCreate",
        "OutreachLeadUpdate",
        "ProducerUpdate",
        "ProducerCreate",
        "ProducerAdminCreate",
    ],
)
def test_empty_website_normalizes_to_none_everywhere(factory):
    """Every schema sharing _url_scheme_validator inherits the change — that
    is why item 3 was applied at the validator rather than per field."""
    assert factory("").website is None
    assert factory("   ").website is None


@pytest.mark.parametrize(
    "factory",
    [
        lambda v: OutreachLeadCreate(name="ליד בדיקה", website=v),
        lambda v: ProducerUpdate(website=v),
    ],
    ids=["OutreachLeadCreate", "ProducerUpdate"],
)
def test_valid_url_still_round_trips(factory):
    assert factory("https://example.com").website == "https://example.com"


def test_producer_register_website_also_normalizes():
    """ProducerRegister uses the decorator form of the same validator, so it
    must inherit the change too — the whole point of fixing it in one place."""
    reg = ProducerRegister(
        producer_name="מאפיית שקד",
        category_ids=[1],
        declaration_accepted=True,
        website="",
    )
    assert reg.website is None


def test_bad_scheme_still_rejected():
    """Regression floor: normalizing empty input must not weaken the scheme
    guard itself."""
    with pytest.raises(ValidationError):
        OutreachLeadCreate(name="ליד בדיקה", website="ftp://example.com")


# ---------- the 5 fields the family guard surfaced ----------


def test_guard_surfaced_fields_are_now_validated():
    """contact_name / top_product_name / product_name were invisible to the
    asymmetry scan because BOTH siblings were unvalidated — symmetric, so
    nothing to compare. The family-based guard is what found them."""
    assert ProducerUpdate(contact_name="<b>שרה לוי</b>").contact_name == "שרה לוי"
    assert (
        ProducerAdminCreate(name="מאפיית שקד", top_product_name="<b>חלה</b>").top_product_name
        == "חלה"
    )
    with pytest.raises(ValidationError):
        ProducerUpdate(contact_name="   ")
