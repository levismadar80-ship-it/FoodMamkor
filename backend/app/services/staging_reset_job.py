"""
Module:   staging_reset_job
Purpose:  Once a week, put the STAGING database back to the seed recipe by
          running `scripts/reset_staging.py --confirm`, so E2E users and
          hand-made test rows stop piling up again after the one-off reset
          (MEH-3630: 17,968 users on 21/11/2026, 290 new in one week).
Touches:  whatever reset_staging.py touches (every non-reference table, then
          the seed chain). Holds a Postgres advisory lock while it runs.
Does NOT: register anywhere but RAILWAY_ENVIRONMENT=staging (never locally,
          never in CI, never in production). Does NOT decide what is wiped or
          refuse a production database itself: reset_staging.py's own
          `reset_refusal()` does that again on every run. Does NOT send a
          Sentry check-in (not a @heartbeat job; staging sends none anyway).
Related:  backend/scripts/reset_staging.py `main` · app/startup.py
          `register_scheduler_jobs` · docs/DEPLOYMENT.md «Resetting staging
          data».
History:  MEH-3630 (creation).
"""

from __future__ import annotations

import logging
import os
import signal
import subprocess
import sys
from pathlib import Path
from typing import Any

from sqlalchemy import text

from app.config import settings
from app.sentry import capture_background_exception

logger = logging.getLogger(__name__)

JOB_ID = "meh_3630_staging_weekly_reset"
# Saturday 23:00 UTC = Sunday 01:00/02:00 Israel: after Shabbat, the quietest
# hour of the week, and 2.5 h before the 01:30 UTC nightly E2E run.
RESET_CRON = "0 23 * * sat"
# Any fixed number; only this job takes it. Two replicas or two workers each
# register the job, and only the one that gets the lock runs the reset.
ADVISORY_LOCK_KEY = 3630
BACKEND_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ("scripts/reset_staging.py", "--confirm")
TIMEOUT_SECONDS = 30 * 60


def enabled() -> bool:
    """True only on Railway staging. Production loses on either signal."""
    if settings.env.strip().lower() == "production":
        return False
    return settings.railway_environment.strip().lower() == "staging"


def _run_script() -> None:
    """Run the reset; on timeout kill the whole process group, seed steps too."""
    proc = subprocess.Popen(
        [sys.executable, *SCRIPT], cwd=BACKEND_ROOT, start_new_session=True
    )
    try:
        code = proc.wait(timeout=TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait()
        raise
    if code != 0:
        raise subprocess.CalledProcessError(code, proc.args)


def run() -> None:
    """One weekly reset. Never raises: a failure is logged and reported."""
    from app.database import engine

    try:
        # AUTOCOMMIT: no transaction stays open for the half hour the reset may
        # take, so idle_in_transaction_session_timeout cannot drop the lock.
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            got = conn.execute(
                text("SELECT pg_try_advisory_lock(:k)"), {"k": ADVISORY_LOCK_KEY}
            ).scalar_one()
            if not got:
                logger.info("[STAGING-RESET] another process holds the lock")
                return
            try:
                logger.info("[STAGING-RESET] weekly reset starting")
                _run_script()
                logger.info("[STAGING-RESET] weekly reset done")
            finally:
                conn.execute(
                    text("SELECT pg_advisory_unlock(:k)"), {"k": ADVISORY_LOCK_KEY}
                )
    except Exception as exc:
        capture_background_exception(exc, task="staging_weekly_reset")
        logger.error("[STAGING-RESET] weekly reset failed", exc_info=True)


def register(scheduler: Any) -> None:
    """Add the weekly job to `scheduler` on staging; do nothing elsewhere."""
    if not enabled():
        return
    from apscheduler.triggers.cron import CronTrigger

    scheduler.add_job(
        run,
        CronTrigger.from_crontab(RESET_CRON, timezone="UTC"),
        id=JOB_ID,
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=3600,
    )
    logger.info("[STAGING-RESET] weekly job registered (%s UTC)", RESET_CRON)
