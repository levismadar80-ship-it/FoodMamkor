"""
Module:    models/home_products
Purpose:   Home-kitchen products posted by neighbours, their WhatsApp
           clicks and ratings.
Does NOT:  Hold licensed-business products (catalog.py).
Split out of models/models.py (MEH-3269); the code is moved verbatim and
every name is still importable from app.models.models.
"""

import uuid
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import relationship
from app.database import Base
from app.utils.clock import utc_now


# MEH-587: Recipe + RecipeIngredient removed (chunk 0/4) ahead of the
# producer-recipes feature. Tables verified empty on staging AND
# production before drop. See backend/alembic/versions/
# 20260515_1430_d7e3c9a82f5b_meh_587_remove_zombie_recipes.py.


# --- New models for MVP v1 ---


class HomeProduct(Base):
    __tablename__ = "home_products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title = Column(String(200), nullable=False)
    description = Column(Text)
    photo = Column(Text)  # Cloudinary URL (primary/cover — first of `images`)
    quantity = Column(String(100))
    price = Column(Numeric(10, 2))
    neighborhood = Column(String(100))
    city = Column(String(100))
    # Private address details (docs/archive/FIXES_V2.md fix 7c) — persisted server-side
    # but NEVER exposed in the public HomeProductOut schema. Only the
    # seller and admin can see these via a future authenticated endpoint.
    street = Column(String(200), nullable=True)
    zip_code = Column(String(20), nullable=True)
    phone = Column(String(20))  # for WhatsApp redirect
    available_until = Column(DateTime, nullable=True)  # expiry date
    is_active = Column(Boolean, default=True)
    is_hidden = Column(Boolean, default=False)  # auto-hidden by 3 negative ratings
    # --- expanded fields (docs/archive/FIXES_V2.md fix 2) ---
    category = Column(String(50), nullable=True)  # e.g. "בשר ועוף" / "דגים" / "ירקות"
    prep_date = Column(Date, nullable=True)  # preparation / harvest date
    expiry_date = Column(Date, nullable=True)  # expiry date
    # e.g. "מקרר" / "מקפיא" / "טמפרטורת חדר"
    storage_type = Column(String(30), nullable=True)
    allergens = Column(Text, nullable=True)  # "חיטה, ביצים, חלב..."
    kosher = Column(String(30), nullable=True)  # values: "כשר" / "לא כשר" / "לא ידוע"
    is_organic = Column(Boolean, default=False)
    unit = Column(String(30), nullable=True)  # e.g. "ק״ג" / "יח׳" / "ליטר" / "מנות"
    delivery_method = Column(String(30), nullable=True)  # pickup / delivery / both
    location_notes = Column(Text, nullable=True)  # "ליד הסופר, כניסה מהחנייה"
    # up to 4 photos (Cloudinary URLs)
    images: Column[list[str]] = Column(ARRAY(Text), default=[])
    # AI moderation (see docs/MODERATION.md)
    moderation_status = Column(
        String(20), default="APPROVED"
    )  # APPROVED|FLAGGED|REJECTED
    moderation_reason = Column(Text, nullable=True)
    moderation_suggestion = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)

    user = relationship("User")
    ratings = relationship(
        "HomeProductRating", back_populates="home_product", cascade="all, delete-orphan"
    )
    whatsapp_clicks = relationship(
        "HomeProductWhatsAppClick",
        back_populates="home_product",
        cascade="all, delete-orphan",
    )


class HomeProductWhatsAppClick(Base):
    __tablename__ = "home_product_whatsapp_clicks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    home_product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("home_products.id", ondelete="CASCADE"),
        nullable=False,
    )
    clicked_at = Column(DateTime, default=utc_now)
    rating_sent = Column(Boolean, default=False)
    rated = Column(Boolean, default=False)
    rating_token = Column(String(100), unique=True, nullable=True)

    user = relationship("User")
    home_product = relationship("HomeProduct", back_populates="whatsapp_clicks")
    rating = relationship("HomeProductRating", back_populates="click", uselist=False)


class HomeProductRating(Base):
    __tablename__ = "home_product_ratings"
    __table_args__ = (UniqueConstraint("click_id", name="uq_one_rating_per_click"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    click_id = Column(
        UUID(as_uuid=True),
        ForeignKey("home_product_whatsapp_clicks.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    home_product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("home_products.id", ondelete="CASCADE"),
        nullable=False,
    )
    stars = Column(Integer, nullable=False)  # 1-5
    comment = Column(String(100))
    created_at = Column(DateTime, default=utc_now)

    click = relationship("HomeProductWhatsAppClick", back_populates="rating")
    user = relationship("User")
    home_product = relationship("HomeProduct", back_populates="ratings")
