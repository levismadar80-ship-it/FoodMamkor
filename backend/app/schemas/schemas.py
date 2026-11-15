import re
from datetime import date, timedelta
from typing import Annotated, Any, cast
from urllib.parse import urlparse

from pydantic import (
    AfterValidator,
    Field,
)

from app.services.sanitization import sanitize_text
from app.utils.clock import israel_today

# MEH-2236: the letter class behind MEH-555's "at least 3 letter characters"
# floor. Hebrew + Latin + **Arabic letters**. Arabic was added because MEH-2020
# ruled Arabic legal in a public slug ("an Arabic-speaking business in Israel is
# an ordinary case") while this class still refused the business *name* one
# layer earlier, so the ruling admitted a slug no business could ever reach:
# "مزرعة الشمس" counted 0 letters and died in request validation with a 422.
#
# The Arabic sub-ranges, NOT the whole \u0600-\u06ff block. The block carries
# the comma, semicolon, question mark and tatweel, and a name made only of
# those is exactly the "???" case MEH-555 exists to reject. Harakat
# (\u064b-\u0652) are excluded for the same reason Hebrew niqqud is: a
# diacritic decorating two letters must not manufacture a third.
#
# Two code points are carved OUT of the letter ranges, and they are the only
# two: \u0640 TATWEEL (Lm — the kashida elongation glyph, which the ruling
# names explicitly as punctuation) and \u0670 SUPERSCRIPT ALEF (Mn — a
# combining mark despite its name). A scan of all 144 code points in the
# ruled ranges found no others outside Lo/Ll/Lu. Without the carve-out
# "ــــ" would clear a floor whose whole purpose is to reject "???".
#
# Arabic-Indic digits are deliberately absent here and present in _ALNUM_REGEX
# below: the two classes are split by role, not copied. This one counts
# letters, so "١٢٣" must fail it exactly as "12345" does.
_LETTER_REGEX = re.compile(
    r"[^\u05d0-\u05eaa-zA-Z\u0621-\u063f\u0641-\u064a\u066e-\u066f\u0671-\u06d3]"
)

# MEH-1543: weekly order-acceptance window validation. Keys are a subset of
# these 7 English day names (stable storage keys; Hebrew labels rendered
# client-side); a day absent = orders closed that day. Each present day carries
# {"open": "HH:MM", "close": "HH:MM"} in zero-padded 24h, close strictly after
# open. String comparison of two zero-padded HH:MM values is a valid time order.
_ORDER_WINDOW_DAYS = frozenset(
    {"sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"}
)
_HHMM_REGEX = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


# MEH-1869: a day may carry several disjoint ranges (morning + evening, the
# Israeli lunch-break and Friday/Saturday-night patterns). Capped so the editor stays a
# form rather than a scheduler.
_MAX_ORDER_RANGES_PER_DAY = 3


def _validate_order_day(day: str, hours: Any) -> list[dict[str, str]]:
    """Validate ONE day's ranges and return them normalised.

    Split out of `_order_window_validator` so that function stays under the
    C901 complexity ceiling (it hit 12 > 10 once split ranges landed) — and
    because "is this one day well-formed?" is a separable question from "is
    this a well-formed week?".

    Accepts the legacy single-dict shape and returns a one-element list.
    """
    # Legacy single dict → one-element list. Done before any other check so
    # both shapes take exactly one validation path.
    ranges = [hours] if isinstance(hours, dict) else hours
    if not isinstance(ranges, list) or not ranges:
        raise ValueError(f"היום {day} חייב לכלול לפחות טווח אחד")
    if len(ranges) > _MAX_ORDER_RANGES_PER_DAY:
        raise ValueError(
            f"אפשר להגדיר עד {_MAX_ORDER_RANGES_PER_DAY} טווחים ביום {day}"
        )

    day_ranges: list[dict[str, str]] = []
    prev_close: str | None = None
    for entry in ranges:
        if not isinstance(entry, dict) or "open" not in entry or "close" not in entry:
            raise ValueError(f"היום {day} חייב לכלול שעת פתיחה ושעת סגירה")
        open_t, close_t = entry["open"], entry["close"]
        if not (isinstance(open_t, str) and _HHMM_REGEX.match(open_t)) or not (
            isinstance(close_t, str) and _HHMM_REGEX.match(close_t)
        ):
            raise ValueError(
                f"שעה לא תקינה ליום {day} — הפורמט חייב להיות HH:MM (24 שעות)"
            )
        if close_t <= open_t:
            raise ValueError(f"שעת הסגירה חייבת להיות אחרי שעת הפתיחה ביום {day}")
        # One comparison covers BOTH ordering and overlap: a later range that
        # starts before the previous one ended is either out of order or
        # overlapping, and neither is representable. Adjacency
        # (next.open == prev.close) is allowed.
        if prev_close is not None and open_t < prev_close:
            raise ValueError(
                f"הטווחים ביום {day} חייבים להיות ממוינים לפי השעה ובלי חפיפה"
            )
        prev_close = close_t
        day_ranges.append({"open": open_t, "close": close_t})
    return day_ranges


# MEH-3035: how a business takes payment. Fixed lists (Google / Booking
# pattern — one wording for every business, translatable, filterable later)
# plus one optional free line. Order here IS the display order.
# DO NOT reorder or rename a value without a JSONB data migration — stored rows
# carry these strings.
PAYMENT_METHODS = ("bit", "paybox", "bank_transfer", "cash", "credit_card")
PAYMENT_TIMINGS = ("advance", "on_pickup", "deposit")
PAYMENT_NOTE_MAX = 80
_PAYMENT_INFO_KEYS = frozenset({"methods", "timing", "note"})
_LETTER_RE = re.compile(r"[א-תa-zA-Z]")


def _payment_methods(raw: Any) -> list[str]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError("אמצעי התשלום חייבים להיות רשימה")
    if len(raw) > 2 * len(PAYMENT_METHODS):
        raise ValueError("יותר מדי אמצעי תשלום")
    unknown = [m for m in raw if m not in PAYMENT_METHODS]
    if unknown:
        raise ValueError(f"אמצעי תשלום לא מוכר: {unknown[0]}")
    return [m for m in PAYMENT_METHODS if m in raw]


def _payment_note(raw: Any) -> str | None:
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise ValueError("ההערה על התשלום חייבת להיות טקסט")
    note = raw.strip()
    if not note:
        return None
    if len(note) > PAYMENT_NOTE_MAX:
        raise ValueError(f"ההערה על התשלום ארוכה מדי (עד {PAYMENT_NOTE_MAX} תווים)")
    # MEH-555: free text shown to readers needs at least 3 letters.
    if len(_LETTER_RE.findall(note)) < 3:
        raise ValueError("ההערה על התשלום צריכה לכלול לפחות 3 אותיות")
    return note


def _payment_info_validator(v: Any) -> dict[str, Any] | None:
    """Validate producers.payment_info on write (MEH-3035).

    Returns the normalised dict, or None when nothing was said (no methods,
    no timing, no note) so the public page renders nothing. Unknown keys,
    unknown methods/timings, a note over 80 chars or under 3 letters → 422.
    """
    if v is None:
        return None
    if not isinstance(v, dict):
        raise ValueError("פרטי התשלום חייבים להיות אובייקט")
    extra = set(v) - _PAYMENT_INFO_KEYS
    if extra:
        raise ValueError(f"שדה לא מוכר בפרטי התשלום: {sorted(extra)[0]}")
    timing = v.get("timing")
    if timing is not None and timing not in PAYMENT_TIMINGS:
        raise ValueError("מתי משלמים: יש לבחור אחת מהאפשרויות")
    out = {
        "methods": _payment_methods(v.get("methods")),
        "timing": timing,
        "note": _payment_note(v.get("note")),
    }
    if not out["methods"] and out["timing"] is None and out["note"] is None:
        return None
    return out


def _order_window_validator(v: Any) -> dict[str, Any] | None:
    """Validate producers.order_window on write (MEH-1543, MEH-1869).

    Canonical shape is a LIST of ranges per day:
        {"sunday": [{"open": "09:00", "close": "13:00"},
                    {"open": "16:00", "close": "20:00"}]}

    MEH-1869 — parallel change, readers first. The legacy single-dict shape
    ({"sunday": {"open", "close"}}) is still ACCEPTED and normalised to a
    one-element list, so rows written before the cutover keep validating and
    every write leaves the canonical list shape behind. This is a JSONB VALUE
    change only: the column is untouched, so there is no Alembic revision.

    None passes through — an explicit null clears the field, an omitted field
    never reaches here (exclude_unset). Any structural or value violation raises
    ValueError, surfaced by FastAPI as a 422 with the Hebrew detail.

    Returns the NORMALISED value, so the stored row is always the list shape.
    """
    if v is None:
        return None
    if not isinstance(v, dict):
        raise ValueError("חלון הזמנות חייב להיות אובייקט של ימים")
    normalized: dict[str, list[dict[str, str]]] = {}
    for day, hours in v.items():
        if day not in _ORDER_WINDOW_DAYS:
            raise ValueError(
                f"מפתח יום לא תקין: {day} — חייב להיות אחד מ: "
                + ", ".join(sorted(_ORDER_WINDOW_DAYS))
            )
        normalized[day] = _validate_order_day(day, hours)
    return normalized


# MEH-1889 chunk A. Cap mirrors _MAX_ORDER_RANGES_PER_DAY's reasoning: the
# editor stays a form, not a scheduler. A year of holidays is ~20 dates; 60
# leaves room without letting the column become an unbounded log.
_MAX_SPECIAL_DATES = 60
# MEH-1889 chunk B (ruling ג): how far back a special date may reach on WRITE.
# 30 days lets an owner re-save a form that still carries last week's holiday
# without a 422, while keeping the column from becoming an unbounded log.
_SPECIAL_HOURS_RETENTION_DAYS = 30
_ISO_DATE_REGEX = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _validate_special_date(key: Any, entry: Any) -> dict[str, Any]:
    """Validate ONE date's entry and return it normalised.

    Split out of `_special_hours_validator` for the same two reasons
    `_validate_order_day` was split out of `_order_window_validator`: that
    function hit the C901 ceiling (12 > 10), and "is this one date
    well-formed?" is a separable question from "is this a well-formed set of
    dates?".
    """
    if not isinstance(key, str) or not _ISO_DATE_REGEX.match(key):
        raise ValueError(f"תאריך לא תקין: {key} — הפורמט חייב להיות YYYY-MM-DD")
    try:
        # Shape is not reality: the regex accepts 2026-02-30 and 2026-13-01,
        # and only this call rejects them.
        date.fromisoformat(key)
    except ValueError:
        raise ValueError(f"תאריך לא תקין: {key} — הפורמט חייב להיות YYYY-MM-DD")

    if not isinstance(entry, dict) or "ranges" not in entry:
        raise ValueError(f"התאריך {key} חייב לכלול רשימת טווחים")
    ranges = entry["ranges"]
    if not isinstance(ranges, list):
        raise ValueError(f"התאריך {key} חייב לכלול רשימת טווחים")

    # [] is the CLOSED marker, so it must not reach _validate_order_day — that
    # function rejects an empty list ("at least one range"), which is the right
    # rule for a weekly day and the wrong one for a date.
    day: dict[str, Any] = {
        "ranges": [] if not ranges else _validate_order_day(key, ranges)
    }

    note = entry.get("note")
    if note is not None:
        if not isinstance(note, str):
            raise ValueError(f"הערה לא תקינה לתאריך {key}")
        cleaned = sanitize_text(note, max_length=200)
        if cleaned:
            day["note"] = cleaned
    return day


def _special_hours_validator(v: Any) -> dict[str, Any] | None:
    """Validate producers.special_hours on write (MEH-1889 chunk A).

    Shape — date-keyed overrides above the weekly axes:

        {"2026-09-22": {"ranges": [{"open": "09:00", "close": "13:00"}],
                        "note": "ערב ראש השנה"}}

    `"ranges": []` means CLOSED on that date. `note` is OPTIONAL and is
    DISPLAY ONLY — the store-hours surface renders it as text and derives
    nothing from it.

    ORDER-AXIS AUTHORITATIVE: `ranges` overrides `order_window` on that date.
    It does NOT override `opening_hours`, which is unbounded free text
    (models.py:380) and therefore has nothing to compute against — the same
    split services/producer_listing.py:508-514 already draws between the two.

    Ranges are validated by `_validate_order_day`, REUSED VERBATIM rather than
    reimplemented, so `special_hours` and `order_window` cannot drift on what a
    valid range is (HH:MM 24h, close>open, ascending + non-overlapping, ≤3).
    Its messages interpolate the key, which here is the date — "היום 2026-09-22
    חייב לכלול שעת פתיחה ושעת סגירה" reads correctly.

    Retention (MEH-1889 chunk B, Sapir's ruling ג): a date older than
    `israel_today() - 30` is REJECTED on write, and readers ignore past dates.
    Chunk A deliberately accepted any real date so the migration was not
    coupled to this policy. The boundary is inclusive — exactly today-30 is
    still accepted — and the check runs AFTER the shape checks, so a malformed
    key still gets the format message, never the retention one. The clock is
    `israel_today()`, the codebase's Asia/Jerusalem primitive (not
    `date.today()`, which is UTC on Railway), so a test freezes it through
    `schemas.israel_today` — the same idiom test_availability_validation.py uses.

    None passes through (an explicit null clears the field). Returns the
    NORMALISED value, so the stored row is always the canonical shape.
    """
    if v is None:
        return None
    if not isinstance(v, dict):
        raise ValueError("שעות מיוחדות חייבות להיות אובייקט של תאריכים")
    if len(v) > _MAX_SPECIAL_DATES:
        raise ValueError(f"אפשר להגדיר עד {_MAX_SPECIAL_DATES} תאריכים מיוחדים")
    normalized = {key: _validate_special_date(key, entry) for key, entry in v.items()}
    oldest_allowed = israel_today() - timedelta(days=_SPECIAL_HOURS_RETENTION_DAYS)
    for key in normalized:
        # Every key here already passed _validate_special_date, which parsed it
        # with date.fromisoformat — so this call cannot raise. Keep the two in
        # this order: shape first, then policy.
        if date.fromisoformat(key) < oldest_allowed:
            raise ValueError(
                f"התאריך {key} כבר עבר — אפשר להגדיר שעות מיוחדות רק לתאריכים "
                f"מה-{_SPECIAL_HOURS_RETENTION_DAYS} הימים האחרונים ואילך"
            )
    return normalized


def clean_display_city(value: str | None) -> str:
    """MEH-2475 (review #3728): the registration city rule as a plain function
    — bleach (`sanitize_text`, 100 chars) then ≥1 letter — for the one write
    path that is not a Pydantic field (an organizer's PUT /producers/me city).
    REUSES: ProducerRegister._sanitize_city + _validate_city_letters below.
    Raises ValueError like the field validators do."""
    return _min_letters_validator(sanitize_text(value, max_length=100), min_count=1)


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


# MEH-2236: same three scripts as _LETTER_REGEX, plus digits — both ASCII and
# Arabic-Indic (\u0660-\u0669), since this class's job is "a letter OR a digit"
# and an address written in Arabic numerals is the case it exists to accept.
_ALNUM_REGEX = re.compile(
    r"[\u05d0-\u05eaa-zA-Z0-9\u0621-\u063f\u0641-\u064a"
    r"\u0660-\u0669\u066e-\u066f\u0671-\u06d3]"
)


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
    """Return the digit projection, with one leading `+` kept when the value
    was typed with one. Validate that projection against the audit regex.
    Empty/whitespace → None.

    MEH-2641: this used to return `cleaned` (only spaces/dashes/parens
    removed), so any other character survived to the column —
    '+' * 15 + '0501234567' and 'ABCDEFGHIJKLMNO0501234567' were accepted at
    25 chars and overflowed the String(20) phone columns with an unhandled
    500. Returning what was validated is what bounds the stored length:
    `_PHONE_DIGITS_RE` allows at most 13 digits, so the value is ≤ 14 chars.
    The wa.me builders are unaffected (frontend `normalizePhone`,
    lib/utils.js, re-strips to digits anyway).
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
    return ("+" + digits) if cleaned.startswith("+") else digits


# MEH-2626: the field is the business's WhatsApp UPDATES link — a group invite
# (chat.whatsapp.com/<code>) or a channel (whatsapp.com/channel/<id>). Channels
# are the recommended shape: members never see each other's numbers and there
# is no member cap. `www.` is accepted for the channel host only — it is what
# WhatsApp's own share sheet produces there; www.chat.whatsapp.com is not a
# real host and stays rejected (MEH-1537 "subdomain drift" case).
_WHATSAPP_GROUP_HOSTS = frozenset({"chat.whatsapp.com"})
_WHATSAPP_CHANNEL_HOSTS = frozenset({"whatsapp.com", "www.whatsapp.com"})
WHATSAPP_UPDATES_LINK_ERROR = (
    "קישור לעדכונים בוואטסאפ חייב להתחיל ב-https://chat.whatsapp.com"
    " או ב-https://whatsapp.com/channel"
)


def _is_whatsapp_channel_path(path: str) -> bool:
    """`/channel/<id>` with a non-empty id — the bare site is not a channel."""
    prefix = "/channel/"
    return path.startswith(prefix) and path[len(prefix) :].strip("/") != ""


def _whatsapp_group_validator(value: str | None) -> str | None:
    """WhatsApp updates link: https://chat.whatsapp.com/… (group) or
    https://[www.]whatsapp.com/channel/<id> (channel). Any other scheme/host
    is a dead or wrong link on the public page. Empty/whitespace → None.
    """
    if value is None:
        return None
    stripped = value.strip()
    if stripped == "":
        return None
    parsed = urlparse(stripped)
    host = parsed.netloc.lower()
    is_group = host in _WHATSAPP_GROUP_HOSTS
    is_channel = host in _WHATSAPP_CHANNEL_HOSTS and _is_whatsapp_channel_path(
        parsed.path
    )
    if parsed.scheme != "https" or not (is_group or is_channel):
        raise ValueError(WHATSAPP_UPDATES_LINK_ERROR)
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


# MEH-2153: custom_questions guard, shared so every write schema carrying the
# field enforces ONE definition (today that is ProducerUpdate alone — the other
# three occurrences are response schemas; see the module note below).
#
# MEH-210 Phase 2 shipped the count + length caps inline on ProducerUpdate; this
# lifts them out and adds the one rule they were missing — DEDUPE. Two identical
# questions render as two identical chips on the public page, which reads as a
# bug to the customer and costs the owner one of her five slots.
#
# DO NOT raise _CUSTOM_QUESTION_MAX_LEN without changing the editor input in the
# same PR — `maxLength={80}` at
# frontend/app/[locale]/producer/dashboard/edit/page.js:1272 is the other half
# of this cap, and both landed together in MEH-210 Phase 2 (86eefcfd). A
# server-side ceiling above the editor's is a value no UI can produce and no
# reader expects.
_MAX_CUSTOM_QUESTIONS = 5
_CUSTOM_QUESTION_MAX_LEN = 80


def _custom_questions_validator(value: list[str] | None) -> list[str] | None:
    """Normalise + cap the owner-authored WhatsApp question chips.

    None stays None and `[]` stays `[]` — the two are NOT collapsed. They are
    indistinguishable to every reader measured (frontend
    lib/resolvedQuestions.js `ownerQuestionLabels` — the one derivation the
    page component and the dashboard preview share — and tests
    `custom_questions?.length > 0`, so both yield no owner rows), but
    collapsing them would still rewrite what the column stores
    on a path this ticket has no reason to touch.

    Order-preserving throughout: the owner's five inputs are positional in the
    editor, so a reordering normalisation would silently shuffle her page.
    """
    if value is None:
        return None
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            # Let the declared `list[str]` type raise; don't mask it here.
            return value
        stripped = item.strip()
        if not stripped:
            continue
        if len(stripped) > _CUSTOM_QUESTION_MAX_LEN:
            raise ValueError(f"שאלה יכולה להכיל עד {_CUSTOM_QUESTION_MAX_LEN} תווים")
        if stripped in seen:
            continue
        seen.add(stripped)
        cleaned.append(stripped)
    if len(cleaned) > _MAX_CUSTOM_QUESTIONS:
        raise ValueError(f"אפשר עד {_MAX_CUSTOM_QUESTIONS} שאלות מותאמות")
    return cleaned


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
# call site. Since MEH-2641 the validator RETURNS the digit projection it
# checks (≤13 digits, plus an optional leading "+"), and that is what keeps
# every stored value inside the String(20) columns. Before MEH-2641 this line
# claimed the same while the validator returned the raw `cleaned` string.
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
    # Every surviving entry is non-blank, so _image_url_validator returns a str.
    return cast(
        list[str],
        [
            _image_url_validator(v)
            for v in value
            if v is not None and str(v).strip() != ""
        ],
    )


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
def _terms_must_be_accepted(v: bool) -> bool:
    """MEH-2080: the terms checkbox is mandatory, and since 2026-09-v2 it also
    carries the 18+ self-declaration. An omitted or False flag is a 422 here,
    never a silent NULL row — the server is the second half of the gate the
    client's `required` attribute is the first half of (MEH-2015 asterisk
    invariant). MEH-1995 kept the field optional on purpose and named this as
    the separate hardening decision; it was ruled on 01/09 (18+, self-declared,
    no date of birth) and queued on 06/09 (ADDENDUM-9)."""
    if v is not True:
        raise ValueError("יש לאשר את תנאי השימוש ולהצהיר על גיל 18 ומעלה")
    return v


# --- Re-exports (MEH-3270) -------------------------------------------------
# The request and response models live in sibling modules, one per area. They
# are imported here, at the bottom, so every `from app.schemas.schemas import X`
# keeps working. The siblings import the shared validators above from this
# module, which is why this block must stay below them; app/schemas/__init__.py
# loads this module first so a sibling is never imported ahead of it.
from app.schemas.admin_review import (  # noqa: E402
    AdminChecklistItemIn as AdminChecklistItemIn,
    AdminChecklistItemOut as AdminChecklistItemOut,
    AdminChecklistItemsIn as AdminChecklistItemsIn,
    GrantVerifiedIn as GrantVerifiedIn,
    KASHRUT_EXPIRY_MAX_DAYS as KASHRUT_EXPIRY_MAX_DAYS,
    KashrutApproveIn as KashrutApproveIn,
    KashrutExpiryReminderOut as KashrutExpiryReminderOut,
    KashrutExpiryReminderRow as KashrutExpiryReminderRow,
    KashrutRejectIn as KashrutRejectIn,
    KashrutRequestCreate as KashrutRequestCreate,
    KashrutRequestOut as KashrutRequestOut,
    KashrutRevokeIn as KashrutRevokeIn,
    LicenseExpiryReminderOut as LicenseExpiryReminderOut,
    LicenseExpiryReminderRow as LicenseExpiryReminderRow,
    OtpConfirmIn as OtpConfirmIn,
    UserPhoneOtpConfirmIn as UserPhoneOtpConfirmIn,
    ProducerRejectIn as ProducerRejectIn,
    ProducerReviewCheckOut as ProducerReviewCheckOut,
    ProducerReviewChecksIn as ProducerReviewChecksIn,
    ProducerReviewChecksOut as ProducerReviewChecksOut,
    RejectionPresetOut as RejectionPresetOut,
    RequestChangesIn as RequestChangesIn,
    SetAmbassadorIn as SetAmbassadorIn,
)
from app.schemas.catalog import (  # noqa: E402
    CategoryOut as CategoryOut,
    DeliveryAreaCreate as DeliveryAreaCreate,
    DeliveryAreaOut as DeliveryAreaOut,
    MAX_OFFER_HEADLINE as MAX_OFFER_HEADLINE,
    OFFER_TYPES as OFFER_TYPES,
    ProducerCityOut as ProducerCityOut,
    ProducerLocationCreate as ProducerLocationCreate,
    ProducerLocationOut as ProducerLocationOut,
    ProducerLocationOwnerOut as ProducerLocationOwnerOut,
    ProducerLocationUpdate as ProducerLocationUpdate,
    ProducerOfferCreate as ProducerOfferCreate,
    ProducerOfferOut as ProducerOfferOut,
    ProducerRandomOut as ProducerRandomOut,
    ProductCreate as ProductCreate,
    ProductGroupOut as ProductGroupOut,
    ProductOut as ProductOut,
    ProductUpdate as ProductUpdate,
    THRESHOLD_UNITS as THRESHOLD_UNITS,
    _EMOJI_ANYWHERE as _EMOJI_ANYWHERE,
    _LOCATION_KIND as _LOCATION_KIND,
    _LOCATION_PRECISION as _LOCATION_PRECISION,
    _VS16 as _VS16,
    _ZWJ as _ZWJ,
    _optional_label_letters as _optional_label_letters,
)
from app.schemas.community import (  # noqa: E402
    FavoriteOut as FavoriteOut,
    HomeProductCreate as HomeProductCreate,
    HomeProductModerationRequest as HomeProductModerationRequest,
    HomeProductModerationResult as HomeProductModerationResult,
    HomeProductOut as HomeProductOut,
    HomeProductRatingOut as HomeProductRatingOut,
    HomeProductUpdate as HomeProductUpdate,
    ProducerInfoReportCreate as ProducerInfoReportCreate,
    RatingSubmit as RatingSubmit,
    ReportCreate as ReportCreate,
    ReportOut as ReportOut,
    UserOut as UserOut,
)
from app.schemas.events import (  # noqa: E402
    EVENT_END_TIME_ERROR as EVENT_END_TIME_ERROR,
    EventCreate as EventCreate,
    EventFilters as EventFilters,
    EventOut as EventOut,
    EventUpdate as EventUpdate,
    OrganizerPublicOut as OrganizerPublicOut,
    OrganizerSlugOut as OrganizerSlugOut,
    event_end_time_problem as event_end_time_problem,
    naive_wall_clock as naive_wall_clock,
)
from app.schemas.experiences import (  # noqa: E402
    EXPERIENCE_CATEGORIES as EXPERIENCE_CATEGORIES,
    ExperienceCountOut as ExperienceCountOut,
    ExperienceCreate as ExperienceCreate,
    ExperienceDetailOut as ExperienceDetailOut,
    ExperienceHostOut as ExperienceHostOut,
    ExperienceListOut as ExperienceListOut,
    ExperienceModerationAction as ExperienceModerationAction,
    ExperienceUpdate as ExperienceUpdate,
    ExperienceValidateRequest as ExperienceValidateRequest,
    ExperienceValidateResult as ExperienceValidateResult,
    RegistrationCancelInfoOut as RegistrationCancelInfoOut,
    RegistrationCreate as RegistrationCreate,
    RegistrationCreatedOut as RegistrationCreatedOut,
    RegistrationMethod as RegistrationMethod,
    RegistrationOwnerOut as RegistrationOwnerOut,
    _EXPERIENCE_CATEGORY_KEYS as _EXPERIENCE_CATEGORY_KEYS,
    _experience_category as _experience_category,
)
from app.schemas.group_buys_requests import (  # noqa: E402
    CategoryRequestCreate as CategoryRequestCreate,
    CategoryRequestOut as CategoryRequestOut,
    CategoryRequestUpdate as CategoryRequestUpdate,
    GroupBuyCommitOut as GroupBuyCommitOut,
    GroupBuyCommitRequest as GroupBuyCommitRequest,
    GroupBuyCreate as GroupBuyCreate,
    GroupBuyDetail as GroupBuyDetail,
    GroupBuyOut as GroupBuyOut,
    GroupBuyStatusOut as GroupBuyStatusOut,
    GroupBuyStatusUpdate as GroupBuyStatusUpdate,
    ProducerNameChangeRequestCreate as ProducerNameChangeRequestCreate,
    ProducerNameChangeRequestOut as ProducerNameChangeRequestOut,
    ProducerNameChangeRequestUpdate as ProducerNameChangeRequestUpdate,
)
from app.schemas.producer import (  # noqa: E402
    AVAILABILITY_STATES as AVAILABILITY_STATES,
    ProducerAdminCreate as ProducerAdminCreate,
    ProducerAdminUpdate as ProducerAdminUpdate,
    ProducerCreate as ProducerCreate,
    ProducerUpdate as ProducerUpdate,
    WRITABLE_AVAILABILITY_STATES as WRITABLE_AVAILABILITY_STATES,
    normalize_google_place_id as normalize_google_place_id,
)
from app.schemas.producer_out import (  # noqa: E402
    GooglePlaceIdIn as GooglePlaceIdIn,
    GooglePlaceIdOut as GooglePlaceIdOut,
    GoogleRatingOut as GoogleRatingOut,
    KashrutCertRef as KashrutCertRef,
    ProducerAdminOut as ProducerAdminOut,
    ProducerDetailOut as ProducerDetailOut,
    ProducerListOut as ProducerListOut,
    ProducerOwnerOut as ProducerOwnerOut,
)
from app.schemas.recipes_outreach import (  # noqa: E402
    BusinessSuggestionAck as BusinessSuggestionAck,
    BusinessSuggestionCreate as BusinessSuggestionCreate,
    OutreachLeadCreate as OutreachLeadCreate,
    OutreachLeadOut as OutreachLeadOut,
    OutreachLeadUpdate as OutreachLeadUpdate,
    OutreachPrefillResponse as OutreachPrefillResponse,
    ProducerRecipeBase as ProducerRecipeBase,
    ProducerRecipeCreate as ProducerRecipeCreate,
    ProducerRecipeModerationAction as ProducerRecipeModerationAction,
    ProducerRecipeOut as ProducerRecipeOut,
    ProducerRecipeUpdate as ProducerRecipeUpdate,
    _OUTREACH_PHONE_MAX_LEN as _OUTREACH_PHONE_MAX_LEN,
)
from app.schemas.registration import (  # noqa: E402
    AppleAuthRequest as AppleAuthRequest,
    AppleAuthResponse as AppleAuthResponse,
    CheckPasswordRequest as CheckPasswordRequest,
    ForgotPasswordRequest as ForgotPasswordRequest,
    GoogleAuthRequest as GoogleAuthRequest,
    GoogleAuthResponse as GoogleAuthResponse,
    LoginRequest as LoginRequest,
    OwnerInviteAccept as OwnerInviteAccept,
    OwnerInviteCreate as OwnerInviteCreate,
    OwnerInviteCreatedOut as OwnerInviteCreatedOut,
    OwnerInviteEmailCodeRequest as OwnerInviteEmailCodeRequest,
    OwnerInvitePublicOut as OwnerInvitePublicOut,
    ProducerClaimLinkOut as ProducerClaimLinkOut,
    ProducerClaimNewLinkOut as ProducerClaimNewLinkOut,
    ProducerClaimOut as ProducerClaimOut,
    ProducerClaimPreviewOut as ProducerClaimPreviewOut,
    ProducerClaimPreviewRequest as ProducerClaimPreviewRequest,
    ProducerClaimRequest as ProducerClaimRequest,
    ProducerOAuthSignupRequest as ProducerOAuthSignupRequest,
    ProducerOAuthSignupResponse as ProducerOAuthSignupResponse,
    ProducerOwnerSummary as ProducerOwnerSummary,
    ProducerRegister as ProducerRegister,
    ProducerRegistrationResponse as ProducerRegistrationResponse,
    RegisterAck as RegisterAck,
    ResetPasswordRequest as ResetPasswordRequest,
    Token as Token,
    UserRegister as UserRegister,
)
from app.schemas.reviews import (  # noqa: E402
    AdminReviewOut as AdminReviewOut,
    RemoveListingBody as RemoveListingBody,
    ReviewCreateNested as ReviewCreateNested,
    ReviewInviteLinkOut as ReviewInviteLinkOut,
    ReviewOut as ReviewOut,
    ReviewReplyUpdate as ReviewReplyUpdate,
    ReviewsPage as ReviewsPage,
)
from app.schemas.site import (  # noqa: E402
    AlertContent as AlertContent,
    AlertPrefsIn as AlertPrefsIn,
    AlertPrefsOut as AlertPrefsOut,
    AvailabilityStateUpdate as AvailabilityStateUpdate,
    BioGenerateIn as BioGenerateIn,
    CHAT_USER_MESSAGE_MAX as CHAT_USER_MESSAGE_MAX,
    CONTACT_TOPIC_LABELS as CONTACT_TOPIC_LABELS,
    COVERAGE_CITY_MAX_LENGTH as COVERAGE_CITY_MAX_LENGTH,
    CategoryHit as CategoryHit,
    CategoryCreate as CategoryCreate,
    CategoryIn as CategoryIn,
    ChatMessage as ChatMessage,
    ChatRequest as ChatRequest,
    ChatResponse as ChatResponse,
    ContactClickIn as ContactClickIn,
    ContactIn as ContactIn,
    DeliveryWaitlistHostConfirmIn as DeliveryWaitlistHostConfirmIn,
    DeliveryWaitlistIn as DeliveryWaitlistIn,
    DeliveryWaitlistOut as DeliveryWaitlistOut,
    DeliveryWaitlistUnsubscribeIn as DeliveryWaitlistUnsubscribeIn,
    NameCheckOut as NameCheckOut,
    NameMatch as NameMatch,
    NewsletterIn as NewsletterIn,
    NewsletterUnsubscribeIn as NewsletterUnsubscribeIn,
    OutboundMessageAdminOut as OutboundMessageAdminOut,
    PasswordChange as PasswordChange,
    ProducerHit as ProducerHit,
    ProducerViewIn as ProducerViewIn,
    ProductHit as ProductHit,
    ProfileUpdate as ProfileUpdate,
    RiskScoreResponse as RiskScoreResponse,
    SavedEventOut as SavedEventOut,
    SavedExperienceOut as SavedExperienceOut,
    SavedItemRefOut as SavedItemRefOut,
    SavedItemType as SavedItemType,
    SavedItemsOut as SavedItemsOut,
    SavedRecipeOut as SavedRecipeOut,
    SearchOut as SearchOut,
    StaticPageOut as StaticPageOut,
    StaticPageUpdate as StaticPageUpdate,
    StatsOut as StatsOut,
    StoryCardUploadRequest as StoryCardUploadRequest,
    UserAdminOut as UserAdminOut,
    UserRoleUpdate as UserRoleUpdate,
    VacationModeState as VacationModeState,
    WeeklySummaryUnsubscribeIn as WeeklySummaryUnsubscribeIn,
    WhatsAppClickIn as WhatsAppClickIn,
    _CITY_URLISH_REGEX as _CITY_URLISH_REGEX,
)
