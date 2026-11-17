"""
Module:   date_rules
Purpose:  One rule for "an event or experience date may not be in the past"
          (D6 of the 14/11 grill retro, MEH-3224), read by both routers.
Touches:  nothing — pure.
Does NOT: check group buys (group_buys.py already refuses a past deadline) or
          hide past items (the listings filter on event_date >= today).
Related:  backend/app/routers/events.py create_event / update_event ·
          backend/app/routers/experiences.py submit_experience /
          update_experience · app/utils/clock.py::israel_today
History:  MEH-3224 (creation)
"""

from datetime import date

from fastapi import HTTPException

from app.utils.clock import israel_today

# Sapir approves this wording (copy table, 14/11). Gender-neutral (ADR-037).
PAST_DATE_DETAIL = "התאריך כבר עבר. יש לבחור תאריך מהיום והלאה"


def past_date_problem(
    new_date: date | None, old_date: date | None = None
) -> str | None:
    """The Hebrew 422 detail when ``new_date`` is before today in Israel.

    ``old_date`` is the stored value on an edit: re-sending the date an event
    already has is not a change, so an edit to a past event's title still
    saves (the dashboard form re-sends every field). Today is allowed — an
    event later this evening is a real event.
    """
    if new_date is None or new_date == old_date:
        return None
    return PAST_DATE_DETAIL if new_date < israel_today() else None


def refuse_past_date(new_date: date | None, old_date: date | None = None) -> None:
    """``past_date_problem`` as the routers use it: raise the 422, or return."""
    problem = past_date_problem(new_date, old_date)
    if problem:
        raise HTTPException(status_code=422, detail=problem)
