"""meh586_mcp_reader_role

Revision ID: a29c7a4a41e7
Revises: e5b2d8f4a913
Create Date: 2026-10-28 00:00:00.000000+00:00

MEH-586 (Chatbot v2, live data): a least-privilege Postgres role for the
chat's four bounded read-only tools (app/services/chat_db_tools.py).

- `mcp_reader` is NOLOGIN. The app keeps connecting as its own user and
  runs `SET LOCAL ROLE mcp_reader` inside a READ ONLY transaction with a 5s
  statement_timeout — the same privilege boundary as a dedicated login
  user, without a second credential to provision (Sapir, 27/10).
- COLUMN-level SELECT on exactly the columns the four tools read, across
  five tables (producers, categories, producer_categories,
  producer_locations, events). producers.phone / contact_email /
  contact_name / address / whatsapp_group are NOT granted — the privilege
  layer keeps PII out, not only the fixed SQL. No users / home_products /
  reports at all. GRANTS below is byte-identical to
  app.services.chat_db_tools.READER_GRANTS (a test compares them).
- `GRANT mcp_reader TO CURRENT_USER` lets the application user assume the
  role. CURRENT_USER is whoever runs this revision — the Railway app user
  on boot, `postgres` in CI.

No table or column changes: EXPECTED_TABLES (41) and `alembic check` are
unaffected. Idempotent on the role (roles are cluster-wide; CI's per-worker
databases share one cluster).

Assumption NOT verified from the CC sandbox (Railway unreachable, MEH-2090):
the Railway app user holds CREATEROLE. If upgrade fails on staging boot
with "permission denied to create role", the fallback is a login role +
`CHAT_DB_READER_URL` (see the card).

# DO NOT grant INSERT/UPDATE/DELETE here, ever — read-only is the point.
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a29c7a4a41e7"
down_revision: Union[str, None] = "e5b2d8f4a913"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ROLE = "mcp_reader"
TABLES = "producers, categories, producer_categories, producer_locations, events"
GRANTS = (
    "GRANT SELECT (id, name, city, slug, status) ON producers TO mcp_reader",
    "GRANT SELECT (id, name, slug) ON categories TO mcp_reader",
    "GRANT SELECT (producer_id, category_id) ON producer_categories TO mcp_reader",
    "GRANT SELECT (producer_id, kind, city) ON producer_locations TO mcp_reader",
    "GRANT SELECT (producer_id, title, event_date, event_time, city, location, "
    "category, is_active) ON events TO mcp_reader",
)


def upgrade() -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{ROLE}') THEN
                CREATE ROLE {ROLE} NOLOGIN;
            END IF;
        END
        $$;
        """
    )
    op.execute(f"GRANT USAGE ON SCHEMA public TO {ROLE}")
    for grant in GRANTS:
        op.execute(grant)
    op.execute(f"GRANT {ROLE} TO CURRENT_USER")


def downgrade() -> None:
    # Revoke this database's grants and membership. A table-level REVOKE
    # also clears that table's column grants (verified on PG16, 28/10). The role itself is
    # cluster-wide and may still be referenced by another database on the
    # same cluster, so DROP ROLE is attempted but never fatal.
    op.execute(f"REVOKE SELECT ON {TABLES} FROM {ROLE}")
    op.execute(f"REVOKE USAGE ON SCHEMA public FROM {ROLE}")
    op.execute(f"REVOKE {ROLE} FROM CURRENT_USER")
    op.execute(
        f"""
        DO $$
        BEGIN
            BEGIN
                DROP ROLE IF EXISTS {ROLE};
            EXCEPTION WHEN dependent_objects_still_exist THEN
                RAISE NOTICE '{ROLE} still referenced elsewhere; left in place';
            END;
        END
        $$;
        """
    )
