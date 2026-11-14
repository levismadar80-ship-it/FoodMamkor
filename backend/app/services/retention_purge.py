"""
Module:   retention_purge
Purpose:  Enforce the retention windows the privacy policy promises (Sapir's
          ruling 05/09, wording live via #3457): raw business-page views and
          WhatsApp clicks are kept 90 days, alert-delivery log rows 30 days.
          MEH-2079 chunk C (MEH-2303).
Touches:  DB tables `producer_page_views`, `producer_whatsapp_clicks`,
          `alert_log` — DELETE only, in batches, committing per batch.
          MEH-2763: also `registrations`, 30 days after the item's date.
          MEH-3171: also `phone_otp_tokens`, one day after `expires_at`.
          MEH-3244: `producer_contact_clicks` past 90 days are UPDATEd —
          ip_hash and user_id set to NULL, the row kept.
          Reads the roll-up watermark through analytics_rollup — never
          the aggregate table directly (the MEH-2079 single-reader guard).
Does NOT: roll anything up (analytics_rollup.py owns that); decide WHEN to
          run (the CronTrigger in startup.py owns timing); touch the
          aggregate table, which is anonymous and kept unbounded.
Related:  backend/app/services/analytics_rollup.py (RAW_RETENTION_DAYS,
          rollup_watermark — property 3: the aggregate owns every day up to
          the watermark); backend/app/startup.py::_run_retention_purge_job;
          tests/test_meh2303_retention_purge.py.
History:  MEH-2303 (creation, 22/10). `top_cities` (producer_me.py) has no
          aggregate dimension, so after this job it reflects the last 90
          days — ruled 22/10 (option 1 on #3452).

THE ONE PROPERTY THAT MATTERS
-----------------------------
A raw day is deleted only when BOTH hold:
  1. it is older than the retention window (day < israel_today - 90), and
  2. the aggregate already owns it (day <= rollup watermark).
If the roll-up has stalled, (2) holds the raw rows back rather than losing
them — the owner's totals read raw rows above the watermark, so deleting an
un-rolled day would shrink her numbers permanently. No watermark (nothing
rolled up yet) means nothing is deleted.

The boundary is expressed as a naive-UTC timestamp — the start of the
boundary Israel day — so the DELETE filters on the indexed `created_at` /
`clicked_at` columns instead of a per-row timezone conversion. A row whose
timestamp is below that instant has an Israel day below the boundary day.

# DO NOT purge without the watermark guard — an un-rolled day is the only copy.
# DO NOT delete from the aggregate table here — it is the kept summary.
"""

from __future__ import annotations

from typing import Any, cast
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import CursorResult, delete, or_, select, update
from sqlalchemy.orm import Session

from app.models.models import (
    AlertLog,
    ContactClick,
    Event,
    Experience,
    PhoneOtpToken,
    ProducerPageView,
    ProducerWhatsAppClick,
    Registration,
)
from app.services.analytics_rollup import RAW_RETENTION_DAYS, rollup_watermark
from app.utils.clock import ISRAEL_TZ, israel_today

logger = logging.getLogger(__name__)

#: Sapir's ruling 05/09 — internal alert logs keep 30 days.
ALERT_LOG_RETENTION_DAYS = 30

#: MEH-2763 — the sign-up form promises «נמחקים 30 יום אחרי המועד»
#: (approved 6/11). Counted from the event's / experience's own date.
REGISTRATION_RETENTION_DAYS = 30
# MEH-3171: an OTP row is useless once it expires but carries a phone number
# (PII). Keep it one day past expiry (support can still see a failed attempt),
# then delete it.
OTP_RETENTION_AFTER_EXPIRY = timedelta(days=1)

#: Rows per DELETE statement. Small enough that one batch never holds a long
#: lock on a table the request path writes to; the loop runs until empty.
BATCH_SIZE = 5000


@dataclass(frozen=True)
class PurgeResult:
    """What one run did. `raw_boundary_day` is the first Israel day that was
    KEPT in the raw tables (None when nothing was eligible — no watermark)."""

    raw_boundary_day: date | None
    views_deleted: int
    clicks_deleted: int
    alerts_deleted: int
    registrations_deleted: int = 0
    otps_deleted: int = 0
    contact_clicks_anonymized: int = 0


def _israel_day_start_utc(day: date) -> datetime:
    """Naive-UTC instant at which Israel day `day` begins — the inverse of
    `israel_day_of` in analytics.py, DST-correct via zoneinfo."""
    local = datetime.combine(day, datetime.min.time(), tzinfo=ISRAEL_TZ)
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def raw_boundary_day(db: Session, today: date) -> date | None:
    """First Israel day the raw tables must keep, or None if nothing may go.

    min(retention boundary, watermark + 1): every day strictly below the
    result is both past retention and owned by the aggregate."""
    watermark = rollup_watermark(db)
    if watermark is None:
        return None
    retention_boundary = today - timedelta(days=RAW_RETENTION_DAYS)
    return min(retention_boundary, watermark + timedelta(days=1))


def _delete_in_batches(db: Session, model: Any, time_col: Any, cutoff: datetime) -> int:
    """Delete `model` rows with `time_col < cutoff`, BATCH_SIZE at a time,
    committing each batch. Rolls back and re-raises on failure, so the
    session stays usable for the caller (MEH-1824 invariant)."""
    total = 0
    while True:
        ids = select(model.id).where(time_col < cutoff).limit(BATCH_SIZE)
        try:
            result = db.execute(
                delete(model)
                .where(model.id.in_(ids.scalar_subquery()))
                .execution_options(synchronize_session=False)
            )
            db.commit()
        except Exception:
            db.rollback()
            raise
        deleted = cast("CursorResult[Any]", result).rowcount or 0
        total += deleted
        if deleted < BATCH_SIZE:
            return total


def _purge_registrations(db: Session, today: date) -> int:
    """MEH-2763: delete every sign-up whose item's date is more than
    REGISTRATION_RETENTION_DAYS behind `today` (Israel day), active or
    cancelled. Name, phone and email go with the row. Small table, one
    statement per item kind; rolls back and re-raises on failure."""
    boundary = today - timedelta(days=REGISTRATION_RETENTION_DAYS)
    total = 0
    for fk, model in (
        (Registration.event_id, Event),
        (Registration.experience_id, Experience),
    ):
        old_items = select(model.id).where(model.event_date < boundary)
        try:
            result = db.execute(
                delete(Registration)
                .where(fk.in_(old_items.scalar_subquery()))
                .execution_options(synchronize_session=False)
            )
            db.commit()
        except Exception:
            db.rollback()
            raise
        total += cast("CursorResult[Any]", result).rowcount or 0
    return total


def _anonymize_contact_clicks(db: Session, today: date) -> int:
    """MEH-3244 (Sapir 14/11: «90 יום כמו וואטסאפ»): contact clicks older
    than RAW_RETENTION_DAYS lose `ip_hash` and `user_id`; the row stays.

    Not a DELETE: this table has no aggregate column (producer_me.py
    `windowed(ContactClick, …)` counts raw rows on every arm, `total` too), so
    deleting would shrink the owner's all-time count. Clearing the two
    identifying columns keeps the count and drops the personal data, which is
    why no watermark guard is needed here. Same side effect as the WhatsApp
    purge: past 90 days a click no longer proves contact for a review
    (reviews.py, the user_id lookup). Batched; rolls back and re-raises."""
    cutoff = _israel_day_start_utc(today - timedelta(days=RAW_RETENTION_DAYS))
    total = 0
    while True:
        ids = (
            select(ContactClick.id)
            .where(
                ContactClick.clicked_at < cutoff,
                or_(
                    ContactClick.ip_hash.is_not(None), ContactClick.user_id.is_not(None)
                ),
            )
            .limit(BATCH_SIZE)
        )
        try:
            result = db.execute(
                update(ContactClick)
                .where(ContactClick.id.in_(ids.scalar_subquery()))
                .values(ip_hash=None, user_id=None)
                .execution_options(synchronize_session=False)
            )
            db.commit()
        except Exception:
            db.rollback()
            raise
        changed = cast("CursorResult[Any]", result).rowcount or 0
        total += changed
        if changed < BATCH_SIZE:
            return total


def run_purge(
    db: Session, *, today: date | None = None, now: datetime | None = None
) -> PurgeResult:
    """One purge pass. `today` (Israel) and `now` (naive UTC) are injectable
    so tests do not depend on the wall clock."""
    today = today or israel_today()
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)

    views = clicks = 0
    boundary = raw_boundary_day(db, today)
    if boundary is not None:
        cutoff = _israel_day_start_utc(boundary)
        views = _delete_in_batches(
            db, ProducerPageView, ProducerPageView.created_at, cutoff
        )
        clicks = _delete_in_batches(
            db, ProducerWhatsAppClick, ProducerWhatsAppClick.clicked_at, cutoff
        )

    alerts = _delete_in_batches(
        db,
        AlertLog,
        AlertLog.sent_at,
        now - timedelta(days=ALERT_LOG_RETENTION_DAYS),
    )

    registrations = _purge_registrations(db, today)
    contacts = _anonymize_contact_clicks(db, today)

    otps = _delete_in_batches(
        db,
        PhoneOtpToken,
        PhoneOtpToken.expires_at,
        now - OTP_RETENTION_AFTER_EXPIRY,
    )

    result = PurgeResult(boundary, views, clicks, alerts, registrations, otps, contacts)
    logger.info("[RETENTION-PURGE] %s", result)
    return result
