"""
Module:   worker
Purpose:  The outbox worker: a process of its own (a separate Railway service,
          `python -u -m app.worker`) that sends the queued emails and runs the
          on-site order tick, so a web deploy, a web crash or a second web
          replica no longer touches them.
Touches:  Through the two jobs it calls: DB tables email_outbox and
          product_order_notifications / product_orders; Resend; Meta WhatsApp.
Does NOT: serve HTTP, run migrations (the web service's boot does), or run the
          other scheduled jobs (they stay in the web scheduler, startup.py).
          Does NOT decide that the web process stops dispatching: that is
          OUTBOX_EXTERNAL_WORKER=true on the WEB service, set after this one
          is live. Running both at once is safe — the rows are taken with
          SKIP LOCKED — just redundant.
Related:  app/startup.py `_run_email_outbox_job`, `_run_product_order_jobs`;
          railway.worker.json; docs/DEPLOYMENT.md «Outbox worker».
History:  MEH-3535 (creation)
"""

from __future__ import annotations

import signal
import threading
from types import FrameType

import structlog

from app.services.job_heartbeat import PRODUCT_ORDERS_INTERVAL_MINUTES

log = structlog.get_logger("mehamakor.worker")

# How often the loop wakes. The email tick runs every wake-up (sooner than the
# web scheduler's one minute); the order tick keeps its own two minutes.
TICK_SECONDS = 30
_ORDERS_EVERY = max(1, PRODUCT_ORDERS_INTERVAL_MINUTES * 60 // TICK_SECONDS)


def run_once(tick: int) -> list[str]:
    """One wake-up. Returns the names of the jobs it ran (for the log and the
    tests). Each job swallows its own exceptions, so this never raises."""
    from app import startup
    from app.routers.product_orders import product_orders_enabled

    ran: list[str] = []
    startup._run_email_outbox_job()
    ran.append("email_outbox")
    if tick % _ORDERS_EVERY == 0 and product_orders_enabled():
        startup._run_product_order_jobs()
        ran.append("product_orders")
    return ran


def main(stop: threading.Event | None = None, max_ticks: int | None = None) -> int:
    """Loop until SIGTERM / SIGINT (Railway sends SIGTERM on a redeploy).
    The wait is interruptible, and a stop also ends the email batch between
    rows (email_outbox.STOP), so the process exits after the row in flight
    (at most one Resend call, 10 s). The order tick is not interrupted: it
    finishes its own batch first. Each job commits row by row.

    MEH-3535 review: refuses to start without RESEND_API_KEY. A keyless
    worker would leave every row to the web process after the switch-over
    and nobody would see it; a crash-looping service on Railway is seen."""
    from app.config import settings
    from app.services import email_outbox

    if not settings.resend_api_key:
        log.error("worker_refused_no_resend_key")
        return 1
    stop = stop or threading.Event()
    email_outbox.STOP.clear()

    def _stop(_signum: int, _frame: FrameType | None) -> None:
        # Only set events here: logging inside a signal handler is not
        # re-entrancy safe. "worker_stopped" below says it happened.
        stop.set()
        email_outbox.STOP.set()

    if threading.current_thread() is threading.main_thread():
        signal.signal(signal.SIGTERM, _stop)
        signal.signal(signal.SIGINT, _stop)

    log.info("worker_started", tick_seconds=TICK_SECONDS)
    tick = 0
    while not stop.is_set():
        ran = run_once(tick)
        if ran:
            log.info("worker_tick", tick=tick, ran=ran)
        tick += 1
        if max_ticks is not None and tick >= max_ticks:
            break
        stop.wait(TICK_SECONDS)
    log.info("worker_stopped", ticks=tick)
    email_outbox.STOP.clear()
    return 0


if __name__ == "__main__":
    from app.logging_config import configure_logging
    from app.sentry import init_sentry

    configure_logging()
    init_sentry()
    raise SystemExit(main())
