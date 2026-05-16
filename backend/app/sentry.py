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
