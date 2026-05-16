"""MEH-588 — producer recipes DB schema (chunk 1/4)

Creates the two tables that back the producer-recipes feature:

  - `producer_recipes`           — one row per recipe owned by a business
  - `producer_recipe_products`   — M2M link between a recipe and the
                                   producer's products it promotes

Many-to-many over one-to-many was chosen because a single recipe can
promote several of the same producer's products (SideChef / Progressive
Grocer pattern referenced in MEH-588). The link table has no payload
beyond the two FKs.

# DO NOT add column changes here — Alembic only since MEH-267 (root
# cause of MEH-265 incident). This file is a pure table-creation.

Namespace context (chunk 0 → chunk 1): MEH-587 (revision d7e3c9a82f5b)
dropped the zombie `recipes` / `recipe_ingredients` tables so this
chunk could own the `Recipe*` ORM namespace without `Recipe2` suffix
collisions. Downgrading past MEH-588 leaves the namespace clean for a
fresh re-creation by a future revision; the MEH-587 downgrade can
still re-create the legacy tables underneath without name conflict.

Reversibility (Q3 — downgrade fidelity = YES): the downgrade drops the
child M2M table first, then the parent, in reverse-creation order. All
indexes are auto-dropped by `drop_table`. No data preservation —
downgrade past this revision in production would mean recipes are
being rolled back as a feature, not migrated to a new shape.

CHECK constraint on `moderation_status` mirrors the four-state machine
used by `producers.status` and `home_products.moderation_status`
elsewhere in the schema. The chunk 2 router will enforce the same
values in Pydantic; this gives a DB-level safety net.

Partial index `(published, moderation_status) WHERE published = TRUE`
is the read path the public producer page will hit (chunks 3-4). Full
index would be wasteful — the vast majority of rows during moderation
backlog will be unpublished and don't need to be indexed by status.

Revision ID: f4c8a91e2b07
Revises: d7e3c9a82f5b
Create Date: 2026-05-15 19:00:00.000000+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f4c8a91e2b07"
down_revision: Union[str, None] = "d7e3c9a82f5b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "producer_recipes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("producer_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("ingredients", sa.Text(), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=False),
        sa.Column("prep_time_min", sa.Integer(), nullable=True),
        sa.Column("cook_time_min", sa.Integer(), nullable=True),
        sa.Column("servings", sa.Integer(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column(
            "moderation_status",
            sa.Text(),
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
        sa.Column("moderation_notes", sa.Text(), nullable=True),
        sa.Column(
            "published",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["producer_id"],
            ["producers.id"],
            name="producer_recipes_producer_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="producer_recipes_pkey"),
        sa.CheckConstraint(
            "moderation_status IN ('pending', 'approved', 'rejected', 'needs_revision')",
            name="producer_recipes_moderation_status_check",
        ),
    )
    op.create_index(
        "ix_producer_recipes_producer_id",
        "producer_recipes",
        ["producer_id"],
    )
    op.create_index(
        "ix_producer_recipes_published_moderation",
        "producer_recipes",
        ["published", "moderation_status"],
        postgresql_where=sa.text("published = true"),
    )

    op.create_table(
        "producer_recipe_products",
        sa.Column("recipe_id", sa.UUID(), nullable=False),
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["recipe_id"],
            ["producer_recipes.id"],
            name="producer_recipe_products_recipe_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name="producer_recipe_products_product_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "recipe_id", "product_id", name="producer_recipe_products_pkey"
        ),
    )
    op.create_index(
        "ix_producer_recipe_products_product_id",
        "producer_recipe_products",
        ["product_id"],
    )


def downgrade() -> None:
    # Drop child (M2M link) first to release recipe_id / product_id FKs
    # before the parent table is removed.
    op.drop_index(
        "ix_producer_recipe_products_product_id",
        table_name="producer_recipe_products",
    )
    op.drop_table("producer_recipe_products")

    op.drop_index(
        "ix_producer_recipes_published_moderation",
        table_name="producer_recipes",
    )
    op.drop_index(
        "ix_producer_recipes_producer_id",
        table_name="producer_recipes",
    )
    op.drop_table("producer_recipes")
