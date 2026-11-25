"""
Module:   rescue_writes
Purpose:  The state changes behind the rescue-bag write routes: cancel a whole
          offer, reserve, hand over, no-show, buyer cancel, review, clear a
          no-show block, record donated bags, set typical items.
Touches:  rescue_offers, rescue_orders, rescue_reviews, rescue_typical_items,
          users (rescue_no_show_count, rescue_block_cleared_at), the billing
          ledger (via billing_ledger.count_bag_and_commit).
Does NOT: send email or queue background work (the router does that after the
          commit, fail-open), read the clock-of-today or the pilot towns
          (passed in by the router so tests that patch them on
          app.routers.rescue keep working), or take the offer row lock itself —
          the router passes its `_offer_for_update` in as `lock`, because
          tests/test_rescue.py swaps that name on the router module to stage
          the cancel/handover race (MEH-2865).
Related:  backend/app/routers/rescue.py (handlers) ·
          backend/app/services/rescue_reads.py (the read routes, MEH-3541)
History:  MEH-3554 (moved out of routers/rescue.py, no behaviour change)
"""

from __future__ import annotations

import secrets
from collections.abc import Callable
from datetime import date
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

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
from app.schemas.rescue import (
    RescueOfferCreate,
    RescueOrderCreate,
    RescueReviewCreate,
    RescueTypicalItemsIn,
)
from app.services import billing_ledger  # MEH-3179
from app.services.rescue_emails import israel_date, israel_hhmm
from app.services.rescue_no_show import NO_SHOW_BLOCK_AT, active_no_show_counts
from app.services.rescue_reads import (
    RESERVE_CLOSES_BEFORE_END,
    leftover_bags,
    owner_offer_row,
    reserve_days,
)
from app.utils.clock import israel_today, utc_now

# The router's `_offer_for_update`, passed in (see the module docstring).
OfferLock = Callable[[Session, UUID], RescueOffer]

BLOCKED_DETAIL = "שני סלים לא נאספו, ולכן אי אפשר לשריין סלים חדשים כרגע. כתבו לנו"

# How many times to retry a colliding pickup code before giving up. The code
# is unique per OFFER and an offer holds at most 20 bags, so a collision is
# rare and a handful of tries is plenty; the UNIQUE constraint is what makes
# this correct rather than hopeful (uq_rescue_orders_code).
_CODE_ATTEMPTS = 8


def new_pickup_code() -> str:
    """A 4-digit code, zero-padded. `secrets`, not `random`: the code is the
    only thing standing between a stranger and someone else's bag at the
    counter, so it must not be predictable from previous codes."""
    return f"{secrets.randbelow(10000):04d}"


def active_no_shows(db: Session, user: User) -> int:
    """No-shows that still count against this buyer.

    The windowed count from `rescue_orders` is the authority, not
    `users.rescue_no_show_count` — that counter has no window and cannot
    express "in 30 days" (it would block a buyer whose two no-shows were a
    year apart). The counter is kept for display and the chunk-5 metrics.

    `rescue_block_cleared_at` is how an admin releases a buyer: only no-shows
    whose pickup window ended AFTER that moment are counted, so one write
    releases the block and nothing in the history is deleted.
    """
    return active_no_show_counts(db, [user.id]).get(user.id, 0)  # type: ignore[list-item]


def owns(user: User, producer_id: UUID) -> bool:
    return bool(user.producer_id) and user.producer_id == producer_id  # type: ignore[return-value]


def require_offer_owner(user: User, offer: RescueOffer) -> None:
    """The business that published the offer, or an admin. Admin override is
    the house IDOR rule (.claude/rules/security.md)."""
    if user.role == "admin":
        return
    location = offer.location
    if not location or not owns(user, location.producer_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="אין הרשאה")


def issue_order(
    db: Session, offer: RescueOffer, user: User, qty: int, *, lock: OfferLock
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
            pickup_code=new_pickup_code(),
            status="reserved",
        )
        db.add(candidate)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            offer = lock(db, offer.id)  # type: ignore[arg-type]
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


def order_or_404(db: Session, order_id: UUID) -> RescueOrder:
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


def _check_offer_day(body: RescueOfferCreate, today: date) -> None:
    """The bag's day and window against the Israel clock (MEH-3702); 422s."""
    if body.date < today:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="אי אפשר לפרסם סל לתאריך שעבר",
        )
    # MEH-3702: no further ahead than buyers can reserve, or the bag would sit
    # unlisted until its day comes into the window.
    if body.date > reserve_days(today)[1]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="אפשר לפרסם סל רק להיום או למחר",
        )
    # MEH-3702 edge case: a bag for tomorrow with today's hours (an API call,
    # or an owner's device on another clock) would sit under «מחר» with a
    # window that is already over by then, and the morning reminder would
    # miss it. A late-night window that runs into the next day stays allowed.
    if body.pickup_end <= utc_now():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="שעת סיום האיסוף כבר עברה",
        )
    if israel_date(body.pickup_start) < body.date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="שעות האיסוף צריכות להיות ביום של הסל",
        )


# MEH-3703: one publisher at a time, by hand or by the weekly routine. The
# "no active bag yet" check and the insert are two statements; without one
# lock a hand publish and the hourly job could both pass the check.
PUBLISH_LOCK_KEY = "rescue-schedule-publish"


def lock_offer_publishing(db: Session) -> None:
    """Take the transaction-scoped lock every bag insert waits on."""
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"),
        {"k": PUBLISH_LOCK_KEY},
    )


def publish_offer(
    db: Session,
    *,
    user: User,
    body: RescueOfferCreate,
    today: date,
    in_pilot: Callable[[str | None], bool],
) -> tuple[RescueOffer, Producer]:
    """Validate and insert today's bags at one pickup point; commits.

    Returns the producer too, for the router's new-bag alert."""
    if not user.producer_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="אין בית עסק מקושר"
        )

    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
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
    if not in_pilot(location.city):  # type: ignore[arg-type]
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="סלי הפתעה עדיין לא פתוחים ביישוב הזה",
        )

    _check_offer_day(body, today)

    lock_offer_publishing(db)
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
    return offer, producer


def cancel_whole_offer(
    db: Session, *, user: User, offer_id: UUID, lock: OfferLock
) -> tuple[RescueOffer, set[Any]]:
    """Cancel the offer and every open reservation on it; commits.

    Returns the ids of the buyers whose reservation went with it."""
    offer = lock(db, offer_id)
    require_offer_owner(user, offer)
    if offer.status != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="הסל כבר בוטל")
    now = utc_now()
    if offer.pickup_end <= now:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="זמן האיסוף חלף"
        )

    offer.status = "cancelled"  # type: ignore[assignment]
    # Read who held a bag under the offer lock: a reservation or a buyer's
    # cancel takes the same lock first, so this set cannot move until commit.
    buyer_ids = {
        user_id
        for (user_id,) in db.query(RescueOrder.user_id).filter(
            RescueOrder.offer_id == offer.id, RescueOrder.status == "reserved"
        )
    }
    (
        db.query(RescueOrder)
        .filter(RescueOrder.offer_id == offer.id, RescueOrder.status == "reserved")
        .update({"status": "cancelled", "cancelled_at": now}, synchronize_session=False)
    )
    db.commit()
    db.refresh(offer)
    return offer, buyer_ids


def reserve(
    db: Session, *, user: User, body: RescueOrderCreate, today: date, lock: OfferLock
) -> tuple[RescueOrder, RescueOffer]:
    """Check every reserve rule under the offer lock, issue the code, take the
    stock; commits."""
    if active_no_shows(db, user) >= NO_SHOW_BLOCK_AT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=BLOCKED_DETAIL
        )

    offer = lock(db, body.offer_id)
    # MEH-2952: a test row's bag is not listed, so not reservable by id either
    # (same 404). Cancel shares _offer_for_update, so the check lives here.
    location = offer.location
    if (
        location is not None
        and location.producer is not None
        and location.producer.is_test
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הסל לא נמצא")
    if offer.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="הסל אינו פעיל"
        )
    first, last = reserve_days(today)
    if not first <= offer.date <= last:  # MEH-3702: today and tomorrow
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="אפשר לשריין רק סלים של היום ושל מחר",
        )
    if offer.pickup_end <= utc_now() + RESERVE_CLOSES_BEFORE_END:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="זמן האיסוף חלף"
        )

    # The two-bag cap is per BUYER per offer, not per request (3 × 2 = past it).
    already = int(
        db.query(func.coalesce(func.sum(RescueOrder.qty), 0))
        .filter(
            RescueOrder.offer_id == offer.id,
            RescueOrder.user_id == user.id,
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

    order, offer = issue_order(db, offer, user, body.qty, lock=lock)
    offer.qty_left = offer.qty_left - body.qty  # type: ignore[assignment]
    db.commit()
    db.refresh(order)
    return order, offer


def created_order_payload(order: RescueOrder, offer: RescueOffer) -> dict[str, object]:
    """The reserve response: the order plus the offer facts the buyer's
    confirmation screen shows."""
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
        "date": offer.date,
        "cancel_until": offer.cancel_until,
        "pickup_start": offer.pickup_start,
        "pickup_end": offer.pickup_end,
    }


def refuse_unless_reserved_for_handover(order: RescueOrder) -> None:
    """409 unless the order is still `reserved`; a repeat tap names the time."""
    if order.status == "handed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"הסל כבר נמסר ב-{israel_hhmm(order.handed_at)}"  # type: ignore[arg-type]
            if order.handed_at
            else "הסל כבר נמסר",
        )
    if order.status != "reserved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="ההזמנה אינה פעילה"
        )


def hand_over(
    db: Session, *, user: User, order_id: UUID, lock: OfferLock
) -> RescueOrder:
    """Mark the bag handed, under the offer then order lock; commits through
    the billing ledger."""
    order = order_or_404(db, order_id)
    require_offer_owner(user, order.offer)
    refuse_unless_reserved_for_handover(order)
    # MEH-3805: tomorrow's bag is reserved, not collectable. The dashboard
    # shows no button on tomorrow's rows; this holds a direct call too. A
    # past day stays allowed: a business may mark yesterday's bag late.
    if order.offer.date > israel_today():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="אפשר למסור את הסל רק ביום האיסוף",
        )

    # Lock the offer, then the order — the order cancel_order takes them in —
    # and read the status AGAIN under the lock (MEH-2865). The check above ran
    # on a row read before any lock: a buyer's cancel in the same instant also
    # saw `reserved`, put the bag back on the list, and this one then handed
    # it over — one bag both handed and for sale again.
    lock(db, order.offer_id)  # type: ignore[arg-type]
    db.refresh(order, with_for_update=True)
    refuse_unless_reserved_for_handover(order)

    order.status = "handed"  # type: ignore[assignment]
    order.handed_at = utc_now()  # type: ignore[assignment]
    order.handed_by = user.id
    billing_ledger.count_bag_and_commit(db, order)  # MEH-3179: ledger row, then commit
    db.refresh(order)
    return order


def record_no_show(
    db: Session, *, user: User, order_id: UUID, lock: OfferLock
) -> RescueOrder:
    """Mark nobody came, only after `pickup_end`; commits."""
    order = order_or_404(db, order_id)
    require_offer_owner(user, order.offer)

    if order.offer.pickup_end > utc_now():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="אפשר לסמן «לא הגיע» רק אחרי שזמן האיסוף נגמר",
        )
    if order.status != "reserved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="ההזמנה אינה פעילה"
        )

    # Same locks + re-read as cancel_order (MEH-2865): a cancel landing between
    # the read above and this write would leave a cancel AND a no-show.
    lock(db, order.offer_id)  # type: ignore[arg-type]
    db.refresh(order, with_for_update=True)
    if order.status != "reserved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="ההזמנה אינה פעילה"
        )

    order.status = "no_show"  # type: ignore[assignment]
    # Display/metrics counter; the 422 gate reads active_no_shows. One SQL
    # increment, not a Python read-modify-write: two no-shows for one buyer at
    # once each read the same value and one count was lost (MEH-2865).
    db.query(User).filter(User.id == order.user_id).update(
        {User.rescue_no_show_count: func.coalesce(User.rescue_no_show_count, 0) + 1},
        synchronize_session=False,
    )
    db.commit()
    db.refresh(order)
    return order


def buyer_cancel(
    db: Session, *, user: User, order_id: UUID, lock: OfferLock
) -> tuple[RescueOrder, RescueOffer]:
    """The buyer's free cancel, until `cancel_until`; puts the bags back and
    commits."""
    order = order_or_404(db, order_id)
    if order.user_id != user.id:
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

    # Lock the offer, then the order, and read the order's status AGAIN under
    # the lock (MEH-2737). The check above ran on a row read before any lock:
    # two cancels of one order (a double tap, or the page and the email at
    # once) both saw `reserved` there, and with only the offer locked the
    # second one still added the bags back — a bag on the list that does not
    # exist. Offer first, then order: the same order reserving takes them in.
    offer = lock(db, order.offer_id)  # type: ignore[arg-type]
    db.refresh(order, with_for_update=True)
    if order.status != "reserved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="ההזמנה אינה פעילה"
        )
    order.status = "cancelled"  # type: ignore[assignment]
    order.cancelled_at = utc_now()  # type: ignore[assignment]
    offer.qty_left = min(offer.qty_left + order.qty, offer.qty_total)  # type: ignore[arg-type]
    db.commit()
    db.refresh(order)
    return order, offer


def reviewable_order(db: Session, *, user: User, order_id: UUID) -> RescueOrder:
    """The buyer's own collected order, or 404 / 403 / 409.

    Split from add_review so the photo ownership check (MEH-3247) stays in the
    handler, between these checks and the write, where
    tests/test_meh3247_own_uploads_only.py reads it (MEH-3554).
    """
    order = order_or_404(db, order_id)
    if order.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="אין הרשאה")
    if order.status != "handed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="אפשר לדרג רק אחרי שקיבלתם את הסל",
        )
    return order


def add_review(
    db: Session, *, order: RescueOrder, body: RescueReviewCreate
) -> RescueReview:
    """One review per collected bag; commits. Call reviewable_order first."""
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


def clear_block(db: Session, *, user_id: UUID) -> dict[str, Any]:
    """Write `rescue_block_cleared_at`; commits. Returns both numbers."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="המשתמשת לא נמצאה"
        )

    user.rescue_block_cleared_at = utc_now()  # type: ignore[assignment]
    db.commit()
    db.refresh(user)
    active = active_no_shows(db, user)
    return {
        "user_id": user.id,
        "no_show_count": user.rescue_no_show_count or 0,
        "active_no_shows": active,
        "block_cleared_at": user.rescue_block_cleared_at,
        "blocked": active >= NO_SHOW_BLOCK_AT,
    }


def record_donated(
    db: Session, *, user: User, offer_id: UUID, qty: int, lock: OfferLock
) -> dict[str, Any]:
    """Uncollected bags given away, after the window and up to the leftover;
    commits."""
    offer = lock(db, offer_id)
    require_offer_owner(user, offer)
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
    leftover = leftover_bags(offer, now)
    if qty > leftover:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"אפשר לסמן עד {leftover} סלים שלא נאספו",
        )
    offer.qty_donated = qty  # type: ignore[assignment]
    db.commit()
    db.refresh(offer)
    return owner_offer_row(offer, now)


def save_typical_items(
    db: Session, *, producer_id: UUID, body: RescueTypicalItemsIn
) -> dict[str, Any]:
    """Upsert the business's one row; commits."""
    cleaned = [item.strip() for item in body.items if item and item.strip()]
    row = (
        db.query(RescueTypicalItems)
        .filter(RescueTypicalItems.producer_id == producer_id)
        .first()
    )
    # Already normalised by the schema validator: None / [] -> None, unknown
    # code -> 422 before we get here. Assigning it straight through keeps ONE
    # owner for what a valid declaration is (app/allergens.py).
    if row:
        row.items = cleaned  # type: ignore[assignment]
        row.allergens = body.allergens  # type: ignore[assignment]
    else:
        row = RescueTypicalItems(
            producer_id=producer_id,
            items=cleaned,
            allergens=body.allergens,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "producer_id": row.producer_id,
        "items": list(row.items or []),
        # Straight from the row, never `or []`: NULL has to survive the
        # response or the caller cannot tell "not declared" from "none".
        "allergens": row.allergens,
        "updated_at": row.updated_at,
    }
