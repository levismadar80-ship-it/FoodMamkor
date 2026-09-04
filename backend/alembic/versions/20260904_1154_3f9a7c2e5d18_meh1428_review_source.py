"""meh1428_review_source

Revision ID: 3f9a7c2e5d18
Revises: 2c1033ca5745
Create Date: 2026-09-04 11:54:00.000000+00:00

MEH-1428 chunk 1: adds `producer_reviews.source` — how the reviewer passed
the contact gate (reviews.py guard 3):

- `"click"`       — a WhatsApp / contact click row (the pre-MEH-1428 path).
- `"invite_link"` — a signed "request a review" token the owner shared
                    (GET /producers/me/review-link → `?rt=<token>`).

String(20) NOT NULL with a SERVER default of 'click', so every pre-existing
row reads "click" with no backfill step and no table rewrite beyond the
metadata change — Expand-only (ADR-007). EXPECTED_TABLES unchanged (a
column, not a table).

Chained on 2c1033ca5745 (MEH-2210 chunk A, #3333 → staging `cd766944`,
04/09 12:38Z). Authored on e6b2d4f81a37 and re-pointed once #3333 landed,
so `alembic heads` stays at one head (CI reviewer on #3368).

# DO NOT change nullability or the default without an explicit MEH ticket —
#        Alembic is the sole schema authority since MEH-267.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3f9a7c2e5d18"
down_revision: Union[str, None] = "2c1033ca5745"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producer_reviews",
        sa.Column(
            "source",
            sa.String(length=20),
            nullable=False,
            server_default="click",
        ),
    )


def downgrade() -> None:
    op.drop_column("producer_reviews", "source")
