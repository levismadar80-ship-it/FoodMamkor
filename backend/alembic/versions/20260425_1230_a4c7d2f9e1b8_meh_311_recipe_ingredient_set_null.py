"""MEH-311 — recipe_ingredients.producer_id ON DELETE SET NULL

Every other FK on `producers.id` already has `ondelete="CASCADE"` or
`ondelete="SET NULL"`. `recipe_ingredients.producer_id` was the only
producer FK without an ondelete clause — PostgreSQL default is
NO ACTION, so deleting a Producer that any RecipeIngredient referenced
raised `psycopg2.errors.ForeignKeyViolation`.

This blocked MEH-249's DELETE /auth/me cascade if the producer had any
recipe ingredients pointing at her. After this migration, the recipe
survives with `producer_id=NULL` (attribution dropped, content kept).

Safe on populated DBs: drop+recreate the FK constraint with the same
referencing/referenced columns, only the action changes. No data
movement, no backfill.

Revision ID: a4c7d2f9e1b8
Revises: b2e8f947c316
Create Date: 2026-04-25 12:30:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'a4c7d2f9e1b8'
down_revision: Union[str, None] = 'b2e8f947c316'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_FK_NAME = 'recipe_ingredients_producer_id_fkey'


def upgrade() -> None:
    op.drop_constraint(_FK_NAME, 'recipe_ingredients', type_='foreignkey')
    op.create_foreign_key(
        _FK_NAME,
        'recipe_ingredients', 'producers',
        ['producer_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint(_FK_NAME, 'recipe_ingredients', type_='foreignkey')
    op.create_foreign_key(
        _FK_NAME,
        'recipe_ingredients', 'producers',
        ['producer_id'], ['id'],
    )
