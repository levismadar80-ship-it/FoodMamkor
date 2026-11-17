"""
Module:    schemas/registration
Purpose:   Request and response shapes for sign-up, login, OAuth,
           password reset, the owner-claim link and the owner invite.
Does NOT:  Verify credentials or tokens (app/auth.py, routers/auth.py).
Split out of schemas/schemas.py (MEH-3270); the code is moved verbatim and
every name is still importable from app.schemas.schemas.
"""

from datetime import datetime
from typing import Any, Literal, Self
from uuid import UUID
from pydantic import (
    BaseModel,
    EmailStr,
    Field,
    ValidationInfo,
    field_validator,
    model_validator,
)
from app.limits import (
    DELIVERY_CITIES_DETAIL,
    MAX_DELIVERY_CITIES,
    MAX_SMALL_LIST,
    cap_list,
)
from app.schemas.password import PasswordField
from app.services.sanitization import sanitize_text
from app.schemas.catalog import DeliveryAreaCreate
from app.schemas.schemas import (
    EMAIL_MAX_LENGTH,
    PhoneNumberField,
    SanitizedBusinessNameField,
    SanitizedPersonNameField,
    _cap_categories_validator,
    _contact_method_validator,
    _min_alnum_validator,
    _min_letters_validator,
    _normalize_contact_email,
    _normalize_instagram,
    _phone_validator,
    _require_categories_validator,
    _terms_must_be_accepted,
    _url_scheme_validator,
)


class UserRegister(BaseModel):
    email: EmailStr = Field(max_length=EMAIL_MAX_LENGTH)
    # MEH-1626 chunk 1: bleach only — NO letter floor. Two-letter Hebrew given
    # names (גל, טל, בר, רן) are legitimate, so the ≥3-letter floor used for
    # BUSINESS names would be a product regression on a person's name.
    name: SanitizedPersonNameField
    # MEH-306: PasswordField enforces the 12-char floor at the schema layer.
    # (city/phone below: phone migrated in MEH-1626 chunk 1 — see the field.)
    # Deny-list / HIBP / reuse run inside the register handler via
    # app.services.password_policy.validate_password — Pydantic validators
    # are sync and cannot await HIBP. Replaces MEH-248's 8-char floor.
    password: PasswordField
    # MEH-3271: users.city is String(100); longer text was a 500 at commit.
    city: str | None = Field(default=None, max_length=100)
    # MEH-1626 chunk 1: surfaced by the asymmetry scan rather than the issue's
    # list — same public signup body as `name` above, persisted at auth.py:313,
    # and it feeds the WhatsApp alert number. Left raw it is the exact MEH-1537
    # failure (a stored number no wa.me link can dial).
    phone: PhoneNumberField | None = None
    # MEH-1995 recorded the terms-of-service acceptance; MEH-2080 made it
    # mandatory and folded the 18+ self-declaration into the same checkbox
    # (RegisterClient.jsx:76, `required`). See _terms_must_be_accepted above.
    terms_accepted: bool

    @field_validator("terms_accepted")
    @classmethod
    def _terms_accepted_required(cls, v: bool) -> bool:
        return _terms_must_be_accepted(v)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(max_length=EMAIL_MAX_LENGTH)


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
    email: EmailStr | None = Field(default=None, max_length=EMAIL_MAX_LENGTH)
    # MEH-1626 chunk 1: the ACCOUNT-holder's person name (producer_name below
    # is the business). Surfaced by the asymmetry scan, not the issue's list:
    # UserRegister.name is sanitized, so leaving its twin on the producer
    # signup body raw would recreate the very MEH-1623 shape this epic exists
    # to kill. Optional — the MEH-143 upgrade path omits it, and the None
    # branch of the union bypasses the validator.
    name: SanitizedPersonNameField | None = None
    # MEH-457 — closes the MEH-306 sibling gap. PasswordField enforces
    # the 12-char floor + whitespace strip when a password is supplied
    # (new-registration path). The None case (authenticated user
    # upgrading to producer, MEH-143) skips validation entirely. The
    # full policy (HIBP, deny-list) runs in the handler via
    # app.services.password_policy.validate_password.
    password: PasswordField | None = None
    # Producer details
    # MEH-1626 chunk 1: was the MEH-1623 hand-rolled sanitize+floor pair; now
    # the first consumer of the shared type. Behaviour is byte-identical —
    # _sanitized_business_name is those two validators in the same order.
    producer_name: SanitizedBusinessNameField
    description: str | None = None
    short_description: str | None = Field(default=None, max_length=160)
    # MEH-2015 chunk B: required on BOTH paths (new registration + MEH-143
    # upgrade) — Sapir's 14.8.2026 ruling revokes MEH-951's visual-only
    # exception. City is the discovery axis (map + filter), not a profile
    # field: unenforced, it shipped empty. Twin of ExperienceCreate.city /
    # EventCreate.city (MEH-2013's Field(..., min_length=1, max_length=100)
    # shape) — but NOT byte-identical: adversarial review on this PR found
    # `min_length=1` alone accepts a whitespace-only value ("   " has length
    # 3), which those two siblings still carry unfixed. Closed here with the
    # bleach→letter-floor validator pair below; not backported to the
    # siblings (out of scope for this PR — they're unmodified elsewhere).
    city: str = Field(..., min_length=1, max_length=100)
    address: str | None = Field(default=None, max_length=255)
    lat: float | None = None
    lng: float | None = None
    phone: str | None = None
    instagram: str | None = None
    website: str | None = None
    # MEH-17: flexible contact methods.
    primary_contact_method: str = "whatsapp"
    contact_email: EmailStr | None = Field(default=None, max_length=EMAIL_MAX_LENGTH)
    # MEH-2460: 'organizer' registers a market / events organizer (ADR-036).
    # Declared BEFORE category_ids on purpose: the category validator reads it
    # from `info.data`, and Pydantic v2 only exposes fields declared earlier.
    kind: Literal["producer", "organizer"] = "producer"
    # MEH-1153: server-side parity with the client's ≥1-category gate.
    # validate_default=True runs _require_categories_validator on the absent
    # case (default []) too, so both "missing" and "[]" 422.
    category_ids: list[int] = Field(
        default_factory=list, validate_default=True, max_length=MAX_SMALL_LIST
    )
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
    # created with declared_at/declaration_version stamped; declaration COPY is
    # Chunk C.
    #
    # MEH-1995 correction: this comment used to say "The frontend checkbox
    # (agreedToTerms) feeds this value." It does not, and never did.
    # RegisterProducerClient.jsx:565-566 builds it from
    # `declarationConfirmed && (!farmerDeclarationRequired || farmerConfirmed)`
    # — the LICENSING declaration. `agreedToTerms` is the separate terms-of-
    # service checkbox, enforced as its own submit gate at :1630, and the
    # frontend says so in as many words at :563-564. Conflating the two hid the
    # fact that ToS consent reached no column at all; `terms_accepted` below is
    # its actual carrier.
    declaration_accepted: bool = False
    # MEH-2923: the grower line («גידלתי בחלקתי בלבד»), sent on its own. The
    # server requires it when a category is in FARMER_DECLARATION_CATEGORIES
    # (auth.py, before the upgrade/new split) and stamps it separately as
    # farmer_declared_at / farmer_declaration_version.
    farmer_declaration_accepted: bool = False
    # MEH-1995: the terms-of-service checkbox (`agreedToTerms` on both register
    # forms), which until now was a pure client-side gate — it disabled the
    # submit button and was then discarded, leaving no evidence of consent.
    #
    # Optional with default False so this is additive: an existing caller that
    # omits it behaves exactly as before and simply records nothing, rather
    # than newly 422-ing. False therefore means "no consent recorded", never
    # "consent refused" — the handler stamps only on True, so an omitted field
    # leaves terms_accepted_at NULL, which is the honest state.
    #
    # MEH-1995 deliberately left this optional and named the mandatory form
    # as a separate hardening decision. MEH-2080 is that decision: the box is
    # required on both email paths (new producer AND the consumer→producer
    # upgrade, which renders the same checkbox), and it now also carries the
    # 18+ self-declaration. See _terms_must_be_accepted above.
    terms_accepted: bool

    @field_validator("terms_accepted")
    @classmethod
    def _terms_accepted_required(cls, v: bool) -> bool:
        return _terms_must_be_accepted(v)

    # MEH-971 chunk 2: license-pending opt-in. Transient INPUT only (never a DB
    # column) — when True the register-time ensure_license_for_categories 422 is
    # skipped, so a producer in a license-required category can submit with no
    # license number and land in the pending queue.
    # NOT a security control: the licensed-only rule is still enforced
    # downstream — chunk-4 approval guard (admin.py) refuses to approve a
    # license-required producer with NULL license, and publication requires
    # status=="approved" (producer_listing.py). Default False = unchanged for
    # every existing caller.
    license_pending: bool = False
    # MEH-1471: self-reported attribution ("מאיפה שמעת עלינו?"). Optional at the
    # Pydantic layer — the DB column is nullable and the required-ness is a
    # front-end registration gate only, so an ABSENT value keeps the MEH-143
    # upgrade path and every existing register test working. A PROVIDED
    # referral_source must be one of constants.REFERRAL_SOURCE_KEYS (validator
    # below 422s an unknown key). referral_source_other is the optional free-text
    # answer for the "other" choice, bleach-sanitised + capped at the DB width.
    referral_source: str | None = Field(default=None, max_length=40)
    referral_source_other: str | None = Field(default=None, max_length=120)
    # MEH-293/MEH-479: dietary flags moved to per-product tagging via /settings.
    # Delivery areas
    delivery_areas: list["DeliveryAreaCreate"] = Field(
        default_factory=list, max_length=MAX_DELIVERY_CITIES
    )
    # MEH-1838 chunk A: delivery-shape fields — registration previously
    # captured NO axis at all (has_physical_location/offers_delivery both
    # silently defaulted at the DB layer), so every new business landed
    # identical regardless of shape. has_physical_location/offers_delivery/
    # delivery_nationwide map onto their Producer columns directly
    # (models.py:251-256). delivery_cities does NOT — see the Phase 0 note
    # on the model_validator below (MEH-903 A): the router folds it into
    # delivery_areas rows instead of the legacy flat column. Defaults match
    # the Producer model's own column defaults, so an existing caller that
    # omits these fields is unaffected.
    has_physical_location: bool = True
    offers_delivery: bool = False
    delivery_nationwide: bool = False
    delivery_cities: list[str] = Field(
        default_factory=list, max_length=MAX_DELIVERY_CITIES
    )

    # MEH-1623 shipped producer_name's bleach→floor pair as two inline
    # @field_validators here; MEH-1626 chunk 1 moved that exact logic into
    # SanitizedBusinessNameField (declared on the field above) so the sibling
    # schemas can share it instead of re-copying it. Same helpers, same order,
    # same 422s — see _sanitized_business_name for the full rationale.
    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=2000)

    # MEH-829: same bleach/XSS defense-in-depth as description above — these two
    # were collected on the public registration path without the strip their
    # ProducerUpdate twins already run.
    @field_validator("short_description")
    @classmethod
    def _sanitize_short_description(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=160)

    @field_validator("address")
    @classmethod
    def _sanitize_address(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=255)

    # MEH-2015 chunk B (adversarial-review finding): city is public-rendered
    # (map + filter), so bleach it like every other free-text field on this
    # schema — sanitize_text also collapses a whitespace-only input to None,
    # which is what lets the letter-floor validator below reject it cleanly
    # instead of `Field(min_length=1)` silently accepting "   ".
    @field_validator("city")
    @classmethod
    def _sanitize_city(cls, v: str) -> str | str | None:
        return sanitize_text(v, max_length=100)

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
    def _validate_short_description_letters(cls, v: str | None) -> str | None:
        # Guard is load-bearing: _min_letters_validator(None) coerces None → ""
        # and raises (HOT-003), which would reject an absent optional tagline.
        # _validate_address_alnum below needs no guard — _min_alnum_validator
        # handles None internally.
        if v is None:
            return v
        return _min_letters_validator(v)

    @field_validator("address")
    @classmethod
    def _validate_address_alnum(cls, v: str | None) -> str | None:
        return _min_alnum_validator(v)

    # MEH-2015 chunk B: city's floor, min_count=1 (not the ≥3 used for
    # names/taglines above) — a legitimate short Hebrew city name ("בת ים",
    # "לוד") must clear it. `_min_letters_validator(None)` coerces the
    # bleach-emptied case to "" internally and raises (HOT-003 path), so no
    # None-guard is needed here — unlike short_description, city is required,
    # not optional, so a stripped-to-nothing value is exactly what must 422.
    @field_validator("city")
    @classmethod
    def _validate_city_letters(cls, v: str) -> str:
        return _min_letters_validator(v, min_count=1)

    @field_validator("primary_contact_method")
    @classmethod
    def _validate_primary_contact_method(cls, v: str) -> str | str | None:
        return _contact_method_validator(v)

    # MEH-296: same http(s) scheme guard as ProducerUpdate. ProducerRegister
    # only exposes `website` among the URL fields (no facebook /
    # external_order_form columns here — those are owner-edit-only).
    @field_validator("website")
    @classmethod
    def _validate_contact_urls(cls, v: str | None) -> str | None:
        return _url_scheme_validator(v)

    # MEH-1537: phone format + empty→None. No whatsapp_group on this schema.
    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v: str | None) -> str | None:
        return _phone_validator(v)

    # MEH-1608: URL/@ → bare handle (the renderer builds the link itself).
    @field_validator("instagram")
    @classmethod
    def _normalize_instagram_handle(cls, v: str | None) -> str | None:
        return _normalize_instagram(v)

    @field_validator("contact_email", mode="before")
    @classmethod
    def _normalize_email(cls, v: Any) -> Any:
        return _normalize_contact_email(v)

    # MEH-1471: reject any non-null referral_source outside the allowed key set
    # (422). None / empty / whitespace-only normalise to None (nullable column;
    # existing producers + the MEH-143 upgrade path never send it). Inline import
    # mirrors the ProducerAdminOut._compute_* validators — keeps the constants
    # dependency out of the module-top imports.
    @field_validator("referral_source")
    @classmethod
    def _validate_referral_source(cls, v: str | None) -> str | None:
        from app.constants import REFERRAL_SOURCE_KEYS

        if v is None:
            return v
        v = v.strip()
        if not v:
            return None
        if v not in REFERRAL_SOURCE_KEYS:
            raise ValueError("referral_source לא חוקי")
        return v

    # MEH-1471: bleach/XSS strip on the free-text "other" answer, same defense as
    # short_description/address above. Cap mirrors the DB column (120).
    @field_validator("referral_source_other")
    @classmethod
    def _sanitize_referral_source_other(cls, v: str | None) -> str | None:
        return sanitize_text(v, max_length=120)

    @field_validator("category_ids")
    @classmethod
    def _require_categories(
        cls, v: list[int], info: ValidationInfo
    ) -> list[int] | list[int] | None:
        # MEH-2460: an organizer carries no food category (ADR-036, decision 4)
        # — whatever was sent is dropped, and the ≥1 rule does not apply.
        if info.data.get("kind") == "organizer":
            return []
        # MEH-1297: enforce the ≤3 cap alongside the MEH-1153 ≥1 requirement.
        return _cap_categories_validator(_require_categories_validator(v))

    # MEH-1838 chunk A: same physical-or-delivery / nationwide-XOR-cities
    # semantic as ProducerAdminCreate._validate_location_mode (:1560-1582) —
    # NOT a verbatim copy. Phase 0 (required before this chunk) found the
    # naive read wrong twice over:
    #   1. ProducerAdminCreate's own XOR checks delivery_area_cities, not the
    #      flat delivery_cities the DB CHECK (models.py:447-453,
    #      delivery_nationwide_xor_cities) is written against — MEH-903 A.
    #   2. The flat column MEH-903 A's comment points at is itself legacy:
    #      admin.py:427-429/486-489 pop it out of every write on purpose, and
    #      producer_listing.py:258's "delivers to <city>" match reads
    #      delivery_areas rows exclusively — the flat column is dead weight
    #      kept only because dropping it needs its own Alembic chunk.
    # This validator still checks self.delivery_cities (the PAYLOAD field —
    # correct, matches what the frontend sends and what the DB CHECK guards
    # semantically), but the router folds a non-empty list into delivery_areas
    # rows rather than the column, so the city list is actually visible to the
    # live filter. See the router-side comment at auth.py for the write.
    @model_validator(mode="after")
    def _validate_location_mode(self) -> Self:
        # MEH-2460: an organizer has no fixed address and delivers nothing, so
        # the form does not ask (address / map / delivery are hidden for it). The DB CHECK producer_location_mode
        # (has_physical_location OR offers_delivery) still applies to the row,
        # so the server writes the one shape that satisfies it and claims no
        # delivery: physical=True, delivery off. The row is never shown as a
        # business (is_business()), so the flag carries no public meaning.
        # License fields are cleared for the same reason — nothing to license.
        if self.kind == "organizer":
            self.has_physical_location = True
            self.offers_delivery = False
            self.delivery_nationwide = False
            self.delivery_cities = []
            self.delivery_areas = []
            self.producer_license_number = None
            self.license_pending = False
            # Review #3711 F5: no street address and no map point — the form
            # does not ask, and coordinates would mint a producer_locations
            # row (create_primary_branch_location skips when lat/lng is None).
            self.address = None
            self.lat = None
            self.lng = None
            return self
        if not self.has_physical_location and not self.offers_delivery:
            raise ValueError("חייב לפחות אחד: חנות פיזית או משלוחים")
        if self.delivery_nationwide and len(self.delivery_cities) > 0:
            raise ValueError("לא ניתן לבחור גם משלוחים לכל הארץ וגם ערים ספציפיות")
        if self.delivery_nationwide and not self.offers_delivery:
            raise ValueError(
                '"לכל הארץ" מסומן, אבל "משלוחים" לא. סמנו "משלוחים", או בטלו את "לכל הארץ".'
            )
        return self

    @field_validator("delivery_areas", "delivery_cities", mode="before")
    @classmethod
    def _cap_delivery_meh3022(cls, v: Any) -> Any:
        # MEH-3022: Hebrew sentence before pydantic's English max_length one.
        return cap_list(v, MAX_DELIVERY_CITIES, DELIVERY_CITIES_DETAIL)


class GoogleAuthRequest(BaseModel):
    id_token: str
    # MEH-2080 chunk 2: the /register checkbox, forwarded when the consumer
    # signs up with Google. Optional — /login sends nothing — and only a True
    # value is ever written (NULL stays the honest state).
    terms_accepted: bool = False


class AppleAuthRequest(BaseModel):
    id_token: str
    name: SanitizedPersonNameField | None = None  # Apple sends it once
    terms_accepted: bool = False  # MEH-2080 chunk 2, as GoogleAuthRequest


# MEH-170 — Step-0 OAuth on producer signup. Same shape as Google/Apple
# auth but paired with an explicit "producer flow" discriminator so the
# router can return 409 when the user already has a producer linked
# (the UI then redirects to /login instead of silently logging in).
class ProducerOAuthSignupRequest(BaseModel):
    provider: str = Field(pattern="^(google|apple)$")
    id_token: str
    name: SanitizedPersonNameField | None = None  # Apple sends it once


class LoginRequest(BaseModel):
    email: EmailStr = Field(max_length=EMAIL_MAX_LENGTH)
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


# MEH-2322 (MEH-2321 chunk A): owner-claim link. Shapes for
# routers/producer_claim.py. The preview is PUBLIC (anyone holding the link),
# so it carries only what the business already shows on its own site — never
# phone, email, address, license or admin fields.
class ProducerClaimLinkOut(BaseModel):
    url: str
    expires_at: datetime


class DraftPreviewLinkOut(BaseModel):
    """MEH-3377. Its own shape, not ProducerClaimLinkOut: the two links grant
    different things, and the claim-link inventory test pins that schema to the
    one route that mints a claim link."""

    url: str
    expires_at: datetime


class ProducerClaimPreviewOut(BaseModel):
    name: str
    city: str | None = None
    short_description: str | None = None
    image: str | None = None
    category_names: list[str] = []


class ProducerClaimPreviewRequest(BaseModel):
    # In the body, never the query string — see producer_claim.py.
    token: str = Field(min_length=1, max_length=2048)


class ProducerClaimRequest(BaseModel):
    # A signed JWT; 2048 is far above its real length and stops a megabyte
    # body from reaching the decoder.
    token: str = Field(min_length=1, max_length=2048)
    declaration_accepted: bool = False
    terms_accepted: bool = False
    # MEH-3137: the grower line («גידלתי בחלקתי בלבד») apart from the licensing
    # declaration, required for ירקות/פירות (services/farmer_declaration.py).
    farmer_declaration_accepted: bool = False


class ProducerClaimOut(BaseModel):
    producer_id: UUID
    status: str


class ProducerClaimNewLinkOut(BaseModel):
    # MEH-3122: always the same body — see request_new_claim_link.
    ok: bool


# MEH-3377: «פרסום בהסכמה» for an ownerless draft
# (routers/producer_draft_preview.py). Same two consent fields, same bounds
# and same reason as OwnerInviteCreate below: no page goes live on someone's
# behalf without a recorded written consent.
class DraftConsentPublishIn(BaseModel):
    consent_confirmed: bool
    consent_note: str = Field(min_length=1, max_length=500)

    @field_validator("consent_confirmed")
    @classmethod
    def _consent_required(cls, v: bool) -> bool:
        if v is not True:
            raise ValueError(
                "חובה לאשר שהתקבל אישור מפורש בכתב מבעלי העסק לפני פרסום העמוד"
            )
        return v

    @field_validator("consent_note")
    @classmethod
    def _note_not_blank(cls, v: str) -> str:
        # "   " passes min_length and is as useless as "" for an audit trail.
        stripped = (v or "").strip()
        if not stripped:
            raise ValueError("חובה לתעד איך התקבלה ההסכמה")
        return stripped


class DraftConsentPublishOut(BaseModel):
    producer_id: UUID
    status: str
    slug: str | None = None


# ---------------------------------------------------------------------------
# MEH-2974: owner invite for a business an admin built end to end.
# Routers: routers/producer_owner_invite.py (admin + public).
# ---------------------------------------------------------------------------


class OwnerInviteCreate(BaseModel):
    """What the admin sends to invite a business's owner.

    `consent_confirmed` and `consent_note` are not form decoration: closed
    decision 4 of the card is that no invite exists without a recorded written
    consent, and these two columns plus `owner_invite_created_by` ARE the audit
    trail. Both are enforced here rather than in the handler so the refusal is
    a 422 on the body — the same classification as `terms_accepted` on
    `UserRegister` above, and for the same reason: it is a statement about the
    payload, not about which business it names, so it leaks nothing.
    """

    # OPTIONAL since v3 of the card, and that is a product fact rather than a
    # convenience: most businesses reach us on Instagram or WhatsApp and we
    # have no address for them, so the admin mints a link with none and the
    # owner types her own on the acceptance page — where it is proven with a
    # one-time code before any account exists. When the admin DOES have an
    # address, the invite mail goes out as before.
    email: EmailStr | None = Field(default=None, max_length=EMAIL_MAX_LENGTH)
    # Same reasoning as `UserRegister.name`: this is a PERSON's name, so bleach
    # only and no >=3-letter floor (two-letter Hebrew given names are real).
    name: SanitizedPersonNameField
    consent_confirmed: bool
    consent_note: str = Field(min_length=1, max_length=500)

    @field_validator("email", mode="before")
    @classmethod
    def _normalise_email(cls, v: Any) -> Any:
        """Lower + trim BEFORE EmailStr, so the uniqueness checks in the
        handler and the row we store agree with `users.email` — which is
        itself stored as typed, and compared with `func.lower` on both sides.

        An empty or whitespace-only string becomes None rather than a 422: the
        admin form sends `""` for an untouched optional field, and "left blank"
        is the normal case here, not an error.
        """
        if not isinstance(v, str):
            return v
        return v.strip().lower() or None

    @field_validator("consent_confirmed")
    @classmethod
    def _consent_required(cls, v: bool) -> bool:
        if v is not True:
            raise ValueError(
                "חובה לאשר שהתקבל אישור מפורש בכתב מבעלי העסק לפני שליחת הזמנה"
            )
        return v

    @field_validator("consent_note")
    @classmethod
    def _note_not_blank(cls, v: str) -> str:
        # `min_length=1` above rejects "" but NOT "   ", and a whitespace note
        # is exactly as useless as an empty one for an audit trail.
        stripped = (v or "").strip()
        if not stripped:
            raise ValueError("חובה לתעד איך התקבלה ההסכמה")
        return stripped


class OwnerInviteCreatedOut(BaseModel):
    """The ONE response that carries the raw token, as part of `invite_url`.

    Returned by create and by resend, and nowhere else: there is no GET that
    re-reads it, because the database holds only the sha256. If the admin
    loses the link she resends, which mints a new token and kills this one.
    """

    invite_url: str
    # v3: optional, because an invite may be created with no address at all —
    # the admin copies the link into WhatsApp and the owner types her own
    # address on the page. `None` here is "nothing was sent anywhere", which is
    # what the panel renders instead of a «נשלח אל» line.
    email: EmailStr | None = None
    name: str
    sent_at: datetime
    expires_at: datetime


class OwnerInvitePublicOut(BaseModel):
    """What the acceptance page may know before anyone has authenticated.

    Deliberately three fields. The business NAME is already public on its own
    page, and the EMAIL is the address the link was sent to — so a holder of
    the link learns nothing about the business they did not already have. No
    phone, no address, no license, no ids, and no token echo.
    """

    producer_name: str
    # NULL when the admin minted the link without one (v3). The page then shows
    # an empty, editable field instead of a read-only address.
    email: EmailStr | None = None
    # Whether the acceptance page must render the grower line beside the
    # licensing declaration (constants.FARMER_DECLARATION_CATEGORIES). Computed
    # server-side rather than shipped as `category_names` for the page to
    # classify, because this page's whole job is collecting a declaration and
    # the condition for it should not be re-derived by the client.
    requires_farmer_declaration: bool
    # v3: True when the business is still hidden, i.e. accepting PUBLISHES it.
    # The page says so on the button («אישור והעלאת הדף» vs «אישור וכניסה
    # ללוח הבקרה»), because those are different promises.
    will_publish: bool = False
    # v3: what the page will look like, so she approves something she has
    # seen. Same five public fields as `ProducerClaimPreviewOut` — every one of
    # them is already on the business's own page — and deliberately NOT the
    # public endpoint itself: a hidden business must not become reachable
    # through `/producers/*` before she accepts. Holding the link is the only
    # way to see it.
    preview: ProducerClaimPreviewOut | None = None


class OwnerInviteAccept(BaseModel):
    # URL-safe base64 of 32 random bytes is ~43 chars; the ceiling stops a
    # megabyte body from reaching the hash function.
    token: str = Field(min_length=1, max_length=512)
    # v3: the address she typed, and the code that proves it. Both required —
    # there is no path to an account without a verified address, including the
    # case where the admin pre-filled one (she still confirms it with a code,
    # because a pre-filled address is also just a string someone typed).
    email: EmailStr = Field(max_length=EMAIL_MAX_LENGTH)
    code: str = Field(min_length=1, max_length=12)
    # Same 12-char schema floor as every other password entry point; the full
    # policy (deny-list, HIBP) runs in the handler, which can await.
    password: PasswordField

    @field_validator("email", mode="before")
    @classmethod
    def _normalise_email(cls, v: Any) -> Any:
        return v.strip().lower() if isinstance(v, str) else v

    @field_validator("code", mode="before")
    @classmethod
    def _strip_code(cls, v: Any) -> Any:
        """People paste the code with spaces around it, and some mail clients
        insert a non-breaking space. Strip both before the comparison, which is
        on a hash and therefore unforgiving."""
        return v.replace("\u00a0", "").strip() if isinstance(v, str) else v

    # NOT optional-with-default, unlike `ProducerRegister.terms_accepted`.
    # There the default exists for backwards compatibility with callers that
    # predate the field; here there is no such caller, and both consents are
    # the entire point of the step — so an omitted box is a 422, never a
    # silently unrecorded consent.
    terms_accepted: bool
    declaration_accepted: bool
    # MEH-3137: the grower line, apart from the licensing declaration. Optional:
    # only a grower category needs it, and the handler checks that.
    farmer_declaration_accepted: bool = False

    @field_validator("terms_accepted")
    @classmethod
    def _terms_accepted_required(cls, v: bool) -> bool:
        return _terms_must_be_accepted(v)

    @field_validator("declaration_accepted")
    @classmethod
    def _declaration_accepted_required(cls, v: bool) -> bool:
        if v is not True:
            raise ValueError("יש לאשר את הצהרת הרישוי כדי להמשיך")
        return v


class OwnerInviteEmailCodeRequest(BaseModel):
    """v3: «send a code to this address».

    The response is a fixed 200 whatever happens — address free, address
    already registered, send failed — so this shape carries nothing a caller
    could use to tell those apart.
    """

    token: str = Field(min_length=1, max_length=512)
    email: EmailStr = Field(max_length=EMAIL_MAX_LENGTH)

    @field_validator("email", mode="before")
    @classmethod
    def _normalise_email(cls, v: Any) -> Any:
        return v.strip().lower() if isinstance(v, str) else v


class ProducerOwnerSummary(BaseModel):
    """The account behind a business, for the admin's «בעלים» panel only.

    Two fields, and the shape is the limit: the admin needs to see WHO she
    handed the page to, never the account itself. Hydrated beside `has_owner`
    (routers/admin.py `_attach_has_owner`) in the same single query, so it
    costs no extra round-trip and cannot reintroduce the per-row SELECT
    MEH-2541 removed from `GET /admin/producers`.
    """

    name: str
    email: EmailStr


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
