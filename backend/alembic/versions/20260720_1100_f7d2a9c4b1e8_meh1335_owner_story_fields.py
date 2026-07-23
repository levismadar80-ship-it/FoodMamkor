"""meh1335_owner_story_fields

Revision ID: f7d2a9c4b1e8
Revises: d4b8f1c7e903
Create Date: 2026-07-20 11:00:00.000000+00:00

MEH-1335 (owner story fields): adds two nullable columns to `producers`,
the data path for the OwnerCard "מאחורי העסק" bio/photo variants that ship
dormant in PR #1936 (MEH-1334):

  - `owner_bio`        TEXT, nullable — the owner's personal story, shown on
                       the public producer page. 300-char cap enforced at the
                       app layer (schemas.ProducerUpdate sanitize validator,
                       chunk 2), mirroring the short_description pattern
                       (TEXT column + app-layer cap, no DB CHECK).
  - `owner_photo_url`  VARCHAR(500), nullable — Cloudinary URL of the owner's
                       photo (mirrors story_card_url's String(500)). Written
                       by POST /upload/owner-photo (chunk 2); http(s)-guarded
                       at the schema layer.

Deliberately NO server_default and NO backfill: both columns stay NULL for
every existing row — OwnerCard renders its compact variant (no bio, no
photo) until the owner actively fills the fields in the dashboard form
(chunk 3). Absence changes nothing, per the MEH-1335 spec.

Expand-only per ADR-007 — two additive nullable columns, no behavior change
in this chunk (serialization, write path, and upload endpoint are code, not
schema; they land in chunk 2). EXPECTED_TABLES unchanged (columns, not a
table).

# DO NOT add a server_default/backfill or tighten to NOT NULL — NULL means
#        "owner hasn't told her story yet" and the display side is gated on
#        exactly that. Alembic is the sole schema authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f7d2a9c4b1e8"
# MEH-1335: chains onto the current head d4b8f1c7e903 (MEH-1338 alert_log).
# Chain tail: b7e2a4c9d1f6 (merge of MEH-1291 + MEH-1297 heads) →
# d4b8f1c7e903 (MEH-1338 alert log) → THIS.
down_revision: Union[str, None] = "d4b8f1c7e903"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("owner_bio", sa.Text(), nullable=True),
    )
    op.add_column(
        "producers",
        sa.Column("owner_photo_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("producers", "owner_photo_url")
    op.drop_column("producers", "owner_bio")
