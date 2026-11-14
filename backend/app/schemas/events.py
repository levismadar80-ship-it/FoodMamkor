"""
Module:    schemas/events
Purpose:   Events, organisers and the event filters.
Does NOT:  Describe workshops (experiences.py).
Split out of schemas/schemas.py (MEH-3270); the code is moved verbatim and
every name is still importable from app.schemas.schemas.
"""

from datetime import date, datetime, time
from typing import Self
from uuid import UUID
from pydantic import BaseModel, Field, field_validator, model_validator
from app.services.sanitization import sanitize_text
from app.schemas.schemas import (
    SanitizedTitleField,
    _image_url_validator,
    _url_scheme_validator,
)
from app.schemas.experiences import RegistrationMethod


# --- Event ---
# MEH-458: relocated from routers/events.py per ADR-006 R1.
# Pure relocation — fields, validators, model_config preserved verbatim.
# MEH-2469: the one rule for an event's end time, shared by EventCreate and
# the update route (which must check against the persisted start). The detail
# is the copy Sapir approved 28.10.
EVENT_END_TIME_ERROR = "שעת הסיום צריכה להיות אחרי שעת ההתחלה"


def event_end_time_problem(
    event_time: time | None, end_time: time | None
) -> str | None:
    """None when the pair is valid. An end time needs a start time and must be
    strictly after it (same-day events only; no overnight ranges)."""
    if end_time is None:
        return None
    if event_time is None or end_time <= event_time:
        return EVENT_END_TIME_ERROR
    return None


def naive_wall_clock(value: time | None) -> time | None:
    """Event times are Israel wall-clock. An offset on one ("15:00+02:00") means
    nothing here, and comparing an aware time with a naive one raises TypeError
    (→ 500). Drop it at the boundary (review #3717; datetime precedent: the
    MEH-1454 deadline normaliser)."""
    return value.replace(tzinfo=None) if value is not None else None


class EventCreate(BaseModel):
    # MEH-1626 chunk 1: the exact asymmetry the audit flagged — `description`
    # below was bleached, `title` (the more visible field) was not.
    title: SanitizedTitleField = Field(..., min_length=1, max_length=300)
    description: str | None = None
    event_date: date
    event_time: time | None = None
    end_time: time | None = None  # MEH-2469
    location: str | None = None
    # MEH-2013: "עיר *" is labelled required on the event form too and was
    # enforced in neither layer — the same class as ExperienceCreate.city
    # above, found by sweeping for the sibling rather than fixing one symptom.
    # max_length mirrors Event.city = Column(String(100)).
    city: str = Field(..., min_length=1, max_length=100)
    lat: float | None = None
    lng: float | None = None
    image_url: str | None = None
    category: str = Field(..., min_length=1, max_length=30)
    price: int = 0
    max_participants: int | None = None
    registration_url: str | None = None
    registration_method: RegistrationMethod = "site_form"  # MEH-2763

    # MEH-2469: wall-clock times, offsets dropped before any comparison.
    @field_validator("event_time", "end_time")
    @classmethod
    def _naive_times(cls, v: time | None) -> time | None:
        return naive_wall_clock(v)

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=2000)

    @field_validator("location")
    @classmethod
    def _sanitize_location(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=200)

    # MEH-2013: twin of ExperienceCreate._require_city — min_length=1 alone
    # accepts "   ", which is city-less by the only meaning that matters.
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

    # MEH-1811: registration_url had NO validator and lands directly in an
    # href (EventDetailClient.jsx:157, ProducerSections.jsx:379), so
    # "javascript:…" / "data:…" typed into "לינק הרשמה חיצוני" was stored XSS.
    # `<input type="url">` reports valid=true for both (measured in Chromium,
    # MEH-1809) and rel="noopener noreferrer" only defends against tabnabbing,
    # so the server is the only boundary. Same http(s) allowlist as
    # website/facebook/external_order_form — NOT _image_url_validator, whose
    # extra netloc-extension rule is image-specific.
    # REUSES: schemas.py:1122 — ProducerCreate._validate_contact_urls.
    @field_validator("registration_url")
    @classmethod
    def _validate_registration_url(cls, v: str | None) -> str | None:
        return _url_scheme_validator(v)

    # MEH-2469: end after start, both on the same day.
    @model_validator(mode="after")
    def _check_end_time(self) -> Self:
        problem = event_end_time_problem(self.event_time, self.end_time)
        if problem:
            raise ValueError(problem)
        return self


class EventUpdate(BaseModel):
    # MEH-1626 chunk 1: parity with the Create twin. Optional, so an omitted
    # title stays None via the union's None branch and never reaches the
    # validator.
    title: SanitizedTitleField | None = None
    description: str | None = None
    event_date: date | None = None
    event_time: time | None = None
    # MEH-2469 — checked against the stored start in the route.
    end_time: time | None = None
    location: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    image_url: str | None = None
    category: str | None = None
    price: int | None = None
    max_participants: int | None = None
    registration_url: str | None = None
    registration_method: RegistrationMethod | None = None  # MEH-2763
    is_active: bool | None = None

    # MEH-2469: wall-clock times, offsets dropped before any comparison.
    @field_validator("event_time", "end_time")
    @classmethod
    def _naive_times(cls, v: time | None) -> time | None:
        return naive_wall_clock(v)

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=2000)

    @field_validator("location")
    @classmethod
    def _sanitize_location(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=200)

    # MEH-1222: reject malformed image URLs at the write boundary.
    @field_validator("image_url")
    @classmethod
    def _validate_image_url(cls, v: str | None) -> str | None:
        return _image_url_validator(v)

    # MEH-1811: parity with the Create twin — an event created clean could
    # otherwise be poisoned on the edit path, which is the same gap the
    # MEH-1626 chunk-1 note above describes for `title`. See EventCreate.
    @field_validator("registration_url")
    @classmethod
    def _validate_registration_url(cls, v: str | None) -> str | None:
        return _url_scheme_validator(v)


class EventOut(BaseModel):
    id: UUID
    producer_id: UUID
    producer_name: str | None = None
    # MEH-2459: who owns the event — a business ('producer', link to its
    # business page) or an organizer ('organizer', link to /organizers/{slug},
    # chunk 3). owner_slug is the owner's slug either way; None before approval
    # mints one.
    owner_kind: str = "producer"
    owner_slug: str | None = None
    # MEH-2546: the owner's first photo, the rows' fallback image.
    owner_image_url: str | None = None
    title: str
    description: str | None = None
    event_date: date
    event_time: time | None = None
    end_time: time | None = None  # MEH-2469
    location: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    image_url: str | None = None
    category: str
    price: int
    max_participants: int | None = None
    registration_url: str | None = None
    # MEH-2763: «איך נרשמים?» + the on-site tally (0 for other methods).
    # MEH-2768: the business phone, for the WhatsApp / phone sign-up CTA.
    producer_phone: str | None = None
    registration_method: str = "site_form"
    registered_count: int = 0
    spots_left: int | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# --- MEH-2461: public organizer page (kind='organizer', ADR-036) ---
class OrganizerSlugOut(BaseModel):
    """One sitemap entry for /organizers/{slug}."""

    slug: str
    name: str


class OrganizerPublicOut(BaseModel):
    """GET /organizers/{slug}. Public fields only — no street address, no
    license, nothing business-shaped (no products, categories or delivery)."""

    id: UUID
    name: str
    slug: str
    description: str | None = None
    short_description: str | None = None
    city: str | None = None
    images: list[str] = []
    phone: str | None = None
    instagram: str | None = None
    website: str | None = None
    facebook: str | None = None
    # MEH-2475: what the organizer fills in the dashboard's profile + contact
    # groups. All already public on the business page (ProducerDetailOut);
    # null when unfilled so the page renders nothing for them.
    owner_bio: str | None = None
    owner_photo_url: str | None = None
    contact_name: str | None = None
    established_year: int | None = None
    primary_contact_method: str | None = None
    contact_email: str | None = None
    whatsapp_group: str | None = None
    external_order_form: str | None = None
    upcoming_events: list[EventOut] = []


class EventFilters(BaseModel):
    """MEH-447: query-param bag for GET /events, keeping list_events under
    PLR0913's 5-arg cap. FastAPI exposes each field as an individual query
    parameter.

    MEH-2847: `category` is a LIST (repeated ?category=A&category=B, the
    format lib/api.js `paramsSerializer: { indexes: null }` sends and
    /producers already uses, MEH-1465) and the route filters IN (...). One
    value parses to a one-item list, so an old single-value link behaves as
    before. This is why the route declares the bag as
    Annotated[EventFilters, Query()] and no longer Depends(): through
    Depends() a list field is not read from the query string at all
    (measured 08/11 on FastAPI 0.162 — ?category=a parsed to None)."""

    city: str | None = Field(default=None)
    category: list[str] | None = Field(default=None)
    from_date: date | None = Field(default=None)
    to_date: date | None = Field(default=None)
    producer_id: UUID | None = Field(default=None)
