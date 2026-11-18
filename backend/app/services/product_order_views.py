"""
Module:   product_order_views
Purpose:  Turn an order row into what its two readers may see: the buyer
          (opened with a token: phone masked, no street address, the pickup
          code only while it is usable) and the business (the full contact
          details it needs to hand the order over, never the pickup code).
Touches:  Reads product_orders and its lines; reads the business name.
          Writes nothing.
Does NOT: decide who may read — the routes resolve the order first.
Related:  app/schemas/product_order_buy.py (BuyerOrderOut, BusinessOrderOut)
History:  MEH-3263 (creation; stage 2b of MEH-3216)
"""

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models.models import Producer
from app.models.product_orders import PRODUCT_ORDER_CODE_STATUSES, ProductOrder
from app.services.product_order_actions import buyer_can_cancel, cutoff_hours
from app.utils.clock import utc_now

# A token never expires on its own, so the page behind it stops answering a
# while after the order closed: it holds a name and a city.
BUYER_VIEW_AFTER_CLOSE = timedelta(days=30)

_VISIBLE_PHONE_DIGITS = 2


def _aware(value: datetime | None) -> datetime | None:
    return None if value is None else value.replace(tzinfo=UTC)


def mask_phone(phone: str) -> str:
    """ "972501234567" -> "••••••••••67": enough to recognise one's own number,
    not enough to learn someone else's."""
    if len(phone) <= _VISIBLE_PHONE_DIGITS:
        return "•" * len(phone)
    hidden = len(phone) - _VISIBLE_PHONE_DIGITS
    return "•" * hidden + phone[-_VISIBLE_PHONE_DIGITS:]


def buyer_view_expired(order: ProductOrder, now: datetime) -> bool:
    return bool(
        order.closed_at is not None and order.closed_at < now - BUYER_VIEW_AFTER_CLOSE
    )


def _common(order: ProductOrder) -> dict[str, Any]:
    proposal = None
    if order.status == "change_proposed":
        proposal = {
            "slot_start": _aware(order.proposed_slot_start),  # type: ignore[arg-type]
            "slot_end": _aware(order.proposed_slot_end),  # type: ignore[arg-type]
            "total_agorot": order.proposed_total_agorot,
            "note": order.proposal_note,
        }
    return {
        "id": order.id,
        "producer_id": order.producer_id,
        "status": order.status,
        "fulfilment": order.fulfilment,
        "slot_start": _aware(order.slot_start),  # type: ignore[arg-type]
        "slot_end": _aware(order.slot_end),  # type: ignore[arg-type]
        "items": [
            {
                "name": line.name,
                "qty": line.qty,
                "unit_price_agorot": line.unit_price_agorot,
                "price_unit": line.price_unit,
                "price_is_estimate": line.price_is_estimate,
                "contains_alcohol": line.contains_alcohol,
            }
            for line in order.items
        ],
        "estimated_total_agorot": order.estimated_total_agorot,
        "final_total_agorot": order.final_total_agorot,
        "delivery_fee_agorot": order.delivery_fee_agorot,
        "delivery_city": order.delivery_city,
        "customer_name": order.customer_name,
        "note": order.note,
        "proposal": proposal,
        "created_at": _aware(order.created_at),  # type: ignore[arg-type]
        "expires_at": _aware(order.expires_at),  # type: ignore[arg-type]
    }


def buyer_view(db: Session, order: ProductOrder) -> dict[str, Any]:
    name = db.query(Producer.name).filter(Producer.id == order.producer_id).scalar()
    usable = order.status in PRODUCT_ORDER_CODE_STATUSES
    return {
        **_common(order),
        "producer_name": name or "",
        "phone_masked": mask_phone(str(order.customer_phone)),
        "pickup_code": order.pickup_code if usable else None,
        "can_cancel": buyer_can_cancel(order, cutoff_hours(db, order), utc_now()),
    }


def business_view(order: ProductOrder) -> dict[str, Any]:
    return {
        **_common(order),
        "customer_phone": order.customer_phone,
        "delivery_address": order.delivery_address,
        "age_declared": order.age_declared,
        "has_estimate": any(line.price_is_estimate for line in order.items),
    }
