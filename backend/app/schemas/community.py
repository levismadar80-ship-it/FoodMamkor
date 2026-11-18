"""
Module:    schemas/community
Purpose:   Users, favourites, home-kitchen products and their moderation,
           reports and ratings.
Does NOT:  Describe licensed-business products (catalog.py).
Split out of schemas/schemas.py (MEH-3270); the code is moved verbatim and
every name is still importable from app.schemas.schemas.
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from app.services.sanitization import sanitize_text
from app.schemas.schemas import (
    PhoneNumberField,
    _image_url_list_validator,
    _image_url_validator,
    _min_letters_validator,
)
from app.schemas.producer_out import ProducerListOut


# --- User ---
class UserOut(BaseModel):
    id: UUID
    email: str
    name: str
    city: str | None = None
    phone: str | None = None
    role: str
    producer_id: UUID | None = None
    # MEH-16: whether the user signed in via OAuth. Used by /settings to
    # hide the password-change form for OAuth-only accounts (they have
    # no password_hash to verify against).
    is_oauth: bool = False
    # MEH-3248: "google" | "apple" | None — the re-auth button for deletion.
    oauth_provider: str | None = None
    # MEH-3248: set by GET /auth/me only (account_guards.is_super_admin).
    is_super_admin: bool = False
    # MEH-143: True once the user has a linked producer profile.
    is_producer: bool = False
    # MEH-138: profile photo URL (Cloudinary or Google picture).
    avatar_url: str | None = None
    # MEH-206: producer status fields — populated by GET /auth/me when
    # the user has a linked producer. Used by /settings to show the
    # correct business tab state (pending/approved/rejected/suspended).
    producer_status: str | None = None
    # MEH-2460: 'producer' | 'organizer' — the dashboard layout branches its
    # tab set on this, same reason producer_status rides here (no extra fetch).
    producer_kind: str | None = None
    producer_rejection_reason: str | None = None
    # MEH-2210: the structured code beside the free text, plus how many
    # resubmissions the business has used — the dashboard's rejected banner
    # already reads its reason from here (MEH-1355), so the two fields it
    # branches on ride the same response.
    producer_rejection_reason_code: str | None = None
    producer_resubmission_count: int = 0
    # MEH-192: email verification status.
    email_verified: bool = False

    model_config = {"from_attributes": True}


# --- Favorite ---
class FavoriteOut(BaseModel):
    producer_id: UUID
    producer: ProducerListOut
    created_at: datetime

    model_config = {"from_attributes": True}


# MEH-587: Recipe* schemas removed (chunk 0/4) — see
# backend/alembic/versions/20260515_1430_d7e3c9a82f5b_meh_587_remove_zombie_recipes.py.


# --- Home Product ("from the neighbor's kitchen" listings) ---
class HomeProductCreate(BaseModel):
    title: str
    description: str | None = None
    photo: str | None = None
    quantity: str | None = None
    price: Decimal | None = None
    neighborhood: str | None = None
    city: str | None = None
    # docs/archive/FIXES_V2.md fix 7c — street + zip are persisted server-side but NOT
    # included in HomeProductOut. Use them for internal seller-only views.
    street: str | None = None
    zip_code: str | None = None
    phone: PhoneNumberField | None = None
    # Expanded fields (docs/archive/FIXES_V2.md fix 2)
    category: str | None = None
    prep_date: date | None = None
    expiry_date: date | None = None
    storage_type: str | None = None
    allergens: str | None = None
    kosher: str | None = None
    is_organic: bool = False
    unit: str | None = None
    delivery_method: str | None = None
    location_notes: str | None = None
    images: list[str] = []

    @field_validator("title")
    @classmethod
    def _sanitize_title(cls, v: str) -> str | str | None:
        return sanitize_text(v, max_length=200)

    @field_validator("title")
    @classmethod
    def _validate_title_letters(cls, v: str) -> str:
        return _min_letters_validator(v)

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=1000)

    @field_validator("location_notes")
    @classmethod
    def _sanitize_location_notes(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=200)

    @field_validator("allergens")
    @classmethod
    def _sanitize_allergens(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=200)

    # MEH-1222: reject malformed image URLs (public neighbor-product form).
    @field_validator("photo")
    @classmethod
    def _validate_photo(cls, v: str | None) -> str | None:
        return _image_url_validator(v)

    @field_validator("images")
    @classmethod
    def _validate_images(cls, v: list[str]) -> list[str] | list[str] | None:
        return _image_url_list_validator(v)


class HomeProductUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    photo: str | None = None
    quantity: str | None = None
    price: Decimal | None = None
    neighborhood: str | None = None
    city: str | None = None
    street: str | None = None
    zip_code: str | None = None
    phone: PhoneNumberField | None = None
    category: str | None = None
    prep_date: date | None = None
    expiry_date: date | None = None
    storage_type: str | None = None
    allergens: str | None = None
    kosher: str | None = None
    is_organic: bool | None = None
    unit: str | None = None
    delivery_method: str | None = None
    location_notes: str | None = None
    images: list[str] | None = None

    @field_validator("title")
    @classmethod
    def _sanitize_title(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=200)

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=1000)

    @field_validator("location_notes")
    @classmethod
    def _sanitize_location_notes(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=200)

    @field_validator("allergens")
    @classmethod
    def _sanitize_allergens(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=200)

    # MEH-1222: reject malformed image URLs (public neighbor-product form).
    @field_validator("photo")
    @classmethod
    def _validate_photo(cls, v: str | None) -> str | None:
        return _image_url_validator(v)

    @field_validator("images")
    @classmethod
    def _validate_images(cls, v: list[str] | None) -> list[str] | None:
        return _image_url_list_validator(v)


class HomeProductRatingOut(BaseModel):
    stars: int
    comment: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class HomeProductOut(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    description: str | None = None
    photo: str | None = None
    quantity: str | None = None
    price: Decimal | None = None
    neighborhood: str | None = None
    city: str | None = None
    phone: str | None = None
    is_active: bool
    category: str | None = None
    prep_date: date | None = None
    expiry_date: date | None = None
    storage_type: str | None = None
    allergens: str | None = None
    kosher: str | None = None
    is_organic: bool = False
    unit: str | None = None
    delivery_method: str | None = None
    location_notes: str | None = None
    images: list[str] = []
    moderation_status: str = "APPROVED"
    moderation_reason: str | None = None
    moderation_suggestion: str | None = None
    avg_rating: float | None = None
    rating_count: int = 0
    recent_comments: list[HomeProductRatingOut] = []
    seller_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class HomeProductModerationRequest(BaseModel):
    """Payload for the in-form validation call — no auth, no DB write."""

    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    category: str | None = None
    price: Decimal | None = None


class HomeProductModerationResult(BaseModel):
    status: str  # APPROVED | FLAGGED | REJECTED
    reason: str | None = None
    suggestion: str | None = None


# --- Report ---
class ReportCreate(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


class ReportOut(BaseModel):
    id: UUID
    reporter_id: UUID
    producer_id: UUID
    reason: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# MEH-1443: "מצאתן טעות בפרטים?" — email-only producer-info report (v1, no
# persistence). `producer_slug` is the identifier the producer page used
# (custom slug OR the UUID path for producers without a slug); the router
# resolves either. `message` is stripped and re-checked so a whitespace-only
# body 422s (Field's min_length runs before strip).
class ProducerInfoReportCreate(BaseModel):
    producer_slug: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1, max_length=1000)
    reporter_email: EmailStr | None = None

    @field_validator("message")
    @classmethod
    def _message_not_blank(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("message must not be empty")
        return stripped


# MEH-3260: why a visitor reports a review (the public dialog's radio list).
REVIEW_REPORT_REASONS = ("fake", "abusive", "personal", "irrelevant", "other")


class ReviewReportCreate(BaseModel):
    """MEH-3260: «דיווח על ביקורת» — emailed to the admin, no DB row, no
    automatic action. `details` is optional except for reason "other"."""

    producer_slug: str = Field(..., min_length=1, max_length=200)
    review_id: UUID
    reason: Literal["fake", "abusive", "personal", "irrelevant", "other"]
    details: str | None = Field(None, max_length=1000)
    reporter_email: EmailStr | None = None

    @field_validator("details")
    @classmethod
    def _clean_details(cls, v: str | None) -> str | None:
        v = sanitize_text(v, max_length=1000)
        stripped = (v or "").strip()
        return stripped or None

    @model_validator(mode="after")
    def _other_needs_details(self) -> "ReviewReportCreate":
        if self.reason == "other" and not self.details:
            raise ValueError("ספרו לנו בכמה מילים מה הבעיה")
        return self


# --- Rating ---
class RatingSubmit(BaseModel):
    stars: int = Field(..., ge=1, le=5)
    comment: str | None = Field(None, max_length=100)

    @field_validator("comment")
    @classmethod
    def _sanitize_comment(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=100)
