"""
Module:   product_order_menu
Purpose:  The two reads that both the public order menu and the order route
          need: whether a business takes orders, and the slots it offers now.
Touches:  Reads producers, producer_order_settings, producer_order_windows.
          Writes nothing.
Does NOT: compute a slot — services/product_order_slots.py is the pure
          function; this module only feeds it the business's rows.
Related:  app/routers/product_order_offer.py (the menu),
          app/services/product_order_create.py (the order route)
History:  MEH-3263 (creation: lifted out of routers/product_order_offer.py so
          the order route offers exactly the slots the menu shows); MEH-3216
          gaps (the per-slot cap hides a full slot, manual or automatic)
"""

from datetime import date, datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import Producer
from app.models.product_orders import (
    PRODUCT_ORDER_OPEN_STATUSES,
    ProducerOrderSettings,
    ProducerOrderWindow,
    ProductOrder,
)
from app.services import indexnow
from app.services.product_order_slots import (
    ClosedDays,
    Slot,
    SlotRules,
    compute_slots,
)


def windows(db: Session, producer_id: Any) -> list[ProducerOrderWindow]:
    return (
        db.query(ProducerOrderWindow)
        .filter(ProducerOrderWindow.producer_id == producer_id)
        .order_by(
            ProducerOrderWindow.weekday,
            ProducerOrderWindow.start_time,
            ProducerOrderWindow.fulfilment,
        )
        .all()
    )


def closed_days(producer: Producer) -> ClosedDays:
    """The owner's closed dates and vacation, read from where she already
    keeps them (producers.special_hours / availability_state / vacation_until)."""
    dates = set()
    for key, entry in (producer.special_hours or {}).items():
        if isinstance(entry, dict) and not entry.get("ranges"):
            try:
                dates.add(date.fromisoformat(key))
            except ValueError:
                continue
    on_vacation = producer.availability_state == "on_vacation"
    until = producer.vacation_until if on_vacation else None
    return ClosedDays(
        dates=frozenset(dates),
        until=until,  # type: ignore[arg-type]
        open_ended=bool(on_vacation and until is None),
    )


def takes_orders(producer: Producer | None, row: ProducerOrderSettings | None) -> bool:
    """One answer for every "no": unknown business, not shown on the site, a
    seeded test row, ordering never switched on, or switched off."""
    return bool(
        producer is not None
        and not producer.is_test
        and indexnow.is_public_business(producer)
        and row is not None
        and row.enabled
    )


def offered_slots(
    db: Session,
    producer: Producer,
    row: ProducerOrderSettings,
    now_utc: datetime,
    as_business: bool = False,
) -> list[Slot]:
    """The slots the business offers at `now_utc`.

    `as_business=True` is the business proposing a new time to a buyer: she
    is bound neither by the notice she asks of buyers (lead time 0) nor by
    her own cap per slot — she may choose to take one more."""
    rules = SlotRules(
        slot_minutes=int(row.slot_minutes),
        lead_time_hours=0 if as_business else int(row.lead_time_hours),
        shabbat_observant=bool(row.shabbat_observant),
    )
    slots = compute_slots(
        list(windows(db, producer.id)),  # type: ignore[arg-type]
        rules,
        now_utc,
        closed_days(producer),
    )
    cap = row.auto_confirm_slot_cap
    if as_business or cap is None or not slots:
        return slots
    full = _full_slot_starts(db, producer.id, int(cap), slots)
    return [slot for slot in slots if slot.start not in full]


def _full_slot_starts(
    db: Session, producer_id: Any, cap: int, slots: list[Slot]
) -> set[datetime]:
    """Slot starts that already hold `cap` open orders. A request still
    waiting for her answer counts: otherwise a business that confirms by
    hand would find ten requests in a slot she capped at three.

    # MEH-3216: the column is named for auto-confirm (stage 1), but since the
    # gaps PR it is the business's one cap per slot, whether she confirms by
    # hand or automatically — «עד כמה הזמנות בכל מועד (לא חובה)». A full slot
    # is simply not offered, so the order route answers SLOT_GONE_DETAIL.

    Matched on the exact start: after she changes `slot_minutes`, orders on
    the old grid no longer line up with the new starts and are not counted
    until they pass. An order in `change_proposed` counts at its current
    start; the buyer accepting moves it to the time the business chose,
    even into a full slot — her choice, like her own proposal.
    """
    rows = (
        db.query(ProductOrder.slot_start, func.count(ProductOrder.id))
        .filter(
            ProductOrder.producer_id == producer_id,
            ProductOrder.status.in_(PRODUCT_ORDER_OPEN_STATUSES),
            ProductOrder.slot_start >= slots[0].start,
            ProductOrder.slot_start <= slots[-1].start,
        )
        .group_by(ProductOrder.slot_start)
        .all()
    )
    return {start for start, taken in rows if int(taken) >= cap}
