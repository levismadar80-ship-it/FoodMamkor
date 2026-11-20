# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3483 PR)
"""
Module:   page_fill (schemas)
Purpose:  «ספרו לנו על העסק» (MEH-3483): the owner's free text in, a draft of
          the business-page fields out. Nothing is saved by the read.
Does NOT: validate the draft as a write — the owner's approved fields go
          through PUT /producers/me (ProducerUpdate), the same validation as
          the edit cards.
Related:  app/services/page_filler.py · app/routers/page_fill.py
History:  MEH-3483 (creation)
"""

from pydantic import BaseModel, Field, field_validator

from app.limits import MAX_DELIVERY_CITIES, MAX_SMALL_LIST

TEXT_MIN = 20
TEXT_MAX = 6000


class PageFillIn(BaseModel):
    text: str = Field(..., max_length=TEXT_MAX)

    @field_validator("text")
    @classmethod
    def _enough_text(cls, v: str) -> str:
        v = v.strip()
        if len(v) < TEXT_MIN:
            raise ValueError("כתבו עוד כמה מילים על העסק")
        return v


class PageDraft(BaseModel):
    """Every field is optional: what the text does not say stays None."""

    description: str | None = None
    category_ids: list[int] = Field(default_factory=list, max_length=MAX_SMALL_LIST)
    delivery_cities: list[str] = Field(
        default_factory=list, max_length=MAX_DELIVERY_CITIES
    )
    # The `opening_hours` grammar: "Sun-Thu 09:00-18:00, Fri 09:00-13:00".
    opening_hours: str | None = None
    phone: str | None = None
    instagram: str | None = None
    facebook: str | None = None
    website: str | None = None
    contact_email: str | None = None
    primary_contact_method: str | None = None


class PageFillOut(BaseModel):
    draft: PageDraft
