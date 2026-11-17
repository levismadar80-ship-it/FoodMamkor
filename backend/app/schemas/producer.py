"""
Module:    schemas/producer
Purpose:   The business page, write side: create, admin create, owner
           update, admin update, plus AVAILABILITY_STATES and
           normalize_google_place_id, which services import.
Does NOT:  Hold the read side (schemas/producer_out.py) or the shared
           field validators (schemas.py).
Split out of schemas/schemas.py (MEH-3270); the code is moved verbatim and
every name is still importable from app.schemas.schemas.
"""

import re
from datetime import date
from typing import Any, Self
from uuid import UUID
from pydantic import (
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
    EMAIL_MAX_LENGTH,
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
    DeliveryAreaCreate,
    ProducerOfferCreate,
)


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
    contact_email: EmailStr | None = Field(default=None, max_length=EMAIL_MAX_LENGTH)
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
    contact_email: EmailStr | None = Field(default=None, max_length=EMAIL_MAX_LENGTH)
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
