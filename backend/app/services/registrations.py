"""
MEH-2763 — shared helpers for «איך נרשמים?» (registration_method) and the
on-site sign-ups it stores.

Purpose:  - registered_counts(): active on-site sign-ups per item, in ONE query
            for a whole list (the list routes would otherwise go N+1);
          - method_problem(): the prerequisite each method needs before an
            owner may pick it — a mobile for whatsapp (a landline opens wa.me
            with no recipient, the bug that started this), a phone for phone,
            a URL for external_url.
Does NOT: decide visibility or capacity (routers/registrations.py does), or
          send anything.
Related:  app/routers/registrations.py, app/routers/events.py,
          app/routers/experiences.py
History:  MEH-2763 (creation)
"""

from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

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
) -> dict | None:
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
