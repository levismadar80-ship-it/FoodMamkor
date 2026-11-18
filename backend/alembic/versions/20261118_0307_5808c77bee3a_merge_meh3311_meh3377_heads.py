"""merge MEH-3311 and MEH-3377 heads

Revision ID: 5808c77bee3a
Revises: a7d3e9c1b5f2, c3e7a1f9d5b2
Create Date: 2026-11-18 03:07:09.381027+00:00

Both revisions branched from f6c2a8d4e1b7 and landed on staging separately
(#4748 group_buys stamps, #4732 producers.consent_screenshot_url), leaving two
heads, which stops the boot (scripts/migrate_on_boot.py exit 3). Empty merge
revision under the ADR-025 amendment of 18/07/2026: no DDL, down_revision is
the two heads, and the branches touch disjoint tables (group_buys / producers).
"""

from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "5808c77bee3a"
down_revision: Union[str, Sequence[str], None] = ("a7d3e9c1b5f2", "c3e7a1f9d5b2")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
