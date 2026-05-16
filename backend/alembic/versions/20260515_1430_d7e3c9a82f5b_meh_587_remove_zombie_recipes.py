"""MEH-587 — remove zombie user-submitted recipes feature (chunk 0/4)

Drops the `recipes` and `recipe_ingredients` tables and clears the
namespace ahead of the producer-recipes feature (chunks 1-4). The
user-submitted-recipes flow shipped to the schema only — there is no
frontend, no production traffic, and DB verification on 2026-05-15
confirmed zero rows in both tables on staging AND production
(staging.recipes=0, staging.recipe_ingredients=0,
production.recipes=0, production.recipe_ingredients=0).

Why drop, not deprecate: every subsequent owner of `Recipe` /
`recipe_ingredients` (producer-recipes chunks 1-4) needs the namespace
free. Leaving the legacy tables in place forces every new model to be
named `Recipe2` / `recipes_v2` / etc. — a permanent tax to avoid a
one-time drop while the tables are empty.

# DO NOT add column changes here — Alembic only since MEH-267 (root
# cause of MEH-265 incident). This file is purely a table teardown.

Reversibility (Q3 — downgrade fidelity = YES): the downgrade recreates
both tables in their POST-MEH-311/313 state, so a chained downgrade
through this revision lands callers exactly where they were before the
drop:
  - recipes.submitted_by FK → users.id ondelete=CASCADE (MEH-313)
  - recipe_ingredients.producer_id FK → producers.id ondelete=SET NULL
    (MEH-311)
This means downgrading past MEH-311 / MEH-313 afterwards still works
without surprise — the FK shapes those revisions modify already exist
in their post-modification form, and their own downgrade() steps will
re-revert them as designed.

Data loss on downgrade: yes, by definition — both tables are recreated
empty. Acceptable because (a) both tables are verified empty on both
environments today, and (b) downgrade past chunk 0 is a deploy-rollback
escape hatch, not a data-restoration mechanism.

Revision ID: d7e3c9a82f5b
Revises: 80bbf0a24874
Create Date: 2026-05-15 14:30:00.000000+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "d7e3c9a82f5b"
down_revision: Union[str, None] = "80bbf0a24874"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # MEH-587: drop child table first to release the recipe_id FK
    # before the parent `recipes` table is removed.
    op.drop_table("recipe_ingredients")
    op.drop_table("recipes")


def downgrade() -> None:
    # MEH-587: recreate `recipes` and `recipe_ingredients` in their
    # post-MEH-311 / post-MEH-313 shape so the ondelete contracts those
    # revisions established remain intact for any further downgrade.
    op.create_table(
        "recipes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("steps", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("submitted_by", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"]),
        # MEH-313 shape: users.id ondelete=CASCADE.
        sa.ForeignKeyConstraint(
            ["submitted_by"],
            ["users.id"],
            name="recipes_submitted_by_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "recipe_ingredients",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("recipe_id", sa.UUID(), nullable=False),
        sa.Column("ingredient_name", sa.String(length=200), nullable=False),
        sa.Column("producer_id", sa.UUID(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        # MEH-311 shape: producers.id ondelete=SET NULL.
        sa.ForeignKeyConstraint(
            ["producer_id"],
            ["producers.id"],
            name="recipe_ingredients_producer_id_fkey",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["recipe_id"], ["recipes.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
