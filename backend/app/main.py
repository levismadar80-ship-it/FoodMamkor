import asyncio
import logging
import os
import sys
import traceback
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.rate_limit import limiter
from app.routers import admin, admin_experiences, admin_extra, admin_outreach, auth, chat, events, experiences, favorites, home_products, marketing, producer_me, producers, recipes, referrals, reports, reviews, search, upload, users_me

# Force stdout to be unbuffered so Railway's log panel shows startup
# messages in real time. Without this, Python buffers until the process
# writes a newline + the buffer fills, which can swallow early-boot
# errors entirely in container environments.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("mehamakor.startup")


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


def _migrate_columns(engine):
    """Add columns that were added to models after initial table creation."""
    from sqlalchemy import text

    migrations = [
        ("producers", "plan", "VARCHAR(20) DEFAULT 'free'"),
        ("users", "phone", "VARCHAR(20)"),
        ("users", "google_id", "VARCHAR(200)"),
        ("producers", "last_active_at", "TIMESTAMP DEFAULT NOW()"),
        ("home_products", "available_until", "TIMESTAMP"),
        ("users", "apple_id", "VARCHAR(200)"),
        ("producers", "slug", "VARCHAR(100)"),
        ("producers", "top_product_name", "VARCHAR(200)"),
        ("producers", "starting_price_label", "VARCHAR(50)"),
        ("producers", "contact_name", "VARCHAR(200)"),
        ("producers", "short_description", "TEXT"),
        ("producers", "whatsapp_group", "VARCHAR(300)"),
        ("producers", "price_range", "VARCHAR(100)"),
        ("producers", "grass_fed", "BOOLEAN DEFAULT FALSE"),
        ("producers", "organic_certified", "BOOLEAN DEFAULT FALSE"),
        ("producers", "has_delivery", "BOOLEAN DEFAULT FALSE"),
        ("producers", "pickup_points", "BOOLEAN DEFAULT FALSE"),
        ("producers", "kosher", "VARCHAR(50)"),
        ("producers", "admin_notes", "TEXT"),
        ("users", "is_blocked", "BOOLEAN DEFAULT FALSE"),
        ("producers", "is_available_today", "BOOLEAN DEFAULT FALSE"),
        ("home_products", "moderation_status", "VARCHAR(20) DEFAULT 'APPROVED'"),
        ("home_products", "moderation_reason", "TEXT"),
        ("home_products", "moderation_suggestion", "TEXT"),
        ("home_products", "category", "VARCHAR(50)"),
        ("home_products", "prep_date", "DATE"),
        ("home_products", "expiry_date", "DATE"),
        ("home_products", "storage_type", "VARCHAR(30)"),
        ("home_products", "allergens", "TEXT"),
        ("home_products", "kosher", "VARCHAR(30)"),
        ("home_products", "is_organic", "BOOLEAN DEFAULT FALSE"),
        ("home_products", "unit", "VARCHAR(30)"),
        ("home_products", "delivery_method", "VARCHAR(30)"),
        ("home_products", "location_notes", "TEXT"),
        ("home_products", "images", "TEXT[] DEFAULT ARRAY[]::TEXT[]"),
        ("producers", "avg_rating", "FLOAT DEFAULT 0"),
        ("producers", "reviews_count", "INTEGER DEFAULT 0"),
        ("home_products", "street", "VARCHAR(200)"),
        ("home_products", "zip_code", "VARCHAR(20)"),
        # feature/producer-analytics — DAU tracking on /admin/dashboard.
        # Nullable so pre-existing users don't get backfilled to NOW().
        ("users", "last_active_at", "TIMESTAMP"),
        # MEH-12 — durable availability status (available | full | vacation).
        ("producers", "availability_status", "VARCHAR(20) DEFAULT 'available'"),
        # MEH-17 — flexible contact methods. Producers pick one of
        # whatsapp | phone | website | email as the CTA channel.
        ("producers", "primary_contact_method", "VARCHAR(20) DEFAULT 'whatsapp'"),
        ("producers", "contact_email", "VARCHAR(200)"),
        # MEH-18 — manual editorial "מומלץ" badge.
        ("producers", "is_recommended", "BOOLEAN DEFAULT FALSE"),
        # MEH-49 — referral code (unique short code per user).
        ("users", "referral_code", "VARCHAR(20)"),
    ]
    with engine.connect() as conn:
        for table, column, col_type in migrations:
            conn.execute(text(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}"
            ))
        # Unique index on slug (allow nulls)
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_producers_slug ON producers (slug) WHERE slug IS NOT NULL"
        ))
        # MEH-49: unique index on referral_code (allow nulls for pre-existing users)
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_referral_code ON users (referral_code) WHERE referral_code IS NOT NULL"
        ))
        # Make password_hash nullable for Google OAuth users
        conn.execute(text(
            "ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL"
        ))
        # Legacy: drop the PostGIS geometry column from any older deployment.
        # We now compute distance with Haversine directly against lat/lng,
        # so no extension is required. Safe no-op if the column is absent.
        conn.execute(text(
            "ALTER TABLE producers DROP COLUMN IF EXISTS location"
        ))
        # Make sure a plain b-tree index exists for the Haversine WHERE's
        # lat/lng IS NOT NULL prefilter.
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_producers_lat_lng ON producers (lat, lng)"
        ))
        conn.commit()


def _run_db_init_sync() -> None:
    """
    The actual blocking DB init work: create_all + migrations + seed.
    Runs in a worker thread via asyncio.to_thread so it can never block
    uvicorn's event loop or starve the /health endpoint.

    Every step logs [bg 1/4]..[bg 4/4] so progress is visible in Railway
    logs even when it takes minutes on a cold DB.
    """
    log.info("[bg 1/4] importing models...")
    from app.database import Base, engine
    from app.models import models  # noqa: F401 — ensure models are registered
    log.info("[bg 1/4] models imported OK")

    log.info("[bg 2/4] Base.metadata.create_all...")
    Base.metadata.create_all(bind=engine)
    log.info("[bg 2/4] create_all OK")

    log.info("[bg 3/4] running column migrations...")
    _migrate_columns(engine)
    log.info("[bg 3/4] column migrations OK")

    log.info("[bg 4/4] running seed_data.seed()...")
    from seed_data import seed
    seed()
    log.info("[bg 4/4] seed OK")


async def _init_db_background(app: FastAPI) -> None:
    """
    Wrapper that runs _run_db_init_sync() in a thread and catches any
    exception. Runs as a fire-and-forget asyncio task from lifespan.
    Records the final state on app.state.db_init_status so /health can
    report it accurately.
    """
    try:
        await asyncio.to_thread(_run_db_init_sync)
        log.info("background DB init complete — all tables/migrations/seed ready")
        app.state.db_init_status = "ready"
    except Exception:
        log.error("background DB init FAILED — /producers et al will 500 until fixed")
        log.error("traceback follows:\n%s", traceback.format_exc())
        app.state.db_init_status = "failed"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    On startup: log environment, kick off DB init in the background,
    and IMMEDIATELY yield so uvicorn starts accepting connections.

    CRITICAL design choice: DB init runs as an asyncio background task,
    NOT inline. This means /health responds within a second of container
    start regardless of DB state — the container is "healthy" from
    Railway's perspective as long as uvicorn is alive, which decouples
    the HTTP server from DB availability. Any DB errors show up in the
    logs via [bg X/4] markers and a loud STARTUP FAILED traceback.

    Previous versions ran create_all() inline in lifespan. That worked
    when the DB was fast but HUNG uvicorn forever when the DB was slow
    or unreachable, because psycopg2's connect_timeout only covers the
    initial TCP handshake — subsequent operations can hang indefinitely.
    The container would then fail its healthcheck and get killed before
    it could even emit a traceback.
    """
    log.info("=" * 60)
    log.info("mehamakor backend starting up")
    log.info("DATABASE_URL  = %s", _redacted_db_url())
    log.info("PORT          = %s", os.getenv("PORT", "<unset, default 8000>"))
    log.info("SECRET_KEY set= %s", "yes" if os.getenv("SECRET_KEY") else "no (using default)")
    log.info("ADMIN_EMAIL   = %s", os.getenv("ADMIN_EMAIL") or "<unset>")
    log.info("=" * 60)
    log.info("scheduling DB init in background — /health is live NOW")

    # Fire-and-forget — no await. Uvicorn starts serving immediately.
    # Keep a reference on the app so the task isn't garbage-collected.
    app.state.db_init_status = "initializing"
    app.state.db_init_task = asyncio.create_task(_init_db_background(app))

    yield

    log.info("mehamakor backend shutting down")


app = FastAPI(title="מהמקור - MeHaMakor API", version="1.0.0", lifespan=lifespan)

# SECURITY FIX #2: rate limiting. The limiter is a module-level Limiter()
# imported from app.rate_limit so routers can decorate individual endpoints
# with `@limiter.limit("5/minute")`. The middleware hooks into FastAPI's
# request lifecycle and the exception handler converts 429s into a JSON body.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# SECURITY FIX #7: CORS origins are now read from the `CORS_ORIGINS` env var
# (comma-separated). The default in settings is local dev hosts only —
# production MUST override via env. Previously `allow_origins=["*"]`, which
# together with `allow_credentials=True` is a browser-level no-op anyway
# but still sent CORS headers for every origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)


# SECURITY FIX #8: HTTP security headers. Applied as middleware so every
# response (including errors) carries them. Kept minimal — HSTS is typically
# handled by the reverse proxy (Railway/nginx), so we don't set it here.
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


# feature/producer-analytics: lightweight request-timing middleware. Appends
# (monotonic_timestamp, duration_ms) to a bounded deque in
# app.services.analytics so /admin/dashboard can compute
# response_time_avg_ms + requests_per_minute over the last hour. Per-process
# in-memory — not durable across restarts, not shared across workers.
# Good enough for a single-operator admin dashboard; docs/SECURITY.md
# has the full v1-limitation note.
import time as _time  # noqa: E402 — local import keeps startup banner clean

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
            # Never fail a request because of metric bookkeeping.
            pass


app.include_router(auth.router)
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
# MEH-22 — admin outreach + the public prefill lookup it pairs with.
app.include_router(admin_outreach.router)
app.include_router(admin_outreach.prefill_router)
app.include_router(chat.router)
app.include_router(referrals.router)


@app.get("/")
def root():
    return {"message": "מהמקור API - ברוכים הבאים"}


@app.get("/health")
def health():
    """
    Lightweight health endpoint used by Railway's healthcheck. Must NOT
    touch the database — if DB init fails, this still has to return 200
    so Railway doesn't kill the container before we can read the logs.

    Reports the background DB init state so operators can tell whether
    /producers et al will work yet, without actually querying the DB.
    Possible db_init values: initializing, ready, failed, not_scheduled.
    """
    db_state = getattr(app.state, "db_init_status", "not_scheduled")
    return {"status": "ok", "db_init": db_state}
