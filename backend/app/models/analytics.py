"""
Module:    models/analytics
Purpose:   Counters and daily rollups: page views, contact and WhatsApp
           clicks, per-day analytics.
Does NOT:  Hold anything a person wrote (engagement.py).
Split out of models/models.py (MEH-3269); the code is moved verbatim and
every name is still importable from app.models.models.
"""

import uuid
from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
from app.utils.clock import utc_now


# ============================================================
# Analytics — feature/producer-analytics
# ============================================================


class ProducerPageView(Base):
    """Raw row per GET /producers/{id} hit (minus bot user-agents).

    The row is the source of truth for:
      - Producer dashboard: profile_views (7d / 30d / total), views_by_day
        (30-day chart), top_cities aggregation, search_appearances (rows
        with referrer='search'), weekly_trend (rank_in_city too, until MEH-2529
        removed it).
      - Admin dashboard: top cities across all producers.

    MEH-160: EVERY one of those readers counts through
    `services/analytics.py::unique_views_count` — one view per visitor per
    Israel calendar day. Rows stay raw here; the dedupe is entirely at read
    time, so the change is reversible and no history is lost. A new reader
    that calls `func.count(id)` on this table re-introduces the inflation
    the column was added to prevent.

    Privacy: we store `viewer_ip_hash` (SHA-256, salted from
    `settings.secret_key`) rather than the raw IP — enough to dedupe uniques
    without keeping PII indefinitely. The salt is deploy-scoped, NOT
    time-rotating: it changes only when the deploy's secret changes, which
    resets uniques (rare, accepted). See docs/SECURITY.md for the full
    rationale.
    """

    __tablename__ = "producer_page_views"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # SHA-256 hex (64 chars) of IP + salt. NULL only if the request had
    # no usable client IP (unit tests, some proxy configs).
    viewer_ip_hash = Column(String(64), nullable=True)
    # City the viewer is located in — filled from the authenticated user's
    # `city` field when available, NULL for anonymous viewers. We deliberately
    # do NOT geolocate raw IPs (no MaxMind DB in the image, no external API
    # dependency on the hot path of /producers/{id}).
    city = Column(String(100), nullable=True)
    # Where the view came from — lets the producer dashboard answer
    # "how often did people find me via search" without a separate impression
    # table. NULL = direct/unknown, or a value outside the allowlist.
    # MEH-1558: the allowlist is the authority (_ALLOWED_REFERRERS,
    # services/analytics.py:213, enforced by record_analytics_event) — this
    # comment mirrors it and must be updated with it. Anything not listed
    # there is stored as NULL.
    referrer = Column(
        String(30), nullable=True
    )  # search | map | category | home | favorites | follow
    # | producers-index | similar | nearby | None
    created_at = Column(DateTime, default=utc_now, nullable=False, index=True)


class ProducerWhatsAppClick(Base):
    """Raw row per click on a WhatsApp CTA on a producer detail page.

    Distinct from `HomeProductWhatsAppClick` — that table tracks clicks on
    *home-product* cards (which also dispatches a rating SMS 24h later).
    Producer-page clicks are simpler: we just count them for the producer
    dashboard's `whatsapp_clicks` metric, no rating loop.

    Written from `POST /producers/{id}/whatsapp-click`, which is anonymous
    and rate-limited 10/minute per IP (slowapi). user_id is set when the
    caller is authenticated (optional JWT) so the producer can see how many
    unique registered users clicked.
    """

    __tablename__ = "producer_whatsapp_clicks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    clicked_at = Column(DateTime, default=utc_now, nullable=False, index=True)
    # MEH-1677: the city a coverage-request click ("לא מגיעים אליך?") was
    # asking about. NULL on an ORDINARY WhatsApp click and on every row that
    # predates this column -- only CoverageRequestCta sends a city, so NULL
    # means "not a coverage click" and never "we lost it". Length mirrors the
    # 60-char cap the request schema enforces after trim.
    city = Column(String(60), nullable=True)


class ProducerAnalyticsDaily(Base):
    """MEH-2079 chunk A: the anonymous daily roll-up that lets the raw
    analytics tables be pruned without the owner's dashboard losing history.

    Sapir's ruling 05/09: `producer_page_views` and `producer_whatsapp_clicks`
    keep 90 days of RAW rows and are then deleted, while this table keeps the
    per-day counts forever. The point of the pair is stated in the ruling as
    "אפס שינוי נראה לבעלת העסק" — the owner's numbers must not move when the
    purge first runs.

    ANONYMOUS BY CONSTRUCTION, and that is the whole reason it may be kept
    without a bound: no `viewer_ip_hash`, no `city`, no `user_id`, no row-level
    anything. A count per (business, day) says nothing about any person, so
    Amendment 13's storage-limitation principle does not bite on it the way it
    bites on the pseudonymous raw rows (`analytics.py:163` — SHA-256 of the IP
    with a deploy-scoped salt is personal data, not anonymous data).

    THE COUNTS ARE DEDUPED, NOT RAW ROW COUNTS. `views_unique` and
    `views_search_unique` store what `services/analytics.py::unique_views_count`
    computes — one view per visitor per Israel calendar day (MEH-160) — because
    that is what every reader of the raw table already shows. Summing raw rows
    here instead would make the owner's "total" jump upward the moment the
    aggregate half of the window starts being read, which is the same
    inflation MEH-160 removed, reintroduced through a side door.
    `whatsapp_clicks` is a plain count, matching its reader
    (`producer_me.py`'s `windowed(ProducerWhatsAppClick, ...)`, no distinct).

    `day` is an Israel calendar day (`utils/clock.py::israel_today`), a DATE
    and not a timestamp — the same MEH-1883 reasoning as every other date
    column here.

    Chunk A creates the table and NOTHING else: no writer, no reader, no
    scheduler entry. Chunk B adds the roll-up job and the `windowed()` total
    path; chunk C adds the purge and must not merge before the privacy-policy
    wording is live (MEH-1981).

    # DO NOT add a person-level column to this table — its whole licence to
    #        exist unbounded is that it carries none.
    # DO NOT write raw row counts into views_unique; use unique_views_count.
    """

    __tablename__ = "producer_analytics_daily"

    # `server_default` as well as the Python `default` (MEH-2282, revision
    # 0396917da2ea). Chunk B2's roll-up writes with a raw
    # `INSERT … ON CONFLICT DO NOTHING` that never instantiates this class, so
    # `default=uuid.uuid4` is not consulted on the one path that writes every
    # row; the DB has to be able to mint the id itself. Declared on both sides
    # so model and migration agree (ADR-006). `gen_random_uuid()` is Postgres
    # 13+ core — the same call b7d3e1a94c26 (MEH-1872) and d4a9c31e6f82
    # (MEH-1399) already use.
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # CASCADE, like the raw tables: when a business deletes its account the
    # aggregate goes with it. The ruling keeps the aggregate "anonymous" for
    # RETENTION purposes, which is not a reason to keep a deleted business's
    # numbers — deletion is a different right from storage limitation, and the
    # card is explicit that the existing CASCADE is not a substitute for either.
    day = Column(Date, nullable=False, index=True)
    views_unique = Column(Integer, nullable=False, server_default="0")
    views_search_unique = Column(Integer, nullable=False, server_default="0")
    whatsapp_clicks = Column(Integer, nullable=False, server_default="0")

    __table_args__ = (
        # One row per business per day. The roll-up (services/analytics_rollup.py,
        # MEH-2283) inserts with `ON CONFLICT DO NOTHING` on this constraint —
        # SKIP, never upsert-overwrite (Sapir's ruling 06/09): a rolled-up day
        # is immutable, because after chunk C a re-roll would read partially
        # purged raw rows and write an undercount over a correct number. This
        # comment used to say "corrects the row"; that was the pre-ruling plan.
        UniqueConstraint(
            "producer_id", "day", name="uq_producer_analytics_daily_producer_day"
        ),
    )


class ContactClick(Base):
    """MEH-82: one row per click on a non-WhatsApp contact method (phone/instagram/website/email).

    Tracked via POST /producers/{id}/contact-click so the producer dashboard
    can show a breakdown by method alongside the existing whatsapp_clicks metric.
    IP is hashed (SHA-256 + rotating salt) for privacy; user_id is set when the
    caller is authenticated.
    """

    __tablename__ = "producer_contact_clicks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # phone | instagram | website | email | whatsapp_group (MEH-2626: updates link)
    method = Column(String(20), nullable=False)
    ip_hash = Column(String(64), nullable=True)
    clicked_at = Column(DateTime, default=utc_now, nullable=False, index=True)

    __table_args__ = (
        Index("ix_contact_clicks_producer_at", "producer_id", "clicked_at"),
    )
