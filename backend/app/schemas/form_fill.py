# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3740 PR)
"""
Module:   form_fill (schemas)
Purpose:  The shared «fill the form from text» route (MEH-3740): the owner's
          free text in, a draft of one dashboard form out. Nothing is saved.
Does NOT: validate the draft as a write — the owner's approved fields go
          through the form's own route (recipes: POST/PATCH
          /producers/me/recipes) with its validation and moderation.
Related:  app/services/form_filler.py · app/routers/form_fill.py ·
          app/schemas/page_fill.py (same text limits)
History:  MEH-3740 (creation)
"""

from pydantic import BaseModel

from app.schemas.page_fill import PageFillIn

# REUSES: schemas/page_fill.py — the same 20–6,000 characters and the same
# stripped-text validator; the screen keeps the button off under 20.
FormFillIn = PageFillIn


class FormFillOut(BaseModel):
    """Field key -> value. A field the text does not state is null, or an
    empty list for a list field; the form decides which keys it reads."""

    form: str
    draft: dict[str, str | int | list[str] | None]
