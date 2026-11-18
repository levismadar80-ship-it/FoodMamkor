"""meh3339_secondary_phone

Revision ID: c3e8a1f05d72
Revises: a3d9e5c1f7b2
Create Date: 2026-11-16 10:45:00.000000+00:00

MEH-3339: a business can show one optional second phone number with a short
label ("להזמנות"), as a quiet text line. Every CTA stays on `phone`.

Adds two nullable columns to `producers`:
- `secondary_phone` String(20) — same width and app-layer validation as
  `phone`.
- `secondary_phone_label` String(30) — the label; the app rejects a label
  without a number and shows "טלפון נוסף" for a number without a label.

Expand-only per ADR-007: two additive nullable columns, no default, no
backfill, no table rewrite. The previous container keeps serving unchanged
while this runs: it never selects or writes the new columns. No table added,
so EXPECTED_TABLES is unchanged.

Sibling of b1d19ee0e8c1 (MEH-2312) — both revise f6c2a8d4e1b7. Whichever of
the two PRs merges second re-points its down_revision at the other, so the
chain keeps a single head.

downgrade() drops both columns; the second numbers are lost (they existed
nowhere before this revision).

# DO NOT add these columns anywhere else — Alembic is the sole schema
#        authority since MEH-267.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3e8a1f05d72"
down_revision: Union[str, None] = "a3d9e5c1f7b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("secondary_phone", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "producers",
        sa.Column("secondary_phone_label", sa.String(length=30), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("producers", "secondary_phone_label")
    op.drop_column("producers", "secondary_phone")
