"""MEH-770 (SEN-001) — SQLAlchemy engine pool config unit tests.

SEN-001: ~500 `QueuePool limit of size 5 overflow 10 ... timeout 30.00`
events in one production burst. The engine ran on the implicit SQLAlchemy
defaults with no pool_size / max_overflow / pool_recycle / pool_timeout.

These tests pin the env-parsing contract and the Postgres-vs-SQLite kwargs
split — no live DB needed (create_engine is lazy; we only inspect the kwargs
builder + the int parser). Safety-net suite untouched.
"""
from app.database import (
    DB_MAX_OVERFLOW,
    DB_POOL_RECYCLE,
    DB_POOL_SIZE,
    DB_POOL_TIMEOUT,
    _engine_kwargs_for,
    _int_env,
    _ObservableQueuePool,
)


# --- _int_env parsing -------------------------------------------------------


def test_int_env_unset_uses_default(monkeypatch):
    monkeypatch.delenv("DB_POOL_SIZE", raising=False)
    assert _int_env("DB_POOL_SIZE", 10, minimum=1) == 10


def test_int_env_blank_uses_default(monkeypatch):
    monkeypatch.setenv("DB_POOL_SIZE", "   ")
    assert _int_env("DB_POOL_SIZE", 10, minimum=1) == 10


def test_int_env_valid_override(monkeypatch):
    monkeypatch.setenv("DB_POOL_SIZE", "20")
    assert _int_env("DB_POOL_SIZE", 10, minimum=1) == 20


def test_int_env_non_int_falls_back(monkeypatch):
    monkeypatch.setenv("DB_POOL_SIZE", "abc")
    assert _int_env("DB_POOL_SIZE", 10, minimum=1) == 10


def test_int_env_below_minimum_falls_back(monkeypatch):
    # pool_size must be >= 1; a 0 would disable the pool and must not stick.
    monkeypatch.setenv("DB_POOL_SIZE", "0")
    assert _int_env("DB_POOL_SIZE", 10, minimum=1) == 10


def test_int_env_zero_allowed_when_minimum_zero(monkeypatch):
    # max_overflow=0 is legitimate (no overflow connections).
    monkeypatch.setenv("DB_MAX_OVERFLOW", "0")
    assert _int_env("DB_MAX_OVERFLOW", 5, minimum=0) == 0


# --- engine kwargs split ----------------------------------------------------


def test_pool_defaults():
    assert DB_POOL_SIZE == 10
    assert DB_MAX_OVERFLOW == 5
    assert DB_POOL_TIMEOUT == 30
    assert DB_POOL_RECYCLE == 1800


def test_engine_kwargs_postgres_applies_pool():
    kw = _engine_kwargs_for("postgresql://u:p@h:5432/db")
    assert kw["pool_pre_ping"] is True
    assert kw["poolclass"] is _ObservableQueuePool
    assert kw["pool_size"] == DB_POOL_SIZE
    assert kw["max_overflow"] == DB_MAX_OVERFLOW
    assert kw["pool_timeout"] == DB_POOL_TIMEOUT
    assert kw["pool_recycle"] == DB_POOL_RECYCLE
    assert kw["connect_args"] == {"connect_timeout": 10}


def test_engine_kwargs_postgres_short_scheme():
    # accepts both "postgresql://" and the bare "postgres://" Railway form.
    kw = _engine_kwargs_for("postgres://u:p@h:5432/db")
    assert "pool_size" in kw and kw["poolclass"] is _ObservableQueuePool


def test_engine_kwargs_sqlite_skips_pool():
    # SQLite (tests/local) uses its own pool — pool_size/max_overflow would
    # raise. Only pool_pre_ping (safe on both) is set.
    kw = _engine_kwargs_for("sqlite:///./test.db")
    assert kw == {"pool_pre_ping": True}
