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
          the order route offers exactly the slots the menu shows)
"""

from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.models import Producer
from app.models.product_orders import ProducerOrderSettings, ProducerOrderWindow
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
    lead_time_hours: int | None = None,
) -> list[Slot]:
    """The slots the business offers at `now_utc`. `lead_time_hours` overrides
    the business's own lead time (the business proposing a new time to a
    buyer is not bound by the notice it asks of buyers)."""
    rules = SlotRules(
        slot_minutes=int(row.slot_minutes),
        lead_time_hours=(
            int(row.lead_time_hours) if lead_time_hours is None else lead_time_hours
        ),
        shabbat_observant=bool(row.shabbat_observant),
    )
    return compute_slots(
        list(windows(db, producer.id)),  # type: ignore[arg-type]
        rules,
        now_utc,
        closed_days(producer),
    )
