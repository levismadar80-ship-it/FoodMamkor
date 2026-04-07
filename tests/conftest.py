"""
Shared pytest fixtures for מהמקור backend tests.

Uses an isolated PostGIS-enabled test database (mehamakor_test).
Each test gets a fresh schema via create_all/drop_all.
"""
import os
import sys
import uuid

# Point the backend at the test database BEFORE importing app modules.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/mehamakor_test",
)

# Make `backend/` importable as the package root.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "backend"))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.auth import create_access_token, hash_password  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import _migrate_columns, app  # noqa: E402
from app.models.models import (  # noqa: E402
    Category,
    DeliveryArea,
    Producer,
    ProducerCategory,
    User,
)


@pytest.fixture(scope="session", autouse=True)
def _bootstrap_schema():
    """Build a clean schema once per test session."""
    # Drop everything (including admin_settings/static_pages) and recreate.
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    _migrate_columns(engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _clean_tables():
    """Truncate all tables between tests for isolation."""
    with engine.connect() as conn:
        # Disable triggers, truncate, re-enable.
        tables = [t.name for t in reversed(Base.metadata.sorted_tables)]
        if tables:
            conn.execute(
                text(f"TRUNCATE TABLE {', '.join(tables)} RESTART IDENTITY CASCADE")
            )
            conn.commit()
    yield


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    return TestClient(app)


# ---------- factory helpers ----------

def make_user(
    db,
    *,
    email: str | None = None,
    name: str = "Test User",
    role: str = "consumer",
    password: str = "Pass1234!",
    is_blocked: bool = False,
) -> User:
    user = User(
        email=email or f"u{uuid.uuid4().hex[:8]}@test.com",
        name=name,
        password_hash=hash_password(password),
        role=role,
        is_blocked=is_blocked,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def make_producer(
    db,
    *,
    name: str = "חוות הניסוי",
    city: str = "תל אביב",
    status: str = "approved",
    delivery_cities: list[str] | None = None,
    category: Category | None = None,
) -> Producer:
    producer = Producer(
        name=name,
        description="Test producer",
        city=city,
        lat=32.0853,
        lng=34.7818,
        status=status,
        is_verified=True,
    )
    db.add(producer)
    db.flush()
    if category is not None:
        db.add(ProducerCategory(producer_id=producer.id, category_id=category.id))
    for dc in delivery_cities or []:
        db.add(
            DeliveryArea(
                producer_id=producer.id,
                city=dc,
                min_order=100,
                delivery_day="ראשון",
            )
        )
    db.commit()
    db.refresh(producer)
    return producer


def make_category(db, name: str = "ירקות אורגניים", emoji: str = "🥬") -> Category:
    cat = Category(name=name, emoji=emoji)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


def auth_header(user: User) -> dict:
    token = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}


# Make helpers importable from tests
@pytest.fixture
def factories():
    return {
        "user": make_user,
        "producer": make_producer,
        "category": make_category,
        "auth_header": auth_header,
    }
