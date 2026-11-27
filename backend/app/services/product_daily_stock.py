"""
Module:   product_daily_stock
Purpose:  Daily stock: how many units of a product (all its variants) or of
          one variant were already ordered for a pickup day, how many are
          left, the refusal of an order that would go past the limit, and the
          owner's prep list («מה להכין») per day.
Touches:  DB read only (product_orders, product_order_items, products,
          product_variants).
Does NOT: write a limit — the owner's ordering route does
          (routers/product_order_offer.py::put_product_ordering). Does NOT
          lock anything: create_order already holds the business row lock
          when it calls refuse_over_limit, so two orders for the last unit
          are counted one after the other.
Related:  app/services/product_order_create.py (the order), app/services/
          product_weekdays.py (the same Israel day of a slot),
          app/services/product_order_outbox.py (the «אזל» line in the
          new-order email), frontend/lib/daily-stock.js (the order sheet)
History:  Daily stock (Fischgrund bakery, 27/11/2026; creation)
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Iterable

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.catalog import Product, ProductVariant
from app.models.product_orders import (
    PRODUCT_ORDER_OPEN_STATUSES,
    ProductOrder,
    ProductOrderItem,
)
from app.utils.clock import ISRAEL_TZ

# Every order that still holds its units: waiting, confirmed, ready, or
# already handed over. Declined / cancelled / expired / no-show give them back.
COUNTED_STATUSES: tuple[str, ...] = (*PRODUCT_ORDER_OPEN_STATUSES, "handed")
# The two halves of the prep list: confirmed by the business, and waiting.
CONFIRMED_STATUSES = ("confirmed", "ready", "handed")
WAITING_STATUSES = ("pending", "change_proposed")
# The buyer sees «נשארו N» at or below this (Shopify / Amazon show a low-stock
# line only near the end).
LOW_STOCK_AT = 3
# The prep list's horizon: today and the next six days.
PREP_DAYS = 7
LIMIT_MIN = 1
LIMIT_MAX = 999


def sold_out_detail(name: str) -> str:
    """409: nothing left of «name» on the slot's day."""
    return f"«{name}» אזל ליום שנבחר. אפשר לבחור יום אחר או להסיר אותו מההזמנה"


def only_left_detail(name: str, left: int) -> str:
    """409: fewer left of «name» on the slot's day than the order asks for."""
    return (
        f"ליום שנבחר נשארו רק {left} של «{name}». צריך להקטין את הכמות או לבחור יום אחר"
    )


def israel_day(start: datetime) -> date:
    """The Israel-clock day of a slot start (naive UTC or aware)."""
    aware = start if start.tzinfo is not None else start.replace(tzinfo=UTC)
    return aware.astimezone(ISRAEL_TZ).date()


def _utc_bounds(first: date, last: date) -> tuple[datetime, datetime]:
    """Naive-UTC [start of `first`, start of the day after `last`) in Israel."""
    lo = datetime.combine(first, time.min, tzinfo=ISRAEL_TZ)
    hi = datetime.combine(last + timedelta(days=1), time.min, tzinfo=ISRAEL_TZ)
    return (
        lo.astimezone(UTC).replace(tzinfo=None),
        hi.astimezone(UTC).replace(tzinfo=None),
    )


@dataclass
class Booked:
    """Units ordered per (day, product) and per (day, variant)."""

    product: dict[tuple[date, Any], int]
    variant: dict[tuple[date, Any], int]


def booked(
    db: Session,
    producer_id: Any,
    days: Iterable[date],
    statuses: tuple[str, ...] = COUNTED_STATUSES,
) -> Booked:
    """Units already ordered from this business on each of `days`."""
    wanted = set(days)
    out = Booked(defaultdict(int), defaultdict(int))
    if not wanted:
        return out
    lo, hi = _utc_bounds(min(wanted), max(wanted))
    rows = (
        db.query(
            ProductOrder.slot_start,
            ProductOrderItem.product_id,
            ProductOrderItem.variant_id,
            ProductOrderItem.qty,
        )
        .join(ProductOrderItem, ProductOrderItem.order_id == ProductOrder.id)
        .filter(
            ProductOrder.producer_id == producer_id,
            ProductOrder.status.in_(statuses),
            ProductOrder.slot_start >= lo,
            ProductOrder.slot_start < hi,
            ProductOrderItem.product_id.isnot(None),
        )
        .all()
    )
    for start, product_id, variant_id, qty in rows:
        day = israel_day(start)
        if day not in wanted:
            continue
        out.product[(day, product_id)] += int(qty)
        if variant_id is not None:
            out.variant[(day, variant_id)] += int(qty)
    return out


def _limit_of(row: Product | ProductVariant) -> int | None:
    """The row's daily_limit as a plain int (the column is typed Column[int])."""
    value: Any = row.daily_limit
    return None if value is None else int(value)


def left_of(limit: int | None, used: int) -> int | None:
    """Units left under `limit`; None = no limit."""
    return None if limit is None else max(int(limit) - used, 0)


def _variant_label(product: Product, variant: ProductVariant) -> str:
    return f"{product.name} – {variant.name}"


def refuse_over_limit(
    db: Session, producer_id: Any, lines: list[ProductOrderItem], start: datetime
) -> None:
    """409 naming the first line (in the buyer's order) that would take its
    product or variant past the day's limit. Call under the business lock."""
    day = israel_day(start)
    ids = {line.product_id for line in lines}
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(ids)).all()}
    if not any(
        p.daily_limit is not None or any(v.daily_limit is not None for v in p.variants)
        for p in products.values()
    ):
        return
    taken = booked(db, producer_id, [day])
    asked_product: dict[Any, int] = defaultdict(int)
    asked_variant: dict[Any, int] = defaultdict(int)
    for line in lines:
        asked_product[line.product_id] += int(line.qty)
        if line.variant_id is not None:
            asked_variant[line.variant_id] += int(line.qty)
    for line in lines:
        product = products[line.product_id]
        _refuse_one(
            str(product.name),
            _limit_of(product),
            taken.product[(day, product.id)],
            asked_product[product.id],
        )
        variant = next((v for v in product.variants if v.id == line.variant_id), None)
        if variant is not None:
            _refuse_one(
                _variant_label(product, variant),
                variant.daily_limit,
                taken.variant[(day, variant.id)],
                asked_variant[variant.id],
            )


def _refuse_one(name: str, limit: int | None, used: int, asked: int) -> None:
    left = left_of(limit, used)
    if left is None or asked <= left:
        return
    detail = sold_out_detail(name) if left == 0 else only_left_detail(name, left)
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def filled_by(db: Session, order: ProductOrder) -> list[str]:
    """The products / variants this order took to exactly zero left on its
    day — the «אזל» line of the new-order email. Empty when none."""
    day = israel_day(order.slot_start)  # type: ignore[arg-type]
    taken = booked(db, order.producer_id, [day])
    names: list[str] = []
    seen: set[Any] = set()
    for line in order.items:
        product = line.product
        if product is None:
            continue
        if product.id not in seen and product.daily_limit is not None:
            seen.add(product.id)
            if left_of(product.daily_limit, taken.product[(day, product.id)]) == 0:
                names.append(str(product.name))
        variant = next((v for v in product.variants if v.id == line.variant_id), None)
        if (
            variant is not None
            and variant.id not in seen
            and variant.daily_limit is not None
        ):
            seen.add(variant.id)
            if left_of(variant.daily_limit, taken.variant[(day, variant.id)]) == 0:
                names.append(_variant_label(product, variant))
    return names


def menu_stock(
    db: Session, producer_id: Any, products: list[Product], days: Iterable[date]
) -> list[dict[str, Any]]:
    """For the order menu: units left per offered day, only for the products
    and variants that have a limit. One row per (day, product, variant)."""
    limited = [
        p
        for p in products
        if p.daily_limit is not None
        or any(v.daily_limit is not None for v in p.variants)
    ]
    day_list = sorted(set(days))
    if not limited or not day_list:
        return []
    taken = booked(db, producer_id, day_list)
    rows: list[dict[str, Any]] = []
    for day in day_list:
        for product in limited:
            if product.daily_limit is not None:
                rows.append(
                    {
                        "day": day,
                        "product_id": product.id,
                        "variant_id": None,
                        "left": left_of(
                            _limit_of(product), taken.product[(day, product.id)]
                        ),
                    }
                )
            for variant in product.variants:
                if variant.daily_limit is not None:
                    rows.append(
                        {
                            "day": day,
                            "product_id": product.id,
                            "variant_id": variant.id,
                            "left": left_of(
                                variant.daily_limit, taken.variant[(day, variant.id)]
                            ),
                        }
                    )
    return rows


def prep_list(db: Session, producer_id: Any, today: date) -> list[dict[str, Any]]:
    """The owner's «מה להכין»: per day from today, per product and variant,
    units confirmed and units still waiting for her answer, with the limit.
    Only days and lines that have an order."""
    days = [today + timedelta(days=n) for n in range(PREP_DAYS)]
    lo, hi = _utc_bounds(days[0], days[-1])
    rows = (
        db.query(
            ProductOrder.slot_start,
            ProductOrder.status,
            ProductOrderItem.product_id,
            ProductOrderItem.variant_id,
            ProductOrderItem.name,
            ProductOrderItem.variant_name,
            ProductOrderItem.qty,
        )
        .join(ProductOrderItem, ProductOrderItem.order_id == ProductOrder.id)
        .filter(
            ProductOrder.producer_id == producer_id,
            ProductOrder.status.in_(COUNTED_STATUSES),
            ProductOrder.slot_start >= lo,
            ProductOrder.slot_start < hi,
        )
        .all()
    )
    lines: dict[tuple[date, Any, Any, str, str | None], dict[str, int]] = {}
    for start, state, pid, vid, name, vname, qty in rows:
        key = (israel_day(start), pid, vid, str(name), vname)
        cell = lines.setdefault(key, {"confirmed": 0, "waiting": 0})
        cell["confirmed" if state in CONFIRMED_STATUSES else "waiting"] += int(qty)
    limits = _limits(db, {k[1] for k in lines if k[1] is not None})
    by_day: dict[date, list[dict[str, Any]]] = defaultdict(list)
    for (day, pid, vid, name, vname), cell in sorted(
        lines.items(), key=lambda kv: (kv[0][0], kv[0][3], kv[0][4] or "")
    ):
        by_day[day].append(
            {
                "product_id": pid,
                "variant_id": vid,
                "name": name,
                "variant_name": vname,
                "confirmed": cell["confirmed"],
                "waiting": cell["waiting"],
                # The variant's own limit on a variant line, else the
                # product's; product_limit always (the screen sums variants).
                "limit": limits.get(vid) if vid is not None else limits.get(pid),
                "product_limit": limits.get(pid),
            }
        )
    return [{"day": day, "lines": by_day[day]} for day in sorted(by_day)]


def _limits(db: Session, product_ids: set[Any]) -> dict[Any, int | None]:
    """daily_limit of each product and of each of its variants, by id."""
    if not product_ids:
        return {}
    out: dict[Any, int | None] = {}
    for product in db.query(Product).filter(Product.id.in_(product_ids)).all():
        out[product.id] = _limit_of(product)
        for variant in product.variants:
            out[variant.id] = variant.daily_limit
    return out
