import os
import sys

# Ensure `backend/` is on sys.path so `from app.xxx import ...` resolves
# when alembic is invoked from any working directory.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool, text

from alembic import context

# ── ORM setup ────────────────────────────────────────────────────────────────
# Import Base first, then the models module.  Importing the module (not just
# the __init__ re-exports) guarantees that every class defined in models.py —
# including City, ReferralClick, GroupBuy, GroupBuyCommit, CategoryRequest —
# is registered with Base.metadata before autogenerate runs.
from app.database import Base
import app.models.models  # noqa: F401

# ── alembic config ────────────────────────────────────────────────────────────
config = context.config

# Override sqlalchemy.url from pydantic-settings (reads DATABASE_URL_PRODUCTION
# or DATABASE_URL_STAGING with DATABASE_URL fallback — see backend/app/config.py).
# This means alembic.ini never contains a hardcoded connection string, and the
# same file works identically for local dev, staging, and prod.
from app.config import settings  # noqa: E402

config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# MEH-273: fixed 64-bit key for the migration advisory lock (run_migrations_online).
# Any stable arbitrary bigint works — it just namespaces the lock to alembic runs
# so an unrelated pg_advisory lock elsewhere can't collide. Must be identical
# across all runners for the mutual exclusion to hold.
MIGRATION_ADVISORY_LOCK_KEY = 273273273


def run_migrations_offline() -> None:
    """Emit migration SQL without an active connection (--sql flag)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live DB connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            # MEH-273: serialize concurrent `alembic upgrade` runs. Two runners
            # (e.g. overlapping Railway deploys, both booting the Dockerfile
            # migrate step) would otherwise race on `upgrade head` — the loser
            # can observe a half-applied head and partially re-apply a revision.
            # A transaction-scoped Postgres advisory lock makes the second
            # invocation BLOCK here until the first commits; it then re-reads the
            # now-current head and no-ops. Auto-released on commit/rollback (no
            # leak, no explicit unlock). Single-runner acquires it uncontended —
            # no behavior change. Relies on the single-transaction default (this
            # env.py does NOT set transaction_per_migration, so every revision
            # shares this one transaction). Offline mode (--sql) is untouched: it
            # emits SQL with no live session to lock.
            connection.execute(
                text("SELECT pg_advisory_xact_lock(:lock_key)"),
                {"lock_key": MIGRATION_ADVISORY_LOCK_KEY},
            )
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
