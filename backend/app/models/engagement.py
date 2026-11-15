"""
Module:    models/engagement
Purpose:   What visitors do with a business page: favourites, saved
           items, alerts, delivery waitlist, reviews, newsletter, contact
           messages, reports, search queries.
Does NOT:  Hold view or click counters (analytics.py).
Split out of models/models.py (MEH-3269); the code is moved verbatim and
every name is still importable from app.models.models.
"""

import uuid
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship
from app.database import Base
from app.utils.clock import utc_now


class Favorite(Base):
    __tablename__ = "favorites"

    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at = Column(DateTime, default=utc_now)

    user = relationship("User", back_populates="favorites")
    producer = relationship("Producer", back_populates="favorited_by")


# MEH-2556: the content types a user can save next to a business. One list,
# mirrored by the DB CHECK in Alembic revision 9c534d477f2b — a new type means
# a new revision AND an entry here, never one without the other.
SAVED_ITEM_TYPES = ("recipe", "event", "experience")


class SavedItem(Base):
    """MEH-2556 — a recipe, event or experience a user saved to «המועדפים שלי».

    Businesses keep their own `favorites` table: `FavoriteAlert` (the
    «קבלת עדכונים» preferences) hangs off a saved business, and nothing hangs
    off a saved recipe or event. Two tables, two jobs — this one is not a
    second owner of business favorites (MEH-271 smell #1).

    `item_id` has no foreign key on purpose: it points at a different table per
    `item_type`. The read path (MEH-2557) joins each type against its own table
    and serves only rows that are still public, so a deleted or hidden item
    drops out of the list instead of 500'ing — the same contract
    `GET /users/me/favorites` keeps for businesses (MEH-248, MEH-2513).

    `user_id` cascades: deleting an account deletes its saves. No separate
    index on it: the UNIQUE (user_id, item_type, item_id) btree leads with
    user_id and already serves every per-user query.
    """

    __tablename__ = "saved_items"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "item_type", "item_id", name="uq_saved_items_user_item"
        ),
        # Built from SAVED_ITEM_TYPES so the model holds one copy of the list,
        # not two; the revision's literal CHECK is pinned by a test.
        CheckConstraint(
            "item_type IN ({})".format(", ".join(f"'{t}'" for t in SAVED_ITEM_TYPES)),
            name="saved_items_item_type_check",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    item_type = Column(String(20), nullable=False)
    item_id = Column(UUID(as_uuid=True), nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)


class FavoriteAlert(Base):
    """MEH-54: per-producer alert preferences for favorited producers.

    One row per (user, producer) pair — UNIQUE enforced at DB level.
    Each bool controls whether that alert type fires for this user+producer.
    push_subscription stores the Web Push API subscription JSON
    ({endpoint, keys: {p256dh, auth}}); nullable when push not granted.
    """

    __tablename__ = "favorite_alerts"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "producer_id", name="uq_favorite_alert_per_producer"
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    notify_new_product = Column(Boolean, default=True)
    notify_new_event = Column(Boolean, default=True)
    notify_delivery_area = Column(Boolean, default=True)
    # MEH-1361: 4th alert type — fires when a favorited producer's recipe
    # first becomes publicly visible (admin approve). server_default in the
    # migration opts existing rows in, matching the sibling columns' default.
    notify_new_recipe = Column(Boolean, default=True)
    # MEH-2828: 5th alert type — fires when a favorited producer opens a group
    # buy. Nullable + server_default true, exactly like MEH-1361; unlike the
    # siblings, the code reads NULL as ON (alerts.py, Sapir 08/11).
    notify_new_group_buy = Column(Boolean, default=True)
    # MEH-3117: 6th alert type — fires when a favorited producer publishes
    # rescue bags for TODAY. Same shape as notify_new_group_buy (NULL = ON).
    notify_new_rescue = Column(Boolean, default=True)
    push_subscription = Column(JSON, nullable=True)
    whatsapp_opt_in = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    user = relationship("User")
    producer = relationship("Producer")


class DeliveryWaitlistEntry(Base):
    """MEH-2618: «תודיעו לי כשתגיעו ל{עיר}» — one row per (business, city, email).

    The Oddbox / Hungry Harvest pattern: a visitor whose city the business does
    not deliver to leaves an email and the city, with NO account, and is mailed
    once when the business adds that city to its delivery areas
    (services/delivery_waitlist.notify_cities, fired from PUT /producers/me).

    `city` keeps the visitor's own spelling for the email she receives;
    `city_key` is `app.data.cities.city_key(city)` — the same comparison form
    `GET /cities` and the favorite-alert geo filter use — so "תל אביב - יפו"
    typed by the business matches "תל אביב-יפו" typed by her. The UNIQUE is on
    the key, not the display spelling, so one person cannot occupy two rows
    with two spellings.

    `user_id` is set when she was signed in (ON DELETE SET NULL: deleting the
    account keeps the email's own consent intact; the unsubscribe link in
    every email removes the row). `notified_at` is the once-only guard.
    """

    __tablename__ = "delivery_waitlist"
    __table_args__ = (
        UniqueConstraint(
            "producer_id", "city_key", "email", name="uq_delivery_waitlist_city_email"
        ),
        Index("ix_delivery_waitlist_producer_city", "producer_id", "city_key"),
        # MEH-2673: the per-address resend cooldown looks up by email.
        Index("ix_delivery_waitlist_email_host_sent", "email", "host_confirm_sent_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    city = Column(String(60), nullable=False)
    city_key = Column(String(60), nullable=False)
    email = Column(String(200), nullable=False)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime, default=utc_now, nullable=False)
    notified_at = Column(DateTime, nullable=True)
    # MEH-2673: «אשמח לארח נקודת מסירה ב{עיר}». True = she ticked the box AND
    # clicked the confirmation link mailed to this address — consent for THIS
    # business to see her email; the owner reads it on /producers/me/analytics
    # → pickup_hosts. Set only by POST /delivery-waitlist/host-confirm; a later
    # plain signup does not flip it back (the unsubscribe link removes the row).
    wants_to_host = Column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # MEH-2673: when the last host-confirmation mail went out — the per-entry
    # resend cooldown (services/delivery_waitlist.claim_host_confirm_send).
    host_confirm_sent_at = Column(DateTime, nullable=True)
    # MEH-2673: when the link was clicked — the consent record behind
    # wants_to_host (Privacy Law amendment 13: who consented to what, when).
    host_confirmed_at = Column(DateTime, nullable=True)

    producer = relationship("Producer")


class AlertLog(Base):
    """MEH-1338: append-only ledger of delivered favorite-alerts, per channel —
    the frequency-cap backing store for `fire_alerts`.

    The cap is "at most one message per (user, producer, channel) in a rolling
    24h window", so the cap check is an EXISTS on
    (user_id, producer_id, channel, sent_at >= now-24h) — the composite index
    below serves exactly that lookup. `alert_type` is recorded but is NOT part
    of the cap key (a new_product and a new_event from the same producer on the
    same channel within 24h still collapse to one send); it is kept for a
    future digest / analytics.

    Append-only from the request path; rows older than 30 days are deleted by
    the daily retention purge (services/retention_purge.py, MEH-2303). Rows
    CASCADE-delete with their user/producer.
    """

    __tablename__ = "alert_log"
    __table_args__ = (
        Index(
            "ix_alert_log_cap_lookup",
            "user_id",
            "producer_id",
            "channel",
            "sent_at",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    channel = Column(String(16), nullable=False)  # "push" | "whatsapp"
    alert_type = Column(
        String(32), nullable=False
    )  # new_event|new_product|delivery_area
    sent_at = Column(DateTime, default=utc_now, nullable=False)


class Report(Base):
    __tablename__ = "reports"
    # MEH-773: one report per (reporter, producer) — closes the
    # check-then-act race (matches migration 382128b23383).
    __table_args__ = (
        UniqueConstraint(
            "reporter_id", "producer_id", name="uq_report_reporter_producer"
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reporter_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    reason = Column(Text)
    created_at = Column(DateTime, default=utc_now)
    # MEH-1266: report lifecycle. status ∈ {open, resolved, dismissed};
    # dashboard counters + /admin/reports filter on status == "open".
    status = Column(
        String,
        nullable=False,
        default="open",
        server_default=text("'open'"),
    )
    resolved_at = Column(DateTime, nullable=True)
    # SET NULL (not CASCADE): closing an account must not delete the report
    # history — only drop the resolver attribution.
    resolved_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    reporter = relationship("User", foreign_keys=[reporter_id])
    resolver = relationship("User", foreign_keys=[resolved_by])
    producer = relationship("Producer", back_populates="reports")


class NewsletterSubscriber(Base):
    __tablename__ = "newsletter_subscribers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(200), unique=True, nullable=False)
    created_at = Column(DateTime, default=utc_now)


class ContactMessage(Base):
    __tablename__ = "contact_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    email = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utc_now)


class ProducerReview(Base):
    """Public reviews for producers (not for home-products — those have
    HomeProductRating). One review per user per producer (unique constraint).
    Aggregates maintained on producers.avg_rating + reviews_count.
    """

    __tablename__ = "producer_reviews"
    __table_args__ = (
        UniqueConstraint(
            "producer_id", "user_id", name="uq_one_review_per_producer_per_user"
        ),
        # MEH-1428: DB-level twin of the Pydantic Literal on `source` — added
        # by revision 3f9a7c2e5d18 alongside the column.
        CheckConstraint(
            "source IN ('click', 'invite_link')",
            name="ck_producer_reviews_source",
        ),
        # MEH-2349: REJECTED is never stored (it is a 422), so only these two.
        # A CHECK passes on NULL, so no "IS NULL OR" is needed.
        CheckConstraint(
            "ai_moderation_status IN ('APPROVED', 'FLAGGED')",
            name="ck_producer_reviews_ai_moderation_status",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    stars = Column(Integer, nullable=False)  # 1-5
    body = Column(Text, nullable=True)
    is_hidden = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utc_now)
    # MEH-1039: business-owner reply to a customer review — one per review,
    # set/edited only by the producer owner (review.producer_id ==
    # user.producer_id). Both nullable / Expand-only (ADR-007) — existing rows
    # predate the reply. Naive DateTime to match created_at above and the
    # utcnow() the endpoint writes (CHUNK B). Alembic revision b8f3d21a9c47.
    reply = Column(Text, nullable=True)
    reply_at = Column(DateTime, nullable=True)
    # MEH-1428 chunk 1: how the reviewer passed the contact gate —
    # "click" (a WhatsApp/contact click row, the pre-MEH-1428 path) or
    # "invite_link" (a signed "request a review" token, reviews.py guard 3).
    # NOT NULL with a server_default so every pre-existing row reads "click"
    # without a backfill — Expand-only (ADR-007). Alembic revision
    # 3f9a7c2e5d18 (down_revision f5b8d2c7a3e9 — re-pointed 05/09 when the
    # branch was synced onto staging; the revision docstring records it).
    source = Column(String(20), nullable=False, server_default="click")
    # MEH-2349: the AI verdict on the body at the last write — "APPROVED" |
    # "FLAGGED". NULL = no verdict: no body, every row that predates the
    # column, and (MEH-2390) a fail-open, so its next save re-checks; the
    # fail-open signal is the MEH-2352 Sentry report. Informational: a
    # FLAGGED review still publishes.
    # Nullable, Expand-only (ADR-007). Alembic revision c4e81a2f9b6d.
    ai_moderation_status = Column(String(16), nullable=True)
    # MEH-2381: when the author last changed body or stars while the review
    # was hidden. NULL = not edited since the admin last hid or unhid it (both
    # clear it). Admin-only signal. Nullable, Expand-only (ADR-007). Alembic
    # revision d7a3f5c1e2b8.
    edited_after_hidden_at = Column(DateTime, nullable=True)

    producer = relationship("Producer", back_populates="reviews")
    user = relationship("User")


class SearchQuery(Base):
    """Search telemetry — one row per /producers?search=... query.

    Written from producers.py:310 (after search).  Read from search.py:218 to
    compute /search/trending.
    """

    __tablename__ = "search_queries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query = Column(Text, nullable=False)
    results_count = Column(Integer, nullable=False, default=0)
    searched_at = Column(DateTime, nullable=False, default=utc_now)
