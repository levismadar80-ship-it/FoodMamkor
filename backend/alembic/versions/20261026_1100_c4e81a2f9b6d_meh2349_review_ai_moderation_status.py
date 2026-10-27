"""meh2349_review_ai_moderation_status

Revision ID: c4e81a2f9b6d
Revises: 0396917da2ea
Create Date: 2026-10-26 11:00:00.000000+00:00

MEH-2349: adds `producer_reviews.ai_moderation_status` — the AI verdict on
the review body at the last write (reviews.py `create_review_nested`):

- `"APPROVED"` — passed, or the moderator failed open (the LOCK; the
                 fail-open signal is the MEH-2352 Sentry report).
- `"FLAGGED"`  — the AI asked for a human look. The review still publishes;
                 GET /admin/reviews returns the value so the admin sees it.
- NULL         — no body (nothing was checked), and every pre-existing row.

REJECTED is never stored (it is a 422 before any write), so the CHECK admits
only the two values; a CHECK passes on NULL by definition.

String(16) NULL, no default, no backfill — Expand-only (ADR-007).
EXPECTED_TABLES unchanged (a column, not a table). Mirrored in
ProducerReview.__table_args__ / the column (models.py) so `alembic check`
sees no drift.

Chained on 0396917da2ea (staging head on 26/10), so `alembic heads` stays at
one head.

# DO NOT change nullability or add a default without an explicit MEH ticket —
#        Alembic is the sole schema authority since MEH-267.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4e81a2f9b6d"
down_revision: Union[str, None] = "0396917da2ea"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producer_reviews",
        sa.Column("ai_moderation_status", sa.String(length=16), nullable=True),
    )
    op.create_check_constraint(
        "ck_producer_reviews_ai_moderation_status",
        "producer_reviews",
        "ai_moderation_status IN ('APPROVED', 'FLAGGED')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_producer_reviews_ai_moderation_status", "producer_reviews", type_="check"
    )
    op.drop_column("producer_reviews", "ai_moderation_status")
