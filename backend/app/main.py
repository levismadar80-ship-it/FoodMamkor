import asyncio
import os
from contextlib import asynccontextmanager
from urllib.parse import urlparse

import structlog
from asgi_correlation_id import CorrelationIdMiddleware
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.logging_config import configure_logging
from app.rate_limit import limiter
from app.routers import admin, admin_experiences, admin_extra, admin_kashrut, admin_outreach, alerts, auth, chat, cities, events, experiences, favorites, group_buys, home_products, marketing, producer_me, producers, recipes, referrals, reports, reviews, search, upload, users_me

configure_logging()
log = structlog.get_logger("mehamakor.startup")


def _redacted_db_url() -> str:
    """Log-safe version of DATABASE_URL: scheme + host + db only, no password."""
    raw = os.getenv("DATABASE_URL", "")
    if not raw:
        return "<unset>"
    try:
        p = urlparse(raw)
        host = p.hostname or "?"
        port = f":{p.port}" if p.port else ""
        db = p.path.lstrip("/") or "?"
        return f"{p.scheme}://{host}{port}/{db}"
    except Exception:
        return "<unparseable>"


# migrations managed by Alembic — see backend/alembic/


def _run_db_init_sync() -> None:
    log.info("[bg 1/2] importing models...")
    from app.models import models  # noqa: F401
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
        log.error("background DB init failed — /producers et al will 500 until fixed", exc_info=True)
        app.state.db_init_status = "failed"


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("=" * 60)
    log.info("mehamakor backend starting up")
    log.info("DATABASE_URL  = %s", _redacted_db_url())
    log.info("PORT          = %s", os.getenv("PORT", "<unset, default 8000>"))
    log.info("SECRET_KEY set= %s", "yes" if os.getenv("SECRET_KEY") else "no (using default)")
    log.info("ADMIN_EMAIL   = %s", os.getenv("ADMIN_EMAIL") or "<unset>")
    log.info("=" * 60)
    log.info("scheduling DB init in background — /health is live NOW")

    _missing = [
        name for name, val in [
            ("ADMIN_EMAIL", settings.admin_email),
            ("RESEND_API_KEY", settings.resend_api_key),
            ("TWILIO_ACCOUNT_SID", settings.twilio_account_sid),
        ] if not val
    ]
    if _missing:
        log.warning(
            "⚠️ Optional env vars not set — some features disabled: %s",
            ", ".join(_missing),
        )

    app.state.db_init_status = "initializing"
    app.state.db_init_task = asyncio.create_task(_init_db_background(app))

    yield

    log.info("mehamakor backend shutting down")


app = FastAPI(title="מהמקור - MeHaMakor API", version="1.0.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(CorrelationIdMiddleware, header_name="X-Request-ID")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=(self)"
    )
    return response


import time as _time  # noqa: E402

from app.services.analytics import record_request  # noqa: E402


@app.middleware("http")
async def record_request_metrics(request: Request, call_next) -> Response:
    start = _time.monotonic()
    try:
        response: Response = await call_next(request)
        return response
    finally:
        duration_ms = (_time.monotonic() - start) * 1000.0
        try:
            record_request(duration_ms)
        except Exception:
            log.debug("[metrics] record_request failed (non-fatal)", exc_info=True)


app.include_router(auth.router)
app.include_router(cities.router)
app.include_router(producers.router)
app.include_router(favorites.router)
app.include_router(producer_me.router)
app.include_router(admin.router)
app.include_router(admin_extra.router)
app.include_router(recipes.router)
app.include_router(home_products.router)
app.include_router(reports.router)
app.include_router(upload.router)
app.include_router(marketing.router)
app.include_router(events.router)
app.include_router(experiences.router)
app.include_router(admin_experiences.router)
app.include_router(reviews.router)
app.include_router(search.router)
app.include_router(users_me.router)
app.include_router(admin_outreach.router)
app.include_router(admin_outreach.prefill_router)
app.include_router(chat.router)

from app.routers import category_requests  # noqa: E402
app.include_router(category_requests.router)
app.include_router(referrals.router)
app.include_router(group_buys.router)
app.include_router(group_buys.admin_router)
app.include_router(alerts.router)
app.include_router(admin_kashrut.router)


@app.get("/push-vapid-key")
def get_vapid_public_key():
    """Return the VAPID public key for the frontend push subscription."""
    from app.config import settings
    return {"public_key": settings.vapid_public_key or ""}


@app.get("/holiday-mode")
@limiter.limit("60/minute")
def get_holiday_mode(request: Request):
    """Return holiday-mode state for the frontend banner.

    MEH-247 — reads the same admin_settings keys the /admin/settings page
    writes (`holiday_override_enabled`, `holiday_override_key`), and returns
    the `{enabled, key}` shape the `HolidayBanner` component consumes.
    Prior to this fix the endpoint read different keys and returned a
    `{active, banner_text}` shape, so the banner never lit up.
    """
    from app.database import SessionLocal
    from app.models.models import AdminSetting
    db = None
    try:
        db = SessionLocal()
        rows = db.query(AdminSetting).filter(
            AdminSetting.key.in_(["holiday_override_enabled", "holiday_override_key"])
        ).all()
        kv = {r.key: r.value for r in rows}
        return {
            "enabled": (kv.get("holiday_override_enabled") or "false").lower() == "true",
            "key": kv.get("holiday_override_key") or None,
        }
    finally:
        if db is not None:
            db.close()


@app.get("/")
def root():
    return {"message": "מהמקור API - ברוכים הבאים"}


@app.api_route("/health", methods=["GET", "HEAD"])
def health():
    db_state = getattr(app.state, "db_init_status", "not_scheduled")
    return {"status": "ok", "db_init": db_state}
