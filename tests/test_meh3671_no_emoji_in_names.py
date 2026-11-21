"""
Module:   test_meh3671_no_emoji_in_names
Purpose:  A name or title a person types is refused (422, Hebrew message) when
          it carries an emoji (Sapir 22/11, «רק בשמות ובכותרות»). Descriptions
          and other free text are not checked. Typographic marks pass.
Related:  backend/app/schemas/schemas.py (reject_emoji and the three shared
          name/title validators); the per-class _sanitize_title in
          community.py, experiences.py, recipes_outreach.py.
History:  MEH-3671 (sub-issue of MEH-3668).
"""

import pytest
from pydantic import TypeAdapter, ValidationError

from app.schemas.community import HomeProductCreate, HomeProductUpdate
from app.schemas.experiences import ExperienceCreate, ExperienceUpdate
from app.schemas.recipes_outreach import ProducerRecipeCreate, ProducerRecipeUpdate
from app.schemas.schemas import (
    NO_EMOJI_IN_NAME_MSG,
    SanitizedBusinessNameField,
    SanitizedLabelField,
    SanitizedPersonNameField,
    SanitizedTitleField,
)
from tests.conftest import valid_user_register_payload

EMOJI_NAMES = ["משק הגפן 🌿", "❤️ מאפייה", "בית 👨‍👩‍👧 אוכל", "מנה 1️⃣ טובה", "▶️ סדנת לחם"]
FIELDS = {
    "business": SanitizedBusinessNameField,
    "label": SanitizedLabelField,
    "person": SanitizedPersonNameField,
    "title": SanitizedTitleField,
}


@pytest.mark.parametrize("kind", FIELDS)
@pytest.mark.parametrize("value", EMOJI_NAMES)
def test_a_name_or_title_with_an_emoji_is_refused(kind, value):
    with pytest.raises(ValidationError) as exc:
        TypeAdapter(FIELDS[kind]).validate_python(value)
    assert NO_EMOJI_IN_NAME_MSG in str(exc.value)


@pytest.mark.parametrize("kind", FIELDS)
def test_typography_and_clean_names_pass_unchanged(kind):
    value = "גבינות ★ הכפר ✓ ™ ₪45 (בע״מ) – ‘טבעי’"
    assert TypeAdapter(FIELDS[kind]).validate_python(value) == value


@pytest.mark.parametrize(
    "model",
    [
        HomeProductCreate,
        HomeProductUpdate,
        ExperienceCreate,
        ExperienceUpdate,
        ProducerRecipeCreate,
        ProducerRecipeUpdate,
    ],
    ids=lambda m: m.__name__,
)
def test_the_per_class_title_validators_refuse_emoji(model):
    # Other required fields are left out on purpose: pydantic reports every
    # field, and the assertion is about the title error alone.
    with pytest.raises(ValidationError) as exc:
        model.model_validate({"title": "סדנת לחם 🌿 בכפר"})
    title_errors = [e for e in exc.value.errors() if e["loc"] == ("title",)]
    assert title_errors and NO_EMOJI_IN_NAME_MSG in title_errors[0]["msg"]


def test_description_is_not_checked():
    # The decision covered names and titles only.
    with pytest.raises(ValidationError) as exc:
        HomeProductCreate.model_validate({"title": "x", "description": "טעים 😋"})
    assert not [e for e in exc.value.errors() if e["loc"] == ("description",)]


def test_register_with_an_emoji_name_answers_422_in_hebrew(client):
    body = valid_user_register_payload() | {"name": "דנה 🌸"}
    res = client.post("/auth/register", json=body)
    assert res.status_code == 422
    assert NO_EMOJI_IN_NAME_MSG in res.text


def test_register_with_a_clean_name_still_works(client):
    res = client.post("/auth/register", json=valid_user_register_payload())
    assert res.status_code in (200, 201)


def test_an_outreach_lead_name_drops_its_emoji_instead_of_failing():
    # Admins paste lead names from a real sheet; the name later prefills the
    # owner's sign-up form, which would refuse it with the emoji still on.
    from app.schemas.recipes_outreach import OutreachLeadCreate, OutreachLeadUpdate

    assert OutreachLeadCreate(name="🍞 לחם אלחנן").name == "לחם אלחנן"
    assert OutreachLeadUpdate(name="מאפייה ❤️ שלנו").name == "מאפייה שלנו"
    assert OutreachLeadCreate(name="LIVNEY'S").name == "LIVNEY'S"
