import logging
import os

from sqlalchemy import create_engine
from sqlalchemy.exc import TimeoutError as PoolTimeoutError
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import QueuePool

from app.config import settings

log = logging.getLogger(__name__)


def _int_env(name: str, default: int, *, minimum: int = 0) -> int:
    """MEH-770 (SEN-001): parse a positive-integer pool tuning knob from the
    environment with a safe fallback. Empty / unset / non-int / below-minimum
    values fall back to ``default`` (logged once) so a fat-fingered Railway
    var can never crash boot or silently disable the pool guard.
    """
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        log.warning("invalid %s=%r (not an int) — using default %s", name, raw, default)
        return default
    if value < minimum:
        log.warning(
            "invalid %s=%s (< %s) — using default %s", name, value, minimum, default
        )
        return default
    return value


# MEH-770 (SEN-001): explicit, env-overridable engine pool sizing. Read here
# (not in config.py BaseSettings) because config.py is permission-protected /
# out of this ticket's file scope; same env-var contract. Defaults keep the
# prod-proven ceiling of 15 connections per worker — the implicit SQLAlchemy
# 5+10 default that SEN-001's burst exhausted — while moving more into the
# persistent pool. New env vars (listed in the PR body for Sapir's Railway
# step): DB_POOL_SIZE / DB_MAX_OVERFLOW / DB_POOL_TIMEOUT / DB_POOL_RECYCLE.
DB_POOL_SIZE = _int_env("DB_POOL_SIZE", 10, minimum=1)
DB_MAX_OVERFLOW = _int_env("DB_MAX_OVERFLOW", 5, minimum=0)
DB_POOL_TIMEOUT = _int_env("DB_POOL_TIMEOUT", 30, minimum=1)
DB_POOL_RECYCLE = _int_env("DB_POOL_RECYCLE", 1800, minimum=1)


class _ObservableQueuePool(QueuePool):
    """MEH-770 (SEN-001): QueuePool that emits ONE structured log line when a
    connection checkout times out because the pool is exhausted.

    SQLAlchemy raises ``sqlalchemy.exc.TimeoutError`` from the (stable, 2.0.x)
    ``_do_get`` checkout hook with the message
    ``QueuePool limit of size N overflow M reached``. Without this, the ~500-
    event production burst scattered across every endpoint that happened to be
    waiting on the pool. Logging a single ``db_pool_exhausted`` line at the
    source lets Sentry group the whole burst under one issue. Behaviour is
    unchanged — we log and re-raise the identical exception.
    """

    def _do_get(self):
        try:
            return super()._do_get()
        except PoolTimeoutError:
            log.error(
                "db_pool_exhausted pool_size=%s max_overflow=%s timeout=%s "
                "checkedout=%s overflow=%s",
                DB_POOL_SIZE,
                DB_MAX_OVERFLOW,
                DB_POOL_TIMEOUT,
                self.checkedout(),
                self.overflow(),
            )
            raise


def _engine_kwargs_for(database_url: str) -> dict:
    """MEH-770 (SEN-001): assemble ``create_engine`` kwargs.

    Pool sizing + the observable pool apply only to the psycopg2/Postgres path
    — SQLite (tests/local) uses its own pool implementation and rejects
    ``pool_size``/``max_overflow``. ``pool_pre_ping`` is safe on both and
    transparently drops dead connections on checkout. ``connect_timeout=10``
    means a broken DB host raises ``OperationalError`` in 10s (so lifespan can
    catch it and the app still comes up) instead of hanging on the OS TCP
    timeout. ``pool_recycle`` proactively retires connections Railway may have
    idled out. All pool values come from env with conservative defaults — see
    the capacity math in the PR body.
    """
    kwargs: dict = {"pool_pre_ping": True}
    if database_url.startswith(("postgresql", "postgres")):
        kwargs.update(
            connect_args={"connect_timeout": 10},
            poolclass=_ObservableQueuePool,
            pool_size=DB_POOL_SIZE,
            max_overflow=DB_MAX_OVERFLOW,
            pool_timeout=DB_POOL_TIMEOUT,
            pool_recycle=DB_POOL_RECYCLE,
        )
    return kwargs


engine = create_engine(
    settings.database_url, **_engine_kwargs_for(settings.database_url)
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
