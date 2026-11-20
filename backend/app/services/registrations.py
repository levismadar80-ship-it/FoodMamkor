"""
MEH-2763 — shared helpers for «איך נרשמים?» (registration_method) and the
on-site sign-ups it stores.

Purpose:  - registered_counts(): active on-site sign-ups per item, in ONE query
            for a whole list (the list routes would otherwise go N+1);
          - refuse_too_few_places(): MEH-2871 — the places cannot drop
            below the people already signed up on the site (MEH-3310: a
            cancelling edit is exempt);
          - method_problem(): the prerequisite each method needs before an
            owner may pick it — a mobile for whatsapp (a landline opens wa.me
            with no recipient, the bug that started this), a phone for phone,
            a URL for external_url.
Does NOT: decide visibility or capacity (routers/registrations.py does), or
          send anything.
Related:  app/routers/registrations.py, app/routers/events.py,
          app/routers/experiences.py
History:  MEH-2763 (creation); MEH-3310 + MEH-2871 (one cap rule, 422)
"""

from __future__ import annotations

from typing import Any
from collections.abc import Iterable
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models import Registration
from app.utils.clock import israel_today
from app.utils.phone import canonical_il_msisdn


def registered_counts(
    db: Session, *, event_ids: Iterable[UUID] = (), experience_ids: Iterable[UUID] = ()
) -> dict[UUID, int]:
    """{item id: places taken by active sign-ups (sum of party_size)} — on
    a workshop with dates, its fullest upcoming date (MEH-3441). Items
    with none are absent (read as 0)."""
    out: dict[UUID, int] = {}
    for column, ids in (
        (Registration.event_id, list(event_ids)),
        (Registration.experience_id, list(experience_ids)),
    ):
        if not ids:
            continue
        rows = (
            # MEH-3315: a sign-up takes party_size places, not one.
            # MEH-3441: per occasion — a recurring workshop's dates each
            # have the cap, so its load is its fullest upcoming date; a
            # date that has passed holds no places. Undated rows (every
            # event, every workshop without dates) are one occasion, as
            # before.
            db.query(
                column,
                Registration.session_date,
                Registration.session_time,
                func.sum(Registration.party_size),
            )
            .filter(
                column.in_(ids),
                Registration.status == "registered",
                or_(
                    Registration.session_date.is_(None),
                    Registration.session_date >= israel_today(),
                ),
            )
            .group_by(column, Registration.session_date, Registration.session_time)
            .all()
        )
        for item_id, _d, _t, n in rows:
            out[item_id] = max(out.get(item_id, 0), int(n))
    return out


def refuse_too_few_places(
    db: Session,
    changes: dict[str, Any],
    *,
    event_id: UUID | None = None,
    experience_id: UUID | None = None,
    stored_max: Any = None,
) -> None:
    """MEH-2871 (Sapir 18/11): a host may not set fewer places than the
    sign-ups already taken — the extra sign-ups had no way out. Eventbrite and
    Meetup refuse the same edit. Only an edit that sends ``max_participants``
    is checked; None (unlimited) is always allowed. A value equal to the
    stored one is not a change — the forms re-send every field on each save,
    and a row cut below its sign-ups before this rule must stay editable."""
    new_max = changes.get("max_participants")
    if new_max is None or new_max == stored_max:
        return
    # MEH-3310: an edit that also cancels the item cancels every sign-up with
    # it (MEH-3227), so its places no longer have anyone to strand.
    if changes.get("is_active") is False:
        return
    item_id = event_id or experience_id
    counts = registered_counts(
        db,
        event_ids=[event_id] if event_id else (),
        experience_ids=[experience_id] if experience_id else (),
    )
    taken = counts.get(item_id, 0) if item_id else 0
    if int(new_max) < taken:
        raise HTTPException(
            status_code=422,
            detail=f"כבר נרשמו {taken}, ולכן אי אפשר להגדיר פחות מקומות מזה.",
        )


def method_problem(
    method: str, *, phone: str | None, registration_url: str | None
) -> dict[str, Any] | None:
    """The 422 detail when `method` cannot work with what the owner has, else
    None. `phone` is the business phone the visitor would be sent to."""
    if method == "whatsapp" and canonical_il_msisdn(phone) is None:
        return {
            "code": "registration_whatsapp_needs_mobile",
            "message": "כדי לבחור וואטסאפ צריך מספר נייד בפרטי העסק",
        }
    if method == "phone" and not (phone or "").strip():
        return {
            "code": "registration_phone_needs_phone",
            "message": "כדי לבחור טלפון צריך מספר טלפון בפרטי העסק",
        }
    if method == "external_url" and not (registration_url or "").strip():
        return {
            "code": "registration_external_needs_url",
            "message": "צריך להוסיף קישור הרשמה",
        }
    return None
