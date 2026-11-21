"""
Module:   rescue
Purpose:  The rescue-bags pilot API — a business publishes today's bags, a
          buyer reserves one and gets a 4-digit code, the business marks it
          handed or not-collected, and two no-shows in 30 days stop the buyer
          reserving again.
Touches:  DB tables rescue_offers / rescue_orders / rescue_reviews /
          rescue_typical_items and `users.rescue_no_show_count` +
          `users.rescue_block_cleared_at`. Outbound: EMAIL to the buyer,
          queued after the commit and fail-open (services/rescue_emails.py) —
          on a reservation (MEH-2715), on the buyer's own cancel (MEH-2737),
          and when the business cancels the offer (MEH-2738).
          Plus the follower alert on a bag for today (MEH-3117).
Does NOT: take payment. There is none in the pilot: the buyer pays at the
          counter, no endpoint quotes a total to charge and no order row
          records money.
          It sends no rescue-specific WhatsApp and nothing to the business.
          (MEH-3117: the generic favorite alert — push + the approved
          favorite_alert_he_v1 template — does go out to followers when a
          bag for today is published, through alerts.fire_alerts.)
          Not built:
            - the pickup_start digest of codes to the business. `fire_alerts`
              is the wrong mechanism (it fans out to CONSUMERS who opted in
              through FavoriteAlert columns, from inside a request, not on a
              clock), so this needs a scheduler job in the `pending_nudge`
              shape plus an idempotency stamp. MEH-2646 carries the decision.
            - a WhatsApp to buyers when a business cancels a whole offer.
              A business-initiated message needs a Meta-APPROVED template
              (`services/whatsapp.py:279` — send_text only works inside the
              24h window), and no rescue template exists. The email above is
              what tells them instead.
Related:  app/models/models.py (RescueOffer and siblings, the status tuples),
          app/schemas/rescue.py (every request/response shape),
          app/routers/group_buys.py:238-258 (the with_for_update pattern this
          reuses for stock, MEH-773)
History:  MEH-2646 (creation, chunk 2/4 of the rescue-bags pilot MEH-2643);
          MEH-3117 (new_rescue favorite alert on create_offer)
"""

from typing import Any
import logging
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
from sqlalchemy.orm import Session, object_session

from app.auth import (
    get_current_user,
    require_admin,
    require_producer,
    require_verified_email,
    require_verified_producer,
)
from app.config import settings
from app.data.cities import canonical_city
from app.database import get_db
from app.models.models import (
    Producer,
    RescueOffer,
    RescueOrder,
    RescueReview,
    User,
)
from app.rate_limit import limiter
from app.services import capabilities  # MEH-3179 · MEH-3180
from app.schemas.rescue import (
    RescueNoShowStateOut,
    RescueOfferCreate,
    RescueOfferDetailOut,
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
from app.services.rescue_business_emails import queue_business_reservation_email
from app.services.rescue_emails import (
    ReservationEmail,
    israel_hhmm,
    send_business_cancel_email,
    send_cancel_email,
    send_reservation_email,
)
from app.services.rescue_no_show import (  # MEH-3226
    NO_SHOW_BLOCK_AT,  # noqa: F401 — re-exported for tests/test_rescue.py
    NO_SHOW_WINDOW_DAYS,  # noqa: F401 — re-exported for tests/test_rescue.py
    queue_no_show_email,
)
from app.utils.clock import israel_today, utc_now
from app.services.image_ownership import assert_own_new_images  # MEH-3247
from app.services.rescue_writes import (  # MEH-3554
    active_no_shows,
    add_review,
    buyer_cancel,
    cancel_whole_offer,
    clear_block,
    created_order_payload,
    hand_over,
    publish_offer,
    record_donated,
    record_no_show,
    reserve,
    reviewable_order,
    save_typical_items,
)
from app.services.rescue_reads import (  # MEH-3541
    RESERVE_CLOSES_BEFORE_END,  # noqa: F401 — re-exported for tests
    business_offers_today,
    business_orders_today,
    my_reservations,
    offer_detail,
    pilot_numbers,
    public_offers,
    typical_items,
)

logger = logging.getLogger(__name__)

# RESERVE_CLOSES_BEFORE_END lives in services/rescue_reads.py since MEH-3541
# (the list reads it there); the reserve guard reads it in
# services/rescue_writes.py since MEH-3554, and it is re-exported above.

router = APIRouter(prefix="/rescue", tags=["rescue"])
admin_router = APIRouter(prefix="/admin/rescue", tags=["admin-rescue"])
# The business's own view lives under /producers/me, beside /producers/me/group-buys
# (MEH-2437), so it needs a router without the /rescue prefix.
me_router = APIRouter(tags=["rescue"])

# The pilot's no-show rule (NO_SHOW_BLOCK_AT inside NO_SHOW_WINDOW_DAYS) lives
# in services/rescue_no_show.py since MEH-3226, so /admin/users reads the same
# numbers; imported above and re-exported here for the tests.
# BLOCKED_DETAIL and the pickup-code retry live in services/rescue_writes.py
# since MEH-3554, with the write routes' state changes.


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


def _offer_for_update(db: Session, offer_id: UUID) -> RescueOffer:
    """Load the offer with its row locked.

    MEH-773, via group_buys.py:238-258: without the lock two reservations can
    both read `qty_left = 1` and both decrement, overselling the bag. The
    `0 <= qty_left <= qty_total` CHECK then turns the loser into a failed
    transaction instead of negative stock — the lock is what makes it a clean
    409 instead.

    populate_existing() (MEH-2865 review): the offer is usually already in the
    session — `_order_or_404` loaded `order.offer` before the lock — and
    without it the query takes the lock but hands back that cached object, so
    `qty_left` is the value from BEFORE the lock. cancel_order then put bags
    back on top of a stale count. Same trap as auth.py's "DO NOT drop
    populate_existing()".
    """
    offer = (
        db.query(RescueOffer)
        .filter(RescueOffer.id == offer_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הסל לא נמצא")
    return offer


@router.post(
    "/offers",
    response_model=RescueOfferOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_rescue_enabled), Depends(capabilities.bags_open)],
)
@limiter.limit("20/minute")
def create_offer(
    request: Request,
    body: RescueOfferCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_verified_producer),
    db: Session = Depends(get_db),
) -> RescueOfferOut | RescueOffer:
    """Publish today's bags at one pickup point.

    NOT VALIDATED, and it is worth knowing why: the spec asks that
    `pickup_end` be at least 15 minutes before the business closes. There is
    nothing to compute that against. `opening_hours` is unbounded free text on
    both producers and locations, which the repo has already ruled is not
    computable (models.py:443-446), and `order_window` is a different fact —
    when ORDERS are accepted, not when the door shuts. Validating against it
    would enforce the wrong rule convincingly. MEH-2646 carries the decision.
    """
    offer, producer = publish_offer(
        db,
        user=current_user,
        body=body,
        today=israel_today(),
        in_pilot=city_in_pilot,
    )
    _queue_new_rescue_alert(background_tasks, db, producer, offer)
    return offer


def _queue_new_rescue_alert(
    background_tasks: BackgroundTasks,
    db: Session,
    producer: Producer,
    offer: RescueOffer,
) -> None:
    """MEH-3117: tell the people who saved this business that it has bags today.

    Only for an offer dated TODAY on the Israel clock — the approved title
    says «היום», so a bag published tonight for tomorrow sends nothing (a
    morning-of send would need a scheduler job; not in the pilot). Fired
    here only, after the commit: never on cancel, reservation or handover.
    Same fan-out, channels and 24h cap as the other alert types.
    """
    if offer.date != israel_today() or offer.pickup_end <= utc_now():
        return  # not today, or the pickup window is already over
    from app.routers.alerts import AlertContent, fire_alerts

    # Approved copy, Sapir 14/11 (MEH-3117 rows 2 and 3).
    background_tasks.add_task(
        fire_alerts,
        db,
        producer.id,  # type: ignore[arg-type]
        "new_rescue",
        AlertContent(
            title=f"סלי הפתעה היום ב{producer.name}",
            body=(
                f"{offer.qty_total} סלים, איסוף "
                f"{israel_hhmm(offer.pickup_start)}–{israel_hhmm(offer.pickup_end)}"  # type: ignore[arg-type]
            ),
            url="/rescue",
        ),
    )


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
) -> list[RescueOfferPublicOut] | list[dict[str, Any]]:
    """Today's bags that still have stock. Public — no auth.

    Sold-out and cancelled offers are omitted rather than greyed out: the list
    is "what you can still get tonight", and chunk 4 has no empty-stock state.
    """
    pilot = rescue_cities()
    return public_offers(
        db, today=israel_today(), pilot=pilot, city=city, lat=lat, lng=lng
    )


@router.get(
    "/offers/{offer_id}",
    response_model=RescueOfferDetailOut,
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("120/minute")
def get_offer(
    request: Request,
    offer_id: UUID,
    db: Session = Depends(get_db),
) -> RescueOfferDetailOut | dict[str, Any]:
    """One of today's bags, for its own page (MEH-3586). Public — no auth.

    A sold-out, cancelled or closed bag still answers, with `state` saying
    why; another day's bag, a test or unapproved business, or a town outside
    the pilot answers 404 — the same set the list never shows.
    """
    row = offer_detail(
        db, offer_id=offer_id, today=israel_today(), pilot=rescue_cities()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="הסל הזה לא נמצא")
    return row


@router.post(
    "/offers/{offer_id}/cancel",
    response_model=RescueOfferOut,
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("20/minute")
def cancel_offer(
    request: Request,
    offer_id: UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RescueOfferOut | RescueOffer:
    """The business pulls the whole bag offer. Every open reservation on it is
    cancelled with it; a bag already handed over stays handed.

    No refund, because nothing was paid. MEH-2738: each buyer whose
    reservation went with it gets one email after the commit (fail-open), and
    their page says the business cancelled (`list_my_reservations`). A window
    that already closed is refused: by then every bag is collected or a
    no-show, and cancelling would only rewrite the record.
    """
    offer, buyer_ids = cancel_whole_offer(
        db, user=current_user, offer_id=offer_id, lock=_offer_for_update
    )
    try:
        _queue_business_cancel_emails(background_tasks, db, offer, buyer_ids)
    except Exception as exc:  # the cancel is committed; a mail never undoes it
        capture_background_exception(exc, task="rescue_business_cancel_email")
    return offer


def _queue_business_cancel_emails(
    background_tasks: BackgroundTasks,
    db: Session,
    offer: RescueOffer,
    buyer_ids: set[Any],
) -> None:
    """MEH-2738: one email per buyer whose reservation the business cancelled.

    Values are read here, while the Session is open, and handed to the task
    as plain strings (the MEH-1651 convention). One per buyer, not per order:
    a buyer may hold two orders on one offer.
    """
    if not buyer_ids:
        return
    location = offer.location
    producer = location.producer if location else None
    if producer is None:
        return
    emails = sorted(
        {
            email
            for (email,) in db.query(User.email).filter(User.id.in_(buyer_ids))
            if email
        }
    )
    for email in emails:
        background_tasks.add_task(
            send_business_cancel_email,
            email,
            producer.name or "",
            test_cause=bool(producer.is_test),  # MEH-2952
        )


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
) -> list[RescueMyOrderOut] | list[dict[str, Any]]:
    """The caller's own live reservations on today's bags (MEH-2680).

    Only the caller's rows, only today's offers (Israel date), only
    `reserved` / `handed` — a no-show or a buyer's own cancel has no code
    left to say and nothing to review. Carries the same fields as the
    reservation response, so the confirmation renders from either without a
    second shape.

    MEH-2738: plus the reservations the BUSINESS cancelled, flagged
    `cancelled_by_business`, so the page can say so instead of silently
    dropping the code. See `_business_cancelled_ids` for how they are told
    apart from a buyer's own cancel without a column for it.
    """
    return my_reservations(db, user_id=current_user.id, today=israel_today())


def _pickup_note(offer: RescueOffer, producer_id: Any) -> str | None:
    """MEH-3593: the business's «הוראות איסוף», read on the offer's own
    Session (still open here, before the task is queued)."""
    db = object_session(offer)
    if db is None:
        return None
    try:
        note: str | None = typical_items(db, producer_id=producer_id)["pickup_note"]
    except Exception:  # noqa: BLE001 — a note must never cost the buyer the code email
        logger.warning("rescue: pickup note read failed for producer %s", producer_id)
        return None
    return note


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
        user.email,  # type: ignore[arg-type]
        ReservationEmail(
            producer_name=producer.name or "",
            producer_id=str(producer.id),
            pickup_code=order.pickup_code,  # type: ignore[arg-type]
            total_agorot=offer.price_agorot * order.qty,  # type: ignore[arg-type]
            pickup_from=israel_hhmm(offer.pickup_start),  # type: ignore[arg-type]
            pickup_until=israel_hhmm(offer.pickup_end),  # type: ignore[arg-type]
            address=address,
            # MEH-2737: reserved after the free-cancel cutoff → the email says
            # nothing about cancelling (no line, no button).
            cancel_until=(
                israel_hhmm(offer.cancel_until)  # type: ignore[arg-type]
                if offer.cancel_until > utc_now()
                else None
            ),
            pickup_note=_pickup_note(offer, producer.id),
        ),
        # MEH-2952: a test business or a test buyer → dropped and logged.
        test_cause=bool(producer.is_test or user.is_test),
    )


def _queue_cancel_email(
    background_tasks: BackgroundTasks, user: User, offer: RescueOffer
) -> None:
    """MEH-2737: tell the buyer the cancel went through.

    Same rules as `_queue_reservation_email`: plain values only, queued after
    the commit, nothing when the buyer has no email.
    """
    location = offer.location
    producer = location.producer if location else None
    if not user.email or producer is None:
        return
    background_tasks.add_task(
        send_cancel_email,
        user.email,  # type: ignore[arg-type]
        producer.name or "",
        test_cause=bool(producer.is_test or user.is_test),  # MEH-2952
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
    # MEH-3225: verified email first — the code and no-show mails go there.
    current_user: User = Depends(require_verified_email),
    db: Session = Depends(get_db),
) -> RescueOrderCreatedOut | dict[str, object]:
    """Reserve bags and get the 4-digit code read out at the counter."""
    order, offer = reserve(
        db, user=current_user, body=body, today=israel_today(), lock=_offer_for_update
    )
    # The reservation is committed. Nothing about preparing the email may turn
    # it into a 500: the buyer would read that as "not reserved" and retry.
    try:
        _queue_reservation_email(background_tasks, current_user, offer, order)
        queue_business_reservation_email(background_tasks, db, offer, order)  # MEH-3313
    except Exception as exc:  # noqa: BLE001 — fail-open by design (MEH-2715)
        capture_background_exception(exc, task="rescue_reservation_email")
        logger.error("rescue reservation email not queued: %s", type(exc).__name__)
    return created_order_payload(order, offer)


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
) -> RescueOrderOut | RescueOrder:
    """The business hands the bag over against the code.

    A second call is a 409 naming `handed_at`, not a silent success: at the
    counter a repeated tap usually means the first one was not seen, and the
    honest answer is "already done at 18:42".
    """
    return hand_over(db, user=current_user, order_id=order_id, lock=_offer_for_update)


@router.post(
    "/orders/{order_id}/no_show",
    response_model=RescueOrderOut,
    dependencies=[Depends(require_rescue_enabled)],
)
@limiter.limit("60/minute")
def mark_no_show(  # noqa: PLR0913 — FastAPI-injected; MEH-3226 added background_tasks
    request: Request,
    order_id: UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RescueOrderOut | RescueOrder:
    """The business records that nobody came for the bag — only after
    `pickup_end`: before that the buyer may still be on their way, and a
    no-show blocks reserving again. The buyer is mailed each time (MEH-3226)."""
    order = record_no_show(
        db, user=current_user, order_id=order_id, lock=_offer_for_update
    )
    try:  # MEH-3226: the mark is committed; a mail-side failure must not 500 it
        active = active_no_shows(db, order.user)
        queue_no_show_email(background_tasks, order, active=active)
    except Exception as exc:  # noqa: BLE001 — fail-open, like the MEH-2715 email
        capture_background_exception(exc, task="rescue_no_show_email")
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
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RescueOrderOut | RescueOrder:
    """The buyer cancels, free, until the offer's `cancel_until`."""
    order, offer = buyer_cancel(
        db, user=current_user, order_id=order_id, lock=_offer_for_update
    )
    # Committed. A failure preparing the email must not turn a done cancel
    # into a 500 the buyer would read as "still reserved".
    try:
        _queue_cancel_email(background_tasks, current_user, offer)
    except Exception as exc:  # noqa: BLE001 — fail-open, as the reservation email
        capture_background_exception(exc, task="rescue_cancel_email")
        logger.error("rescue cancel email not queued: %s", type(exc).__name__)
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
) -> RescueReviewOut | RescueReview:
    """The buyer reviews a bag they actually collected. Once."""
    order = reviewable_order(db, user=current_user, order_id=order_id)
    assert_own_new_images(current_user, body.photo_url)  # MEH-3247
    return add_review(db, order=order, body=body)


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
) -> Any:
    """Release a buyer's no-show block.

    Writes `rescue_block_cleared_at` instead of zeroing the counter, so the
    no-show rows stay in the history for the chunk-5 metrics while stopping
    counting against the buyer. Returns both numbers, because a reset whose
    effect you cannot see is a reset you have to trust.
    """
    return clear_block(db, user_id=user_id)


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
) -> list[RescueOwnerOrderOut] | list[dict[str, Any]]:
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

    return business_orders_today(
        db, producer_id=current_user.producer_id, today=israel_today()
    )


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
) -> list[RescueOwnerOfferOut] | list[dict[str, Any]]:
    """Today's bags across this business's pickup points, with what was left.

    Today only, by the Israel clock, like the orders list beside it.
    """
    if not current_user.producer_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="אין בית עסק מקושר"
        )
    return business_offers_today(
        db, producer_id=current_user.producer_id, today=israel_today()
    )


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
) -> RescueOwnerOfferOut | dict[str, Any]:
    """Record how many uncollected bags were given away free.

    Owner (or admin) of the offer's point only. Only after the window
    closed, and never more than was left over — a number above the leftover
    would inflate the pilot's «ניצלו» count with bags that were sold.
    """
    return record_donated(
        db, user=current_user, offer_id=offer_id, qty=body.qty, lock=_offer_for_update
    )


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
) -> Any:
    """The pilot's four numbers, read-only.

    Rates come back as fractions, and as None when their denominator is zero:
    a pilot with no bags published yet has no sell-through, and reporting 0%
    would read as "nothing sold" rather than "nothing offered". That
    distinction is the whole point of a pilot metric.
    """
    return pilot_numbers(db, today=israel_today(), days=days)


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
) -> Any:
    """«בדרך כלל: …» as it stands. An empty list when never set — the read
    never has to distinguish "no row" from "empty", only the first."""
    if not current_user.producer_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="אין בית עסק מקושר"
        )
    return typical_items(db, producer_id=current_user.producer_id)


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
) -> Any:
    """Upsert the list. One row per business (uq_rescue_typical_items_producer),
    so this writes the existing row rather than racing a second insert."""
    if not current_user.producer_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="אין בית עסק מקושר"
        )
    return save_typical_items(
        db,
        producer_id=current_user.producer_id,  # type: ignore[arg-type]
        body=body,
    )
