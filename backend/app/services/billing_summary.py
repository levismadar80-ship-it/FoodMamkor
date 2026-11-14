"""
Module:   billing_summary
Purpose:  Read the billable-events ledger: what one business got through the
          site in a month, and — for the admin — which businesses passed the
          results threshold and for how many months in a row.
Touches:  billable_events, producers (read only).
Does NOT: write, charge or notify. A month is an ISRAEL calendar month.
          Voided rows are never counted.
Related:  app/services/billing_ledger.py (the writer) · app/pricing.py ·
          app/routers/billing.py
History:  MEH-3181 (creation, 2026-11-14).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.billing import BILLABLE_KINDS, BillableEvent
from app.models.models import Producer
from app.pricing import (
    current_price_list,
    subscriber_bag_fee_agorot,
    subscriber_booking_fee_agorot,
)
from app.utils.clock import ISRAEL_TZ, israel_today

# How far back the admin view looks when it counts months in a row.
STREAK_LOOKBACK_MONTHS = 6
# One rescue ORDER can hold several bags, and each collected bag is a booking;
# every other row is one booking whatever its quantity.
_BOOKINGS = case((BillableEvent.kind == "rescue_bag", BillableEvent.quantity), else_=1)


@dataclass(frozen=True)
class Month:
    year: int
    month: int

    @classmethod
    def current(cls) -> "Month":
        today = israel_today()
        return cls(today.year, today.month)

    @classmethod
    def parse(cls, text: str) -> "Month":
        """`YYYY-MM` → Month. Raises ValueError on anything else."""
        year_text, _, month_text = text.partition("-")
        if len(year_text) != 4 or len(month_text) != 2:
            raise ValueError(text)
        first = date(int(year_text), int(month_text), 1)  # validates the range
        return cls(first.year, first.month)

    def previous(self) -> "Month":
        return (
            Month(self.year - 1, 12)
            if self.month == 1
            else Month(self.year, self.month - 1)
        )

    def next(self) -> "Month":
        return (
            Month(self.year + 1, 1)
            if self.month == 12
            else Month(self.year, self.month + 1)
        )

    def start(self) -> datetime:
        """The first instant of the month on the Israel clock."""
        return datetime(self.year, self.month, 1, tzinfo=ISRAEL_TZ)

    def label(self) -> str:
        return f"{self.year:04d}-{self.month:02d}"


def _in_month(month: Month) -> tuple[Any, Any, Any]:
    return (
        BillableEvent.status == "counted",
        BillableEvent.occurred_at >= month.start(),
        BillableEvent.occurred_at < month.next().start(),
    )


def summarize(db: Session, producer_id: UUID, month: Month) -> dict[str, Any]:
    """One business, one month: bookings, their value, and what it would cost."""
    rows = (
        db.query(
            BillableEvent.kind,
            BillableEvent.quantity,
            BillableEvent.base_amount_agorot,
            BillableEvent.fee_agorot,
        )
        .filter(BillableEvent.producer_id == producer_id, *_in_month(month))
        .all()
    )
    pl = current_price_list()
    per_kind = {kind: {"bookings": 0, "value_agorot": 0} for kind in BILLABLE_KINDS}
    plain_fee = 0
    reduced_fee = 0
    for kind, quantity, base, fee in rows:
        bookings = quantity if kind == "rescue_bag" else 1
        per_kind[kind]["bookings"] += bookings
        per_kind[kind]["value_agorot"] += base
        plain_fee += fee
        reduced_fee += (
            subscriber_bag_fee_agorot(quantity, pl)
            if kind == "rescue_bag"
            else subscriber_booking_fee_agorot(base, pl)
        )
    total = sum(v["bookings"] for v in per_kind.values())
    return {
        "month": month.label(),
        "phase": "launch",
        "bookings": total,
        "value_agorot": sum(v["value_agorot"] for v in per_kind.values()),
        "by_kind": [{"kind": kind, **per_kind[kind]} for kind in BILLABLE_KINDS],
        "threshold": pl.threshold_bookings_per_month,
        "over_threshold": total >= pl.threshold_bookings_per_month,
        "fee_without_subscription_agorot": plain_fee,
        "fee_with_subscription_agorot": pl.subscription_monthly_agorot + reduced_fee,
        "charged_agorot": 0,
        "price_list_version": pl.version,
    }


def _bookings_by_business(db: Session, month: Month) -> dict[UUID, tuple[int, int]]:
    """producer_id → (bookings, value_agorot) for one month, real businesses only."""
    rows = (
        db.query(
            BillableEvent.producer_id,
            func.coalesce(func.sum(_BOOKINGS), 0),
            func.coalesce(func.sum(BillableEvent.base_amount_agorot), 0),
        )
        .join(Producer, Producer.id == BillableEvent.producer_id)
        # REUSES: services/producer_listing.py:95 (not_test_producer) — written out
        # here because importing that module drags half the app into this
        # file's strict type check.
        .filter(Producer.is_test.is_(False), *_in_month(month))
        .group_by(BillableEvent.producer_id)
        .all()
    )
    return {pid: (int(bookings), int(value)) for pid, bookings, value in rows}


def overview(db: Session, month: Month) -> dict[str, Any]:
    """Every business with a counted booking in `month`, busiest first."""
    threshold = current_price_list().threshold_bookings_per_month
    this_month = _bookings_by_business(db, month)

    # Months in a row at or over the threshold, ending with `month`.
    streak = {pid: 0 for pid in this_month}
    still_running = set(this_month)
    cursor = month
    for _ in range(STREAK_LOOKBACK_MONTHS):
        counts = this_month if cursor == month else _bookings_by_business(db, cursor)
        still_running = {
            pid for pid in still_running if counts.get(pid, (0, 0))[0] >= threshold
        }
        if not still_running:
            break
        for pid in still_running:
            streak[pid] += 1
        cursor = cursor.previous()

    names: dict[UUID, str] = {}
    if this_month:
        found = db.query(Producer.id, Producer.name).filter(
            Producer.id.in_(list(this_month))
        )
        names = {pid: name for pid, name in found}
    rows: list[dict[str, Any]] = [
        {
            "producer_id": pid,
            "name": names.get(pid, ""),
            "bookings": bookings,
            "value_agorot": value,
            "over_threshold": bookings >= threshold,
            "months_over_in_a_row": streak[pid],
        }
        for pid, (bookings, value) in this_month.items()
    ]
    rows.sort(key=lambda r: (-r["bookings"], r["name"]))
    return {
        "month": month.label(),
        "threshold": threshold,
        "businesses_over_threshold": sum(1 for r in rows if r["over_threshold"]),
        "businesses_over_two_months": sum(
            1 for r in rows if r["months_over_in_a_row"] >= 2
        ),
        "rows": rows,
    }
