"""meh2447_producer_by_arrangement

Revision ID: b8ee10dc69a9
Revises: b3d5f7a9c1e2
Create Date: 2026-11-27 01:00:00.000000+00:00

MEH-2447: the business says for itself that customers come «בתיאום מראש»
(pickup or a visit arranged in advance) instead of the site guessing it from
missing opening hours.

- producers.by_arrangement: BOOLEAN NOT NULL, server default false. Read only
  together with has_physical_location (a place the customer comes to). True =
  no walk-in: the map shows «בתיאום מראש» and never «קנייה במקום».

Expand-only (ADR-007): one column with a constant server default, so every
existing row reads false and keeps today's behaviour; Postgres adds a
constant-default column without rewriting the table. No CHECK: the readers AND
it with has_physical_location, so a partial update can never trip a
constraint. The previous container never reads it. Approved by Sapir 27/11
(decision card «כן, שדה by_arrangement»).

downgrade() drops it; every business falls back to the hours-based guess.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b8ee10dc69a9"
down_revision: Union[str, None] = "b3d5f7a9c1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column(
            "by_arrangement",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("producers", "by_arrangement")
