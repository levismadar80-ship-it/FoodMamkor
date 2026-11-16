"""meh2312_product_drafts

Revision ID: b1d19ee0e8c1
Revises: f6c2a8d4e1b7
Create Date: 2026-11-16 10:30:00.000000+00:00

MEH-2312: admin imports a business's catalog from its existing store
(first source: mypips) as DRAFTS that an admin approves before they go
public. Sapir's decisions of 16.11: drafts approved by an admin; no images
for now, but keep the source image URL for a later import.

Adds two columns to `products`:
- `is_draft` Boolean NOT NULL, server default false. Every existing row and
  every owner-created product is false, so nothing that is public today
  changes. Public reads filter `is_draft = false`.
- `source_image_url` Text NULL. Stored, never rendered and never uploaded
  (image licence pending MEH-1184).

Expand-only per ADR-007: two additive columns, one with a constant server
default (a metadata-only change on PostgreSQL 11+, no table rewrite). The
previous container keeps serving unchanged while this runs: it never
selects the new columns and never writes them, and the default covers its
INSERTs. No backfill. No table added, so EXPECTED_TABLES is unchanged.

downgrade() drops both columns. Run it only after deleting the draft rows
(`DELETE FROM products WHERE is_draft`), or the drafts become public.

# DO NOT add these columns anywhere else — Alembic is the sole schema
#        authority since MEH-267.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1d19ee0e8c1"
down_revision: Union[str, None] = "f6c2a8d4e1b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column(
            "is_draft",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "products",
        sa.Column("source_image_url", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("products", "source_image_url")
    op.drop_column("products", "is_draft")
