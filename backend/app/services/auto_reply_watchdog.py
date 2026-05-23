"""
Module:   auto_reply_watchdog
Purpose:  Periodic scan of recent inbound WhatsApp messages; auto-replies
          when outside business hours or vacation mode is active.
Touches:  PostgreSQL (inbound_messages, admin_settings); Meta WhatsApp
          Cloud API via app.services.whatsapp.send_template.
Does NOT: receive inbound messages — that belongs to the future PR2c
          webhook receiver. Does NOT send the daily onboarding follow-ups
          — that is app.services.onboarding_followup, scheduled separately
          in app/startup.py.
Related:  app/services/whatsapp.py:71 (send_template), app/routers/
          admin_extra.py:402 (_read_vacation_state pattern, MEH-509 PR2a),
          app/startup.py:142 (existing APScheduler instance — PR2b adds
          a second job, NOT a new scheduler).
History:  MEH-509 PR2b (creation; gated off until PR2c webhook ships).
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.config import (
    BUSINESS_HOURS,
    BUSINESS_HOURS_TIMEZONE,
    WATCHDOG_LOOKBACK_MINUTES,
)
from app.models import InboundMessage
from app.services.vacation_state import read_vacation_state
from app.services.whatsapp import send_template

logger = logging.getLogger(__name__)

# Meta-approved template names (do NOT invent new ones). Both are
# established as the spec'd outputs of this watchdog; PR2c webhook will
# populate the messages this watchdog dispatches against.
TEMPLATE_VACATION = "vacation_response_he_v2"
TEMPLATE_AFTER_HOURS = "after_hours_response_he"


# ---- Business hours (pure function) ----------------------------------------


def is_within_business_hours(now: datetime | None = None) -> bool:
    """Return True iff `now` falls inside the configured business hours.

    `now` is the testable injection seam — passing a frozen datetime
    avoids needing freezegun. Naive datetimes are assumed UTC and
    converted; aware datetimes are converted to Asia/Jerusalem.

    Half-open interval: start_hour <= hour < end_hour, so 19:00 itself
    counts as after-hours (matches the spec's 9-19 weekday window).
    """
    tz = ZoneInfo(BUSINESS_HOURS_TIMEZONE)
    if now is None:
        now = datetime.now(tz)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
    else:
        now = now.astimezone(tz)

    weekday_name = now.strftime("%A").lower()
    hours = BUSINESS_HOURS.get(weekday_name)
    if hours is None:
        return False
    start_hour, end_hour = hours
    return start_hour <= now.hour < end_hour


# ---- Per-message dispatch --------------------------------------------------
# MEH-662: vacation state is now read via the shared
# `app.services.vacation_state.read_vacation_state` helper. The
# previous local _read_vacation_state was a verbatim copy of PR2a's
# admin_extra version (PR2b adversarial review finding A40); both now
# delegate to the single source of truth.


def _decide_template(
    *,
    vacation_active: bool,
    vacation_return_date: date | None,
    now: datetime | None = None,
) -> tuple[str | None, list[str]]:
    """Return (template_name, params) for the current state, or
    (None, []) when no auto-reply should fire (within business hours,
    no vacation). Keeps routing logic pure + unit-testable."""
    if vacation_active and vacation_return_date is not None:
        return (TEMPLATE_VACATION, [vacation_return_date.isoformat()])
    if not is_within_business_hours(now):
        return (TEMPLATE_AFTER_HOURS, [])
    return (None, [])


# ---- Watchdog tick (the APScheduler-invoked entry point) -------------------


def run_watchdog(db: Session, *, now: datetime | None = None) -> dict[str, int]:
    """Scan recent inbound messages and dispatch auto-replies.

    Idempotency contract: `bot_replied=True` is set BEFORE attempting
    the WhatsApp send, so a send failure leaves the message permanently
    un-auto-replied (one shot, no retry storm). The `bot_template_sent`
    column is the audit trail of which template fired — NULL while
    bot_replied=True means "we tried and failed".

    Returns a counter dict for caller logging. Never raises — per-
    message failures are caught + logged so one bad send does not block
    the rest of the batch.
    """
    if now is None:
        now = datetime.utcnow()
    cutoff = now - timedelta(minutes=WATCHDOG_LOOKBACK_MINUTES)

    candidates = (
        db.query(InboundMessage)
        .filter(
            InboundMessage.bot_replied.is_(False),
            InboundMessage.human_replied.is_(False),
            InboundMessage.received_at >= cutoff,
        )
        .order_by(InboundMessage.received_at.asc())
        .all()
    )

    counters = {
        "scanned": len(candidates),
        "skipped_within_hours": 0,
        "sent_after_hours": 0,
        "sent_vacation": 0,
        "send_failed": 0,
    }

    if not candidates:
        logger.debug("[WATCHDOG] no candidates in last %dm", WATCHDOG_LOOKBACK_MINUTES)
        return counters

    # REUSES: app/services/vacation_state.py:read_vacation_state — shared
    # with admin_extra._read_vacation_state (MEH-662 dedup).
    vacation_active, vacation_return_date = read_vacation_state(db)
    template_name, params = _decide_template(
        vacation_active=vacation_active,
        vacation_return_date=vacation_return_date,
        now=now,
    )

    if template_name is None:
        counters["skipped_within_hours"] = len(candidates)
        logger.debug(
            "[WATCHDOG] within business hours, no vacation — skipping %d msg(s)",
            len(candidates),
        )
        return counters

    for msg in candidates:
        # Mark bot_replied=True BEFORE send (idempotency lock).
        msg.bot_replied = True
        msg.bot_replied_at = now
        db.commit()

        try:
            ok = send_template(msg.from_phone, template_name, params, lang="he")
        except Exception as e:  # noqa: BLE001 — fail-open at message level
            logger.warning("[WATCHDOG] send raised for msg=%s: %s", msg.id, e)
            counters["send_failed"] += 1
            continue

        if ok:
            msg.bot_template_sent = template_name
            db.commit()
            if template_name == TEMPLATE_VACATION:
                counters["sent_vacation"] += 1
            else:
                counters["sent_after_hours"] += 1
            logger.info(
                "[WATCHDOG] sent template=%s msg=%s",
                template_name,
                msg.id,
            )
        else:
            counters["send_failed"] += 1
            logger.warning(
                "[WATCHDOG] send returned False for msg=%s template=%s",
                msg.id,
                template_name,
            )

    return counters
