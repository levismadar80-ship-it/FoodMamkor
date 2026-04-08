import logging
import os
import sys
import traceback
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import admin, admin_extra, auth, favorites, home_products, producer_me, producers, recipes, reports, upload

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    On startup: create tables, run column migrations, seed.

    CRITICAL: each step is wrapped in try/except and logs a clear marker
    before and after. If any step fails, we log the full traceback and
    STILL yield so the HTTP server comes up — that way the /health
    endpoint responds and we can diagnose from logs instead of the app
    being a black box. Without this guard, a single DB connection error
    during boot makes the whole container look "unhealthy" with zero
    signal for debugging.
    """
    log.info("=" * 60)
    log.info("mehamakor backend starting up")
    log.info("DATABASE_URL  = %s", _redacted_db_url())
    log.info("PORT          = %s", os.getenv("PORT", "<unset, default 8000>"))
    log.info("SECRET_KEY set= %s", "yes" if os.getenv("SECRET_KEY") else "no (using default)")
    log.info("ADMIN_EMAIL   = %s", os.getenv("ADMIN_EMAIL") or "<unset>")
    log.info("=" * 60)

    try:
        log.info("[1/4] importing models...")
        from app.database import Base, engine
        from app.models import models  # noqa: F401 — ensure models are registered
        log.info("[1/4] models imported OK")

        log.info("[2/4] Base.metadata.create_all...")
        Base.metadata.create_all(bind=engine)
        log.info("[2/4] create_all OK")

        log.info("[3/4] running column migrations...")
        _migrate_columns(engine)
        log.info("[3/4] column migrations OK")

        log.info("[4/4] running seed_data.seed()...")
        from seed_data import seed
        seed()
        log.info("[4/4] seed OK")

        log.info("startup complete — yielding to uvicorn")
    except Exception:
        # Don't crash the container. Log loudly and let the HTTP server
        # come up so /health still responds and the operator can see
        # what's wrong via the usual endpoints.
        log.error("STARTUP FAILED — app will come up without seed/migration")
        log.error("traceback follows:\n%s", traceback.format_exc())

    yield

    log.info("mehamakor backend shutting down")


app = FastAPI(title="מהמקור - MeHaMakor API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


@app.get("/")
def root():
    return {"message": "מהמקור API - ברוכים הבאים"}


@app.get("/health")
def health():
    """
    Lightweight health endpoint used by Railway's healthcheck. Must NOT
    touch the database — if DB init fails, this still has to return 200
    so Railway doesn't kill the container before we can read the logs.
    """
    return {"status": "ok"}
