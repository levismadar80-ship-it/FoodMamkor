"""
Module:   product_order_actions
Purpose:  Everything that happens to an order after it was sent: the buyer
          cancels or accepts a proposed change; the business confirms,
          declines, proposes a change, marks ready, hands over, reports a
          no-show or cancels. Also the pickup code.
Touches:  DB table product_orders (the columns around a move: final total,
          pickup code, the proposal) and, through product_order_state, the
          status and the event log. Locks the order row; a move that assigns
          a pickup code locks the business row first. Does not commit.
Does NOT: assign `status` — product_order_state.apply_transition is the only
          writer (tests/test_meh3263_order_route.py scans for it).
          Does NOT check who is asking: the routes resolve the order for the
          caller (token, account or own business) before calling in.
          Does NOT notify anyone (stage 3 of MEH-3216).
Related:  app/services/product_order_state.py (the moves),
          app/services/product_order_create.py (creation),
          app/routers/product_order_buyer.py, product_order_business.py
History:  MEH-3263 (creation; stage 2b of MEH-3216)
"""

import secrets
from datetime import datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.models import Producer
from app.models.product_orders import (
    PRODUCT_ORDER_CODE_STATUSES,
    ProducerOrderSettings,
    ProductOrder,
)
from app.services.product_order_menu import offered_slots
from app.services.product_order_state import (
    Actor,
    InvalidTransition,
    apply_transition,
)
from app.utils.clock import utc_now

_ALL_CODES = 10_000
# How long the buyer has to answer a change the business proposed; the timer
# that enforces it is stage 3.
PROPOSAL_ANSWER_WINDOW = timedelta(hours=24)

NOT_FOUND_DETAIL = "ההזמנה לא נמצאה"
CUTOFF_PASSED_DETAIL = "כבר אי אפשר לבטל את ההזמנה באתר. צריך לפנות ישירות לבית העסק"
NEEDS_FINAL_TOTAL_DETAIL = (
    "בהזמנה יש מוצר במחיר משוער. צריך לקבוע סכום סופי לפני האישור"
)
NO_CODES_DETAIL = "אי אפשר לאשר הזמנות נוספות כרגע. צריך לסגור קודם הזמנות שכבר נמסרו"
WRONG_PICKUP_CODE_DETAIL = "הקוד לא תואם להזמנה הזאת"
TOO_EARLY_NO_SHOW_DETAIL = "אפשר לסמן «לא הגיעו» רק אחרי שעבר מועד ההזמנה"
PROPOSED_SLOT_DETAIL = "המועד המוצע לא נמצא בחלונות הזמן של בית העסק"
SLOT_PASSED_DETAIL = "מועד ההזמנה כבר עבר, ולכן אי אפשר לאשר אותה"
PROPOSAL_PASSED_DETAIL = "המועד שהוצע כבר עבר. צריך לפנות ישירות לבית העסק"
FINAL_TOTAL_FIXED_DETAIL = (
    "בהזמנה במחיר קבוע הסכום כבר ידוע. כדי לשנות אותו צריך להציע שינוי"
)
FINAL_TOTAL_TOO_HIGH_DETAIL = (
    "הסכום הסופי גבוה מההערכה שהוצגה בהזמנה. כדי לקבוע סכום גבוה יותר צריך להציע שינוי"
)


def _move(db: Session, order: ProductOrder, to: str, actor: Actor, note: Any) -> None:
    try:
        apply_transition(db, order, to, actor, note)
    except InvalidTransition as refused:
        raise HTTPException(
            status_code=(
                status.HTTP_403_FORBIDDEN
                if refused.forbidden
                else status.HTTP_409_CONFLICT
            ),
            detail=refused.detail,
        ) from refused


def lock_order(db: Session, order_id: Any) -> ProductOrder:
    """Re-read the order under a row lock: a business confirming while the
    buyer cancels must see each other's result, not overwrite it."""
    order = (
        db.query(ProductOrder)
        .filter(ProductOrder.id == order_id)
        .populate_existing()
        .with_for_update()
        .first()
    )
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_DETAIL
        )
    return order


def lock_business(db: Session, producer_id: Any) -> None:
    """Taken BEFORE the order row by every move that assigns a pickup code,
    the same order of locks as order creation."""
    db.query(Producer.id).filter(Producer.id == producer_id).with_for_update(
        key_share=True
    ).first()


def assign_pickup_code(db: Session, order: ProductOrder) -> None:
    """Give a confirmed order four digits no other order of this business
    that can still be handed over is using.

    The caller holds the business row locked, so the read below cannot race;
    the partial unique index (uq_product_orders_open_pickup_code) is the
    backstop if a caller ever forgets.
    """
    in_use = {
        code
        for (code,) in db.query(ProductOrder.pickup_code).filter(
            ProductOrder.producer_id == order.producer_id,
            ProductOrder.status.in_(PRODUCT_ORDER_CODE_STATUSES),
            ProductOrder.pickup_code.isnot(None),
            ProductOrder.id != order.id,
        )
    }
    if len(in_use) >= _ALL_CODES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=NO_CODES_DETAIL
        )
    while True:
        code = f"{secrets.randbelow(_ALL_CODES):04d}"
        if code not in in_use:
            order.pickup_code = code  # type: ignore[assignment]
            return


def clear_proposal(order: ProductOrder) -> None:
    """Called on every move out of `change_proposed`, so a proposal nobody
    accepted does not stay on a closed order."""
    order.proposed_slot_start = None  # type: ignore[assignment]
    order.proposed_slot_end = None  # type: ignore[assignment]
    order.proposed_total_agorot = None  # type: ignore[assignment]
    order.proposal_note = None  # type: ignore[assignment]


def cutoff_hours(db: Session, order: ProductOrder) -> int:
    row = (
        db.query(ProducerOrderSettings.cancel_cutoff_hours)
        .filter(ProducerOrderSettings.producer_id == order.producer_id)
        .first()
    )
    return int(row[0]) if row is not None else 0


def buyer_can_cancel(order: ProductOrder, cutoff: int, now: datetime) -> bool:
    """A request not yet agreed can always be withdrawn; an agreed order only
    until the business's cutoff before the slot; a packed one not at all."""
    if order.status in ("pending", "change_proposed"):
        return True
    if order.status == "confirmed":
        return bool(now <= order.slot_start - timedelta(hours=cutoff))
    return False


# --- the buyer ---------------------------------------------------------------


def buyer_cancel(db: Session, order_id: Any, actor: Actor) -> ProductOrder:
    order = lock_order(db, order_id)
    cutoff = cutoff_hours(db, order)
    # A packed (`ready`) order gets the same answer as one past the cutoff:
    # where to turn, not the state machine's "not allowed".
    if order.status in ("confirmed", "ready") and not buyer_can_cancel(
        order, cutoff, utc_now()
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=CUTOFF_PASSED_DETAIL
        )
    _move(db, order, "cancelled", actor, None)
    clear_proposal(order)
    return order


def buyer_accept_change(db: Session, order: ProductOrder, actor: Actor) -> ProductOrder:
    lock_business(db, order.producer_id)
    order = lock_order(db, order.id)
    # MEH-3263: an order confirmed after its slot could be reported as a
    # no-show at once, for a hand-over nobody was ever told to come to.
    agreed_start = order.proposed_slot_start or order.slot_start
    if order.status == "change_proposed" and utc_now() >= agreed_start:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=PROPOSAL_PASSED_DETAIL
        )
    _move(db, order, "confirmed", actor, None)
    if order.proposed_slot_start is not None:
        order.slot_start = order.proposed_slot_start
        order.slot_end = order.proposed_slot_end
    order.final_total_agorot = (
        order.proposed_total_agorot
        if order.proposed_total_agorot is not None
        else order.estimated_total_agorot
    )
    clear_proposal(order)
    assign_pickup_code(db, order)
    return order


# --- the business ------------------------------------------------------------


def _check_confirmable(
    order: ProductOrder, has_estimate: bool, final_total_agorot: int | None
) -> None:
    """What a business may do on its own word. The slot must still be ahead
    (a late confirm followed by «no-show» would block a buyer who was never
    told to come). The final total is hers to set only where the buyer was
    shown an estimate, and only up to the figure shown; anything above it, or
    any change to a fixed price, needs the buyer's yes — propose-change."""
    if utc_now() >= order.slot_start:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=SLOT_PASSED_DETAIL
        )
    detail = None
    if has_estimate and final_total_agorot is None:
        detail = NEEDS_FINAL_TOTAL_DETAIL
    elif not has_estimate and final_total_agorot is not None:
        detail = FINAL_TOTAL_FIXED_DETAIL
    elif final_total_agorot is not None and final_total_agorot > int(
        order.estimated_total_agorot
    ):
        detail = FINAL_TOTAL_TOO_HIGH_DETAIL
    if detail is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail
        )


def business_confirm(
    db: Session, order_id: Any, actor: Actor, final_total_agorot: int | None
) -> ProductOrder:
    producer_id = (
        db.query(ProductOrder.producer_id).filter(ProductOrder.id == order_id).scalar()
    )
    lock_business(db, producer_id)
    order = lock_order(db, order_id)
    has_estimate = any(line.price_is_estimate for line in order.items)
    if order.status == "pending":
        _check_confirmable(order, has_estimate, final_total_agorot)
    _move(db, order, "confirmed", actor, None)
    if final_total_agorot is None:
        final_total_agorot = int(order.estimated_total_agorot)
    order.final_total_agorot = final_total_agorot  # type: ignore[assignment]
    assign_pickup_code(db, order)
    return order


def business_propose_change(  # noqa: PLR0913 — one argument per proposal field
    db: Session,
    order_id: Any,
    actor: Actor,
    slot_start: datetime | None,
    total_agorot: int | None,
    note: str,
) -> ProductOrder:
    order = lock_order(db, order_id)
    now = utc_now()
    if slot_start is not None:
        producer = db.query(Producer).filter(Producer.id == order.producer_id).one()
        row = (
            db.query(ProducerOrderSettings)
            .filter(ProducerOrderSettings.producer_id == order.producer_id)
            .one()
        )
        has_alcohol = any(line.contains_alcohol for line in order.items)
        # The business's own windows, without the notice it asks of buyers.
        slot = next(
            (
                s
                for s in offered_slots(db, producer, row, now, lead_time_hours=0)
                if s.start == slot_start
                and s.fulfilment == order.fulfilment
                and (s.alcohol_ok or not has_alcohol)
            ),
            None,
        )
        if slot is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail=PROPOSED_SLOT_DETAIL
            )
        order.proposed_slot_start = slot.start  # type: ignore[assignment]
        order.proposed_slot_end = slot.end  # type: ignore[assignment]
    _move(db, order, "change_proposed", actor, note)
    order.proposed_total_agorot = total_agorot  # type: ignore[assignment]
    order.proposal_note = note  # type: ignore[assignment]
    order.expires_at = now + PROPOSAL_ANSWER_WINDOW  # type: ignore[assignment]
    return order


def business_hand_over(
    db: Session, order_id: Any, actor: Actor, pickup_code: str | None
) -> ProductOrder:
    order = lock_order(db, order_id)
    if pickup_code is not None and pickup_code != order.pickup_code:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=WRONG_PICKUP_CODE_DETAIL
        )
    _move(db, order, "handed", actor, None)
    return order


def business_no_show(db: Session, order_id: Any, actor: Actor) -> ProductOrder:
    """Two of these close ordering to the buyer's phone for ninety days, so
    it can only be said once the slot has actually passed."""
    order = lock_order(db, order_id)
    if utc_now() < order.slot_end:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=TOO_EARLY_NO_SHOW_DETAIL
        )
    _move(db, order, "no_show", actor, None)
    return order


def business_simple_move(
    db: Session, order_id: Any, actor: Actor, to_status: str, note: str | None
) -> ProductOrder:
    """decline, ready, cancel: a move with at most a note."""
    order = lock_order(db, order_id)
    _move(db, order, to_status, actor, note)
    clear_proposal(order)
    return order
