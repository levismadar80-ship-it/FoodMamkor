"""
MEH-2763 — shared helpers for «איך נרשמים?» (registration_method) and the
on-site sign-ups it stores.

Purpose:  - registered_counts(): active on-site sign-ups per item, in ONE query
            for a whole list (the list routes would otherwise go N+1);
          - cap_below_signups_problem(): MEH-3310 — the places cannot drop
            below the people already signed up on the site;
          - method_problem(): the prerequisite each method needs before an
            owner may pick it — a mobile for whatsapp (a landline opens wa.me
            with no recipient, the bug that started this), a phone for phone,
            a URL for external_url.
Does NOT: decide visibility or capacity (routers/registrations.py does), or
          send anything.
Related:  app/routers/registrations.py, app/routers/events.py,
          app/routers/experiences.py
History:  MEH-2763 (creation); MEH-3310 (cap_below_signups_problem)
"""

from __future__ import annotations

from typing import Any
from collections.abc import Iterable
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Registration
from app.utils.phone import canonical_il_msisdn


def registered_counts(
    db: Session, *, event_ids: Iterable[UUID] = (), experience_ids: Iterable[UUID] = ()
) -> dict[UUID, int]:
    """{item id: active sign-ups}. Items with none are absent (read as 0)."""
    out: dict[UUID, int] = {}
    for column, ids in (
        (Registration.event_id, list(event_ids)),
        (Registration.experience_id, list(experience_ids)),
    ):
        if not ids:
            continue
        rows = (
            db.query(column, func.count(Registration.id))
            .filter(column.in_(ids), Registration.status == "registered")
            .group_by(column)
            .all()
        )
        out.update({item_id: int(n) for item_id, n in rows})
    return out


def method_problem(
    method: str, *, phone: str | None, registration_url: str | None
) -> dict[str, Any] | None:
    """The 422 detail when `method` cannot work with what the owner has, else
    None. `phone` is the business phone the visitor would be sent to."""
    if method == "whatsapp" and canonical_il_msisdn(phone) is None:
        return {
            "code": "registration_whatsapp_needs_mobile",
            "message": "כדי לבחור WhatsApp צריך מספר נייד בפרטי העסק",
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


def cap_below_signups_problem(
    db: Session,
    *,
    new_max: int | None,
    event_id: UUID | None = None,
    experience_id: UUID | None = None,
) -> dict[str, Any] | None:
    """MEH-3310: the 409 detail when the owner sets fewer places than active
    on-site sign-ups, else None. Lowering it silently would leave registrants
    holding a place that no longer exists."""
    if new_max is None:
        return None
    item_id = event_id or experience_id
    counts = registered_counts(
        db,
        event_ids=[event_id] if event_id else (),
        experience_ids=[experience_id] if experience_id else (),
    )
    signed_up = counts.get(item_id, 0) if item_id else 0
    if new_max >= signed_up:
        return None
    return {
        "code": "max_below_registrations",
        "message": f"כבר נרשמו {signed_up} דרך האתר, ולכן מספר המקומות לא יכול להיות קטן מ-{signed_up}",
        "params": {"registered": signed_up},
    }


def refuse_cap_below_signups(
    db: Session,
    payload: dict[str, Any],
    *,
    event_id: UUID | None = None,
    experience_id: UUID | None = None,
) -> None:
    """MEH-3310: 409 when an edit's ``max_participants`` is below the active
    on-site sign-ups. An edit that does not touch the cap is never checked."""
    # An edit that also cancels the item cancels every sign-up with it
    # (MEH-3227), so its places no longer have anyone to strand.
    if "max_participants" not in payload or payload.get("is_active") is False:
        return
    problem = cap_below_signups_problem(
        db,
        new_max=payload["max_participants"],
        event_id=event_id,
        experience_id=experience_id,
    )
    if problem:
        raise HTTPException(status_code=409, detail=problem)
