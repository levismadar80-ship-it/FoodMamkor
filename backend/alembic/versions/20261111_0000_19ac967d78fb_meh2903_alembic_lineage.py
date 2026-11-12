"""meh2903_alembic_lineage

Revision ID: 19ac967d78fb
Revises: e4c9a2f71b58
Create Date: 2026-11-11 00:00:00.000000+00:00

MEH-2903 (backend rollback, risk 2): creates `alembic_lineage`, one row per
Alembic revision that a booted image has applied to this database.

Why: `alembic_version` stores only the current head. When an OLDER image boots
on a newer database (a rollback), it has no file for the newer revision, so it
cannot tell a real rollback (its own head is an ancestor of the database's)
from a split history (it carries its own revision that was never applied).
`backend/scripts/migrate_on_boot.py` writes the image's whole chain here after
every successful `upgrade head`; an older image takes rollback mode only if its
own head is listed here, and otherwise fails the boot naming both revisions.

Written only by migrate_on_boot.py. Nothing in the app reads or writes it.

Expand-only per ADR-007 — new table, no change to existing schema.
EXPECTED_TABLES 49 -> 50 in the CI gate workflow (Sapir's edit).

# DO NOT store anything but revision ids here — it is boot bookkeeping, not
#        app data. Alembic is the sole schema authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "19ac967d78fb"
down_revision: Union[str, None] = "e4c9a2f71b58"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "alembic_lineage",
        sa.Column("revision", sa.String(length=64), primary_key=True),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("alembic_lineage")
