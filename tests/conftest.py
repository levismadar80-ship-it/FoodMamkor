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
_BACKEND = os.path.join(ROOT, "backend")
# MEH-558: when running under mutmut, the mutated `app/auth.py` lives in
# `backend/mutants/app/auth.py` and mutmut inserts `backend/mutants/` at
# sys.path[0] before pytest collection. We need the real `backend/` on
# the path too (so `app.database`, `app.main`, etc. resolve), but it
# must come AFTER the mutmut entry — otherwise the unmutated auth.py
# wins and the trampoline never fires. Use append, not insert, when
# mutmut is active; otherwise keep the historical insert-at-0 behaviour.
if "MUTANT_UNDER_TEST" in os.environ:
    if _BACKEND not in sys.path:
        sys.path.append(_BACKEND)
else:
    sys.path.insert(0, _BACKEND)

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.auth import create_access_token, hash_password  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models.models import (  # noqa: E402
    Category,
    DeliveryArea,
    Producer,
    ProducerCategory,
    User,
)


def pytest_configure(config):
    # MEH-214: register the `fuzz` marker so `pytest -m fuzz` / `-m "not fuzz"`
    # work and unregistered-marker warnings stay clean. The schemathesis
    # property-based suite (tests/test_fuzz_schemathesis.py) carries it.
    config.addinivalue_line(
        "markers", "fuzz: schemathesis property-based API fuzz tests (slow)"
    )


@pytest.fixture(scope="session", autouse=True)
def _bootstrap_schema():
    """Build a clean schema once per test session."""
    # Drop everything (including admin_settings/static_pages) and recreate.
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Reset slowapi in-memory counters before each test.

    SlowAPIMiddleware checks limits before Pydantic validation, so every
    request (including future 422s) burns from the quota. Without this
    reset, the 12 POST /contact tests exhaust the 5/hour limit by test 6.
    """
    from app.rate_limit import limiter
    limiter._storage.reset()
    yield


@pytest.fixture(autouse=True)
def _mock_hibp_clean(monkeypatch, request):
    """MEH-306: stub HIBP to "no match" by default for tests that exercise
    validate_password through the API surface (test_api.py + test_auth.py).

    Skipped for tests/test_password_policy.py — that file unit-tests the
    service directly and manages its own HIBP patching per test (some
    intentionally exercise the real _check_hibp via httpx.AsyncClient
    mocks). A blanket _check_hibp stub here would shadow those surgical
    patches and break test_hibp_blocks_known_breach.
    """
    if request.node.fspath.basename == "test_password_policy.py":
        yield
        return
    from unittest.mock import AsyncMock

    from app.services import password_policy
    monkeypatch.setattr(password_policy, "_check_hibp", AsyncMock(return_value=False))
    yield


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
    # MEH-306: 12-char default so this string also flows through PasswordField
    # cleanly when a test re-uses it as a JSON payload. make_user itself only
    # hashes, so even short legacy passwords still work — but the schema-bound
    # tests need this longer default by default.
    password: str = "Zx7Yp9Mq2Lr4",
    is_blocked: bool = False,
    email_verified: bool = True,
) -> User:
    user = User(
        email=email or f"u{uuid.uuid4().hex[:8]}@test.com",
        name=name,
        password_hash=hash_password(password),
        role=role,
        is_blocked=is_blocked,
        email_verified=email_verified,
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


# ---------- valid payload fixtures (MEH-241) ----------
# Guard tests (401/403/409) must use these so schema changes don't silently
# invalidate security coverage.  Pattern: valid_*_payload() | {"field": bad}

def valid_review_payload() -> dict:
    """Passes ReviewCreateNested: stars (1-5), body (min 10 chars)."""
    return {"stars": 5, "body": "מוצר נהדר, ממליצה בחום!"}


def valid_user_register_payload() -> dict:
    """Passes UserRegister: email, name, password (all required).

    MEH-306: 12-char password to satisfy PasswordField. Same value as
    test_password_policy.SAFE_PASSWORD — vetted not in deny_list_10k
    and not in HIBP corpus at PR time.
    """
    return {
        "email": "valid@example.com",
        "name": "משתמשת בדיקה",
        "password": "Zx7Yp9Mq2Lr4",
    }


def valid_producer_register_payload() -> dict:
    """Passes ProducerRegister for a new (unauthenticated) registration.

    Producer.password is still a plain `str | None` field with the
    pre-MEH-306 8-char floor (PasswordField swap-in tracked separately —
    see PR description). The 12-char default is conservative against a
    future tightening.
    """
    return {
        "email": "producer@example.com",
        "name": "יצרנית בדיקה",
        "password": "Zx7Yp9Mq2Lr4",
        "producer_name": "חוות הבדיקה",
        "category_ids": [],
        "primary_contact_method": "whatsapp",
        # MEH-759 (ADR-022 gate 2): binding declaration is mandatory for a
        # successful registration; the handler 422s when falsy.
        "declaration_accepted": True,
    }


# Make helpers importable from tests
@pytest.fixture
def factories():
    return {
        "user": make_user,
        "producer": make_producer,
        "category": make_category,
        "auth_header": auth_header,
    }
