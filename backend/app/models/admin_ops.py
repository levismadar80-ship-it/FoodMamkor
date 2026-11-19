"""
Module:    models/admin_ops
Purpose:   Rows the admin side runs on: outreach leads, phone OTP tokens,
           requests awaiting a decision (kashrut badge, category, name
           change), inbound and outbound messages, the admin checklist,
           producer review checks, the Alembic lineage row.
Does NOT:  Hold public content.
Split out of models/models.py (MEH-3269); the code is moved verbatim and
every name is still importable from app.models.models.
"""

import uuid
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import backref, relationship
from app.database import Base
from app.utils.clock import utc_now


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
    # MEH-2633: "community" is a visitor suggestion from POST
    # /business-suggestions (routers/business_suggestions.py) — the suggester
    # columns below are populated only for that value.
    source = Column(
        String(50), default="manual"
    )  # manual | community | claude_search (future)
    status = Column(
        String(20), default="new"
    )  # new | contacted | replied | registered | declined
    # Prefill token — minted on demand for "הכן פרופיל". Single-use is
    # not enforced; the token expires 30 days after mint and is rotated
    # whenever the admin clicks the button again.
    prefill_token = Column(String(64), unique=True, nullable=True, index=True)
    prefill_token_expires_at = Column(DateTime, nullable=True)
    # MEH-2633: community-suggestion columns. Populated ONLY when
    # source == "community"; NULL on every manually-added lead, which is the
    # honest value (nobody suggested it). Paired with revision d7a511246b14.
    # PII: `suggested_by_email` is NEVER returned by a public endpoint — the
    # only reader is OutreachLeadOut, behind require_admin — and never logged
    # unmasked (services/email.py:47 `_mask`).
    # DO NOT add these columns in main.py — Alembic is the sole schema
    #        authority since MEH-267.
    suggested_by_name = Column(String(100), nullable=True)
    suggested_by_email = Column(String(254), nullable=True)
    # NOT NULL + server_default false: consent to be emailed has no "unknown"
    # state and the default is the one that sends nothing. Same shape as
    # categories.is_system (:977).
    suggester_wants_update = Column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    suggestion_reason = Column(Text, nullable=True)
    # Stamped by POST /admin/outreach/{id}/thank-suggester; it IS that
    # endpoint's idempotency key, so nothing else may write it.
    suggester_thanked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


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
    created_at = Column(DateTime, default=utc_now, nullable=False)

    # MEH-773 (Chunk B): passive_deletes defers child cleanup to the DB
    # ON DELETE CASCADE (producer_id is NOT NULL) instead of the ORM
    # unit-of-work trying to nullify it → NotNullViolation 500 (MEH-755).
    producer = relationship(
        "Producer", backref=backref("otp_tokens", passive_deletes=True)
    )


class UserPhoneOtpToken(Base):
    """MEH-3301 (D14): one-time WhatsApp code that verifies a USER's phone.

    The sibling of PhoneOtpToken (which verifies a business phone), kept as
    its own table so the user flow carries its own hardening: `phone` is the
    canonical number the code was sent to (the code is bound to it — a phone
    change expires it), and `attempts` counts wrong guesses (5 per token).
    Rows go with the user (ON DELETE CASCADE). Written only by the D14
    routes (MEH-3302); nothing reads it before then.
    """

    __tablename__ = "user_phone_otp_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    phone = Column(String(30), nullable=False)
    code = Column(String(6), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False, nullable=False, server_default="false")
    attempts = Column(Integer, default=0, nullable=False, server_default="0")
    created_at = Column(DateTime, default=utc_now, nullable=False)

    # passive_deletes: the DB cascade removes the rows (same reason as
    # PhoneOtpToken, MEH-755).
    user = relationship(
        "User", backref=backref("phone_otp_tokens", passive_deletes=True)
    )


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
    created_at = Column(DateTime, default=utc_now, nullable=False)

    # MEH-773 (Chunk B): passive_deletes defers to DB ON DELETE CASCADE —
    # closes the latent NotNullViolation on producer delete (kashrut_requests
    # had no explicit pre-delete, unlike phone_otp_tokens / MEH-755).
    producer = relationship(
        "Producer", backref=backref("kashrut_requests", passive_deletes=True)
    )
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
    created_at = Column(DateTime, default=utc_now, nullable=False)
    reviewed_at = Column(DateTime, nullable=True)

    producer = relationship("Producer", backref="category_requests")


class ProducerNameChangeRequest(Base):
    """MEH-1872: an owner's request to change her business name, held for
    re-moderation instead of written straight onto ``producers.name``.

    MEH-1851 removed `name` from `_PRODUCER_WRITABLE_FIELDS` because a plain
    `setattr` let an approved business become a different business after
    approval — a hole in the DNA-LOCK "every business is approved by hand".
    Closing it left owners with no way to fix a typo at all. This table is the
    sanctioned route back: the request waits, the public name does not move.

    A separate table rather than a `pending_name` column (Sapir's ruling,
    09/08) so the decision keeps an audit trail and a second request cannot
    silently overwrite the first.

    REUSES: the CategoryRequest shape directly above — same status/admin_notes/
    reviewed_at triple, same admin-queue idiom.
    """

    __tablename__ = "producer_name_change_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # The name as it stood when the request was filed. Stored rather than read
    # back from the producer at review time: the admin must judge the change
    # she was actually asked to approve, and `producers.name` can move under
    # her (another approved request, an admin edit) between filing and review.
    current_name = Column(String(100), nullable=False)
    requested_name = Column(String(100), nullable=False)
    reason = Column(Text, nullable=True)
    status = Column(String(20), default="pending", nullable=False, index=True)
    admin_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    reviewed_at = Column(DateTime, nullable=True)

    # MEH-2503: same NOT NULL + no-cascade shape as GroupBuy.producer.
    producer = relationship(
        "Producer", backref=backref("name_change_requests", passive_deletes=True)
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
        default=utc_now,
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
    'window_expired', consistent with availability_state — plus
    'blocked_nonprod' outside production only (MEH-3402: the guard dropped
    the send). For those rows `error_message` holds what the message would
    have said, not an error; never feed them into error grouping.
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
        default=utc_now,
        server_default=text("now()"),
    )
    updated_at = Column(DateTime, nullable=True)


class AdminChecklistItem(Base):
    """MEH-1399: one row of the pre-approval review checklist, editable by the
    admin without a deploy.

    Phase 1 (MEH-1396) shipped these 7 items as a frozen frontend constant
    (``frontend/lib/admin-review-checklist.js``). The migration copied those
    items in, every reader goes through this table, and the constant itself was
    deleted (MEH-2954).

    Rows are retired with ``active = False``, never deleted. That is not a
    convention to remember — ``producer_review_checks.item_id`` is
    ``ON DELETE RESTRICT``, so the database refuses to delete an item any admin
    has ever ticked. Deleting one would orphan the audit trail's subject.

    ``position`` orders the list; the seed spaces values 10 apart so an item can
    be inserted between two others without renumbering the rest.
    """

    __tablename__ = "admin_checklist_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    position = Column(Integer, nullable=False, index=True)
    label = Column(Text, nullable=False)
    hint = Column(Text, nullable=True)
    active = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    # Only `updated_at`, deliberately: the question anyone asks of a config row
    # is when it last changed, not when it was first written. The audit surface
    # is ProducerReviewCheck below.
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class ProducerReviewCheck(Base):
    """MEH-1399: the audit record — this item was ticked for this producer, by
    this admin, at this time.

    Phase 1's ticks were session-local and evaporated on collapse, so nothing
    recorded WHAT was verified before a business went live. One row per
    (producer, item); the unique constraint makes the tick idempotent, so a
    double-click cannot produce two conflicting attestations.

    ``label_snapshot`` looks redundant next to ``item_id`` and is the opposite.
    The FK says WHICH item was ticked; the snapshot says what that item SAID at
    the moment of ticking. Without it, an admin editing an item's wording later
    would silently rewrite the meaning of every historical attestation — the
    audit trail would then describe a check nobody actually performed. Same
    reasoning as ProducerNameChangeRequest.current_name.

    ``checked_by`` is nullable with ON DELETE SET NULL: deleting an admin
    account must not delete the record that a check happened. A null actor is a
    weaker record than a named one and a far better one than none.

    An UNCHECKED item is the ABSENCE of a row, not a row with a false flag —
    which is why there is no `checked` boolean. "Never ticked" and "ticked then
    un-ticked" are deliberately indistinguishable here; the ticket asks for a
    record of what was verified, not a keystroke log.
    """

    __tablename__ = "producer_review_checks"
    __table_args__ = (
        UniqueConstraint(
            "producer_id", "item_id", name="uq_producer_review_checks_producer_item"
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("admin_checklist_items.id", ondelete="RESTRICT"),
        nullable=False,
        # Indexed in its own right. The unique constraint in __table_args__ is
        # (producer_id, item_id) and leads with producer_id, so it cannot serve
        # the item_id-only lookup Postgres performs to enforce the RESTRICT on
        # every DELETE against admin_checklist_items.
        index=True,
    )
    label_snapshot = Column(Text, nullable=False)
    checked_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        # Same reasoning as item_id above, on the other FK: SET NULL makes
        # Postgres find every referencing row on each admin-account DELETE, and
        # unindexed that is a sequential scan of an append-only audit table.
        # Rare operation, unbounded table — the index is cheap insurance.
        index=True,
    )
    checked_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    item = relationship("AdminChecklistItem")


class AlembicLineage(Base):
    """MEH-2903 — every Alembic revision a booted image has applied here.

    `alembic_version` holds only the current head, so an OLDER image booting on
    a newer database (a rollback) cannot tell whether its own head is an
    ancestor of the database's revision. `scripts/migrate_on_boot.py` records
    the image's whole chain after each successful `upgrade head`, and an older
    image takes rollback mode only if its head is listed here.

    Boot bookkeeping, not app data: nothing in `app/` reads or writes it.
    History:  MEH-2903 (creation)
    """

    __tablename__ = "alembic_lineage"

    revision = Column(String(64), primary_key=True)
    recorded_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AdminAuditLog(Base):
    """MEH-3306 — one row per successful change an admin made.

    Append-only: the app adds a row (services/admin_audit.py) and reads it
    (GET /admin/audit-log). Nothing updates or deletes one —
    tests/test_meh3306_admin_audit_log.py scans for it.

    `actor_id` is NOT a foreign key, on purpose: a FK needs an ON DELETE rule,
    and both rules are wrong here — CASCADE erases the record with the
    account, SET NULL is an UPDATE on an append-only table and erases who.
    `details` holds a reduced before/after (role, status, a flag) — never
    names, phones, addresses or free text. `ip` is kept for an investigation
    and is not returned by the list route.
    """

    __tablename__ = "admin_audit_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    # "PUT /admin/users/{user_id}/role" — method + route TEMPLATE, never the URL.
    action = Column(String(160), nullable=False)
    target_type = Column(String(40), nullable=True)
    target_id = Column(String(64), nullable=True)
    details = Column(JSONB, nullable=True)
    ip = Column(String(64), nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
