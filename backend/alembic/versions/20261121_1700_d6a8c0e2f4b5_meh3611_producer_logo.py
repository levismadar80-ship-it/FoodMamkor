"""meh3611_producer_logo

Revision ID: d6a8c0e2f4b5
Revises: f2b4d6e8a0c3
Create Date: 2026-11-21 17:00:00.000000+00:00

MEH-3611. Expand-only (ADR-007): one NULLable column, no backfill, no row
rewritten. NULL = no logo, and every surface keeps showing the first letter
of the business name, exactly as before.

- producers.logo_url — the business's logo, a Cloudinary URL the owner
  uploaded through /upload/image and saved with PUT /producers/me.

Downgrade drops the column (the URLs in it are lost; the images stay in
Cloudinary until the orphan sweep).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d6a8c0e2f4b5"
down_revision: Union[str, None] = "f2b4d6e8a0c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("producers", sa.Column("logo_url", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("producers", "logo_url")
