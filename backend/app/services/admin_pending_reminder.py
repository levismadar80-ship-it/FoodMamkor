"""
Module:   admin_pending_reminder
Purpose:  Once a morning, email the admin a list of the businesses that have
          waited for approval 2 business days or more. The owner was told
          «תשובה עד 3 ימי עסקים»; this is the nudge before that promise breaks.
Touches:  reads producers + users; sends one email via
          app.services.email.send_email (Resend, fail-open). Writes nothing.
Does NOT: decide aging (that is app.utils.clock.business_days_waiting, the same
          function the admin queue badge uses); hold the scheduler (that is
          app.startup); WhatsApp (no reminder template — email only).
Related:  backend/app/routers/admin.py:_attach_aging (same anchor COALESCE),
          backend/app/services/pending_nudge.py (the owner-side sibling).
History:  MEH-3147 (creation, 14/11/2026 — copy approved by Sapir that day).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import cast

from sqlalchemy import exists
from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import Producer, User
from app.services.email import send_email
from app.utils.clock import business_days_waiting

logger = logging.getLogger(__name__)

# The owner is promised an answer within 3 business days; remind at 2, so the
# admin still has a day in hand.
REMINDER_THRESHOLD_DAYS = 2


@dataclass(frozen=True)
class WaitingBusiness:
    name: str
    city: str | None
    days: int


def find_overdue(db: Session, *, now: datetime | None = None) -> list[WaitingBusiness]:
    """Pending, non-test businesses waiting >= REMINDER_THRESHOLD_DAYS.

    Oldest first. The anchor is `resubmitted_at or submitted_for_review_at or
    created_at`, exactly as `_attach_aging` computes the admin badge, so the
    email and the queue never disagree about a number.
    """
    test_owner = exists().where(User.producer_id == Producer.id, User.is_test.is_(True))
    rows = (
        db.query(Producer)
        .filter(Producer.status == "pending")
        .filter(Producer.is_test.is_(False))
        .filter(~test_owner)
        .all()
    )
    # Producer is a legacy Column-typed model; mypy sees Column[...] on the
    # instance, so the values are cast to what SQLAlchemy actually returns.
    waiting = [
        WaitingBusiness(
            name=cast(str, p.name),
            city=cast("str | None", p.city),
            days=business_days_waiting(
                cast(
                    "datetime | None",
                    p.resubmitted_at or p.submitted_for_review_at or p.created_at,
                ),
                now=now,
            ),
        )
        for p in rows
    ]
    overdue = [w for w in waiting if w.days >= REMINDER_THRESHOLD_DAYS]
    overdue.sort(key=lambda w: (-w.days, w.name))
    return overdue


def build_email(overdue: list[WaitingBusiness]) -> tuple[str, str]:
    """(subject, body) — copy approved word for word by Sapir, 14/11/2026."""
    if len(overdue) == 1:
        subject = "מהמקור - בית עסק אחד מחכה לאישור יותר מיומיים"
    else:
        subject = f"מהמקור - {len(overdue)} בתי עסק מחכים לאישור יותר מיומיים"
    lines = [
        f"- {w.name} ({w.city or 'לא צוין'}) — {w.days} ימי עסקים" for w in overdue
    ]
    body = (
        "בתי העסק האלה מחכים לאישור 2 ימי עסקים או יותר:\n"
        + "\n".join(lines)
        + "\n\nהבטחנו להם תשובה עד 3 ימי עסקים.\n"
        + f"לבדיקה ולאישור: {settings.frontend_url}/admin/producers"
    )
    return subject, body


def send_admin_pending_reminder(db: Session, *, now: datetime | None = None) -> int:
    """Send the reminder if anything is overdue. Returns how many were listed.

    Zero overdue → no email at all. No sent-flag: the email repeats every
    morning while a business keeps waiting, which is the point.
    """
    overdue = find_overdue(db, now=now)
    if not overdue:
        return 0
    if not settings.admin_email:
        logger.warning("[ADMIN-REMINDER] ADMIN_EMAIL not set — reminder skipped")
        return 0
    subject, body = build_email(overdue)
    send_email(settings.admin_email, subject, body)
    logger.info("[ADMIN-REMINDER] sent, %d business(es) listed", len(overdue))
    return len(overdue)
