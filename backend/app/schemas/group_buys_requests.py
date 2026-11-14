"""
Module:    schemas/group_buys_requests
Purpose:   Group buys, category requests and business name-change
           requests.
Does NOT:  Decide any of them (routers do).
Split out of schemas/schemas.py (MEH-3270); the code is moved verbatim and
every name is still importable from app.schemas.schemas.
"""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal, Self
from uuid import UUID
from pydantic import BaseModel, Field, ValidationInfo, field_validator, model_validator
from app.services.sanitization import sanitize_text
from app.schemas.schemas import (
    SanitizedLabelField,
    SanitizedTitleField,
    _LETTER_REGEX,
    _min_letters_validator,
)


# --- MEH-52 Group Buys ---
class GroupBuyCommitOut(BaseModel):
    id: UUID
    group_buy_id: UUID
    user_id: UUID
    quantity: int
    # MEH-1651: `phone` removed. The column is no longer written (Expand-
    # Contract — the DROP is post-launch, Sapir-only), so exposing it here
    # would strand a permanently-NULL field in the API contract.
    created_at: datetime

    model_config = {"from_attributes": True}


class GroupBuyOut(BaseModel):
    id: UUID
    producer_id: UUID
    producer_name: str | None = None
    producer_image_url: str | None = None  # MEH-2544: business's first photo, read-only
    title: str
    description: str | None = None
    product_name: str
    unit: str | None = None
    price_per_unit_regular: Decimal
    price_per_unit_group: Decimal
    min_participants: int
    max_participants: int | None = None
    deadline: datetime
    city: str | None = None
    fulfillment_note: str | None = None
    # MEH-2621: pickup and delivery as two answers. Rows created before this
    # carry only fulfillment_note; new rows carry one or both of these.
    pickup_note: str | None = None
    delivery_note: str | None = None
    status: str
    commits_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class GroupBuyDetail(GroupBuyOut):
    """Full detail — includes whether the current user has committed."""

    user_committed: bool = False
    user_commit: GroupBuyCommitOut | None = None


class GroupBuyCreate(BaseModel):
    # MEH-1626 chunk 1: title carried only a length constraint — no bleach, no
    # letter floor — while sibling Create schemas (HomeProduct/Experience/Recipe)
    # all carry both. group_buys.py:202-203 persists both fields verbatim.
    title: SanitizedTitleField = Field(..., min_length=2, max_length=200)
    description: str | None = None
    # MEH-1626 chunk 3: surfaced by the family-based guard, NOT by the
    # asymmetry scan — both siblings were equally unvalidated, so the pair
    # looked symmetric and was invisible to a comparison-based check.
    product_name: SanitizedLabelField = Field(..., min_length=1, max_length=200)
    unit: str | None = Field(None, max_length=50)
    price_per_unit_regular: Decimal = Field(..., gt=0)
    price_per_unit_group: Decimal = Field(..., gt=0)
    min_participants: int = Field(..., ge=2)
    max_participants: int | None = Field(None, ge=2)
    deadline: datetime
    city: str | None = Field(None, max_length=100)
    # MEH-1457: free-text "מתי ואיך מקבלים" (OFN "Ready for").
    # MEH-2453: a participant from another city reads it before she joins;
    # without it she cannot tell whether the product reaches her.
    # MEH-2621: split into two answers, pickup and delivery (Shopify / Local
    # Line ask the seller about each separately). At least ONE of the three
    # is required (_require_pickup_or_delivery). fulfillment_note stays
    # accepted so the pre-split dashboard form keeps working until it moves
    # to the two fields (Expand-Contract, ADR-007).
    fulfillment_note: str | None = Field(None, max_length=1000)
    pickup_note: str | None = Field(None, max_length=1000)
    delivery_note: str | None = Field(None, max_length=1000)

    # MEH-1626 chunk 1: description gets the same bleach every other
    # description field in this module has (EventCreate:2528, HomeProductCreate,
    # ProducerRegister). Left as a plain validator rather than a 6th domain type
    # — the over-engineering guard caps this chunk at 5 types, and description
    # differs only by max_length across schemas.
    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=2000)

    @field_validator("fulfillment_note", "pickup_note", "delivery_note")
    @classmethod
    def _clean_fulfillment_text(cls, v: str | None, info: ValidationInfo) -> str | None:
        # Blank means "not given" — the model validator below decides whether
        # that is allowed. Given but with no real words ("." / "כן"): the
        # MEH-555 letter floor, with the field's own message.
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if len(_LETTER_REGEX.sub("", v)) < 3:
            if info.field_name == "fulfillment_note":
                raise ValueError("יש לכתוב מתי ואיך מקבלים את המוצרים")
            raise ValueError("יש למלא איסוף או משלוח")
        return v

    @model_validator(mode="after")
    def _require_pickup_or_delivery(self) -> Self:
        # MEH-2621: copy approved by Sapir 30/10.
        if not (self.pickup_note or self.delivery_note or self.fulfillment_note):
            raise ValueError("יש למלא איסוף או משלוח")
        return self

    @field_validator("deadline")
    @classmethod
    def _normalize_deadline_to_naive_utc(cls, v: datetime) -> datetime:
        # MEH-1454: the dashboard form sends `new Date(...).toISOString()` — an
        # aware ISO string with a trailing 'Z'. The DB column and every
        # `utc_now()` comparison in group_buys.py are naive UTC, so an
        # aware value made `data.deadline <= utc_now()` raise
        # `TypeError: can't compare offset-naive and offset-aware datetimes`
        # → 500 on real creates. Normalize aware → naive UTC at the boundary so
        # DB storage and comparisons stay in one (naive-UTC) world.
        if v.tzinfo is not None:
            v = v.astimezone(timezone.utc).replace(tzinfo=None)
        return v


class GroupBuyCommitRequest(BaseModel):
    quantity: int = Field(1, ge=1, le=100)
    # MEH-1651: `phone` removed. MEH-1626 chunk 1 had added a PhoneNumberField
    # validator here on the premise that the number was "used to contact the
    # participant" — it never was: nothing in the repo ever read the column.
    # MEH-1626's intent (no silently broken WhatsApp link) is served better by
    # not collecting the number than by validating one nobody dials. Amendment
    # 13 also bars collecting a field that serves no purpose.


# MEH-2436: the owner's status change. The four values are the whole domain of
# GroupBuy.status; which of them a caller may move to is decided in the router.
class GroupBuyStatusUpdate(BaseModel):
    status: Literal["open", "funded", "cancelled", "fulfilled"]
    # MEH-2489: the status the dashboard showed when the owner pressed the
    # button. Optional, so a caller that omits it behaves exactly as before;
    # when sent and the row has moved on (a last participant joined, open →
    # funded), the router refuses with 409 instead of acting on a state she
    # never saw.
    expected_status: Literal["open", "funded", "cancelled", "fulfilled"] | None = None


class GroupBuyStatusOut(BaseModel):
    detail: str
    status: Literal["open", "funded", "cancelled", "fulfilled"]


# MEH-141: category request flow
class CategoryRequestCreate(BaseModel):
    requested_name: str = Field(..., min_length=1, max_length=100)
    examples: str | None = Field(None, max_length=300)
    producer_id: UUID | None = None

    @field_validator("requested_name")
    @classmethod
    def _validate_letters(cls, v: str) -> str:
        return _min_letters_validator(v)


class CategoryRequestOut(BaseModel):
    id: UUID
    requested_name: str
    examples: str | None = None
    producer_id: UUID | None = None
    status: str
    admin_notes: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None

    model_config = {"from_attributes": True}


class CategoryRequestUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending|approved|rejected|merged)$")
    admin_notes: str | None = None

    # MEH-1626 chunk 2: parity with ProducerAdminCreate._sanitize_admin_notes
    # (schemas.py:1077), which already bleaches the same column on the sibling
    # write path. Persisted at category_requests.py:118. Inline rather than a
    # domain type — it is the only field needing this exact rule.
    @field_validator("admin_notes")
    @classmethod
    def _sanitize_admin_notes(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=1000)


# --- Producer name-change request (MEH-1872) ---
# The owner-writable path for `name` that MEH-1851 removed. Shapes mirror
# CategoryRequest* directly above — same status/admin_notes/reviewed_at triple.


class ProducerNameChangeRequestCreate(BaseModel):
    # Same bounds as ProducerCreate.name, so a request can never encode a name
    # the producers table would reject on approval.
    requested_name: str = Field(..., min_length=2, max_length=100)
    reason: str | None = Field(None, max_length=500)

    @field_validator("requested_name")
    @classmethod
    def _validate_letters(cls, v: str) -> str:
        # MEH-555: punctuation-only names ("???") reach an admin queue and a
        # public surface. Same guard the sibling free-text fields carry.
        return _min_letters_validator(v)

    @field_validator("reason")
    @classmethod
    def _sanitize_reason(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=500)


class ProducerNameChangeRequestOut(BaseModel):
    id: UUID
    producer_id: UUID
    current_name: str
    requested_name: str
    reason: str | None = None
    status: str
    admin_notes: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None

    model_config = {"from_attributes": True}


class ProducerNameChangeRequestUpdate(BaseModel):
    # No "merged" here — unlike a category, a name request has no third
    # disposition. Narrower on purpose rather than copied wholesale.
    status: str = Field(..., pattern="^(approved|rejected)$")
    admin_notes: str | None = None

    @field_validator("admin_notes")
    @classmethod
    def _sanitize_admin_notes(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=1000)
