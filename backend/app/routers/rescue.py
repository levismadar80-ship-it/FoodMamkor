"""
Module:   rescue
Purpose:  The rescue-bags pilot API — a business publishes today's bags, a
          buyer reserves one and gets a 4-digit code, the business marks it
          handed or not-collected, and two no-shows in 30 days stop the buyer
          reserving again.
Touches:  DB tables rescue_offers / rescue_orders / rescue_reviews /
          rescue_typical_items and `users.rescue_no_show_count` +
          `users.rescue_block_cleared_at`. No outbound side effects at all in
          this chunk — see "Does NOT".
Does NOT: take payment. There is none in the pilot: the buyer pays at the
          counter, no endpoint quotes a total to charge and no order row
          records money.
          It also does NOT message anyone. Two notification pieces the chunk-2
          spec asks for are blocked on things outside this file and are
          deliberately absent rather than half-built:
            - the pickup_start digest of codes to the business. `fire_alerts`
              is the wrong mechanism (it fans out to CONSUMERS who opted in
              through FavoriteAlert columns, from inside a request, not on a
              clock), so this needs a scheduler job in the `pending_nudge`
              shape plus an idempotency stamp. MEH-2646 carries the decision.
            - the WhatsApp to buyers when a business cancels a whole offer.
              A business-initiated message needs a Meta-APPROVED template
              (`services/whatsapp.py:279` — send_text only works inside the
              24h window), and no rescue template exists. Registering one is
              Sapir's action. `cancel_offer` therefore moves status only and
              says so.
Related:  app/models/models.py (RescueOffer and siblings, the status tuples),
          app/schemas/rescue.py (every request/response shape),
          app/routers/group_buys.py:238-258 (the with_for_update pattern this
          reuses for stock, MEH-773)
History:  MEH-2646 (creation, chunk 2/4 of the rescue-bags pilot MEH-2643)
"""

import logging
import math
import secrets
from datetime import timedelta
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.auth import (
    get_current_user,
    require_admin,
    require_producer,
    require_verified_producer,
)
from app.config import settings
from app.data.cities import canonical_city
from app.database import get_db
from app.models.models import (
    RESCUE_MAX_QTY_PER_ORDER,
    Producer,
    ProducerLocation,
    RescueOffer,
    RescueOrder,
    RescueReview,
    RescueTypicalItems,
    User,
)
from app.rate_limit import limiter
from app.schemas.rescue import (
    RescueNoShowStateOut,
    RescueOfferCreate,
    RescueOfferOut,
    RescueOfferPublicOut,
    RescueOrderCreate,
    RescueMetricsOut,
    RescueMyOrderOut,
    RescueOrderCreatedOut,
    RescueOrderOut,
    RescueDonatedIn,
    RescueOwnerOfferOut,
    RescueOwnerOrderOut,
    RescueReviewCreate,
    RescueReviewOut,
    RescueTypicalItemsIn,
    RescueTypicalItemsOut,
)
from app.sentry import capture_background_exception
from app.services.rescue_emails import (
    ReservationEmail,
    israel_hhmm,
    send_reservation_email,
)
from app.utils.clock import israel_today, utc_now

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rescue", tags=["rescue"])
admin_router = APIRouter(prefix="/admin/rescue", tags=["admin-rescue"])
# The business's own view lives under /producers/me, beside
# /producers/me/group-buys (MEH-2437), so it needs a router without the
# /rescue prefix.
me_router = APIRouter(tags=["rescue"])

# The pilot's no-show rule: the SECOND no-show inside this window blocks new
# reservations. Both numbers are here rather than inline so the test asserts
# the same constants the handler reads.
NO_SHOW_BLOCK_AT = 2
NO_SHOW_WINDOW_DAYS = 30
BLOCKED_DETAIL = "ההזמנות חסומות אחרי שתי אי-הגעות. כתבו לנו"

# How many times to retry a colliding pickup code before giving up. The code
# is unique per OFFER and an offer holds at most 20 bags, so a collision is
# rare and a handful of tries is plenty; the UNIQUE constraint is what makes
# this correct rather than hopeful (uq_rescue_orders_code).
_CODE_ATTEMPTS = 8


def rescue_bags_enabled() -> bool:
    """Whether the pilot is switched on.

    `getattr` with a False default, NOT `settings.rescue_bags_enabled`, and
    that is deliberate: `backend/app/config.py` is denied to Claude Code
    (`permissions.deny`), so the `rescue_bags_enabled` field is added by Sapir
    — the verified patch is in PR #3963's description. Until it lands this
    returns False and every route below answers 404, which is the safe
    direction: the feature stays dark rather than opening without a switch.

    Once the field exists this reads it normally. A test pins the default so
    the absence of the field can never read as "enabled".
    """
    return bool(getattr(settings, "rescue_bags_enabled", False))


def rescue_cities() -> tuple[str, ...]:
    """The towns the pilot is open in.

    `RESCUE_BAGS_CITIES` is a comma-separated list and **empty means no town**,
    not every town. That default is the safe direction: the switch that opens
    the pilot and the switch that chooses where are separate, and a missing
    value must not silently open it everywhere.

    Read through `getattr` for the same reason as the flag — `config.py` is
    denied to Claude Code, so Sapir adds the field (patch in the PR body).
    """
    raw = getattr(settings, "rescue_bags_cities", "") or ""
    return tuple(
        canonical_city(part.strip()) or part.strip()
        for part in raw.split(",")
        if part.strip()
    )


def city_in_pilot(city: str | None) -> bool:
    if not city:
        return False
    return (canonical_city(city) or city) in rescue_cities()


def require_rescue_enabled() -> None:
    """Flag gate. A disabled pilot is indistinguishable from a route that was
    never deployed — 404, not 403, so the feature's existence is not
    advertised before launch."""
    if not rescue_bags_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="לא נמצא")


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
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


def _new_pickup_code() -> str:
    """A 4-digit code, zero-padded. `secrets`, not `random`: the code is the
    only thing standing between a stranger and someone else's bag at the
    counter, so it must not be predictable from previous codes."""
    return f"{secrets.randbelow(10000):04d}"


def _active_no_shows(db: Session, user: User) -> int:
    """No-shows that still count against this buyer.

    The windowed count from `rescue_orders` is the authority, not
    `users.rescue_no_show_count` — that counter has no window and cannot
    express "in 30 days" (it would block a buyer whose two no-shows were a
    year apart). The counter is kept for display and the chunk-5 metrics.

    `rescue_block_cleared_at` is how an admin releases a buyer: only no-shows
    whose pickup window ended AFTER that moment are counted, so one write
    releases the block and nothing in the history is deleted.
    """
    cutoff = utc_now() - timedelta(days=NO_SHOW_WINDOW_DAYS)
    q = (
        db.query(func.count(RescueOrder.id))
        .join(RescueOffer, RescueOrder.offer_id == RescueOffer.id)
        .filter(
            RescueOrder.user_id == user.id,
            RescueOrder.status == "no_show",
            RescueOffer.pickup_end >= cutoff,
        )
    )
    if user.rescue_block_cleared_at is not None:
        q = q.filter(RescueOffer.pickup_end > user.rescue_block_cleared_at)
    return int(q.scalar() or 0)


def _owns(user: User, producer_id: UUID) -> bool:
    return bool(user.producer_id) and user.producer_id == producer_id


def _require_offer_owner(user: User, offer: RescueOffer) -> None:
    """The business that published the offer, or an admin. Admin override is
    the house IDOR rule (.claude/rules/security.md)."""
    if user.role == "admin":
        return
    location = offer.location
    if not location or not _owns(user, location.producer_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="אין הרשאה")


def _offer_for_update(db: Session, offer_id: UUID) -> RescueOffer:
    """Load the offer with its row locked.

    MEH-773, via group_buys.py:238-258: without the lock two reservations can
    both read `qty_left = 1` and both decrement, overselling the bag. The
    `0 <= qty_left <= qty_total` CHECK then turns the loser into a failed
    transaction instead of negative stock — the lock is what makes it a clean
    409 instead.
    """
    offer = (
        db.query(RescueOffer)
        .filter(RescueOffer.id == offer_id)
        .with_for_update()
        .first()
    )
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הסל לא נמצא")
    return offer


def _issue_order(
    db: Session, offer: RescueOffer, user: User, qty: int
) -> tuple[RescueOrder, RescueOffer]:
    """Insert the reservation, retrying on a colliding pickup code.

    Returns the order AND the offer, because a collision rolls the
    transaction back and the row lock goes with it — the caller must decrement
    stock on the re-locked row, not the stale one it passed in.

    The UNIQUE (offer_id, pickup_code) is the authority for uniqueness; this
    loop only avoids handing the buyer a 500 on the rare collision.
    """
    for _ in range(_CODE_ATTEMPTS):
        candidate = RescueOrder(
            offer_id=offer.id,
            user_id=user.id,
            qty=qty,
            pickup_code=_new_pickup_code(),
            status="reserved",
        )
        db.add(candidate)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            offer = _offer_for_update(db, offer.id)
            if offer.qty_left < qty:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="לא נשארו מספיק סלים",
                ) from None
            continue
        return candidate, offer

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="לא הצלחנו להנפיק קוד איסוף, נסו שוב",
    )


def _order_or_404(db: Session, order_id: UUID) -> RescueOrder:
    order = (
        db.query(RescueOrder)
        .options(selectinload(RescueOrder.offer).selectinload(RescueOffer.location))
        .filter(RescueOrder.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="ההזמנה לא נמצאה"
        )
    return order


@router.post(
    "/offers",
    response_model=RescueOfferOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("20/minute")
def create_offer(
    request: Request,
    body: RescueOfferCreate,
    current_user: User = Depends(require_verified_producer),
    db: Session = Depends(get_db),
):
    """Publish today's bags at one pickup point.

    NOT VALIDATED, and it is worth knowing why: the spec asks that
    `pickup_end` be at least 15 minutes before the business closes. There is
    nothing to compute that against. `opening_hours` is unbounded free text on
    both producers and locations, which the repo has already ruled is not
    computable (models.py:443-446), and `order_window` is a different fact —
    when ORDERS are accepted, not when the door shuts. Validating against it
    would enforce the wrong rule convincingly. MEH-2646 carries the decision.
    """
    if not current_user.producer_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="אין בית עסק מקושר"
        )

    producer = (
        db.query(Producer).filter(Producer.id == current_user.producer_id).first()
    )
    if not producer or producer.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="רק בית עסק מאושר יכול לפרסם סל הפתעה",
        )

    location = (
        db.query(ProducerLocation)
        .filter(ProducerLocation.id == body.producer_location_id)
        .first()
    )
    if not location or location.producer_id != producer.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="נקודת האיסוף לא נמצאה"
        )
    # MEH-829: a bag reveals the full address, so only a point the business
    # marked as exact can host one. An approximate pin would publish a street
    # that is not where anyone should stand.
    if location.location_precision != "exact":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="נקודת האיסוף צריכה כתובת מדויקת כדי לפרסם סל",
        )

    # The per-city pilot gate. A business outside the pilot towns gets a clear
    # refusal rather than a bag nobody can see: the public list filters by the
    # same set, so publishing there would produce an offer with no readers.
    if not city_in_pilot(location.city):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="סלי הפתעה עדיין לא פתוחים ביישוב הזה",
        )

    if body.date < israel_today():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="אי אפשר לפרסם סל לתאריך שעבר",
        )

    # One active bag per point per day: `qty_left` is per OFFER, so a second
    # row for the same evening would show the same business twice with two
    # separate stock counts and two codes per buyer.
    existing = (
        db.query(RescueOffer.id)
        .filter(
            RescueOffer.producer_location_id == location.id,
            RescueOffer.date == body.date,
            RescueOffer.status == "active",
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="יש כבר סל פעיל בנקודה הזאת בתאריך הזה",
        )

    offer = RescueOffer(
        producer_location_id=location.id,
        date=body.date,
        qty_total=body.qty_total,
        # Stock starts full. The client cannot set it — an offer that arrives
        # half sold is not a thing the business can publish.
        qty_left=body.qty_total,
        price_agorot=body.price_agorot,
        value_min_agorot=body.value_min_agorot,
        value_max_agorot=body.value_max_agorot,
        pickup_start=body.pickup_start,
        pickup_end=body.pickup_end,
        cancel_until=body.cancel_until,
        status="active",
    )
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return offer


@router.get(
    "/offers",
    response_model=list[RescueOfferPublicOut],
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("120/minute")
def list_offers(
    request: Request,
    city: str | None = Query(default=None),
    lat: float | None = Query(default=None, ge=-90, le=90),
    lng: float | None = Query(default=None, ge=-180, le=180),
    db: Session = Depends(get_db),
):
    """Today's bags that still have stock. Public — no auth.

    Sold-out and cancelled offers are omitted rather than greyed out: the list
    is "what you can still get tonight", and chunk 4 has no empty-stock state.
    """
    today = israel_today()
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
            RescueOffer.pickup_end > utc_now(),
            Producer.status == "approved",
        )
    )
    # Only pilot towns are listed, whatever is asked for. Without this an
    # offer published before a town was removed from the list would keep
    # showing; the gate belongs on the read as well as the write.
    pilot = rescue_cities()
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
    typical = (
        {
            row.producer_id: (row.items or [])
            for row in db.query(RescueTypicalItems)
            .filter(RescueTypicalItems.producer_id.in_(producer_ids))
            .all()
        }
        if producer_ids
        else {}
    )

    out: list[dict] = []
    for offer in offers:
        location = offer.location
        producer = location.producer if location else None
        if not location or not producer:
            continue
        distance = None
        if lat is not None and lng is not None and location.lat and location.lng:
            distance = round(
                _haversine_km(lat, lng, float(location.lat), float(location.lng)), 2
            )
        out.append(
            {
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
                "typical_items": list(typical.get(producer.id) or []),
                "distance_km": distance,
            }
        )
    return out


@router.post(
    "/offers/{offer_id}/cancel",
    response_model=RescueOfferOut,
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("20/minute")
def cancel_offer(
    request: Request,
    offer_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The business pulls the whole bag offer. Every open reservation on it is
    cancelled with it.

    No refund, because nothing was paid. No message either, yet: telling the
    buyers needs a Meta-approved WhatsApp template and none exists for rescue
    (see this module's "Does NOT"). Until one does, the buyers learn from the
    app — which is a real gap, recorded on MEH-2646 rather than papered over
    with a send that would silently fail outside the 24h window.
    """
    offer = _offer_for_update(db, offer_id)
    _require_offer_owner(current_user, offer)
    if offer.status != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="הסל כבר בוטל")

    offer.status = "cancelled"
    now = utc_now()
    (
        db.query(RescueOrder)
        .filter(RescueOrder.offer_id == offer.id, RescueOrder.status == "reserved")
        .update({"status": "cancelled", "cancelled_at": now}, synchronize_session=False)
    )
    db.commit()
    db.refresh(offer)
    return offer


@router.get(
    "/orders/mine",
    response_model=list[RescueMyOrderOut],
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("120/minute")
def list_my_reservations(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The caller's own live reservations on today's bags (MEH-2680).

    Only the caller's rows, only today's offers (Israel date), only
    `reserved` / `handed` — a cancelled or no-show order has no code left to
    say and nothing to review. Carries the same fields as the reservation
    response, so the confirmation renders from either without a second shape.
    """
    rows = (
        db.query(RescueOrder)
        .join(RescueOffer, RescueOrder.offer_id == RescueOffer.id)
        .options(
            selectinload(RescueOrder.offer).selectinload(RescueOffer.location),
            selectinload(RescueOrder.review),
        )
        .filter(
            RescueOrder.user_id == current_user.id,
            RescueOrder.status.in_(("reserved", "handed")),
            RescueOffer.date == israel_today(),
        )
        .order_by(RescueOrder.created_at.asc())
        .all()
    )
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
        }
        for o in rows
    ]


def _queue_reservation_email(
    background_tasks: BackgroundTasks,
    user: User,
    offer: RescueOffer,
    order: RescueOrder,
) -> None:
    """MEH-2715: queue the buyer's confirmation email, after the commit.

    Everything is read HERE, while the request's Session is open, and handed
    to the task as plain values — a background task must never touch `db`
    (the group_buys MEH-1651 convention). Queued only after the commit, so a
    refused or rolled-back reservation sends nothing.
    """
    location = offer.location
    producer = location.producer if location else None
    if not user.email or producer is None:
        return
    address = ", ".join(p for p in (location.address, location.city) if p)
    background_tasks.add_task(
        send_reservation_email,
        user.email,
        ReservationEmail(
            producer_name=producer.name or "",
            producer_id=str(producer.id),
            pickup_code=order.pickup_code,
            total_agorot=offer.price_agorot * order.qty,
            pickup_from=israel_hhmm(offer.pickup_start),
            pickup_until=israel_hhmm(offer.pickup_end),
            address=address,
            cancel_until=israel_hhmm(offer.cancel_until),
        ),
    )


@router.post(
    "/orders",
    response_model=RescueOrderCreatedOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("20/minute")
def create_order(
    request: Request,
    body: RescueOrderCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reserve bags and get the 4-digit code read out at the counter."""
    if _active_no_shows(db, current_user) >= NO_SHOW_BLOCK_AT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=BLOCKED_DETAIL
        )

    offer = _offer_for_update(db, body.offer_id)
    if offer.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="הסל אינו פעיל"
        )
    if offer.date != israel_today():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="הסל אינו של היום"
        )
    if offer.pickup_end <= utc_now():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="זמן האיסוף חלף"
        )

    # The pilot's two-bag cap is per BUYER per offer, not per request — three
    # requests of two would otherwise walk straight past it.
    already = int(
        db.query(func.coalesce(func.sum(RescueOrder.qty), 0))
        .filter(
            RescueOrder.offer_id == offer.id,
            RescueOrder.user_id == current_user.id,
            RescueOrder.status.in_(("reserved", "handed")),
        )
        .scalar()
        or 0
    )
    if already + body.qty > RESCUE_MAX_QTY_PER_ORDER:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="אפשר לשריין עד שני סלים",
        )

    if offer.qty_left < body.qty:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="לא נשארו מספיק סלים"
        )

    order, offer = _issue_order(db, offer, current_user, body.qty)
    offer.qty_left = offer.qty_left - body.qty
    db.commit()
    db.refresh(order)
    # The reservation is committed. Nothing about preparing the email may turn
    # it into a 500: the buyer would read that as "not reserved" and retry.
    try:
        _queue_reservation_email(background_tasks, current_user, offer, order)
    except Exception as exc:  # noqa: BLE001 — fail-open by design (MEH-2715)
        capture_background_exception(exc, task="rescue_reservation_email")
        logger.error("rescue reservation email not queued: %s", type(exc).__name__)
    return {
        "id": order.id,
        "offer_id": order.offer_id,
        "user_id": order.user_id,
        "qty": order.qty,
        "pickup_code": order.pickup_code,
        "status": order.status,
        "handed_at": order.handed_at,
        "cancelled_at": order.cancelled_at,
        "created_at": order.created_at,
        "price_agorot": offer.price_agorot,
        "cancel_until": offer.cancel_until,
        "pickup_start": offer.pickup_start,
        "pickup_end": offer.pickup_end,
    }


@router.post(
    "/orders/{order_id}/handed",
    response_model=RescueOrderOut,
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("60/minute")
def mark_handed(
    request: Request,
    order_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The business hands the bag over against the code.

    A second call is a 409 naming `handed_at`, not a silent success: at the
    counter a repeated tap usually means the first one was not seen, and the
    honest answer is "already done at 18:42".
    """
    order = _order_or_404(db, order_id)
    _require_offer_owner(current_user, order.offer)

    if order.status == "handed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"הסל כבר נמסר ב-{order.handed_at:%H:%M}"
            if order.handed_at
            else "הסל כבר נמסר",
        )
    if order.status != "reserved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="ההזמנה אינה פעילה"
        )

    order.status = "handed"
    order.handed_at = utc_now()
    order.handed_by = current_user.id
    db.commit()
    db.refresh(order)
    return order


@router.post(
    "/orders/{order_id}/no_show",
    response_model=RescueOrderOut,
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("60/minute")
def mark_no_show(
    request: Request,
    order_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The business records that nobody came for the bag.

    Only after `pickup_end` — before that the buyer may still be on their way,
    and a no-show is what blocks them from reserving again.
    """
    order = _order_or_404(db, order_id)
    _require_offer_owner(current_user, order.offer)

    if order.offer.pickup_end > utc_now():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="אפשר לסמן «לא הגיע» רק אחרי שזמן האיסוף נגמר",
        )
    if order.status != "reserved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="ההזמנה אינה פעילה"
        )

    order.status = "no_show"
    buyer = db.query(User).filter(User.id == order.user_id).first()
    if buyer:
        # Display/metrics counter. The 422 gate reads the windowed count from
        # the orders, not this — see _active_no_shows.
        buyer.rescue_no_show_count = (buyer.rescue_no_show_count or 0) + 1
    db.commit()
    db.refresh(order)
    return order


@router.post(
    "/orders/{order_id}/cancel",
    response_model=RescueOrderOut,
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("20/minute")
def cancel_order(
    request: Request,
    order_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The buyer cancels, free, until the offer's `cancel_until`."""
    order = _order_or_404(db, order_id)
    if order.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="אין הרשאה")
    if order.status != "reserved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="ההזמנה אינה פעילה"
        )
    if utc_now() > order.offer.cancel_until:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="מועד הביטול החופשי חלף",
        )

    # Lock the offer before giving the bag back, for the same reason reserving
    # locks it: two concurrent cancels must not both add 1 to qty_left.
    offer = _offer_for_update(db, order.offer_id)
    order.status = "cancelled"
    order.cancelled_at = utc_now()
    offer.qty_left = min(offer.qty_left + order.qty, offer.qty_total)
    db.commit()
    db.refresh(order)
    return order


@router.post(
    "/orders/{order_id}/review",
    response_model=RescueReviewOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("20/minute")
def create_review(
    request: Request,
    order_id: UUID,
    body: RescueReviewCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The buyer reviews a bag they actually collected. Once."""
    order = _order_or_404(db, order_id)
    if order.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="אין הרשאה")
    if order.status != "handed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="אפשר לדרג רק אחרי שקיבלתם את הסל",
        )

    review = RescueReview(
        order_id=order.id,
        rating=body.rating,
        contents_tags=body.contents_tags,
        highlight_tags=body.highlight_tags,
        photo_url=body.photo_url,
        comment=body.comment,
    )
    db.add(review)
    try:
        db.commit()
    except IntegrityError:
        # uq_rescue_reviews_order — one review per reservation, enforced by the
        # database rather than by a read-then-write race.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="כבר דירגתם את הסל הזה"
        ) from None
    db.refresh(review)
    return review


@admin_router.post(
    "/users/{user_id}/clear-block",
    response_model=RescueNoShowStateOut,
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("30/minute")
def clear_no_show_block(
    request: Request,
    user_id: UUID,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Release a buyer's no-show block.

    Writes `rescue_block_cleared_at` instead of zeroing the counter, so the
    no-show rows stay in the history for the chunk-5 metrics while stopping
    counting against the buyer. Returns both numbers, because a reset whose
    effect you cannot see is a reset you have to trust.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="המשתמשת לא נמצאה"
        )

    user.rescue_block_cleared_at = utc_now()
    db.commit()
    db.refresh(user)
    active = _active_no_shows(db, user)
    return {
        "user_id": user.id,
        "no_show_count": user.rescue_no_show_count or 0,
        "active_no_shows": active,
        "block_cleared_at": user.rescue_block_cleared_at,
        "blocked": active >= NO_SHOW_BLOCK_AT,
    }


@me_router.get(
    "/producers/me/rescue/orders",
    response_model=list[RescueOwnerOrderOut],
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("120/minute")
def list_my_orders(
    request: Request,
    current_user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """Today's reservations across this business's pickup points.

    Today only, by the Israel clock: the dashboard is a counter tool, and a
    bag from last week is not something anyone hands over. Cancelled rows are
    included — a business that sees four codes and three people should be able
    to tell which one cancelled rather than wonder.

    No buyer identity is returned; see RescueOwnerOrderOut for why.
    """
    if not current_user.producer_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="אין בית עסק מקושר"
        )

    rows = (
        db.query(RescueOrder, RescueOffer)
        .join(RescueOffer, RescueOrder.offer_id == RescueOffer.id)
        .join(
            ProducerLocation,
            RescueOffer.producer_location_id == ProducerLocation.id,
        )
        .filter(
            ProducerLocation.producer_id == current_user.producer_id,
            RescueOffer.date == israel_today(),
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


def _leftover(offer: RescueOffer, now) -> int:
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
    return offer.qty_left + no_show


def _owner_offer_row(offer: RescueOffer, now) -> dict:
    return {
        "id": offer.id,
        "qty_total": offer.qty_total,
        "qty_left": offer.qty_left,
        "status": offer.status,
        "pickup_start": offer.pickup_start,
        "pickup_end": offer.pickup_end,
        "leftover": _leftover(offer, now),
        "qty_donated": offer.qty_donated or 0,
    }


@me_router.get(
    "/producers/me/rescue/offers",
    response_model=list[RescueOwnerOfferOut],
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("120/minute")
def list_my_offers(
    request: Request,
    current_user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """Today's bags across this business's pickup points, with what was left.

    Today only, by the Israel clock, like the orders list beside it.
    """
    if not current_user.producer_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="אין בית עסק מקושר"
        )
    offers = (
        db.query(RescueOffer)
        .options(selectinload(RescueOffer.orders))
        .join(
            ProducerLocation,
            RescueOffer.producer_location_id == ProducerLocation.id,
        )
        .filter(
            ProducerLocation.producer_id == current_user.producer_id,
            RescueOffer.date == israel_today(),
        )
        .order_by(RescueOffer.pickup_start.asc())
        .all()
    )
    now = utc_now()
    return [_owner_offer_row(o, now) for o in offers]


@me_router.put(
    "/producers/me/rescue/offers/{offer_id}/donated",
    response_model=RescueOwnerOfferOut,
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("60/minute")
def set_donated(
    request: Request,
    offer_id: UUID,
    body: RescueDonatedIn,
    current_user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """Record how many uncollected bags were given away free.

    Owner (or admin) of the offer's point only. Only after the window
    closed, and never more than was left over — a number above the leftover
    would inflate the pilot's «ניצלו» count with bags that were sold.
    """
    offer = _offer_for_update(db, offer_id)
    _require_offer_owner(current_user, offer)
    now = utc_now()
    if offer.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="הסל בוטל ולא נמכר"
        )
    if offer.pickup_end > now:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="אפשר לסמן רק אחרי שזמן האיסוף נגמר",
        )
    leftover = _leftover(offer, now)
    if body.qty > leftover:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"אפשר לסמן עד {leftover} סלים שלא נאספו",
        )
    offer.qty_donated = body.qty
    db.commit()
    db.refresh(offer)
    return _owner_offer_row(offer, now)


@admin_router.get(
    "/metrics",
    response_model=RescueMetricsOut,
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("30/minute")
def pilot_metrics(
    request: Request,
    days: int = Query(default=30, ge=1, le=365),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """The pilot's four numbers, read-only.

    Rates come back as fractions, and as None when their denominator is zero:
    a pilot with no bags published yet has no sell-through, and reporting 0%
    would read as "nothing sold" rather than "nothing offered". That
    distinction is the whole point of a pilot metric.
    """
    since = israel_today() - timedelta(days=days)

    offers = db.query(RescueOffer).filter(RescueOffer.date >= since).all()
    offers_total = len(offers)
    bags_offered = sum(o.qty_total for o in offers)
    bags_left = sum(o.qty_left for o in offers)
    bags_reserved = bags_offered - bags_left

    offer_ids = [o.id for o in offers]
    orders = (
        db.query(RescueOrder).filter(RescueOrder.offer_id.in_(offer_ids)).all()
        if offer_ids
        else []
    )
    orders_total = len(orders)
    no_shows = sum(1 for o in orders if o.status == "no_show")

    # "Repeat" means a buyer with more than one reservation in the window —
    # the number the pilot is actually asking about (did anyone come back?).
    per_buyer: dict[UUID, int] = {}
    for order in orders:
        per_buyer[order.user_id] = per_buyer.get(order.user_id, 0) + 1

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
        "no_shows": no_shows,
        "no_show_rate": round(no_shows / orders_total, 4) if orders_total else None,
        "buyers_total": len(per_buyer),
        "repeat_buyers": sum(1 for n in per_buyer.values() if n > 1),
        "bags_donated": sum(o.qty_donated or 0 for o in offers),
    }


@me_router.get(
    "/producers/me/rescue/typical-items",
    response_model=RescueTypicalItemsOut,
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("60/minute")
def get_typical_items(
    request: Request,
    current_user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """«בדרך כלל: …» as it stands. An empty list when never set — the read
    never has to distinguish "no row" from "empty", only the first."""
    if not current_user.producer_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="אין בית עסק מקושר"
        )
    row = (
        db.query(RescueTypicalItems)
        .filter(RescueTypicalItems.producer_id == current_user.producer_id)
        .first()
    )
    return {
        "producer_id": current_user.producer_id,
        "items": list(row.items or []) if row else [],
        "updated_at": row.updated_at if row else utc_now(),
    }


@me_router.put(
    "/producers/me/rescue/typical-items",
    response_model=RescueTypicalItemsOut,
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("30/minute")
def set_typical_items(
    request: Request,
    body: RescueTypicalItemsIn,
    current_user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """Upsert the list. One row per business (uq_rescue_typical_items_producer),
    so this writes the existing row rather than racing a second insert."""
    if not current_user.producer_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="אין בית עסק מקושר"
        )
    cleaned = [item.strip() for item in body.items if item and item.strip()]
    row = (
        db.query(RescueTypicalItems)
        .filter(RescueTypicalItems.producer_id == current_user.producer_id)
        .first()
    )
    if row:
        row.items = cleaned
    else:
        row = RescueTypicalItems(producer_id=current_user.producer_id, items=cleaned)
        db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "producer_id": row.producer_id,
        "items": list(row.items or []),
        "updated_at": row.updated_at,
    }
