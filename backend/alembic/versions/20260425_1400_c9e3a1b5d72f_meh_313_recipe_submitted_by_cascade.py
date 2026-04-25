"""MEH-313 — recipes.submitted_by ON DELETE CASCADE

recipes.submitted_by is a NOT NULL FK to users.id. Without an ondelete
clause PostgreSQL defaults to NO ACTION, so deleting a User who has any
Recipe raised psycopg2.errors.ForeignKeyViolation — DELETE /auth/me
failed completely for any user with recipes.

Product decision: CASCADE. Recipes are user-owned content; "delete me"
means a full wipe. GDPR-friendly, no null-author display logic needed.

Safe on populated DBs: drop + recreate the FK constraint only.
No data movement, no backfill.

Revision ID: c9e3a1b5d72f
Revises: a4c7d2f9e1b8
Create Date: 2026-04-25 14:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'c9e3a1b5d72f'
down_revision: Union[str, None] = 'a4c7d2f9e1b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_FK_NAME = 'recipes_submitted_by_fkey'


def upgrade() -> None:
    op.drop_constraint(_FK_NAME, 'recipes', type_='foreignkey')
    op.create_foreign_key(
        _FK_NAME,
        'recipes', 'users',
        ['submitted_by'], ['id'],
        ondelete='CASCADE',
    )


def downgrade() -> None:
    op.drop_constraint(_FK_NAME, 'recipes', type_='foreignkey')
    op.create_foreign_key(
        _FK_NAME,
        'recipes', 'users',
        ['submitted_by'], ['id'],
    )
