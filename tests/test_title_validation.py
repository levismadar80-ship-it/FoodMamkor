"""HOT-003 (MEH-772): stacked title validators must never raise 500.

Root cause: `_sanitize_title` (a `@field_validator` on `title`) returns
`None` for input that bleach reduces to empty — e.g. ``"<b></b>"`` or a
whitespace-only string. The second stacked validator
`_validate_title_letters` then called `_min_letters_validator(None)` →
`None.strip()` → ``AttributeError`` → HTTP 500, instead of a clean
Pydantic ``ValidationError`` → HTTP 422.

Validators run in definition order (Pydantic v2), so the sanitizer always
runs before the letter-count check. The fix makes `_min_letters_validator`
null-safe so an empty-after-sanitize title is rejected with the existing
Hebrew error key (422), never a 500.

Affected schemas (both validators stacked on `title`): HomeProductCreate,
ExperienceCreate, ProducerRecipeBase.
"""
import datetime

import pytest
from pydantic import ValidationError

from app.schemas.schemas import (  # noqa: E402
    ExperienceCreate,
    HomeProductCreate,
    ProducerRecipeBase,
    _min_letters_validator,
)


# --- root-cause unit test (red before the fix: raises AttributeError) ---
def test_min_letters_validator_handles_none():
    """None must raise a clean ValueError (→422), not AttributeError (→500)."""
    with pytest.raises(ValueError):
        _min_letters_validator(None)


# --- the failing input class: non-empty raw, but sanitizes to empty/None ---
@pytest.mark.parametrize("bad", ["<b></b>", "<p></p>", "   "])
def test_home_product_title_empty_after_sanitize_is_422(bad):
    with pytest.raises(ValidationError):
        HomeProductCreate(title=bad)


@pytest.mark.parametrize("bad", ["<b></b>", "<p></p>"])
def test_experience_title_empty_after_sanitize_is_422(bad):
    # len>=4 raw passes Field(min_length=4); the crash was downstream.
    with pytest.raises(ValidationError):
        ExperienceCreate(
            title=bad,
            description="x" * 25,
            event_date=datetime.date(2030, 1, 1),
        )


@pytest.mark.parametrize("bad", ["<b></b>", "<p></p>", "   "])
def test_recipe_title_empty_after_sanitize_is_422(bad):
    with pytest.raises(ValidationError):
        ProducerRecipeBase(
            title=bad,
            ingredients="x" * 15,
            instructions="y" * 15,
        )


# --- punctuation-only also 422 (already worked; regression guard) ---
def test_punctuation_only_title_is_422():
    with pytest.raises(ValidationError):
        HomeProductCreate(title="???")


# --- valid titles stay valid; sanitized value preserved ---
def test_valid_titles_pass():
    hp = HomeProductCreate(title="עוגת שוקולד")
    assert hp.title == "עוגת שוקולד"

    exp = ExperienceCreate(
        title="סדנת אפייה",
        description="x" * 25,
        event_date=datetime.date(2030, 1, 1),
    )
    assert exp.title == "סדנת אפייה"

    rec = ProducerRecipeBase(
        title="מתכון עוגה",
        ingredients="x" * 15,
        instructions="y" * 15,
    )
    assert rec.title == "מתכון עוגה"
