import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSON, UUID
from sqlalchemy.orm import relationship

from app.database import Base


class City(Base):
    """MEH-213: canonical Israeli city list seeded from data.gov.il.
    Used to validate delivery_cities on producers — free text is forbidden
    to prevent duplicates and broken search (e.g. ת״א vs תל אביב-יפו).
    """

    __tablename__ = "cities"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name_he = Column(String(100), unique=True, nullable=False)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Producer(Base):
    __tablename__ = "producers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    contact_name = Column(String(200), nullable=True)
    description = Column(Text)
    short_description = Column(Text, nullable=True)
    city = Column(String(100))
    lat = Column(Float)
    lng = Column(Float)
    phone = Column(String(20))
    instagram = Column(String(100))
    website = Column(String(200))
    whatsapp_group = Column(String(300), nullable=True)  # invite link
    # MEH-17: flexible contact methods. `primary_contact_method` decides
    # which CTA is rendered prominently on ProducerDetail + which icon
    # is highlighted on ProducerCard. Values (MEH-296): whatsapp | phone |
    # instagram | email | website | facebook | external_order
    # (default: whatsapp). `contact_email` is the producer's business
    # email — distinct from the owner user's login email.
    primary_contact_method = Column(String(20), default="whatsapp")
    contact_email = Column(String(200), nullable=True)
    # MEH-296: extra contact channels. URLs validated at the API boundary
    # (schemas.ProducerUpdate, http(s) only). Free-text columns, no enum.
    facebook = Column(String(200), nullable=True)
    external_order_form = Column(String(500), nullable=True)
    status = Column(
        String(20), default="pending"
    )  # pending | approved | rejected | inactive
    images = Column(ARRAY(Text), default=[])
    is_verified = Column(Boolean, default=False)
    # MEH-18: manual "מומלץ" (recommended) badge toggled by admins. Separate
    # from the "verified" trust badge — recommended ≈ editorial pick.
    is_recommended = Column(Boolean, default=False)
    # MEH-53: URL of the auto-generated Instagram story card (Cloudinary).
    story_card_url = Column(String(500), nullable=True)
    plan = Column(String(20), default="free")  # free | premium
    slug = Column(String(100), unique=True, nullable=True)  # custom URL: /[slug]
    top_product_name = Column(
        String(200), nullable=True
    )  # featured product for cards/map
    starting_price_label = Column(
        String(50), nullable=True
    )  # legacy alias for price_range
    price_range = Column(String(100), nullable=True)  # "מ-₪20" / "מ-₪65/ק״ג"
    grass_fed = Column(Boolean, default=False)
    organic_certified = Column(Boolean, default=False)
    # MEH-293/MEH-479: dietary flags moved to products.is_X (canonical) and
    # ProducerListOut.has_X_products (aggregated, computed at attach time).
    has_delivery = Column(Boolean, default=False)
    pickup_points = Column(Boolean, default=False)
    kosher = Column(String(50), nullable=True)  # כשר / לא כשר / כשר למהדרין
    # MEH-530: manufacturer license number (משרד הבריאות). Nullable at the
    # DB level so existing producer rows stay valid; required-vs-optional
    # is enforced at the application layer (router-level helper
    # app/services/license_validation.py — depends on selected categories).
    # Exposed publicly only as the derived boolean `has_producer_license`
    # on ProducerListOut / ProducerDetailOut; the raw value is admin-only
    # via ProducerAdminOut.
    producer_license_number = Column(String(20), nullable=True)
    # MEH-759 (ADR-022 gate 2): binding tier-2 declaration audit trail.
    # Both nullable — existing rows predate the trail; Expand-only (ADR-007,
    # no backfill). `declared_at` = when the binding declaration was made;
    # `declaration_version` = which lawyer-locked text version was agreed to
    # (Brief Q1.4 — timestamp + version strengthen the good-faith reliance
    # defense). Stamping is Chunk B; raw values are admin-only exposure
    # (ProducerAdminOut), never public — MEH-530 privacy-first precedent.
    declared_at = Column(DateTime(timezone=True), nullable=True)
    declaration_version = Column(String(10), nullable=True)
    # MEH-762 (ADR-022 public tier contract, Chunk 1): tier-1 "מאומת"
    # verification trail. Both nullable, Expand-only (ADR-007, no backfill).
    # `verified_at` = when the admin checked the qualifying document
    # (timezone-aware; Chunk-2 stamping uses now(timezone.utc) like MEH-759,
    # NOT utcnow). `verification_doc_type` = which document granted the badge —
    # by-convention 'license' | 'exemption' | 'cosmetics' (1:1 with
    # VERIFICATION.md §3; no DB enum/CHECK, app-layer enforced like
    # availability_state). The public `verification_tier` ("verified" |
    # "declared") is COMPUTED in schemas (Chunk 3) from verified_at + the
    # category's licensing requirement — NEVER stored. No `verified_by`
    # column in V1 (single admin — MEH-762 D1). Paired migration: f1c7b9a3e264.
    verified_at = Column(DateTime(timezone=True), nullable=True)
    verification_doc_type = Column(String(20), nullable=True)
    admin_notes = Column(Text, nullable=True)  # internal — not exposed publicly
    # MEH-509 PR3: Anthropic-Haiku-backed signup risk score.
    # Populated asynchronously by app/services/producer_risk.py via
    # FastAPI BackgroundTasks after producer signup. Both columns
    # nullable — NULL means "not scored yet OR Anthropic call failed
    # (fail-open)". score is clamped to [0,100] at the app layer; no
    # CHECK constraint so any corrupt persisted value still renders in
    # the admin "out of range" grey state rather than 500ing the GET.
    risk_score = Column(Integer, nullable=True)
    risk_reasoning = Column(Text, nullable=True)
    is_available_today = Column(Boolean, default=False)  # producer self-marks daily
    # MEH-12: durable availability status (vs. the per-day is_available_today above).
    # Values: "available" (default) | "full" | "vacation". Rendered as a
    # colored-dot badge on ProducerCard + ProducerDetail.
    availability_status = Column(String(20), default="available")
    # MEH-291: 4-value enum that consolidates is_available_today + availability_status.
    # Old columns preserved during 7-day overlap; dual-write happens in producer_me.py.
    # Phase 4 will drop is_available_today + availability_status; vacation_until stays.
    availability_state = Column(
        String(32),
        nullable=False,
        server_default=text("'accepting_orders'"),
    )
    # MEH-155: optional vacation end date — cleared automatically when past.
    vacation_until = Column(Date, nullable=True)
    # MEH-102: weekly opening hours, free-text.  Format: "Sun-Thu 09:00-18:00, Fri 09:00-14:00"
    opening_hours = Column(String, nullable=True)
    # MEH-213: location mode. Two independent booleans (not an enum) because
    # a producer can have BOTH a physical store AND offer delivery.
    # CHECK constraint (has_physical_location OR offers_delivery) enforced in DB.
    has_physical_location = Column(Boolean, nullable=False, default=True)
    offers_delivery = Column(Boolean, nullable=False, default=False)
    # Delivery scope — mutually exclusive: nationwide flag XOR city list.
    delivery_nationwide = Column(Boolean, nullable=False, default=False)
    delivery_cities = Column(ARRAY(Text), nullable=False, default=[])
    # Aggregates (denormalized for fast list queries) — maintained in review router
    avg_rating = Column(Float, default=0)
    reviews_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_active_at = Column(DateTime, default=datetime.utcnow)  # for v2 activity check
    # MEH-51: trust ladder + kashrut badges
    phone_verified = Column(Boolean, default=False)
    ambassador = Column(Boolean, default=False)
    kashrut_badges = Column(ARRAY(Text), default=[])
    kashrut_verified_at = Column(DateTime, nullable=True)
    kashrut_expires_at = Column(DateTime, nullable=True)
    # MEH-210 Phase 2 — producer-defined WhatsApp question chips (overrides category defaults).
    custom_questions = Column(ARRAY(Text), nullable=True)
    # MEH-283 — admin reject reason surfaced on /auth/me as producer_rejection_reason.
    # Accessed in auth.py::get_me; missing column was raising AttributeError for any
    # user with a producer_id since MEH-206 (ORM never declared it, _migrate_columns
    # never added it to the DB, baseline didn't pick it up).
    rejection_reason = Column(Text, nullable=True)
    # MEH-539: timestamps for the 4 onboarding follow-up emails (Day 2 / 5 /
    # 10 / 30). NULL = not yet sent — non-null is the durable "delivered to
    # Resend" record. Scheduler (APScheduler, daily) reads created_at +
    # these flags to decide who's due. See migration b504e4be4225.
    email_followup_2_sent_at = Column(DateTime(timezone=True), nullable=True)
    email_followup_3_sent_at = Column(DateTime(timezone=True), nullable=True)
    email_followup_4_sent_at = Column(DateTime(timezone=True), nullable=True)
    email_followup_5_sent_at = Column(DateTime(timezone=True), nullable=True)

    categories = relationship(
        "Category", secondary="producer_categories", back_populates="producers"
    )
    products = relationship(
        "Product", back_populates="producer", cascade="all, delete-orphan"
    )
    delivery_areas = relationship(
        "DeliveryArea", back_populates="producer", cascade="all, delete-orphan"
    )
    favorited_by = relationship(
        "Favorite", back_populates="producer", cascade="all, delete-orphan"
    )
    reports = relationship(
        "Report", back_populates="producer", cascade="all, delete-orphan"
    )
    reviews = relationship(
        "ProducerReview", back_populates="producer", cascade="all, delete-orphan"
    )
    # MEH-588: producer-owned recipes (chunk 1/4). Cascade delete so a
    # producer teardown removes its recipes (and the link rows via the
    # FK cascade on producer_recipe_products.recipe_id).
    producer_recipes = relationship(
        "ProducerRecipe", back_populates="producer", cascade="all, delete-orphan"
    )

    # Full-text search on producer name (Hebrew-friendly via 'simple' config).
    __table_args__ = (
        Index(
            "idx_producers_name",
            text("to_tsvector('simple', name)"),
            postgresql_using="gin",
        ),
        # idx_producers_availability_state — added in MEH-291 migration
        # 2a74fa41ceb1 (2026-05-04). Partial index covers non-default
        # availability states; pairs with producer_listing.py:174 filter.
        # Predicate written in Postgres canonical form (varchar comparison
        # with ::text casts + <> operator) to satisfy `alembic check`.
        # Source migration uses `!=` → Postgres reconstructs as `<>` in
        # pg_get_expr(), forcing the canonical-form match here.
        Index(
            "idx_producers_availability_state",
            "availability_state",
            postgresql_where=text(
                "(availability_state)::text <> 'accepting_orders'::text"
            ),
        ),
        # MEH-539: btree index on created_at supports the daily follow-up
        # scheduler query `WHERE created_at BETWEEN today-N AND today-N+1`.
        # Added in migration b504e4be4225 alongside the 4 email_followup_*
        # columns above.
        Index("idx_producers_created_at", "created_at"),
    )


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(200), unique=True, nullable=False)
    name = Column(String(200), nullable=False)
    password_hash = Column(
        String(200), nullable=True
    )  # nullable for Google OAuth users
    city = Column(String(100))
    phone = Column(String(20))
    role = Column(String(20), default="consumer")  # consumer | producer | admin
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="SET NULL"),
        nullable=True,
    )
    google_id = Column(String(200), unique=True, nullable=True)
    apple_id = Column(String(200), unique=True, nullable=True)
    is_blocked = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Analytics (feature/producer-analytics): updated on every authenticated
    # request via a tiny middleware in main.py. Used to compute daily-active-user
    # counts on the /admin/dashboard. Nullable for pre-existing users who
    # haven't made a request yet after this column was added.
    last_active_at = Column(DateTime, nullable=True, index=True)
    # MEH-49: referral code — unique 8-char code generated at registration.
    # Used to build /ref/{code} links that credit the referrer.
    referral_code = Column(String(20), unique=True, nullable=True, index=True)
    # MEH-143: one account / multiple roles. True once the user has ever
    # registered a producer, even if role is later changed by admin.
    is_producer = Column(Boolean, default=False)
    # MEH-138: profile photo. Populated from Google OAuth picture on first
    # login, or via manual upload through POST /upload/avatar.
    avatar_url = Column(String, nullable=True)
    # MEH-166: password reset. Token is a 32-byte URL-safe random string,
    # expires 1 hour after issue, cleared on redeem or re-issue.
    reset_token = Column(String(64), nullable=True, index=True)
    reset_token_expires_at = Column(DateTime, nullable=True)
    # MEH-206: logout-all-devices. Encoded as `tv` claim in JWT.
    # POST /auth/logout-all-devices increments this; old tokens with a
    # stale `tv` value are rejected. Fail-open: tokens without a `tv`
    # claim (issued before this column) are still accepted.
    token_version = Column(Integer, default=1, nullable=False, server_default="1")
    # MEH-305: timestamp of last password change. Compared against the
    # `iat` claim in get_current_user / /auth/refresh — tokens issued
    # before the password change are rejected. NULL = never changed
    # (or pre-MEH-305 user) — fail-open, no token rejection.
    password_changed_at = Column(DateTime(timezone=True), nullable=True, default=None)
    # MEH-192: email verification. Token is cleared on successful verify.
    email_verified = Column(Boolean, default=False)
    email_verify_token = Column(String(64), nullable=True, index=True)
    email_verify_expires = Column(DateTime, nullable=True)

    producer = relationship("Producer")
    favorites = relationship(
        "Favorite", back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def is_oauth(self) -> bool:
        """MEH-16: True when the user signed up via OAuth (no local
        password). Consumed by UserOut → /settings to hide the
        password-change form for accounts that have no password_hash.
        """
        return not self.password_hash


class AdminSetting(Base):
    __tablename__ = "admin_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OutreachLead(Base):
    """Producer outreach lead (MEH-22).

    Manual list of prospective businesses an admin is reaching out to.
    Status pipeline: new → contacted → replied → registered (or declined).
    `prefill_token` lets an admin send a single-use registration link
    that pre-populates the /register/producer form so the prospect's
    only friction is choosing a password.

    Soft uniqueness via `(lower(name), lower(city))` — handled at the
    application layer in the create endpoint, not as a DB UNIQUE
    constraint, so case-and-trim variations are caught the same way.
    """

    __tablename__ = "outreach_leads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    phone = Column(String(20), nullable=True)
    instagram = Column(String(100), nullable=True)
    website = Column(String(200), nullable=True)
    city = Column(String(100), nullable=True)
    category = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    source = Column(String(50), default="manual")  # manual | claude_search (future)
    status = Column(
        String(20), default="new"
    )  # new | contacted | replied | registered | declined
    # Prefill token — minted on demand for "הכן פרופיל". Single-use is
    # not enforced; the token expires 30 days after mint and is rotated
    # whenever the admin clicks the button again.
    prefill_token = Column(String(64), unique=True, nullable=True, index=True)
    prefill_token_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StaticPage(Base):
    __tablename__ = "static_pages"

    slug = Column(String(50), primary_key=True)  # 'about' | 'terms'
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    emoji = Column(String(10))

    producers = relationship(
        "Producer", secondary="producer_categories", back_populates="categories"
    )


class ProducerCategory(Base):
    __tablename__ = "producer_categories"

    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        primary_key=True,
    )
    category_id = Column(
        Integer, ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True
    )


class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    name = Column(String(200), nullable=False)
    description = Column(Text)
    price_range = Column(String(50))  # legacy: removal tracked in MEH-295 follow-up
    image_url = Column(Text)
    price_min = Column(Numeric(10, 2), nullable=True)
    price_max = Column(Numeric(10, 2), nullable=True)
    # MEH-293: per-product dietary flags. Old producer-level columns
    # (producers.gluten_free / vegan / lactose_free) preserved during the
    # 7-day overlap; reads aggregate `any(p.is_X for p in producer.products)`
    # and the public filter switches to an EXISTS subquery on these.
    is_gluten_free = Column(
        Boolean, default=False, nullable=False, server_default=text("false")
    )
    is_vegan = Column(
        Boolean, default=False, nullable=False, server_default=text("false")
    )
    is_lactose_free = Column(
        Boolean, default=False, nullable=False, server_default=text("false")
    )

    producer = relationship("Producer", back_populates="products")
    # MEH-588: M2M back-ref so a Product can list the producer's recipes
    # that promote it. `secondary` points to the link Table defined below.
    recipes = relationship(
        "ProducerRecipe",
        secondary="producer_recipe_products",
        back_populates="products",
    )

    # idx_products_dietary — added in MEH-293 migration 1afe844d11f4
    # (2026-05-07). Partial index covers products with at least one
    # dietary flag set; mirrors EXISTS-subquery filter pattern.
    __table_args__ = (
        Index(
            "idx_products_dietary",
            "producer_id",
            postgresql_where=text("is_gluten_free OR is_vegan OR is_lactose_free"),
        ),
    )


class DeliveryArea(Base):
    __tablename__ = "delivery_areas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    city = Column(String(100), nullable=False)
    min_order = Column(Integer)
    delivery_day = Column(String(50))

    producer = relationship("Producer", back_populates="delivery_areas")


class Favorite(Base):
    __tablename__ = "favorites"

    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="favorites")
    producer = relationship("Producer", back_populates="favorited_by")


class FavoriteAlert(Base):
    """MEH-54: per-producer alert preferences for favorited producers.

    One row per (user, producer) pair — UNIQUE enforced at DB level.
    Each bool controls whether that alert type fires for this user+producer.
    push_subscription stores the Web Push API subscription JSON
    ({endpoint, keys: {p256dh, auth}}); nullable when push not granted.
    """

    __tablename__ = "favorite_alerts"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "producer_id", name="uq_favorite_alert_per_producer"
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    notify_new_product = Column(Boolean, default=True)
    notify_new_event = Column(Boolean, default=True)
    notify_delivery_area = Column(Boolean, default=True)
    push_subscription = Column(JSON, nullable=True)
    whatsapp_opt_in = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
    producer = relationship("Producer")


class ProducerFollower(Base):
    """docs/archive/FEEDBACK_FIXES.md new feature — follow a producer to get notified
    about new products / back-in-stock events. Distinct from Favorite:
    favorites are for bookmarking, follows are for push notifications.
    The notification transport itself (Twilio/FCM) is NOT wired up yet —
    this is the data-only foundation.
    """

    __tablename__ = "producer_followers"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "producer_id", name="uq_one_follow_per_user_producer"
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    notify_new_products = Column(Boolean, default=True)
    notify_back_in_stock = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    producer = relationship("Producer")


# MEH-587: Recipe + RecipeIngredient removed (chunk 0/4) ahead of the
# producer-recipes feature. Tables verified empty on staging AND
# production before drop. See backend/alembic/versions/
# 20260515_1430_d7e3c9a82f5b_meh_587_remove_zombie_recipes.py.


# --- New models for MVP v1 ---


class HomeProduct(Base):
    __tablename__ = "home_products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title = Column(String(200), nullable=False)
    description = Column(Text)
    photo = Column(Text)  # Cloudinary URL (primary/cover — first of `images`)
    quantity = Column(String(100))
    price = Column(Numeric(10, 2))
    neighborhood = Column(String(100))
    city = Column(String(100))
    # Private address details (docs/archive/FIXES_V2.md fix 7c) — persisted server-side
    # but NEVER exposed in the public HomeProductOut schema. Only the
    # seller and admin can see these via a future authenticated endpoint.
    street = Column(String(200), nullable=True)
    zip_code = Column(String(20), nullable=True)
    phone = Column(String(20))  # for WhatsApp redirect
    available_until = Column(DateTime, nullable=True)  # expiry date
    is_active = Column(Boolean, default=True)
    is_hidden = Column(Boolean, default=False)  # auto-hidden by 3 negative ratings
    # --- expanded fields (docs/archive/FIXES_V2.md fix 2) ---
    category = Column(String(50), nullable=True)  # בשר ועוף / דגים / ירקות / ...
    prep_date = Column(Date, nullable=True)  # תאריך הכנה / קטיף
    expiry_date = Column(Date, nullable=True)  # תאריך תפוגה
    storage_type = Column(String(30), nullable=True)  # מקרר / מקפיא / טמפרטורת חדר
    allergens = Column(Text, nullable=True)  # "חיטה, ביצים, חלב..."
    kosher = Column(String(30), nullable=True)  # כשר / לא כשר / לא ידוע
    is_organic = Column(Boolean, default=False)
    unit = Column(String(30), nullable=True)  # ק״ג / יח׳ / ליטר / מנות
    delivery_method = Column(String(30), nullable=True)  # pickup / delivery / both
    location_notes = Column(Text, nullable=True)  # "ליד הסופר, כניסה מהחנייה"
    images = Column(ARRAY(Text), default=[])  # up to 4 photos (Cloudinary URLs)
    # AI moderation (see docs/MODERATION.md)
    moderation_status = Column(
        String(20), default="APPROVED"
    )  # APPROVED|FLAGGED|REJECTED
    moderation_reason = Column(Text, nullable=True)
    moderation_suggestion = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    ratings = relationship(
        "HomeProductRating", back_populates="home_product", cascade="all, delete-orphan"
    )
    whatsapp_clicks = relationship(
        "HomeProductWhatsAppClick",
        back_populates="home_product",
        cascade="all, delete-orphan",
    )


class Report(Base):
    __tablename__ = "reports"
    # MEH-773: one report per (reporter, producer) — closes the
    # check-then-act race (matches migration 382128b23383).
    __table_args__ = (
        UniqueConstraint(
            "reporter_id", "producer_id", name="uq_report_reporter_producer"
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reporter_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    reason = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    reporter = relationship("User")
    producer = relationship("Producer", back_populates="reports")


class HomeProductWhatsAppClick(Base):
    __tablename__ = "home_product_whatsapp_clicks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    home_product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("home_products.id", ondelete="CASCADE"),
        nullable=False,
    )
    clicked_at = Column(DateTime, default=datetime.utcnow)
    rating_sent = Column(Boolean, default=False)
    rated = Column(Boolean, default=False)
    rating_token = Column(String(100), unique=True, nullable=True)

    user = relationship("User")
    home_product = relationship("HomeProduct", back_populates="whatsapp_clicks")
    rating = relationship("HomeProductRating", back_populates="click", uselist=False)


class Event(Base):
    __tablename__ = "events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    title = Column(String(300), nullable=False)
    description = Column(Text)
    event_date = Column(Date, nullable=False)
    event_time = Column(Time, nullable=True)
    location = Column(String(300))  # "בחווה שלנו" / full address
    city = Column(String(100))
    lat = Column(Float)
    lng = Column(Float)
    image_url = Column(Text)
    category = Column(String(30), nullable=False)  # סדנה|סיור|שוק|קטיף|טעימות|אחר
    price = Column(Integer, default=0)  # 0 = free
    max_participants = Column(Integer, nullable=True)
    registration_url = Column(String(500), nullable=True)  # external signup link
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    producer = relationship("Producer")


class Experience(Base):
    """
    Community-submitted experiences (workshops, food tours, nutrition classes).

    Intentionally separate from `Event`:
      - Event    = farm event hosted by an approved producer. Simple, no
                   moderation. Keyed on producer_id.
      - Experience = community workshop hosted by any logged-in user.
                   Requires Claude pre-moderation AND admin approval.
                   Keyed on host_user_id — the host is a User, not a Producer.

    Moderation flow:
      status: pending | approved | rejected | changes_requested
      moderation_status: APPROVED | FLAGGED | REJECTED (from Claude)

    REJECTED from Claude blocks the create call (HTTP 400). APPROVED/FLAGGED
    both persist as status='pending' and wait for admin review — the
    distinction is surfaced to admin so FLAGGED submissions get extra
    scrutiny. Admin clears the queue via /admin/experiences approve /
    reject / request-changes.

    Privacy: `address` is stored but NOT returned in the public list
    (mirrors home_products.street/zip_code behaviour from FIXES_V2.md #7c).
    Only the owner + admin see the full address in the detail endpoint.
    """

    __tablename__ = "experiences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Core content
    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=False)
    image_url = Column(Text, nullable=True)
    category = Column(String(50), nullable=True)  # בישול | תזונה | סיור אוכל | ...

    # Host — any logged-in user (consumer / producer / admin)
    host_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Schedule — matches Event.event_date/event_time convention for consistency
    event_date = Column(Date, nullable=False)
    event_time = Column(Time, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    is_recurring = Column(Boolean, default=False)
    recurring_schedule = Column(Text, nullable=True)  # "כל שישי 9:00-12:00"

    # Location — producer_farm is explicitly NOT an option; that's what Event is for
    location_type = Column(String(20), default="home")  # home | public
    city = Column(String(100))
    address = Column(Text, nullable=True)  # private — only owner/admin see it
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)

    # Capacity + pricing
    max_participants = Column(Integer, nullable=True)
    participants_count = Column(Integer, default=0)
    price_per_person = Column(Numeric(10, 2), nullable=True)  # NULL / 0 = free

    # Prep
    requirements = Column(Text, nullable=True)

    # Moderation
    status = Column(
        String(30), default="pending"
    )  # pending | approved | rejected | changes_requested
    moderation_status = Column(
        String(20), nullable=True
    )  # APPROVED | FLAGGED | REJECTED
    moderation_reason = Column(Text, nullable=True)
    moderation_suggestion = Column(Text, nullable=True)
    admin_feedback = Column(Text, nullable=True)  # populated on "request changes"
    rejection_reason = Column(Text, nullable=True)  # populated on "reject"

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    host = relationship("User", foreign_keys=[host_user_id])


class NewsletterSubscriber(Base):
    __tablename__ = "newsletter_subscribers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(200), unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ContactMessage(Base):
    __tablename__ = "contact_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    email = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ProducerReview(Base):
    """Public reviews for producers (not for home-products — those have
    HomeProductRating). One review per user per producer (unique constraint).
    Aggregates maintained on producers.avg_rating + reviews_count.
    """

    __tablename__ = "producer_reviews"
    __table_args__ = (
        UniqueConstraint(
            "producer_id", "user_id", name="uq_one_review_per_producer_per_user"
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    stars = Column(Integer, nullable=False)  # 1-5
    body = Column(Text, nullable=True)
    is_hidden = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    producer = relationship("Producer", back_populates="reviews")
    user = relationship("User")


class HomeProductRating(Base):
    __tablename__ = "home_product_ratings"
    __table_args__ = (UniqueConstraint("click_id", name="uq_one_rating_per_click"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    click_id = Column(
        UUID(as_uuid=True),
        ForeignKey("home_product_whatsapp_clicks.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    home_product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("home_products.id", ondelete="CASCADE"),
        nullable=False,
    )
    stars = Column(Integer, nullable=False)  # 1-5
    comment = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)

    click = relationship("HomeProductWhatsAppClick", back_populates="rating")
    user = relationship("User")
    home_product = relationship("HomeProduct", back_populates="ratings")


# ============================================================
# Analytics — feature/producer-analytics
# ============================================================


class ProducerPageView(Base):
    """Raw row per GET /producers/{id} hit (minus bot user-agents).

    The row is the source of truth for:
      - Producer dashboard: profile_views (7d / 30d / total), views_by_day
        (30-day chart), top_cities aggregation, search_appearances (rows
        with referrer='search').
      - Admin dashboard: top cities across all producers.

    Privacy: we store `viewer_ip_hash` (SHA-256 with a rotating salt from
    settings) rather than the raw IP — lets us dedupe uniques inside a
    window without keeping PII indefinitely. See docs/SECURITY.md for the
    full rationale.
    """

    __tablename__ = "producer_page_views"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # SHA-256 hex (64 chars) of IP + salt. NULL only if the request had
    # no usable client IP (unit tests, some proxy configs).
    viewer_ip_hash = Column(String(64), nullable=True)
    # City the viewer is located in — filled from the authenticated user's
    # `city` field when available, NULL for anonymous viewers. We deliberately
    # do NOT geolocate raw IPs (no MaxMind DB in the image, no external API
    # dependency on the hot path of /producers/{id}).
    city = Column(String(100), nullable=True)
    # Where the view came from — lets the producer dashboard answer
    # "how often did people find me via search" without a separate impression
    # table. NULL = direct/unknown.
    referrer = Column(
        String(30), nullable=True
    )  # search | map | category | home | None
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class ProducerWhatsAppClick(Base):
    """Raw row per click on a WhatsApp CTA on a producer detail page.

    Distinct from `HomeProductWhatsAppClick` — that table tracks clicks on
    *home-product* cards (which also dispatches a rating SMS 24h later).
    Producer-page clicks are simpler: we just count them for the producer
    dashboard's `whatsapp_clicks` metric, no rating loop.

    Written from `POST /producers/{id}/whatsapp-click`, which is anonymous
    and rate-limited 10/minute per IP (slowapi). user_id is set when the
    caller is authenticated (optional JWT) so the producer can see how many
    unique registered users clicked.
    """

    __tablename__ = "producer_whatsapp_clicks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    clicked_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class ContactClick(Base):
    """MEH-82: one row per click on a non-WhatsApp contact method (phone/instagram/website/email).

    Tracked via POST /producers/{id}/contact-click so the producer dashboard
    can show a breakdown by method alongside the existing whatsapp_clicks metric.
    IP is hashed (SHA-256 + rotating salt) for privacy; user_id is set when the
    caller is authenticated.
    """

    __tablename__ = "producer_contact_clicks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    method = Column(String(20), nullable=False)  # phone | instagram | website | email
    ip_hash = Column(String(64), nullable=True)
    clicked_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (
        Index("ix_contact_clicks_producer_at", "producer_id", "clicked_at"),
    )


class ReferralClick(Base):
    """MEH-49: tracks when a referee registers via a referrer's /ref/{code} link."""

    __tablename__ = "referral_clicks"
    # MEH-773: one referral credit per referee (matches migration
    # 382128b23383).
    __table_args__ = (
        UniqueConstraint("referee_id", name="uq_referral_one_per_referee"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referrer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    referee_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class GroupBuy(Base):
    """MEH-52: group purchase with commit counter and price unlock."""

    __tablename__ = "group_buys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    product_name = Column(String(200), nullable=False)
    unit = Column(String(50), nullable=True)
    price_per_unit_regular = Column(Numeric(10, 2), nullable=False)
    price_per_unit_group = Column(Numeric(10, 2), nullable=False)
    min_participants = Column(Integer, nullable=False)
    max_participants = Column(Integer, nullable=True)
    deadline = Column(DateTime, nullable=False)
    city = Column(String(100), nullable=True)
    # open | funded | cancelled | fulfilled
    status = Column(String(20), default="open", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    producer = relationship("Producer", backref="group_buys")
    commits = relationship(
        "GroupBuyCommit", back_populates="group_buy", cascade="all, delete-orphan"
    )


class GroupBuyCommit(Base):
    """MEH-52: a user's commitment to join a group buy."""

    __tablename__ = "group_buy_commits"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_buy_id = Column(
        UUID(as_uuid=True),
        ForeignKey("group_buys.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity = Column(Integer, default=1, nullable=False)
    phone = Column(String(30), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("group_buy_id", "user_id", name="uq_group_buy_user"),
    )

    group_buy = relationship("GroupBuy", back_populates="commits")
    user = relationship("User", backref="group_buy_commits")


class PhoneOtpToken(Base):
    """MEH-51: one-time WhatsApp OTP for phone verification."""

    __tablename__ = "phone_otp_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    phone = Column(String(30), nullable=False)
    code = Column(String(6), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    producer = relationship("Producer", backref="otp_tokens")


class KashrutBadgeRequest(Base):
    """MEH-51: producer uploads cert → admin approves → badge activates."""

    __tablename__ = "kashrut_badge_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    badge_code = Column(String(50), nullable=False)
    cert_url = Column(Text, nullable=True)
    status = Column(
        String(20), default="pending", nullable=False
    )  # pending|approved|rejected
    reviewed_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    producer = relationship("Producer", backref="kashrut_requests")
    reviewer = relationship("User", backref="kashrut_reviews")


class CategoryRequest(Base):
    """MEH-141: producer signals a missing category during registration."""

    __tablename__ = "category_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requested_name = Column(String(100), nullable=False)
    examples = Column(Text, nullable=True)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status = Column(String(20), default="pending", nullable=False, index=True)
    admin_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    reviewed_at = Column(DateTime, nullable=True)

    producer = relationship("Producer", backref="category_requests")


class SearchQuery(Base):
    """Search telemetry — one row per /producers?search=... query.

    Written from producers.py:310 (after search).  Read from search.py:218 to
    compute /search/trending.
    """

    __tablename__ = "search_queries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query = Column(Text, nullable=False)
    results_count = Column(Integer, nullable=False, default=0)
    searched_at = Column(DateTime, nullable=False, default=datetime.utcnow)


# MEH-588: producer-recipes schema (chunk 1/4). M2M link table declared
# at module scope (not inside ProducerRecipe) so Product.recipes can
# reference it by the string "producer_recipe_products" via `secondary`.
# Mirror of the Alembic table created in revision f4c8a91e2b07.
producer_recipe_products = Table(
    "producer_recipe_products",
    Base.metadata,
    Column(
        "recipe_id",
        UUID(as_uuid=True),
        ForeignKey("producer_recipes.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "product_id",
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Index("ix_producer_recipe_products_product_id", "product_id"),
)


class ProducerRecipe(Base):
    """MEH-588: a recipe owned by a producer that can promote one or more
    of that producer's products via the producer_recipe_products M2M.

    `moderation_status` mirrors the four-state machine used elsewhere
    (pending / approved / rejected / needs_revision); the DB-level
    CHECK constraint is declared in the Alembic migration, not here.

    History: MEH-588 (creation, chunk 1/4 of the producer-recipes epic;
    chunk 0 = MEH-587 cleared the legacy `recipes` namespace).
    """

    __tablename__ = "producer_recipes"
    # MEH-588: mirror the partial index declared in Alembic revision
    # f4c8a91e2b07 so `alembic check` (Base.metadata vs DB schema) does
    # not flag ORM/migration drift. Plain `producer_id` index is covered
    # by the column-level `index=True` below.
    __table_args__ = (
        Index(
            "ix_producer_recipes_published_moderation",
            "published",
            "moderation_status",
            postgresql_where=text("published = true"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    ingredients = Column(Text, nullable=False)
    instructions = Column(Text, nullable=False)
    prep_time_min = Column(Integer, nullable=True)
    cook_time_min = Column(Integer, nullable=True)
    servings = Column(Integer, nullable=True)
    image_url = Column(Text, nullable=True)
    moderation_status = Column(
        Text,
        nullable=False,
        default="pending",
        server_default=text("'pending'"),
    )
    moderation_notes = Column(Text, nullable=True)
    published = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    created_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=text("now()")
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=text("now()"),
    )

    producer = relationship("Producer", back_populates="producer_recipes")
    products = relationship(
        "Product",
        secondary=producer_recipe_products,
        back_populates="recipes",
    )


class InboundMessage(Base):
    """MEH-509 PR2b — durable record of inbound WhatsApp messages.

    Populated by the future PR2c webhook receiver (Meta sends POST to
    /webhook/whatsapp). Consumed by the auto-reply watchdog in
    app/services/auto_reply_watchdog.py, which scans every 5 min for
    rows with `bot_replied=False AND human_replied=False` received in
    the last 30 min, then dispatches `vacation_response_he_v2` or
    `after_hours_response_he` and flips `bot_replied=True`.

    `meta_message_id` is UNIQUE for webhook idempotency (Meta delivers
    at-least-once). `bot_template_sent` is audit-trail-only so we can
    diff "tried to send" (bot_replied=True) vs "send succeeded"
    (bot_template_sent set).
    """

    __tablename__ = "inbound_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_phone = Column(String(20), nullable=False, index=True)
    body = Column(Text, nullable=False)
    received_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=text("now()"),
        index=True,
    )
    meta_message_id = Column(String(100), unique=True, nullable=True)
    # Watchdog gate — flip True BEFORE attempting send, so a failure
    # leaves the message permanently un-auto-replied (one shot, no
    # retry storm). Indexed for the watchdog WHERE clause.
    bot_replied = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
        index=True,
    )
    bot_replied_at = Column(DateTime, nullable=True)
    bot_template_sent = Column(String(50), nullable=True)
    human_replied = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )


class OutboundMessage(Base):
    """MEH-771 / AUD-009/010 — durable record of OUTBOUND WhatsApp sends.

    Written by app/services/whatsapp.py per send (template + freeform).
    A Graph 200 only means *accepted* (queued); true delivery arrives
    later via the Meta status webhook (MEH-771 Chunk B), which flips
    `status` to 'delivered'/'failed' and sets `updated_at`.

    `meta_message_id` (the wamid) is UNIQUE for webhook idempotency
    (Meta delivers at-least-once). `status` is app-enforced (no DB
    enum/CHECK), by-convention 'accepted' | 'delivered' | 'failed' |
    'window_expired', consistent with availability_state.
    """

    __tablename__ = "outbound_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    to_phone = Column(String(20), nullable=False, index=True)
    kind = Column(String(64), nullable=False)
    meta_message_id = Column(String(100), unique=True, nullable=True)
    status = Column(
        String(20),
        nullable=False,
        default="accepted",
        server_default=text("'accepted'"),
        index=True,
    )
    error_code = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=text("now()"),
    )
    updated_at = Column(DateTime, nullable=True)
