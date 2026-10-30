"""meh2612_rabanut_code_backfill

Revision ID: 4b7e1d2c9a60
Revises: 9c534d477f2b
Create Date: 2026-10-30 14:30:00.000000+00:00

MEH-2612: data-only. The staging demo seed (seed_demo_producers.py) wrote the
kashrut code "rabanut_mekomit", which VALID_BADGE_CODES (trust_tier.py) and the
frontend's CODE_TO_KEY do not know, so three demo businesses showed no kashrut
line. The seed now writes "rabanut"; this revision rewrites the rows it already
inserted.

No DDL, EXPECTED_TABLES unchanged. Idempotent: the WHERE matches nothing on a
second run, and nothing on production, where no row carries the code (the code
can only come from the seed — owner requests are checked against
VALID_BADGE_CODES, producer_me.py:1732).

array_remove + a conditional append (not array_replace) so a row that somehow
carries both codes ends with one "rabanut", not two.

Downgrade is a no-op: the old code was a bug, never a state worth restoring.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "4b7e1d2c9a60"
down_revision: Union[str, None] = "9c534d477f2b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE producers
        SET kashrut_badges = CASE
            WHEN 'rabanut' = ANY(kashrut_badges)
                THEN array_remove(kashrut_badges, 'rabanut_mekomit')
            ELSE array_append(array_remove(kashrut_badges, 'rabanut_mekomit'), 'rabanut')
        END
        WHERE 'rabanut_mekomit' = ANY(kashrut_badges)
        """
    )


def downgrade() -> None:
    pass
