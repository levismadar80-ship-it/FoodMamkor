"""
Module:    schemas/site
Purpose:   Everything else the site sends or receives: users admin,
           static pages, profile, search, alerts, chat, stats,
           newsletter, contact, click tracking, delivery waitlist, saved
           items, name check.
Does NOT:  Hold any of the larger areas; each has its own module.
Split out of schemas/schemas.py (MEH-3270); the code is moved verbatim and
every name is still importable from app.schemas.schemas.
"""

import re
from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from app.schemas.password import PasswordField
from app.services.sanitization import sanitize_text
from app.schemas.schemas import (
    PhoneNumberField,
    SanitizedLabelField,
    SanitizedPersonNameField,
    _LETTER_REGEX,
)
from app.schemas.events import EventOut
from app.schemas.experiences import ExperienceListOut


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
    # MEH-2890: true for the SUPER_ADMIN_EMAIL account (no demote / delete).
    is_super_admin: bool = False
    producer_id: UUID | None = None
    favorites_count: int = 0
    # MEH-3226: no-shows still counting against her, and whether that blocks
    # rescue-bag reservations — drives the badge and «שחרור חסימת סלים».
    rescue_active_no_shows: int = 0
    rescue_blocked: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class UserRoleUpdate(BaseModel):
    role: str = Field(..., pattern="^(consumer|producer|admin)$")


# Admin: Categories
class CategoryIn(BaseModel):
    name: SanitizedLabelField
    emoji: str | None = None


class CategoryCreate(CategoryIn):
    """MEH-3255 (D10): a NEW category must answer «דורשת רישיון?» — no
    default, so a create without an explicit choice is a 422, not a silent
    «no». PUT keeps CategoryIn: the flag is not editable through rename."""

    requires_license: bool


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
    # MEH-3104: required (checked in users_me._change_email) only when `email`
    # really changes. A plain str like PasswordChange.current_password —
    # verify_password is the only authority on it.
    current_password: str | None = Field(None, max_length=256)
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
# MEH-2758: the legacy AvailabilityStatusUpdate surface is gone with its two
# endpoints; AvailabilityStateUpdate is the only availability write body.
class AvailabilityStateUpdate(BaseModel):
    state: str = Field(
        ...,
        description="accepting_orders | on_vacation",
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
# module order. Router-local concerns (_HEBREW_PREFIXES,
# _strip_hebrew_prefix, _empty) stay in search.py — MEH-3257 removed
# _trending_cache and _TRENDING_TTL with /search/trending itself —
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
    # MEH-2139: same reasoning as CategoryOut, including why the type stays
    # optional against a NOT NULL column. Added in the SAME PR as CategoryOut on
    # purpose — a second serializer of the same entity is exactly the edit that
    # gets forgotten, and the switch step would then have found one surface
    # carrying the slug and one silently dropping it. (Past tense: chunk 2 is
    # that step. The reviewer flagged the same stale tense on CategoryOut; this
    # sibling carried it too and was found by grepping rather than by being
    # named.)
    slug: str | None = None
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
    # MEH-2828: new_group_buy alert type; defaults to on like the siblings.
    notify_new_group_buy: bool = True
    # MEH-3117: new_rescue alert type; defaults to on like the siblings.
    notify_new_rescue: bool = True
    whatsapp_opt_in: bool = False
    push_subscription: dict[str, Any] | None = None


class AlertPrefsOut(BaseModel):
    enabled: bool
    notify_new_product: bool
    notify_new_event: bool
    notify_delivery_area: bool
    notify_new_recipe: bool
    notify_new_group_buy: bool
    notify_new_rescue: bool
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
# MEH-3010: what a visitor may type, matching the widget's maxLength
# (frontend/components/ChatWidget.jsx:467). A bot posting straight to /chat
# skips the widget, so the server holds the same line. Assistant turns echo
# our own replies back and keep the wider 2000.
CHAT_USER_MESSAGE_MAX = 500


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def _cap_user_message(self) -> "ChatMessage":
        if self.role == "user" and len(self.content) > CHAT_USER_MESSAGE_MAX:
            raise ValueError(f"user message over {CHAT_USER_MESSAGE_MAX} chars")
        return self


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


# MEH-3079: the weekly owner summary's unsubscribe link — same shape, its own
# token scope (services/weekly_owner_summary.py).
class WeeklySummaryUnsubscribeIn(BaseModel):
    token: str = Field(..., min_length=1, max_length=2048)


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
    def _sanitize_name(cls, v: str) -> str | str | None:
        return sanitize_text(v, max_length=200)

    @field_validator("message")
    @classmethod
    def _sanitize_message(cls, v: str) -> str | str | None:
        return sanitize_text(v, max_length=5000)

    @field_validator("topic")
    @classmethod
    def _validate_topic(cls, v: str | None) -> str | None:
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


# MEH-1677: 60 chars after trim. The cap and producer_whatsapp_clicks.city's
# String(60) are two halves of one bound -- widening either alone re-opens the
# truncation this exists to prevent.
COVERAGE_CITY_MAX_LENGTH: int = 60


class WhatsAppClickIn(BaseModel):
    """MEH-1677: OPTIONAL body of POST /producers/{id}/whatsapp-click.

    The endpoint took no body before this. It still accepts none -- the
    anonymous path uses `navigator.sendBeacon`, which cannot set
    `Content-Type: application/json` (it sends text/plain, which FastAPI
    rejects with 422), so a REQUIRED body would break every anonymous
    WhatsApp click on the site. Only the coverage CTA sends a body, and it
    uses fetch(keepalive) for exactly that reason.

    `city` is validated SOFTLY on purpose: a value that is not in the
    canonical city list is still STORED, not dropped. The point of the
    capture is to learn where demand actually is, including spellings and
    localities our list does not carry yet -- discarding those would delete
    the most interesting rows.
    """

    city: str | None = None

    @field_validator("city", mode="before")
    @classmethod
    def _validate_city(cls, v: object) -> str | None:
        if v is None:
            return None
        if not isinstance(v, str):
            raise ValueError("עיר חייבת להיות מחרוזת")
        trimmed = v.strip()
        if not trimmed:
            return None
        # MEH-555 bug pattern: a free-text str feeding an admin/dashboard
        # surface accepts punctuation- or digit-only junk ("???", "123")
        # unless a letter class is required. city feeds the post-launch
        # demand-by-city card, so junk here is not cosmetic -- it becomes a
        # phantom "city" in that feed. Letters counted AFTER strip, per the
        # pattern. min_count=1, matching the sibling city validator above
        # (`_validate_city_letters`): a legitimate short Hebrew name
        # ("בת ים", "לוד") must clear the floor.
        #
        # DIVERGENCE from that sibling, deliberate: it RAISES, because city is
        # required there and a stripped-to-nothing value must 422. Here city is
        # optional telemetry on a fire-and-forget beacon, so junk DROPS to None
        # and the click is still logged. That is this endpoint's own stated
        # principle (MEH-1627, routers/producers.py): "losing attribution beats
        # losing the click" -- a 422 would discard a real click over a bad
        # city. Soft validation is unaffected: an unknown REAL locality has
        # letters and still stores as-is.
        if not _LETTER_REGEX.sub("", trimmed):
            return None
        return trimmed[:COVERAGE_CITY_MAX_LENGTH]


# Control characters (incl. \n / \r) are in the same class: the value is
# echoed into an email, and a newline in it is an extra line in the mail body.
_CITY_URLISH_REGEX = re.compile(r"[./:@\\\x00-\x1f\x7f]|https?|www", re.IGNORECASE)


class DeliveryWaitlistIn(BaseModel):
    """MEH-2618: body of POST /producers/{id}/delivery-waitlist.

    Unlike WhatsAppClickIn above, `city` is REQUIRED and RAISES: this is a
    form the visitor fills on purpose, not a beacon — a junk city here would
    make a promise («נודיע לך כשיגיעו ל???») that can never be kept. Same
    letter floor as the siblings (MEH-555), same 60-char cap as
    producer_whatsapp_clicks.city so the dashboard's demand row can one day
    count both sources on one key.
    """

    email: EmailStr
    city: str = Field(..., min_length=1, max_length=COVERAGE_CITY_MAX_LENGTH)
    # MEH-2673: «אשמח לארח נקודת מסירה ב{עיר}» — optional, absent = False, so
    # the pre-MEH-2673 form keeps working unchanged.
    wants_to_host: bool = False

    @field_validator("email", mode="after")
    @classmethod
    def _normalize_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("city", mode="after")
    @classmethod
    def _validate_city(cls, v: str) -> str:
        trimmed = v.strip()
        if not _LETTER_REGEX.sub("", trimmed):
            raise ValueError("עיר חייבת להכיל אותיות")
        # The value is echoed verbatim into the email we send to this address
        # (subject + body). A URL-shaped "city" would put attacker text and a
        # link into mail sent under the platform's name. No Israeli locality
        # carries any of these characters; hyphens and parentheses do occur
        # («בנימינה-גבעת עדה», «יקנעם (מושבה)») and stay allowed.
        if _CITY_URLISH_REGEX.search(trimmed):
            raise ValueError("עיר לא יכולה להכיל קישור")
        return trimmed


class DeliveryWaitlistOut(BaseModel):
    """MEH-2618: `added` (201) on a new row, `exists` (200) when the same
    email already waits for the same business + city — the form shows the
    same calm confirmation for both.

    MEH-2673 `host_confirm` — only when the request ticked «אשמח לארח»:
    `sent` = a confirmation mail went out now · `already_sent` = THIS
    business+city's link already went to the address within the last 24 h,
    nothing new was sent (the form says «check your inbox» instead of a false
    «we sent») · `limit_reached` = the address hit its daily cap of
    confirmation mails across businesses/cities, nothing was sent for this
    one (the form says «try again tomorrow», never «check your inbox») ·
    `confirmed` = this row is already a host. None when the box was not
    ticked."""

    status: Literal["added", "exists"]
    host_confirm: (
        Literal["sent", "already_sent", "limit_reached", "confirmed"] | None
    ) = None


class DeliveryWaitlistUnsubscribeIn(BaseModel):
    """MEH-2618: the signed token from the «לא רוצה עדכונים» link."""

    token: str = Field(..., min_length=1)


class DeliveryWaitlistHostConfirmIn(BaseModel):
    """MEH-2673: the signed token from the «אשמח לארח» confirmation link.
    Its own model so a change to the unsubscribe input never changes this
    endpoint."""

    token: str = Field(..., min_length=1)


class ProducerViewIn(BaseModel):
    """MEH-2159: body of POST /producers/{id}/view.

    `referrer` is the `?from=` value off the PAGE url (ProducerCard.jsx:205
    builds `/{slug}?from={referrer}`). It reaches the API for the first time
    here: before this endpoint the page-url query string was never forwarded
    by either fetch, so `producer_page_views.referrer` was NULL for every row
    ever written.

    Deliberately unvalidated at the schema layer — `record_analytics_event`
    normalizes against the `_ALLOWED_REFERRERS` allowlist and writes NULL for
    anything else (services/analytics.py:213, applied at :305). A 422 here
    would turn a fire-and-forget beacon into a client error for a value the
    writer would have discarded anyway.
    """

    referrer: str | None = None


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


# MEH-2557: saved recipes / events / experiences (table saved_items, MEH-2556).
SavedItemType = Literal["recipe", "event", "experience"]


class SavedItemRefOut(BaseModel):
    """One saved item, ids only — hydrates the hearts' cache in one call."""

    item_type: SavedItemType
    item_id: UUID


class SavedRecipeOut(BaseModel):
    """Card fields only. Deliberately NOT ProducerRecipeOut: that shape carries
    moderation_notes, which is owner/admin context, not public."""

    id: UUID
    title: str
    description: str | None = None
    image_url: str | None = None
    prep_time_min: int | None = None
    cook_time_min: int | None = None
    producer_name: str
    producer_slug: str | None = None
    saved_at: datetime


class SavedEventOut(EventOut):
    saved_at: datetime


class SavedExperienceOut(ExperienceListOut):
    # Not on ExperienceListOut: the public feed lists active ones only. A saved
    # one may since have been cancelled by its host — the page labels it.
    is_active: bool = True
    saved_at: datetime


class SavedItemsOut(BaseModel):
    """GET /users/me/saved — newest save first within each type. Only items
    that are still public are listed; a deleted or hidden one drops out."""

    recipes: list[SavedRecipeOut]
    events: list[SavedEventOut]
    experiences: list[SavedExperienceOut]


class NameMatch(BaseModel):
    """One live business whose name equals the name being registered."""

    id: str
    slug: str | None
    name: str
    city: str | None


class NameCheckOut(BaseModel):
    """GET /producer-name-check (MEH-3086) — at most three matches."""

    matches: list[NameMatch]
