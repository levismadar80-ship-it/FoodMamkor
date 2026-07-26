"""MEH-500: backend Sentry SDK init.

Activates the MEH-483 + MEH-493 ``SentryRequestScopeMiddleware`` shim
by making ``sentry_sdk`` importable AND initialized. The shim's
``try: import sentry_sdk`` block (``backend/app/middleware.py:21-24``)
flips from ``None`` → live SDK once this module's ``init_sentry()``
runs at boot.

Called once from ``main.py`` BEFORE ``FastAPI()`` instantiation so any
exception during app construction is captured. Reads env via
``os.getenv`` directly (NOT ``app.config.settings``) to stay decoupled
from pydantic-settings init order.

Verify-on-staging contract: dashboard receipt is verified manually
(see PR #552 body / MEH-500 DoD). Local CC sandbox cannot reach
Sentry's ingest host (MEH-360).
"""

import logging
import os

logger = logging.getLogger(__name__)


def init_sentry() -> None:
    """Idempotent fail-open Sentry init. Call once at boot.

    No-op when ``BACKEND_SENTRY_DSN`` is unset/empty — the existing
    middleware shim continues to no-op cleanly. Never raises.
    """
    dsn = os.getenv("BACKEND_SENTRY_DSN", "").strip()
    if not dsn:
        logger.info("Sentry disabled (no BACKEND_SENTRY_DSN set)")
        return

    # Release priority (locked in MEH-500 plan): APP_VERSION (explicit
    # operator override) > RAILWAY_GIT_COMMIT_SHA (Railway-injected) >
    # "unknown" (no signal). Mirrors the precedent set by ENV defaults
    # in app/logging_config.py.
    release = (
        os.getenv("APP_VERSION", "").strip()
        or os.getenv("RAILWAY_GIT_COMMIT_SHA", "").strip()
        or "unknown"
    )
    environment = os.getenv("ENV", "development").strip() or "development"

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration

        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            release=release,
            traces_sample_rate=0.1,
            integrations=[FastApiIntegration()],
        )
        logger.info(
            "Sentry initialized (environment=%s, release=%s)",
            environment,
            release,
        )
    except Exception:
        logger.exception("Sentry init failed (continuing without Sentry)")


# MEH-1533: tag key applied to every background-task capture, so these events
# are filterable in Sentry (`background_task:db_init`) and separable from the
# request-cycle errors FastApiIntegration reports.
BACKGROUND_TASK_TAG = "background_task"


def capture_background_exception(exc: BaseException, *, task: str) -> None:
    """MEH-1533: report an otherwise-swallowed background exception to Sentry.

    Background work — ``startup._init_db_background`` (via ``asyncio.to_thread``)
    and the APScheduler jobs ``startup._run_followup_job`` /
    ``startup._run_watchdog_job`` — runs OUTSIDE the ASGI request cycle, so
    ``FastApiIntegration`` (the only integration configured in
    ``init_sentry`` above) never observes it. Each of those handlers logs via
    structlog and returns, so the failure reaches Railway stdout and nowhere
    else: a ``seed()`` crash that fired on every staging boot produced ZERO
    Sentry events in 90 days (MEH-1530 diagnosis).

    ``LoggingIntegration`` deliberately NOT used to close this: structlog is
    configured with ``logger_factory=structlog.PrintLoggerFactory(sys.stdout)``
    (``app/logging_config.py:84``), which writes straight to stdout and never
    routes through stdlib ``logging`` — so that integration would not see these
    ``log.error`` calls at all.

    Call this BEFORE the structlog ``log.error(..., exc_info=True)`` in the same
    ``except`` block: getsentry/sentry-python#1468 documents a capture that
    FOLLOWS a logging call being dropped by event deduplication.

    Fail-open by construction, mirroring ``init_sentry``: no-ops when
    ``sentry_sdk`` is absent (not installed in the CC sandbox) or uninitialised
    (``BACKEND_SENTRY_DSN`` unset), and never raises — error reporting must not
    escalate a swallowed background error into a boot failure.
    """
    try:
        import sentry_sdk
    except Exception:  # pragma: no cover — SDK absent (sandbox / minimal install)
        return

    try:
        # SDK 2.x exposes new_scope(); 1.x only push_scope(). Prefer whichever
        # the installed version provides rather than pinning to either.
        scope_factory = getattr(sentry_sdk, "new_scope", None) or getattr(
            sentry_sdk, "push_scope", None
        )
        if scope_factory is None:  # pragma: no cover — neither API present
            # Tag on the global scope so the event stays filterable even on the
            # degraded path (else it would be invisible to the Sentry filter
            # this helper's whole purpose is to make possible).
            sentry_sdk.set_tag(BACKGROUND_TASK_TAG, task)
            sentry_sdk.capture_exception(exc)
            return
        with scope_factory() as scope:
            scope.set_tag(BACKGROUND_TASK_TAG, task)
            sentry_sdk.capture_exception(exc)
    except Exception:  # pragma: no cover — reporting must never raise
        logger.exception("Sentry capture_background_exception failed for task=%s", task)
