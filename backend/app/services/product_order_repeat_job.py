"""
Module:   product_order_repeat_job
Purpose:  Run the weekly-repeat orders (MEH-3933) every hour from 09:00 to
          20:00 on the Israel clock, so a restart costs at most an hour and no
          email about a repeat goes out at night.
Touches:  everything services/product_order_repeat.run_due touches.
Does NOT: decide what is due: run_due does, from each repeat's last week.
Related:  app/startup.py (register_scheduler_jobs calls register_order_repeats),
          app/services/job_heartbeat.py (the Sentry check-in)
History:  MEH-3933 (creation, 27/11/2026)
"""

import logging
from typing import Any

from app.services.job_heartbeat import cron_monitor_config, heartbeat
from app.sentry import capture_background_exception

log = logging.getLogger(__name__)

JOB_ID = "meh_3933_order_repeats"
REPEAT_CRON = "0 9-20 * * *"
REPEAT_TZ = "Asia/Jerusalem"


@heartbeat("order-repeats-hourly", cron_monitor_config(REPEAT_CRON, timezone=REPEAT_TZ))
def run_order_repeats() -> None:
    """One pass. Never raises: the scheduler thread must not die."""
    from app.database import SessionLocal
    from app.services.product_order_repeat import run_due

    db = SessionLocal()
    try:
        counters = run_due(db)
        log.info("[ORDER-REPEAT] run complete %s", counters)
    except Exception as exc:
        capture_background_exception(exc, task="order_repeats")
        log.error("[ORDER-REPEAT] run crashed", exc_info=True)
    finally:
        db.close()


def register_order_repeats(scheduler: Any) -> bool:
    """Add the job while on-site ordering is on (PRODUCT_ORDERS_ENABLED)."""
    from apscheduler.triggers.cron import CronTrigger

    from app.routers.product_orders import product_orders_enabled

    if not product_orders_enabled():
        return False
    scheduler.add_job(
        run_order_repeats,
        CronTrigger.from_crontab(REPEAT_CRON, timezone=REPEAT_TZ),
        id=JOB_ID,
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=1800,
    )
    log.info("[ORDER-REPEAT] job registered (%s %s)", REPEAT_CRON, REPEAT_TZ)
    return True
