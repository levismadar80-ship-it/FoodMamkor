"""meh3377_consent_screenshot_url

Revision ID: c3e7a1f9d5b2
Revises: f6c2a8d4e1b7
Create Date: 2026-11-17 22:00:00.000000+00:00

MEH-3377: an optional screenshot of the business's written consent, attached
on «פרסום בהסכמה».

  - `producers.consent_screenshot_url`  VARCHAR(500) NULL — a Cloudinary image
                                        URL, beside `owner_invite_consent_note`
                                        (the admin's text record of the same
                                        consent).

Expand-only per ADR-007: one nullable column, no backfill, no default, nothing
reads it before this PR. EXPECTED_TABLES unchanged. Downgrade drops the column
and with it the stored URLs (the images themselves stay in Cloudinary).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3e7a1f9d5b2"
down_revision: Union[str, None] = "f6c2a8d4e1b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("consent_screenshot_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("producers", "consent_screenshot_url")
