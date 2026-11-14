"""
Module:    schemas/producer
Purpose:   The business page: create, admin create, owner update, list
           card, detail, admin and owner views, Google rating.
Does NOT:  Hold the shared field validators (schemas.py).
Split out of schemas/schemas.py (MEH-3270); the code is moved verbatim and
every name is still importable from app.schemas.schemas.
"""

import re
from datetime import date, datetime
from typing import Any, Literal, Self
from uuid import UUID
from pydantic import (
    ModelWrapValidatorHandler,
    BaseModel,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)
from app.limits import (
    DELIVERY_CITIES_DETAIL,
    GALLERY_IMAGES_DETAIL,
    MAX_DELIVERY_CITIES,
    MAX_GALLERY_IMAGES,
    MAX_SMALL_LIST,
    cap_list,
)
from app.services.sanitization import sanitize_text
from app.utils.clock import israel_today
from app.schemas.schemas import (
    MAX_DELIVERY_MONEY,
    SanitizedBusinessNameField,
    SanitizedDescriptionField,
    SanitizedLabelField,
    SanitizedPersonNameField,
    _cap_categories_validator,
    _contact_method_validator,
    _custom_questions_validator,
    _image_url_list_validator,
    _image_url_validator,
    _min_letters_validator,
    _normalize_contact_email,
    _normalize_instagram,
    _order_window_validator,
    _payment_info_validator,
    _phone_validator,
    _require_categories_validator,
    _special_hours_validator,
    _url_scheme_validator,
    _whatsapp_group_validator,
)
from app.schemas.catalog import (
    CategoryOut,
    DeliveryAreaCreate,
    DeliveryAreaOut,
    ProducerLocationOut,
    ProducerOfferCreate,
    ProducerOfferOut,
    ProductGroupOut,
    ProductOut,
)
from app.schemas.registration import ProducerOwnerSummary


# --- Producer ---
class ProducerCreate(BaseModel):
    # MEH-229: cap at the DB column width (models.py name = String(200)) so an
    # over-length name returns a clean 422 instead of a DB-level 500.
    # MEH-1626 chunk 3 (item 2): was floor-only — _validate_name_letters with
    # no bleach — while its siblings ProducerAdminCreate.name and
    # ProducerUpdate.name carry the full type. The AST scan could not see it:
    # it tests PRESENCE of a validator, not equivalence of rule. Found in
    # review of chunk 2. MEH-229 max_length stays: the type's validator never
    # returns None (the floor raises), so the outer cap is safe here and still
    # yields a clean 422 instead of a DB-level 500.
    name: SanitizedBusinessNameField = Field(max_length=200)
    description: SanitizedDescriptionField | None = None
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
    # MEH-3137: grower declaration for ירקות/פירות (services/farmer_declaration.py).
    farmer_declaration_accepted: bool = False
    # MEH-1153: same ≥1-category server-side parity as ProducerRegister.
    category_ids: list[int] = Field(
        default_factory=list, validate_default=True, max_length=MAX_SMALL_LIST
    )
    # MEH-530: see ProducerRegister for the validation rationale.
    producer_license_number: str | None = Field(default=None, max_length=20)
    delivery_areas: list[DeliveryAreaCreate] = Field(
        default_factory=list, max_length=MAX_DELIVERY_CITIES
    )

    # MEH-296 3d: http(s) scheme guard on the URL fields (reuse Chunk-2 helper).
    @field_validator("website", "facebook", "external_order_form")
    @classmethod
    def _validate_contact_urls(cls, v: str | None) -> str | None:
        return _url_scheme_validator(v)

    # MEH-1537: phone format (no contact_email / whatsapp_group on this schema).
    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v: str | None) -> str | None:
        return _phone_validator(v)

    # MEH-1608: URL/@ → bare handle (the renderer builds the link itself).
    @field_validator("instagram")
    @classmethod
    def _normalize_instagram_handle(cls, v: str | None) -> str | None:
        return _normalize_instagram(v)

    @field_validator("category_ids")
    @classmethod
    def _require_categories(cls, v: list[int]) -> list[int] | list[int] | None:
        # MEH-1297: enforce the ≤3 cap alongside the MEH-1153 ≥1 requirement.
        return _cap_categories_validator(_require_categories_validator(v))

    @field_validator("delivery_areas", mode="before")
    @classmethod
    def _cap_delivery_meh3022(cls, v: Any) -> Any:
        # MEH-3022: Hebrew sentence before pydantic's English max_length one.
        return cap_list(v, MAX_DELIVERY_CITIES, DELIVERY_CITIES_DETAIL)


class ProducerAdminCreate(BaseModel):
    """Used by admin form — pre-approved, supports all extended fields."""

    # MEH-2322: True = a DRAFT prepared for its owner to claim (owner-claim
    # link, routers/producer_claim.py) — status "draft", no owner, not live.
    # False (default) = today's behaviour: pre-approved and live at once.
    as_draft: bool = False
    # MEH-229: mirror ProducerCreate — cap at the String(200) column width.
    name: SanitizedBusinessNameField = Field(max_length=200)
    # MEH-1626 chunk 3: surfaced by the family-based guard, NOT by the
    # asymmetry scan — both siblings were equally unvalidated, so the pair
    # looked symmetric and was invisible to a comparison-based check.
    contact_name: SanitizedPersonNameField | None = None
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
    top_product_name: SanitizedLabelField | None = None
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
    images: list[str] = Field(default_factory=list, max_length=MAX_GALLERY_IMAGES)
    category_ids: list[int] = Field(default_factory=list, max_length=MAX_SMALL_LIST)
    delivery_area_cities: list[str] = Field(
        default_factory=list, max_length=MAX_DELIVERY_CITIES
    )  # simple comma-split list
    # MEH-213 — location mode
    has_physical_location: bool = True
    offers_delivery: bool = False
    delivery_nationwide: bool = False
    delivery_cities: list[str] = Field(
        default_factory=list, max_length=MAX_DELIVERY_CITIES
    )
    # MEH-1255: nationwide exclusion list ("לכל הארץ חוץ מ:") — only legal
    # with delivery_nationwide=true (validator below + DB CHECK
    # delivery_excluded_requires_nationwide).
    delivery_excluded_cities: list[str] = Field(
        default_factory=list, max_length=MAX_DELIVERY_CITIES
    )

    # MEH-1297: cap categories at 3 (admin create).
    @field_validator("category_ids")
    @classmethod
    def _cap_categories(cls, v: list[int]) -> list[int] | list[int] | None:
        return _cap_categories_validator(v)

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=2000)

    @field_validator("short_description")
    @classmethod
    def _sanitize_short_description(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=200)

    @field_validator("admin_notes")
    @classmethod
    def _sanitize_admin_notes(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=2000)

    # MEH-296 3d: same boundary guards as ProducerUpdate (reuse Chunk-2 helpers).
    @field_validator("primary_contact_method")
    @classmethod
    def _validate_primary_contact_method(cls, v: str) -> str | str | None:
        return _contact_method_validator(v)

    @field_validator("website", "facebook", "external_order_form")
    @classmethod
    def _validate_contact_urls(cls, v: str | None) -> str | None:
        return _url_scheme_validator(v)

    # MEH-1537: phone / whatsapp_group format + contact_email empty→None.
    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v: str | None) -> str | None:
        return _phone_validator(v)

    @field_validator("whatsapp_group")
    @classmethod
    def _validate_whatsapp_group(cls, v: str | None) -> str | None:
        return _whatsapp_group_validator(v)

    # MEH-1608: URL/@ → bare handle (the renderer builds the link itself).
    @field_validator("instagram")
    @classmethod
    def _normalize_instagram_handle(cls, v: str | None) -> str | None:
        return _normalize_instagram(v)

    @field_validator("contact_email", mode="before")
    @classmethod
    def _normalize_email(cls, v: Any) -> Any:
        return _normalize_contact_email(v)

    # MEH-1222: reject malformed image URLs in the producer photo array.
    @field_validator("images")
    @classmethod
    def _validate_images(cls, v: list[str]) -> list[str] | list[str] | None:
        return _image_url_list_validator(v)

    @model_validator(mode="after")
    def _validate_location_mode(self) -> Self:
        if not self.has_physical_location and not self.offers_delivery:
            raise ValueError("חייב לפחות אחד: חנות פיזית או משלוחים")
        # MEH-903 A: XOR now guards delivery_area_cities (the delivery_areas store)
        # instead of the legacy delivery_cities column — same nationwide-XOR-cities
        # semantic, only the field source changed.
        if self.delivery_nationwide and len(self.delivery_area_cities) > 0:
            raise ValueError("לא ניתן לבחור גם משלוחים לכל הארץ וגם ערים ספציפיות")
        # MEH-1255: an exclusion list is only meaningful in nationwide mode.
        if self.delivery_excluded_cities and not self.delivery_nationwide:
            raise ValueError("ערים מוחרגות אפשריות רק עם משלוחים לכל הארץ")
        # MEH-1879: nationwide scope on a business that declares no delivery is
        # the contradiction CHECK producer_nationwide_requires_delivery rejects
        # (MEH-1849, models.py:466). Create has no stored row to merge against,
        # so the effective-state guard in services/delivery_validation.py does
        # not fit here — this is the create-path half of the same invariant.
        # Both fields carry defaults (False/False), so a payload naming only
        # delivery_nationwide would otherwise reach the DB and 500.
        if self.delivery_nationwide and not self.offers_delivery:
            raise ValueError(
                '"לכל הארץ" מסומן, אבל "משלוחים" לא. סמנו "משלוחים", או בטלו את "לכל הארץ".'
            )
        return self

    @field_validator("images", mode="before")
    @classmethod
    def _cap_images_meh3022(cls, v: Any) -> Any:
        # MEH-3022: Hebrew sentence before pydantic's English max_length one.
        return cap_list(v, MAX_GALLERY_IMAGES, GALLERY_IMAGES_DETAIL)

    @field_validator(
        "delivery_area_cities",
        "delivery_cities",
        "delivery_excluded_cities",
        mode="before",
    )
    @classmethod
    def _cap_delivery_meh3022(cls, v: Any) -> Any:
        # MEH-3022: Hebrew sentence before pydantic's English max_length one.
        return cap_list(v, MAX_DELIVERY_CITIES, DELIVERY_CITIES_DETAIL)


# MEH-291 → MEH-2758 → MEH-2782: the availability enum is pause-only, like
# Google / Etsy / Wolt / Uber Eats — hours (the order window) plus one pause
# switch. `available_today` / `full_this_week` were removed: MEH-2758 stopped
# every write, and alembic f2b8d4c61a07 moved the rows still holding them to
# accepting_orders, so the read and write sets are the same two values again.
AVAILABILITY_STATES = (
    "accepting_orders",  # default — «פתוח להזמנות»
    "on_vacation",  # «בהפסקה» (requires vacation_until)
)
WRITABLE_AVAILABILITY_STATES = AVAILABILITY_STATES


# MEH-2272 chunk 2: `state_to_legacy` (enum -> legacy pair) is gone. Its last
# callers were the dict responses in routers/producer_me.py; no response
# carries is_available_today / availability_status any more.


# MEH-1490: normalize the Google Place ID. Blank → None (admin clears the
# mapping). URL-safe charset only ([A-Za-z0-9_-]) — a place_id is exactly that,
# so a pasted Maps URL (contains "/", ":", ".") is rejected with a clear Hebrew
# error instead of being stored and silently 204-ing forever. MEH-2582: one
# function for both writers (ProducerUpdate and GooglePlaceIdIn).
def normalize_google_place_id(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    if len(v) > 300:
        raise ValueError("מזהה Google Place ארוך מדי")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", v):
        raise ValueError(
            "מזהה Google Place לא תקין — הדביקי את ה-place_id בלבד (לא כתובת URL)"
        )
    return v


class ProducerUpdate(BaseModel):
    name: SanitizedBusinessNameField | None = None
    # MEH-1626 chunk 3: surfaced by the family-based guard, NOT by the
    # asymmetry scan — both siblings were equally unvalidated, so the pair
    # looked symmetric and was invisible to a comparison-based check.
    contact_name: SanitizedPersonNameField | None = None
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
    # MEH-1490: admin-only Google Maps Place ID mapping. Present on the shared
    # ProducerUpdate schema but withheld from _PRODUCER_WRITABLE_FIELDS in
    # routers/producer_me.py, so only the admin PUT (admin.py bulk setattr) can
    # write it — owners cannot self-map. Validated below (URL-safe charset,
    # ≤300). No rating value is ever accepted or stored (live-fetch only).
    google_place_id: str | None = None
    top_product_name: SanitizedLabelField | None = None
    # MEH-2137 switch: the owner now votes by IDENTITY. Ownership cannot be
    # checked here — it needs the DB — so producer_me.py 422s a product that
    # belongs to someone else, and syncs top_product_name from it. Sending
    # `null` clears the vote.
    top_product_id: UUID | None = None
    price_range: str | None = None
    # MEH-1335: owner story fields (public OwnerCard data path). owner_bio is
    # bleach-stripped + capped at 300 below (mirrors short_description);
    # owner_photo_url gets the MEH-1222 image-URL guard (http(s) scheme + the
    # "https://bread.jpg" bare-filename-host rejection) — it feeds next/image
    # on the public producer page, same surface class as images[].
    owner_bio: str | None = None
    owner_photo_url: str | None = Field(default=None, max_length=500)
    # MEH-1242 PR5: owner-editable opening hours (free text). Was absent from
    # ProducerUpdate — so both the owner PUT and the admin PUT (admin.py:214,
    # same schema) silently dropped it. Present on ProducerOwnerOut already.
    opening_hours: str | None = None
    grass_fed: bool | None = None
    organic_certified: bool | None = None
    # «עסק של מילואימניקים» — owner-declared. NOT NULL column: an explicit null
    # is rejected below (an omitted field is dropped by exclude_unset).
    reservist_owned: bool | None = None
    # MEH-1508 ch2: business-level dietary scope — owner declares, admin
    # cross-checks. Shared by the owner PUT (producer_me.py, gated by
    # _PRODUCER_WRITABLE_FIELDS) and the admin PUT (admin.py bulk setattr).
    # Validated below — the columns are NOT NULL, so the validator rejects an
    # explicit null (an omitted field is dropped by exclude_unset, never validated).
    vegan_scope: str | None = None
    vegetarian_scope: str | None = None
    gluten_free_facility: str | None = None
    lactose_free_facility: str | None = None
    # MEH-293/MEH-479: dietary flags moved to products.is_X.
    has_delivery: bool | None = None
    pickup_points: bool | None = None
    kosher: str | None = None
    # MEH-530: optional patch field. Router calls ensure_license_for_categories
    # whenever category_ids OR producer_license_number is in the body — see
    # routers/producer_me.py + routers/admin.py.
    producer_license_number: str | None = Field(default=None, max_length=20)
    # MEH-2072: the licence expiry the admin reads off the document. Present on
    # the shared ProducerUpdate schema but withheld from
    # _PRODUCER_WRITABLE_FIELDS in routers/producer_me.py, so only the admin PUT
    # (admin.py bulk setattr) can write it — exactly the google_place_id
    # arrangement above, and for the same reason: this is a record of what the
    # ADMIN verified against a document, so an owner-writable version would be
    # self-certification. A test asserts the owner PUT cannot write it.
    #
    # Deliberately NO validator. A past date is legitimate input — capturing an
    # already-lapsed licence during review is precisely the case this ticket
    # exists to make visible — so vacation_until's "must not be in the past"
    # rule would be actively wrong here. Explicit null clears the value.
    license_expires_at: date | None = None
    admin_notes: str | None = None
    # MEH-766 ch3: is_verified removed from ProducerUpdate — the admin PUT
    # setattr-loop can no longer write it (verification = grant-verified only).
    #
    # MEH-18. Reachable from the OWNER's PUT (producer_me.py, gated by
    # _PRODUCER_WRITABLE_FIELDS, which excludes it) and the ADMIN PUT
    # (admin.py bulk setattr) — and the admin path is the only way the
    # editorial pick can be switched on at all. MEH-1494's chunk-B checklist
    # called this a redundant declaration to delete; measured 06/09, deleting
    # it would ship a dead toggle, and no test drives the flip through the
    # admin PUT, so CI would have stayed green. Corrected on the card.
    is_recommended: bool | None = None
    # MEH-1494 chunk B: the editor's reasoning for the pick. ADMIN-ONLY in both
    # directions — absent from _PRODUCER_WRITABLE_FIELDS so an owner cannot
    # write her own citation, and never on a public serializer (asserted by
    # name in test_meh1494_recommended_at_note.py). `recommended_at` is NOT
    # here: it is stamped from the transition in admin.py, not supplied by the
    # caller, so accepting it would be a second authority over the same clock.
    #
    # The 500-char cap is the card's own ruling: it rejected `String(500)` on
    # the COLUMN (an editorial note is internal text and the column stays Text)
    # and said the length limit belongs in chunk B's validator. This is it.
    recommended_note: str | None = Field(default=None, max_length=500)
    # MEH-2272: the two legacy availability fields are no longer accepted
    # here. They were writes onto columns that nothing reads since MEH-2271;
    # on the admin PUT they still reached those columns through the bulk
    # setattr. A stale client sending either key has it ignored (no
    # extra="forbid" on this model), not a 422.
    images: list[str] | None = Field(None, max_length=MAX_GALLERY_IMAGES)
    status: str | None = None
    # MEH-3137: grower declaration for ירקות/פירות (services/farmer_declaration.py).
    farmer_declaration_accepted: bool = False
    category_ids: list[int] | None = Field(None, max_length=MAX_SMALL_LIST)
    delivery_area_cities: list[str] | None = Field(
        None, max_length=MAX_DELIVERY_CITIES
    )  # admin form: simple list of city names
    # MEH-1644: structured rows from the dashboard DeliveryCard — carries the
    # whitelist-validated delivery_day per city (DeliveryAreaCreate). Takes
    # precedence over delivery_area_cities in producer_me when both are sent.
    delivery_areas: list[DeliveryAreaCreate] | None = Field(
        None, max_length=MAX_DELIVERY_CITIES
    )
    # MEH-1823 chunk 2: the owner's single offer, written through the same PUT
    # as delivery_areas. Three-valued on purpose, and the distinction is
    # load-bearing because `exclude_unset` cannot tell the last two apart on
    # its own — producer_me consults `model_fields_set`:
    #   omitted            -> no change (the existing offer is left alone)
    #   explicit null      -> deactivate the current offer
    #   an object          -> replace: deactivate any active row, insert this one
    # Replace-not-update keeps the unique partial index satisfied without an
    # UPSERT, and leaves the superseded row as history.
    active_offer: ProducerOfferCreate | None = None
    # MEH-213 — location mode
    has_physical_location: bool | None = None
    offers_delivery: bool | None = None
    delivery_nationwide: bool | None = None
    delivery_cities: list[str] | None = Field(None, max_length=MAX_DELIVERY_CITIES)
    # MEH-1255: nationwide exclusion list. Schema validator catches the
    # explicit nationwide=false + excluded case; the routers guard the
    # EFFECTIVE state on partial updates (excluded sent while the stored
    # delivery_nationwide is false) so the DB CHECK never 500s.
    delivery_excluded_cities: list[str] | None = Field(
        None, max_length=MAX_DELIVERY_CITIES
    )
    # MEH-210 Phase 2 — custom WhatsApp question chips
    custom_questions: list[str] | None = Field(None, max_length=MAX_SMALL_LIST)
    # MEH-291 — the 4-value availability enum; since MEH-2272 the only
    # availability field this schema accepts.
    availability_state: str | None = None
    vacation_until: date | None = None
    # MEH-1541: self-reported founding year (optional). Range-validated below
    # (1800 ≤ year ≤ current year). Shared by the owner PUT (producer_me.py,
    # gated by _PRODUCER_WRITABLE_FIELDS) and the admin PUT (admin.py bulk setattr).
    established_year: int | None = None
    # MEH-1543: optional weekly order-acceptance window. dict (per-day
    # open/close) or explicit null to clear. Validated below (day keys, HH:MM
    # 24h, close>open → 422 Hebrew). Owner-writable path opened in
    # producer_me.py (_PRODUCER_WRITABLE_FIELDS).
    order_window: dict[str, Any] | None = None
    # MEH-1889 chunk A: per-date overrides above order_window. Validated by
    # _special_hours_validator; explicit null clears it, same as order_window.
    special_hours: dict[str, Any] | None = None
    # MEH-3035: how the business takes payment. Validated below
    # (_payment_info_validator). Owner-writable via producer_me.py
    # (_PRODUCER_WRITABLE_FIELDS, MEH-3035 chunk 2, with PaymentInfoEditor).
    payment_info: dict[str, Any] | None = None
    # MEH-1577: structured delivery cost (whole shekels, producer-level).
    # Validated below — both reject negatives, free_delivery_above additionally
    # rejects 0. delivery_fee=0 is ACCEPTED and meaningful ("משלוח חינם"), which
    # is why the two rules differ. Explicit null clears the value. Owner-writable
    # path opened in producer_me.py (_PRODUCER_WRITABLE_FIELDS).
    delivery_fee: int | None = None
    free_delivery_above: int | None = None

    # MEH-1297: cap categories at 3 (admin/owner update). None passes through.
    @field_validator("category_ids")
    @classmethod
    def _cap_categories(cls, v: list[int] | None) -> list[int] | None:
        return _cap_categories_validator(v)

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=2000)

    @field_validator("short_description")
    @classmethod
    def _sanitize_short_description(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=200)

    # MEH-1494 chunk B: the editor's note is free text an admin types, so it
    # gets the MEH-555 floor like every other admin-visible free-text field —
    # "???" is exactly the input that rule exists to reject.
    #
    # Blank clears the field rather than failing. That distinction is the
    # reason this is not a bare `_min_letters_validator`: an admin removing a
    # note she no longer stands behind is a legitimate edit, and the un-pick
    # path in admin.py deliberately does NOT clear the note, so clearing it by
    # hand has to be possible. Sending nothing at all leaves it untouched
    # (`exclude_unset`); sending "" or whitespace is the explicit clear.
    #
    # REUSES: backend/app/schemas/schemas.py:252 (_min_letters_validator) —
    # same floor, same Hebrew message, same three scripts (MEH-2236).
    @field_validator("recommended_note")
    @classmethod
    def _validate_recommended_note(cls, v: str | None) -> str | None:
        if v is None:
            return v
        cleaned = sanitize_text(v, max_length=500)
        if cleaned is None or not cleaned.strip():
            return None
        return _min_letters_validator(cleaned)

    # MEH-829: sanitize the owner-editable address on PATCH /producers/me, same
    # bleach strip as the register path (_sanitize_address on ProducerRegister).
    @field_validator("address")
    @classmethod
    def _sanitize_address(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=255)

    # MEH-1490: see normalize_google_place_id above.
    @field_validator("google_place_id")
    @classmethod
    def _validate_google_place_id(cls, v: str | None) -> str | None:
        return normalize_google_place_id(v)

    # MEH-1335: owner bio — strip HTML + cap at 300 (spec: "כמה מילים עלייך",
    # dashboard textarea counter matches this server-side cap).
    @field_validator("owner_bio")
    @classmethod
    def _sanitize_owner_bio(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=300)

    # MEH-1335: owner photo — image-URL guard, not just scheme (MEH-1222 class).
    @field_validator("owner_photo_url")
    @classmethod
    def _validate_owner_photo_url(cls, v: str | None) -> str | None:
        return _image_url_validator(v)

    # MEH-1508 ch2: the validation debt from chunk 1 — VARCHAR has no enum type,
    # so the app is the only guard. These run ONLY on an explicitly-provided value
    # (Pydantic v2 validate_default=False), so an omitted field is untouched; an
    # explicit null is rejected because the columns are NOT NULL and a null write
    # would 500 on the constraint.
    @field_validator("vegan_scope", "vegetarian_scope")
    @classmethod
    def _validate_dietary_scope(cls, v: str | None) -> str | None:
        allowed = {"unknown", "some", "all"}
        if v not in allowed:
            raise ValueError(f"scope חייב להיות אחד מ: {', '.join(sorted(allowed))}")
        return v

    @field_validator("reservist_owned")
    @classmethod
    def _reject_null_reservist_owned(cls, v: bool | None) -> bool | None:
        if v is None:
            raise ValueError("reservist_owned חייב להיות true או false")
        return v

    @field_validator("gluten_free_facility", "lactose_free_facility")
    @classmethod
    def _validate_facility_scope(cls, v: str | None) -> str | None:
        allowed = {"unknown", "shared", "dedicated"}
        if v not in allowed:
            raise ValueError(f"מתקן חייב להיות אחד מ: {', '.join(sorted(allowed))}")
        return v

    @field_validator("availability_state")
    @classmethod
    def _validate_availability_state(cls, v: str | None) -> str | None:
        # MEH-2758: membership only. The pause-only rule needs the CURRENT
        # state (an admin form resubmitting a legacy row's unchanged value must
        # still save), so it lives in admin.py, not here.
        if v is not None and v not in AVAILABILITY_STATES:
            raise ValueError(
                f"availability_state חייב להיות אחד מ: {', '.join(AVAILABILITY_STATES)}"
            )
        return v

    @field_validator("order_window")
    @classmethod
    def _validate_order_window(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        return _order_window_validator(v)

    @field_validator("special_hours")
    @classmethod
    def _validate_special_hours(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        return _special_hours_validator(v)

    @field_validator("payment_info")
    @classmethod
    def _validate_payment_info(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        return _payment_info_validator(v)

    # MEH-2153: delegates to the shared guard so the count/length/trim rules
    # that MEH-210 Phase 2 wrote inline live in one place, and picks up the
    # dedupe they were missing.
    @field_validator("custom_questions")
    @classmethod
    def _validate_custom_questions(cls, v: list[str] | None) -> list[str] | None:
        return _custom_questions_validator(v)

    @field_validator("primary_contact_method")
    @classmethod
    def _validate_primary_contact_method(cls, v: str | None) -> str | None:
        return _contact_method_validator(v)

    @field_validator("website", "facebook", "external_order_form")
    @classmethod
    def _validate_contact_urls(cls, v: str | None) -> str | None:
        return _url_scheme_validator(v)

    # MEH-1537: phone / whatsapp_group format + contact_email empty→None. This
    # schema backs BOTH the owner PUT /producers/me and the admin PUT (admin.py
    # bulk setattr), so validating here covers both write paths at once.
    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v: str | None) -> str | None:
        return _phone_validator(v)

    @field_validator("whatsapp_group")
    @classmethod
    def _validate_whatsapp_group(cls, v: str | None) -> str | None:
        return _whatsapp_group_validator(v)

    # MEH-1676: the owner's opt-out for the public «לא מגיעים אליך?» CTA
    # (column since MEH-1677). Optional so an absent key leaves it alone; an
    # explicit null is refused because the column is NOT NULL.
    coverage_cta_enabled: bool | None = None

    @field_validator("coverage_cta_enabled")
    @classmethod
    def _coverage_cta_not_null(cls, v: bool | None) -> bool | None:
        if v is None:
            raise ValueError("coverage_cta_enabled must be true or false")
        return v

    # MEH-1608: URL/@ → bare handle (the renderer builds the link itself).
    @field_validator("instagram")
    @classmethod
    def _normalize_instagram_handle(cls, v: str | None) -> str | None:
        return _normalize_instagram(v)

    @field_validator("contact_email", mode="before")
    @classmethod
    def _normalize_email(cls, v: Any) -> Any:
        return _normalize_contact_email(v)

    # MEH-1222: reject malformed image URLs in the producer photo array.
    @field_validator("images")
    @classmethod
    def _validate_images(cls, v: list[str] | None) -> list[str] | None:
        return _image_url_list_validator(v)

    @model_validator(mode="after")
    def _validate_location_mode(self) -> Self:
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
        # MEH-1644: the structured-rows path (delivery_areas) is the same
        # cities store — the nationwide XOR must hold for it too. Gated on
        # model_fields_set so a partial update that omits the field (default
        # []) is not misread as "no cities".
        if dn and "delivery_areas" in self.model_fields_set and self.delivery_areas:
            raise ValueError("לא ניתן לבחור גם משלוחים לכל הארץ וגם ערים ספציפיות")
        # MEH-1255: excluded cities sent together with an explicit
        # nationwide=false is always invalid (partial-update effective-state
        # check lives in the routers).
        if self.delivery_excluded_cities and dn is False:
            raise ValueError("ערים מוחרגות אפשריות רק עם משלוחים לכל הארץ")
        # MEH-1879: nationwide=true sent together with an explicit
        # offers_delivery=false is always invalid, whatever the stored row
        # says. `od is False` and not `not od`: None means "field absent from
        # this partial update", which is the effective-state guard's job
        # (services/delivery_validation.py), not this one.
        if dn and od is False:
            raise ValueError(
                '"לכל הארץ" מסומן, אבל "משלוחים" לא. סמנו "משלוחים", או בטלו את "לכל הארץ".'
            )
        return self

    @model_validator(mode="after")
    def _validate_vacation_until(self) -> Self:
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

    # MEH-1541: founding-year range guard. Runs ONLY on an explicitly-provided
    # value (an omitted field is dropped by exclude_unset, never validated); an
    # explicit null clears the column (nullable). Upper bound is Israel-tz
    # "today" year so an owner near new-year isn't blocked on a valid current
    # year. Out-of-range → 422 with the single Hebrew detail the spec locks.
    @field_validator("established_year")
    @classmethod
    def _validate_established_year(cls, v: int | None) -> int | None:
        if v is None:
            return None
        if v < 1800 or v > israel_today().year:
            raise ValueError("שנת ההקמה לא תקינה")
        return v

    # MEH-1577: the ONLY guard on these two columns. Migration c7e2a4b91f38
    # deliberately ships no DB CHECK (app-layer enforcement, so a bad payload is
    # a clean 422 rather than a 500 from a constraint violation) — which means
    # if this validator is weakened, nothing downstream catches it. Both the
    # owner PUT (producer_me.py) and the admin PUT (admin.py) build
    # ProducerUpdate, so both paths are covered here.
    #
    # The ceiling is not decoration. The columns are Postgres INTEGER (max
    # 2147483647); without an upper bound a larger value passes validation and
    # raises NumericValueOutOfRange at flush — a 500, which is exactly what the
    # no-DB-CHECK design exists to avoid. MAX_DELIVERY_MONEY sits far below the
    # INTEGER ceiling on purpose: any real delivery fee or free-delivery
    # threshold is orders of magnitude under ₪1,000,000, so the bound doubles as
    # a typo catch and is a product-level cap, not a storage-level one.
    @field_validator("delivery_fee")
    @classmethod
    def _validate_delivery_fee(cls, v: int | None) -> int | None:
        if v is None:
            return None
        # 0 is legal and load-bearing: it is how an owner says "delivery is
        # free", distinct from NULL ("not stated"). Only negatives are rejected.
        if v < 0:
            raise ValueError("עלות משלוח לא יכולה להיות שלילית")
        if v > MAX_DELIVERY_MONEY:
            raise ValueError("עלות משלוח גבוהה מדי")
        return v

    @field_validator("free_delivery_above")
    @classmethod
    def _validate_free_delivery_above(cls, v: int | None) -> int | None:
        if v is None:
            return None
        # Stricter than delivery_fee by one value: a "free above ₪0" threshold
        # says nothing (every order clears it), so 0 is rejected here while it
        # is accepted above.
        if v <= 0:
            raise ValueError("סף למשלוח חינם חייב להיות גדול מאפס")
        if v > MAX_DELIVERY_MONEY:
            raise ValueError("סף למשלוח חינם גבוה מדי")
        return v

    @field_validator("images", mode="before")
    @classmethod
    def _cap_images_meh3022(cls, v: Any) -> Any:
        # MEH-3022: Hebrew sentence before pydantic's English max_length one.
        return cap_list(v, MAX_GALLERY_IMAGES, GALLERY_IMAGES_DETAIL)

    @field_validator(
        "delivery_area_cities",
        "delivery_areas",
        "delivery_cities",
        "delivery_excluded_cities",
        mode="before",
    )
    @classmethod
    def _cap_delivery_meh3022(cls, v: Any) -> Any:
        # MEH-3022: Hebrew sentence before pydantic's English max_length one.
        return cap_list(v, MAX_DELIVERY_CITIES, DELIVERY_CITIES_DETAIL)


class ProducerAdminUpdate(ProducerUpdate):
    """MEH-1287 chunk B: the admin write shape — everything an owner may edit,
    plus what only an editor may set (today: `in_season_until`).

    A SUBCLASS rather than a field added to `ProducerUpdate`, because
    `ProducerUpdate` is the OWNER's schema and is shared by both PUT handlers
    (`producer_me.py` and `admin.py`). Chunk A pinned `in_season_until`'s
    absence from it by name, and that guard is the anti-self-curation rule in
    mechanical form: seasonality is the editor's judgement about a business,
    not the business's claim about itself (the ADR-030 principle, applied to a
    different surface). A subclass field does not join its parent's
    `model_fields`, so the guard still holds and the owner endpoint — which
    annotates `ProducerUpdate` — cannot receive the field at all.

    Note this is stronger than the `_PRODUCER_WRITABLE_FIELDS` whitelist that
    already filters the owner PUT: the whitelist drops the value after parsing,
    while this keeps the field off the owner's schema entirely, so it never
    appears in the owner's OpenAPI shape and no future edit to that whitelist
    can open it.
    """

    # A DATE, inclusive, in the Israel calendar: the business is in season
    # UNTIL this day. `None` clears the mark. There is deliberately no upper
    # bound — an editor curating a year ahead is a judgement call, not an
    # error, and the module only ever asks whether today is still inside it.
    in_season_until: date | None = None


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
        # the category licensing requirement. Mirrors the MEH-530 name-
        # membership predicate (license_validation.categories_require_license)
        # against the already-loaded categories — same single source of truth
        # (constants.LICENSE_REQUIRED_CATEGORIES), no DB round-trip in the
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
        from app.constants import LICENSE_REQUIRED_CATEGORIES
        from app.services.verification_status import verification_is_current

        model = handler(data)
        if isinstance(data, (dict, BaseModel)):
            return model

        def source(name: str) -> Any:
            return getattr(data, name, None)

        if verification_is_current(model.verified_at, source("license_expires_at")):
            model.verification_tier = "verified"
        elif source("declared_at") is not None and not any(
            c.name in LICENSE_REQUIRED_CATEGORIES for c in (model.categories or [])
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
    # shows it. Mirrors _compute_verification_tier's name-membership predicate
    # over the already-loaded categories (constants.LICENSE_REQUIRED_CATEGORIES)
    # — no DB round-trip, no N+1. Admin-only: lives on ProducerAdminOut, never
    # the public ProducerListOut/DetailOut.
    license_pending: bool = False

    @model_validator(mode="after")
    def _compute_license_pending(self) -> Self:
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
