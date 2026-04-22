from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


# --- Auth ---
class UserRegister(BaseModel):
    email: EmailStr
    name: str
    password: str
    city: str | None = None
    phone: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class ProducerRegister(BaseModel):
    # User account — optional when upgrading an already-authenticated user
    # (MEH-143). Required for new (unauthenticated) registrations; the
    # router validates and raises 422 when they are absent in that case.
    email: EmailStr | None = None
    name: str | None = None
    password: str | None = None
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


class GoogleAuthRequest(BaseModel):
    id_token: str


class AppleAuthRequest(BaseModel):
    id_token: str
    name: str | None = None  # Apple only sends name on first auth


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
        if (
            self.availability_status == "vacation"
            and self.vacation_until is not None
            and self.vacation_until < date.today()
        ):
            self.availability_status = "available"
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
