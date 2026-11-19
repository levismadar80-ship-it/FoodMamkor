"""
Module:    schemas/producer_out
Purpose:   The business page, read side: list card, detail, admin and
           owner views, kashrut certificate ref, Google place id and rating.
Does NOT:  Hold the write side (schemas/producer.py) or the shared field
           validators (schemas.py).
Split out of schemas/schemas.py (MEH-3270); the code is moved verbatim and
every name is still importable from app.schemas.schemas.
"""

from datetime import date, datetime
from typing import Any, Literal, Self
from uuid import UUID
from pydantic import (
    ModelWrapValidatorHandler,
    BaseModel,
    EmailStr,
    field_validator,
    model_validator,
)
from app.utils.clock import israel_today
from app.schemas.catalog import (
    CategoryOut,
    DeliveryAreaOut,
    ProducerLocationOut,
    ProducerOfferOut,
    ProductGroupOut,
    ProductOut,
)
from app.schemas.registration import ProducerOwnerSummary
from app.schemas.producer import normalize_google_place_id


class KashrutCertRef(BaseModel):
    """MEH-1672: a badge whose approved certificate photo can be served.

    Intentionally ONE field. The certificate is fetched through
    `GET /producers/{producer_id}/kashrut-cert/{badge_code}`, which re-checks
    approval + expiry + producer status on every request. No URL crosses the
    wire, so revocation is immediate and the permanent Cloudinary address is
    never published.
    """

    badge_code: str


class ProducerListOut(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    short_description: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    status: str = "pending"
    # MEH-2459: 'producer' | 'organizer'. Public business surfaces never
    # serialize an organizer (is_business() filters it out); the field is
    # read by the owner dashboard and the admin queue. Default mirrors the
    # column's server_default so pre-migration fixtures still validate.
    kind: str = "producer"
    # MEH-766 ch5: is_verified removed from the public contract — the tier
    # surface is verification_tier/verified_at (ADR-022). Column drops in ch6.
    plan: str = "free"
    slug: str | None = None
    # MEH-2137 switch: both fields ship. `top_product_id` is the authority;
    # `top_product_name` stays in the contract so cards/map need zero changes,
    # and is DERIVED from the FK in attach_badge_fields when the FK is set.
    top_product_id: UUID | None = None
    top_product_name: str | None = None
    price_range: str | None = None
    grass_fed: bool = False
    organic_certified: bool = False
    # «עסק של מילואימניקים» — owner-declared, badge input only (never ranking).
    reservist_owned: bool = False
    # MEH-1508 ch2: business-level dietary scope (owner-declared, admin
    # cross-checked). NOT NULL cols (server_default 'unknown') → always a value;
    # the default here is a from_attributes fallback. ProducerDetailOut inherits.
    vegan_scope: str = "unknown"
    vegetarian_scope: str = "unknown"
    gluten_free_facility: str = "unknown"
    lactose_free_facility: str = "unknown"
    # MEH-293/MEH-479: dietary flags live on products.is_X. The aggregated
    # has_X_products fields below are computed at serialization time by
    # attach_badge_fields — `True` when at least one product on this
    # producer carries the dietary flag (no extra query — producer.products
    # is already selectinload'ed by producer_listing). Frontend lib/badges.js
    # reads these fields directly (no legacy fallback post MEH-479).
    has_gluten_free_products: bool = False
    has_vegan_products: bool = False
    # MEH-1438: True when at least one product is is_vegetarian OR is_vegan
    # (a vegan product is vegetarian by definition). Frontend badges.js reads it.
    has_vegetarian_products: bool = False
    has_lactose_free_products: bool = False
    # MEH-1934: computed by attach_badge_fields like the four above. Plain
    # single-flag aggregations — unlike has_vegetarian_products these fold in
    # no other axis, because nothing implies them.
    has_no_added_sugar_products: bool = False
    has_low_carb_products: bool = False
    # MEH-2716: «מצילים מזון» — set by attach_rescue_saving (a surprise bag
    # saved in the last 30 days); False while the rescue pilot is off. Only the
    # public list/detail and favorites routes compute it — admin payloads that
    # reuse this schema carry a constant False, not data.
    rescued_recently: bool = False
    has_delivery: bool = False
    # MEH-2060: no longer the raw column value. attach_badge_fields overwrites
    # this attribute with `offers_pickup` before serialization (same mechanism
    # as the has_*_products fields below) — see producer_queries.py. The DB
    # column stays (MEH-1259 keep-column pattern); it just isn't read anymore.
    pickup_points: bool = False
    # MEH-2046: the two fulfillment booleans the consumer surfaces read. Both are
    # computed by attach_badge_fields — NOT columns, so there is no migration —
    # and each mirrors the listing predicate of the same name exactly:
    #   delivers      ↔ producer_listing._has_delivery_condition()
    #   offers_pickup ↔ producer_listing._pickup_condition()  (unscoped form)
    # They exist because the card and the filter had already drifted: the badge
    # read the legacy `has_delivery` column OR delivery_count, so a nationwide
    # business (offers_delivery + delivery_nationwide, zero delivery_areas rows)
    # passed the delivery filter while showing no delivery badge — MEH-1836's
    # divergence, visible to a user as "I filtered for delivery and this card
    # says nothing about delivery". `delivery_nationwide` is not serialized, so
    # the client cannot re-derive the predicate; the server answers instead.
    # Unscoped on purpose: these describe the BUSINESS (Label Scope Contract
    # scope=business), not the current query, so a city filter must not change
    # what a card claims about itself.
    delivers: bool = False
    offers_pickup: bool = False
    # MEH-2598: third fulfillment boolean, same mechanism as the two above —
    # computed by attach_badge_fields, mirrors producer_listing._on_site_condition.
    sells_on_site: bool = False
    # MEH-986 ch3b (P0 legal — Kashrut Fraud Prohibition Law): free-text `kosher` is NO
    # LONGER on the public output — an unverified kosher string must never
    # serialize to consumers. Re-declared on ProducerAdminOut / ProducerOwnerOut
    # (admin-internal + owner's own view). Public kosher signal is verified-only
    # via `kashrut_verified_at` (:757 below). Column stays in the model (no drop).
    # MEH-102/MEH-826: weekly hours "Sun-Thu 09:00-18:00, Fri 09:00-14:00".
    # Moved up from ProducerDetailOut so the /map card can show open/closed status.
    opening_hours: str | None = None
    # MEH-291: 4-value durable enum — the only availability field on the
    # contract. MEH-2272 (MEH-1854 chunk 3b) removed the two derived legacy
    # fields that MEH-2271 left here for one release; MEH-2273 drops their
    # columns.
    availability_state: str = "accepting_orders"
    # MEH-155: optional vacation end date — auto-cleared when past.
    vacation_until: date | None = None
    # MEH-2697: when the owner last confirmed her availability (tz-aware UTC);
    # None = never, and then nothing is shown.
    availability_confirmed_at: datetime | None = None
    # MEH-1880: the declared weekly order window. Expand-only (ADR-007) and no
    # migration — the column has existed since f4a1e9c3b7d2; only the LIST
    # serializer was missing it, which is why no list surface (home grid,
    # /producers, /map cards, favorites) could derive "open for orders now"
    # while the producer PAGE already could. Defaults to None, so every
    # existing response is byte-identical for a producer that has no window.
    order_window: dict[str, Any] | None = None
    # MEH-1889 chunk B (MEH-2264): per-date overrides above order_window,
    # order-axis authoritative — `{"YYYY-MM-DD": {"ranges": [...], "note"?}}`,
    # `"ranges": []` = closed that date. On the LIST contract, not only the
    # detail one, for the MEH-1880 reason: ProducerCard's "open for orders"
    # line and the open-now chip evaluator read the order axis from list
    # data, and a card saying "open" on Yom Kippur is exactly the drift this
    # field exists to prevent. Defaults to None; every existing response is
    # byte-identical for a producer with no overrides.
    special_hours: dict[str, Any] | None = None
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
    # Populated by /producers when ?lat=&lng=&radius_km= are passed (geo mode)
    # or, since MEH-1829, when ?sort=distance&lat=&lng= is — where it may be
    # null for a coordinate-less producer (sorted last, not hidden).
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
    # MEH-1672: which badges have a servable certificate photo. Carries the
    # badge_code ONLY — never a URL. The client builds
    # /producers/{id}/kashrut-cert/{badge_code} from it, and the raw
    # Cloudinary address (which is public-forever, `type=upload`) stays
    # inside the backend. Populated in producers.py's get_producer /
    # get_producer_by_slug via `_servable_kashrut_certs()`.
    # DO NOT add a url field here — that is the whole point of the proxy.
    kashrut_certs: list[KashrutCertRef] = []
    # MEH-213 — location mode
    has_physical_location: bool = True
    offers_delivery: bool = False
    delivery_nationwide: bool = False
    delivery_cities: list[str] = []
    # MEH-1255: nationwide exclusion list — public so DeliveryBlock can render
    # "משלוחים לכל הארץ (למעט …)". Empty unless delivery_nationwide.
    delivery_excluded_cities: list[str] = []
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
    # MEH-1577: structured delivery cost. Declared on LIST (not DETAIL) on
    # purpose — ProducerDetailOut inherits from this class, so LIST-level
    # declaration reaches BOTH surfaces, whereas the reverse strands the
    # listing: ProducerCard would render a fee from a field the list response
    # never carried. Same lift-it-up reasoning as delivery_areas directly above
    # (MEH-902), and serialization-only — both are plain columns on the already
    # -selected producer row, so no extra query and no N+1.
    #
    # NULL = not stated → nothing renders. delivery_fee=0 is NOT null and means
    # "משלוח חינם" — a falsy check anywhere downstream is a bug, which is why
    # both the list and detail read paths pin the 0 case in tests. The two are
    # INDEPENDENT: free_delivery_above set with delivery_fee NULL is legal (a
    # threshold with no flat fee stated), so the frontend renders the threshold
    # line alone rather than gating it on the fee.
    #
    # Read-only here; written via producer_me PUT. Inherited by
    # ProducerDetailOut → ProducerAdminOut + ProducerOwnerOut (admin table +
    # owner dashboard prefill read the same value).
    delivery_fee: int | None = None
    free_delivery_above: int | None = None
    # MEH-1402 (MEH-1388 chunk 2): physical presence points (branch / pickup /
    # market_stand). selectinload'd on both LIST branches + the DETAIL query
    # (producer_listing.py + producers.py) so from_attributes reads the loaded
    # relationship with no N+1. Empty for producers with no location rows —
    # and since MEH-1938 chunk 5a such a producer has NO map pin and
    # serializes `lat`/`lng` as null (see _derive_lat_lng_from_primary_location
    # below); the Expand-overlap fallback to Producer.lat/lng is gone.
    # Chunk 3 (map UI) is the consumer; the frontend ProducerSchema (non-strict
    # z.object, schemas.js:7) silently strips this until chunk 3 declares it.
    locations: list[ProducerLocationOut] = []
    # MEH-1823 chunk 2: the single active, unexpired offer, or None. Exposed on
    # ListOut (not DetailOut) so ProducerDetailOut inherits it — the MEH-1577
    # delivery_fee precedent, and what lets the card and the business page read
    # one field from two endpoints.
    #
    # FILTERED SERVER-SIDE, never client-side: producer_listing.py / producers.py
    # load only rows with is_active AND expires_at >= israel_today(), so an
    # expired offer does not leave the API at all. A consumer therefore renders
    # this without re-checking the date, and a leaked expired offer is
    # impossible rather than merely unlikely. The OfferBadge still refuses to
    # render an expired one (frontend defence in depth), but that guard should
    # never fire.
    active_offer: ProducerOfferOut | None = None
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
    def _verified_at_date_only(cls, v: Any) -> Any:
        # MEH-762: collapse the producers.verified_at TIMESTAMPTZ to a pure
        # date so no time component ever reaches the public payload.
        return v.date() if isinstance(v, datetime) else v

    @model_validator(mode="after")
    def _compute_trust_tier(self) -> Self:
        from app.services.trust_tier import compute_trust_tier

        self.trust_tier = compute_trust_tier(self)
        # MEH-155: if vacation_until has passed, treat as available in the API response.
        # MEH-291: extend the same auto-clear to the new availability_state so
        # both surfaces stay consistent during the 7-day overlap.
        if (
            self.vacation_until is not None
            # MEH-1883: Israel calendar day, not the server's UTC one.
            # `vacation_until` is a Date the owner picked in Israel terms, so
            # between 00:00 and ~03:00 Israel the UTC clock still reads
            # yesterday and the business stayed hidden from the listings
            # (default-hide on on_vacation) for those extra hours every night.
            and self.vacation_until < israel_today()
            # MEH-2271: state-only — the legacy status column is not read
            # (MEH-2272 removed the field from this schema altogether).
            and self.availability_state == "on_vacation"
        ):
            self.availability_state = "accepting_orders"
            self.vacation_until = None
        return self

    @model_validator(mode="wrap")
    @classmethod
    def _compute_verification_tier(
        cls, data: Any, handler: ModelWrapValidatorHandler[Self]
    ) -> Self:
        # MEH-762 (ADR-022 D2/D3): resolve the public tier from verified_at +
        # the category licensing requirement. Mirrors the predicate in
        # license_validation.categories_require_license against the
        # already-loaded categories — same single source of truth
        # (categories.requires_license, MEH-3255), no DB round-trip in the
        # serialization layer. One license-required category is enough to
        # exclude "declared"; an unverified license-required producer resolves
        # to None (no badge, no negative label — D3). Does NOT touch
        # trust_tier (MEH-51, separate axis — Chunk-4 decoupling).
        #
        # MEH-2520: two more facts gate the tier, and both are admin-only
        # columns that must NOT join the public contract — so this is a WRAP
        # validator that reads them off the source row (`data`, the ORM
        # object) instead of declaring fields:
        #   * "verified" needs the captured licence not to have lapsed
        #     (`license_expires_at`); a lapsed one falls back by the rules
        #     below, the business itself stays listed.
        #   * "declared" needs a signed declaration (`declared_at`). An
        #     admin-built business nobody has claimed signed nothing, so the
        #     «חתם על הצהרה מחייבת» explainer must not render for it.
        # Only an ORM row is resolved here. A dict or an already-built model
        # is a payload this class produced earlier (FastAPI re-validates the
        # returned model against response_model), whose tier was resolved
        # from the row then — it is kept as is. A dict without one stays None
        # (fail-closed).
        from app.services.verification_status import verification_is_current

        model = handler(data)
        if isinstance(data, (dict, BaseModel)):
            return model

        def source(name: str) -> Any:
            return getattr(data, name, None)

        if verification_is_current(model.verified_at, source("license_expires_at")):
            model.verification_tier = "verified"
        elif source("declared_at") is not None and not any(
            # MEH-3255: the category's own answer, not its name.
            c.requires_license
            for c in (model.categories or [])
        ):
            model.verification_tier = "declared"
        else:
            model.verification_tier = None
        return model

    @model_validator(mode="after")
    def _derive_lat_lng_from_primary_location(self) -> Self:
        """MEH-1938 chunk 5a (Q1 ruling, Sapir 01/09): `lat` / `lng` STAY in the
        contract and are DERIVED from the primary `producer_locations` row —
        never read from the `Producer.lat/lng` columns, which no reader falls
        back to since this chunk and which chunk 5b drops.

        Expand-Contract shrinks the storage, not the API shape; the serializer
        is the seam. So `from_attributes` still copies the column values in,
        and this validator overwrites them from `self.locations` before
        anything is sent: the `is_primary` row's coordinates, or None when
        there is no such row or its pin is cleared. Inherited by
        ProducerDetailOut → ProducerAdminOut / ProducerOwnerOut, so the list,
        the business page, the admin form and the owner dashboard read ONE
        answer. Same rule as admin_extra._primary_location_points (5a.2).

        DO NOT fall back to the column value here "for producers without a
        row": that population is empty on every environment (7c1e2a9f4b3d,
        P0 measured 0 on staging and production, 02/09), and a fallback would
        silently reopen the two-stores drift this epic exists to remove.
        Removing the fields from the contract is a separate, future decision
        (when readers == 0), not this one.
        """
        primary = next((loc for loc in self.locations if loc.is_primary), None)
        self.lat = primary.lat if primary is not None else None
        self.lng = primary.lng if primary is not None else None
        return self

    model_config = {"from_attributes": True}


class ProducerDetailOut(ProducerListOut):
    # MEH-829: producer.address is intentionally NOT exposed here — this detail
    # endpoint is public; the street address is admin/owner-only (see
    # ProducerAdminOut / ProducerOwnerOut), per the producer_license_number
    # privacy-first precedent.
    contact_name: str | None = None
    phone: str | None = None
    # MEH-3339: shown as one text line; no CTA reads these.
    secondary_phone: str | None = None
    secondary_phone_label: str | None = None
    instagram: str | None = None
    website: str | None = None
    whatsapp_group: str | None = None
    # MEH-296: extra contact channels (mirror website; owner-editable).
    facebook: str | None = None
    external_order_form: str | None = None
    # MEH-1677: the business's opt-out for the "לא מגיעים אליך?" CTA. Defaults
    # true so a row written before the column existed (or any client reading an
    # older payload) keeps the CTA rather than silently losing it -- the failure
    # that matters here is the feature vanishing, not it appearing.
    coverage_cta_enabled: bool = True
    products: list[ProductOut] = []
    # MEH-3055: ordered groups; a NULL column reads as no groups.
    product_groups: list[ProductGroupOut] = []

    @field_validator("product_groups", mode="before")
    @classmethod
    def _null_groups_are_empty(cls, v: Any) -> Any:
        return v or []

    delivery_areas: list[DeliveryAreaOut] = []
    report_count: int = 0
    # MEH-3216 stage 5b: whether the page may offer «הוספה» on its products.
    # Set by the route (services/product_order_menu.attach_takes_site_orders),
    # never read off the row: it folds in the site flag and the business's own
    # switch, so the page asks for the order menu only when it exists.
    takes_site_orders: bool = False
    created_at: datetime | None = None
    # MEH-1291: public freshness signal ("עודכן לאחרונה"). Nullable — NULL for
    # producers never edited since the Chunk A migration (a3f1c9d2e4b7 added the
    # column without backfill), so the page renders nothing for them. Stamped by
    # the model-level onupdate=func.now() (models.py:186) on every owner/admin
    # edit. Read-only exposure — never accepted as input.
    updated_at: datetime | None = None
    # MEH-53: Instagram story card URL (Cloudinary).
    story_card_url: str | None = None
    # MEH-1335: owner story fields — deliberately PUBLIC (unlike address just
    # above): the OwnerCard "מאחורי העסק" renders them on the public producer
    # page (MEH-1334, dormant variants). NULL = card stays compact.
    owner_bio: str | None = None
    owner_photo_url: str | None = None
    # MEH-826: opening_hours now inherited from ProducerListOut (moved up so
    # the /map card can read it too).
    # MEH-1543: optional weekly order-acceptance window (JSONB). NULL = feature
    # unused → the public page (MEH-1546) renders nothing. Read-only here;
    # written via producer_me PUT. Inherited onto ProducerOwnerOut so the
    # dashboard editor (MEH-1544) can reload the saved value.
    order_window: dict[str, Any] | None = None
    # MEH-3035: how the business takes payment ({methods, timing, note}) or
    # None. Detail only (the business page's «איך משלמים?» chip and JSON-LD
    # paymentAccepted); inherited onto ProducerOwnerOut for the editor.
    payment_info: dict[str, Any] | None = None
    # MEH-210 Phase 2 — custom WhatsApp question chips
    custom_questions: list[str] | None = None
    # MEH-1490: admin-mapped Google Maps Place ID. Exposed on read so the admin
    # edit form pre-fills it (and never blanks it on save). Not secret — a
    # place_id is a public Google identifier that appears in Maps share URLs.
    # The rating/count are NEVER here — they are live-fetched from
    # GET /producers/{id}/google-rating (never stored; Google ToS §3.2.3(b)).
    google_place_id: str | None = None
    # MEH-1541: self-reported founding year → the quiet "מאז {שנה}" masthead line.
    # Public (like owner_bio above): the heritage line renders on the public
    # producer page. NULL = the owner hasn't stated a year → the line is absent
    # from the DOM. Inherited by ProducerAdminOut + ProducerOwnerOut (admin table
    # + owner dashboard prefill read the same value).
    established_year: int | None = None

    model_config = {"from_attributes": True}


# MEH-1490: live Google-rating response for GET /producers/{id}/google-rating.
# Built per-request from a fresh Places API (New) call and returned straight to
# the client — NEVER persisted (Google Maps Platform ToS §3.2.3(b) No Caching).
# The endpoint returns 204 (no body) whenever the line must not render, so this
# shape is only ever produced for an eligible producer (place_id + ≥20 reviews).
# MEH-2582: body of PUT /admin/producers/{id}/google-place-id — the approval
# row's one-field write. Same normalisation as ProducerUpdate.google_place_id.
class GooglePlaceIdIn(BaseModel):
    google_place_id: str | None = None

    @field_validator("google_place_id")
    @classmethod
    def _validate_google_place_id(cls, v: str | None) -> str | None:
        return normalize_google_place_id(v)


class GooglePlaceIdOut(BaseModel):
    google_place_id: str | None = None


class GoogleRatingOut(BaseModel):
    rating: float  # Google's average star rating, e.g. 4.7
    user_rating_count: int  # total Google reviews (guaranteed ≥ MIN_REVIEWS)
    google_maps_uri: str  # canonical Google Maps profile URL (attribution link)


# MEH-530: admin-only response shape. Extends ProducerDetailOut with the
# raw `producer_license_number` value. Public `/producers/{id}` and
# `/producers/by-slug/{slug}` routes keep returning ProducerDetailOut and
# only see `has_producer_license: bool` — the number stays private. Used
# by /admin/producers/* and producer_me self endpoints so admins and
# owners can see the value they themselves submitted.
class ProducerAdminOut(ProducerDetailOut):
    # MEH-2110: the review queue's SLA surface. Both fields are admin-only —
    # deliberately NOT on ProducerDetailOut/ListOut, matching the
    # producer_license_number privacy precedent (MEH-530): when a business was
    # sent for review, and how long it has waited, are internal operations
    # data and nobody's business but the admin's.
    #
    # `submitted_for_review_at` is NULL for every row created before MEH-2100
    # and for every draft; the admin table renders the tooltip from
    # created_at in that case rather than showing an empty timestamp.
    submitted_for_review_at: datetime | None = None
    # Page freshness: when the owner last pressed «כן, הכול נכון». Admin-only.
    last_confirmed_at: datetime | None = None
    # Computed server-side (routers/admin.py) rather than derived per client,
    # so the badge and the queue ordering can never disagree about age.
    # Israeli work week Sun–Thu, no holiday calendar (MEH-2110 scope).
    business_days_waiting: int = 0
    # MEH-2495: does an account own this row (EXISTS users.producer_id = id)?
    # Derived, never stored — hydrated per response by routers/admin.py
    # `_attach_has_owner` in ONE batched query (no N+1). It drives the drafts
    # list: «מחכה לבעלים» vs «נקלט, בהשלמה», and whether the row offers the
    # claim-link copy. Admin-only: which pages have an account behind them is
    # nobody's business but the admin's — not on ProducerDetailOut/ListOut.
    # None, not False, by default: a route that forgot to hydrate must fail
    # CLOSED — the UI renders neither chip nor action for a non-boolean —
    # instead of reporting a claimed draft as ownerless.
    has_owner: bool | None = None
    # MEH-3408: another business, in ANY status, shares this row's name / phone.
    # Hydrated by GET /admin/producers only (services/producer_duplicates.py),
    # in one query; every other route leaves them False (no badge). Admin-only.
    dup_name: bool = False
    dup_phone: bool = False
    # MEH-986 ch3b: free-text kosher re-declared here — it was removed from the
    # public ProducerListOut but stays admin-internal (the admin table + form).
    kosher: str | None = None
    producer_license_number: str | None = None
    # MEH-2072: licence expiry captured at approval. Admin-only, riding the same
    # privacy precedent as the licence number directly above it (MEH-530) — when
    # a business's licence lapses is internal review data, and publishing it
    # would hand every visitor a countdown on somebody's paperwork. NULL for
    # every producer approved before this field existed; the admin table renders
    # "—" rather than an empty date.
    license_expires_at: date | None = None
    # MEH-1471: self-reported attribution ("מאיפה שמעת עלינו?"). Admin-only —
    # NOT on the public ProducerDetailOut/ListOut (internal supply-side data,
    # MEH-530 privacy precedent). NULL for producers who registered before the
    # field existed (admin renders "—"). `referral_source` is the English key;
    # the Hebrew label + "אחר: <text>" rendering happen in AdminProducersTable.
    referral_source: str | None = None
    referral_source_other: str | None = None
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
    # MEH-1011: producer request-changes trail — admin-only (never on the
    # public ProducerDetailOut/ListOut). `requested_changes` = the admin's
    # free-text completion feedback; `changes_requested_at` = tz-aware stamp.
    # Both NULL once the producer is approved (approve_producer clears them).
    requested_changes: str | None = None
    changes_requested_at: datetime | None = None
    # MEH-2210: the rejected → resubmit loop, admin side. The code is the
    # preset key the admin chose (admin.py::PRODUCER_REJECTION_PRESETS); the
    # count is history (never reset by approve) and drives the queue's
    # "שליחה חוזרת #n" badge; the stamp is the latest resubmission.
    rejection_reason_code: str | None = None
    resubmission_count: int = 0
    resubmitted_at: datetime | None = None
    # MEH-2496: when the latest owner-claim link was minted (producer_claim.py
    # stamps it). Admin-only — when an admin chased an owner is internal
    # operations data, MEH-530 precedent; never on the public or owner shapes.
    # NULL = none minted since the column existed; the drafts list renders
    # nothing for it rather than an empty date.
    claim_link_sent_at: datetime | None = None
    # MEH-2974: the owner invite, admin-only. Six readable fields and the
    # linked account — enough for the «בעלים» panel's three states (no owner /
    # invite pending / connected) without a second request.
    #
    # Note what is NOT here, by name, and that both absences are asserted in
    # tests/test_producer_owner_invite.py::TestExposure:
    #   * `owner_invite_token_hash` — the credential's only store. It is on NO
    #     schema at all, so it cannot reach a response by inheritance, by a
    #     `model_dump()` somewhere, or by appearing in openapi.json.
    #   * `owner_invite_created_by` — a raw users id. Which admin minted the
    #     invite is audit data the row and the logs carry; the panel renders
    #     nothing from it, so exposing it would be an id for its own sake.
    #
    # `owner_invite_consent_note` IS here: the admin needs to read back what
    # she recorded, both to check it and because the panel shows it. It is her
    # own note about a business, in the same internal-operations class as
    # `admin_notes` and `recommended_note` — admin-only, never on the public or
    # owner shapes.
    owner_invite_email: EmailStr | None = None
    owner_invite_name: str | None = None
    owner_invite_sent_at: datetime | None = None
    owner_invite_expires_at: datetime | None = None
    owner_invite_accepted_at: datetime | None = None
    owner_invite_consent_note: str | None = None
    # MEH-3377: the optional screenshot of the written consent. Same class as
    # the note above — admin-only, never on the public or owner shapes.
    consent_screenshot_url: str | None = None
    # Derived, never stored — hydrated per response beside `has_owner` by
    # routers/admin.py `_attach_has_owner`, in that one batched query. None
    # means "this route did not hydrate it", exactly as for `has_owner`: a
    # route that forgets fails CLOSED (the panel shows no owner line) rather
    # than reporting a handed-over business as ownerless.
    owner: ProducerOwnerSummary | None = None
    # MEH-1287 chunk B — the editorial seasonal mark, admin-only and READ-BACK
    # (ADR-006 R2: `ProducerAdminUpdate` writes it, so something has to return
    # it, or the admin form reopens empty and the next save silently clears a
    # date an editor set). Absent from ProducerListOut / ProducerDetailOut by
    # name, asserted in `test_meh1287_in_season_until.py`: the reader learns
    # WHICH businesses are in season from the module they appear in, never a
    # date on a card. The public filter is `?in_season=true`.
    in_season_until: date | None = None
    # MEH-1494 chunk B (ADR-006 R2 — a field with a write path needs a read
    # path). `ProducerUpdate` accepts `recommended_note` and this PR's handler
    # stamps `recommended_at`, and neither could be read back: the admin edit
    # form had no way to populate the note for a second edit, so re-saving a
    # picked producer blanked the editor's own reasoning in the UI, and the
    # `recommended_review_due` list could show WHICH picks are stale without
    # showing WHY any of them was made.
    #
    # Admin-only, and that is a hard line rather than a default: the note is the
    # editor's internal reasoning about a real business (models.py:188 — "DO NOT
    # expose recommended_note on any public serializer"), and ADR-030 bans
    # pay-to-play, so the rationale is exactly the artifact that must stay
    # internal and auditable instead of becoming marketing copy. This class is
    # the one place it may appear — NOT ProducerOwnerOut either, the sibling
    # subclass fifty lines below, which is the easiest wrong home for it.
    # `test_meh1494_recommended_at_note.py` asserts its absence from the other
    # three shapes by name; a subclass field does not join its parent's
    # `model_fields`, so that guard is untouched by this addition.
    #
    # `recommended_at` NULL on a picked producer is not missing data: it means
    # "picked before the clock existed", which is what the review list reads as
    # due now (admin.py::_recommended_review_due_clause).
    recommended_at: datetime | None = None
    recommended_note: str | None = None
    # MEH-971 chunk 3: admin-only "license pending — verify before approving"
    # flag. COMPUTED below (never a stored column) — True iff the producer is in
    # >=1 license-required category AND has no license number. Status-independent
    # so an override-approved producer (chunk-4 allow_without_license) still
    # shows it. Mirrors _compute_verification_tier's predicate over the
    # already-loaded categories (categories.requires_license, MEH-3255)
    # — no DB round-trip, no N+1. Admin-only: lives on ProducerAdminOut, never
    # the public ProducerListOut/DetailOut.
    license_pending: bool = False

    @model_validator(mode="after")
    def _compute_license_pending(self) -> Self:
        # MEH-3255: the category's own answer, not its name.
        needs_license = any(c.requires_license for c in (self.categories or []))
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
    # MEH-3137: whether she has recorded the grower declaration, so the
    # categories card asks for it only when a grower category needs it. A
    # timestamp of her own act, owner-private like the license number.
    farmer_declared_at: datetime | None = None
    # MEH-829: owner sees her own submitted street address (private — not on the
    # public DetailOut/ListOut).
    address: str | None = None
    # MEH-1025 Chunk A: the owner sees her OWN completion-request trail so the
    # dashboard can render the "נשאר להשלים" banner (Chunk B). Same owner-private
    # pattern as kosher/license/address above. Columns exist since MEH-1011
    # (migration a1b2c3d4e5f6) — Pydantic-only exposure, no migration. Contrast
    # risk_score/risk_reasoning + declared_at, which stay admin-only on
    # ProducerAdminOut (the producer must never see her own risk score).
    # REUSES: schemas.py:913-914 (ProducerAdminOut declarations).
    requested_changes: str | None = None
    changes_requested_at: datetime | None = None
    # MEH-2210: the owner sees her OWN rejection trail so the dashboard banner
    # can branch its copy on the code and render "שליחה {n+1} מתוך 3". Same
    # owner-private pattern as requested_changes directly above; the free-text
    # reason itself keeps flowing through GET /auth/me (MEH-283).
    rejection_reason_code: str | None = None
    resubmission_count: int = 0
    resubmitted_at: datetime | None = None
    # MEH-2460: the organizer submission gate needs ≥1 upcoming event; the
    # client mirror (lib/submission-gate.js) reads this count. Filled by
    # GET/PUT /producers/me; 0 for every other serializer path.
    upcoming_events_count: int = 0
