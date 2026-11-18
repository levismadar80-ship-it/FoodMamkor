"""
Module:   job_heartbeat
Purpose:  Give every APScheduler job a Sentry Crons heartbeat. When a job stops
          running (the scheduler did not start after a deploy, the thread died,
          a run hangs), Sentry raises a "missed check-in" issue. A job that is
          silent is no longer indistinguishable from a job that is healthy.
Touches:  Sentry (check-in envelopes via sentry_sdk.crons.capture_checkin).
          Production only (ENV or RAILWAY_ENVIRONMENT = production): staging redeploys many times a
          day and would page on every restart. No-op without
          BACKEND_SENTRY_DSN too.
Does NOT: guarantee the check-in ARRIVED. It is sent on a best-effort path and
          Sentry may drop it (rate limit, quota, network); the send failure is
          now LOGGED (MEH-3350) instead of swallowed in silence, because the one
          failure mode that actually happened was the one this file had made
          invisible. Does NOT detect a run that FAILED inside the job — each job swallows
          its own exceptions, so the check-in still says ok. Missed or hung
          runs are what this catches; failures keep reporting through
          capture_background_exception. Does NOT catch or report the job's
          own exceptions. Each job already swallows
          them and reports them via capture_background_exception
          (app/sentry.py). Does NOT register jobs; app/startup.py does, using
          the schedule constants below so the trigger and the monitor config
          come from one value.
Related:  app/startup.py (the five _run_*_job functions + add_job calls).
History:  MEH-3155 (creation, 14/11/2026: found by the repo health scan,
          MEH-3143). MEH-3350 (17/11/2026: the watchdog monitor read `error`
          with 114 of 118 check-ins missed over ten hours, while Railway's own
          logs showed the job running on time, every five minutes, in 10-60 ms.
          The job was healthy; the check-in was not arriving — and _safe_checkin
          caught every exception and returned None with no log line, so there
          was nothing to look at. See docs/audits/2026-11-sentry-crons.md).
"""

from __future__ import annotations

import functools
import os
import time
from collections.abc import Callable
from typing import Any

import structlog

log = structlog.get_logger("mehamakor.job_heartbeat")

# MEH-3155: one value per schedule. startup.py builds its CronTrigger /
# IntervalTrigger from these, and the monitor config below is built from the
# same value, so they cannot drift apart.
FOLLOWUP_CRON = "0 10 * * *"  # 13:00 Israel (MEH-539)
ANALYTICS_ROLLUP_CRON = "30 1 * * *"  # MEH-2283
RETENTION_PURGE_CRON = "30 2 * * *"  # MEH-2303
# 08:00/09:00 Israel: an expired group is told in the morning, not at night.
GROUP_BUY_EXPIRY_CRON = "0 6 * * *"  # MEH-3287
ADMIN_PENDING_REMINDER_CRON = "0 5 * * *"  # 07:00/08:00 Israel (MEH-3147)
# The 1st–3rd of the month, after the previous month closed on the Israel
# clock. Three mornings because there is no persistent jobstore: a restart over
# the 1st would otherwise lose the month. The service sends once per month.
BILLING_START_SIGNAL_CRON = "0 5 1-3 * *"  # MEH-3413
WATCHDOG_INTERVAL_MINUTES = 5  # MEH-509
RESCUE_DIGEST_INTERVAL_MINUTES = 5  # MEH-2756
# Sunday 08:00 on the Israel clock (MEH-3079); the zone travels with the
# schedule so DST moves the UTC fire time, in the trigger and the monitor alike.
WEEKLY_OWNER_SUMMARY_CRON = "0 8 * * sun"
WEEKLY_OWNER_SUMMARY_TZ = "Asia/Jerusalem"

# How late a check-in may be before Sentry calls it missed, and how long a
# run may take before Sentry calls it timed out. Daily jobs get two hours:
# the scheduler has no persistent jobstore, so a deploy restart spanning the
# fire time loses that run, and one slow deploy should not page anyone.
# A run lost to a restart IS a missed run; the alert is the point.
_DAILY_MARGIN_MIN = 120
_INTERVAL_MARGIN_MIN = 5
_MAX_RUNTIME_MIN = 30


def cron_monitor_config(crontab: str, timezone: str = "UTC") -> dict[str, Any]:
    return {
        "schedule": {"type": "crontab", "value": crontab},
        "timezone": timezone,
        "checkin_margin": _DAILY_MARGIN_MIN,
        "max_runtime": _MAX_RUNTIME_MIN,
    }


def interval_monitor_config(minutes: int) -> dict[str, Any]:
    return {
        "schedule": {"type": "interval", "value": minutes, "unit": "minute"},
        "checkin_margin": _INTERVAL_MARGIN_MIN,
        "max_runtime": _MAX_RUNTIME_MIN,
    }


# Every slug that reaches Sentry from this repo, and whether a monitor for it
# actually EXISTS there. Measured against the live Sentry org on 17/11/2026
# (MEH-3350): the account holds exactly ONE cron monitor, `auto-reply-watchdog`,
# because the Developer ($0) plan allows one and it is at 100% (MEH-3332).
#
# The other seven send check-ins for a monitor that was never created. That is not
# a code bug to fix here — it is a plan limit, and Sapir's to decide. It IS a
# fact the code used to hide: @heartbeat on a job reads as "this job is
# monitored", and for seven of eight that is false, so their silence raises
# nothing at all. tests/test_meh3350_heartbeat_logging.py asserts this list
# against the real @heartbeat call sites, so a NEW slug cannot be added without
# someone looking at this comment and deciding which bucket it is in.
MONITORED_SLUGS = frozenset({"auto-reply-watchdog"})

UNMONITORED_SLUGS = frozenset(
    {
        "onboarding-followups-daily",
        "admin-pending-reminder-daily",
        "analytics-rollup-daily",
        "retention-purge-daily",
        "rescue-codes-digest",
        "weekly-owner-summary",
        # PR #4625 (group-buy expiry) and #4688 (this list's test) merged
        # separately, so the slug landed unclassified and pytest went red.
        # No Sentry monitor exists for it (plan limit, MEH-3332).
        "group-buy-expiry-daily",
        # MEH-3413: monthly billing-start signal. Same plan limit (MEH-3332).
        "billing-start-signal-monthly",
    }
)


def _capture_checkin(**kwargs: Any) -> str | None:
    """Indirection so tests can spy on check-ins without a Sentry client."""
    try:
        from sentry_sdk.crons import capture_checkin
    except ImportError:  # sentry optional at import time, like app/sentry.py
        log.warning(
            "heartbeat_sdk_missing",
            slug=kwargs.get("monitor_slug"),
            detail="sentry_sdk.crons is not importable, so no check-in was sent",
        )
        return None
    result: str | None = capture_checkin(**kwargs)
    return result


def _enabled() -> bool:
    # REUSES: backend/app/config.py:245 — production = ENV or Railway's own
    # RAILWAY_ENVIRONMENT (set by Railway itself, cannot be forgotten).
    return "production" in (
        os.getenv("ENV", "").strip().lower(),
        os.getenv("RAILWAY_ENVIRONMENT", "").strip().lower(),
    )


def heartbeat(
    slug: str, monitor_config: dict[str, Any]
) -> Callable[[Callable[[], None]], Callable[[], None]]:
    """Wrap a scheduler job: in_progress check-in, run, then ok/error.

    Interval jobs skip the in_progress check-in: at a 5-minute cadence it
    doubles the volume for nothing, and their runs are short. Daily jobs
    keep it, so a hung run is reported once max_runtime passes.

    The heartbeat must never break the job: a failure to send a check-in is
    swallowed. DO NOT move the job call inside that guard: the job's own
    exceptions must keep their existing path (MEH-3155).
    """
    track_start = monitor_config["schedule"]["type"] == "crontab"

    def decorate(job: Callable[[], None]) -> Callable[[], None]:
        @functools.wraps(job)
        def run() -> None:
            if not _enabled():
                job()
                return
            check_in_id = (
                _safe_checkin(
                    monitor_slug=slug,
                    status="in_progress",
                    monitor_config=monitor_config,
                )
                if track_start
                else None
            )
            started = time.monotonic()
            status = "error"
            try:
                job()
                status = "ok"
            finally:
                _safe_checkin(
                    monitor_slug=slug,
                    check_in_id=check_in_id,
                    status=status,
                    duration=time.monotonic() - started,
                    monitor_config=monitor_config,
                )

        return run

    return decorate


def _safe_checkin(**kwargs: Any) -> str | None:
    """Send a check-in. Never raise, but never fail SILENTLY either.

    MEH-3350: this used to be `except Exception: return None` with nothing else.
    When the watchdog's check-ins stopped arriving, the production logs held not
    one line about it, and the only visible symptom was a Sentry monitor
    claiming the JOB had stopped — which Railway's logs disproved. A heartbeat
    that cannot fail the job must still be able to tell you it failed.

    `log.warning` and not `capture_background_exception`: the thing that is
    broken is the path to Sentry, so reporting it to Sentry is the one channel
    that cannot be trusted here.
    """
    try:
        return _capture_checkin(**kwargs)
    except Exception as exc:  # noqa: BLE001 — a heartbeat must never fail the job
        log.warning(
            "heartbeat_checkin_failed",
            slug=kwargs.get("monitor_slug"),
            status=kwargs.get("status"),
            error=f"{type(exc).__name__}: {exc}",
            detail=(
                "the job itself ran; only its check-in did not reach Sentry. "
                "A Sentry 'missed check-in' issue for this slug is then about "
                "the telemetry, not about the job."
            ),
        )
        return None
