"""
Module:    schemas/recipes_outreach
Purpose:   Business recipes, outreach leads and the public suggest-a-
           business form.
Does NOT:  Describe home-kitchen products (community.py).
Split out of schemas/schemas.py (MEH-3270); the code is moved verbatim and
every name is still importable from app.schemas.schemas.
"""

from datetime import datetime
import re
from typing import Annotated, Any, Self
from uuid import UUID
from pydantic import AfterValidator, BaseModel, EmailStr, Field, field_validator, model_validator
from app.services.sanitization import sanitize_text
from app.schemas.schemas import (
    PhoneNumberField,
    SanitizedLabelField,
    SanitizedUrlField,
    _image_url_validator,
    _min_letters_validator,
    _normalize_contact_email,
    _normalize_instagram,
    clean_display_city,
)


# --- MEH-589 Producer recipes (chunk 2/4) ---
# REUSES: schemas.py:840-1000 — ExperienceCreate / Update / Out trio
# pattern (sanitize_text validators + Optional-everything Update + Out
# with moderation fields). Recipe lifecycle is identical to experiences:
# pre-Claude check on submit, admin queue, three terminal admin actions.
class ProducerRecipeBase(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: str | None = None
    ingredients: str = Field(..., min_length=10)
    instructions: str = Field(..., min_length=10)
    prep_time_min: int | None = Field(None, ge=0, le=1440)
    cook_time_min: int | None = Field(None, ge=0, le=1440)
    servings: int | None = Field(None, ge=1, le=100)
    image_url: str | None = None
    # M2M to the producer's own products. The router enforces the
    # invariant that every product_id belongs to the calling producer
    # (cross-producer linking returns 422).
    product_ids: list[UUID] = Field(default_factory=list, max_length=10)

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
        return sanitize_text(v, max_length=2000) if v else v

    @field_validator("ingredients")
    @classmethod
    def _sanitize_ingredients(cls, v: str) -> str | str | None:
        return sanitize_text(v, max_length=5000)

    @field_validator("instructions")
    @classmethod
    def _sanitize_instructions(cls, v: str) -> str | str | None:
        return sanitize_text(v, max_length=10000)

    # MEH-1222: reject malformed image URLs at the write boundary
    # (inherited by ProducerRecipeCreate).
    @field_validator("image_url")
    @classmethod
    def _validate_image_url(cls, v: str | None) -> str | None:
        return _image_url_validator(v)


class ProducerRecipeCreate(ProducerRecipeBase):
    pass


class ProducerRecipeUpdate(BaseModel):
    """PATCH body — every field Optional so partial updates work
    (REUSES: ExperienceUpdate pattern schemas.py:885-922)."""

    title: str | None = Field(None, min_length=3, max_length=200)
    description: str | None = None
    ingredients: str | None = Field(None, min_length=10)
    instructions: str | None = Field(None, min_length=10)
    prep_time_min: int | None = Field(None, ge=0, le=1440)
    cook_time_min: int | None = Field(None, ge=0, le=1440)
    servings: int | None = Field(None, ge=1, le=100)
    image_url: str | None = None
    product_ids: list[UUID] | None = Field(None, max_length=10)

    @field_validator("title")
    @classmethod
    def _sanitize_title(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=200) if v else v

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=2000) if v else v

    @field_validator("ingredients")
    @classmethod
    def _sanitize_ingredients(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=5000) if v else v

    @field_validator("instructions")
    @classmethod
    def _sanitize_instructions(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=10000) if v else v

    # MEH-1222: reject malformed image URLs at the write boundary.
    @field_validator("image_url")
    @classmethod
    def _validate_image_url(cls, v: str | None) -> str | None:
        return _image_url_validator(v)


class ProducerRecipeOut(BaseModel):
    id: UUID
    producer_id: UUID
    title: str
    description: str | None = None
    ingredients: str
    instructions: str
    prep_time_min: int | None = None
    cook_time_min: int | None = None
    servings: int | None = None
    image_url: str | None = None
    # Server-managed lifecycle fields.
    moderation_status: str
    moderation_notes: str | None = None
    published: bool
    created_at: datetime
    updated_at: datetime
    # Filled by the router from the M2M; not a column on the recipe table.
    product_ids: list[UUID] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class ProducerRecipeModerationAction(BaseModel):
    """Admin action payload for /admin/recipes/{id}/{action}.

    REUSES: schemas.py:925-928 ExperienceModerationAction shape — single
    optional `feedback` field. The action verb (approve / request-changes
    / reject) lives in the URL path, not the body.
    """

    feedback: str | None = Field(None, max_length=2000)


# --- MEH-22 Outreach leads ---
class OutreachLeadOut(BaseModel):
    id: UUID
    name: str
    phone: str | None = None
    instagram: str | None = None
    website: str | None = None
    city: str | None = None
    category: str | None = None
    notes: str | None = None
    source: str = "manual"
    status: str = "new"
    prefill_token: str | None = None
    prefill_token_expires_at: datetime | None = None
    # MEH-2633 community-suggestion fields. This model is served ONLY from
    # admin_outreach.py, every route of which carries require_admin — which is
    # what makes it the single legal reader of `suggested_by_email`. The public
    # POST /business-suggestions answers with BusinessSuggestionAck (below),
    # never with this model.
    suggested_by_name: str | None = None
    suggested_by_email: str | None = None
    suggester_wants_update: bool = False
    suggestion_reason: str | None = None
    suggester_thanked_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# MEH-3318: the leads sheet stores websites the way people type them —
# "havivian.co.il", "www.x.co.il/page", or prose ("קטלוג ב-Drive"). The strict
# SanitizedUrlField 422'd the WHOLE lead on any of those, so a row could not be
# saved as it is in the sheet. Leads only: a bare domain gains "https://",
# prose is dropped (the field is stored empty, the lead is kept). Public forms
# keep the strict SanitizedUrlField.
_BARE_DOMAIN = re.compile(
    r"^(?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:/\S*)?$",
    re.IGNORECASE,
)
_OTHER_SCHEME = re.compile(r"^[a-z][a-z0-9+.-]*:", re.IGNORECASE)
_LEAD_WEBSITE_MAX = 200  # outreach_leads.website is String(200)


def _lenient_lead_website(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    if stripped.lower().startswith(("http://", "https://")):
        candidate = stripped
    elif _OTHER_SCHEME.match(stripped):
        # An explicit non-web scheme (ftp:, javascript:, data:) is still a 422:
        # it is not a typo for a website, and it must never reach an href.
        raise ValueError("כתובת אתר חייבת להתחיל ב-http:// או https://")
    elif _BARE_DOMAIN.match(stripped):
        candidate = "https://" + stripped
    else:
        return None
    return candidate if len(candidate) <= _LEAD_WEBSITE_MAX else None


LeadWebsiteField = Annotated[
    str, Field(max_length=200), AfterValidator(_lenient_lead_website)
]


class OutreachLeadCreate(BaseModel):
    name: SanitizedLabelField = Field(..., min_length=1, max_length=200)
    phone: PhoneNumberField | None = None
    instagram: str | None = Field(None, max_length=100)
    website: LeadWebsiteField | None = None
    city: str | None = Field(None, max_length=100)
    category: str | None = Field(None, max_length=100)
    notes: str | None = None

    # MEH-1616: same failure as MEH-1608, different table. The admin list
    # composes https://instagram.com/{instagram} from the stored value
    # (admin/outreach/page.jsx:223), so a pasted profile URL or a leading
    # @ produces a dead link. Forgiving in input, canonical in storage.
    # REUSES: backend/app/schemas/schemas.py:196 — _normalize_instagram
    @field_validator("instagram")
    @classmethod
    def _normalize_instagram_handle(cls, v: str | None) -> str | None:
        return _normalize_instagram(v)


class OutreachLeadUpdate(BaseModel):
    """PATCH body — any subset of fields may be omitted. Status is
    enum-validated at the route layer."""

    name: SanitizedLabelField | None = None
    phone: PhoneNumberField | None = None
    instagram: str | None = None
    website: LeadWebsiteField | None = None
    city: str | None = None
    category: str | None = None
    notes: str | None = None
    status: str | None = None

    # MEH-1616: see OutreachLeadCreate above — PATCH writes the same column.
    @field_validator("instagram")
    @classmethod
    def _normalize_instagram_handle(cls, v: str | None) -> str | None:
        return _normalize_instagram(v)


class OutreachPrefillResponse(BaseModel):
    """Public response from /register/producer/prefill/{token} —
    intentionally narrow: only what the registration form needs to
    pre-fill. Notes + status are NOT exposed."""

    name: str
    phone: str | None = None
    instagram: str | None = None
    website: str | None = None
    city: str | None = None
    category: str | None = None


# --- MEH-2633 Community business suggestions ---
#: outreach_leads.phone is VARCHAR(20) (models.py:896). Named here because the
#: shared PhoneNumberField caps at 30 and cannot know the column it lands in.
_OUTREACH_PHONE_MAX_LEN = 20


class BusinessSuggestionCreate(BaseModel):
    """Public body for POST /business-suggestions (MEH-2633).

    A visitor suggesting a business that is not on Mehamakor yet. The row it
    produces is an ordinary OutreachLead with source="community" — nothing is
    published, and the business still registers itself and passes manual
    approval + the licence check.

    Field rules worth stating, because each one is a decision:

    - `city` is REQUIRED. REUSES `clean_display_city` (:259), so it gets the
      same bleach + >=1-letter floor as the registration form's city; "בת ים"
      and "לוד" clear a 1-letter floor where the >=3 used for names would not.
    - `instagram` / `phone` / `website`: at least ONE is required, enforced by
      `_require_one_contact` below — without a way to reach the business the
      suggestion is unactionable, which is the whole point of the queue. The
      error text is the approved `<hebrew_copy>` string verbatim.
    - `company` is a HONEYPOT. No human sees it (Chunk B hides it from sighted
      users AND from screen readers), so any value at all means a bot. The
      router answers 201 and stores nothing — never a 4xx, which would tell
      the bot what tripped it.
    - `suggester_email` is still ACCEPTED but IGNORED by the router since
      MEH-2642: the stored address is the signed-in, verified account's only.
      It stays in the schema so an old client does not 422. DO NOT wire it
      back in — a typed address is unverified (MEH-2642). It is still
      normalised through `_normalize_contact_email` (:342) and never echoed.

    `Field(max_length=…)` sits at field level on `instagram` / `suggester_name`
    / `reason`, whose separate `@field_validator`s may return None. That is
    safe, and deliberately NOT the Annotated form: an `AfterValidator` inside
    the annotation would have the cap applied to the validator's OUTPUT and
    blow up with "Unable to apply constraint 'max_length' to supplied value
    None" (the trap documented at :640-652). `suggester_email` carries no
    field-level cap for the same reason in reverse — its validator is
    mode="before", so a cap would land after it.
    """

    name: SanitizedLabelField = Field(..., min_length=1, max_length=200)
    city: str = Field(..., max_length=100)
    phone: PhoneNumberField | None = None
    instagram: str | None = Field(None, max_length=100)
    website: SanitizedUrlField | None = None
    reason: str | None = Field(None, max_length=1000)
    suggester_name: str | None = Field(None, max_length=100)
    suggester_email: EmailStr | None = None
    wants_update: bool = False
    # Honeypot — see the docstring. Capped so a bot cannot post a novel here.
    company: str | None = Field(None, max_length=200)

    @field_validator("city")
    @classmethod
    def _validate_city(cls, v: str) -> str:
        return clean_display_city(v)

    # REUSES: backend/app/schemas/schemas.py:406 — _normalize_instagram.
    # Same reason as OutreachLeadCreate (:4037): the admin list composes
    # https://instagram.com/{instagram} from the stored value, so a pasted
    # profile URL or a leading @ would produce a dead link.
    @field_validator("instagram")
    @classmethod
    def _normalize_instagram_handle(cls, v: str | None) -> str | None:
        return _normalize_instagram(v)

    # MEH-2633 security review (04/11), finding 1. PhoneNumberField caps the
    # INPUT at 30 chars and `_phone_validator` returns `cleaned` — only
    # [\s()-] removed — while validating the DIGIT projection. So non-digits
    # survive: "+" * 15 + "0501234567" is accepted at 25 chars, over
    # outreach_leads.phone VARCHAR(20) (models.py:896), and the INSERT raised
    # DataError -> an unhandled 500. That 500 was reachable ONLY on the
    # new-lead path, because the duplicate branch returns before `phone` is
    # written — which made it a clean existence oracle for an anonymous
    # caller, defeating the property BusinessSuggestionAck exists to provide.
    #
    # Rejecting here means BOTH paths answer 422 for the same body, so the
    # asymmetry is gone rather than merely harder to reach.
    #
    # MEH-2641 then fixed `_phone_validator` itself (it now returns the digit
    # projection, ≤ 14 chars), so this check can no longer fire on a value
    # the shared validator lets through. It stays as the column-width guard
    # this endpoint's no-oracle property rests on.
    @field_validator("phone")
    @classmethod
    def _phone_fits_the_column(
        cls, v: PhoneNumberField | None
    ) -> PhoneNumberField | None:
        if v is not None and len(v) > _OUTREACH_PHONE_MAX_LEN:
            raise ValueError("מספר טלפון לא תקין")
        return v

    @field_validator("suggester_name")
    @classmethod
    def _sanitize_suggester_name(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=100)

    @field_validator("reason")
    @classmethod
    def _sanitize_reason(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=1000)

    @field_validator("suggester_email", mode="before")
    @classmethod
    def _normalize_suggester_email(cls, v: Any) -> Any:
        normalized = _normalize_contact_email(v)
        # The length cap lives here, not in Field(...) — see the docstring.
        # 254 is the column width and the RFC 5321 maximum for an address.
        if normalized is not None and len(normalized) > 254:
            raise ValueError("כתובת אימייל לא תקינה")
        return normalized

    @model_validator(mode="after")
    def _require_one_contact(self) -> Self:
        if not (self.instagram or self.phone or self.website):
            raise ValueError("צריך לפחות דרך אחת ליצור קשר עם בית העסק")
        return self


class BusinessSuggestionAck(BaseModel):
    """The ENTIRE public response to POST /business-suggestions: `{"ok": true}`.

    This model exists so the no-leak guarantee is structural rather than a
    promise about what the router happens to return. A duplicate suggestion and
    a brand-new one produce byte-identical bodies, so the endpoint cannot be
    used to probe whether a business is already in the outreach queue; and
    there is no field here that could ever carry a lead id or the suggester's
    email.

    # DO NOT add fields to this model — every addition is a disclosure on an
    #        unauthenticated endpoint (MEH-2633).
    """

    ok: bool = True
