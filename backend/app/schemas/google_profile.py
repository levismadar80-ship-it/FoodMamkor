"""
Module:   google_profile (schemas)
Purpose:  Response shapes for the owner's «הפרופיל שלכם בגוגל» tool (MEH-3641).
Does NOT: the request body — the link/unlink PUT reuses GooglePlaceIdIn
          (schemas/producer_out.py), the same normalisation the admin uses.
Related:  app/routers/producer_google_profile.py · app/services/google_profile.py
History:  MEH-3641 (creation)
"""

from typing import Literal

from pydantic import BaseModel

Verdict = Literal["same", "different", "missing"]


class GoogleProfileStatusOut(BaseModel):
    available: bool  # the server has a Places key
    google_place_id: str | None = None


class GoogleProfileCandidate(BaseModel):
    place_id: str
    display_name: str | None = None
    formatted_address: str | None = None


class GoogleProfileCandidatesOut(BaseModel):
    candidates: list[GoogleProfileCandidate]


class GoogleProfileRow(BaseModel):
    field: Literal["name", "phone", "website"]
    ours: str | None = None
    google: str | None = None
    verdict: Verdict


class GoogleProfileCheckOut(BaseModel):
    rows: list[GoogleProfileRow]
    # Shown side by side, no verdict: two free-text formats do not compare.
    hours_ours: str | None = None
    hours_google: list[str] = []
