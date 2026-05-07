from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.schemas.password import PasswordField
from app.services.sanitization import sanitize_text


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
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    phone: str | None = None
    instagram: str | None = None
    website: str | None = None
    # MEH-17: flexible contact methods.
    primary_contact_method: str = "whatsapp"
    contact_email: EmailStr | None = None
    category_ids: list[int] = []
    gluten_free: bool = False
    vegan: bool = False
    lactose_free: bool = False
    # Delivery areas
    delivery_areas: list["DeliveryAreaCreate"] = []

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v):
        return sanitize_text(v, max_length=2000)


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


class ProducerAdminCreate(BaseModel):
    """Used by admin form — pre-approved, supports all extended fields."""
    name: str
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
    slug: str | None = None
    top_product_name: str | None = None
    price_range: str | None = None
    grass_fed: bool = False
    organic_certified: bool = False
    gluten_free: bool = False
    vegan: bool = False
    lactose_free: bool = False
    has_delivery: bool = False
    pickup_points: bool = False
    kosher: str | None = None
    admin_notes: str | None = None
    is_verified: bool = True
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

    @model_validator(mode="after")
    def _validate_location_mode(self):
        if not self.has_physical_location and not self.offers_delivery:
            raise ValueError("חייב לפחות אחד: חנות פיזית או משלוחים")
        if self.delivery_nationwide and len(self.delivery_cities) > 0:
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
    "accepting_orders",   # default — "פתוח להזמנות"
    "available_today",    # superset — זמין + פתוח
    "full_this_week",     # "עמוסה השבוע"
    "on_vacation",        # "בהפסקה" (requires vacation_until)
)


class ProducerUpdate(BaseModel):
    name: str | None = None
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
    primary_contact_method: str | None = None
    contact_email: EmailStr | None = None
    slug: str | None = None
    top_product_name: str | None = None
    starting_price_label: str | None = None
    price_range: str | None = None
    grass_fed: bool | None = None
    organic_certified: bool | None = None
    gluten_free: bool | None = None
    vegan: bool | None = None
    lactose_free: bool | None = None
    has_delivery: bool | None = None
    pickup_points: bool | None = None
    kosher: str | None = None
    admin_notes: str | None = None
    is_verified: bool | None = None
    # MEH-18
    is_recommended: bool | None = None
    is_available_today: bool | None = None
    images: list[str] | None = None
    status: str | None = None
    category_ids: list[int] | None = None
    delivery_area_cities: list[str] | None = None  # admin form: simple list of city names
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

    @field_validator("availability_status")
    @classmethod
    def _validate_availability_status(cls, v):
        allowed = {"available", "full", "vacation"}
        if v is not None and v not in allowed:
            raise ValueError(f"availability_status חייב להיות אחד מ: {', '.join(sorted(allowed))}")
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

    @model_validator(mode="after")
    def _validate_location_mode(self):
        hp = self.has_physical_location
        od = self.offers_delivery
        # Only validate when both are explicitly set (partial updates allowed)
        if hp is not None and od is not None and not hp and not od:
            raise ValueError("חייב לפחות אחד: חנות פיזית או משלוחים")
        dn = self.delivery_nationwide
        dc = self.delivery_cities
        if dn and dc and len(dc) > 0:
            raise ValueError("לא ניתן לבחור גם משלוחים לכל הארץ וגם ערים ספציפיות")
        return self


class ProducerListOut(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    short_description: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    status: str
    is_verified: bool
    plan: str = "free"
    slug: str | None = None
    top_product_name: str | None = None
    starting_price_label: str | None = None
    price_range: str | None = None
    grass_fed: bool = False
    organic_certified: bool = False
    gluten_free: bool = False
    vegan: bool = False
    lactose_free: bool = False
    has_delivery: bool = False
    pickup_points: bool = False
    kosher: str | None = None
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

    model_config = {"from_attributes": True}


class ProducerDetailOut(ProducerListOut):
    contact_name: str | None = None
    phone: str | None = None
    instagram: str | None = None
    website: str | None = None
    whatsapp_group: str | None = None
    products: list[ProductOut] = []
    delivery_areas: list[DeliveryAreaOut] = []
    report_count: int = 0
    created_at: datetime
    # MEH-53: Instagram story card URL (Cloudinary).
    story_card_url: str | None = None
    # MEH-102: weekly opening hours. Format: "Sun-Thu 09:00-18:00, Fri 09:00-14:00"
    opening_hours: str | None = None
    # MEH-210 Phase 2 — custom WhatsApp question chips
    custom_questions: list[str] | None = None

    model_config = {"from_attributes": True}


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
    vacation_until: date | None = Field(None, description="Optional return date (vacation only)")


class AvailabilityStateUpdate(BaseModel):
    state: str = Field(..., description="accepting_orders | available_today | full_this_week | on_vacation")
    vacation_until: date | None = Field(None, description="Required when state='on_vacation'")


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
