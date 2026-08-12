import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from urllib.parse import urlparse

import structlog
from fastapi import FastAPI

from app.config import settings
from app.sentry import capture_background_exception

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


# MEH-1319: the app assumes a SINGLE Railway replica / single Uvicorn worker.
# Everything in-process depends on it: the APScheduler jobs (MEH-539 onboarding
# follow-ups + the auto-reply watchdog → a 2nd worker sends DUPLICATE emails),
# the slowapi in-memory rate-limit store (per-worker → effective limit ×N),
# the analytics metrics deque, the trending cache, and the JWKS cache. No
# distributed lock coordinates workers. Railway's worker count is Sapir-domain,
# so this is a loud boot ERROR, never a crash.
_WORKER_COUNT_ENV_VARS = ("WEB_CONCURRENCY", "UVICORN_WORKERS")


def _check_single_replica(worker_values: dict[str, str | None]) -> str | None:
    """MEH-1319: warn (log-only) when the process is configured for >1 worker.

    `worker_values` maps each recognized worker-count env var name to its raw
    value (None when unset). Returns a loud message naming the consequences
    when any value parses to an int > 1; None otherwise. Fail-open: unset or
    unparseable values are treated as "not >1" (the platform default is a
    single worker), so a typo never blocks boot. Never raises. Mirrors the
    pure-helper structure of _check_frontend_url_consistency above.
    """
    for name, raw in worker_values.items():
        if raw is None:
            continue
        try:
            count = int(str(raw).strip())
        except (TypeError, ValueError):
            continue
        if count > 1:
            return (
                f"{name}={count} configures {count} workers, but mehamakor "
                "assumes a SINGLE replica/worker. Multiple workers cause: "
                "duplicate APScheduler jobs (double onboarding emails + "
                "watchdog runs), per-worker slowapi rate limits (effective "
                f"limit ×{count}), and fragmented in-memory metrics/caches "
                "(analytics deque, trending, JWKS). Keep the count at 1, or "
                "move these mechanisms to a shared store first."
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
    except Exception as exc:
        # MEH-1533: capture BEFORE the structlog call — a capture that FOLLOWS a
        # logging call in the same except block can be dropped by Sentry event
        # deduplication (getsentry/sentry-python#1468).
        capture_background_exception(exc, task="db_init")
        # MEH-1905 §6.3: this line used to read "/producers et al will 500 until
        # fixed". That was MEASURED FALSE on production 04/08 — with
        # db_init_status already "failed", /producers, /stats, /categories and
        # /events/upcoming all returned 200 (docs/research/health-endpoint-db-init-phase0.md).
        #
        # It is false because of what _run_db_init_sync actually does: create_all
        # with checkfirst (a no-op once the tables exist — prod builds its schema
        # with Alembic) followed by seed(). The realistic failure is seed()
        # raising against a schema that is already present and already serving,
        # which breaks nothing a reader can see.
        #
        # A log line that predicts 5xx sends whoever finds it hunting an outage
        # that is not happening, and — worse — makes the REAL consequence
        # (readiness is 503 while the /health alias still hard-codes "ok") look
        # like the lesser half. Say what is known, not what sounds alarming.
        log.error(
            "background DB init failed — create_all/seed did not complete. "
            "/health/readiness will report 503; endpoints may still serve "
            "normally if the schema was already present (MEH-1905).",
            exc_info=True,
        )
        app.state.db_init_status = "failed"

    # MEH-1596: cache the alembic revision ONCE, here, so GET /health can
    # publish it without a per-request DB round-trip. Reuses the reader that
    # /health/readiness already owns (app/routers/health.py) rather than adding
    # a second query path for the same fact.
    #
    # Runs after the try/except and outside it on purpose:
    #   - after  — this is the background task, already off the boot path via
    #              create_task + to_thread, so it adds no boot latency and
    #              cannot delay or fail the Railway healthcheck.
    #   - outside — a seed() crash sets db_init="failed" but the DB may still
    #              hold a perfectly valid revision; reporting it is strictly
    #              more useful when diagnosing exactly that failure.
    # Fully guarded: _read_alembic_head already swallows its own errors, and
    # this second net covers an import or thread failure. There is no retry —
    # one read, cached, per the MEH-1596 no-per-request-query constraint.
    try:
        from app.routers.health import _read_alembic_head

        app.state.alembic_head = (
            await asyncio.to_thread(_read_alembic_head) or "unknown"
        )
    except Exception:
        log.warning("alembic head unreadable at startup — /health reports 'unknown'")
        app.state.alembic_head = "unknown"


def _run_followup_job() -> None:
    """MEH-539: daily APScheduler tick. Opens a fresh DB session per run
    (the BackgroundScheduler worker thread does not share the request-scoped
    Session), invokes each sender, and logs its counts. Any exception is
    swallowed so the scheduler thread itself never dies — both senders
    already fail-isolate per producer.

    MEH-1824: the two passes get INDEPENDENT try/except blocks. They shared
    one until this change, which cost two things: a session-level failure in
    send_due_followups (raised outside its own per-producer loop) skipped the
    pending nudge entirely for that day, and a failure in the nudge pass was
    reported to Sentry under `task="onboarding_followups"` — the wrong stream
    to be reading when debugging it. Neither sender is a precondition for the
    other, so neither should be able to suppress or mislabel the other.
    """
    from app.database import SessionLocal
    from app.services.onboarding_followup import send_due_followups
    from app.services.pending_nudge import send_pending_nudges

    db = SessionLocal()
    try:
        try:
            counts = send_due_followups(db)
            log.info("[FOLLOWUP] daily run complete counts=%s", counts)
        except Exception as exc:
            # MEH-1824: roll back BEFORE anything else. A DB-level failure
            # (OperationalError/ProgrammingError on the candidate query) leaves
            # the Session in a needs-rollback state, and the very next query on
            # it raises PendingRollbackError/InternalError instead of running.
            # Without this the isolation above would hold only for Python-level
            # errors and collapse for exactly the class most likely to occur —
            # the nudge pass would still be skipped, just with a nudge-shaped
            # error message. Measured, not assumed: poisoned session → pass 2
            # raises InternalError; after rollback → pass 2 succeeds.
            # Invariant for this function: every except leaves the session
            # usable for whatever runs next.
            db.rollback()
            # MEH-1533: same capture-before-log ordering as _init_db_background.
            # Daily cadence — cannot flood the Sentry quota.
            capture_background_exception(exc, task="onboarding_followups")
            log.error("[FOLLOWUP] daily run crashed", exc_info=True)

        # MEH-1818: the day-1 pending nudge shares this daily tick rather than
        # registering its own job — same single-replica assumption, same 10:00
        # UTC cadence. MEH-1824: reached even when the block above raised.
        try:
            nudges = send_pending_nudges(db)
            log.info("[PENDING-NUDGE] daily run complete counts=%s", nudges)
        except Exception as exc:
            # Same rollback for the same reason. Nothing runs after this today,
            # so `finally: db.close()` would cover it — but the invariant is
            # per-block, not "all but the last", so that appending a third pass
            # here cannot silently reintroduce the bug this ticket fixed.
            db.rollback()
            # Its own Sentry task tag: `background_task:pending_nudge` is a
            # separate filterable stream from the follow-up sequence.
            capture_background_exception(exc, task="pending_nudge")
            log.error("[PENDING-NUDGE] daily run crashed", exc_info=True)
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
    except Exception as exc:
        # MEH-1533: captured despite the 5-min cadence — run_watchdog() is
        # fail-isolated per message and never raises (see its docstring), so
        # reaching this handler is genuinely exceptional, and the job is only
        # registered when WATCHDOG_ENABLED is true (default False, PR2c gate).
        # Worst case is one Sentry ISSUE with repeated events, not a new issue
        # per tick — judged not a quota-flood risk.
        capture_background_exception(exc, task="auto_reply_watchdog")
        log.error("[WATCHDOG] tick crashed", exc_info=True)
    finally:
        db.close()


def _run_full_week_expiry_job() -> None:
    """MEH-1828: weekly APScheduler tick at the Israel-week rollover. Resets
    every producer left on availability_state='full_this_week' back to
    'accepting_orders' (three columns — the live legacy pair too, see the
    service docstring), so "עמוסה השבוע" cannot outlive the week it names.

    Same shape as _run_followup_job: fresh session (the scheduler worker
    thread cannot share request-scoped sessions), rollback-before-report on
    failure so the session stays usable (MEH-1824 invariant), own Sentry
    task tag, and the exception swallowed so the scheduler thread never dies.
    """
    from app.database import SessionLocal
    from app.services.availability_expiry import reset_expired_full_week

    db = SessionLocal()
    try:
        changed = reset_expired_full_week(db)
        log.info("[FULL-WEEK-EXPIRY] weekly run complete changed=%d", changed)
    except Exception as exc:
        # reset_expired_full_week already rolled back before re-raising, so
        # the MEH-1824 session-usable invariant holds; this handler only
        # reports. Weekly cadence — no Sentry flood risk.
        capture_background_exception(exc, task="full_week_expiry")
        log.error("[FULL-WEEK-EXPIRY] weekly run crashed", exc_info=True)
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

    # MEH-1319: single-replica invariant guard. Log-only (never crashes) —
    # Railway's worker/replica count is Sapir-domain. Logged among the boot
    # diagnostics, before the email fail-loud below.
    _replica_issue = _check_single_replica(
        {name: os.getenv(name) for name in _WORKER_COUNT_ENV_VARS}
    )
    if _replica_issue:
        log.error("SINGLE-REPLICA INVARIANT: %s", _replica_issue)

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

    # MEH-1596: boot facts published by GET /health, stored on app.state
    # alongside db_init_status (the same mechanism, the same place — no second
    # state holder). Both are set SYNCHRONOUSLY here so the keys exist from the
    # first request onward; alembic_head is then overwritten once by
    # _init_db_background. If that task fails, is cancelled, or never runs,
    # "unknown" is what /health reports — never a missing key and never a raise.
    #
    # UTC, deliberately: app/utils/clock.py is Asia/Jerusalem for availability
    # and vacation logic; a deploy timestamp is infrastructure, read by whoever
    # is looking at logs, so it stays UTC per the MEH-1596 spec.
    app.state.booted_at = datetime.now(timezone.utc).isoformat()
    app.state.alembic_head = "unknown"

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
    # MEH-1828: weekly full_this_week reset at the Israel-week rollover.
    # The TRIGGER carries its own timezone (Asia/Jerusalem) even though the
    # scheduler default is UTC — a fixed UTC hour would drift an hour across
    # IST/IDT transitions, and "the week rolls over" is an Israel-calendar
    # fact, not a UTC one. 00:10 rather than 00:00 so a producer setting the
    # state ON Sunday is racing a 10-minute window, not the boundary itself.
    # coalesce=True + a 6h grace: a brief pause spanning the fire time runs
    # the reset once, late, instead of skipping the week. Known limitation,
    # accepted under option A (no schema): a full process restart that SPANS
    # Sunday 00:10 loses that week's fire — BackgroundScheduler holds no
    # persistent state, so the banner then lives until manual change or the
    # next rollover. Fixing that needs a set-at column (option B, RED).
    followup_scheduler.add_job(
        _run_full_week_expiry_job,
        CronTrigger(day_of_week="sun", hour=0, minute=10, timezone="Asia/Jerusalem"),
        id="meh_1828_full_week_expiry_weekly",
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=6 * 3600,
    )
    followup_scheduler.start()
    app.state.followup_scheduler = followup_scheduler
    log.info("[FOLLOWUP] scheduler started — daily 10:00 UTC")

    yield

    log.info("[FOLLOWUP] stopping scheduler")
    followup_scheduler.shutdown(wait=False)
    log.info("mehamakor backend shutting down")
