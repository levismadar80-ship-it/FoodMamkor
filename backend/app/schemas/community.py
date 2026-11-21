"""
Module:    schemas/community
Purpose:   Users, favourites and reports.
Does NOT:  Describe licensed-business products (catalog.py).
Split out of schemas/schemas.py (MEH-3270); the code is moved verbatim and
every name is still importable from app.schemas.schemas.
"""

from datetime import datetime
from uuid import UUID
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from app.services.sanitization import sanitize_text
from app.schemas.producer_out import ProducerListOut


# --- User ---
class UserOut(BaseModel):
    id: UUID
    email: str
    name: str
    city: str | None = None
    phone: str | None = None
    # MEH-3302: the current phone was verified with a WhatsApp code. WhatsApp
    # alerts are paused until it is (string 19). Timestamps are never exposed.
    phone_verified: bool = False
    # MEH-3302: phone_verified AND consent standing; false after «הסר».
    whatsapp_ready: bool = False
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


# MEH-3646: HomeProduct* schemas removed with the neighbour-listing code (MEH-796).


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


