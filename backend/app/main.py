from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import admin, auth, favorites, home_products, producer_me, producers, recipes, reports, upload


def _migrate_columns(engine):
    """Add columns that were added to models after initial table creation."""
    from sqlalchemy import text

    migrations = [
        ("producers", "plan", "VARCHAR(20) DEFAULT 'free'"),
        ("users", "phone", "VARCHAR(20)"),
        ("users", "google_id", "VARCHAR(200)"),
        ("producers", "last_active_at", "TIMESTAMP DEFAULT NOW()"),
        ("home_products", "available_until", "TIMESTAMP"),
    ]
    with engine.connect() as conn:
        for table, column, col_type in migrations:
            conn.execute(text(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}"
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

    _migrate_columns(engine)
    Base.metadata.create_all(bind=engine)

    from seed_data import seed

    seed()
    yield


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
app.include_router(recipes.router)
app.include_router(home_products.router)
app.include_router(reports.router)
app.include_router(upload.router)


@app.get("/")
def root():
    return {"message": "מהמקור API - ברוכים הבאים"}
