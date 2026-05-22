"""meh_509_pr3_producer_risk

Revision ID: 92afa3cb76e2
Revises: d4046deb0dc1
Create Date: 2026-05-22 17:00:00.000000+00:00

MEH-509 PR3: adds 2 nullable columns to `producers` for the
Anthropic-Haiku-backed signup risk score (app/services/producer_risk.py
called via FastAPI BackgroundTasks after the existing PR1 welcome hook).

NULL on both = "not scored yet OR Anthropic call failed (fail-open)".
Existing producer rows stay NULL on these columns by design; the watchdog
NEVER backfills retroactively.

`risk_score` is the integer 0-100 clamped at the app layer (NO CHECK
constraint here — corrupt persisted values stay readable in the admin
"out of range" grey state rather than 500ing the GET endpoint).

`risk_reasoning` is the one-sentence Hebrew explanation returned by
Claude Haiku, truncated to 500 chars at the app layer.

No index — admin queue ordering is by `created_at DESC` (existing),
not by risk_score. Add an index in a follow-up if the admin asks to
sort by risk.

# DO NOT add a backfill — existing producers remain NULL on these
#        columns, meaning "not scored". Per Alembic-only schema rule
#        (MEH-267).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "92afa3cb76e2"
down_revision: Union[str, None] = "d4046deb0dc1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("risk_score", sa.Integer(), nullable=True),
    )
    op.add_column(
        "producers",
        sa.Column("risk_reasoning", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("producers", "risk_reasoning")
    op.drop_column("producers", "risk_score")
