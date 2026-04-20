import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import admin, admin_extra, auth, favorites, home_products, marketing, producer_me, producers, recipes, reports, upload

logger = logging.getLogger("scheduler")


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
        # Contact messages table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS contact_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(200) NOT NULL,
                email VARCHAR(200) NOT NULL,
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        # Newsletter subscribers table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS newsletter_subscribers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(200) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
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

    # Start scheduler (fail-open: never crash on scheduler issues)
    scheduler = None
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler

        from app.services.scheduled_jobs import check_inactive_producers, check_kashrut_expiry

        scheduler = AsyncIOScheduler()
        scheduler.add_job(check_inactive_producers, "cron", hour=3, minute=0, id="inactive_producers")
        scheduler.add_job(check_kashrut_expiry, "cron", hour=3, minute=30, id="kashrut_expiry")
        scheduler.start()
        logger.info("Scheduler started with 2 jobs: inactive_producers (03:00), kashrut_expiry (03:30)")
    except Exception as e:
        logger.error("Failed to start scheduler: %s", e)

    yield

    if scheduler:
        try:
            scheduler.shutdown(wait=False)
        except Exception:
            pass


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
app.include_router(marketing.router)


@app.get("/")
def root():
    return {"message": "מהמקור API - ברוכים הבאים"}
