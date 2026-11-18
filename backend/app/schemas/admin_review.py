"""
Module:    schemas/admin_review
Purpose:   Admin review inputs and outputs: kashrut requests and
           reminders, checklist, review checks, approve / reject /
           request-changes bodies.
Does NOT:  Hold the business page shapes they act on (producer.py).
Split out of schemas/schemas.py (MEH-3270); the code is moved verbatim and
every name is still importable from app.schemas.schemas.
"""

from datetime import date, datetime, timedelta
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, Field, field_validator
from app.limits import MAX_ADMIN_LIST
from app.utils.clock import israel_today
from app.schemas.schemas import (
    _min_letters_validator,
)


# --- MEH-51: Kashrut badge requests ---
class KashrutRequestCreate(BaseModel):
    badge_code: str
    cert_url: str | None = None

    @field_validator("cert_url")
    @classmethod
    def _validate_cert_url(cls, v: str | None) -> str | None:
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


class AdminChecklistItemOut(BaseModel):
    """MEH-1399: one review-checklist item as the admin surfaces read it.

    `updated_at` is exposed rather than omitted — ADR-006 R2 asks every
    non-internal ORM column to appear in the matching `*Out` or sit on an
    explicit allowlist, and nothing in this repo mechanically enforces that
    (there is no general parity test), so an omission here would be
    indistinguishable from drift to the next reader. It is also the one
    question anyone asks of a config row: when did this last change.
    """

    id: UUID
    position: int
    label: str
    hint: str | None = None
    active: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class AdminChecklistItemIn(BaseModel):
    """One item in a full-list PUT.

    `id` is optional: present = update that row, absent = create a new item.
    That is what lets the settings screen add, edit and reorder in one request
    without a separate POST — the admin drags three rows and saves once.

    There is deliberately NO delete. Retirement is `active: false`, and the DB
    enforces it (`producer_review_checks.item_id` is ON DELETE RESTRICT), so a
    delete endpoint would only ever produce a 500 on any item with history.
    """

    id: UUID | None = None
    label: str = Field(min_length=1, max_length=300)
    hint: str | None = Field(default=None, max_length=300)
    active: bool = True

    @field_validator("label")
    @classmethod
    def _strip_label(cls, v: str) -> str:
        # MEH-555: a non-empty check alone lets "???" through, and this string
        # is not merely displayed — it is copied into
        # `producer_review_checks.label_snapshot` at tick time, so a
        # punctuation-only label becomes a permanent audit record of an
        # attestation to nothing. The >=3-letter floor is the repo-wide rule for
        # free-text a user or admin will read back.
        #
        # `hint` deliberately does NOT get this: it is optional, an empty hint
        # is the normal way to say "no explanation needed", and a terse
        # legitimate hint can fall under three letters. The asymmetry is the
        # point — label is the attestation, hint is a note beside it.
        return _min_letters_validator(v)

    @field_validator("hint")
    @classmethod
    def _strip_hint(cls, v: str | None) -> str | None:
        if v is None:
            return None
        stripped = v.strip()
        # "" and "   " both mean "no hint" — normalise to NULL so the column has
        # one representation of absent rather than two.
        return stripped or None


class AdminChecklistItemsIn(BaseModel):
    """Full-list replace. Order in the array IS the order on screen — `position`
    is assigned from the index server-side rather than sent by the client, so
    two items can never claim the same slot."""

    items: list[AdminChecklistItemIn] = Field(..., max_length=MAX_ADMIN_LIST)


class ProducerReviewCheckOut(BaseModel):
    """One recorded tick, as the review flow reads it back."""

    item_id: UUID
    label_snapshot: str
    checked_by_name: str | None = None
    checked_at: datetime


class ProducerReviewChecksOut(BaseModel):
    producer_id: UUID
    checks: list[ProducerReviewCheckOut] = []


class ProducerReviewChecksIn(BaseModel):
    """The ticked item ids for a producer, as the whole set.

    Set semantics, not a diff: what arrives IS the state afterwards, so an id
    that was ticked and is now absent gets its row deleted. A diff API would
    need the client to know what it previously sent, which is exactly the
    assumption that breaks when two admin tabs are open on the same producer.
    """

    item_ids: list[UUID] = Field(default_factory=list, max_length=MAX_ADMIN_LIST)


class LicenseExpiryReminderRow(BaseModel):
    """One business whose licence expires inside the 30-day window.

    MEH-2072 — the licence twin of KashrutExpiryReminderRow above, with two
    deliberate differences:

    * `expires_at` is a `date`, not a `datetime`. The column is DATE because a
      licence is valid through a calendar day (see the migration docstring);
      widening it to datetime here would reintroduce the timezone ambiguity the
      column type exists to avoid.
    * There is no `sent` / `error` pair. This endpoint only READS — the admin
      pulls the list, nothing is dispatched — so a per-row send outcome would be
      a field that is structurally always None. WhatsApp push is a future
      ticket; when it lands it adds the fields, rather than them sitting here
      unused and inviting the reader to think a send happened.

    `days_remaining` is computed server-side against israel_today() so the badge
    and the ordering can never disagree, and so a client in another timezone
    cannot render a different number from the same payload.

    `phone_masked` is deliberately the ONLY phone field, matching the kashrut
    row: the admin needs enough to recognise the number, not the number itself.
    """

    producer_id: UUID
    name: str
    phone_masked: str
    expires_at: date
    days_remaining: int
    producer_license_number: str | None = None


class LicenseExpiryReminderOut(BaseModel):
    window_days: int
    total: int
    rows: list[LicenseExpiryReminderRow] = []


class KashrutRejectIn(BaseModel):
    # MEH-2518: the owner reads this in her dashboard — bound it.
    notes: str | None = Field(None, max_length=1000)


# MEH-2518: kashrut certificates carry a printed expiry, usually 3-12 months
# out. The approve action takes that date from the certificate instead of
# inventing approval + 365 days. 400 days is a typo guard, not a policy.
KASHRUT_EXPIRY_MAX_DAYS = 400


class KashrutApproveIn(BaseModel):
    expires_on: date

    @field_validator("expires_on")
    @classmethod
    def _expires_on_in_range(cls, v: date) -> date:
        today = israel_today()
        if v <= today:
            raise ValueError("תאריך התוקף של התעודה חייב להיות אחרי היום")
        if v > today + timedelta(days=KASHRUT_EXPIRY_MAX_DAYS):
            raise ValueError("תאריך התוקף רחוק מדי — בדקי את התאריך שמודפס על התעודה")
        return v


class KashrutRevokeIn(BaseModel):
    notes: str | None = Field(None, max_length=1000)


class OtpConfirmIn(BaseModel):
    code: str


# MEH-3302: a user's phone-verification code — exactly six digits.
class UserPhoneOtpConfirmIn(BaseModel):
    code: str = Field(..., pattern=r"^[0-9]{6}$")


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


class ProducerRejectIn(BaseModel):
    """MEH-226: admin "reject" payload — preset key + optional free text.

    REUSES: schemas.py:2473 RequestChangesIn — same shape (optional free text
    emailed to the producer verbatim, handler owns the emptiness rule). The
    added `preset_key` selects one of the five canonical rejection reasons;
    the label itself lives in the BACKEND
    (`admin.py::PRODUCER_REJECTION_PRESETS`), not here and not in the
    frontend, so the persisted text, the email and the admin UI cannot drift
    apart (workflow.md Smell #1). Key validity is checked in the handler
    alongside the "other requires free text" rule, mirroring
    request_producer_changes' handler-side 400.

    Back-compatible with the pre-MEH-226 body `{"reason": "..."}` — the
    endpoint took `reason: str = Body("", embed=True)`, which parses into
    this model unchanged.
    """

    preset_key: str | None = None
    reason: str | None = Field(None, max_length=2000)


class RejectionPresetOut(BaseModel):
    """MEH-226: one row of GET /admin/producers/rejection-presets.

    Typed rather than a bare dict so the MEH-1748 codegen chain emits a real
    schema for this route — an untyped handler generates `zod.unknown()`,
    which makes the drift guard structurally unable to notice the shape
    changing.
    """

    key: str
    label: str
