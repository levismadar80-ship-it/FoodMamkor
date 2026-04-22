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
        ("producers", "gluten_free", "BOOLEAN DEFAULT FALSE"),
        ("producers", "vegan", "BOOLEAN DEFAULT FALSE"),
        ("producers", "lactose_free", "BOOLEAN DEFAULT FALSE"),
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
        ("users", "last_active_at", "TIMESTAMP"),
        ("producers", "availability_status", "VARCHAR(20) DEFAULT 'available'"),
        ("producers", "primary_contact_method", "VARCHAR(20) DEFAULT 'whatsapp'"),
        ("producers", "contact_email", "VARCHAR(200)"),
        ("producers", "is_recommended", "BOOLEAN DEFAULT FALSE"),
        ("users", "referral_code", "VARCHAR(20)"),
        ("producers", "story_card_url", "VARCHAR(500)"),
        ("producers", "phone_verified", "BOOLEAN DEFAULT FALSE"),
        ("producers", "ambassador", "BOOLEAN DEFAULT FALSE"),
        ("producers", "kashrut_badges", "TEXT[] DEFAULT '{}'"),
        ("producers", "kashrut_verified_at", "TIMESTAMP"),
        ("producers", "kashrut_expires_at", "TIMESTAMP"),
        ("producer_whatsapp_clicks", "user_id", "UUID REFERENCES users(id) ON DELETE SET NULL"),
        ("users", "is_producer", "BOOLEAN DEFAULT FALSE"),
        ("users", "avatar_url", "VARCHAR"),
        ("producers", "vacation_until", "DATE"),
        ("producers", "opening_hours", "TEXT"),
        ("producers", "has_physical_location", "BOOLEAN NOT NULL DEFAULT TRUE"),
        ("producers", "offers_delivery", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("producers", "delivery_nationwide", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("producers", "delivery_cities", "TEXT[] NOT NULL DEFAULT '{}'"),
        ("users", "reset_token", "VARCHAR(64)"),
        ("users", "reset_token_expires_at", "TIMESTAMP"),
        ("producers", "custom_questions", "TEXT[]"),
        # MEH-103 — admin can hide abusive reviews without deleting them.
        ("producer_reviews", "is_hidden", "BOOLEAN DEFAULT FALSE"),
        # MEH-88 — product image thumbnails.
        ("products", "image_url", "TEXT"),
    ]
    with engine.connect() as conn:
        conn.execute(text(
            """
            CREATE TABLE IF NOT EXISTS producer_whatsapp_clicks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                producer_id UUID NOT NULL REFERENCES producers(id) ON DELETE CASCADE,
                user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                clicked_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
            """
        ))
        conn.execute(text(
            """
            CREATE TABLE IF NOT EXISTS producer_contact_clicks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                producer_id UUID NOT NULL REFERENCES producers(id) ON DELETE CASCADE,
                user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                method VARCHAR(20) NOT NULL,
                ip_hash VARCHAR(64),
                clicked_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
            """
        ))
        conn.execute(text(
            """
            CREATE INDEX IF NOT EXISTS ix_contact_clicks_producer_at
            ON producer_contact_clicks (producer_id, clicked_at)
            """
        ))
        for table, column, col_type in migrations:
            conn.execute(text(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}"
            ))
        conn.execute(text(
            """
            CREATE TABLE IF NOT EXISTS cities (
                id SERIAL PRIMARY KEY,
                name_he TEXT UNIQUE NOT NULL,
                lat DOUBLE PRECISION,
                lng DOUBLE PRECISION,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        ))
        conn.execute(text(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'producer_location_mode'
                ) THEN
                    ALTER TABLE producers ADD CONSTRAINT producer_location_mode
                        CHECK (has_physical_location OR offers_delivery);
                END IF;
            END $$
            """
        ))
        conn.execute(text(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'delivery_nationwide_xor_cities'
                ) THEN
                    ALTER TABLE producers ADD CONSTRAINT delivery_nationwide_xor_cities
                        CHECK (NOT (delivery_nationwide AND array_length(delivery_cities, 1) > 0));
                END IF;
            END $$
            """
        ))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_producers_slug ON producers (slug) WHERE slug IS NOT NULL"
        ))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_referral_code ON users (referral_code) WHERE referral_code IS NOT NULL"
        ))
        conn.execute(text(
            "ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL"
        ))
        conn.execute(text(
            "ALTER TABLE producers DROP COLUMN IF EXISTS location"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_producers_lat_lng ON producers (lat, lng)"
        ))
        conn.execute(text(
            """
            CREATE TABLE IF NOT EXISTS search_queries (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                query TEXT NOT NULL,
                results_count INTEGER NOT NULL DEFAULT 0,
                searched_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
            """
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_producers_name ON producers USING gin(to_tsvector('simple', name))"
        ))
        from app.slug_utils import RESERVED_SLUGS
        reserved_list = ", ".join(f"'{s}'" for s in RESERVED_SLUGS)
        rows = conn.execute(text(
            f"SELECT id, slug FROM producers WHERE slug IN ({reserved_list})"
        )).fetchall()
        for row in rows:
            old_slug = row[1]
            counter = 2
            new_slug = f"{old_slug}-{counter}"
            while True:
                taken = conn.execute(
                    text("SELECT 1 FROM producers WHERE slug = :s AND id != :id"),
                    {"s": new_slug, "id": str(row[0])},
                ).first()
                if not taken:
                    break
                counter += 1
                new_slug = f"{old_slug}-{counter}"
            conn.execute(
                text("UPDATE producers SET slug = :new WHERE id = :id"),
                {"new": new_slug, "id": str(row[0])},
            )
            log.warning("[MEH-148] renamed reserved slug '%s' → '%s' for producer %s", old_slug, new_slug, row[0])
        conn.execute(text(
            """
            CREATE TABLE IF NOT EXISTS category_requests (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                requested_name VARCHAR(100) NOT NULL,
                examples TEXT,
                producer_id UUID REFERENCES producers(id) ON DELETE SET NULL,
                status VARCHAR(20) DEFAULT 'pending' NOT NULL,
                admin_notes TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
                reviewed_at TIMESTAMPTZ
            )
            """
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_category_requests_status ON category_requests(status)"
        ))
        result = conn.execute(text(
            "UPDATE producers SET availability_status = 'available', vacation_until = NULL"
            " WHERE availability_status = 'vacation'"
            "   AND vacation_until IS NOT NULL"
            "   AND vacation_until < CURRENT_DATE"
            " RETURNING id"
        ))
        cleared = result.rowcount
        if cleared:
            log.info("[MEH-155] cleared expired vacation status for %d producer(s)", cleared)
        # admin_settings — key-value store for admin-controlled site config.
        # Guard needed for existing Railway deployments that predate this table.
        conn.execute(text(
            """
            CREATE TABLE IF NOT EXISTS admin_settings (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT,
                updated_at TIMESTAMP DEFAULT NOW()
            )
            """
        ))
        conn.commit()


def _run_db_init_sync() -> None:
    log.info("[bg 1/4] importing models...")
    from app.database import Base, engine
    from app.models import models  # noqa: F401
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
