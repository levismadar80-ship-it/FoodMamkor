"""
Module:   course_meetings
Purpose:  MEH-3898 — a course: one experience that meets several times (a
          5-meeting cheese-making course), with ONE sign-up for all of them.
          Checks the meetings an owner sends and returns the list to store.
Touches:  experiences.course_meetings (JSONB). Pure: no query, no write.
Does NOT: hold places or sign-ups — a course signs up like a one-off
          experience against event_date / event_time, which the router sets
          to the first meeting, so sign-ups close when the first meeting
          starts (routers/registrations.py, MEH-3288). Does NOT handle the
          alternative dates of a recurring workshop, where each date signs
          up on its own (services/experience_sessions.py).
Related:  routers/experiences.py::submit_experience_for, ::_course_edit ·
          schemas/experiences.py::CourseMeetingIn
History:  MEH-3898 (creation)
"""

from __future__ import annotations

from datetime import date, time
from typing import Any

from fastapi import HTTPException

# REUSES: services/experience_sessions.py — the same «started» on the Israel clock.
from app.services.experience_sessions import _started

# MEH-3022: nothing grows without bound. A weekly course of five months.
MEETINGS_MIN = 2
MEETINGS_MAX = 20

Key = tuple[date, time]

_TOO_FEW = f"בקורס יש לפחות {MEETINGS_MIN} מפגשים."
_TOO_MANY = f"אפשר להוסיף עד {MEETINGS_MAX} מפגשים לקורס."
_DUPLICATE = "המפגש הזה כבר ברשימה."
_PAST = "בחרו תאריך עתידי."
_WITH_RECURRING = "קורס לא יכול להיות גם חוויה חוזרת."


def _meeting_key(m: dict[str, Any]) -> Key:
    t = time.fromisoformat(str(m["time"])).replace(second=0, microsecond=0)
    return date.fromisoformat(str(m["date"])), t


def normalise_meetings(
    new: list[dict[str, Any]], stored: list[dict[str, Any]] | None
) -> list[dict[str, Any]] | None:
    """The meetings to store, soonest first, or None for "not a course"
    (an empty list). A NEW meeting must be in the future; a stored one that
    has passed stays, so a running course keeps its whole list. No meeting
    twice, between MEETINGS_MIN and MEETINGS_MAX."""
    if not new:
        return None
    old = {_meeting_key(m) for m in stored or []}
    seen: set[Key] = set()
    for raw in new:
        k = _meeting_key(raw)
        if k in seen:
            raise HTTPException(status_code=422, detail=_DUPLICATE)
        seen.add(k)
        if k not in old and _started(k):
            raise HTTPException(status_code=422, detail=_PAST)
    if len(seen) < MEETINGS_MIN:
        raise HTTPException(status_code=422, detail=_TOO_FEW)
    if len(seen) > MEETINGS_MAX:
        raise HTTPException(status_code=422, detail=_TOO_MANY)
    return [
        {"date": d.isoformat(), "time": t.strftime("%H:%M")} for d, t in sorted(seen)
    ]


def first(meetings: list[dict[str, Any]]) -> Key:
    """The first meeting — the course's event_date / event_time."""
    return _meeting_key(meetings[0])


def refuse_with_recurring(is_course: bool, is_recurring: bool | None) -> None:
    """A course signs up once; a recurring workshop signs up per date. The
    two cannot be one experience (422)."""
    if is_course and is_recurring:
        raise HTTPException(status_code=422, detail=_WITH_RECURRING)


def meetings_out(meetings: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    """The stored meetings as the page shows them ([] = not a course)."""
    return [{"date": str(m["date"]), "time": str(m["time"])} for m in meetings or []]
