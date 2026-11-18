"""meh3259_review_reply_ai_moderation_status

Revision ID: f2c7a9d4b1e6
Revises: b8e4f2a6c9d1
Create Date: 2026-11-14 23:00:00.000000+00:00

MEH-3259: adds `producer_reviews.reply_ai_moderation_status` — the AI verdict
on the business owner's reply at its last write (reviews.py
`set_review_reply`). Same contract as `ai_moderation_status` (MEH-2349,
revision c4e81a2f9b6d):

- `"APPROVED"` — passed.
- `"FLAGGED"`  — the AI asked for a human look. The reply still publishes;
                 GET /admin/reviews returns the value so the admin sees it
                 and the «רק ביקורות שסומנו» filter catches it.
- NULL         — no reply, a fail-open (the next save re-checks), and every
                 pre-existing row.

REJECTED is never stored (it is a 422 before any write), so the CHECK admits
only the two values; a CHECK passes on NULL by definition.

String(16) NULL, no default, no backfill — Expand-only (ADR-007).
EXPECTED_TABLES unchanged (a column, not a table). Mirrored in
ProducerReview.__table_args__ / the column (models.py) so `alembic check`
sees no drift.

# DO NOT change nullability or add a default without an explicit MEH ticket —
#        Alembic is the sole schema authority since MEH-267.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2c7a9d4b1e6"
down_revision: Union[str, None] = "b8e4f2a6c9d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producer_reviews",
        sa.Column("reply_ai_moderation_status", sa.String(length=16), nullable=True),
    )
    op.create_check_constraint(
        "ck_producer_reviews_reply_ai_moderation_status",
        "producer_reviews",
        "reply_ai_moderation_status IN ('APPROVED', 'FLAGGED')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_producer_reviews_reply_ai_moderation_status",
        "producer_reviews",
        type_="check",
    )
    op.drop_column("producer_reviews", "reply_ai_moderation_status")
