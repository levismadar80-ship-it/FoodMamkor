"""
Module:   experience_sessions
Purpose:  MEH-3441 (stage 2 of MEH-3264) — a recurring workshop's dates. An
          owner lists dates (date + time); places, the waitlist and the
          duplicate check count per date, so a full Friday leaves next Friday
          open and one address can come twice.
Touches:  experiences.sessions (JSONB), registrations.session_date/_time
          (MEH-3440). Reads only, except normalise() which returns the list
          to store.
Does NOT: cancel the sign-ups of a removed date (routers/experiences.py calls
          booking_cancellations.cancel_session_signups); send mail; decide
          whether the workshop is open (routers/registrations.py).
Related:  routers/registrations.py::register_for_experience ·
          routers/experiences.py::update_experience ·
          services/registration_waitlist.py (the `scope` clauses)
History:  MEH-3441 (creation)
"""

from __future__ import annotations

from datetime import date, time
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import Experience, Registration
from app.utils.clock import israel_now, israel_today

# MEH-3022: nothing grows without bound. Twelve upcoming dates covers three
# months of a weekly workshop (Airbnb lets a host schedule further, but a
# list here is typed by hand); a date drops off once it has passed.
SESSION_MAX = 12

Key = tuple[date, time]

_TOO_MANY = f"אפשר להוסיף עד {SESSION_MAX} מועדים קדימה."
_DUPLICATE = "המועד הזה כבר ברשימה."
_PAST = "בחרו תאריך עתידי."
_NEED_ONE = {"code": "registration_session_required", "message": "בחרו מועד."}


def _key(s: dict[str, Any]) -> Key:
    return date.fromisoformat(str(s["date"])), time.fromisoformat(str(s["time"]))


def _started(k: Key) -> bool:
    """A date whose start is now or past, on the Israel clock (MEH-3288)."""
    d, t = k
    today = israel_today()
    return d < today or (d == today and israel_now().time() >= t)


def _stored(s: dict[str, Any]) -> dict[str, Any]:
    d, t = _key(s)
    return {
        "date": d.isoformat(),
        "time": t.strftime("%H:%M"),
        "participants_count": int(s.get("participants_count") or 0),
    }


def has_sessions(ex: Experience) -> bool:
    """Dates decide the places only on a recurring workshop that has some."""
    return bool(ex.is_recurring and ex.sessions)


def upcoming(ex: Experience) -> list[dict[str, Any]]:
    """The dates a visitor can still book, soonest first."""
    if not has_sessions(ex):
        return []
    rows = [_stored(s) for s in ex.sessions or []]  # type: ignore[union-attr]
    return sorted(
        (s for s in rows if not _started(_key(s))), key=lambda s: (s["date"], s["time"])
    )


def find(ex: Experience, d: date | None, t: time | None) -> dict[str, Any] | None:
    """The upcoming date (d, t), or None."""
    if d is None or t is None:
        return None
    want = (d, t.replace(second=0, microsecond=0))
    return next((s for s in upcoming(ex) if _key(s) == want), None)


def require_choice(
    ex: Experience, d: date | None, t: time | None
) -> dict[str, Any] | None:
    """For a sign-up: the chosen date on a workshop with dates (422 when none
    was chosen, 409 when it is not open), or None on a workshop without."""
    if not has_sessions(ex):
        return None
    if d is None or t is None:
        raise HTTPException(status_code=422, detail=_NEED_ONE)
    found = find(ex, d, t)
    if found is None:
        raise HTTPException(
            status_code=409,
            detail={"code": "registration_closed", "message": "ההרשמה סגורה"},
        )
    return found


def scope(d: date | None, t: time | None) -> tuple[Any, ...]:
    """The filter clauses that keep a count or a lookup to one date. Empty
    for a sign-up with no date, which is every row of a workshop without."""
    if d is None:
        return ()
    return (Registration.session_date == d, Registration.session_time == t)


def taken(db: Session, ex: Experience) -> dict[Key, int]:
    """{(date, time): places taken by registered sign-ups (party_size)}."""
    rows = (
        db.query(
            Registration.session_date,
            Registration.session_time,
            func.sum(Registration.party_size),
        )
        .filter(
            Registration.experience_id == ex.id,
            Registration.status == "registered",
            Registration.session_date.isnot(None),
        )
        .group_by(Registration.session_date, Registration.session_time)
        .all()
    )
    return {(d, t): int(n) for d, t, n in rows}


def public_list(db: Session, ex: Experience) -> list[dict[str, Any]]:
    """What the page shows: each upcoming date and its places left (None =
    no cap). The owner's off-site tally of a date shares its cap."""
    out: list[dict[str, Any]] = []
    counts = taken(db, ex) if has_sessions(ex) else {}
    for s in upcoming(ex):
        left = None
        if ex.max_participants is not None:
            used = s["participants_count"] + counts.get(_key(s), 0)
            left = max(int(ex.max_participants) - used, 0)
        out.append({**s, "spots_left": left})
    return out


def normalise(
    new: list[dict[str, Any]], stored: list[dict[str, Any]] | None, cap: int | None
) -> list[dict[str, Any]]:
    """The list to store from what the owner sent. Past dates drop off; a
    NEW date must be in the future (422 «בחרו תאריך עתידי.»), no date twice
    («המועד הזה כבר ברשימה.»), at most SESSION_MAX left («אפשר להוסיף עד 12
    מועדים קדימה.»). A date's off-site tally is clamped to the cap, as the
    workshop's own is (MEH-2663)."""
    old = {_key(s) for s in stored or []}
    seen: set[Key] = set()
    out: list[dict[str, Any]] = []
    for raw in new:
        s = _stored(raw)
        k = _key(s)
        if k in seen:
            raise HTTPException(status_code=422, detail=_DUPLICATE)
        seen.add(k)
        if _started(k):
            if k not in old:
                raise HTTPException(status_code=422, detail=_PAST)
            continue  # a stored date that has passed drops off
        if cap is not None:
            s["participants_count"] = min(s["participants_count"], int(cap))
        out.append(s)
    if len(out) > SESSION_MAX:
        raise HTTPException(status_code=422, detail=_TOO_MANY)
    return sorted(out, key=lambda s: (s["date"], s["time"]))


def removed(
    before: list[dict[str, Any]] | None, after: list[dict[str, Any]]
) -> list[Key]:
    """Upcoming dates that were stored and are gone from `after`."""
    keep = {_key(s) for s in after}
    return [
        _key(s) for s in before or [] if _key(s) not in keep and not _started(_key(s))
    ]


def text(d: date, t: time | None) -> str:
    """«04.12.2026, 10:00» — the date line the emails carry."""
    return d.strftime("%d.%m.%Y") + (f", {t.strftime('%H:%M')}" if t else "")
