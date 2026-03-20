from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr


# --- Auth ---
class UserRegister(BaseModel):
    email: EmailStr
    name: str
    password: str
    city: str | None = None


class ProducerRegister(BaseModel):
    # User account
    email: EmailStr
    name: str
    password: str
    # Producer details
    producer_name: str
    description: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    phone: str | None = None
    instagram: str | None = None
    website: str | None = None
    category_ids: list[int] = []
    # Delivery areas
    delivery_areas: list["DeliveryAreaCreate"] = []


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- Category ---
class CategoryOut(BaseModel):
    id: int
    name: str
    emoji: str | None = None

    model_config = {"from_attributes": True}


# --- Delivery Area ---
class DeliveryAreaCreate(BaseModel):
    city: str
    min_order: int | None = None
    delivery_day: str | None = None


class DeliveryAreaOut(BaseModel):
    id: UUID
    city: str
    min_order: int | None = None
    delivery_day: str | None = None

    model_config = {"from_attributes": True}


# --- Product ---
class ProductCreate(BaseModel):
    name: str
    description: str | None = None
    price_range: str | None = None


class ProductOut(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    price_range: str | None = None

    model_config = {"from_attributes": True}


# --- Producer ---
class ProducerCreate(BaseModel):
    name: str
    description: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    phone: str | None = None
    instagram: str | None = None
    website: str | None = None
    category_ids: list[int] = []
    delivery_areas: list[DeliveryAreaCreate] = []


class ProducerUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    phone: str | None = None
    instagram: str | None = None
    website: str | None = None


class ProducerListOut(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    status: str
    is_verified: bool
    images: list[str] = []
    categories: list[CategoryOut] = []

    model_config = {"from_attributes": True}


class ProducerDetailOut(ProducerListOut):
    phone: str | None = None
    instagram: str | None = None
    website: str | None = None
    products: list[ProductOut] = []
    delivery_areas: list[DeliveryAreaOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}


# --- User ---
class UserOut(BaseModel):
    id: UUID
    email: str
    name: str
    city: str | None = None
    role: str
    producer_id: UUID | None = None

    model_config = {"from_attributes": True}


# --- Favorite ---
class FavoriteOut(BaseModel):
    producer_id: UUID
    producer: ProducerListOut
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Recipe ---
class RecipeIngredientCreate(BaseModel):
    ingredient_name: str
    producer_id: UUID | None = None
    notes: str | None = None


class RecipeIngredientOut(BaseModel):
    id: UUID
    ingredient_name: str
    producer_id: UUID | None = None
    notes: str | None = None

    model_config = {"from_attributes": True}


class RecipeCreate(BaseModel):
    title: str
    description: str | None = None
    steps: list[str] = []
    category_id: int | None = None
    ingredients: list[RecipeIngredientCreate] = []


class RecipeOut(BaseModel):
    id: UUID
    title: str
    description: str | None = None
    steps: list[str] = []
    category_id: int | None = None
    status: str
    created_at: datetime
    ingredients: list[RecipeIngredientOut] = []

    model_config = {"from_attributes": True}
