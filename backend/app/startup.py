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


def _check_frontend_url_consistency(env: str, frontend_url: str) -> list[str]:
    """MEH-334: defense-in-depth boot guard for FRONTEND_URL drift.

    Returns the list of mismatch reasons (empty == OK). Caller logs WARNING
    per reason — never raises so boot continues even if drift is present
    (rollback strategies depend on this).

    Recurrence prevention for MEH-332: FRONTEND_URL was bulk-copied from
    production into staging Railway env vars and went undetected for ~3
    weeks because every staging email link pointed to the production host.
    """
    e = (env or "").lower()
    url = (frontend_url or "").lower()
    issues: list[str] = []
    if e == "staging" and "staging." not in url:
        issues.append("env=staging but frontend_url missing 'staging.' prefix")
    if e == "production" and ("staging" in url or "localhost" in url):
        issues.append("env=production but frontend_url points at staging/localhost")
    if e == "development" and "mehamakor.online" in url:
        issues.append("env=development but frontend_url points at mehamakor.online")
    return issues


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

    app.state.db_init_status = "initializing"
    app.state.db_init_task = asyncio.create_task(_init_db_background(app))

    yield

    log.info("mehamakor backend shutting down")
