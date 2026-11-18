"""
Module:    models/events
Purpose:   Events, workshops (experiences), their registrations and group
           buys.
Does NOT:  Hold the organiser or the business row (models.py).
Split out of models/models.py (MEH-3269); the code is moved verbatim and
every name is still importable from app.models.models.
"""

import uuid
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import backref, relationship
from app.database import Base
from app.utils.clock import utc_now


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
    # MEH-2469: optional end time ("09:30–15:00"); end > event_time is
    # enforced in the request schemas + update route, not by a DB CHECK.
    end_time = Column(Time, nullable=True)
    location = Column(String(300))  # "בחווה שלנו" / full address
    city = Column(String(100))
    lat = Column(Float)
    lng = Column(Float)
    image_url = Column(Text)
    # MEH-1657: one of routers/events.py VALID_CATEGORIES —
    # "שוק" | "קטיף" | "טעימות" | "אחר".
    category = Column(String(30), nullable=False)
    price = Column(Integer, default=0)  # 0 = free
    max_participants = Column(Integer, nullable=True)
    registration_url = Column(String(500), nullable=True)  # external signup link
    # MEH-2763: how a visitor signs up — the owner picks it per event. One of
    # REGISTRATION_METHODS; CHECK in revision e8c4a1f2b7d9.
    registration_method = Column(
        String(20),
        nullable=False,
        server_default=text("'site_form'"),
        default="site_form",
    )
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)

    producer = relationship("Producer")


class Experience(Base):
    """
    Community-submitted experiences (workshops, food tours, nutrition classes).

    Intentionally separate from `Event`. The axis is ONE-TIME vs SIGN-UP
    (locked 27/07, reaffirmed 28/07 — MEH-1657):
      - Event      = something that happens ONCE, on a date. An open day, a
                     market stall, a seasonal harvest, a launch. Flat `price`,
                     an external `registration_url`, and that's it.
      - Experience = a guided activity people SIGN UP for. Priced per person,
                     capped, and repeatable — which is why this model carries
                     `is_recurring`, `recurring_schedule`, `price_per_person`,
                     `participants_count`, `duration_minutes` and
                     `requirements`, and Event carries none of them.

    Industry precedent for the split: Airbnb Experiences (recurring, bookable,
    per-person) vs Eventbrite (dated events, multiple dates resolved *inside*
    one event rather than as a separate entity).

    Host type is an IMPLEMENTATION DETAIL of that axis, not the definition:
    an Experience is keyed on `host_user_id` (a User) while an Event is keyed
    on `producer_id`, and an Experience additionally requires Claude
    pre-moderation AND admin approval. This docstring previously stated the
    axis WAS who hosts — that was stale, the fields had already overtaken it,
    and it actively misled readers into thinking the two models overlap.

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
    # e.g. "בישול" | "תזונה" | "סיור אוכל" — keys mirror
    # frontend/lib/event-categories.js EXPERIENCE_CATEGORIES.
    category = Column(String(50), nullable=True)

    # Host — an email-verified producer-role user (not necessarily an
    # approved business): submit_experience requires require_verified_producer
    # (MEH-2246: role + email_verified), and the public feed INNER-JOINs
    # Producer + is_business() (experiences._publicly_visible_query), so a
    # consumer-hosted row could never be public. MEH-2870: this used to say
    # "any logged-in user (consumer / producer / admin)".
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
    # MEH-2665: optional minimum to run it; the page reads it against the
    # host-reported participants_count («נפתחת ב-N נרשמים לפחות»).
    min_participants = Column(Integer, nullable=True)
    participants_count = Column(Integer, default=0)
    price_per_person = Column(Numeric(10, 2), nullable=True)  # NULL / 0 = free

    # Prep
    requirements = Column(Text, nullable=True)

    # MEH-2763: how a visitor signs up — the host picks it per experience (one
    # of REGISTRATION_METHODS). registration_url is used by "external_url" only.
    registration_method = Column(
        String(20),
        nullable=False,
        server_default=text("'site_form'"),
        default="site_form",
    )
    registration_url = Column(String(500), nullable=True)

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

    # MEH-1419: reversible host cancel — mirrors Event.is_active (models.py:903).
    # Non-null + server_default true to match the MEH-1419 Alembic migration
    # (keeps `alembic check` drift-free; existing rows backfill to active). The
    # public list filters is_active IS TRUE; /mine returns inactive too so the
    # dashboard can show + reactivate a cancelled experience.
    is_active = Column(
        Boolean, nullable=False, server_default=text("true"), default=True
    )

    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    host = relationship("User", foreign_keys=[host_user_id])


# MEH-2763: the four ways an event / experience owner can take sign-ups.
# "site_form" stores a Registration row; the other three are outbound links
# the site never observes (ADR-031).
REGISTRATION_METHODS = ("site_form", "whatsapp", "phone", "external_url")


class Registration(Base):
    """MEH-2763 — one visitor's sign-up to an event OR an experience, taken
    through the on-site form (registration_method = "site_form").

    No account: name, phone and email are what the visitor typed. They are
    shown to the owner (dashboard list + notification email) and purged 30
    days after the item's date (services/retention_purge.py) — the promise the
    form makes under the submit button.

    Exactly one of event_id / experience_id is set (CHECK). Two real FKs
    rather than a (kind, item_id) pair, so deleting the item cascades.
    cancel_token is the only credential for the visitor's cancel link.
    """

    __tablename__ = "registrations"
    __table_args__ = (
        CheckConstraint(
            "(event_id IS NULL) <> (experience_id IS NULL)",
            name="ck_registrations_one_item",
        ),
        CheckConstraint(
            "status IN ('registered', 'cancelled')",
            name="ck_registrations_status",
        ),
        Index("ix_registrations_event_id", "event_id"),
        Index("ix_registrations_experience_id", "experience_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=True
    )
    experience_id = Column(
        UUID(as_uuid=True),
        ForeignKey("experiences.id", ondelete="CASCADE"),
        nullable=True,
    )
    name = Column(String(100), nullable=False)
    phone = Column(String(20), nullable=False)
    email = Column(String(200), nullable=False)
    cancel_token = Column(String(64), nullable=False, unique=True)
    status = Column(
        String(20),
        nullable=False,
        server_default=text("'registered'"),
        default="registered",
    )
    created_at = Column(DateTime, nullable=False, default=utc_now)
    cancelled_at = Column(DateTime, nullable=True)

    event = relationship("Event")
    experience = relationship("Experience")


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
    # MEH-1457: free-text "מתי ואיך מקבלים" (OFN "Ready for" precedent).
    # Nullable — hidden on the public page when NULL. Alembic-only (MEH-267).
    fulfillment_note = Column(Text, nullable=True)
    # MEH-2621: the same answer split in two — where/when to pick up, and
    # where/for how much it is delivered. New rows carry one or both; rows
    # from before carry only fulfillment_note. Alembic-only (MEH-267).
    pickup_note = Column(Text, nullable=True)
    delivery_note = Column(Text, nullable=True)
    # open | funded | cancelled | fulfilled
    status = Column(String(20), default="open", nullable=False)
    # MEH-1651: one-way latch for the open->funded notification pair. NULL =
    # never sent. `status` cannot carry this on its own because it legitimately
    # flaps: cancelling below min_participants reverts it to "open" and the next
    # join re-crosses the threshold, so a status-keyed send would re-spam every
    # participant on every flap.
    # DO NOT clear this on the funded->open revert path — that re-arms the
    #        notification, which is the exact failure the column prevents.
    funded_notified_at = Column(DateTime, nullable=True)
    # MEH-3311: one-way stamps for the funded→open→funded flap. Each is set at
    # most once, so a flapping group mails each participant at most three
    # times in all (funded, below goal, back at goal).
    below_goal_notified_at = Column(DateTime, nullable=True)
    refunded_notified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    # MEH-2503: passive_deletes defers to the DB ON DELETE CASCADE. Without it
    # db.delete(producer) tried to NULL the NOT NULL producer_id → 500 on
    # every delete of a business that ever had a group buy (MEH-816 class).
    producer = relationship(
        "Producer", backref=backref("group_buys", passive_deletes=True)
    )
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
    created_at = Column(DateTime, default=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("group_buy_id", "user_id", name="uq_group_buy_user"),
    )

    group_buy = relationship("GroupBuy", back_populates="commits")
    # MEH-2503: same as GroupBuy.producer — a user who ever joined a group buy
    # could not delete her account (NotNullViolation on user_id).
    user = relationship(
        "User", backref=backref("group_buy_commits", passive_deletes=True)
    )
