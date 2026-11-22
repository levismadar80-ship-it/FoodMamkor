"""
Module:   signup_fill_digest
Purpose:  Once a week (Sunday, Israel clock) check what share of the
          businesses that signed up in the last 7 days have a referral source
          («מאיפה שמעתם») and a location, and raise a Sentry warning ONLY when
          a share is zero over enough signups (Sapir 22/11: «רק כשיש אזהרה»).
          Claude's weekly scheduled check reads Sentry and acts, so nobody has
          to relay an email, and a field that stops arriving is noticed in
          days, not months.
Touches:  reads producers and users (+ locations / delivery areas through
          the submission gate); Sentry (one warning per empty field, tag
          signup_fill_zero). Sends no email. Writes nothing.
Does NOT: decide what "has a location" means: that is
          services/submission_gate.py (MISSING_LOCATION), the same rule the
          submit gate and the dashboard checklist use. Hold the scheduler:
          app.startup's daily tick calls check_signup_fill, which
          returns early on any day but Sunday.
Related:  backend/app/services/page_freshness_digest.py (the weekly admin
          digest this mirrors); frontend/lib/signup-field-homes.json (the
          guard on the form side of the same question).
History:  MEH-3699 (creation): MEH-3656 removed the referral question from the
          business signup and nothing noticed until Sapir asked (MEH-3697).
          Same PR: email replaced by Sentry + a weekly Claude check (Sapir 22/11).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from sqlalchemy import exists

from app.models import Producer, User
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
    since = (
        (now - timedelta(days=WINDOW_DAYS))
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )
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
            1
            for p in rows
            if MISSING_LOCATION not in submission_missing_items(p, email_verified=True)
        ),
    )


# ---------------------------------------------------------------------------
# Reporting: a Sentry warning, read by Claude's weekly check — not an email
# (Sapir 22/11: an email to her made her the relay, «האחריות נופלת עליי»).
# ---------------------------------------------------------------------------

# Every report of this check carries this tag, so one Sentry search finds them.
SENTRY_TAG = "signup_fill_zero"


def report_to_sentry(rates: FillRates, field: str) -> None:
    """One Sentry warning per empty field, grouped per field. Never raises,
    and is a no-op when sentry_sdk is absent or not initialised."""
    # REUSES: backend/app/services/moderation_fail_open.py:68 — scoped capture_message.
    try:
        import sentry_sdk
    except Exception:  # pragma: no cover — SDK absent (minimal install)
        return
    try:
        with sentry_sdk.new_scope() as scope:
            scope.set_tag(SENTRY_TAG, field)
            scope.set_context(
                "signup_fill",
                {
                    "window_days": WINDOW_DAYS,
                    "signups": rates.signups,
                    "with_referral": rates.with_referral,
                    "with_location": rates.with_location,
                },
            )
            scope.fingerprint = ["signup-fill-zero", field]
            sentry_sdk.capture_message(
                f"signup fill-rate zero: {field} ({rates.signups} signups in {WINDOW_DAYS} days)",
                level="warning",
            )
    except Exception:  # pragma: no cover — reporting must never raise
        logger.debug("[SIGNUP-FILL] report to Sentry failed")


def check_signup_fill(db: Session, now: datetime | None = None) -> FillRates | None:
    """On Sunday, report to Sentry each field whose share is zero. Returns
    the rates it reported, or None when it reported nothing (another day,
    nothing to warn about)."""
    now = now or datetime.now(timezone.utc)
    if now.astimezone(ISRAEL_TZ).weekday() != DIGEST_WEEKDAY:
        return None
    rates = measure(db, now)
    zero = rates.zero_fields()
    logger.info(
        "[SIGNUP-FILL] signups=%d referral=%d location=%d zero=%s",
        rates.signups,
        rates.with_referral,
        rates.with_location,
        zero,
    )
    if not zero:
        return None
    for field in zero:
        report_to_sentry(rates, field)
    return rates
