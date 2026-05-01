"""MEH-305 — add users.password_changed_at column

NIST SP 800-63B Rev 4-aligned password policy depends on a per-user
"last password change" timestamp so JWT validation can reject access
tokens issued before a password change. Compared against the `iat`
claim in get_current_user (backend/app/auth.py) and in the /auth/refresh
handler (backend/app/routers/auth.py).

Safe on populated DBs:
  - nullable=True, no server_default → existing rows get NULL
  - get_current_user / /auth/refresh skip the check when password_changed_at
    is NULL → no force-logout on deploy
  - MEH-306 will set this column on every successful password mutation
    (registration, change-password, password reset)

Revision ID: e4da13353c58
Revises: c9e3a1b5d72f
Create Date: 2026-04-29 12:30:00.000000+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'e4da13353c58'
down_revision: Union[str, None] = 'c9e3a1b5d72f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'password_changed_at',
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'password_changed_at')
