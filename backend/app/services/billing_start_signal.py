"""
Module:   billing_start_signal
Purpose:  On the 1st of each month, read the month that just ended and email
          the admin «הגיע הזמן» when enough businesses were over the paid
          threshold enough months in a row (billing_summary.START_BILLING_*).
          Before this the signal existed only on /admin/billing, so it fired
          only if someone happened to open the screen.
Touches:  reads billable_events + producers (via billing_summary.overview);
          sends one email via app.services.email.send_email (Resend,
          fail-open). Writes nothing.
Does NOT: start billing — that is pricing.BILLING_PHASE, a reviewed code
          change behind SWITCH_ON_BLOCKERS; decide the rule (that is
          billing_summary.START_BILLING_BUSINESSES / _MONTHS); hold the
          scheduler (app.startup).
Related:  app/services/billing_summary.py:39-41 (the rule) ·
          app/services/admin_pending_reminder.py (the same admin-email shape).
History:  MEH-3413 (creation, 18/11/2026 — terms §11 enforcement audit).
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app import pricing
from app.config import settings
from app.services import billing_summary
from app.services.billing_summary import Month
from app.services.email import send_email

logger = logging.getLogger(__name__)


def signal_reached(view: dict[str, Any]) -> bool:
    """The «הגיע הזמן» rule, read off one billing_summary.overview()."""
    return bool(view["businesses_over_two_months"] >= view["start_billing_businesses"])


def build_email(view: dict[str, Any]) -> tuple[str, str]:
    """(subject, body). Admin-only email; the phrase «הגיע הזמן» is Sapir's own
    (her standing ask, 14/11/2026), the rest states the numbers."""
    count = view["businesses_over_two_months"]
    threshold = view["threshold_agorot"] // pricing.AGOROT_PER_SHEKEL
    subject = "מהמקור - הגיע הזמן להתחיל לגבות"
    body = (
        f"בחודש {view['month']} היו {count} בתי עסק עם הזמנות בתשלום "
        f"של {threshold:,} ₪ ומעלה, {view['start_billing_months']} חודשים ברצף "
        f"או יותר (הסף להתחלה: {view['start_billing_businesses']} בתי עסק).\n\n"
        "לפי סעיף 11 בתנאים, החיוב מתחיל רק 60 יום אחרי הודעה בכתב לבתי העסק.\n"
        f"הפירוט: {settings.frontend_url}/admin/billing"
    )
    return subject, body


def send_billing_start_signal(db: Session, *, month: Month | None = None) -> bool:
    """Email the admin if the month that just ended reached the signal.

    Returns True when an email was sent. Once billing is on, the signal has
    done its job and nothing is sent.
    """
    if pricing.billing_is_on():
        return False
    target = month or Month.current().previous()
    view = billing_summary.overview(db, target)
    if not signal_reached(view):
        logger.info(
            "[BILLING-SIGNAL] %s: %d business(es) over two months — no email",
            target.label(),
            view["businesses_over_two_months"],
        )
        return False
    if not settings.admin_email:
        logger.warning("[BILLING-SIGNAL] ADMIN_EMAIL not set — signal not sent")
        return False
    subject, body = build_email(view)
    send_email(settings.admin_email, subject, body)
    logger.info("[BILLING-SIGNAL] sent for %s", target.label())
    return True
