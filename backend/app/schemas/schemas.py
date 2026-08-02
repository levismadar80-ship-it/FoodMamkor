import re
from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Annotated, Literal
from urllib.parse import urlparse
from uuid import UUID

from pydantic import (
    AfterValidator,
    BaseModel,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

from app.schemas.password import PasswordField
from app.services.sanitization import sanitize_text
from app.utils.clock import israel_today

_LETTER_REGEX = re.compile(r"[^א-תa-zA-Z]")

# MEH-1543: weekly order-acceptance window validation. Keys are a subset of
# these 7 English day names (stable storage keys; Hebrew labels rendered
# client-side); a day absent = orders closed that day. Each present day carries
# {"open": "HH:MM", "close": "HH:MM"} in zero-padded 24h, close strictly after
# open. String comparison of two zero-padded HH:MM values is a valid time order.
_ORDER_WINDOW_DAYS = frozenset(
    {"sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"}
)
_HHMM_REGEX = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _order_window_validator(v):
    """Validate producers.order_window on write (MEH-1543).

    None passes through — an explicit null clears the field, an omitted field
    never reaches here (exclude_unset). Any structural or value violation raises
    ValueError, surfaced by FastAPI as a 422 with the Hebrew detail.
    """
    if v is None:
        return None
    if not isinstance(v, dict):
        raise ValueError("חלון הזמנות חייב להיות אובייקט של ימים")
    for day, hours in v.items():
        if day not in _ORDER_WINDOW_DAYS:
            raise ValueError(
                f"מפתח יום לא תקין: {day} — חייב להיות אחד מ: "
                + ", ".join(sorted(_ORDER_WINDOW_DAYS))
            )
        if not isinstance(hours, dict) or "open" not in hours or "close" not in hours:
            raise ValueError(f"היום {day} חייב לכלול שעת פתיחה ושעת סגירה")
        open_t, close_t = hours["open"], hours["close"]
        if not (isinstance(open_t, str) and _HHMM_REGEX.match(open_t)) or not (
            isinstance(close_t, str) and _HHMM_REGEX.match(close_t)
        ):
            raise ValueError(
                f"שעה לא תקינה ליום {day} — הפורמט חייב להיות HH:MM (24 שעות)"
            )
        if close_t <= open_t:
            raise ValueError(f"שעת הסגירה חייבת להיות אחרי שעת הפתיחה ביום {day}")
    return v


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


# MEH-1537: contact-field format guards. The server is the source of truth for
# contact_email / phone / whatsapp_group on EVERY Producer write path — a
# malformed phone silently breaks the wa.me button, a malformed email is a dead
# contact channel, a bad group link dead-ends the invite. Shared (not
# copy-pasted) so all four write schemas — ProducerRegister, ProducerCreate,
# ProducerAdminCreate, ProducerUpdate — enforce one definition. Empty /
# whitespace-only normalises to None on all three: the dashboard sends "" for a
# cleared field and must not 422. Precedent: _url_scheme_validator (scheme
# guard) + _validate_referral_source (strip → None).
_EMAIL_FORMAT_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Matches the MEH-1537 Railway audit SQL exactly: strip every non-digit, then
# optional 972 country code, optional leading 0, then 8-9 subscriber digits.
_PHONE_DIGITS_RE = re.compile(r"^(972)?0?[0-9]{8,9}$")
_PHONE_SEPARATORS_RE = re.compile(r"[\s()\-]")


def _normalize_contact_email(value: str | None) -> str | None:
    """`mode="before"` guard for contact_email. Empty/whitespace → None; else a
    basic local@domain.tld shape (same regex as the frontend `validateEmail` +
    the audit SQL) with a Hebrew error. Runs BEFORE the field's `EmailStr` type
    so a cleared field ("") normalises to None instead of 422-ing; a surviving
    non-empty value still passes through EmailStr as the RFC backstop.
    """
    if not isinstance(value, str):
        # None or a non-string — let the field type (EmailStr | None) decide.
        return value
    stripped = value.strip()
    if stripped == "":
        return None
    if not _EMAIL_FORMAT_RE.match(stripped):
        raise ValueError("כתובת אימייל לא תקינה")
    return stripped


def _phone_validator(value: str | None) -> str | None:
    """Strip separators (spaces/dashes/parens) ONLY — keep the +/digits as typed
    so the wa.me builders (frontend `normalizePhone` re-strips to digits anyway,
    lib/utils.js) are unaffected. Validate the digit-only projection against the
    audit regex. Empty/whitespace → None.
    """
    if value is None:
        return None
    stripped = value.strip()
    if stripped == "":
        return None
    cleaned = _PHONE_SEPARATORS_RE.sub("", stripped)
    digits = re.sub(r"\D", "", cleaned)
    if not _PHONE_DIGITS_RE.match(digits):
        raise ValueError("מספר טלפון לא תקין")
    return cleaned


def _whatsapp_group_validator(value: str | None) -> str | None:
    """WhatsApp group invite links must be https://chat.whatsapp.com/… — any
    other scheme/host is a dead or wrong link on the public contact card.
    Empty/whitespace → None.
    """
    if value is None:
        return None
    stripped = value.strip()
    if stripped == "":
        return None
    parsed = urlparse(stripped)
    if parsed.scheme != "https" or parsed.netloc.lower() != "chat.whatsapp.com":
        raise ValueError("קישור קבוצת וואטסאפ חייב להתחיל ב-https://chat.whatsapp.com")
    return stripped


# MEH-1608: producers.instagram stores a BARE HANDLE — the public renderer
# (frontend ContactCard.jsx:105-106) composes https://instagram.com/{handle}
# itself, so a stored full URL becomes a doubled, dead link on the public
# contact card. Forgiving in input, canonical in storage: full instagram.com
# URLs (any of https/http/www), a leading @, trailing slashes and query/#
# tails all normalize to the handle. Empty/whitespace → None (the MEH-1537
# empty-contact convention).
_INSTAGRAM_URL_PREFIX_RE = re.compile(
    r"^(?:https?://)?(?:www\.)?instagram\.com/", re.IGNORECASE
)


def _normalize_instagram(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    if stripped == "":
        return None
    stripped = _INSTAGRAM_URL_PREFIX_RE.sub("", stripped)
    stripped = stripped.split("?", 1)[0].split("#", 1)[0]
    stripped = stripped.strip("/").lstrip("@").strip()
    return stripped or None


def _url_scheme_validator(value: str | None) -> str | None:
    # MEH-1626 chunk 3 (item 3): empty/whitespace now normalises to None, not
    # "". The old "" return existed only so a cleared dashboard field would not
    # 422 (see the MEH-1537 note above, which already cites this function as
    # its precedent) — None satisfies that just as well and additionally stores
    # NULL instead of an empty string, matching what contact_email / phone /
    # whatsapp_group have done since MEH-1537. Every schema sharing this
    # validator inherits the change; the owner PUT applies it through
    # exclude_unset (producer_me.py:270), so clearing a URL still clears it.
    if value is None:
        return None
    stripped = value.strip()
    if stripped == "":
        return None
    if not stripped.lower().startswith(("http://", "https://")):
        raise ValueError("כתובת אתר חייבת להתחיל ב-http:// או https://")
    return stripped


# MEH-1222: image-URL fields silently accepted garbage — "bread.jpg",
# "http.ad.jpg", "https://bread.jpg" — which then 404-storm through
# next/image. Stronger than _url_scheme_validator: besides the http(s)
# scheme it rejects a bare filename pasted as the host (a netloc that ENDS
# in an image extension), which is exactly the "https://bread.jpg" class
# the scheme check alone lets through. A real Cloudinary URL carries the
# ".jpg" in the PATH ("res.cloudinary.com/…/bread.jpg"), not the host, so
# it passes. Input schemas only — response schemas stay unvalidated so
# existing bad rows still READ (data cleanup is a separate DML-side pass).
_IMAGE_HOST_EXT_RE = re.compile(
    r"\.(jpe?g|png|webp|gif|svg|avif|bmp|tiff?)$", re.IGNORECASE
)


def _image_url_validator(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    if stripped == "":
        return None
    if not stripped.lower().startswith(("http://", "https://")):
        raise ValueError("כתובת תמונה חייבת להתחיל ב-http:// או https://")
    # netloc without credentials/port; a real host never ends in an image ext.
    host = urlparse(stripped).netloc.split("@")[-1].split(":")[0]
    if not host or "." not in host or _IMAGE_HOST_EXT_RE.search(host):
        raise ValueError("כתובת התמונה אינה תקינה")
    return stripped


# ---------------------------------------------------------------------------
# MEH-1626 chunk 1 — reusable domain types (Pydantic "annotated pattern").
#
# These WRAP the helpers above; they add no validation logic of their own.
# The point is to stop copy-pasting @field_validator between sibling input
# schemas, which is the mechanism that produced MEH-1623 (producer_name
# protected on the admin schema, wide open on the public one).
#
# They live here rather than beside PasswordField in schemas/password.py
# because they wrap the helpers defined above in THIS module — importing
# them from password.py would make schemas.py ↔ password.py circular.
#
# Usage: an OPTIONAL field declares `Type | None = None`. The None branch of
# the union short-circuits before the AfterValidator runs, so an omitted
# field stays None and the wrapped helper never sees it.
#
# REUSES: backend/app/schemas/password.py:31 (PasswordField — the precedent)
# ---------------------------------------------------------------------------


def _sanitized_business_name(value: str) -> str:
    """Bleach → ≥3-letter floor. Mirrors ProducerCreate._validate_name_letters
    stacked on ContactIn._sanitize_name, which is exactly what MEH-1623
    shipped for ProducerRegister.producer_name — that field's behaviour must
    stay byte-identical through this migration.

    The floor is also what makes this safe on a NOT NULL column: sanitize_text
    returns None when bleach empties the input, and _min_letters_validator
    coerces that None to "" and raises a clean ValueError (422) instead of
    letting None reach the DB as a 500 (the HOT-003 path, schemas.py:59).
    """
    return _min_letters_validator(sanitize_text(value, max_length=200))


def _sanitized_person_name(value: str) -> str:
    """Bleach only — deliberately NO letter floor.

    Hebrew given names of two letters are common and legitimate (גל, טל, בר,
    רן), so a ≥3-letter floor here would be a product regression, not a
    hardening. The only rejection is a value that sanitizes away to nothing,
    which must still raise rather than return None: users.name is NOT NULL
    (models.py:387), so a None would surface as a 500 instead of a 422.

    MEH-1626 chunk 2: this same function now also backs SanitizedLabelField
    (product / category / lead names, page titles). The rule is identical —
    bleach, reject empty, no letter floor — and a 2-letter label is as
    legitimate as a 2-letter given name ("תה"). Shared rather than copied so
    the two can never drift.
    """
    cleaned = sanitize_text(value, max_length=200)
    if cleaned is None:
        raise ValueError("שם לא יכול להיות ריק")
    return cleaned


def _sanitized_title(value: str) -> str:
    """Bleach → ≥3-letter floor. Mirrors the _sanitize_title +
    _validate_title_letters pair carried by every existing title-bearing
    Create schema (HomeProductCreate:1826, ExperienceCreate:2042,
    ProducerRecipeCreate:2218). max_length is the widest of those (300); each
    field keeps its own narrower Field(max_length=…) constraint, which runs
    first, so per-field length behaviour is unchanged.
    """
    return _min_letters_validator(sanitize_text(value, max_length=300))


def _sanitized_address(value: str) -> str | None:
    """Bleach → ≥1 alphanumeric. Mirrors ProducerRegister's
    _sanitize_address + _validate_address_alnum pair (schemas.py:394-425).
    The alnum floor rather than the letter floor is deliberate (MEH-870):
    "ת.ד. 123" and "רח' הרצל 5" are valid addresses a ≥3-letter floor would
    reject. Returns None for input that sanitizes away — every consumer of
    this type has a nullable address column.
    """
    return _min_alnum_validator(sanitize_text(value, max_length=255))


SanitizedBusinessNameField = Annotated[str, AfterValidator(_sanitized_business_name)]
SanitizedPersonNameField = Annotated[str, AfterValidator(_sanitized_person_name)]
# MEH-1626 chunk 2: a SECOND alias over the SAME validator, not a copy of it.
# The rule "bleach, reject empty, no letter floor" is identical for a person's
# name and for a short label (product name, category name, lead name, page
# title) — but the call sites read very differently, and the person-name
# rationale (two-letter Hebrew given names) must not be mistaken for a generic
# default. Two names, one implementation: nothing can drift between them.
# The floor is deliberately absent here too — "תה" is a legitimate 2-letter
# product name, so SanitizedBusinessNameField would be wrong for these.
SanitizedLabelField = Annotated[str, AfterValidator(_sanitized_person_name)]
SanitizedTitleField = Annotated[str, AfterValidator(_sanitized_title)]


def _sanitized_description(value: str) -> str | None:
    """Bleach at the 2000-char cap every long-form description in this module
    already uses (ProducerRegister:—, EventCreate, HomeProductCreate). No
    floor: a description is optional prose, and an emptied one is legitimately
    None on every column that takes this type.
    """
    return sanitize_text(value, max_length=2000)


# MEH-1626 chunk 2. Two more types, each earning its place under the
# "≥2 fields need an identical rule" bar:
#   description → ProducerCreate, ProductCreate, ProductUpdate (3)
#   url         → OutreachLeadCreate.website, OutreachLeadUpdate.website (2)
# CategoryRequestUpdate.admin_notes is a single field, so it stays an inline
# @field_validator rather than becoming a third type.
SanitizedDescriptionField = Annotated[str, AfterValidator(_sanitized_description)]
# MEH-1626 chunk 3: since item 3 made _url_scheme_validator return None for
# empty input, this type joined the address/phone group whose validator CAN
# return None — so it carries its own max_length (applied to the input, before
# the validator) rather than relying on an outer Field(max_length=…), which
# would raise "Unable to apply constraint 'max_length' to supplied value None".
# 200 is the exact cap its two consumers (OutreachLeadCreate/Update.website)
# already declared, so length behaviour is unchanged.
SanitizedUrlField = Annotated[
    str, Field(max_length=200), AfterValidator(_url_scheme_validator)
]

# The two types below carry their own max_length, unlike the three above.
# Reason: they are the only ones whose validator can legitimately RETURN None
# (empty input → None, the MEH-1537 convention). A per-field
# `Field(None, max_length=N)` on an optional domain-typed field applies its
# constraint to the validator's OUTPUT, so that None then blows up with
# "Unable to apply constraint 'max_length' to supplied value None" — a 500 on
# the ordinary act of clearing an address or phone. Declaring the cap inside
# the Annotated instead applies it to the INPUT string, before the validator
# runs, which both fixes that and preserves the existing over-length 422.
# The other three types never return None (their floors raise instead), so
# their call sites keep their own narrower Field(max_length=…) safely.
SanitizedAddressField = Annotated[
    str, Field(max_length=255), AfterValidator(_sanitized_address)
]
# MEH-1537 semantics preserved verbatim: separators stripped, digit projection
# validated, empty/whitespace → None. The 30-char cap is the widest existing
# call site; the real bound is _PHONE_DIGITS_RE (≤13 digits), which is what
# keeps every value inside the String(20) columns.
PhoneNumberField = Annotated[
    str, Field(max_length=30), AfterValidator(_phone_validator)
]

# ---------------------------------------------------------------------------
# MEH-1644: canonical delivery-day vocabulary.
#
# Canonical values are the bare Hebrew day names — existing DeliveryArea rows
# are Hebrew free text ("שישי") and DeliveryBlock renders the raw string into
# "יוצאים בימי {day}" / "ימי {day}", so the bare form (no "יום" prefix) is the
# one that composes with every consumer copy. None stays legal and means
# "בתיאום מראש" (the groupDeliveryAreas dayless bucket).
#
# Expand-only: this type is applied to the WRITE schema (DeliveryAreaCreate)
# only. DeliveryAreaOut deliberately stays unvalidated — legacy rows carry
# free-text variants ("ימי שישי", "friday", …) until the MEH-1644 backfill
# script runs, and a read model that 422s its own stored data is a 500 on
# every producer page. scripts/normalize_delivery_days.py maps the legacy
# variants to this vocabulary.
# ---------------------------------------------------------------------------
DELIVERY_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"]


def _delivery_day_validator(value: str) -> str | None:
    """Whitelist against DELIVERY_DAYS; blank → None (a select's empty option
    means "בתיאום מראש", same as an omitted field), anything else → 422."""
    cleaned = value.strip()
    if not cleaned:
        return None
    if cleaned not in DELIVERY_DAYS:
        raise ValueError("יום משלוח לא מוכר — יש לבחור יום בעברית (ראשון עד שבת)")
    return cleaned


DeliveryDayField = Annotated[str, AfterValidator(_delivery_day_validator)]


def _image_url_list_validator(value: list[str] | None) -> list[str] | None:
    # Drop blank entries, validate each surviving URL. Preserves order.
    if value is None:
        return value
    return [
        _image_url_validator(v) for v in value if v is not None and str(v).strip() != ""
    ]


def _require_categories_validator(value: list[int] | None) -> list[int]:
    """MEH-1153: every business must carry ≥1 category to appear in browsing.
    The client already gates this, but a direct API POST could omit the field
    or send `[]` and create an uncategorised producer. Paired with
    `validate_default=True` on the field so the ABSENT case (default `[]`) is
    validated too — closing both the missing-field and empty-list bypass.
    """
    if not value:
        raise ValueError("חובה לבחור לפחות קטגוריה אחת")
    return value


# MEH-1297: cap a producer's categories at 3 (Yelp model) to stop category
# stuffing. Enforced at the Pydantic layer only — existing producers may
# carry more from import, so there is no DB CHECK constraint (see migration).
MAX_PRODUCER_CATEGORIES = 3

# MEH-1577: upper bound for producers.delivery_fee / free_delivery_above.
# Both are Postgres INTEGER (max 2147483647), and without a ceiling a larger
# value clears the Pydantic layer and raises NumericValueOutOfRange at flush —
# a 500 on a path whose whole design (no DB CHECK, see migration c7e2a4b91f38)
# is to return a clean 422 instead. ₪1,000,000 is orders of magnitude above any
# real delivery fee or free-delivery threshold, so it blocks the overflow AND
# catches an extra-zero typo, while staying a product cap rather than a
# storage-limit leak. Same posture as MAX_PRODUCER_CATEGORIES above: Pydantic
# layer only, no DB CHECK.
MAX_DELIVERY_MONEY = 1_000_000


def _cap_categories_validator(value: list[int] | None) -> list[int] | None:
    """MEH-1297: reject >3 categories. `None` (field omitted on a partial
    update) passes through untouched so it composes with optional fields.
    """
    if value is not None and len(value) > MAX_PRODUCER_CATEGORIES:
        raise ValueError("ניתן לבחור עד 3 קטגוריות לבית עסק")
    return value


# --- Auth ---
class UserRegister(BaseModel):
    email: EmailStr
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
    city: str | None = None
    # MEH-1626 chunk 1: surfaced by the asymmetry scan rather than the issue's
    # list — same public signup body as `name` above, persisted at auth.py:313,
    # and it feeds the WhatsApp alert number. Left raw it is the exact MEH-1537
    # failure (a stored number no wa.me link can dial).
    phone: PhoneNumberField | None = None


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
    # MEH-1153: server-side parity with the client's ≥1-category gate.
    # validate_default=True runs _require_categories_validator on the absent
    # case (default []) too, so both "missing" and "[]" 422.
    category_ids: list[int] = Field(default_factory=list, validate_default=True)
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
    delivery_areas: list["DeliveryAreaCreate"] = []

    # MEH-1623 shipped producer_name's bleach→floor pair as two inline
    # @field_validators here; MEH-1626 chunk 1 moved that exact logic into
    # SanitizedBusinessNameField (declared on the field above) so the sibling
    # schemas can share it instead of re-copying it. Same helpers, same order,
    # same 422s — see _sanitized_business_name for the full rationale.
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

    # MEH-1537: phone format + empty→None. No whatsapp_group on this schema.
    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v):
        return _phone_validator(v)

    # MEH-1608: URL/@ → bare handle (the renderer builds the link itself).
    @field_validator("instagram")
    @classmethod
    def _normalize_instagram_handle(cls, v):
        return _normalize_instagram(v)

    @field_validator("contact_email", mode="before")
    @classmethod
    def _normalize_email(cls, v):
        return _normalize_contact_email(v)

    # MEH-1471: reject any non-null referral_source outside the allowed key set
    # (422). None / empty / whitespace-only normalise to None (nullable column;
    # existing producers + the MEH-143 upgrade path never send it). Inline import
    # mirrors the ProducerAdminOut._compute_* validators — keeps the constants
    # dependency out of the module-top imports.
    @field_validator("referral_source")
    @classmethod
    def _validate_referral_source(cls, v):
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
    def _sanitize_referral_source_other(cls, v):
        return sanitize_text(v, max_length=120)

    @field_validator("category_ids")
    @classmethod
    def _require_categories(cls, v):
        # MEH-1297: enforce the ≤3 cap alongside the MEH-1153 ≥1 requirement.
        return _cap_categories_validator(_require_categories_validator(v))


class GoogleAuthRequest(BaseModel):
    id_token: str


class AppleAuthRequest(BaseModel):
    id_token: str
    name: SanitizedPersonNameField | None = None  # Apple sends it once


# MEH-170 — Step-0 OAuth on producer signup. Same shape as Google/Apple
# auth but paired with an explicit "producer flow" discriminator so the
# router can return 409 when the user already has a producer linked
# (the UI then redirects to /login instead of silently logging in).
class ProducerOAuthSignupRequest(BaseModel):
    provider: str = Field(pattern="^(google|apple)$")
    id_token: str
    name: SanitizedPersonNameField | None = None  # Apple sends it once


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
    # MEH-1034: query-time count over producer_categories, populated only by
    # GET /admin/categories. Optional so public consumers (GET /categories,
    # ProducerOut.categories) serialize unchanged — NOT a DB column.
    producer_count: int | None = None

    model_config = {"from_attributes": True}


class ProducerCityOut(BaseModel):
    """MEH-970 — one row of GET /producers/cities: live approved-producer
    count for a single city, consumed by the /map region control."""

    city: str
    count: int


class ProducerRandomOut(BaseModel):
    """MEH-1288 — GET /producers/random: minimal identity of one random
    approved producer, just enough for the homepage "הפתיעו אותי" button to
    navigate (slug preferred, id fallback — mirrors ProducerCard's href)."""

    id: UUID
    slug: str | None = None


# --- Delivery Area ---
class DeliveryAreaCreate(BaseModel):
    city: str
    min_order: int | None = None
    # MEH-1644: whitelist (DELIVERY_DAYS) on the write path. Every row-write
    # flows through this schema — ProducerRegister.delivery_areas (auth.py
    # apple/google + producer_queries.register_producer) and
    # ProducerUpdate.delivery_areas (producer_me PUT) — so one field covers
    # them all. None allowed = "בתיאום מראש".
    delivery_day: DeliveryDayField | None = None
    # MEH-1772: per-area override of producers.delivery_fee. NULL = inherit.
    # Same three-value semantics as the producer-level field (MEH-1577):
    # None = not stated, 0 = "משלוח חינם", positive = the fee.
    delivery_fee: int | None = None

    # REUSES: backend/app/schemas/schemas.py:1604 (ProducerUpdate.
    # _validate_delivery_fee, MEH-1577) — identical bounds and identical
    # Hebrew copy, deliberately. The two live on different models (this one
    # validates a row inside a list; that one a producer field), so Pydantic
    # cannot share the validator without a mixin that would drag
    # free_delivery_above — a producer-level-only field — onto this row.
    #
    # The upper bound is not decoration: the column is Postgres INTEGER, and
    # without it a larger value passes validation and raises
    # NumericValueOutOfRange at flush — a 500, which is exactly what the
    # no-DB-CHECK design exists to avoid.
    @field_validator("delivery_fee")
    @classmethod
    def _validate_area_delivery_fee(cls, v):
        if v is None:
            return None
        # 0 is legal and load-bearing — "משלוח חינם" to this area, distinct
        # from NULL ("inherit the producer's fee"). Only negatives rejected.
        if v < 0:
            raise ValueError("עלות משלוח לא יכולה להיות שלילית")
        if v > MAX_DELIVERY_MONEY:
            raise ValueError("עלות משלוח גבוהה מדי")
        return v


class DeliveryAreaOut(BaseModel):
    id: UUID
    city: str
    min_order: int | None = None
    delivery_day: str | None = None
    # MEH-1772: emitted so the public page can render the per-area fee and
    # fall back to the producer-level one when this is NULL. The fallback is
    # resolved on the CLIENT (chunk 3), not here — serializing an already
    # coalesced value would erase the difference between "this area overrides
    # with the same number" and "this area inherits", which is the one thing
    # the "משלוח מ-X₪" variance line needs to distinguish.
    delivery_fee: int | None = None

    model_config = {"from_attributes": True}


class ProducerLocationOut(BaseModel):
    """MEH-1402 (MEH-1388 chunk 2): one physical presence point (branch /
    pickup / market_stand) serialized on `ProducerListOut.locations[]`. Read
    straight off the `ProducerLocation` ORM rows (selectinload'd in
    producer_listing.py — no N+1). Expand-phase serialization only; the
    Producer.lat/lng column stays the primary mirror (chunk-3 map UI consumes
    this array). `precision` is emitted from the ORM's `location_precision`
    column (serialization_alias) to match the epic's map contract shape.
    Street `address` is intentionally NOT exposed here — MEH-829 keeps the
    exact address admin/owner-only; the map pins on lat/lng + city and
    navigation is built from lat/lng.

    Field set: kind, label, city, lat, lng, is_primary, precision (the epic's
    locked map contract) plus `opening_hours` + `phone`. MEH-1509 (chunk-1
    backend) added the latter two so the public business page can render real
    pickup / market_stand rows — "where and when" (opening_hours) and
    click-to-call (phone) — instead of a single generic boolean line. The
    columns already existed on the ORM `ProducerLocation` (models.py; revision
    a9f4c2e7b1d3); this is serialization only, no migration. (Chunk 2 renders
    them in DeliveryBlock.) Street `address` stays OFF this public shape.
    """

    kind: str
    label: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    is_primary: bool = False
    # MEH-1509 (MEH-1388, chunk-1 backend): serialized so the business page can
    # show a pickup point's hours + phone. address stays off (MEH-829).
    opening_hours: str | None = None
    phone: str | None = None
    # Field name matches the ORM attribute (from_attributes reads it directly);
    # serialization_alias emits the epic's contract key `precision` on the wire
    # (FastAPI dumps response models with by_alias=True).
    location_precision: str = Field(default="exact", serialization_alias="precision")

    model_config = {"from_attributes": True}


# MEH-1421 (MEH-1388 chunk 4a): shared enums — same value sets as the ORM CHECK
# constraints (models.py:536) so an invalid kind/precision is a clean 422 at the
# write boundary, not an IntegrityError at commit.
_LOCATION_KIND = Literal["branch", "pickup", "market_stand"]
_LOCATION_PRECISION = Literal["exact", "approximate"]


def _optional_label_letters(value: str | None) -> str | None:
    # MEH-1421: label is optional, but a supplied label is shown in the map
    # tooltip + drives the same-city disambiguation rule, so a punctuation-only
    # or 1-2 char label is meaningless. Empty/whitespace → None (treated as "no
    # label"); a real value must clear the ≥3-letter floor.
    # REUSES: backend/app/schemas/schemas.py:17 (_min_letters_validator)
    if value is None or value.strip() == "":
        return None
    return _min_letters_validator(value)


class ProducerLocationCreate(BaseModel):
    """MEH-1421 (MEH-1388 chunk 4a): owner-supplied physical presence point —
    the write side of ProducerLocationOut (schemas.py:414). `kind`/`precision`
    are the same CHECK-constrained enums as the ORM (models.py:536). Coordinates
    are optional (an owner may add a point before she has exact lat/lng — manual
    entry, no geocoding this chunk) but bounded when supplied. `label` reuses the
    MEH-555 letters floor. The single-primary invariant + same-city-label rule
    are enforced in the service layer (producer_me.py), not here — they are
    cross-row and need the DB session.
    """

    kind: _LOCATION_KIND
    label: str | None = None
    city: str | None = Field(None, max_length=100)
    # MEH-1626 chunk 1: these two were the 🔴 public asymmetry — the same
    # address/phone pair is validated on ProducerRegister but was raw here,
    # and producer_me.py:1271 persists this shape wholesale via **model_dump().
    address: SanitizedAddressField | None = None
    lat: float | None = Field(None, ge=-90, le=90)
    lng: float | None = Field(None, ge=-180, le=180)
    opening_hours: str | None = None
    phone: PhoneNumberField | None = None
    is_primary: bool = False
    location_precision: _LOCATION_PRECISION = "exact"

    @field_validator("label")
    @classmethod
    def _validate_label(cls, v):
        return _optional_label_letters(v)


class ProducerLocationUpdate(BaseModel):
    """MEH-1421: partial update — every field optional; the endpoint applies with
    `exclude_unset=True` so an unsupplied field is left untouched (products
    precedent, producer_me.py:1109). Sending `label: ""` clears the label."""

    kind: _LOCATION_KIND | None = None
    label: str | None = None
    city: str | None = Field(None, max_length=100)
    # MEH-1626 chunk 1: parity with the Create twin above. `exclude_unset=True`
    # at producer_me.py:1291 means a supplied-but-emptied value still reaches
    # setattr, so ""→None here CLEARS the column as before (unlike ProfileUpdate,
    # whose handler gates on `is not None` — see the Phase 0 skip note in the PR).
    address: SanitizedAddressField | None = None
    lat: float | None = Field(None, ge=-90, le=90)
    lng: float | None = Field(None, ge=-180, le=180)
    opening_hours: str | None = None
    phone: PhoneNumberField | None = None
    is_primary: bool | None = None
    location_precision: _LOCATION_PRECISION | None = None

    @field_validator("label")
    @classmethod
    def _validate_label(cls, v):
        return _optional_label_letters(v)


class ProducerLocationOwnerOut(BaseModel):
    """MEH-1421: owner-facing read of her OWN location rows. Unlike the public
    ProducerLocationOut (schemas.py:414, which withholds street `address` per
    MEH-829 and trims to the map contract), the owner sees the full editable row
    (address / opening_hours / phone) in the dashboard editor. Emits the raw
    `location_precision` key (no `precision` alias) so the editor round-trips the
    same field name it POSTs. Returned by the /producers/me/locations CRUD."""

    id: UUID
    kind: str
    label: str | None = None
    city: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    opening_hours: str | None = None
    phone: str | None = None
    is_primary: bool = False
    location_precision: str = "exact"

    model_config = {"from_attributes": True}


# --- Producer offers (MEH-1823 chunk 2) ---
# Closed vocabularies, mirrored from the DB CHECKs on producer_offers
# (models.py `ProducerOffer.__table_args__`, revision b6e1d94a3f27). Kept as
# module constants so the router, the tests and the 422 message all read the
# same list — a second hand-written copy is how MEH-272 happened.
OFFER_TYPES = ("free_delivery_above", "gift_above", "first_order", "pickup_discount")
THRESHOLD_UNITS = ("ils", "units", "liters", "kg")
MAX_OFFER_HEADLINE = 60

# MEH-1823: Emoji LOCK on the owner-supplied headline. Ranges mirror
# routers/alerts.py:376-383, including the MEH-1373 lesson — ZWJ and VS16 are
# written as explicit \u escapes, never as invisible literals in the class,
# because copy-paste / linters / merges silently drop or duplicate those.
# Unanchored (the alerts one is `^`-anchored): an emoji anywhere in a headline
# is rejected, not stripped, so the owner sees a 422 and fixes her own copy
# rather than having it silently altered.
_ZWJ = "\u200d"  # zero-width joiner
_VS16 = "\ufe0f"  # variation selector-16 (emoji presentation)
_EMOJI_ANYWHERE = re.compile(
    "[" + _ZWJ + _VS16 + "\U0001f300-\U0001faff"
    "\U00002600-\U000027bf"
    "\U0001f1e6-\U0001f1ff"
    "]"
)


class ProducerOfferCreate(BaseModel):
    """MEH-1823: the owner's declaration of her single active offer.

    Validation mirrors the five DB CHECKs rather than replacing them — the
    CHECKs guard direct-SQL paths (seed / import / psql), this layer turns the
    same violations into a 422 with a Hebrew message instead of a 500 from a
    constraint violation. Two rules exist ONLY here because they are not
    expressible as a CHECK against a moving "today": the future-expiry rule and
    the headline rules.

    **The threshold pair is optional for EVERY offer_type and is deliberately
    NOT gated by type** (Sapir, 02/08). "10% off pickup over ₪100" and "first
    order over ₪150" are both real offers, so which types may carry a threshold
    is a product question, not a validation one. Do not add a type-conditional
    branch here — see the note on ProducerOffer in models.py.
    """

    offer_type: str
    threshold_value: int | None = None
    threshold_unit: str | None = None
    headline: str | None = None
    starts_at: date | None = None
    expires_at: date
    is_active: bool = True

    @field_validator("offer_type")
    @classmethod
    def _validate_offer_type(cls, v):
        if v not in OFFER_TYPES:
            raise ValueError(f"סוג הטבה חייב להיות אחד מ: {', '.join(OFFER_TYPES)}")
        return v

    @field_validator("threshold_unit")
    @classmethod
    def _validate_threshold_unit(cls, v):
        if v is not None and v not in THRESHOLD_UNITS:
            raise ValueError(
                f"יחידת המידה חייבת להיות אחת מ: {', '.join(THRESHOLD_UNITS)}"
            )
        return v

    @field_validator("threshold_value")
    @classmethod
    def _validate_threshold_value(cls, v):
        # `is not None`, never truthiness: 0 must reach this check and be
        # rejected explicitly, not slip through as "absent".
        if v is not None and v <= 0:
            raise ValueError("הסכום או הכמות חייבים להיות גדולים מאפס")
        return v

    @field_validator("headline")
    @classmethod
    def _validate_headline(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not v:
            return None
        if len(v) > MAX_OFFER_HEADLINE:
            raise ValueError(f"כותרת ההטבה מוגבלת ל-{MAX_OFFER_HEADLINE} תווים")
        if _EMOJI_ANYWHERE.search(v):
            raise ValueError("אין להשתמש באימוג'י בכותרת ההטבה")
        return v

    @model_validator(mode="after")
    def _validate_offer_shape(self):
        # Both-or-neither, same equality form as the DB CHECK.
        if (self.threshold_value is None) != (self.threshold_unit is None):
            raise ValueError(
                "הסכום או הכמות ויחידת המידה נקבעים יחד — או שניהם או אף אחד"
            )
        # Israel-tz "today", not server UTC — the MEH-1543 / _validate_vacation_until
        # precedent, so an owner in Israel isn't blocked on a date still valid
        # locally. `<` and not `<=`: an offer expiring today is still live today.
        if self.expires_at < israel_today():
            # The message states the rule the line above actually enforces.
            # "חייב להיות עתידי" described a stricter rule than the code has —
            # today is accepted — so an owner who entered a past date was told
            # today would fail too. Wording per the PR review.
            raise ValueError("תאריך הסיום חייב להיות היום או מאוחר יותר")
        if self.starts_at is not None and self.expires_at <= self.starts_at:
            raise ValueError("תאריך הסיום חייב להיות אחרי תאריך ההתחלה")
        return self


class ProducerOfferOut(BaseModel):
    """Public read of an active, unexpired offer. The server never emits an
    expired one (producer_listing / producers.py filter on expires_at), so a
    consumer holding this object can render it without re-checking the date."""

    id: UUID
    offer_type: str
    threshold_value: int | None = None
    threshold_unit: str | None = None
    headline: str | None = None
    starts_at: date | None = None
    expires_at: date

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
    name: SanitizedLabelField
    description: SanitizedDescriptionField | None = None
    price_range: str | None = None  # legacy: removal tracked in MEH-295 follow-up
    image_url: str | None = Field(None, max_length=500)
    price_min: Decimal = Field(..., ge=Decimal("1"), le=Decimal("10000"))
    price_max: Decimal | None = Field(None, ge=Decimal("1"), le=Decimal("10000"))
    # MEH-293: per-product dietary flags (moved from producer level).
    is_gluten_free: bool = False
    is_vegan: bool = False
    # MEH-1438: vegetarian axis. Owner marks it independently; the public
    # ?vegetarian filter also matches vegan products (is_vegetarian OR is_vegan).
    is_vegetarian: bool = False
    is_lactose_free: bool = False

    @field_validator("image_url", mode="before")
    @classmethod
    def empty_str_to_none(cls, v):
        return None if v == "" else v

    # MEH-1222: reject malformed image URLs at the write boundary.
    @field_validator("image_url")
    @classmethod
    def _validate_image_url(cls, v):
        return _image_url_validator(v)

    @model_validator(mode="after")
    def check_price_max_gte_min(self):
        if self.price_max is not None and self.price_max < self.price_min:
            raise ValueError("price_max must be greater than or equal to price_min")
        return self


class ProductUpdate(BaseModel):
    name: SanitizedLabelField | None = None
    description: SanitizedDescriptionField | None = None
    price_range: str | None = None  # legacy: removal tracked in MEH-295 follow-up
    image_url: str | None = Field(None, max_length=500)
    price_min: Decimal | None = Field(None, ge=Decimal("1"), le=Decimal("10000"))
    price_max: Decimal | None = Field(None, ge=Decimal("1"), le=Decimal("10000"))
    # MEH-293: per-product dietary flags. Optional on update — exclude_unset
    # in producer_me.update_my_product means an unsupplied field stays put.
    is_gluten_free: bool | None = None
    is_vegan: bool | None = None
    is_vegetarian: bool | None = None  # MEH-1438
    is_lactose_free: bool | None = None

    @field_validator("image_url", mode="before")
    @classmethod
    def empty_str_to_none(cls, v):
        return None if v == "" else v

    # MEH-1222: reject malformed image URLs at the write boundary.
    @field_validator("image_url")
    @classmethod
    def _validate_image_url(cls, v):
        return _image_url_validator(v)

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
    is_vegetarian: bool = False  # MEH-1438
    is_lactose_free: bool = False

    model_config = {"from_attributes": True}


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
    # MEH-1153: same ≥1-category server-side parity as ProducerRegister.
    category_ids: list[int] = Field(default_factory=list, validate_default=True)
    # MEH-530: see ProducerRegister for the validation rationale.
    producer_license_number: str | None = Field(default=None, max_length=20)
    delivery_areas: list[DeliveryAreaCreate] = []

    # MEH-296 3d: http(s) scheme guard on the URL fields (reuse Chunk-2 helper).
    @field_validator("website", "facebook", "external_order_form")
    @classmethod
    def _validate_contact_urls(cls, v):
        return _url_scheme_validator(v)

    # MEH-1537: phone format (no contact_email / whatsapp_group on this schema).
    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v):
        return _phone_validator(v)

    # MEH-1608: URL/@ → bare handle (the renderer builds the link itself).
    @field_validator("instagram")
    @classmethod
    def _normalize_instagram_handle(cls, v):
        return _normalize_instagram(v)

    @field_validator("category_ids")
    @classmethod
    def _require_categories(cls, v):
        # MEH-1297: enforce the ≤3 cap alongside the MEH-1153 ≥1 requirement.
        return _cap_categories_validator(_require_categories_validator(v))


class ProducerAdminCreate(BaseModel):
    """Used by admin form — pre-approved, supports all extended fields."""

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
    images: list[str] = []
    category_ids: list[int] = []
    delivery_area_cities: list[str] = []  # simple comma-split list
    # MEH-213 — location mode
    has_physical_location: bool = True
    offers_delivery: bool = False
    delivery_nationwide: bool = False
    delivery_cities: list[str] = []
    # MEH-1255: nationwide exclusion list ("לכל הארץ חוץ מ:") — only legal
    # with delivery_nationwide=true (validator below + DB CHECK
    # delivery_excluded_requires_nationwide).
    delivery_excluded_cities: list[str] = []

    # MEH-1297: cap categories at 3 (admin create).
    @field_validator("category_ids")
    @classmethod
    def _cap_categories(cls, v):
        return _cap_categories_validator(v)

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

    # MEH-1537: phone / whatsapp_group format + contact_email empty→None.
    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v):
        return _phone_validator(v)

    @field_validator("whatsapp_group")
    @classmethod
    def _validate_whatsapp_group(cls, v):
        return _whatsapp_group_validator(v)

    # MEH-1608: URL/@ → bare handle (the renderer builds the link itself).
    @field_validator("instagram")
    @classmethod
    def _normalize_instagram_handle(cls, v):
        return _normalize_instagram(v)

    @field_validator("contact_email", mode="before")
    @classmethod
    def _normalize_email(cls, v):
        return _normalize_contact_email(v)

    # MEH-1222: reject malformed image URLs in the producer photo array.
    @field_validator("images")
    @classmethod
    def _validate_images(cls, v):
        return _image_url_list_validator(v)

    @model_validator(mode="after")
    def _validate_location_mode(self):
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
    starting_price_label: str | None = None
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
    # MEH-1644: structured rows from the dashboard DeliveryCard — carries the
    # whitelist-validated delivery_day per city (DeliveryAreaCreate). Takes
    # precedence over delivery_area_cities in producer_me when both are sent.
    delivery_areas: list[DeliveryAreaCreate] | None = None
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
    delivery_cities: list[str] | None = None
    # MEH-1255: nationwide exclusion list. Schema validator catches the
    # explicit nationwide=false + excluded case; the routers guard the
    # EFFECTIVE state on partial updates (excluded sent while the stored
    # delivery_nationwide is false) so the DB CHECK never 500s.
    delivery_excluded_cities: list[str] | None = None
    # MEH-210 Phase 2 — custom WhatsApp question chips
    custom_questions: list[str] | None = None
    # MEH-89 — admin-settable availability (mirrors producer_me endpoint)
    availability_status: str | None = None
    # MEH-291 — 4-value enum that supersedes availability_status + is_available_today.
    # During the 7-day overlap both fields are accepted and writes mirror to old columns.
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
    order_window: dict | None = None
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
    def _cap_categories(cls, v):
        return _cap_categories_validator(v)

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

    # MEH-1490: normalize the Google Place ID. Blank → None (admin clears the
    # mapping). URL-safe charset only ([A-Za-z0-9_-]) — a place_id is exactly
    # that, so a pasted Maps URL (contains "/", ":", ".") is rejected with a
    # clear Hebrew error instead of being stored and silently 204-ing forever.
    @field_validator("google_place_id")
    @classmethod
    def _validate_google_place_id(cls, v):
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

    # MEH-1335: owner bio — strip HTML + cap at 300 (spec: "כמה מילים עלייך",
    # dashboard textarea counter matches this server-side cap).
    @field_validator("owner_bio")
    @classmethod
    def _sanitize_owner_bio(cls, v):
        return sanitize_text(v, max_length=300)

    # MEH-1335: owner photo — image-URL guard, not just scheme (MEH-1222 class).
    @field_validator("owner_photo_url")
    @classmethod
    def _validate_owner_photo_url(cls, v):
        return _image_url_validator(v)

    @field_validator("availability_status")
    @classmethod
    def _validate_availability_status(cls, v):
        allowed = {"available", "full", "vacation"}
        if v is not None and v not in allowed:
            raise ValueError(
                f"availability_status חייב להיות אחד מ: {', '.join(sorted(allowed))}"
            )
        return v

    # MEH-1508 ch2: the validation debt from chunk 1 — VARCHAR has no enum type,
    # so the app is the only guard. These run ONLY on an explicitly-provided value
    # (Pydantic v2 validate_default=False), so an omitted field is untouched; an
    # explicit null is rejected because the columns are NOT NULL and a null write
    # would 500 on the constraint.
    @field_validator("vegan_scope", "vegetarian_scope")
    @classmethod
    def _validate_dietary_scope(cls, v):
        allowed = {"unknown", "some", "all"}
        if v not in allowed:
            raise ValueError(f"scope חייב להיות אחד מ: {', '.join(sorted(allowed))}")
        return v

    @field_validator("gluten_free_facility", "lactose_free_facility")
    @classmethod
    def _validate_facility_scope(cls, v):
        allowed = {"unknown", "shared", "dedicated"}
        if v not in allowed:
            raise ValueError(f"מתקן חייב להיות אחד מ: {', '.join(sorted(allowed))}")
        return v

    @field_validator("availability_state")
    @classmethod
    def _validate_availability_state(cls, v):
        if v is not None and v not in AVAILABILITY_STATES:
            raise ValueError(
                f"availability_state חייב להיות אחד מ: {', '.join(AVAILABILITY_STATES)}"
            )
        return v

    @field_validator("order_window")
    @classmethod
    def _validate_order_window(cls, v):
        return _order_window_validator(v)

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

    # MEH-1537: phone / whatsapp_group format + contact_email empty→None. This
    # schema backs BOTH the owner PUT /producers/me and the admin PUT (admin.py
    # bulk setattr), so validating here covers both write paths at once.
    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v):
        return _phone_validator(v)

    @field_validator("whatsapp_group")
    @classmethod
    def _validate_whatsapp_group(cls, v):
        return _whatsapp_group_validator(v)

    # MEH-1608: URL/@ → bare handle (the renderer builds the link itself).
    @field_validator("instagram")
    @classmethod
    def _normalize_instagram_handle(cls, v):
        return _normalize_instagram(v)

    @field_validator("contact_email", mode="before")
    @classmethod
    def _normalize_email(cls, v):
        return _normalize_contact_email(v)

    # MEH-1222: reject malformed image URLs in the producer photo array.
    @field_validator("images")
    @classmethod
    def _validate_images(cls, v):
        return _image_url_list_validator(v)

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

    # MEH-1541: founding-year range guard. Runs ONLY on an explicitly-provided
    # value (an omitted field is dropped by exclude_unset, never validated); an
    # explicit null clears the column (nullable). Upper bound is Israel-tz
    # "today" year so an owner near new-year isn't blocked on a valid current
    # year. Out-of-range → 422 with the single Hebrew detail the spec locks.
    @field_validator("established_year")
    @classmethod
    def _validate_established_year(cls, v):
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
    def _validate_delivery_fee(cls, v):
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
    def _validate_free_delivery_above(cls, v):
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
    # MEH-766 ch5: is_verified removed from the public contract — the tier
    # surface is verification_tier/verified_at (ADR-022). Column drops in ch6.
    plan: str = "free"
    slug: str | None = None
    top_product_name: str | None = None
    starting_price_label: str | None = None
    price_range: str | None = None
    grass_fed: bool = False
    organic_certified: bool = False
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
    # relationship with no N+1. Empty for producers with no location rows yet
    # (Expand overlap — Producer.lat/lng still drives their single map pin).
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
    order_window: dict | None = None
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
    # MEH-986 ch3b: free-text kosher re-declared here — it was removed from the
    # public ProducerListOut but stays admin-internal (the admin table + form).
    kosher: str | None = None
    producer_license_number: str | None = None
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
    # MEH-1025 Chunk A: the owner sees her OWN completion-request trail so the
    # dashboard can render the "נשאר להשלים" banner (Chunk B). Same owner-private
    # pattern as kosher/license/address above. Columns exist since MEH-1011
    # (migration a1b2c3d4e5f6) — Pydantic-only exposure, no migration. Contrast
    # risk_score/risk_reasoning + declared_at, which stay admin-only on
    # ProducerAdminOut (the producer must never see her own risk score).
    # REUSES: schemas.py:913-914 (ProducerAdminOut declarations).
    requested_changes: str | None = None
    changes_requested_at: datetime | None = None


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


# --- MEH-1673: kashrut expiry reminders (admin-triggered, dry-run first) ---
class KashrutExpiryReminderRow(BaseModel):
    """One business inside the 30-day expiry window.

    `phone_masked` is deliberately the ONLY phone field: the admin needs
    enough to recognise the number, not the number itself. The full value
    never leaves the backend (mask via `app.utils.pii.mask_phone`).
    """

    producer_id: UUID
    name: str
    phone_masked: str
    expires_at: datetime
    sent: bool | None = None
    error: str | None = None


class KashrutExpiryReminderOut(BaseModel):
    dry_run: bool
    window_days: int
    total: int
    sent_count: int = 0
    failed_count: int = 0
    rows: list[KashrutExpiryReminderRow] = []


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


class RequestChangesIn(BaseModel):
    """MEH-1011: admin "request-changes" payload for a pending producer.

    REUSES: schemas.py:1499 ProducerRecipeModerationAction — single optional
    `feedback` field. Unlike recipes (where empty feedback is only rejected in
    the handler), here the feedback is emailed to the producer verbatim, so the
    handler rejects empty/whitespace-only with a 400 (admin_recipes.py:123).
    """

    feedback: str | None = Field(None, max_length=2000)


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
    phone: PhoneNumberField | None = None
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

    # MEH-1222: reject malformed image URLs (public neighbor-product form).
    @field_validator("photo")
    @classmethod
    def _validate_photo(cls, v):
        return _image_url_validator(v)

    @field_validator("images")
    @classmethod
    def _validate_images(cls, v):
        return _image_url_list_validator(v)


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
    phone: PhoneNumberField | None = None
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

    # MEH-1222: reject malformed image URLs (public neighbor-product form).
    @field_validator("photo")
    @classmethod
    def _validate_photo(cls, v):
        return _image_url_validator(v)

    @field_validator("images")
    @classmethod
    def _validate_images(cls, v):
        return _image_url_list_validator(v)


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


# MEH-1443: "מצאתן טעות בפרטים?" — email-only producer-info report (v1, no
# persistence). `producer_slug` is the identifier the producer page used
# (custom slug OR the UUID path for producers without a slug); the router
# resolves either. `message` is stripped and re-checked so a whitespace-only
# body 422s (Field's min_length runs before strip).
class ProducerInfoReportCreate(BaseModel):
    producer_slug: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1, max_length=1000)
    reporter_email: EmailStr | None = None

    @field_validator("message")
    @classmethod
    def _message_not_blank(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("message must not be empty")
        return stripped


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

    # MEH-1222: reject malformed image URLs at the write boundary.
    @field_validator("image_url")
    @classmethod
    def _validate_image_url(cls, v):
        return _image_url_validator(v)


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
    is_active: bool | None = None  # MEH-1419: reversible cancel — mirrors EventUpdate

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

    # MEH-1222: reject malformed image URLs at the write boundary.
    @field_validator("image_url")
    @classmethod
    def _validate_image_url(cls, v):
        return _image_url_validator(v)


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
    is_active: bool = True  # MEH-1419: reversible cancel — mirrors EventOut.is_active
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

    # MEH-1222: reject malformed image URLs at the write boundary
    # (inherited by ProducerRecipeCreate).
    @field_validator("image_url")
    @classmethod
    def _validate_image_url(cls, v):
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

    # MEH-1222: reject malformed image URLs at the write boundary.
    @field_validator("image_url")
    @classmethod
    def _validate_image_url(cls, v):
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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OutreachLeadCreate(BaseModel):
    name: SanitizedLabelField = Field(..., min_length=1, max_length=200)
    phone: PhoneNumberField | None = None
    instagram: str | None = Field(None, max_length=100)
    website: SanitizedUrlField | None = None
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
    def _normalize_instagram_handle(cls, v):
        return _normalize_instagram(v)


class OutreachLeadUpdate(BaseModel):
    """PATCH body — any subset of fields may be omitted. Status is
    enum-validated at the route layer."""

    name: SanitizedLabelField | None = None
    phone: PhoneNumberField | None = None
    instagram: str | None = None
    website: SanitizedUrlField | None = None
    city: str | None = None
    category: str | None = None
    notes: str | None = None
    status: str | None = None

    # MEH-1616: see OutreachLeadCreate above — PATCH writes the same column.
    @field_validator("instagram")
    @classmethod
    def _normalize_instagram_handle(cls, v):
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


# --- MEH-52 Group Buys ---
class GroupBuyCommitOut(BaseModel):
    id: UUID
    group_buy_id: UUID
    user_id: UUID
    quantity: int
    # MEH-1651: `phone` removed. The column is no longer written (Expand-
    # Contract — the DROP is post-launch, Sapir-only), so exposing it here
    # would strand a permanently-NULL field in the API contract.
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
    fulfillment_note: str | None = None
    status: str
    commits_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class GroupBuyDetail(GroupBuyOut):
    """Full detail — includes whether the current user has committed."""

    user_committed: bool = False
    user_commit: GroupBuyCommitOut | None = None


class GroupBuyCreate(BaseModel):
    # MEH-1626 chunk 1: title carried only a length constraint — no bleach, no
    # letter floor — while sibling Create schemas (HomeProduct/Experience/Recipe)
    # all carry both. group_buys.py:202-203 persists both fields verbatim.
    title: SanitizedTitleField = Field(..., min_length=2, max_length=200)
    description: str | None = None
    # MEH-1626 chunk 3: surfaced by the family-based guard, NOT by the
    # asymmetry scan — both siblings were equally unvalidated, so the pair
    # looked symmetric and was invisible to a comparison-based check.
    product_name: SanitizedLabelField = Field(..., min_length=1, max_length=200)
    unit: str | None = Field(None, max_length=50)
    price_per_unit_regular: Decimal = Field(..., gt=0)
    price_per_unit_group: Decimal = Field(..., gt=0)
    min_participants: int = Field(..., ge=2)
    max_participants: int | None = Field(None, ge=2)
    deadline: datetime
    city: str | None = Field(None, max_length=100)
    # MEH-1457: optional free-text "מתי ואיך מקבלים" (OFN "Ready for").
    fulfillment_note: str | None = Field(None, max_length=1000)

    # MEH-1626 chunk 1: description gets the same bleach every other
    # description field in this module has (EventCreate:2528, HomeProductCreate,
    # ProducerRegister). Left as a plain validator rather than a 6th domain type
    # — the over-engineering guard caps this chunk at 5 types, and description
    # differs only by max_length across schemas.
    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v):
        return sanitize_text(v, max_length=2000)

    @field_validator("deadline")
    @classmethod
    def _normalize_deadline_to_naive_utc(cls, v: datetime) -> datetime:
        # MEH-1454: the dashboard form sends `new Date(...).toISOString()` — an
        # aware ISO string with a trailing 'Z'. The DB column and every
        # `datetime.utcnow()` comparison in group_buys.py are naive UTC, so an
        # aware value made `data.deadline <= datetime.utcnow()` raise
        # `TypeError: can't compare offset-naive and offset-aware datetimes`
        # → 500 on real creates. Normalize aware → naive UTC at the boundary so
        # DB storage and comparisons stay in one (naive-UTC) world.
        if v.tzinfo is not None:
            v = v.astimezone(timezone.utc).replace(tzinfo=None)
        return v


class GroupBuyCommitRequest(BaseModel):
    quantity: int = Field(1, ge=1, le=100)
    # MEH-1651: `phone` removed. MEH-1626 chunk 1 had added a PhoneNumberField
    # validator here on the premise that the number was "used to contact the
    # participant" — it never was: nothing in the repo ever read the column.
    # MEH-1626's intent (no silently broken WhatsApp link) is served better by
    # not collecting the number than by validating one nobody dials. Amendment
    # 13 also bars collecting a field that serves no purpose.


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

    # MEH-1626 chunk 2: parity with ProducerAdminCreate._sanitize_admin_notes
    # (schemas.py:1077), which already bleaches the same column on the sibling
    # write path. Persisted at category_requests.py:118. Inline rather than a
    # domain type — it is the only field needing this exact rule.
    @field_validator("admin_notes")
    @classmethod
    def _sanitize_admin_notes(cls, v):
        return sanitize_text(v, max_length=1000)


# --- Event ---
# MEH-458: relocated from routers/events.py per ADR-006 R1.
# Pure relocation — fields, validators, model_config preserved verbatim.
class EventCreate(BaseModel):
    # MEH-1626 chunk 1: the exact asymmetry the audit flagged — `description`
    # below was bleached, `title` (the more visible field) was not.
    title: SanitizedTitleField = Field(..., min_length=1, max_length=300)
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

    # MEH-1222: reject malformed image URLs at the write boundary.
    @field_validator("image_url")
    @classmethod
    def _validate_image_url(cls, v):
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
    def _validate_registration_url(cls, v):
        return _url_scheme_validator(v)


class EventUpdate(BaseModel):
    # MEH-1626 chunk 1: parity with the Create twin. Optional, so an omitted
    # title stays None via the union's None branch and never reaches the
    # validator.
    title: SanitizedTitleField | None = None
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

    # MEH-1222: reject malformed image URLs at the write boundary.
    @field_validator("image_url")
    @classmethod
    def _validate_image_url(cls, v):
        return _image_url_validator(v)

    # MEH-1811: parity with the Create twin — an event created clean could
    # otherwise be poisoned on the edit path, which is the same gap the
    # MEH-1626 chunk-1 note above describes for `title`. See EventCreate.
    @field_validator("registration_url")
    @classmethod
    def _validate_registration_url(cls, v):
        return _url_scheme_validator(v)


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


class ReviewReplyUpdate(BaseModel):
    """MEH-1039: business-owner reply to a customer review. An empty/blank
    `reply` clears the existing reply; a non-empty reply is 2-1000 chars with
    ≥3 letters (MEH-555) after sanitize."""

    reply: str = Field(..., max_length=1000)

    @field_validator("reply")
    @classmethod
    def _validate_reply(cls, v):
        v = sanitize_text(v, max_length=1000)
        stripped = (v or "").strip()
        if not stripped:
            return ""  # empty → clear the reply
        if len(stripped) < 2:
            raise ValueError("התגובה חייבת להכיל לפחות 2 תווים")
        # MEH-555: reject punctuation-only ("???") — require ≥3 letters.
        return _min_letters_validator(stripped, min_count=3)


class ReviewOut(BaseModel):
    id: UUID
    producer_id: UUID
    user_id: UUID
    user_name: str | None = None
    stars: int
    body: str | None = None
    created_at: str
    # MEH-1039: business-owner reply (owner-only PUT /reviews/{id}/reply).
    reply: str | None = None
    reply_at: str | None = None

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
    name: SanitizedLabelField
    emoji: str | None = None


# Admin: Static Pages
class StaticPageOut(BaseModel):
    slug: str
    title: str
    body: str
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class StaticPageUpdate(BaseModel):
    title: SanitizedLabelField
    body: str


# --- Users (users_me.py) ---
# MEH-460 Pkg 2: relocated from routers/users_me.py per ADR-006 R1.
# Pure relocation — fields preserved verbatim. Validators (verify_password,
# validate_password) stay in the change_password handler, not the schema.
class ProfileUpdate(BaseModel):
    """PATCH body — any subset of fields may be omitted."""

    # MEH-1626 chunk 2: the two Chunk-1 SKIPs, now migrated together with the
    # users_me.py gate that made them unsafe on their own. Keeping the outer
    # Field constraints is safe for `name` (its validator raises rather than
    # returning None) but NOT for `phone`, whose ""→None output would trip
    # "Unable to apply constraint 'max_length' to supplied value None" — the
    # same trap Chunk 1 hit and documented on the type itself.
    name: SanitizedPersonNameField | None = Field(None, min_length=1, max_length=200)
    email: EmailStr | None = None
    avatar_url: str | None = None
    city: str | None = Field(None, max_length=100)
    # MEH-1190: phone is the only UI path for OAuth users (who never pass
    # through UserRegister) to add a WhatsApp-alert number. Column already
    # exists (models.py:55, String(20)); no migration.
    phone: PhoneNumberField | None = None


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
    # MEH-1173: structured input replaces the free-text {source} + Instagram
    # scrape. `sells` is the one field the "צרו תיאור" button gates on
    # (required); the rest are optional context. `instagram` is inspiration
    # only — the scrape path is deleted (services/bio_generator.py).
    sells: str = Field(..., min_length=1, max_length=200)
    area: str | None = Field(default=None, max_length=200)
    special: str | None = Field(default=None, max_length=200)
    instagram: str | None = Field(default=None, max_length=200)


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
    # MEH-1361: new_recipe alert type; defaults mirror the sibling flags.
    notify_new_recipe: bool = True
    whatsapp_opt_in: bool = False
    push_subscription: dict | None = None


class AlertPrefsOut(BaseModel):
    enabled: bool
    notify_new_product: bool
    notify_new_event: bool
    notify_delivery_area: bool
    notify_new_recipe: bool
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


# MEH-1330: the unsubscribe link carries a stateless signed token (the
# subscriber's email in a scoped JWT) — no DB column, no raw email in the URL.
class NewsletterUnsubscribeIn(BaseModel):
    token: str = Field(..., min_length=1)


# MEH-1113: contact-form topic whitelist → Hebrew label. Single source of
# truth for both the ContactIn validator (keys = allowed values) and the
# router's label mapping (marketing.py imports this) — avoids the two-parallel-
# mechanisms drift (workflow Smell #1). No DB column: topic is prepended to the
# stored message + the email subject. "general" is the missing/None default.
CONTACT_TOPIC_LABELS = {
    "business": "פנייה של בית עסק",
    "general": "שאלה כללית",
    "correction": "תיקון מידע באתר",
    "other": "אחר",
}


class ContactIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    message: str = Field(..., min_length=1, max_length=5000)
    # MEH-1113: optional whitelisted topic. None → treated as "general".
    topic: str | None = None

    @field_validator("name")
    @classmethod
    def _sanitize_name(cls, v):
        return sanitize_text(v, max_length=200)

    @field_validator("message")
    @classmethod
    def _sanitize_message(cls, v):
        return sanitize_text(v, max_length=5000)

    @field_validator("topic")
    @classmethod
    def _validate_topic(cls, v):
        if v is None:
            return v
        v = v.strip()
        if v not in CONTACT_TOPIC_LABELS:
            raise ValueError("נושא הפנייה אינו תקין")
        return v


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
