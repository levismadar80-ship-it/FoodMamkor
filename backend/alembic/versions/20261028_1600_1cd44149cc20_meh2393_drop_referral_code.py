"""meh2393_drop_referral_code

Revision ID: 1cd44149cc20
Revises: b7e3c1d9a2f4
Create Date: 2026-10-28 16:00:00.000000+00:00

Contract phase (ADR-007), MEH-2393 chunk 3/3: drops `users.referral_code`
and its unique index `ix_users_referral_code`.

Safe to run while the previous container is still serving: since
e5b2d8f4a913 (#3691, running on staging since 2026-10-27 20:42Z) the column
is excluded from the User mapper, so no ORM SELECT or INSERT names it. It has
been unwritten since #3690 and unread since #3639.

The 7-day staging soak was waived by Sapir on 27/10 (pre-launch, no real
businesses or users yet). Table count is unchanged (41).

downgrade() restores the column (nullable String(20)) and the unique index,
as measured with psql's describe on a fresh `alembic upgrade head` at
b7e3c1d9a2f4. Values are not restored, and the column comes back at the end
of the table rather than in its old position.

Chained on b7e3c1d9a2f4 (staging head on 28/10), so `alembic heads` stays
at one head.

# DO NOT change nullability or add a default without an explicit MEH ticket —
#        Alembic is the sole schema authority since MEH-267.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1cd44149cc20"
down_revision: Union[str, None] = "b7e3c1d9a2f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_users_referral_code", table_name="users")
    op.drop_column("users", "referral_code")


def downgrade() -> None:
    op.add_column(
        "users", sa.Column("referral_code", sa.String(length=20), nullable=True)
    )
    op.create_index(
        "ix_users_referral_code", "users", ["referral_code"], unique=True
    )
