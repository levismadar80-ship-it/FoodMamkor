"""
Module:   job_staleness
Purpose:  Free replacement for the Sentry cron monitors the $0 plan does not
          allow. Every @heartbeat job records its last successful run; a
          checker job emails the admin when a registered job is overdue.
Touches:  admin_settings (keys `job_ok:<slug>`, `job_stale_alerted:<slug>`),
          Resend via services/email.py (one email per overdue job per Israel
          day).
Does NOT: replace Sentry for the scheduler as a whole — `auto-reply-watchdog`
          keeps the plan's one Sentry cron monitor, and that is what notices a
          dead scheduler thread (this checker runs on the same thread). Does
          NOT check a job that is not registered (a flag-gated job that is
          off is not overdue). Does NOT run outside production. Does NOT
          see a run that "succeeded" while failing inside: a job that swallows
          its own exceptions returns normally and is recorded (same limit as
          the Sentry check-in). It catches jobs that stop running or hang.
          Does NOT confirm delivery: send_email is fail-open, so a failed send
          still marks the day alerted and the next email is tomorrow's.
Related:  app/services/job_heartbeat.py (`heartbeat` calls `record_ok`);
          app/startup.py `register_scheduler_jobs` (registers the checker);
          docs/audits/2026-11-sentry-crons.md §4.
History:  MEH-3332 (creation, 18/11/2026 — Sentry Developer plan: 1 cron
          monitor, 8 jobs; seven ran with no monitoring at all).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

OK_KEY = "job_ok:{slug}"
ALERTED_KEY = "job_stale_alerted:{slug}"
CHECK_INTERVAL_MINUTES = 30

# A daily job is overdue 26 h after its last success: one day plus the same
# two-hour margin the Sentry config gives it (job_heartbeat._DAILY_MARGIN_MIN),
# so a deploy over the fire time does not alert on its own.
_DAILY = timedelta(hours=26)
_WEEKLY = timedelta(days=7, hours=2)
# An interval job: six missed ticks, never under 30 minutes.
_INTERVAL_TICKS = 6
_INTERVAL_FLOOR = timedelta(minutes=30)
_CRON_FIELDS = 5
_DOW_FIELD = 4


def max_age(monitor_config: dict[str, Any]) -> timedelta:
    """How long after its last success a job counts as overdue."""
    schedule = monitor_config["schedule"]
    if schedule["type"] == "interval":
        return max(
            timedelta(minutes=int(schedule["value"]) * _INTERVAL_TICKS),
            _INTERVAL_FLOOR,
        )
    fields = str(schedule["value"]).split()
    if len(fields) == _CRON_FIELDS and fields[_DOW_FIELD] != "*":
        return _WEEKLY
    return _DAILY


def _now() -> datetime:
    return datetime.now(UTC)


def _read(db: Any, key: str) -> str | None:
    from app.models import AdminSetting

    row = db.get(AdminSetting, key)
    return row.value if row is not None else None


def _write(db: Any, key: str, value: str) -> None:
    from app.models import AdminSetting

    row = db.get(AdminSetting, key)
    if row is None:
        db.add(AdminSetting(key=key, value=value))
    else:
        row.value = value
    db.commit()


def record_ok(slug: str, *, now: datetime | None = None) -> None:
    """Remember that `slug` just finished successfully. Never raises: a
    failure here must not fail the job (same contract as the check-in)."""
    from app.database import SessionLocal

    try:
        db = SessionLocal()
        try:
            _write(db, OK_KEY.format(slug=slug), (now or _now()).isoformat())
        finally:
            db.close()
    except Exception:  # bookkeeping must never fail the job
        logger.warning(
            "[JOB-STALENESS] could not record ok for %s", slug, exc_info=True
        )


def overdue_slugs(
    db: Any,
    jobs: list[tuple[str, dict[str, Any]]],
    *,
    booted_at: datetime,
    now: datetime,
) -> list[str]:
    """The registered jobs with no success within their max age.

    The clock starts at the later of the last success and this process's
    boot: a job that never ran is measured from boot, and a long outage does
    not alert the moment the service comes back.
    """
    late: list[str] = []
    for slug, config in jobs:
        raw = _read(db, OK_KEY.format(slug=slug))
        try:
            last = datetime.fromisoformat(raw) if raw else booted_at
            if last.tzinfo is None:
                last = last.replace(tzinfo=UTC)
        except ValueError:
            last = booted_at  # unreadable row: measure from boot, never crash
        if now - max(last, booted_at) > max_age(config):
            late.append(slug)
    return late


def _alert(db: Any, slug: str, today: str, last_ok: str | None) -> None:
    from app.services.email import send_email

    if _read(db, ALERTED_KEY.format(slug=slug)) == today:
        return
    if not settings.admin_email:
        logger.warning(
            "[JOB-STALENESS] ADMIN_EMAIL not set — %s overdue, no email", slug
        )
        return
    send_email(
        settings.admin_email,
        f"מהמקור - משימת רקע לא רצה בזמן: {slug}",
        f"המשימה {slug} לא הסתיימה בהצלחה בזמן שנקבע לה.\n"
        f"ריצה מוצלחת אחרונה: {last_ok or 'אין מאז העלייה האחרונה של השרת'}.\n\n"
        "כדאי לבדוק את הלוגים ב-Railway. המייל הזה נשלח פעם אחת ביום לכל משימה.",
    )
    _write(db, ALERTED_KEY.format(slug=slug), today)
    logger.warning("[JOB-STALENESS] %s overdue — admin emailed", slug)


def check_jobs(
    jobs: list[tuple[str, dict[str, Any]]],
    *,
    booted_at: datetime,
    now: datetime | None = None,
) -> list[str]:
    """Email the admin about each overdue job, once per Israel day. Returns
    the overdue slugs."""
    from app.database import SessionLocal
    from app.utils.clock import israel_today

    now = now or _now()
    db = SessionLocal()
    try:
        late = overdue_slugs(db, jobs, booted_at=booted_at, now=now)
        today = israel_today().isoformat()
        for slug in late:
            try:
                _alert(db, slug, today, _read(db, OK_KEY.format(slug=slug)))
            except Exception:  # one job's alert must not silence the others
                db.rollback()
                logger.warning(
                    "[JOB-STALENESS] alert for %s failed", slug, exc_info=True
                )
        return late
    finally:
        db.close()
