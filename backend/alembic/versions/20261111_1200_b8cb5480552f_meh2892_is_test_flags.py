"""meh2892_is_test_flags

Revision ID: b8cb5480552f
Revises: 19ac967d78fb
Create Date: 2026-11-10 20:00:00.000000+00:00

MEH-2892 (anchor releases, §C.3): marks seeded test businesses and test
users so they can run on production for the post-release smoke without
ever reaching a real visitor or recipient. Two columns, one per table:

  - producers.is_test  BOOLEAN NOT NULL, server_default false
  - users.is_test      BOOLEAN NOT NULL, server_default false

server_default false fills every existing row (PostgreSQL 11+: a constant
default is a catalog change, no table rewrite), so no backfill script.
Expand-only per ADR-007; EXPECTED_TABLES unchanged (columns, not tables).

Readers (one authority, smell #1): services/producer_listing.py
exclude_test_producers() for every public list, search, map, sitemap and
count; services/indexnow.py; the email / WhatsApp send layer. Writers:
backend/scripts/seed_demo_business.py (refuses production) and an
admin-only toggle. Never accepted from a self-service form.

# DO NOT drop the server_default or make these nullable without a separate
#        Expand-Contract ticket (ADR-007).
#        Alembic is the sole schema authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8cb5480552f"
down_revision: Union[str, None] = "19ac967d78fb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("is_test", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "users",
        sa.Column("is_test", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("users", "is_test")
    op.drop_column("producers", "is_test")
