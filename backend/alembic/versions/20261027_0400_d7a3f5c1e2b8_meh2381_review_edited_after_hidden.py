"""meh2381_review_edited_after_hidden

Revision ID: d7a3f5c1e2b8
Revises: c4e81a2f9b6d
Create Date: 2026-10-27 04:00:00.000000+00:00

MEH-2381: adds `producer_reviews.edited_after_hidden_at` — when the author
last changed the body or the stars of a review an admin had hidden
(reviews.py `create_review_nested`). An edit never un-hides (MEH-2348), so
without it the admin cannot tell that the text she hid is no longer the
text on the row.

- set   — on an author edit that changes body or stars while `is_hidden`;
          a second edit moves it to the latest edit.
- NULL  — never edited while hidden, every visible row, and every
          pre-existing row. PUT /admin/reviews/{id}/hide and /unhide both
          clear it (the admin has now seen the current text).

Naive DateTime, matching created_at / reply_at and `utc_now()`. Nullable, no
default, no backfill, no index — Expand-only (ADR-007). EXPECTED_TABLES
unchanged (a column, not a table). Mirrored on ProducerReview (models.py)
so `alembic check` sees no drift.

Chained on c4e81a2f9b6d (staging head on 27/10), so `alembic heads` stays at
one head.

# DO NOT change nullability or add a default without an explicit MEH ticket —
#        Alembic is the sole schema authority since MEH-267.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d7a3f5c1e2b8"
down_revision: Union[str, None] = "c4e81a2f9b6d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producer_reviews",
        sa.Column("edited_after_hidden_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("producer_reviews", "edited_after_hidden_at")
