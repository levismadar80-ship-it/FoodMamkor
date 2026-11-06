"""meh2763_registrations

Revision ID: e8c4a1f2b7d9
Revises: b7d2e4f1a903
Create Date: 2026-11-06 15:00:00.000000+00:00

MEH-2763 — «איך נרשמים?»: the owner of an event / experience picks how
visitors sign up (site_form | whatsapp | phone | external_url), and the
on-site form stores one `registrations` row per sign-up.

Expand-only per ADR-007:
  - events.registration_method, experiences.registration_method: NOT NULL
    with server default 'site_form', so the previous container (which never
    names the column) keeps inserting. CHECK limits the four values.
  - experiences.registration_url: nullable, used by external_url only.
  - registrations: new table (→ EXPECTED_TABLES 48 → 49).

Backfill keeps today's behaviour for existing rows (decided 6/11):
  - an event that already has a registration_url → 'external_url';
  - every existing experience → 'whatsapp' (its only path until now).
New rows default to 'site_form'.

downgrade() drops the table and the three columns; sign-ups taken since are
lost.

Chained on b7d2e4f1a903 (MEH-2703 rescue qty_donated, staging head 06/11).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e8c4a1f2b7d9"
down_revision: Union[str, None] = "b7d2e4f1a903"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_METHODS = "('site_form', 'whatsapp', 'phone', 'external_url')"


def upgrade() -> None:
    for table in ("events", "experiences"):
        op.add_column(
            table,
            sa.Column(
                "registration_method",
                sa.String(length=20),
                nullable=False,
                server_default=sa.text("'site_form'"),
            ),
        )
        op.create_check_constraint(
            f"ck_{table}_registration_method",
            table,
            f"registration_method IN {_METHODS}",
        )
    op.add_column(
        "experiences",
        sa.Column("registration_url", sa.String(length=500), nullable=True),
    )

    op.execute(
        "UPDATE events SET registration_method = 'external_url' "
        "WHERE registration_url IS NOT NULL AND btrim(registration_url) <> ''"
    )
    op.execute("UPDATE experiences SET registration_method = 'whatsapp'")

    op.create_table(
        "registrations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("experience_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("phone", sa.String(length=20), nullable=False),
        sa.Column("email", sa.String(length=200), nullable=False),
        sa.Column("cancel_token", sa.String(length=64), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'registered'"),
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "(event_id IS NULL) <> (experience_id IS NULL)",
            name="ck_registrations_one_item",
        ),
        sa.CheckConstraint(
            "status IN ('registered', 'cancelled')",
            name="ck_registrations_status",
        ),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["experience_id"], ["experiences.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cancel_token"),
    )
    op.create_index("ix_registrations_event_id", "registrations", ["event_id"])
    op.create_index(
        "ix_registrations_experience_id", "registrations", ["experience_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_registrations_experience_id", table_name="registrations")
    op.drop_index("ix_registrations_event_id", table_name="registrations")
    op.drop_table("registrations")
    op.drop_column("experiences", "registration_url")
    for table in ("experiences", "events"):
        op.drop_constraint(
            f"ck_{table}_registration_method", table, type_="check"
        )
        op.drop_column(table, "registration_method")
