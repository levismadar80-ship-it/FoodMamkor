from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.rate_limit import limiter
from app.routers import admin, admin_extra, auth, events, favorites, home_products, marketing, producer_me, producers, recipes, reports, reviews, upload


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
        conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables and seed on startup
    from app.database import Base, engine
    from app.models import models  # noqa: F401 — ensure models are registered

    Base.metadata.create_all(bind=engine)
    _migrate_columns(engine)

    from seed_data import seed

    seed()
    yield


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
app.include_router(reviews.router)


@app.get("/")
def root():
    return {"message": "מהמקור API - ברוכים הבאים"}
