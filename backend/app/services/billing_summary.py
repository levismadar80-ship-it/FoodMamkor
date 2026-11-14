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
# The history the admin screen lists reads the same months as the streak; the
# screen and docs/DATA.md say "the month and the five before it".
HISTORY_MONTHS = STREAK_LOOKBACK_MONTHS
# Sapir is told «הגיע הזמן» when this many businesses were over the threshold
# two months in a row (her standing ask, 14/11/2026). A signal, not a switch.
START_BILLING_BUSINESSES = 10
START_BILLING_MONTHS = 2
# One rescue ORDER can hold several bags, and each collected bag is a booking;
# every other row is one booking whatever its quantity.
_BOOKINGS = case((BillableEvent.kind == "rescue_bag", BillableEvent.quantity), else_=1)


# The ledger starts in 2026; the upper bound only keeps datetime() in range.
MIN_YEAR = 2020
MAX_YEAR = 2100


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
        if not (year_text.isascii() and month_text.isascii()):
            raise ValueError(text)  # int() would also take non-ASCII digits
        first = date(int(year_text), int(month_text), 1)  # validates the range
        # A far year passes date() and then overflows in next().start().
        if not MIN_YEAR <= first.year <= MAX_YEAR:
            raise ValueError(text)
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
    # The threshold is the month's PAID value, not a count: a free sign-up
    # has no amount and never moves a business over it.
    value = sum(v["value_agorot"] for v in per_kind.values())
    return {
        "month": month.label(),
        "phase": "launch",
        "bookings": total,
        "value_agorot": value,
        "by_kind": [{"kind": kind, **per_kind[kind]} for kind in BILLABLE_KINDS],
        "threshold_agorot": pl.threshold_paid_bookings_agorot,
        "over_threshold": value >= pl.threshold_paid_bookings_agorot,
        "fee_without_subscription_agorot": plain_fee,
        "fee_with_subscription_agorot": pl.subscription_monthly_agorot + reduced_fee,
        "charged_agorot": 0,
        "price_list_version": pl.version,
    }


def _bookings_by_business(
    db: Session, month: Month
) -> dict[UUID, tuple[int, int, int]]:
    """producer_id → (bookings, value_agorot, fee_agorot) for one month, real
    businesses only. The fee is the plain commission stored on each row."""
    rows = (
        db.query(
            BillableEvent.producer_id,
            func.coalesce(func.sum(_BOOKINGS), 0),
            func.coalesce(func.sum(BillableEvent.base_amount_agorot), 0),
            func.coalesce(func.sum(BillableEvent.fee_agorot), 0),
        )
        .join(Producer, Producer.id == BillableEvent.producer_id)
        # REUSES: services/producer_listing.py:95 (not_test_producer) — written out
        # here because importing that module drags half the app into this
        # file's strict type check.
        .filter(Producer.is_test.is_(False), *_in_month(month))
        .group_by(BillableEvent.producer_id)
        .all()
    )
    return {
        pid: (int(bookings), int(value), int(fee)) for pid, bookings, value, fee in rows
    }


def overview(db: Session, month: Month) -> dict[str, Any]:
    """Every business with a counted booking in `month`, highest value first."""
    threshold = current_price_list().threshold_paid_bookings_agorot
    # The month and the ones before it, newest first. One read per month feeds
    # both the streak and the history (shadow billing).
    months: list[Month] = [month]
    while len(months) < HISTORY_MONTHS:
        months.append(months[-1].previous())
    by_month = {m.label(): _bookings_by_business(db, m) for m in months}
    this_month = by_month[month.label()]

    # Months in a row at or over the threshold, ending with `month`.
    streak = {pid: 0 for pid in this_month}
    still_running = set(this_month)
    for cursor in months:
        counts = by_month[cursor.label()]
        still_running = {
            pid for pid in still_running if counts.get(pid, (0, 0, 0))[1] >= threshold
        }
        if not still_running:
            break
        for pid in still_running:
            streak[pid] += 1

    # Every month is judged by TODAY's amount. One price list exists; once a
    # second version changes the amount, a past month has to be judged by the
    # list in force then (the rows carry price_list_version). MEH-3180.
    history = [
        {
            "month": m.label(),
            "businesses": len(by_month[m.label()]),
            "businesses_over_threshold": sum(
                1 for _, value, _ in by_month[m.label()].values() if value >= threshold
            ),
            "value_agorot": sum(value for _, value, _ in by_month[m.label()].values()),
            # The same rule as a row's would_pay_agorot, summed over the month.
            "would_pay_total_agorot": sum(
                fee
                for _, value, fee in by_month[m.label()].values()
                if value >= threshold
            ),
        }
        for m in months
    ]

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
            "over_threshold": value >= threshold,
            "months_over_in_a_row": streak[pid],
            # What the month WOULD cost without a subscription. A month under
            # the threshold is not billed, so it would cost nothing.
            "would_pay_agorot": fee if value >= threshold else 0,
        }
        for pid, (bookings, value, fee) in this_month.items()
    ]
    rows.sort(key=lambda r: (-r["value_agorot"], r["name"]))
    return {
        "month": month.label(),
        "threshold_agorot": threshold,
        "businesses_over_threshold": sum(1 for r in rows if r["over_threshold"]),
        "businesses_over_two_months": sum(
            1 for r in rows if r["months_over_in_a_row"] >= START_BILLING_MONTHS
        ),
        "start_billing_businesses": START_BILLING_BUSINESSES,
        "start_billing_months": START_BILLING_MONTHS,
        "would_pay_total_agorot": sum(r["would_pay_agorot"] for r in rows),
        # "launch" = nothing is charged. The same word summarize() returns.
        "phase": "launch",
        "history": history,
        "rows": rows,
    }
