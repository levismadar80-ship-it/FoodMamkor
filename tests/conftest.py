"""
Shared pytest fixtures for מהמקור backend tests.

Uses an isolated test database (mehamakor_test). Each test gets a fresh
schema via create_all/drop_all.

Under pytest-xdist every worker provisions its own database
(mehamakor_test_gw0, mehamakor_test_gw1, …) — see MEH-1911 below.
"""
import os
import re
import sys
import uuid

# Point the backend at the test database BEFORE importing app modules.
_BASE_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/mehamakor_test",
)

# MEH-1911: per-worker database isolation, so `pytest -n auto` is safe.
#
# Two autouse fixtures below are hostile to a *shared* database:
# `_bootstrap_schema` (session-scoped drop_all/create_all) and
# `_clean_tables` (per-test TRUNCATE of every table). Pointed at one
# database from N workers they corrupt each other's runs — worker A
# TRUNCATEs rows worker B just committed, and each worker runs its own
# drop_all while the others are mid-test. The fix removes the shared
# resource rather than trying to order access to it: one database per
# worker, so both fixtures keep operating on data only their own worker
# can see, unchanged.
#
# `PYTEST_XDIST_WORKER` is set by xdist inside each worker process before
# conftest is imported ("gw0", "gw1", …). It is absent in a serial run and
# absent in the xdist controller, so the serial path below is the exact
# pre-MEH-1911 line: same database name, same fixtures, no CREATE/DROP.
#
# DO NOT move the provisioning after the `from app.database import …`
# below — `app.database` builds the engine from DATABASE_URL at import
# time, so the worker URL has to be in the environment before that runs.
_XDIST_WORKER = os.environ.get("PYTEST_XDIST_WORKER")

# xdist worker ids are "gw<N>"; anything else is not something we will
# splice into a database identifier.
_WORKER_ID_RE = re.compile(r"^gw\d+$")


def _worker_db_name(base_url, worker: str) -> str:
    """`mehamakor_test` + `gw3` -> `mehamakor_test_gw3`."""
    if not _WORKER_ID_RE.match(worker):
        raise RuntimeError(
            f"PYTEST_XDIST_WORKER={worker!r} is not a recognised xdist worker "
            "id (expected 'gw<N>'); refusing to build a database name from it."
        )
    return f"{base_url.database}_{worker}"


def _maintenance_engine(base_url):
    """Engine on the always-present `postgres` db, in AUTOCOMMIT.

    CREATE/DROP DATABASE cannot run inside a transaction block (hence
    AUTOCOMMIT) nor from inside the database being dropped (hence the
    separate maintenance database).
    """
    from sqlalchemy import create_engine

    return create_engine(
        base_url.set(database="postgres"), isolation_level="AUTOCOMMIT"
    )


def _provision_worker_database(base_url_str: str, worker: str) -> str:
    """Create this worker's own database and return its URL.

    Drops a leftover of the same name first, so a previous run that was
    killed before its teardown cannot leak schema or rows into this one.
    """
    from sqlalchemy import text
    from sqlalchemy.engine import make_url

    url = make_url(base_url_str)
    worker_db = _worker_db_name(url, worker)

    engine = _maintenance_engine(url)
    try:
        with engine.connect() as conn:
            # WITH (FORCE) requires PG13+; CI pins postgres:15.
            # rtl-ok — "pr-c" below is a workflow filename, not a CSS class.
            # (.github/workflows/pr-checks.yml:296)
            conn.execute(text(f'DROP DATABASE IF EXISTS "{worker_db}" WITH (FORCE)'))
            conn.execute(text(f'CREATE DATABASE "{worker_db}"'))
    finally:
        engine.dispose()

    # hide_password=False: this string becomes DATABASE_URL and has to stay
    # connectable — SQLAlchemy's default rendering masks the password to "***".
    return url.set(database=worker_db).render_as_string(hide_password=False)


def _drop_worker_database(base_url_str: str, worker: str) -> None:
    """Drop this worker's database at session end."""
    from sqlalchemy import text
    from sqlalchemy.engine import make_url

    url = make_url(base_url_str)
    worker_db = _worker_db_name(url, worker)

    engine = _maintenance_engine(url)
    try:
        with engine.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{worker_db}" WITH (FORCE)'))
    finally:
        engine.dispose()


os.environ["DATABASE_URL"] = (
    _provision_worker_database(_BASE_DATABASE_URL, _XDIST_WORKER)
    if _XDIST_WORKER
    else _BASE_DATABASE_URL
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
    # MEH-1911: tests whose ASSERTION is about wall-clock time. Per-worker
    # database isolation makes the suite safe to parallelise, but it cannot
    # make a latency measurement meaningful on a machine where N-1 other
    # workers are saturating the CPU. These run in their own serial pass —
    # see docs/ci/meh-1911-pytest-parallel.patch.md.
    config.addinivalue_line(
        "markers",
        "serial: must not run under pytest-xdist — asserts on measured "
        "wall-clock timing, which parallel CPU contention invalidates",
    )


def pytest_sessionfinish(session, exitstatus):
    """MEH-1911: drop this xdist worker's database.

    Runs in each worker process (every worker has its own session), after
    all fixtures — including `_bootstrap_schema`'s drop_all — have torn
    down. No-op in a serial run and in the xdist controller, neither of
    which provisioned a database.

    The engine is disposed first: DROP DATABASE fails while a connection
    to it is open, and the pool holds some until told otherwise.
    """
    if not _XDIST_WORKER:
        return
    from app.database import engine as _engine

    _engine.dispose()
    _drop_worker_database(_BASE_DATABASE_URL, _XDIST_WORKER)


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
    images: list[str] | None = None,
) -> Producer:
    producer = Producer(
        name=name,
        description="Test producer",
        city=city,
        lat=32.0853,
        lng=34.7818,
        status=status,
        # MEH-799: approve gate requires >=1 image; default stays imageless
        # so the gate's own tests exercise the 422 path explicitly.
        images=images or [],
        # MEH-1848: asking this factory for delivery areas means "a business
        # that delivers to these cities", so it must also declare that it
        # delivers. Without this the factory minted a self-contradictory row —
        # delivery_areas rows sitting on offers_delivery=False — which is the
        # exact state the delivery filters now (correctly) exclude. Five tests
        # across three modules were asserting that contradictory producer came
        # back from a delivery filter. Producers created WITHOUT delivery_cities
        # keep the column default (False), so no other fixture shifts.
        offers_delivery=bool(delivery_cities),
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

    MEH-1153: ProducerRegister now enforces ≥1 category server-side, so this
    shared helper (relied on by guard tests — Regression rule 6) must carry a
    real category, not `[]`. It seeds a NON-license-required category via its
    own committed session so the row is visible to the endpoint under test —
    keeping the signature argument-free so no call site has to thread `db`.
    A unique name avoids the `Category.name` UNIQUE collision when a single
    test builds two payloads. `_clean_tables` (TRUNCATE … RESTART IDENTITY)
    cleans it up between tests.
    """
    seed_session = SessionLocal()
    try:
        cat = make_category(seed_session, name=f"קטגוריית-בדיקה-{uuid.uuid4().hex[:8]}")
        cat_id = cat.id
    finally:
        seed_session.close()
    return {
        "email": "producer@example.com",
        "name": "יצרנית בדיקה",
        "password": "Zx7Yp9Mq2Lr4",
        "producer_name": "חוות הבדיקה",
        "category_ids": [cat_id],
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
