"""
Module:   offer_supply
Purpose:  Which businesses have something on today besides their products: a
          surprise bag today, an open group buy, an upcoming event, a listed
          experience (MEH-3824). Feeds the map's four «סינון» switches (the
          ?rescue_today / ?group_buy / ?event / ?experience filters) and the
          per-business flags the switches are gated on.
Does NOT: define what is public. Each kind reads the ONE query its own public
          list already uses, so a business is on the map's switch exactly when
          that list would show it something:
            - group buys: group_buys._status_tab_query(db, "open", None)
            - experiences: experiences._public_listing_query(db)
            - events: events.public_event_feed_query(db) (the feed with no
              filter — list_events builds the same rows for a stranger)
            - bags: rescue_today_query (shared with attach_rescue_today)
          tests/test_meh3824_offer_filters.py pins each flag against the
          public list it mirrors.
Related:  services/producer_listing.py (applies the filter, OR across kinds);
          services/producer_queries.py attach_rescue_today;
          frontend/lib/filter-taxonomy.js (the four map axes, gate "count").
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import ColumnElement, false, or_
from sqlalchemy.orm import Query, Session

from app.models import Event, Producer, ProducerLocation, RescueOffer, User
from app.utils.clock import utc_now

# The axis keys, in the order the filter sheet shows them.
OFFER_KEYS = ("rescue_today", "group_buy", "event", "experience")


def rescue_today_query(db: Session) -> Query[Any] | None:
    """Today's reservable bags with their business id, or None while the pilot
    is off or names no town. The bag list's own filters (rescue_reads), limited
    to today in Israel time."""
    # Call-time imports: rescue_reads imports producer_listing, which imports
    # producer_queries, which imports this module's caller.
    from app.routers.rescue import rescue_cities
    from app.services.producer_queries import _rescue_pilot_on
    from app.services.rescue_reads import (
        RESERVE_CLOSES_BEFORE_END,
        public_business_clauses,
    )
    from app.utils.clock import israel_today

    if not _rescue_pilot_on():
        return None
    pilot = rescue_cities()
    if not pilot:
        return None
    return (
        db.query(RescueOffer, ProducerLocation.producer_id)
        .join(ProducerLocation, RescueOffer.producer_location_id == ProducerLocation.id)
        .join(Producer, ProducerLocation.producer_id == Producer.id)
        .filter(
            ProducerLocation.city.in_(pilot),
            RescueOffer.date == israel_today(),
            RescueOffer.status == "active",
            RescueOffer.qty_left > 0,
            RescueOffer.pickup_end > utc_now() + RESERVE_CLOSES_BEFORE_END,
            *public_business_clauses(),
        )
    )


def _producer_ids(db: Session, key: str) -> Query[Any] | None:
    """A one-column query of business ids that have `key` on, or None when
    the kind is off entirely (bags outside the pilot)."""
    from app.routers.events import public_event_feed_query
    from app.routers.experiences import _public_listing_query
    from app.routers.group_buys import _status_tab_query

    from app.models.events import GroupBuy

    if key == "rescue_today":
        q = rescue_today_query(db)
        return None if q is None else q.with_entities(ProducerLocation.producer_id)
    if key == "group_buy":
        return _status_tab_query(db, "open", None).with_entities(GroupBuy.producer_id)
    if key == "event":
        return public_event_feed_query(db).with_entities(Event.producer_id)
    if key == "experience":
        return _public_listing_query(db).with_entities(User.producer_id)
    raise ValueError(f"unknown offer key {key!r}")


def offer_condition(db: Session, keys: list[str]) -> ColumnElement[bool] | None:
    """The listing filter: a business with ANY of the asked kinds (OR, like
    the service group). None when no key is asked. A kind that is off
    entirely contributes nothing, so asking only for it matches no business
    rather than every business."""
    asked = [k for k in OFFER_KEYS if k in keys]
    if not asked:
        return None
    parts = []
    for key in asked:
        ids = _producer_ids(db, key)
        if ids is not None:
            parts.append(Producer.id.in_(ids.subquery().select()))
    if not parts:
        return false()
    return or_(*parts) if len(parts) > 1 else parts[0]


def attach_offer_flags(producers: list[Any], db: Session) -> list[Any]:
    """Batch-set `has_open_group_buy`, `has_upcoming_event` and
    `has_listed_experience` on one page of businesses: one query per kind for
    the page. The bag has its own field (`rescue_today`, attach_rescue_today),
    because the card shows its window and price."""
    if not producers:
        return producers
    fields = {
        "group_buy": "has_open_group_buy",
        "event": "has_upcoming_event",
        "experience": "has_listed_experience",
    }
    ids = [p.id for p in producers]
    found: dict[str, set[Any]] = {}
    for key, field in fields.items():
        q = _producer_ids(db, key)
        rows = [] if q is None else q.filter(Producer.id.in_(ids)).distinct().all()
        found[field] = {r[0] for r in rows}
    for p in producers:
        for field, have in found.items():
            setattr(p, field, p.id in have)
    return producers
