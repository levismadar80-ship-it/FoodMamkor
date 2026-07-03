import re
from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.schemas.password import PasswordField
from app.services.sanitization import sanitize_text
from app.utils.clock import israel_today

_LETTER_REGEX = re.compile(r"[^א-תa-zA-Z]")


def _min_letters_validator(value: str | None, min_count: int = 3) -> str:
    # HOT-003 (MEH-772): a stacked `_sanitize_title` validator runs first and
    # returns None when bleach reduces the input to empty (e.g. "<b></b>" or a
    # whitespace-only title). Treat None as empty so the letter check fails with
    # a clean ValueError (→422) instead of `None.strip()` → AttributeError
    # (→500). Non-stacked callers (ProducerCreate.name, requested_name) always
    # receive a real str, so this is a no-op for them.
    stripped = (value or "").strip()
    if len(_LETTER_REGEX.sub("", stripped)) < min_count:
        raise ValueError("שדה זה חייב להכיל לפחות 3 תווים")
    return stripped


_ALNUM_REGEX = re.compile(r"[א-תa-zA-Z0-9]")


def _min_alnum_validator(value: str | None) -> str | None:
    # MEH-870: address-specific floor. Unlike _min_letters_validator (≥3
    # letters — right for names/taglines), an address need only contain at
    # least one letter OR digit. This still rejects punctuation-only input
    # ("---") but accepts legitimate short/numeric Israeli forms the letter
    # floor would over-reject: "123", the P.O. box "ת.ד. 123" (→ "תד", 2
    # letters), "רח' הרצל 5". Optional field: None (incl. bleach-emptied
    # input) stays valid.
    if value is None:
        return value
    stripped = value.strip()
    if not _ALNUM_REGEX.search(stripped):
        raise ValueError("שדה זה חייב להכיל לפחות אות או ספרה אחת")
    return stripped


# MEH-296: shared contact-channel guards, enforced at the API boundary.
# `primary_contact_method` is a free-text column (MEH-17 / MEH-555 — no DB
# enum); the 7-value set is validated on every write path. URL fields stay
# `str | None` (no Pydantic HttpUrl — would change response types repo-wide)
# but reject non-http(s) schemes (javascript:/data:) as defense-in-depth
# layered with services/sanitization.py (MEH-329).
_ALLOWED_CONTACT_METHODS = {
    "whatsapp",
    "phone",
    "instagram",
    "email",
    "website",
    "facebook",
    "external_order",
}


def _contact_method_validator(value: str | None) -> str | None:
    if value is not None and value not in _ALLOWED_CONTACT_METHODS:
        raise ValueError(
            "primary_contact_method חייב להיות אחד מ: "
            + ", ".join(sorted(_ALLOWED_CONTACT_METHODS))
        )
    return value


def _url_scheme_validator(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    if stripped == "":
        return stripped
    if not stripped.lower().startswith(("http://", "https://")):
        raise ValueError("כתובת אתר חייבת להתחיל ב-http:// או https://")
    return stripped


# --- Auth ---
class UserRegister(BaseModel):
    email: EmailStr
    name: str
    # MEH-306: PasswordField enforces the 12-char floor at the schema layer.
    # Deny-list / HIBP / reuse run inside the register handler via
    # app.services.password_policy.validate_password — Pydantic validators
    # are sync and cannot await HIBP. Replaces MEH-248's 8-char floor.
    password: PasswordField
    city: str | None = None
    phone: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    # MEH-306: PasswordField — 12-char floor; full policy + reuse check run
    # inside the reset_password handler.
    new_password: PasswordField


# MEH-306: live policy preview for /auth/check-password.
# Stateless — no auth, no DB write, no current_hash (reuse check skipped).
class CheckPasswordRequest(BaseModel):
    candidate: PasswordField


class ProducerRegister(BaseModel):
    # User account — optional when upgrading an already-authenticated user
    # (MEH-143). Required for new (unauthenticated) registrations; the
    # router validates and raises 422 when they are absent in that case.
    email: EmailStr | None = None
    name: str | None = None
    # MEH-457 — closes the MEH-306 sibling gap. PasswordField enforces
    # the 12-char floor + whitespace strip when a password is supplied
    # (new-registration path). The None case (authenticated user
    # upgrading to producer, MEH-143) skips validation entirely. The
    # full policy (HIBP, deny-list) runs in the handler via
    # app.services.password_policy.validate_password.
    password: PasswordField | None = None
    # Producer details
    producer_name: str
    description: str | None = None
    short_description: str | None = Field(default=None, max_length=160)
    city: str | None = None
    address: str | None = Field(default=None, max_length=255)
    lat: float | None = None
    lng: float | None = None
    phone: str | None = None
    instagram: str | None = None
    website: str | None = None
    # MEH-17: flexible contact methods.
    primary_contact_method: str = "whatsapp"
    contact_email: EmailStr | None = None
    category_ids: list[int] = []
    # MEH-530: optional at Pydantic level. Router calls
    # ensure_license_for_categories which 422s if license is missing for
    # a category in LICENSE_REQUIRED_CATEGORIES. max_length=20 mirrors the
    # DB column — boundary defense only (no regex; format warning lives on
    # the frontend per MEH-530 product decision).
    producer_license_number: str | None = Field(default=None, max_length=20)
    # MEH-759 (ADR-022 gate 2, Chunk B): binding tier-2 licensing declaration.
    # Default False so an ABSENT field doesn't change Pydantic-layer behaviour
    # for the existing contact-method negative tests; the handler 422s when
    # this is falsy (absent OR explicit False), so a producer row is only ever
    # created with declared_at/declaration_version stamped. The frontend
    # checkbox (agreedToTerms) feeds this value; declaration COPY is Chunk C.
    declaration_accepted: bool = False
    # MEH-971 chunk 2: license-pending opt-in. Transient INPUT only (never a DB
    # column) — when True the register-time ensure_license_for_categories 422 is
    # skipped, so a producer in a license-required category can submit with no
    # license number and land in the pending queue (status="pending_whatsapp").
    # NOT a security control: the licensed-only rule is still enforced
    # downstream — chunk-4 approval guard (admin.py) refuses to approve a
    # license-required producer with NULL license, and publication requires
    # status=="approved" (producer_listing.py). Default False = unchanged for
    # every existing caller.
    license_pending: bool = False
    # MEH-293/MEH-479: dietary flags moved to per-product tagging via /settings.
    # Delivery areas
    delivery_areas: list["DeliveryAreaCreate"] = []

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v):
        return sanitize_text(v, max_length=2000)

    # MEH-829: same bleach/XSS defense-in-depth as description above — these two
    # were collected on the public registration path without the strip their
    # ProducerUpdate twins already run.
    @field_validator("short_description")
    @classmethod
    def _sanitize_short_description(cls, v):
        return sanitize_text(v, max_length=160)

    @field_validator("address")
    @classmethod
    def _sanitize_address(cls, v):
        return sanitize_text(v, max_length=255)

    # MEH-870: reject punctuation-only values on the PUBLIC registration path,
    # which collected short_description (tagline) + address with only the bleach
    # strip above. Stacked AFTER the sanitize validators (bleach first, then the
    # floor), mirroring HomeProductCreate's _sanitize_title → _validate_title_letters.
    # Two different floors, by field semantics:
    #   short_description → ≥3 letters (same as ProducerCreate.name / titles).
    #   address           → ≥1 letter-or-digit only. The ≥3-letter floor
    #     over-rejects valid Israeli addresses ("123", P.O. box "ת.ד. 123" → "תד",
    #     2 letters); an address need only not be punctuation-only.
    # Both fields optional → an absent value (None, incl. bleach-emptied input)
    # stays valid; only a PROVIDED value must clear its floor.
    # REUSES: backend/app/schemas/schemas.py:16 (_min_letters_validator)
    @field_validator("short_description")
    @classmethod
    def _validate_short_description_letters(cls, v):
        # Guard is load-bearing: _min_letters_validator(None) coerces None → ""
        # and raises (HOT-003), which would reject an absent optional tagline.
        # _validate_address_alnum below needs no guard — _min_alnum_validator
        # handles None internally.
        if v is None:
            return v
        return _min_letters_validator(v)

    @field_validator("address")
    @classmethod
    def _validate_address_alnum(cls, v):
        return _min_alnum_validator(v)

    @field_validator("primary_contact_method")
    @classmethod
    def _validate_primary_contact_method(cls, v):
        return _contact_method_validator(v)

    # MEH-296: same http(s) scheme guard as ProducerUpdate. ProducerRegister
    # only exposes `website` among the URL fields (no facebook /
    # external_order_form columns here — those are owner-edit-only).
    @field_validator("website")
    @classmethod
    def _validate_contact_urls(cls, v):
        return _url_scheme_validator(v)


class GoogleAuthRequest(BaseModel):
    id_token: str


class AppleAuthRequest(BaseModel):
    id_token: str
    name: str | None = None  # Apple only sends name on first auth


# MEH-170 — Step-0 OAuth on producer signup. Same shape as Google/Apple
# auth but paired with an explicit "producer flow" discriminator so the
# router can return 409 when the user already has a producer linked
# (the UI then redirects to /login instead of silently logging in).
class ProducerOAuthSignupRequest(BaseModel):
    provider: str = Field(pattern="^(google|apple)$")
    id_token: str
    name: str | None = None  # Apple only sends name on first auth


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# MEH-287: producer registration returns whether the WhatsApp welcome
# is expected to be delivered. False when phone/Twilio env vars are
# missing — the frontend uses it to show a dashboard-fallback banner
# instead of the default "we sent you a WhatsApp" message.
class ProducerRegistrationResponse(Token):
    whatsapp_sent: bool


# MEH-328: generic ack returned by POST /auth/register on ALL branches
# (new email, existing password user, existing OAuth user). Body bytes
# must be identical across branches to prevent email enumeration; the
# legitimate owner finds out via the duplicate-attempt email dispatched
# server-side. No access_token — caller must verify email then login.
class RegisterAck(BaseModel):
    detail: str


# MEH-301: email pre-flight flag for OAuth registration endpoints.
# True = RESEND_API_KEY present and background task dispatched.
# False = missing config; frontend can show a diagnostic banner.
# Password /auth/register returns RegisterAck (MEH-328); OAuth siblings
# retain the email_sent flag because they auto-create users in one step.
class GoogleAuthResponse(Token):
    email_sent: bool


class AppleAuthResponse(Token):
    email_sent: bool


class ProducerOAuthSignupResponse(Token):
    email_sent: bool


# --- Category ---
class CategoryOut(BaseModel):
    id: int
    name: str
    emoji: str | None = None

    model_config = {"from_attributes": True}


class ProducerCityOut(BaseModel):
    """MEH-970 — one row of GET /producers/cities: live approved-producer
    count for a single city, consumed by the /map region control."""

    city: str
    count: int


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
# MEH-295: price_min/price_max are the canonical pricing fields.
# price_range is kept Optional for legacy back-compat — drop tracked as
# follow-up. Cross-field check (price_max >= price_min) is enforced via
# model_validator. ProductUpdate validator only fires when BOTH fields
# are present in the same payload; cross-payload merges (e.g. POST sets
# min=50, later PUT sends only max=30) are NOT validated against
# persisted state — frontend always sends both fields together.
class ProductCreate(BaseModel):
    name: str
    description: str | None = None
    price_range: str | None = None  # legacy: removal tracked in MEH-295 follow-up
    image_url: str | None = Field(None, max_length=500)
    price_min: Decimal = Field(..., ge=Decimal("1"), le=Decimal("10000"))
    price_max: Decimal | None = Field(None, ge=Decimal("1"), le=Decimal("10000"))
    # MEH-293: per-product dietary flags (moved from producer level).
    is_gluten_free: bool = False
    is_vegan: bool = False
    is_lactose_free: bool = False

    @field_validator("image_url", mode="before")
    @classmethod
    def empty_str_to_none(cls, v):
        return None if v == "" else v

    @model_validator(mode="after")
    def check_price_max_gte_min(self):
        if self.price_max is not None and self.price_max < self.price_min:
            raise ValueError("price_max must be greater than or equal to price_min")
        return self


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price_range: str | None = None  # legacy: removal tracked in MEH-295 follow-up
    image_url: str | None = Field(None, max_length=500)
    price_min: Decimal | None = Field(None, ge=Decimal("1"), le=Decimal("10000"))
    price_max: Decimal | None = Field(None, ge=Decimal("1"), le=Decimal("10000"))
    # MEH-293: per-product dietary flags. Optional on update — exclude_unset
    # in producer_me.update_my_product means an unsupplied field stays put.
    is_gluten_free: bool | None = None
    is_vegan: bool | None = None
    is_lactose_free: bool | None = None

    @field_validator("image_url", mode="before")
    @classmethod
    def empty_str_to_none(cls, v):
        return None if v == "" else v

    @model_validator(mode="after")
    def check_price_max_gte_min(self):
        if (
            self.price_min is not None
            and self.price_max is not None
            and self.price_max < self.price_min
        ):
            raise ValueError("price_max must be greater than or equal to price_min")
        return self


class ProductOut(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    price_range: str | None = None
    image_url: str | None = None
    price_min: Decimal | None = None
    price_max: Decimal | None = None
    # MEH-293: per-product dietary flags (moved from producer level).
    is_gluten_free: bool = False
    is_vegan: bool = False
    is_lactose_free: bool = False

    model_config = {"from_attributes": True}


# --- Producer ---
class ProducerCreate(BaseModel):
    # MEH-229: cap at the DB column width (models.py name = String(200)) so an
    # over-length name returns a clean 422 instead of a DB-level 500.
    name: str = Field(max_length=200)
    description: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    phone: str | None = None
    instagram: str | None = None
    website: str | None = None
    # MEH-296 3d: public-create parity (URL fields only; ProducerCreate has
    # no primary_contact_method, so only the URL-scheme guard applies below).
    facebook: str | None = None
    external_order_form: str | None = None
    category_ids: list[int] = []
    # MEH-530: see ProducerRegister for the validation rationale.
    producer_license_number: str | None = Field(default=None, max_length=20)
    delivery_areas: list[DeliveryAreaCreate] = []

    @field_validator("name")
    @classmethod
    def _validate_name_letters(cls, v: str) -> str:
        return _min_letters_validator(v)

    # MEH-296 3d: http(s) scheme guard on the URL fields (reuse Chunk-2 helper).
    @field_validator("website", "facebook", "external_order_form")
    @classmethod
    def _validate_contact_urls(cls, v):
        return _url_scheme_validator(v)


class ProducerAdminCreate(BaseModel):
    """Used by admin form — pre-approved, supports all extended fields."""

    # MEH-229: mirror ProducerCreate — cap at the String(200) column width.
    name: str = Field(max_length=200)
    contact_name: str | None = None
    description: str | None = None
    short_description: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    phone: str | None = None
    instagram: str | None = None
    website: str | None = None
    whatsapp_group: str | None = None
    # MEH-17
    primary_contact_method: str = "whatsapp"
    contact_email: EmailStr | None = None
    # MEH-296 3d: admin parity with ProducerUpdate's contact channels.
    facebook: str | None = None
    external_order_form: str | None = None
    slug: str | None = None
    top_product_name: str | None = None
    price_range: str | None = None
    grass_fed: bool = False
    organic_certified: bool = False
    # MEH-293/MEH-479: dietary flags moved to products.is_X.
    has_delivery: bool = False
    pickup_points: bool = False
    kosher: str | None = None
    # MEH-530: admin form can persist the full license value verbatim
    # (manual-approval flow), still bounded by the 20-char DB column.
    producer_license_number: str | None = Field(default=None, max_length=20)
    admin_notes: str | None = None
    # MEH-766 ch3: is_verified removed from admin create — verification is via
    # grant-verified (verified_at) only; column stays at default False (drops ch6).
    # MEH-18
    is_recommended: bool = False
    images: list[str] = []
    category_ids: list[int] = []
    delivery_area_cities: list[str] = []  # simple comma-split list
    # MEH-213 — location mode
    has_physical_location: bool = True
    offers_delivery: bool = False
    delivery_nationwide: bool = False
    delivery_cities: list[str] = []

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v):
        return sanitize_text(v, max_length=2000)

    @field_validator("short_description")
    @classmethod
    def _sanitize_short_description(cls, v):
        return sanitize_text(v, max_length=200)

    @field_validator("admin_notes")
    @classmethod
    def _sanitize_admin_notes(cls, v):
        return sanitize_text(v, max_length=2000)

    # MEH-296 3d: same boundary guards as ProducerUpdate (reuse Chunk-2 helpers).
    @field_validator("primary_contact_method")
    @classmethod
    def _validate_primary_contact_method(cls, v):
        return _contact_method_validator(v)

    @field_validator("website", "facebook", "external_order_form")
    @classmethod
    def _validate_contact_urls(cls, v):
        return _url_scheme_validator(v)

    @model_validator(mode="after")
    def _validate_location_mode(self):
        if not self.has_physical_location and not self.offers_delivery:
            raise ValueError("חייב לפחות אחד: חנות פיזית או משלוחים")
        # MEH-903 A: XOR now guards delivery_area_cities (the delivery_areas store)
        # instead of the legacy delivery_cities column — same nationwide-XOR-cities
        # semantic, only the field source changed.
        if self.delivery_nationwide and len(self.delivery_area_cities) > 0:
            raise ValueError("לא ניתן לבחור גם משלוחים לכל הארץ וגם ערים ספציפיות")
        return self


class ProducerImportPreviewRow(BaseModel):
    row_number: int
    data: dict
    errors: list[str] = []
    warnings: list[str] = []


class ProducerImportResult(BaseModel):
    imported: int
    skipped: int
    errors: int
    rows: list[ProducerImportPreviewRow]


# MEH-291: 4-value enum that consolidates is_available_today + availability_status.
# Tuple form is the runtime allowlist used by the field validator below and by
# routers/producer_me.py for dual-write mirroring during the 7-day overlap.
AVAILABILITY_STATES = (
    "accepting_orders",  # default — "פתוח להזמנות"
    "available_today",  # superset — זמין + פתוח
    "full_this_week",  # "עמוסה השבוע"
    "on_vacation",  # "בהפסקה" (requires vacation_until)
)


class ProducerUpdate(BaseModel):
    name: str | None = None
    contact_name: str | None = None
    description: str | None = None
    short_description: str | None = None
    city: str | None = None
    # MEH-829: editable street address (private — admin/owner only on the *Out
    # side). Mirrors the ProducerRegister cap.
    address: str | None = Field(default=None, max_length=255)
    lat: float | None = None
    lng: float | None = None
    phone: str | None = None
    instagram: str | None = None
    website: str | None = None
    whatsapp_group: str | None = None
    # MEH-17
    primary_contact_method: str | None = None
    contact_email: EmailStr | None = None
    # MEH-296: extra contact channels (http(s) URL-guarded below).
    facebook: str | None = None
    external_order_form: str | None = None
    slug: str | None = None
    top_product_name: str | None = None
    starting_price_label: str | None = None
    price_range: str | None = None
    grass_fed: bool | None = None
    organic_certified: bool | None = None
    # MEH-293/MEH-479: dietary flags moved to products.is_X.
    has_delivery: bool | None = None
    pickup_points: bool | None = None
    kosher: str | None = None
    # MEH-530: optional patch field. Router calls ensure_license_for_categories
    # whenever category_ids OR producer_license_number is in the body — see
    # routers/producer_me.py + routers/admin.py.
    producer_license_number: str | None = Field(default=None, max_length=20)
    admin_notes: str | None = None
    # MEH-766 ch3: is_verified removed from ProducerUpdate — the admin PUT
    # setattr-loop can no longer write it (verification = grant-verified only).
    # MEH-18
    is_recommended: bool | None = None
    is_available_today: bool | None = None
    images: list[str] | None = None
    status: str | None = None
    category_ids: list[int] | None = None
    delivery_area_cities: list[str] | None = (
        None  # admin form: simple list of city names
    )
    # MEH-213 — location mode
    has_physical_location: bool | None = None
    offers_delivery: bool | None = None
    delivery_nationwide: bool | None = None
    delivery_cities: list[str] | None = None
    # MEH-210 Phase 2 — custom WhatsApp question chips
    custom_questions: list[str] | None = None
    # MEH-89 — admin-settable availability (mirrors producer_me endpoint)
    availability_status: str | None = None
    # MEH-291 — 4-value enum that supersedes availability_status + is_available_today.
    # During the 7-day overlap both fields are accepted and writes mirror to old columns.
    availability_state: str | None = None
    vacation_until: date | None = None

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v):
        return sanitize_text(v, max_length=2000)

    @field_validator("short_description")
    @classmethod
    def _sanitize_short_description(cls, v):
        return sanitize_text(v, max_length=200)

    # MEH-829: sanitize the owner-editable address on PATCH /producers/me, same
    # bleach strip as the register path (_sanitize_address on ProducerRegister).
    @field_validator("address")
    @classmethod
    def _sanitize_address(cls, v):
        return sanitize_text(v, max_length=255)

    @field_validator("availability_status")
    @classmethod
    def _validate_availability_status(cls, v):
        allowed = {"available", "full", "vacation"}
        if v is not None and v not in allowed:
            raise ValueError(
                f"availability_status חייב להיות אחד מ: {', '.join(sorted(allowed))}"
            )
        return v

    @field_validator("availability_state")
    @classmethod
    def _validate_availability_state(cls, v):
        if v is not None and v not in AVAILABILITY_STATES:
            raise ValueError(
                f"availability_state חייב להיות אחד מ: {', '.join(AVAILABILITY_STATES)}"
            )
        return v

    @field_validator("custom_questions")
    @classmethod
    def _validate_custom_questions(cls, v):
        if v is None:
            return v
        filtered = [q.strip() for q in v if q.strip()]
        if len(filtered) > 5:
            raise ValueError("מותר עד 5 שאלות")
        for q in filtered:
            if len(q) > 80:
                raise ValueError("כל שאלה מוגבלת ל-80 תווים")
        return filtered

    @field_validator("primary_contact_method")
    @classmethod
    def _validate_primary_contact_method(cls, v):
        return _contact_method_validator(v)

    @field_validator("website", "facebook", "external_order_form")
    @classmethod
    def _validate_contact_urls(cls, v):
        return _url_scheme_validator(v)

    @model_validator(mode="after")
    def _validate_location_mode(self):
        hp = self.has_physical_location
        od = self.offers_delivery
        # Only validate when both are explicitly set (partial updates allowed)
        if hp is not None and od is not None and not hp and not od:
            raise ValueError("חייב לפחות אחד: חנות פיזית או משלוחים")
        dn = self.delivery_nationwide
        # MEH-903 A: XOR now guards delivery_area_cities (the delivery_areas store)
        # instead of the legacy delivery_cities column — same nationwide-XOR-cities
        # semantic, only the field source changed.
        dc = self.delivery_area_cities
        if dn and dc and len(dc) > 0:
            raise ValueError("לא ניתן לבחור גם משלוחים לכל הארץ וגם ערים ספציפיות")
        return self

    @model_validator(mode="after")
    def _validate_vacation_until(self):
        # AUD-039: the admin write path must not persist an already-past
        # return date. Israel-tz "today" (not server UTC) so an admin in
        # Israel isn't blocked on a date that's still today locally. Only
        # guards the vacation intent — a stale date on a non-vacation update
        # is ignored (the router/serializer already clears it).
        if (
            self.availability_state == "on_vacation"
            and self.vacation_until is not None
            and self.vacation_until < israel_today()
        ):
            raise ValueError("תאריך החזרה לחופשה חייב להיות עתידי")
        return self


class ProducerListOut(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    short_description: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    status: str = "pending"
    is_verified: bool = False
    plan: str = "free"
    slug: str | None = None
    top_product_name: str | None = None
    starting_price_label: str | None = None
    price_range: str | None = None
    grass_fed: bool = False
    organic_certified: bool = False
    # MEH-293/MEH-479: dietary flags live on products.is_X. The aggregated
    # has_X_products fields below are computed at serialization time by
    # attach_badge_fields — `True` when at least one product on this
    # producer carries the dietary flag (no extra query — producer.products
    # is already selectinload'ed by producer_listing). Frontend lib/badges.js
    # reads these fields directly (no legacy fallback post MEH-479).
    has_gluten_free_products: bool = False
    has_vegan_products: bool = False
    has_lactose_free_products: bool = False
    has_delivery: bool = False
    pickup_points: bool = False
    # MEH-986 ch3b (P0 legal — חוק איסור הונאה בכשרות): free-text `kosher` is NO
    # LONGER on the public output — an unverified kosher string must never
    # serialize to consumers. Re-declared on ProducerAdminOut / ProducerOwnerOut
    # (admin-internal + owner's own view). Public kosher signal is verified-only
    # via `kashrut_verified_at` (:757 below). Column stays in the model (no drop).
    # MEH-102/MEH-826: weekly hours "Sun-Thu 09:00-18:00, Fri 09:00-14:00".
    # Moved up from ProducerDetailOut so the /map card can show open/closed status.
    opening_hours: str | None = None
    is_available_today: bool = False
    # MEH-12: durable availability status (available | full | vacation).
    availability_status: str = "available"
    # MEH-291: 4-value durable enum that supersedes the two above. During the
    # 7-day overlap both surfaces are populated; reads should prefer this field.
    availability_state: str = "accepting_orders"
    # MEH-155: optional vacation end date — auto-cleared when past.
    vacation_until: date | None = None
    # MEH-17: flexible contact methods.
    primary_contact_method: str = "whatsapp"
    contact_email: str | None = None
    phone: str | None = None
    # MEH-18: manual "מומלץ" editorial pick.
    is_recommended: bool = False
    # MEH-18: computed-at-serialization fields — none of these are real
    # columns. `days_since_created` is derived from created_at; counts
    # come from the already-joinloaded relationships.
    days_since_created: int | None = None
    products_count: int = 0
    delivery_count: int = 0
    avg_rating: float = 0
    reviews_count: int = 0
    images: list[str] = []
    categories: list[CategoryOut] = []
    # Populated by /producers only when ?lat=&lng=&radius_km= are passed.
    # Computed via Haversine SQL — not a real column.
    distance_km: float | None = None
    # MEH-106: social proof — count of users who saved this producer.
    favorites_count: int = 0
    # MEH-51: trust ladder — computed at serialization, not stored.
    trust_tier: int = 1
    phone_verified: bool = False
    ambassador: bool = False
    kashrut_badges: list[str] = []
    kashrut_verified_at: datetime | None = None
    kashrut_expires_at: datetime | None = None
    # MEH-213 — location mode
    has_physical_location: bool = True
    offers_delivery: bool = False
    delivery_nationwide: bool = False
    delivery_cities: list[str] = []
    # MEH-902: serialize the rich delivery relation so MapProducerCard's
    # "delivers to your city" pill can render — it needs per-row `city` +
    # `delivery_day`, which the flat `delivery_cities` above doesn't carry.
    # Relation is already selectinload'd on the LIST query
    # (`backend/app/services/producer_listing.py:100,132`), so this is a
    # serialization-only change — no extra query, no N+1. DETAIL already
    # exposes the same field via `ProducerDetailOut:829`; this lifts it up
    # so LIST and DETAIL agree on shape. The flat `delivery_cities` column
    # is currently unused (live producers have it empty while the relation
    # has rows) — separate cleanup ticket, not addressed here.
    delivery_areas: list[DeliveryAreaOut] = []
    # MEH-530: public-facing boolean signal. Computed in attach_badge_fields
    # (`producer_queries.py`) from `producer.producer_license_number is not
    # None and stripped`. The raw number is admin-only via ProducerAdminOut.
    has_producer_license: bool = False
    # MEH-762 (ADR-022 public tier contract, Chunk 3): public verification
    # surface for the S12 badge. `verification_tier` is COMPUTED below in
    # `_compute_verification_tier` — never a stored column. `verified_at` is
    # exposed at DATE granularity only: the `date | None` annotation plus the
    # before-validator truncate the TIMESTAMPTZ so no time component leaks
    # (locked privacy table). `verification_doc_type` picks the badge tooltip
    # key. Admin-only declared_at / declaration_version / producer_license_number
    # stay OFF the public contract (MEH-530 / MEH-759 privacy-first precedent).
    verification_tier: Literal["verified", "declared"] | None = None
    verified_at: date | None = None
    verification_doc_type: Literal["license", "exemption", "cosmetics"] | None = None

    @field_validator("verified_at", mode="before")
    @classmethod
    def _verified_at_date_only(cls, v):
        # MEH-762: collapse the producers.verified_at TIMESTAMPTZ to a pure
        # date so no time component ever reaches the public payload.
        return v.date() if isinstance(v, datetime) else v

    @model_validator(mode="after")
    def _compute_trust_tier(self):
        from app.services.trust_tier import compute_trust_tier

        self.trust_tier = compute_trust_tier(self)
        # MEH-155: if vacation_until has passed, treat as available in the API response.
        # MEH-291: extend the same auto-clear to the new availability_state so
        # both surfaces stay consistent during the 7-day overlap.
        if (
            self.vacation_until is not None
            and self.vacation_until < date.today()
            and (
                self.availability_status == "vacation"
                or self.availability_state == "on_vacation"
            )
        ):
            self.availability_status = "available"
            self.availability_state = "accepting_orders"
            self.vacation_until = None
        return self

    @model_validator(mode="after")
    def _compute_verification_tier(self):
        # MEH-762 (ADR-022 D2/D3): resolve the public tier from verified_at +
        # the category licensing requirement. Mirrors the MEH-530 name-
        # membership predicate (license_validation.categories_require_license)
        # against the already-loaded categories — same single source of truth
        # (constants.LICENSE_REQUIRED_CATEGORIES), no DB round-trip in the
        # serialization layer. One license-required category is enough to
        # exclude "declared"; an unverified license-required producer resolves
        # to None (no badge, no negative label — D3). Does NOT touch
        # trust_tier (MEH-51, separate axis — Chunk-4 decoupling).
        from app.constants import LICENSE_REQUIRED_CATEGORIES

        if self.verified_at is not None:
            self.verification_tier = "verified"
        elif not any(
            c.name in LICENSE_REQUIRED_CATEGORIES for c in (self.categories or [])
        ):
            self.verification_tier = "declared"
        else:
            self.verification_tier = None
        return self

    model_config = {"from_attributes": True}


class ProducerDetailOut(ProducerListOut):
    # MEH-829: producer.address is intentionally NOT exposed here — this detail
    # endpoint is public; the street address is admin/owner-only (see
    # ProducerAdminOut / ProducerOwnerOut), per the producer_license_number
    # privacy-first precedent.
    contact_name: str | None = None
    phone: str | None = None
    instagram: str | None = None
    website: str | None = None
    whatsapp_group: str | None = None
    # MEH-296: extra contact channels (mirror website; owner-editable).
    facebook: str | None = None
    external_order_form: str | None = None
    products: list[ProductOut] = []
    delivery_areas: list[DeliveryAreaOut] = []
    report_count: int = 0
    created_at: datetime | None = None
    # MEH-53: Instagram story card URL (Cloudinary).
    story_card_url: str | None = None
    # MEH-826: opening_hours now inherited from ProducerListOut (moved up so
    # the /map card can read it too).
    # MEH-210 Phase 2 — custom WhatsApp question chips
    custom_questions: list[str] | None = None

    model_config = {"from_attributes": True}


# MEH-530: admin-only response shape. Extends ProducerDetailOut with the
# raw `producer_license_number` value. Public `/producers/{id}` and
# `/producers/by-slug/{slug}` routes keep returning ProducerDetailOut and
# only see `has_producer_license: bool` — the number stays private. Used
# by /admin/producers/* and producer_me self endpoints so admins and
# owners can see the value they themselves submitted.
class ProducerAdminOut(ProducerDetailOut):
    # MEH-986 ch3b: free-text kosher re-declared here — it was removed from the
    # public ProducerListOut but stays admin-internal (the admin table + form).
    kosher: str | None = None
    producer_license_number: str | None = None
    # MEH-829: street address submitted at registration — admin-visible (+ owner
    # via ProducerOwnerOut). NOT on ProducerDetailOut/ListOut (public), matching
    # the producer_license_number privacy precedent.
    address: str | None = None
    # MEH-509 PR3: admin-only risk surface. NULL on both = "not scored yet
    # OR Anthropic call failed (fail-open)" — frontend renders the grey
    # "אין מידע" badge. Never exposed via ProducerDetailOut (public).
    risk_score: int | None = None
    risk_reasoning: str | None = None
    # MEH-759 (ADR-022 gate 2): declaration audit trail. Admin-only — these
    # are NOT on ProducerDetailOut/ProducerListOut (public), matching the
    # MEH-530 privacy-first precedent for producer_license_number. NULL when
    # no binding declaration was made (admin-created / imported producers).
    declared_at: datetime | None = None
    declaration_version: str | None = None
    # MEH-971 chunk 3: admin-only "license pending — verify before approving"
    # flag. COMPUTED below (never a stored column) — True iff the producer is in
    # >=1 license-required category AND has no license number. Status-independent
    # so an override-approved producer (chunk-4 allow_without_license) still
    # shows it. Mirrors _compute_verification_tier's name-membership predicate
    # over the already-loaded categories (constants.LICENSE_REQUIRED_CATEGORIES)
    # — no DB round-trip, no N+1. Admin-only: lives on ProducerAdminOut, never
    # the public ProducerListOut/DetailOut.
    license_pending: bool = False

    @model_validator(mode="after")
    def _compute_license_pending(self):
        # Inline import mirrors the sibling _compute_verification_tier validator
        # (above) — keeps the constants dependency out of the module-top imports.
        from app.constants import LICENSE_REQUIRED_CATEGORIES

        needs_license = any(
            c.name in LICENSE_REQUIRED_CATEGORIES for c in (self.categories or [])
        )
        license_missing = not (self.producer_license_number or "").strip()
        self.license_pending = needs_license and license_missing
        return self


# MEH-767 (HOT-001): owner-facing self-serve response shape for
# GET/PUT /producers/me. Extends the public ProducerDetailOut with ONLY
# the owner's own license number (MEH-530 — admins AND owners see the
# value they themselves submitted; the owner edits it via the PUT
# writable-fields whitelist in producer_me.py). It intentionally does
# NOT inherit ProducerAdminOut, so the AI risk surface (risk_score /
# risk_reasoning, MEH-509 PR3) and the declaration audit trail
# (declared_at / declaration_version, MEH-759) — both admin-only — never
# serialize back to the producer being scored. Those fields have zero
# producer-side frontend consumers (the RiskBadge lives only in the
# admin table, AdminProducersTable.jsx:181).
class ProducerOwnerOut(ProducerDetailOut):
    # MEH-986 ch3b: free-text kosher re-declared — removed from public
    # ProducerListOut but the owner still sees her own value (mirrors the
    # producer_license_number/address owner-private precedent below).
    kosher: str | None = None
    producer_license_number: str | None = None
    # MEH-829: owner sees her own submitted street address (private — not on the
    # public DetailOut/ListOut).
    address: str | None = None


# --- MEH-51: Kashrut badge requests ---
class KashrutRequestCreate(BaseModel):
    badge_code: str
    cert_url: str | None = None

    @field_validator("cert_url")
    @classmethod
    def _validate_cert_url(cls, v):
        if v is not None and not v.startswith(("https://", "http://")):
            raise ValueError("cert_url חייב להתחיל ב-https:// או http://")
        return v


class KashrutRequestOut(BaseModel):
    id: UUID
    producer_id: UUID
    badge_code: str
    cert_url: str | None = None
    status: str
    notes: str | None = None
    created_at: datetime
    producer_name: str | None = None

    model_config = {"from_attributes": True}


class KashrutApproveIn(BaseModel):
    pass


class KashrutRejectIn(BaseModel):
    notes: str | None = None


class OtpConfirmIn(BaseModel):
    code: str


class SetAmbassadorIn(BaseModel):
    ambassador: bool


class GrantVerifiedIn(BaseModel):
    # MEH-762 (ADR-022 Chunk 2): which document the admin checked to grant
    # the tier-1 "מאומת" badge. Literal → an invalid value 422s before the
    # handler. 1:1 with VERIFICATION.md §3 document_type. "cosmetics" has no
    # tooltip key yet (MEH-758 micro-follow-up); the Chunk-3 resolver maps it.
    doc_type: Literal["license", "exemption", "cosmetics"]


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
    # MEH-143: True once the user has a linked producer profile.
    is_producer: bool = False
    referral_code: str | None = None
    # MEH-138: profile photo URL (Cloudinary or Google picture).
    avatar_url: str | None = None
    # MEH-206: producer status fields — populated by GET /auth/me when
    # the user has a linked producer. Used by /settings to show the
    # correct business tab state (pending/approved/rejected/suspended).
    producer_status: str | None = None
    producer_rejection_reason: str | None = None
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


# --- Home Product (מהמטבח של השכן) ---
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
    phone: str | None = None
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
    def _sanitize_title(cls, v):
        return sanitize_text(v, max_length=200)

    @field_validator("title")
    @classmethod
    def _validate_title_letters(cls, v: str) -> str:
        return _min_letters_validator(v)

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v):
        return sanitize_text(v, max_length=1000)

    @field_validator("location_notes")
    @classmethod
    def _sanitize_location_notes(cls, v):
        return sanitize_text(v, max_length=200)

    @field_validator("allergens")
    @classmethod
    def _sanitize_allergens(cls, v):
        return sanitize_text(v, max_length=200)


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
    phone: str | None = None
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
    def _sanitize_title(cls, v):
        return sanitize_text(v, max_length=200)

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v):
        return sanitize_text(v, max_length=1000)

    @field_validator("location_notes")
    @classmethod
    def _sanitize_location_notes(cls, v):
        return sanitize_text(v, max_length=200)

    @field_validator("allergens")
    @classmethod
    def _sanitize_allergens(cls, v):
        return sanitize_text(v, max_length=200)


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


# --- Rating ---
class RatingSubmit(BaseModel):
    stars: int = Field(..., ge=1, le=5)
    comment: str | None = Field(None, max_length=100)

    @field_validator("comment")
    @classmethod
    def _sanitize_comment(cls, v):
        return sanitize_text(v, max_length=100)


# --- Experiences (community-submitted workshops) ---
class ExperienceCreate(BaseModel):
    title: str = Field(..., min_length=4, max_length=300)
    description: str = Field(..., min_length=20)
    image_url: str | None = None
    category: str | None = None
    event_date: date
    event_time: time | None = None
    duration_minutes: int | None = Field(None, ge=15, le=1440)
    location_type: str = Field("home", pattern="^(home|public)$")
    city: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    max_participants: int | None = Field(None, ge=1, le=500)
    price_per_person: Decimal | None = None  # NULL / 0 = free
    requirements: str | None = None
    is_recurring: bool = False
    recurring_schedule: str | None = None

    @field_validator("title")
    @classmethod
    def _sanitize_title(cls, v):
        return sanitize_text(v, max_length=300)

    @field_validator("title")
    @classmethod
    def _validate_title_letters(cls, v: str) -> str:
        return _min_letters_validator(v)

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v):
        return sanitize_text(v, max_length=5000)

    @field_validator("requirements")
    @classmethod
    def _sanitize_requirements(cls, v):
        return sanitize_text(v, max_length=1000)

    @field_validator("address")
    @classmethod
    def _sanitize_address(cls, v):
        return sanitize_text(v, max_length=300)


class ExperienceUpdate(BaseModel):
    title: str | None = Field(None, min_length=4, max_length=300)
    description: str | None = Field(None, min_length=20)
    image_url: str | None = None
    category: str | None = None
    event_date: date | None = None
    event_time: time | None = None
    duration_minutes: int | None = Field(None, ge=15, le=1440)
    location_type: str | None = Field(None, pattern="^(home|public)$")
    city: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    max_participants: int | None = Field(None, ge=1, le=500)
    price_per_person: Decimal | None = None
    requirements: str | None = None
    is_recurring: bool | None = None
    recurring_schedule: str | None = None

    @field_validator("title")
    @classmethod
    def _sanitize_title(cls, v):
        return sanitize_text(v, max_length=300)

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v):
        return sanitize_text(v, max_length=5000)

    @field_validator("requirements")
    @classmethod
    def _sanitize_requirements(cls, v):
        return sanitize_text(v, max_length=1000)

    @field_validator("address")
    @classmethod
    def _sanitize_address(cls, v):
        return sanitize_text(v, max_length=300)


class ExperienceModerationAction(BaseModel):
    """Admin action payload for reject / request-changes."""

    feedback: str | None = Field(None, max_length=2000)


class ExperienceValidateRequest(BaseModel):
    """Real-time form validation. No auth, no persistence."""

    title: str = Field(..., min_length=1, max_length=300)
    description: str | None = None
    category: str | None = None
    city: str | None = None
    location_type: str | None = None
    price_per_person: Decimal | None = None
    max_participants: int | None = None


class ExperienceValidateResult(BaseModel):
    status: str  # APPROVED | FLAGGED | REJECTED
    reason: str | None = None
    suggestion: str | None = None


class ExperienceHostOut(BaseModel):
    id: UUID
    name: str

    model_config = {"from_attributes": True}


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
    participants_count: int = 0
    spots_left: int | None = None
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
    moderation_status: str | None = None
    moderation_reason: str | None = None
    moderation_suggestion: str | None = None
    admin_feedback: str | None = None
    rejection_reason: str | None = None

    model_config = {"from_attributes": True}


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
    def _sanitize_title(cls, v):
        return sanitize_text(v, max_length=200)

    @field_validator("title")
    @classmethod
    def _validate_title_letters(cls, v: str) -> str:
        return _min_letters_validator(v)

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v):
        return sanitize_text(v, max_length=2000) if v else v

    @field_validator("ingredients")
    @classmethod
    def _sanitize_ingredients(cls, v):
        return sanitize_text(v, max_length=5000)

    @field_validator("instructions")
    @classmethod
    def _sanitize_instructions(cls, v):
        return sanitize_text(v, max_length=10000)


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
    def _sanitize_title(cls, v):
        return sanitize_text(v, max_length=200) if v else v

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v):
        return sanitize_text(v, max_length=2000) if v else v

    @field_validator("ingredients")
    @classmethod
    def _sanitize_ingredients(cls, v):
        return sanitize_text(v, max_length=5000) if v else v

    @field_validator("instructions")
    @classmethod
    def _sanitize_instructions(cls, v):
        return sanitize_text(v, max_length=10000) if v else v


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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OutreachLeadCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    phone: str | None = Field(None, max_length=20)
    instagram: str | None = Field(None, max_length=100)
    website: str | None = Field(None, max_length=200)
    city: str | None = Field(None, max_length=100)
    category: str | None = Field(None, max_length=100)
    notes: str | None = None


class OutreachLeadUpdate(BaseModel):
    """PATCH body — any subset of fields may be omitted. Status is
    enum-validated at the route layer."""

    name: str | None = None
    phone: str | None = None
    instagram: str | None = None
    website: str | None = None
    city: str | None = None
    category: str | None = None
    notes: str | None = None
    status: str | None = None


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


# --- MEH-52 Group Buys ---
class GroupBuyCommitOut(BaseModel):
    id: UUID
    group_buy_id: UUID
    user_id: UUID
    quantity: int
    phone: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class GroupBuyOut(BaseModel):
    id: UUID
    producer_id: UUID
    producer_name: str | None = None
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
    status: str
    commits_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class GroupBuyDetail(GroupBuyOut):
    """Full detail — includes whether the current user has committed."""

    user_committed: bool = False
    user_commit: GroupBuyCommitOut | None = None


class GroupBuyCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    description: str | None = None
    product_name: str = Field(..., min_length=1, max_length=200)
    unit: str | None = Field(None, max_length=50)
    price_per_unit_regular: Decimal = Field(..., gt=0)
    price_per_unit_group: Decimal = Field(..., gt=0)
    min_participants: int = Field(..., ge=2)
    max_participants: int | None = Field(None, ge=2)
    deadline: datetime
    city: str | None = Field(None, max_length=100)


class GroupBuyCommitRequest(BaseModel):
    quantity: int = Field(1, ge=1, le=100)
    phone: str | None = Field(None, max_length=30)


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


# --- Event ---
# MEH-458: relocated from routers/events.py per ADR-006 R1.
# Pure relocation — fields, validators, model_config preserved verbatim.
class EventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    description: str | None = None
    event_date: date
    event_time: time | None = None
    location: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    image_url: str | None = None
    category: str = Field(..., min_length=1, max_length=30)
    price: int = 0
    max_participants: int | None = None
    registration_url: str | None = None

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v):
        return sanitize_text(v, max_length=2000)

    @field_validator("location")
    @classmethod
    def _sanitize_location(cls, v):
        return sanitize_text(v, max_length=200)


class EventUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    event_date: date | None = None
    event_time: time | None = None
    location: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    image_url: str | None = None
    category: str | None = None
    price: int | None = None
    max_participants: int | None = None
    registration_url: str | None = None
    is_active: bool | None = None

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v):
        return sanitize_text(v, max_length=2000)

    @field_validator("location")
    @classmethod
    def _sanitize_location(cls, v):
        return sanitize_text(v, max_length=200)


class EventOut(BaseModel):
    id: UUID
    producer_id: UUID
    producer_name: str | None = None
    title: str
    description: str | None = None
    event_date: date
    event_time: time | None = None
    location: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    image_url: str | None = None
    category: str
    price: int
    max_participants: int | None = None
    registration_url: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class EventFilters(BaseModel):
    """MEH-447: query-param bag for GET /events. Used via
    Annotated[EventFilters, Depends()] so FastAPI exposes each field as
    an individual query parameter — preserving the pre-refactor OpenAPI
    schema verbatim while keeping list_events under PLR0913's 5-arg cap."""

    city: str | None = Field(default=None)
    category: str | None = Field(default=None)
    from_date: date | None = Field(default=None)
    to_date: date | None = Field(default=None)
    producer_id: UUID | None = Field(default=None)


# --- Review (ProducerReview) ---
# MEH-458: relocated from routers/reviews.py per ADR-006 R1.
# created_at: str preserved (Drift #4 in audit, intentional out-of-scope).
class ReviewCreateNested(BaseModel):
    stars: int = Field(..., ge=1, le=5)
    body: str = Field(..., min_length=10, max_length=500)

    @field_validator("body")
    @classmethod
    def _sanitize_body(cls, v):
        return sanitize_text(v, max_length=500)


class ReviewOut(BaseModel):
    id: UUID
    producer_id: UUID
    user_id: UUID
    user_name: str | None = None
    stars: int
    body: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class AdminReviewOut(BaseModel):
    id: UUID
    producer_id: UUID
    producer_name: str | None = None
    user_id: UUID
    user_name: str | None = None
    user_email: str | None = None
    stars: int
    body: str | None = None
    is_hidden: bool
    created_at: str

    model_config = {"from_attributes": True}


class ReviewsPage(BaseModel):
    reviews: list[ReviewOut]
    total: int
    page: int
    pages: int

    model_config = {"from_attributes": True}


# --- Admin (admin.py + admin_extra.py) ---
# MEH-460 Pkg 1: relocated from routers/admin.py + routers/admin_extra.py
# per ADR-006 R1. Pure relocation — fields, validators, model_config
# preserved verbatim. CategoryOut excluded — it was byte-identical to
# the public CategoryOut in the Category section above; admin_extra.py
# now imports it from there instead of redefining.


# Admin: Moderation
class RemoveListingBody(BaseModel):
    reason: str | None = None


class StoryCardUploadRequest(BaseModel):
    image_data: str  # base64-encoded JPEG data URI: "data:image/jpeg;base64,..."


# Admin: Users
class UserAdminOut(BaseModel):
    id: UUID
    email: str
    name: str
    city: str | None = None
    phone: str | None = None
    role: str
    is_blocked: bool = False
    producer_id: UUID | None = None
    favorites_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class UserRoleUpdate(BaseModel):
    role: str = Field(..., pattern="^(consumer|producer|admin)$")


# Admin: Categories
class CategoryIn(BaseModel):
    name: str
    emoji: str | None = None


# Admin: Static Pages
class StaticPageOut(BaseModel):
    slug: str
    title: str
    body: str
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class StaticPageUpdate(BaseModel):
    title: str
    body: str


# --- Users (users_me.py) ---
# MEH-460 Pkg 2: relocated from routers/users_me.py per ADR-006 R1.
# Pure relocation — fields preserved verbatim. Validators (verify_password,
# validate_password) stay in the change_password handler, not the schema.
class ProfileUpdate(BaseModel):
    """PATCH body — any subset of fields may be omitted."""

    name: str | None = Field(None, min_length=1, max_length=200)
    email: EmailStr | None = None
    avatar_url: str | None = None
    city: str | None = Field(None, max_length=100)


class PasswordChange(BaseModel):
    # current_password stays a plain str (not PasswordField) — old passwords
    # may predate the policy and shorter values must still be acceptable as
    # current. The verify_password call is the only authority on its validity.
    current_password: str = Field(..., min_length=1)
    # MEH-306: 12-char floor at schema layer; deny-list / HIBP / reuse run in
    # the change_password handler via validate_password.
    new_password: PasswordField


# --- Producer Me (producer_me.py) ---
# MEH-460 Pkg 2: relocated from routers/producer_me.py per ADR-006 R1.
# AvailabilityStatusUpdate is the legacy MEH-291 surface; AvailabilityStateUpdate
# is the new 4-value enum surface. Both kept during the 7-day overlap;
# Phase 4 will drop the legacy. Schema relocation does NOT affect MEH-291.
# AVAILABILITY_STATUSES (the legacy {"available","full","vacation"} set used
# only by the handler for runtime validation) stays in producer_me.py — it's
# not a schema field. AVAILABILITY_STATES (the new 4-value tuple) lives in
# this file already (see Producer section above, MEH-291).
class AvailabilityStatusUpdate(BaseModel):
    status: str = Field(..., description="available | full | vacation")
    vacation_until: date | None = Field(
        None, description="Optional return date (vacation only)"
    )


class AvailabilityStateUpdate(BaseModel):
    state: str = Field(
        ...,
        description="accepting_orders | available_today | full_this_week | on_vacation",
    )
    vacation_until: date | None = Field(
        None, description="Required when state='on_vacation'"
    )


class BioGenerateIn(BaseModel):
    source: str = Field(..., min_length=1, max_length=500)


# --- Search (search.py) ---
# MEH-460 Pkg 3: relocated from routers/search.py per ADR-006 R1.
# Pure relocation — fields preserved verbatim. SearchOut composes the 3
# Hit classes; all 4 move together so the list[X] references resolve in
# module order. Router-local concerns (_trending_cache, _TRENDING_TTL,
# _HEBREW_PREFIXES, _strip_hebrew_prefix, _empty) stay in search.py —
# handler-side, not schema fields.
class ProducerHit(BaseModel):
    id: UUID
    name: str
    slug: str | None = None
    city: str | None = None
    avg_rating: float = 0
    reviews_count: int = 0
    image: str | None = None


class ProductHit(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    producer_id: UUID
    producer_name: str
    producer_slug: str | None = None


class CategoryHit(BaseModel):
    id: int
    name: str
    emoji: str | None = None


class SearchOut(BaseModel):
    producers: list[ProducerHit] = []
    products: list[ProductHit] = []
    cities: list[str] = []
    categories: list[CategoryHit] = []


# --- Alerts (alerts.py) ---
# MEH-460 Pkg 4: relocated from routers/alerts.py per ADR-006 R1.
# AlertContent has cross-router callers (events.py, producer_me.py); the
# router re-exports it via `from app.schemas.schemas import AlertContent`
# so existing `from app.routers.alerts import AlertContent` paths keep
# resolving without touching the callers (same pattern as Pkg 1).
class AlertPrefsIn(BaseModel):
    notify_new_product: bool = True
    notify_new_event: bool = True
    notify_delivery_area: bool = True
    whatsapp_opt_in: bool = False
    push_subscription: dict | None = None


class AlertPrefsOut(BaseModel):
    enabled: bool
    notify_new_product: bool
    notify_new_event: bool
    notify_delivery_area: bool
    whatsapp_opt_in: bool
    has_push: bool


class AlertContent(BaseModel):
    """MEH-447: collapse (title, body, url) into a single payload object so
    fire_alerts stays under PLR0913's 5-arg threshold without losing
    keyword clarity at call sites."""

    title: str
    body: str
    url: str = "/"


# --- Chat (chat.py) ---
# MEH-460 Pkg 4: relocated from routers/chat.py per ADR-006 R1.
# ChatRequest composes list[ChatMessage]; all 3 moved together so the
# reference resolves in module order. Router-local concerns (CHAT_MODEL,
# MAX_HISTORY_TURNS, MAX_OUTPUT_TOKENS, SYSTEM_PROMPT, _strip_markdown,
# _get_client) stay in chat.py — handler-side, not schema fields.
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    # Full conversation history. Client tracks the state and re-sends
    # each turn — the API is stateless. We trim server-side as a backstop.
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)


class ChatResponse(BaseModel):
    reply: str


# --- Marketing (marketing.py) ---
# MEH-460 Pkg 5 (FINAL): relocated from routers/marketing.py per ADR-006 R1.
# ContactIn's @field_validator validators call sanitize_text — already
# imported at the top of this file (line 9). Handler-side concerns
# (_send_contact_email, rate-limit decorators) stay in marketing.py.
class StatsOut(BaseModel):
    producers_count: int
    categories_count: int


class NewsletterIn(BaseModel):
    email: EmailStr


class ContactIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    message: str = Field(..., min_length=1, max_length=5000)

    @field_validator("name")
    @classmethod
    def _sanitize_name(cls, v):
        return sanitize_text(v, max_length=200)

    @field_validator("message")
    @classmethod
    def _sanitize_message(cls, v):
        return sanitize_text(v, max_length=5000)


# --- Producers (router) ---
# MEH-460 Pkg 5 (FINAL): relocated from routers/producers.py per ADR-006 R1.
# producers.py is a central component — only the class itself moved.
# Handler-side concerns (_VALID_CONTACT_METHODS frozenset at producers.py:216,
# the record_contact_click handler) stay in the router.
class ContactClickIn(BaseModel):
    method: str


# --- Referrals (referrals.py) ---
# MEH-460 Pkg 5 (FINAL): relocated from routers/referrals.py per ADR-006 R1.
class ClaimReferralRequest(BaseModel):
    code: str


# --- Admin: vacation mode (admin_extra.py) ---
# MEH-509 PR2a: typed wrapper over the AdminSetting key-value store for the
# two vacation_* keys. Shared by GET + POST /admin/settings/vacation so the
# wire shape is identical in both directions.
class VacationModeState(BaseModel):
    active: bool
    return_date: date | None = None

    @model_validator(mode="after")
    def _require_return_date_when_active(self) -> "VacationModeState":
        if self.active and self.return_date is None:
            raise ValueError("חובה לציין תאריך חזרה כשמצב חופשה מופעל")
        return self


# --- Admin: producer risk score (admin_extra.py) ---
# MEH-509 PR3: shape of GET /admin/producers/{id}/risk-score. Both fields
# nullable — NULL means "not scored yet OR Anthropic call failed".
class RiskScoreResponse(BaseModel):
    score: int | None = None
    reasoning: str | None = None


# --- Admin: undelivered WhatsApp messages (admin_whatsapp.py) ---
# MEH-771 Chunk C: shape of GET /admin/whatsapp/failed. One row per
# outbound message that did NOT reach the recipient (status='failed' or
# 'window_expired') in the last 7 days. error_code / error_message /
# updated_at are nullable — populated by the webhook reconcile path
# (Chunk B) when Meta returns an error object, or left NULL when the
# status was set at send time (e.g. immediate window_expired).
class OutboundMessageAdminOut(BaseModel):
    id: UUID
    to_phone: str
    kind: str
    status: str
    error_code: int | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}
