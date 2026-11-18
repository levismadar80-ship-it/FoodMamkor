"""
Module:   page_freshness_digest
Purpose:  Once a week (Sunday, Israel clock) email the admin the live pages
          whose owner has not confirmed them for 60+ days, so they reach her
          without her having to remember to open the admin filter.
Touches:  reads producers + users; sends one email via
          app.services.email.send_email (Resend, fail-open). Writes nothing.
Does NOT: email owners (page_freshness.send_freshness_emails); decide what
          "stale" is (page_freshness.stale_clause, the same SQL as the admin
          «לא נבדק יותר מ-60 יום» filter); hold the scheduler (app.startup's
          daily tick calls send_stale_digest, which returns early on any day
          but Sunday).
Related:  backend/app/services/admin_pending_reminder.py (the daily admin
          digest this mirrors: no sent-flag, test rows filtered by the query).
History:  Page freshness (creation, 18/11/2026).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import exists
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Producer, User
from app.services.email import send_email
from app.services.page_freshness import freshness_enabled, stale_clause
from app.utils.clock import ISRAEL_TZ

logger = logging.getLogger(__name__)

# datetime.weekday(): Monday is 0, so Sunday is 6.
DIGEST_WEEKDAY = 6


@dataclass(frozen=True)
class StalePage:
    name: str
    city: str | None
    days: int | None  # since the last confirmation; None = never confirmed
    has_owner_email: bool


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def find_stale(db: Session, now: datetime) -> list[StalePage]:
    """Live, non-test pages past the 60-day line. Never-confirmed first, then
    the longest since the last confirmation."""
    test_owner = exists().where(User.producer_id == Producer.id, User.is_test.is_(True))
    verified_owner = exists().where(
        User.producer_id == Producer.id,
        User.email.isnot(None),
        User.email_verified.is_(True),
        User.is_blocked.isnot(True),
    )
    rows: list[Any] = (
        db.query(
            Producer.name, Producer.city, Producer.last_confirmed_at, verified_owner
        )
        .filter(stale_clause(now), ~test_owner)  # is_business() drops is_test rows
        .all()
    )
    pages = [
        StalePage(
            name=r[0] or "",
            city=r[1],
            days=None if r[2] is None else (now - _aware(r[2])).days,
            has_owner_email=bool(r[3]),
        )
        for r in rows
    ]
    pages.sort(key=lambda p: (p.days is not None, -(p.days or 0), p.name))
    return pages


# ---------------------------------------------------------------------------
# Copy — DRAFT, pending Sapir's word-for-word approval (workflow rule 22).
# ---------------------------------------------------------------------------


def _line(p: StalePage) -> str:
    when = "לא נבדק אף פעם" if p.days is None else f"נבדק לפני {p.days} ימים"
    who = "" if p.has_owner_email else " · אין מייל של בעלים"
    where = f" ({p.city})" if p.city else ""
    return f"- {p.name}{where} — {when}{who}"


def build_email(pages: list[StalePage]) -> tuple[str, str]:
    if len(pages) == 1:
        subject = "מהמקור - עמוד אחד לא נבדק יותר מ-60 יום"
    else:
        subject = f"מהמקור - {len(pages)} עמודים לא נבדקו יותר מ-60 יום"
    body = (
        "בעלי העמודים האלה לא אישרו יותר מ-60 יום שהפרטים נכונים:\n"
        + "\n".join(_line(p) for p in pages)
        + "\n\nכדאי להתקשר אליהם ולוודא שהעמוד עדיין מעודכן.\n"
        + f"לרשימה באדמין: {settings.frontend_url.rstrip('/')}/admin/producers"
    )
    return subject, body


def send_stale_digest(db: Session, now: datetime | None = None) -> int:
    """Send the weekly digest. Returns how many pages were listed.

    Off with the freshness flag; on any day but Sunday (Israel) it does
    nothing; with nothing stale, no email. No sent-flag: the daily tick runs
    once a day, so Sunday sends once."""
    if not freshness_enabled():
        return 0
    now = now or datetime.now(timezone.utc)
    if now.astimezone(ISRAEL_TZ).weekday() != DIGEST_WEEKDAY:
        return 0
    pages = find_stale(db, now)
    if not pages:
        return 0
    if not settings.admin_email:
        logger.warning("[PAGE-FRESHNESS] ADMIN_EMAIL not set — stale digest skipped")
        return 0
    subject, body = build_email(pages)
    send_email(settings.admin_email, subject, body)
    logger.info("[PAGE-FRESHNESS] stale digest sent, %d page(s) listed", len(pages))
    return len(pages)
