"""
Module:   rescue_reads
Purpose:  What the surprise-bag (rescue) screens read: today's public list,
          the buyer's own reservations, the business's orders and bags of the
          day, the business's «בדרך כלל» row, and the admin pilot numbers.
Touches:  rescue_offers, rescue_orders, rescue_typical_items,
          producer_locations, producers (SELECT only).
Does NOT: decide whether the pilot is on, which towns are in it, or what day
          it is — the router reads those (`rescue_bags_enabled`,
          `rescue_cities`, `israel_today`, all patched by the tests on the
          router module) and passes them in. Does NOT write: reserve, cancel,
          hand over and no-show stay in routers/rescue.py.
Related:  backend/app/routers/rescue.py (the handlers that call this)
History:  MEH-3541 (moved here unchanged from routers/rescue.py)
"""

import math
from datetime import date, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session, selectinload

from app.data.cities import canonical_city
from app.models.models import (
    Producer,
    ProducerLocation,
    RescueOffer,
    RescueOrder,
    RescueTypicalItems,
)
from app.services.producer_listing import not_test_producer  # MEH-2952
from app.utils.clock import utc_now
from app.utils.pii import round_coord

# MEH-2726 (Sapir 6/11): reservations close this long before the pickup window
# ends — someone reserving a minute before the end cannot get there, and the bag
# sits reserved for nobody. The list and the reserve guard read the same value.
RESERVE_CLOSES_BEFORE_END = timedelta(minutes=15)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle km between two points.

    NOT `services/producer_queries.haversine_min_km`, which the spec suggested
    reusing: that one answers a different question — the distance to the
    NEAREST of all a business's locations. A bag is collected at ONE named
    point, so for a business with several branches the minimum would quote a
    walk to a branch that has no bag in it. Same formula, different subject.
    """
    radius_km = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return 2 * radius_km * math.asin(math.sqrt(a))


def _public_business_clauses() -> tuple[Any, ...]:
    """The business filter shared by the bag list and the bag page: approved,
    not a seeded test row (MEH-2952). One place, so the page never shows a bag
    the list would hide (MEH-3586)."""
    return (Producer.status == "approved", not_test_producer())


def public_offers(  # noqa: PLR0913 — keyword-only inputs the router reads (MEH-3541)
    db: Session,
    *,
    today: date,
    pilot: tuple[str, ...],
    city: str | None,
    lat: float | None,
    lng: float | None,
) -> list[dict[str, Any]]:
    """Today's bags that still have stock. Public — no auth.

    Sold-out and cancelled offers are omitted rather than greyed out: the list
    is "what you can still get tonight", and chunk 4 has no empty-stock state.
    """
    lat, lng = round_coord(lat), round_coord(lng)  # MEH-3219: ~1 km, never exact
    q = (
        db.query(RescueOffer)
        .join(ProducerLocation, RescueOffer.producer_location_id == ProducerLocation.id)
        .join(Producer, ProducerLocation.producer_id == Producer.id)
        .options(
            selectinload(RescueOffer.location).selectinload(ProducerLocation.producer)
        )
        .filter(
            RescueOffer.date == today,
            RescueOffer.status == "active",
            RescueOffer.qty_left > 0,
            # MEH-2713: reserve refuses a bag once its window closed (409
            # "זמן האיסוף חלף"), so listing it would offer a button that can
            # only fail. Same naive-UTC comparison as the reserve guard.
            RescueOffer.pickup_end > utc_now() + RESERVE_CLOSES_BEFORE_END,
            *_public_business_clauses(),
        )
    )
    # Only pilot towns are listed, whatever is asked for. Without this an
    # offer published before a town was removed from the list would keep
    # showing; the gate belongs on the read as well as the write.
    if not pilot:
        return []
    q = q.filter(ProducerLocation.city.in_(pilot))

    if city:
        # The PICKUP point's town, not the business's registered city — a
        # branch in another town is where the buyer actually walks.
        canonical = canonical_city(city)
        if canonical not in pilot:
            return []
        q = q.filter(ProducerLocation.city == canonical)

    offers = q.order_by(RescueOffer.pickup_start.asc()).all()

    producer_ids = {o.location.producer_id for o in offers if o.location is not None}
    # MEH-2752: the row carries both «בדרך כלל» and the declared allergens, so
    # one query serves both. `allergens` stays None when the business declared
    # nothing — it is NOT coerced to [], because the card has to tell the buyer
    # "not declared" rather than show an empty list that reads as "none".
    typical: dict[Any, Any] = (
        {
            row.producer_id: (row.items or [], row.allergens)
            for row in db.query(RescueTypicalItems)
            .filter(RescueTypicalItems.producer_id.in_(producer_ids))
            .all()
        }
        if producer_ids
        else {}
    )

    out: list[dict[str, Any]] = []
    for offer in offers:
        location = offer.location
        producer = location.producer if location else None
        if not location or not producer:
            continue
        distance = None
        if lat is not None and lng is not None and location.lat and location.lng:
            distance = round(
                haversine_km(lat, lng, float(location.lat), float(location.lng)), 2
            )
        out.append(
            _public_row(
                offer,
                location,
                producer,
                typical.get(producer.id) or ([], None),
                distance,
            )
        )
    return out


def _public_row(
    offer: RescueOffer,
    location: ProducerLocation,
    producer: Producer,
    typical: tuple[Any, Any],
    distance: float | None,
) -> dict[str, Any]:
    """One bag as `RescueOfferPublicOut` reads it. Shared by the list and the
    single-bag page (MEH-3586) so the two can never describe a bag differently.
    """
    return {
        "id": offer.id,
        "date": offer.date,
        "qty_left": offer.qty_left,
        "qty_total": offer.qty_total,
        "price_agorot": offer.price_agorot,
        "value_min_agorot": offer.value_min_agorot,
        "value_max_agorot": offer.value_max_agorot,
        "pickup_start": offer.pickup_start,
        "pickup_end": offer.pickup_end,
        "cancel_until": offer.cancel_until,
        "producer": {
            "id": producer.id,
            "name": producer.name,
            "slug": producer.slug,
            "city": producer.city,
            "image_url": (producer.images or [None])[0],
            "location_city": location.city,
            "location_address": location.address,
        },
        "typical_items": list(typical[0] or []),
        "allergens": typical[1],
        "distance_km": distance,
    }


def offer_detail(
    db: Session, *, offer_id: UUID, today: date, pilot: tuple[str, ...]
) -> dict[str, Any] | None:
    """One of today's bags, for its own page (MEH-3586). Public — no auth.

    Unlike `public_offers`, a bag that sold out, was cancelled by the business
    or whose reservations closed is still returned, with `state` saying which:
    someone who opens a shared link or comes back to the tab should read why
    the bag is gone, not a «not found». Everything the list hides for safety
    stays hidden here too — another day's bag, an unapproved or test business,
    a town outside the pilot — and those answer None (the router's 404).
    """
    if not pilot:
        return None
    offer = (
        db.query(RescueOffer)
        .join(ProducerLocation, RescueOffer.producer_location_id == ProducerLocation.id)
        .join(Producer, ProducerLocation.producer_id == Producer.id)
        .options(
            selectinload(RescueOffer.location).selectinload(ProducerLocation.producer)
        )
        .filter(
            RescueOffer.id == offer_id,
            RescueOffer.date == today,
            *_public_business_clauses(),
            ProducerLocation.city.in_(pilot),
        )
        .one_or_none()
    )
    if offer is None or offer.location is None or offer.location.producer is None:
        return None
    location = offer.location
    producer = location.producer
    row = db.query(RescueTypicalItems).filter_by(producer_id=producer.id).one_or_none()
    typical: tuple[Any, Any] = (row.items or [], row.allergens) if row else ([], None)

    # Same order of reasons the reserve guard answers in: a cancelled bag is
    # cancelled even if stock remains, and a closed window beats stock.
    if offer.status == "cancelled":
        state = "cancelled"
    elif offer.pickup_end <= utc_now() + RESERVE_CLOSES_BEFORE_END:
        state = "ended"
    elif offer.qty_left < 1:
        state = "sold_out"
    else:
        state = "available"

    out = _public_row(offer, location, producer, typical, None)
    out["state"] = state
    # Exact-precision point only. An offer is published only on one, but the
    # business can switch the point to approximate later; then the pin is not
    # sent (MEH-829: an approximate point's coordinates never leave the API).
    exact = location.location_precision == "exact"
    out["lat"] = location.lat if exact else None
    out["lng"] = location.lng if exact else None
    out["producer"]["avg_rating"] = producer.avg_rating or None
    out["producer"]["reviews_count"] = producer.reviews_count or 0
    out["pickup_note"] = location.pickup_note  # MEH-3593: the point's own
    out["producer"]["short_description"] = (producer.short_description or "").strip() or None
    return out


def my_reservations(db: Session, *, user_id: Any, today: date) -> list[dict[str, Any]]:
    """The caller's own live reservations on today's bags (MEH-2680).

    Only the caller's rows, only today's offers (Israel date), only
    `reserved` / `handed` — a no-show or a buyer's own cancel has no code
    left to say and nothing to review. Carries the same fields as the
    reservation response, so the confirmation renders from either without a
    second shape.

    MEH-2738: plus the reservations the BUSINESS cancelled, flagged
    `cancelled_by_business`, so the page can say so instead of silently
    dropping the code. See `business_cancelled_ids` for how they are told
    apart from a buyer's own cancel without a column for it.
    """
    rows = (
        db.query(RescueOrder)
        .join(RescueOffer, RescueOrder.offer_id == RescueOffer.id)
        .options(
            selectinload(RescueOrder.offer).selectinload(RescueOffer.location),
            selectinload(RescueOrder.review),
        )
        .filter(
            RescueOrder.user_id == user_id,
            RescueOffer.date == today,
            (RescueOrder.status.in_(("reserved", "handed")))
            | (
                (RescueOrder.status == "cancelled")
                & (RescueOffer.status == "cancelled")
            ),
        )
        .order_by(RescueOrder.created_at.asc())
        .all()
    )
    by_business = business_cancelled_ids(
        db, {o.offer_id for o in rows if o.status == "cancelled"}
    )
    rows = [o for o in rows if o.status != "cancelled" or o.id in by_business]
    return [
        {
            "id": o.id,
            "offer_id": o.offer_id,
            "user_id": o.user_id,
            "qty": o.qty,
            "pickup_code": o.pickup_code,
            "status": o.status,
            "handed_at": o.handed_at,
            "cancelled_at": o.cancelled_at,
            "created_at": o.created_at,
            "price_agorot": o.offer.price_agorot,
            "cancel_until": o.offer.cancel_until,
            "pickup_start": o.offer.pickup_start,
            "pickup_end": o.offer.pickup_end,
            "reviewed": o.review is not None,
            "producer_id": o.offer.location.producer_id,
            "cancelled_by_business": o.id in by_business,
        }
        for o in rows
    ]


def business_cancelled_ids(db: Session, offer_ids: set[Any]) -> set[Any]:
    """Which cancelled orders on these cancelled offers the business cancelled.

    There is no column saying who cancelled, and adding one is a schema
    change; the stock arithmetic already says it. A buyer's cancel gives its
    bags back to `qty_left`; the business cancel does not (the offer is gone).
    So the bags the business took with it are
        (qty_total - qty_left) - bags on orders that were never cancelled.
    The business cancel stamps all its orders with one `cancelled_at`, the
    latest on the offer. If the arithmetic says it took no bags, the latest
    cancel was a buyer's — the edge case a timestamp rule alone gets wrong
    (she cancelled, nobody else held a bag, then the business cancelled).
    """
    if not offer_ids:
        return set()
    found: set[Any] = set()
    offers = db.query(RescueOffer).filter(RescueOffer.id.in_(offer_ids)).all()
    orders = db.query(RescueOrder).filter(RescueOrder.offer_id.in_(offer_ids)).all()
    for offer in offers:
        mine = [o for o in orders if o.offer_id == offer.id]
        kept = sum(o.qty for o in mine if o.status != "cancelled")
        taken = (offer.qty_total - offer.qty_left) - kept
        cancelled = [o for o in mine if o.status == "cancelled" and o.cancelled_at]
        if taken <= 0 or not cancelled:
            continue
        last = max(o.cancelled_at for o in cancelled)
        found.update(o.id for o in cancelled if o.cancelled_at == last)
    return found


def business_orders_today(
    db: Session, *, producer_id: Any, today: date
) -> list[dict[str, Any]]:
    """Today's reservations across this business's pickup points.

    Today only, by the Israel clock: the dashboard is a counter tool, and a
    bag from last week is not something anyone hands over. Cancelled rows are
    included — a business that sees four codes and three people should be able
    to tell which one cancelled rather than wonder.

    No buyer identity is returned; see RescueOwnerOrderOut for why.
    """
    rows = (
        db.query(RescueOrder, RescueOffer)
        .join(RescueOffer, RescueOrder.offer_id == RescueOffer.id)
        .join(
            ProducerLocation,
            RescueOffer.producer_location_id == ProducerLocation.id,
        )
        .filter(
            ProducerLocation.producer_id == producer_id,
            RescueOffer.date == today,
        )
        .order_by(RescueOrder.created_at.asc())
        .all()
    )
    return [
        {
            "id": order.id,
            "offer_id": order.offer_id,
            "qty": order.qty,
            "pickup_code": order.pickup_code,
            "status": order.status,
            "handed_at": order.handed_at,
            "cancelled_at": order.cancelled_at,
            "created_at": order.created_at,
            "pickup_start": offer.pickup_start,
            "pickup_end": offer.pickup_end,
        }
        for order, offer in rows
    ]


def leftover_bags(offer: RescueOffer, now: datetime) -> int:
    """Bags not collected once the window closed (MEH-2703).

    Never reserved (`qty_left`) plus reserved-but-nobody-came (`no_show`).
    0 before `pickup_end` — a bag may still be reserved or collected — and 0
    for a cancelled offer, which never went on sale. A `reserved` order the
    business has not marked yet is NOT counted: until it is marked «לא הגיע»
    the business has not said the bag is free to give away.
    """
    if offer.status != "active" or offer.pickup_end > now:
        return 0
    no_show = sum(o.qty for o in offer.orders if o.status == "no_show")
    return offer.qty_left + no_show  # type: ignore[no-any-return]


def owner_offer_row(offer: RescueOffer, now: datetime) -> dict[str, Any]:
    return {
        "id": offer.id,
        "qty_total": offer.qty_total,
        "qty_left": offer.qty_left,
        "status": offer.status,
        "pickup_start": offer.pickup_start,
        "pickup_end": offer.pickup_end,
        "leftover": leftover_bags(offer, now),
        "qty_donated": offer.qty_donated or 0,
    }


def business_offers_today(
    db: Session, *, producer_id: Any, today: date
) -> list[dict[str, Any]]:
    """Today's bags across this business's pickup points, with what was left.

    Today only, by the Israel clock, like the orders list beside it.
    """
    offers = (
        db.query(RescueOffer)
        .options(selectinload(RescueOffer.orders))
        .join(
            ProducerLocation,
            RescueOffer.producer_location_id == ProducerLocation.id,
        )
        .filter(
            ProducerLocation.producer_id == producer_id,
            RescueOffer.date == today,
        )
        .order_by(RescueOffer.pickup_start.asc())
        .all()
    )
    now = utc_now()
    return [owner_offer_row(o, now) for o in offers]


def pilot_numbers(db: Session, *, today: date, days: int) -> dict[str, Any]:
    """The pilot's four numbers, read-only.

    Rates come back as fractions, and as None when their denominator is zero:
    a pilot with no bags published yet has no sell-through, and reporting 0%
    would read as "nothing sold" rather than "nothing offered". That
    distinction is the whole point of a pilot metric.
    """
    since = today - timedelta(days=days)

    offers = db.query(RescueOffer).filter(RescueOffer.date >= since).all()
    offers_total = len(offers)
    # MEH-2737: a cancelled bag never went on sale to the end. Its qty_left is
    # not restored when the business cancels, so counting it would report its
    # open reservations as sold.
    sold = [o for o in offers if o.status != "cancelled"]
    bags_offered = sum(o.qty_total for o in sold)
    bags_left = sum(o.qty_left for o in sold)
    bags_reserved = bags_offered - bags_left

    offer_ids = [o.id for o in offers]
    orders = (
        db.query(RescueOrder).filter(RescueOrder.offer_id.in_(offer_ids)).all()
        if offer_ids
        else []
    )
    orders_total = len(orders)
    orders_cancelled = sum(1 for o in orders if o.status == "cancelled")
    # The no-show rate is the prepay decision's input (>1/7 → deposit), so its
    # denominator is the reservations that stood — a cancelled one could not
    # have been a no-show, and counting it made the rate read low (MEH-2737).
    stood = [o for o in orders if o.status != "cancelled"]
    no_shows = sum(1 for o in stood if o.status == "no_show")

    # "Repeat" means a buyer with more than one reservation in the window —
    # the number the pilot is actually asking about (did anyone come back?).
    # Cancelled reservations bought nothing and do not count.
    per_buyer: dict[UUID, int] = {}
    for order in stood:
        per_buyer[order.user_id] = per_buyer.get(order.user_id, 0) + 1  # type: ignore[call-overload,index]

    return {
        "days": days,
        "offers_total": offers_total,
        "offers_per_day": round(offers_total / days, 2),
        "bags_offered": bags_offered,
        "bags_reserved": bags_reserved,
        "sell_through": (
            round(bags_reserved / bags_offered, 4) if bags_offered else None
        ),
        "orders_total": orders_total,
        "orders_cancelled": orders_cancelled,
        "offers_cancelled": offers_total - len(sold),
        "no_shows": no_shows,
        "no_show_rate": round(no_shows / len(stood), 4) if stood else None,
        "buyers_total": len(per_buyer),
        "repeat_buyers": sum(1 for n in per_buyer.values() if n > 1),
        "bags_donated": sum(o.qty_donated or 0 for o in offers),
    }


def typical_items(db: Session, *, producer_id: Any) -> dict[str, Any]:
    """«בדרך כלל: …» as it stands. An empty list when never set — the read
    never has to distinguish "no row" from "empty", only the first."""
    row = (
        db.query(RescueTypicalItems)
        .filter(RescueTypicalItems.producer_id == producer_id)
        .first()
    )
    return {
        "producer_id": producer_id,
        "items": list(row.items or []) if row else [],
        "allergens": row.allergens if row else None,
        "updated_at": row.updated_at if row else utc_now(),
    }
