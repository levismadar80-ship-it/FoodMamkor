import asyncio
import os
from contextlib import asynccontextmanager
from urllib.parse import urlparse

import structlog
from fastapi import FastAPI

from app.config import settings

log = structlog.get_logger("mehamakor.startup")


def _redacted_db_url() -> str:
    """Log-safe version of the resolved database URL: scheme + host + db only, no password."""
    raw = settings.database_url
    try:
        p = urlparse(raw)
        host = p.hostname or "?"
        port = f":{p.port}" if p.port else ""
        db = p.path.lstrip("/") or "?"
        return f"{p.scheme}://{host}{port}/{db}"
    except Exception:
        return "<unparseable>"


# migrations managed by Alembic — see backend/alembic/


# MEH-674: the three recognized deployment environments. ENV maps to one of
# these (config.py:39 — read from the ENV env var, NOT ENVIRONMENT). Any other
# value is a misconfiguration (typo) that would otherwise silently skip every
# drift branch below, so it gets its own warning.
_RECOGNIZED_ENVS = ("development", "staging", "production")


def _check_frontend_url_consistency(env: str, frontend_url: str) -> list[str]:
    """MEH-334: defense-in-depth boot guard for FRONTEND_URL drift.

    Returns the list of mismatch reasons (empty == OK). Caller logs WARNING
    per reason — never raises so boot continues even if drift is present
    (rollback strategies depend on this).

    Recurrence prevention for MEH-332: FRONTEND_URL was bulk-copied from
    production into staging Railway env vars and went undetected for ~3
    weeks because every staging email link pointed to the production host.

    MEH-674: also flags an unrecognized ENV value — a typo like ENV=stage
    matches none of the branches below and would otherwise pass silently,
    disabling the drift guard without any signal.
    """
    e = (env or "").lower()
    url = (frontend_url or "").lower()
    issues: list[str] = []
    if e and e not in _RECOGNIZED_ENVS:
        issues.append(
            f"unrecognized ENV value '{e}' — expected one of "
            f"{', '.join(_RECOGNIZED_ENVS)}"
        )
    if e == "staging" and "staging." not in url:
        issues.append("env=staging but frontend_url missing 'staging.' prefix")
    if e == "production" and ("staging" in url or "localhost" in url):
        issues.append("env=production but frontend_url points at staging/localhost")
    if e == "development" and "mehamakor.online" in url:
        issues.append("env=development but frontend_url points at mehamakor.online")
    return issues


# MEH-1164 (F6): environments that are expected to deliver email. A missing
# RESEND_API_KEY in one of these silently skips every verification / reset /
# welcome email — send_verify_email logs an ERROR and returns without sending
# (app/services/auth_emails.py:79-83), and send_email fail-opens to a debug
# no-op (app/services/email.py:26-30). That is exactly how F6 went unnoticed on
# staging for 20+ min: the user still saw a "check your email" ack. Dev/test
# keep the fail-open no-op (email is optional locally by design).
_EMAIL_DELIVERY_ENVS = ("staging", "production")


def _check_email_delivery_config(env: str, resend_api_key: str) -> str | None:
    """MEH-1164: fail-loud guard for the email delivery pipe.

    Returns a fatal message when ENV is staging/production but RESEND_API_KEY is
    unset — else None. The caller RAISES on a non-None result so the deploy
    fails instead of booting into a state where every email is silently dropped.
    Mirrors the JWT_SECRET_KEY production fail-fast (config.py:151-158) and the
    pure-helper structure of _check_frontend_url_consistency above.

    Root cause of F6: RESEND_API_KEY was never set on Railway staging (the
    docs/DEPLOYMENT.md provisioning table omitted it entirely), so no signal
    surfaced the gap. This guard converts that silent skip into a boot failure.
    """
    e = (env or "").lower()
    if e in _EMAIL_DELIVERY_ENVS and not resend_api_key:
        return (
            f"RESEND_API_KEY is not set but ENV={e} is expected to deliver "
            "email — every verification / password-reset / welcome email would "
            "be silently skipped (MEH-1164 F6). Set RESEND_API_KEY in Railway "
            "before deploying."
        )
    return None


def _run_db_init_sync() -> None:
    log.info("[bg 1/2] importing models...")
    from app.models import models  # noqa: F401
    from app.database import Base, engine

    Base.metadata.create_all(
        bind=engine
    )  # MEH-352: dev/CI safety net; checkfirst=True → no-op when tables exist (prod uses Alembic)
    log.info("[bg 1/2] models imported OK")

    log.info("[bg 2/2] running seed_data.seed()...")
    from seed_data import seed

    seed()
    log.info("[bg 2/2] seed OK")


async def _init_db_background(app: FastAPI) -> None:
    try:
        await asyncio.to_thread(_run_db_init_sync)
        log.info("background DB init complete — all tables/migrations/seed ready")
        app.state.db_init_status = "ready"
    except Exception:
        log.error(
            "background DB init failed — /producers et al will 500 until fixed",
            exc_info=True,
        )
        app.state.db_init_status = "failed"


def _run_followup_job() -> None:
    """MEH-539: daily APScheduler tick. Opens a fresh DB session per run
    (the BackgroundScheduler worker thread does not share the request-scoped
    Session), invokes the per-step sender, and logs the per-step counts.
    Any exception is swallowed so the scheduler thread itself never dies —
    onboarding_followup.send_due_followups already fail-isolates per producer.
    """
    from app.database import SessionLocal
    from app.services.onboarding_followup import send_due_followups

    db = SessionLocal()
    try:
        counts = send_due_followups(db)
        log.info("[FOLLOWUP] daily run complete counts=%s", counts)
    except Exception:
        log.error("[FOLLOWUP] daily run crashed", exc_info=True)
    finally:
        db.close()


def _run_watchdog_job() -> None:
    """MEH-509 PR2b: 5-min after-hours watchdog tick. Shares the same
    APScheduler instance as the MEH-539 followup job (one scheduler, two
    cron entries) so the Railway single-replica assumption is inherited
    rather than reinvented. run_watchdog() is fail-isolated per message
    and never raises; this wrapper exists only to open a fresh session
    (the worker thread can't share request-scoped sessions) and log the
    aggregate counters."""
    from app.database import SessionLocal
    from app.services.auto_reply_watchdog import run_watchdog

    db = SessionLocal()
    try:
        counters = run_watchdog(db)
        if counters.get("scanned", 0):
            log.info("[WATCHDOG] tick complete counters=%s", counters)
    except Exception:
        log.error("[WATCHDOG] tick crashed", exc_info=True)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("=" * 60)
    log.info("mehamakor backend starting up")
    log.info("db_url        = %s", _redacted_db_url())
    log.info("PORT          = %s", os.getenv("PORT", "<unset, default 8000>"))
    log.info(
        "SECRET_KEY set= %s", "yes" if os.getenv("SECRET_KEY") else "no (using default)"
    )
    log.info("ADMIN_EMAIL   = %s", os.getenv("ADMIN_EMAIL") or "<unset>")
    log.info("=" * 60)
    log.info("scheduling DB init in background — /health is live NOW")

    _missing = [
        name
        for name, val in [
            ("ADMIN_EMAIL", settings.admin_email),
            ("RESEND_API_KEY", settings.resend_api_key),
            ("WHATSAPP_ACCESS_TOKEN", settings.whatsapp_access_token),
        ]
        if not val
    ]
    if _missing:
        log.warning(
            "⚠️ Optional env vars not set — some features disabled: %s",
            ", ".join(_missing),
        )

    # MEH-334: FRONTEND_URL/ENV drift guard (recurrence prevention for MEH-332).
    for issue in _check_frontend_url_consistency(settings.env, settings.frontend_url):
        log.warning(
            "FRONTEND_URL drift: %s — emails/links will point to wrong host (frontend_url=%s)",
            issue,
            settings.frontend_url,
        )

    # MEH-1164 (F6): fail-loud if the email delivery pipe is unconfigured in an
    # environment that must send email. Raised AFTER the diagnostics above so
    # the boot log still shows db_url/PORT/missing-vars/frontend-drift before
    # the process exits. Dev/test are never affected (email fail-open stays).
    _email_config_error = _check_email_delivery_config(
        settings.env, settings.resend_api_key
    )
    if _email_config_error:
        log.error("EMAIL CONFIG FATAL: %s", _email_config_error)
        raise RuntimeError(_email_config_error)

    app.state.db_init_status = "initializing"
    app.state.db_init_task = asyncio.create_task(_init_db_background(app))

    # MEH-539: in-process daily scheduler for the 4 onboarding follow-up
    # emails. Single-replica Railway → no DB lock needed (Phase 2A decision).
    # 10:00 UTC = 13:00 Israel — after business start, before peak hours.
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger

    followup_scheduler = BackgroundScheduler(timezone="UTC")
    followup_scheduler.add_job(
        _run_followup_job,
        CronTrigger(hour=10, minute=0),
        id="meh_539_onboarding_followups_daily",
        replace_existing=True,
    )
    # MEH-509 PR2b: register the after-hours watchdog on the same
    # scheduler. Gated by WATCHDOG_ENABLED (default False) so the empty-
    # table cron does not spin until PR2c webhook receiver ships.
    # max_instances=1 + coalesce=True defend against tick overlap if a
    # single run ever exceeds the 5-min interval; misfire_grace_time
    # tolerates short pauses (e.g. brief DB hiccup) without skipping.
    if settings.watchdog_enabled:
        from apscheduler.triggers.interval import IntervalTrigger

        followup_scheduler.add_job(
            _run_watchdog_job,
            IntervalTrigger(minutes=5),
            id="meh_509_pr2b_after_hours_watchdog",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            misfire_grace_time=60,
        )
        log.info("[WATCHDOG] job registered — every 5 minutes")
    else:
        log.info("[WATCHDOG] disabled (WATCHDOG_ENABLED=false) — PR2c gate")
    followup_scheduler.start()
    app.state.followup_scheduler = followup_scheduler
    log.info("[FOLLOWUP] scheduler started — daily 10:00 UTC")

    yield

    log.info("[FOLLOWUP] stopping scheduler")
    followup_scheduler.shutdown(wait=False)
    log.info("mehamakor backend shutting down")
