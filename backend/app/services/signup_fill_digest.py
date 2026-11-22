"""
Module:   signup_fill_digest
Purpose:  Once a week (Sunday, Israel clock) check what share of the
          businesses that signed up in the last 7 days have a referral source
          («מאיפה שמעתם») and a location, and email the admin ONLY when a share
          is zero over enough signups (Sapir 22/11: «רק כשיש אזהרה»), so a
          field that stops arriving is noticed in days, not months.
Touches:  reads producers and users (+ locations / delivery areas through
          the submission gate); sends at most one email via app.services.email.send_email
          (Resend, fail-open). Writes nothing.
Does NOT: decide what "has a location" means: that is
          services/submission_gate.py (MISSING_LOCATION), the same rule the
          submit gate and the dashboard checklist use. Hold the scheduler:
          app.startup's daily tick calls send_signup_fill_digest, which
          returns early on any day but Sunday.
Related:  backend/app/services/page_freshness_digest.py (the weekly admin
          digest this mirrors); frontend/lib/signup-field-homes.json (the
          guard on the form side of the same question).
History:  MEH-3699 (creation): MEH-3656 removed the referral question from the
          business signup and nothing noticed until Sapir asked (MEH-3697).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import settings
from sqlalchemy import exists

from app.models import Producer, User
from app.services.email import send_email
from app.services.submission_gate import MISSING_LOCATION, submission_missing_items
from app.utils.clock import ISRAEL_TZ

logger = logging.getLogger(__name__)

# datetime.weekday(): Monday is 0, so Sunday is 6.
DIGEST_WEEKDAY = 6
WINDOW_DAYS = 7
# Below this many signups a 0% share is noise, not a signal.
ALERT_MIN_SIGNUPS = 3


@dataclass(frozen=True)
class FillRates:
    signups: int
    with_referral: int
    with_location: int

    def zero_fields(self) -> list[str]:
        """The fields whose share is zero over enough signups to mean it."""
        if self.signups < ALERT_MIN_SIGNUPS:
            return []
        zero = []
        if self.with_referral == 0:
            zero.append("referral_source")
        if self.with_location == 0:
            zero.append("location")
        return zero


def measure(db: Session, now: datetime) -> FillRates:
    """Businesses (not organizers, not test rows, not owned by a test
    account, as admin_pending_reminder filters) created in the last 7 days."""
    since = (now - timedelta(days=WINDOW_DAYS)).astimezone(timezone.utc).replace(tzinfo=None)
    rows = (
        db.query(Producer)
        .filter(
            Producer.created_at >= since,
            Producer.kind == "producer",
            Producer.is_test.isnot(True),
            ~exists().where(User.producer_id == Producer.id, User.is_test.is_(True)),
        )
        .all()
    )
    return FillRates(
        signups=len(rows),
        with_referral=sum(1 for p in rows if (p.referral_source or "").strip()),
        with_location=sum(
            1 for p in rows if MISSING_LOCATION not in submission_missing_items(p, email_verified=True)
        ),
    )


# ---------------------------------------------------------------------------
# Copy: admin-only, DRAFT pending Sapir's word-for-word approval (rule 22).
# ---------------------------------------------------------------------------


def _pct(part: int, whole: int) -> str:
    return f"{round(100 * part / whole)}%"


def build_email(rates: FillRates) -> tuple[str, str]:
    subject = "מהמקור - אזהרה: שדה בהרשמה הפסיק להתמלא"
    lines = [
        f"בתי עסק שנרשמו ב-7 הימים האחרונים: {rates.signups}",
        f"ענו «מאיפה שמעתם»: {rates.with_referral} ({_pct(rates.with_referral, rates.signups)})",
        f"עם מיקום או אזורי משלוח: {rates.with_location} ({_pct(rates.with_location, rates.signups)})",
    ]
    lines.append("")
    lines.append("אף עסק לא מילא את זה השבוע. כדאי לבדוק שהשדה עדיין מופיע בהרשמה.")
    return subject, "\n".join(lines)


def send_signup_fill_digest(db: Session, now: datetime | None = None) -> FillRates | None:
    """On Sunday, email the admin when a share is zero. Returns the rates it
    reported, or None when it sent nothing (another day, nothing to warn
    about, no ADMIN_EMAIL)."""
    now = now or datetime.now(timezone.utc)
    if now.astimezone(ISRAEL_TZ).weekday() != DIGEST_WEEKDAY:
        return None
    rates = measure(db, now)
    if not rates.zero_fields():
        logger.info(
            "[SIGNUP-FILL] no warning: signups=%d referral=%d location=%d",
            rates.signups, rates.with_referral, rates.with_location,
        )
        return None
    if not settings.admin_email:
        logger.warning("[SIGNUP-FILL] ADMIN_EMAIL not set — digest skipped")
        return None
    subject, body = build_email(rates)
    send_email(settings.admin_email, subject, body)
    logger.info(
        "[SIGNUP-FILL] digest sent: signups=%d referral=%d location=%d zero=%s",
        rates.signups, rates.with_referral, rates.with_location, rates.zero_fields(),
    )
    return rates
