"""
Module:   job_heartbeat
Purpose:  Give every APScheduler job a Sentry Crons heartbeat. When a job stops
          running (the scheduler did not start after a deploy, the thread died,
          a run hangs), Sentry raises a "missed check-in" issue. A job that is
          silent is no longer indistinguishable from a job that is healthy.
Touches:  Sentry (check-in envelopes via sentry_sdk.crons.capture_checkin).
          No-op when Sentry is not initialised (no BACKEND_SENTRY_DSN), so
          dev, tests and CI send nothing.
Does NOT: catch or report the job's own exceptions. Each job already swallows
          them and reports them via capture_background_exception
          (app/sentry.py). Does NOT register jobs; app/startup.py does, using
          the schedule constants below so the trigger and the monitor config
          come from one value.
Related:  app/startup.py (the five _run_*_job functions + add_job calls).
History:  MEH-3155 (creation, 14/11/2026: found by the repo health scan,
          MEH-3143).
"""

from __future__ import annotations

import functools
import time
from collections.abc import Callable
from typing import Any

# MEH-3155: one value per schedule. startup.py builds its CronTrigger /
# IntervalTrigger from these, and the monitor config below is built from the
# same value, so they cannot drift apart.
FOLLOWUP_CRON = "0 10 * * *"  # 13:00 Israel (MEH-539)
ANALYTICS_ROLLUP_CRON = "30 1 * * *"  # MEH-2283
RETENTION_PURGE_CRON = "30 2 * * *"  # MEH-2303
WATCHDOG_INTERVAL_MINUTES = 5  # MEH-509
RESCUE_DIGEST_INTERVAL_MINUTES = 5  # MEH-2756

# How late a check-in may be before Sentry calls it missed, and how long a
# run may take before Sentry calls it timed out. Daily jobs get an hour of
# margin: the analytics/retention triggers carry a 6h misfire grace, and a
# deploy restart around the fire time should not page anyone.
_DAILY_MARGIN_MIN = 60
_INTERVAL_MARGIN_MIN = 5
_MAX_RUNTIME_MIN = 30


def cron_monitor_config(crontab: str) -> dict[str, Any]:
    return {
        "schedule": {"type": "crontab", "value": crontab},
        "timezone": "UTC",
        "checkin_margin": _DAILY_MARGIN_MIN,
        "max_runtime": _MAX_RUNTIME_MIN,
    }


def interval_monitor_config(minutes: int) -> dict[str, Any]:
    return {
        "schedule": {"type": "interval", "value": minutes, "unit": "minute"},
        "checkin_margin": _INTERVAL_MARGIN_MIN,
        "max_runtime": _MAX_RUNTIME_MIN,
    }


def _capture_checkin(**kwargs: Any) -> str | None:
    """Indirection so tests can spy on check-ins without a Sentry client."""
    try:
        from sentry_sdk.crons import capture_checkin
    except ImportError:  # sentry optional at import time, like app/sentry.py
        return None
    result: str | None = capture_checkin(**kwargs)
    return result


def heartbeat(
    slug: str, monitor_config: dict[str, Any]
) -> Callable[[Callable[[], None]], Callable[[], None]]:
    """Wrap a scheduler job: in_progress check-in, run, then ok/error.

    The heartbeat must never break the job: a failure to send a check-in is
    swallowed. DO NOT move the job call inside that guard: the job's own
    exceptions must keep their existing path (MEH-3155).
    """

    def decorate(job: Callable[[], None]) -> Callable[[], None]:
        @functools.wraps(job)
        def run() -> None:
            check_in_id = _safe_checkin(
                monitor_slug=slug,
                status="in_progress",
                monitor_config=monitor_config,
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
    try:
        return _capture_checkin(**kwargs)
    except Exception:  # noqa: BLE001 — a heartbeat must never fail the job
        return None
