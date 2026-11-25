"""
Module:   cities_match (schemas)
Purpose:  Body and answer of POST /cities/match — a pasted list of city names
          checked against the canonical city list in one request (MEH-3867).
Does NOT: write anything. The caller adds the matched names to its own form
          and saves through its usual route.
Related:  app/routers/cities.py (match_cities)
History:  MEH-3867 (creation)
"""

from typing import Annotated

from pydantic import BaseModel, Field

# A business's delivery list is the longest list anyone pastes (82 for חוות
# הפרא, 25/11). 300 leaves room for a whole district without letting one
# request carry an unbounded list (MEH-3022).
MAX_PASTED_CITIES = 300


class CitiesMatchIn(BaseModel):
    """The names as pasted, already split by the client."""

    names: list[Annotated[str, Field(max_length=100)]] = Field(
        max_length=MAX_PASTED_CITIES
    )


class CitiesMatchOut(BaseModel):
    """Known names in their canonical spelling, and the rest as typed."""

    matched: list[str]
    unmatched: list[str]
