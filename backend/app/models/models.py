import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSON, UUID
from sqlalchemy.orm import relationship

from app.database import Base


class Producer(Base):
    __tablename__ = "producers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    city = Column(String(100))
    lat = Column(Float)
    lng = Column(Float)
    location = Column(Geometry("POINT", srid=4326))
    phone = Column(String(20))
    instagram = Column(String(100))
    website = Column(String(200))
    status = Column(String(20), default="pending")  # pending | approved | rejected
    images = Column(ARRAY(Text), default=[])
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    categories = relationship("Category", secondary="producer_categories", back_populates="producers")
    products = relationship("Product", back_populates="producer", cascade="all, delete-orphan")
    delivery_areas = relationship("DeliveryArea", back_populates="producer", cascade="all, delete-orphan")
    favorited_by = relationship("Favorite", back_populates="producer", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(200), unique=True, nullable=False)
    name = Column(String(200), nullable=False)
    password_hash = Column(String(200), nullable=False)
    city = Column(String(100))
    role = Column(String(20), default="consumer")  # consumer | producer | admin
    producer_id = Column(UUID(as_uuid=True), ForeignKey("producers.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    producer = relationship("Producer")
    favorites = relationship("Favorite", back_populates="user", cascade="all, delete-orphan")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    emoji = Column(String(10))

    producers = relationship("Producer", secondary="producer_categories", back_populates="categories")


class ProducerCategory(Base):
    __tablename__ = "producer_categories"

    producer_id = Column(UUID(as_uuid=True), ForeignKey("producers.id", ondelete="CASCADE"), primary_key=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True)


class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(UUID(as_uuid=True), ForeignKey("producers.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    price_range = Column(String(50))

    producer = relationship("Producer", back_populates="products")


class DeliveryArea(Base):
    __tablename__ = "delivery_areas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(UUID(as_uuid=True), ForeignKey("producers.id", ondelete="CASCADE"), nullable=False)
    city = Column(String(100), nullable=False)
    min_order = Column(Integer)
    delivery_day = Column(String(50))

    producer = relationship("Producer", back_populates="delivery_areas")


class Favorite(Base):
    __tablename__ = "favorites"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    producer_id = Column(UUID(as_uuid=True), ForeignKey("producers.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="favorites")
    producer = relationship("Producer", back_populates="favorited_by")


class Recipe(Base):
    __tablename__ = "recipes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(300), nullable=False)
    description = Column(Text)
    steps = Column(JSON)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    submitted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status = Column(String(20), default="pending")  # pending | approved | rejected
    created_at = Column(DateTime, default=datetime.utcnow)

    category = relationship("Category")
    author = relationship("User")
    ingredients = relationship("RecipeIngredient", back_populates="recipe", cascade="all, delete-orphan")


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False)
    ingredient_name = Column(String(200), nullable=False)
    producer_id = Column(UUID(as_uuid=True), ForeignKey("producers.id"), nullable=True)
    notes = Column(Text)

    recipe = relationship("Recipe", back_populates="ingredients")
    producer = relationship("Producer")
