"""
Module:   product_order_repeat
Purpose:  A buyer's weekly repeat of an order (MEH-3933): start one from her
          order, stop one (her, the business, or three skipped weeks in a
          row), and make next week's order once this week's slot has begun:
          seven days ahead, so the longest product lead (MEH-3932) still fits,
          and never two orders ahead of the buyer.
Touches:  DB tables product_order_repeats, product_orders (through
          create_order, which commits), email_outbox (a skipped week, a
          stop). A week's order has a fixed idempotency key, and the repeat row
          is locked before it moves on, so two runs at once make one order and
          count one skip.
Does NOT: price, check or write an order itself — every week goes through
          services/product_order_create.create_order like any order, so a
          week the business cannot take is refused there and skipped here.
          Does NOT schedule itself: product_order_repeat_job.register does.
Related:  app/models/product_order_repeats.py, app/routers/product_order_buyer.py
          (the buyer's stop), app/routers/product_order_business.py (the
          business's stop), app/services/product_order_outbox.py (_day, _hhmm)
History:  MEH-3933 (creation, 27/11/2026)
"""

import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.limits import enforce_cap
from app.models.models import Producer, User
from app.models.product_order_repeats import ProductOrderRepeat
from app.models.product_orders import ProductOrder
from app.schemas.product_order_buy import OrderCreateIn
from app.services.email_outbox import enqueue_email
from app.utils.clock import ISRAEL_TZ, utc_now

log = logging.getLogger(__name__)

SKIP_LIMIT = 3
MAX_REPEATS_PER_PHONE = 3
# A clock week of the 1st of the namespace: the key of one week's order.
_KEY_NS = uuid.UUID("0b2f7a4e-3933-4c1e-9a55-7e2a1c0d3933")

TOO_MANY_FOR_PHONE_DETAIL = (
    f"אפשר להחזיק עד {MAX_REPEATS_PER_PHONE} הזמנות קבועות אצל אותו בית עסק. "
    "אפשר לשלוח את ההזמנה בלי לחזור עליה כל שבוע."
)
NOT_REPEATING_DETAIL = "ההזמנה הזאת לא חוזרת כל שבוע"
_NOT_TAKING_REASON = "בית העסק לא מקבל כרגע הזמנות באתר"


def _local(at: datetime) -> datetime:
    return at.replace(tzinfo=UTC).astimezone(ISRAEL_TZ)


def next_slot_start(last: datetime) -> datetime:
    """The same Israel weekday and wall-clock time, a week after `last`
    (naive UTC in, naive UTC out). Across a DST change the UTC hour moves and
    the Israel hour does not."""
    local = _local(last)
    week_later = (local.replace(tzinfo=None) + timedelta(days=7)).replace(
        tzinfo=ISRAEL_TZ
    )
    return week_later.astimezone(UTC).replace(tzinfo=None)


def week_key(repeat_id: Any, start: datetime) -> uuid.UUID:
    """One week's idempotency key: a second run for the same week finds the
    order the first one made."""
    return uuid.uuid5(_KEY_NS, f"{repeat_id}:{start.isoformat()}")


def is_due(last_slot_start: datetime, now: datetime) -> bool:
    """Next week is made once this week's slot has begun (naive UTC)."""
    return last_slot_start <= now


# ---- start / stop -------------------------------------------------------------


def start_repeat(db: Session, order: ProductOrder, body: OrderCreateIn) -> None:
    """Start the weekly repeat of `order`, in its transaction (no commit)."""
    active = db.query(func.count(ProductOrderRepeat.id)).filter(
        ProductOrderRepeat.producer_id == order.producer_id,
        ProductOrderRepeat.state == "active",
    )
    enforce_cap(int(active.scalar() or 0), "order_repeats")
    same_phone = active.filter(
        ProductOrderRepeat.customer_phone == order.customer_phone
    ).scalar()
    if int(same_phone or 0) >= MAX_REPEATS_PER_PHONE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=TOO_MANY_FOR_PHONE_DETAIL
        )
    repeat = ProductOrderRepeat(
        producer_id=order.producer_id,
        user_id=order.user_id,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        fulfilment=order.fulfilment,
        delivery_city=body.delivery_city,
        delivery_address=body.delivery_address,
        note=order.note,
        items=[
            {
                "product_id": str(line.product_id),
                "variant_id": str(line.variant_id) if line.variant_id else None,
                "qty": int(line.qty),
            }
            for line in body.items
        ],
        last_slot_start=order.slot_start,
    )
    db.add(repeat)
    db.flush()
    order.repeat_id = repeat.id


def stop_repeat(db: Session, order: ProductOrder, by: str) -> ProductOrderRepeat:
    """Stop the repeat `order` belongs to (no commit). Stopping a stopped one
    is a no-op. The order itself is not touched."""
    repeat = order.repeat
    if repeat is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=NOT_REPEATING_DETAIL
        )
    if repeat.state == "active":
        _stop(db, repeat, by, utc_now())
    return repeat  # type: ignore[no-any-return]


def _stop(db: Session, repeat: ProductOrderRepeat, by: str, now: datetime) -> None:
    repeat.state = "stopped"  # type: ignore[assignment]
    repeat.stopped_by = by  # type: ignore[assignment]
    repeat.stopped_at = now  # type: ignore[assignment]
    _mail_stopped(db, repeat, by)


# ---- emails -----------------------------------------------------------------------


def _owner_email(db: Session, producer_id: Any) -> str | None:
    owner = db.query(User).filter(User.producer_id == producer_id).first()
    return str(owner.email) if owner is not None and owner.email else None


def _buyer_email(db: Session, repeat: ProductOrderRepeat) -> str | None:
    if repeat.user_id is None:
        return None
    buyer = db.get(User, repeat.user_id)
    return str(buyer.email) if buyer is not None and buyer.email else None


def _is_test(db: Session, producer: Producer | None) -> bool:
    return bool(producer is not None and producer.is_test)


def _when(start: datetime) -> str:
    from app.services.product_order_outbox import _day, _hhmm

    return f"{_day(start)} בשעה {_hhmm(start)}"


def _page_link(producer: Producer | None) -> str:
    if producer is None:
        return f"{settings.frontend_url}/he"
    return f"{settings.frontend_url}/he/{producer.slug or producer.id}"


def _mail_skipped(
    db: Session, repeat: ProductOrderRepeat, start: datetime, reason: str
) -> None:
    from app.services.product_order_outbox import business_link

    producer = db.get(Producer, repeat.producer_id)
    name = producer.name if producer is not None else ""
    when = _when(start)
    left = SKIP_LIMIT - int(repeat.skipped_in_row)
    warning = (
        f"אם עוד {left} שבועות ברצף לא יצליחו, ההזמנה הקבועה תיעצר."
        if left > 1
        else "אם גם בשבוע הבא היא לא תצליח, ההזמנה הקבועה תיעצר."
    )
    test = _is_test(db, producer)
    enqueue_email(
        db,
        "order_repeat_skipped_business",
        _owner_email(db, repeat.producer_id),
        f"הזמנה קבועה לא נוצרה השבוע: {repeat.customer_name}",
        f"ההזמנה הקבועה של {repeat.customer_name} ל{when} לא נוצרה.\n"
        f"הסיבה: {reason}\n\n{warning}\n\nההזמנות: {business_link()}",
        test_cause=test,
    )
    enqueue_email(
        db,
        "order_repeat_skipped_buyer",
        _buyer_email(db, repeat),
        f"ההזמנה הקבועה מ{name} לא נוצרה השבוע",
        f"לא הצלחנו ליצור את ההזמנה הקבועה ל{when}.\nהסיבה: {reason}\n\n"
        f"אפשר להזמין בעמוד של בית העסק: {_page_link(producer)}\n\n{warning}",
        test_cause=test,
    )


def _mail_stopped(db: Session, repeat: ProductOrderRepeat, by: str) -> None:
    producer = db.get(Producer, repeat.producer_id)
    name = producer.name if producer is not None else ""
    test = _is_test(db, producer)
    if by == "system":
        why = f"{SKIP_LIMIT} שבועות ברצף לא הצליחו"
        subject = "הזמנה קבועה נעצרה"
        enqueue_email(
            db,
            "order_repeat_stopped_business",
            _owner_email(db, repeat.producer_id),
            f"{subject}: {repeat.customer_name}",
            f"ההזמנה הקבועה של {repeat.customer_name} נעצרה, כי {why}. "
            "מעכשיו לא תיווצר ממנה הזמנה חדשה כל שבוע.",
            test_cause=test,
        )
        enqueue_email(
            db,
            "order_repeat_stopped_buyer",
            _buyer_email(db, repeat),
            f"ההזמנה הקבועה מ{name} נעצרה",
            f"ההזמנה הקבועה מ{name} נעצרה, כי {why}. "
            f"אפשר להזמין שוב בעמוד של בית העסק: {_page_link(producer)}",
            test_cause=test,
        )
    elif by == "customer":
        enqueue_email(
            db,
            "order_repeat_stopped_business",
            _owner_email(db, repeat.producer_id),
            f"הזמנה קבועה בוטלה: {repeat.customer_name}",
            f"{repeat.customer_name} ביטלו את ההזמנה הקבועה. "
            "מעכשיו לא תיווצר ממנה הזמנה חדשה כל שבוע. "
            "הזמנות שכבר נוצרו ממנה לא השתנו.",
            test_cause=test,
        )
    else:
        enqueue_email(
            db,
            "order_repeat_stopped_buyer",
            _buyer_email(db, repeat),
            f"ההזמנה הקבועה מ{name} נעצרה",
            f"בית העסק {name} עצר את ההזמנה הקבועה. "
            "הזמנות שכבר נוצרו ממנה לא השתנו. "
            f"אפשר להזמין שוב בעמוד של בית העסק: {_page_link(producer)}",
            test_cause=test,
        )


# ---- the weekly run -------------------------------------------------------------


@dataclass
class RunCounters:
    made: int = 0
    skipped: int = 0
    stopped: int = 0
    waiting: int = 0
    raced: int = 0
    errors: list[str] = field(default_factory=list)


def _body(repeat: ProductOrderRepeat, start: datetime) -> OrderCreateIn:
    return OrderCreateIn(
        producer_id=repeat.producer_id,
        items=repeat.items,
        fulfilment=repeat.fulfilment,
        slot_start=start,
        customer_name=repeat.customer_name,
        phone=repeat.customer_phone,
        delivery_city=repeat.delivery_city,
        delivery_address=repeat.delivery_address,
        note=repeat.note,
        idempotency_key=week_key(repeat.id, start),
    )


def _reason(exc: HTTPException) -> str:
    if exc.status_code == status.HTTP_404_NOT_FOUND:
        return _NOT_TAKING_REASON
    return str(exc.detail)


def _make_week(db: Session, repeat_id: Any, start: datetime) -> str:
    """Make one week's order. Returns "made", "skipped", "stopped" or
    "waiting" (Shabbat or a festival for an observant business: the next run
    tries again, nothing is counted)."""
    from app.services.product_order_create import RESTING_DETAIL, create_order

    repeat = db.get(ProductOrderRepeat, repeat_id)
    assert repeat is not None
    key = str(week_key(repeat.id, start))
    done = db.query(ProductOrder.id).filter(ProductOrder.idempotency_key == key)
    reason = None
    if done.first() is None:
        user = db.get(User, repeat.user_id) if repeat.user_id else None
        try:
            create_order(db, _body(repeat, start), user, repeat_id=repeat.id)
        except HTTPException as exc:
            db.rollback()
            if exc.detail == RESTING_DETAIL:
                return "waiting"
            reason = _reason(exc)
    # Locked before it moves on: a second run that got here first already
    # moved it, and this one leaves it as it is.
    repeat = (
        db.query(ProductOrderRepeat)
        .filter(ProductOrderRepeat.id == repeat_id)
        .with_for_update()
        .one()
    )
    if repeat.state != "active" or repeat.last_slot_start >= start:
        db.commit()
        return "raced"
    repeat.last_slot_start = start  # type: ignore[assignment]
    if reason is None:
        repeat.skipped_in_row = 0  # type: ignore[assignment]
        db.commit()
        return "made"
    repeat.skipped_in_row = int(repeat.skipped_in_row) + 1  # type: ignore[assignment]
    if int(repeat.skipped_in_row) >= SKIP_LIMIT:
        _stop(db, repeat, "system", utc_now())
        db.commit()
        return "stopped"
    _mail_skipped(db, repeat, start, reason)
    db.commit()
    return "skipped"


def _due_ids(db: Session, now: datetime) -> list[Any]:
    rows = (
        db.query(ProductOrderRepeat.id)
        .filter(
            ProductOrderRepeat.state == "active",
            ProductOrderRepeat.last_slot_start <= now,
        )
        .order_by(ProductOrderRepeat.created_at)
        .all()
    )
    return [row[0] for row in rows]


def _run_one(db: Session, repeat_id: Any, now: datetime, counters: RunCounters) -> None:
    # A week far behind (the job was off) catches up one week per pass; a
    # past slot is refused by create_order and counts as a skipped week.
    for _ in range(SKIP_LIMIT + 1):
        repeat = db.get(ProductOrderRepeat, repeat_id)
        if repeat is None or repeat.state != "active":
            return
        if not is_due(repeat.last_slot_start, now):  # type: ignore[arg-type]
            return
        start = next_slot_start(repeat.last_slot_start)  # type: ignore[arg-type]
        outcome = _make_week(db, repeat_id, start)
        setattr(counters, outcome, getattr(counters, outcome) + 1)
        if outcome in ("waiting", "stopped", "raced"):
            return


def run_due(db: Session, now: datetime | None = None) -> RunCounters:
    """Make every week that is due. One repeat failing does not stop the
    others."""
    counters = RunCounters()
    now = now or utc_now()
    for repeat_id in _due_ids(db, now):
        try:
            _run_one(db, repeat_id, now, counters)
        except Exception as exc:  # one bad row must not stop the rest
            db.rollback()
            counters.errors.append(str(repeat_id))
            log.error("[ORDER-REPEAT] %s failed: %s", repeat_id, exc, exc_info=True)
    return counters
