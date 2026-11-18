"""
Module:    schemas/experiences
Purpose:   Workshops (experiences) and their registrations.
Does NOT:  Describe events (events.py).
Split out of schemas/schemas.py (MEH-3270); the code is moved verbatim and
every name is still importable from app.schemas.schemas.
"""

from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, field_validator
from app.services.sanitization import sanitize_text
from app.schemas.schemas import (
    _LETTER_REGEX,
    _image_url_validator,
    _min_letters_validator,
    _normalize_contact_email,
    _phone_validator,
    _url_scheme_validator,
)


# --- Experiences (community-submitted workshops) ---
# MEH-2602: the wire values the forms send (frontend/lib/event-categories.js
# EXPERIENCE_CATEGORIES) — the same Hebrew-enum shape as events.py
# VALID_CATEGORIES. Unchecked, the API stored «workshop» verbatim and the
# experience page printed that raw word (staging sweep 29/10).
EXPERIENCE_CATEGORIES = frozenset(
    {"בישול", "תזונה", "סיור אוכל", "חקלאות", "טעימות", "סדנה", "אחר"}
)


# The English filter keys (messages events.experience_categories) a client
# may still send, and that rows saved before this check may hold — mapped, so
# an owner re-saving such a row is not refused for a value she never chose.
_EXPERIENCE_CATEGORY_KEYS = {
    "cooking": "בישול",
    "nutrition": "תזונה",
    "food_tour": "סיור אוכל",
    "agriculture": "חקלאות",
    "tasting": "טעימות",
    "workshop": "סדנה",
    "other": "אחר",
}


def _experience_category(value: str | None) -> str | None:
    if value is None:
        return None
    value = _EXPERIENCE_CATEGORY_KEYS.get(value, value)
    if value not in EXPERIENCE_CATEGORIES:
        raise ValueError("קטגוריה לא תקינה")
    return value


# --- MEH-2763: «איך נרשמים?» + on-site registrations ---
RegistrationMethod = Literal["site_form", "whatsapp", "phone", "external_url"]


class RegistrationCreate(BaseModel):
    """The on-site sign-up form: name, phone and email, all required, no
    account (approved 6/11)."""

    name: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., min_length=1, max_length=20)
    email: EmailStr = Field(..., max_length=200)
    # MEH-3314: the visitor chose «רשימת המתנה» on a full item. Ignored when a
    # spot is free by the time she submits — then she is simply registered.
    waitlist: bool = False
    # MEH-3315: «כמה אנשים» — the places this sign-up takes.
    party_size: int = Field(1, ge=1, le=10)

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str) -> str:
        cleaned = (sanitize_text(v, max_length=100) or "").strip()
        # MEH-555 pattern, but 2 letters, not 3: a name is the one free-text
        # field where real two-letter values are common («טל», «Li»).
        # _min_letters_validator's message names 3, so it is not reused here.
        if len(_LETTER_REGEX.sub("", cleaned)) < 2:
            raise ValueError("שדה זה חייב להכיל לפחות 2 אותיות")
        return cleaned

    @field_validator("phone")
    @classmethod
    def _clean_phone(cls, v: str) -> str:
        cleaned = _phone_validator(v)
        if cleaned is None:
            raise ValueError("מספר טלפון לא תקין")
        return cleaned

    @field_validator("email", mode="before")
    @classmethod
    def _clean_email(cls, v: Any) -> Any:
        cleaned = _normalize_contact_email(v)
        if cleaned is None:
            raise ValueError("כתובת אימייל לא תקינה")
        return cleaned.lower()


class RegistrationCreatedOut(BaseModel):
    """What the visitor gets back. Deliberately nothing she did not type, and
    not the cancel token — that goes to her inbox only."""

    # MEH-3314: "waitlisted" only when she asked for the waitlist and the item
    # was full — decided by capacity alone, so it reveals nothing about others.
    status: Literal["registered", "waitlisted"] = "registered"


class RegistrationOwnerOut(BaseModel):
    """One row of the owner's list (owner / admin only)."""

    id: UUID
    name: str
    phone: str
    email: str
    status: str
    created_at: datetime
    cancelled_at: datetime | None = None
    party_size: int = 1  # MEH-3315
    attendance: Literal["attended", "no_show"] | None = None  # MEH-3315

    model_config = {"from_attributes": True}


class RegistrationAttendanceIn(BaseModel):
    """MEH-3315: the owner marks whether the party came; null clears it."""

    attendance: Literal["attended", "no_show"] | None


class RegistrationCancelInfoOut(BaseModel):
    """GET by cancel token — enough for the cancel page to say what it is."""

    kind: Literal["event", "experience"]
    item_id: UUID
    title: str
    event_date: date
    status: str


class ExperienceCreate(BaseModel):
    title: str = Field(..., min_length=4, max_length=300)
    description: str = Field(..., min_length=20)
    image_url: str | None = None
    category: str | None = None

    @field_validator("category")
    @classmethod
    def _check_category(cls, v: str | None) -> str | None:
        return _experience_category(v)

    event_date: date
    event_time: time | None = None
    duration_minutes: int | None = Field(None, ge=15, le=1440)
    # MEH-2013: no default. "סוג מיקום *" is labelled required and the pills
    # now render unselected, so the choice must come from the submitter — a
    # default silently framed every experience as "בבית פרטי". `home` still
    # drives the coordinate-hiding branch in experiences.py:309, which is
    # exactly why it must not be assumed.
    location_type: str = Field(..., pattern="^(home|public)$")
    # MEH-2013: `city *` promised required and enforced nowhere, so a
    # city-less experience never surfaced in the /experiences city filter —
    # it vanished from the main discovery axis with no error. max_length
    # mirrors Experience.city = Column(String(100)) (models.py:1365).
    # REUSES: schemas.py:1016 — the city Field shape used across the app.
    city: str = Field(..., min_length=1, max_length=100)
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    max_participants: int | None = Field(None, ge=1, le=500)
    # MEH-2665: optional minimum to run it; ≤ max is checked in the router.
    min_participants: int | None = Field(None, ge=1, le=500)
    price_per_person: Decimal | None = None  # NULL / 0 = free
    requirements: str | None = None
    is_recurring: bool = False
    recurring_schedule: str | None = None
    # MEH-2763: «איך נרשמים?» — the router checks the method's prerequisite
    # (a mobile for whatsapp, a phone for phone, a URL for external_url).
    registration_method: RegistrationMethod = "site_form"
    registration_url: str | None = Field(None, max_length=500)  # column is 500

    @field_validator("registration_url")
    @classmethod
    def _validate_registration_url(cls, v: str | None) -> str | None:
        return _url_scheme_validator(v)

    @field_validator("title")
    @classmethod
    def _sanitize_title(cls, v: str) -> str | str | None:
        return sanitize_text(v, max_length=300)

    @field_validator("title")
    @classmethod
    def _validate_title_letters(cls, v: str) -> str:
        return _min_letters_validator(v)

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v: str) -> str | str | None:
        return sanitize_text(v, max_length=5000)

    @field_validator("requirements")
    @classmethod
    def _sanitize_requirements(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=1000)

    @field_validator("address")
    @classmethod
    def _sanitize_address(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=300)

    # MEH-2013: min_length=1 alone accepts "   ", which is city-less by every
    # meaning that matters — the /experiences city filter would still never
    # match it. Strip first, then require something left.
    @field_validator("city")
    @classmethod
    def _require_city(cls, v: str) -> str:
        stripped = (v or "").strip()
        if not stripped:
            raise ValueError("חובה לבחור עיר")
        return stripped

    # MEH-1222: reject malformed image URLs at the write boundary.
    @field_validator("image_url")
    @classmethod
    def _validate_image_url(cls, v: str | None) -> str | None:
        return _image_url_validator(v)


class ExperienceUpdate(BaseModel):
    title: str | None = Field(None, min_length=4, max_length=300)
    description: str | None = Field(None, min_length=20)
    image_url: str | None = None
    category: str | None = None

    @field_validator("category")
    @classmethod
    def _check_category(cls, v: str | None) -> str | None:
        return _experience_category(v)

    event_date: date | None = None
    event_time: time | None = None
    duration_minutes: int | None = Field(None, ge=15, le=1440)
    location_type: str | None = Field(None, pattern="^(home|public)$")
    city: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    max_participants: int | None = Field(None, ge=1, le=500)
    min_participants: int | None = Field(None, ge=1, le=500)  # MEH-2665
    price_per_person: Decimal | None = None
    requirements: str | None = None
    is_recurring: bool | None = None
    recurring_schedule: str | None = None
    is_active: bool | None = None  # MEH-1419: reversible cancel — mirrors EventUpdate
    # MEH-2663: sign-up happens on WhatsApp, so the host reports the count.
    # Bookkeeping, not content — the router keeps it out of moderation.
    participants_count: int | None = Field(None, ge=0, le=500)
    registration_method: RegistrationMethod | None = None  # MEH-2763
    registration_url: str | None = Field(None, max_length=500)  # MEH-2763

    @field_validator("registration_url")
    @classmethod
    def _validate_registration_url(cls, v: str | None) -> str | None:
        return _url_scheme_validator(v)

    @field_validator("title")
    @classmethod
    def _sanitize_title(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=300)

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=5000)

    @field_validator("requirements")
    @classmethod
    def _sanitize_requirements(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=1000)

    @field_validator("address")
    @classmethod
    def _sanitize_address(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=300)

    # MEH-1222: reject malformed image URLs at the write boundary.
    @field_validator("image_url")
    @classmethod
    def _validate_image_url(cls, v: str | None) -> str | None:
        return _image_url_validator(v)


class ExperienceModerationAction(BaseModel):
    """Admin action payload for reject / request-changes."""

    feedback: str | None = Field(None, max_length=2000)


class ExperienceValidateRequest(BaseModel):
    """Real-time form validation. No auth, no persistence."""

    title: str = Field(..., min_length=1, max_length=300)
    # MEH-3271: this body goes to the moderation model from a public route, so
    # every string is bounded. The caps are the create form's own
    # (ExperienceCreate: description 5000, city 100); category and location_type
    # are short labels and get 200.
    description: str | None = Field(None, max_length=5000)
    category: str | None = Field(None, max_length=200)
    city: str | None = Field(None, max_length=100)
    location_type: str | None = Field(None, max_length=200)
    price_per_person: Decimal | None = None
    max_participants: int | None = None


class ExperienceValidateResult(BaseModel):
    status: str  # APPROVED | FLAGGED | REJECTED
    reason: str | None = None
    suggestion: str | None = None


class ExperienceHostOut(BaseModel):
    id: UUID
    name: str
    # MEH-2476: the host's business, when it is approved — the page links to
    # it and its WhatsApp CTA reaches her. All four are already public on the
    # business page. None for a host whose business is not public.
    producer_id: UUID | None = None
    producer_slug: str | None = None
    producer_name: str | None = None
    producer_phone: str | None = None

    model_config = {"from_attributes": True}


class ExperienceCountOut(BaseModel):
    """MEH-1918 — how many experiences the public feed would show.

    A number and nothing else, on purpose: the nav needs to know whether the
    surface has real supply before it links to it, and any field beyond the
    count would be a second, unaudited public read path.
    """

    count: int


class ExperienceListOut(BaseModel):
    """Public listing — deliberately does NOT expose `address`.
    The full street address is private and only returned by the
    detail endpoint to the owner or an admin.
    """

    id: UUID
    title: str
    description: str
    image_url: str | None = None
    category: str | None = None
    event_date: date
    event_time: time | None = None
    duration_minutes: int | None = None
    location_type: str
    city: str | None = None
    max_participants: int | None = None
    min_participants: int | None = None  # MEH-2665
    participants_count: int = 0
    # MEH-2763: sign-ups taken through the on-site form. participants_count
    # stays the host's own tally (WhatsApp / phone sign-ups); spots_left and
    # the minimum read the two together.
    registered_count: int = 0
    spots_left: int | None = None
    registration_method: str = "site_form"
    registration_url: str | None = None
    price_per_person: Decimal | None = None
    is_recurring: bool = False
    recurring_schedule: str | None = None
    status: str
    host: ExperienceHostOut | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExperienceDetailOut(ExperienceListOut):
    """Detail view. Includes `address`, `requirements`, and the
    full moderation context — only returned to the owner or an admin
    when the experience is non-approved."""

    address: str | None = None
    requirements: str | None = None
    lat: float | None = None
    lng: float | None = None
    is_active: bool = True  # MEH-1419: reversible cancel — mirrors EventOut.is_active
    moderation_status: str | None = None
    moderation_reason: str | None = None
    moderation_suggestion: str | None = None
    admin_feedback: str | None = None
    rejection_reason: str | None = None

    model_config = {"from_attributes": True}
