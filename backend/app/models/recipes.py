"""
Module:    models/recipes
Purpose:   Recipes a business publishes on its page, and their moderation
           state.
Does NOT:  Hold home-kitchen products (home_products.py).
Split out of models/models.py (MEH-3269); the code is moved verbatim and
every name is still importable from app.models.models.
"""

import uuid
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Table,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
from app.utils.clock import utc_now


# MEH-588: producer-recipes schema (chunk 1/4). M2M link table declared
# at module scope (not inside ProducerRecipe) so Product.recipes can
# reference it by the string "producer_recipe_products" via `secondary`.
# Mirror of the Alembic table created in revision f4c8a91e2b07.
producer_recipe_products = Table(
    "producer_recipe_products",
    Base.metadata,
    Column(
        "recipe_id",
        UUID(as_uuid=True),
        ForeignKey("producer_recipes.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "product_id",
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Index("ix_producer_recipe_products_product_id", "product_id"),
)


class ProducerRecipe(Base):
    """MEH-588: a recipe owned by a producer that can promote one or more
    of that producer's products via the producer_recipe_products M2M.

    `moderation_status` mirrors the four-state machine used elsewhere
    (pending / approved / rejected / needs_revision). The DB-level CHECK
    constraint is created by Alembic revision f4c8a91e2b07 and mirrored
    in `__table_args__` below for autogenerate parity — the migration
    remains the schema authority (ADR-003); the ORM copy declares only
    what the DB already has, and creates nothing.

    History: MEH-588 (creation, chunk 1/4 of the producer-recipes epic;
    chunk 0 = MEH-587 cleared the legacy `recipes` namespace).
    """

    __tablename__ = "producer_recipes"
    # MEH-588: mirror the partial index declared in Alembic revision
    # f4c8a91e2b07 so `alembic check` (Base.metadata vs DB schema) does
    # not flag ORM/migration drift. Plain `producer_id` index is covered
    # by the column-level `index=True` below.
    __table_args__ = (
        Index(
            "ix_producer_recipes_published_moderation",
            "published",
            "moderation_status",
            postgresql_where=text("published = true"),
        ),
        # MEH-588: mirror the CHECK created in revision f4c8a91e2b07. Alembic
        # 1.19.0 added by-name CHECK autogenerate detection, which surfaced
        # this as ORM/migration drift; the DB was always correct.
        CheckConstraint(
            "moderation_status IN ('pending', 'approved', 'rejected', 'needs_revision')",
            name="producer_recipes_moderation_status_check",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    ingredients = Column(Text, nullable=False)
    instructions = Column(Text, nullable=False)
    prep_time_min = Column(Integer, nullable=True)
    cook_time_min = Column(Integer, nullable=True)
    servings = Column(Integer, nullable=True)
    image_url = Column(Text, nullable=True)
    moderation_status = Column(
        Text,
        nullable=False,
        default="pending",
        server_default=text("'pending'"),
    )
    moderation_notes = Column(Text, nullable=True)
    published = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    created_at = Column(
        DateTime, nullable=False, default=utc_now, server_default=text("now()")
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
        server_default=text("now()"),
    )

    producer = relationship("Producer", back_populates="producer_recipes")
    products = relationship(
        "Product",
        secondary=producer_recipe_products,
        back_populates="recipes",
    )
