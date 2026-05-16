"""MEH-556 — Extend MEH-555 letter validation to 3 sibling fields.

Schema-layer tests for ProducerCreate.name, HomeProductCreate.title,
ExperienceCreate.title — all must reject strings with fewer than
3 Hebrew/Latin letter characters.

Pure Pydantic tests: no HTTP, no DB, no auth fixtures required.
"""
import pytest
from datetime import date

from pydantic import ValidationError

from app.schemas.schemas import ExperienceCreate, HomeProductCreate, ProducerCreate


# ---------- ProducerCreate.name ----------


def test_producer_name_junk_rejected():
    """'???' has 0 letter chars → ValidationError."""
    with pytest.raises(ValidationError):
        ProducerCreate(name="???")


def test_producer_name_valid_accepted():
    """'מאפיית רחל' has many letter chars → valid."""
    obj = ProducerCreate(name="מאפיית רחל")
    assert obj.name == "מאפיית רחל"


# ---------- HomeProductCreate.title ----------


def test_home_product_title_junk_rejected():
    """'???' has 0 letter chars → ValidationError."""
    with pytest.raises(ValidationError):
        HomeProductCreate(title="???")


def test_home_product_title_valid_accepted():
    """'לחם שיפון' has letter chars → valid."""
    obj = HomeProductCreate(title="לחם שיפון")
    assert obj.title == "לחם שיפון"


# ---------- ExperienceCreate.title ----------


def test_experience_title_junk_rejected():
    """'!?!?' has 0 letter chars → ValidationError (letter check beats min_length=4)."""
    with pytest.raises(ValidationError):
        ExperienceCreate(
            title="!?!?",
            description="תיאור ארוך מספיק עבור הוולידציה של השדה",
            event_date=date(2026, 12, 1),
            location_type="home",
        )


def test_experience_title_valid_accepted():
    """'סדנת אפייה' has letter chars → valid."""
    obj = ExperienceCreate(
        title="סדנת אפייה",
        description="תיאור ארוך מספיק עבור הוולידציה של השדה",
        event_date=date(2026, 12, 1),
        location_type="home",
    )
    assert obj.title == "סדנת אפייה"
