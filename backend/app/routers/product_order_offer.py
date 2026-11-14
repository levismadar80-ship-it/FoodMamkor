"""
Module:   product_order_offer
Purpose:  What a business offers for on-site ordering: the owner sets her
          weekly windows and each product's ordering fields, and anyone can
          read the resulting order menu of a business that takes orders.
Touches:  DB tables producer_order_windows (whole-list replace) and products
          (four ordering columns). Reads producer_order_settings. No outbound
          message.
Does NOT: create or change an order (stage 2b of MEH-3216). Does NOT accept a
          price: products.price_min / price_max stay owned by the product
          routes in producer_me.py. Does NOT show a product that contains
          alcohol unless an admin marked the business as licensed.
Related:  app/routers/product_orders.py (the flag gate and the settings
          routes), app/services/product_order_slots.py (the slots),
          app/schemas/product_order_offer.py (the shapes)
History:  MEH-3262 (creation; stage 2a of MEH-3216)

A file of its own because producer_me.py is on the file-size baseline and
does not grow (code-execution.md §16).
"""

from datetime import UTC, date
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth import require_producer
from app.database import get_db
from app.models.models import Producer, Product, User
from app.models.product_orders import ProducerOrderSettings, ProducerOrderWindow
from app.rate_limit import limiter
from app.routers.product_orders import (
    NO_BUSINESS_DETAIL,
    require_product_orders_enabled,
)
from app.schemas.product_order_offer import (
    OrderMenuOut,
    OrderWindowsIn,
    OrderWindowsOut,
    ProductOrderingIn,
    ProductOrderingOut,
)
from app.services import indexnow
from app.services.product_order_slots import ClosedDays, SlotRules, compute_slots
from app.utils.clock import utc_now

me_router = APIRouter(tags=["product-orders"])
public_router = APIRouter(tags=["product-orders"])

NOT_FOUND_DETAIL = "לא נמצא"
PRODUCT_NOT_FOUND_DETAIL = "המוצר לא נמצא"
ORDERABLE_NEEDS_PRICE_DETAIL = "כדי לאפשר הזמנה של המוצר צריך לקבוע לו מחיר"

_AGOROT_PER_SHEKEL = 100


def _own_producer_id(user: User) -> Any:
    """The caller's own business; no business id is taken from the request."""
    if not user.producer_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=NO_BUSINESS_DETAIL
        )
    return user.producer_id


def _windows(db: Session, producer_id: Any) -> list[ProducerOrderWindow]:
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


@me_router.get(
    "/producers/me/order-windows",
    response_model=OrderWindowsOut,
    dependencies=[Depends(require_product_orders_enabled)],
)
@limiter.limit("120/minute")
def get_my_order_windows(
    request: Request,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Any:
    return {"windows": _windows(db, _own_producer_id(user))}


@me_router.put(
    "/producers/me/order-windows",
    response_model=OrderWindowsOut,
    dependencies=[Depends(require_product_orders_enabled)],
)
@limiter.limit("30/hour")
def put_my_order_windows(
    request: Request,
    body: OrderWindowsIn,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Any:
    """Replace the business's whole week. The list is capped by the schema,
    so the table cannot grow past 28 rows a business (MEH-3022)."""
    producer_id = _own_producer_id(user)
    # Two saves at once would each delete and then insert, leaving both weeks
    # (up to 56 rows, past the cap). The row lock makes the second one wait.
    db.query(Producer.id).filter(Producer.id == producer_id).with_for_update().one()
    db.query(ProducerOrderWindow).filter(
        ProducerOrderWindow.producer_id == producer_id
    ).delete(synchronize_session=False)
    for window in body.windows:
        db.add(ProducerOrderWindow(producer_id=producer_id, **window.model_dump()))
    db.commit()
    return {"windows": _windows(db, producer_id)}


@me_router.put(
    "/producers/me/products/{product_id}/ordering",
    response_model=ProductOrderingOut,
    dependencies=[Depends(require_product_orders_enabled)],
)
@limiter.limit("120/hour")
def put_product_ordering(
    request: Request,
    product_id: UUID,
    body: ProductOrderingIn,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Any:
    """Set one product's ordering fields. The lookup is scoped to the caller's
    own business, so another business's product is a 404, not a 403."""
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.producer_id == _own_producer_id(user))
        .first()
    )
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=PRODUCT_NOT_FOUND_DETAIL
        )
    if body.is_orderable and product.price_min is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=ORDERABLE_NEEDS_PRICE_DETAIL,
        )
    for field, value in body.model_dump().items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return product


def _closed_days(producer: Producer) -> ClosedDays:
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


def _agorot(shekels: Decimal) -> int:
    return int((shekels * _AGOROT_PER_SHEKEL).to_integral_value())


def _menu_product(product: Product) -> dict[str, Any]:
    low = _agorot(product.price_min)  # type: ignore[arg-type]
    high = _agorot(product.price_max) if product.price_max is not None else low  # type: ignore[arg-type]
    return {
        "id": product.id,
        "name": product.name,
        "image_url": product.image_url,
        "price_min_agorot": low,
        "price_max_agorot": high,
        "price_unit": product.price_unit,
        # A weighed product is an estimate even at one price a kilo: the
        # weight is only known when the order is packed.
        "price_is_estimate": high != low or product.price_unit != "unit",
        "in_stock": product.in_stock,
        "contains_alcohol": product.contains_alcohol,
    }


def _menu_products(
    db: Session, producer_id: Any, alcohol_licensed: bool
) -> list[dict[str, Any]]:
    query = db.query(Product).filter(
        Product.producer_id == producer_id,
        Product.is_orderable.is_(True),
        Product.price_min.isnot(None),
    )
    if not alcohol_licensed:
        query = query.filter(Product.contains_alcohol.is_(False))
    rows = query.order_by(Product.position.asc().nullslast(), Product.name).all()
    return [_menu_product(product) for product in rows]


@public_router.get(
    "/producers/{producer_id}/order-menu",
    response_model=OrderMenuOut,
    dependencies=[Depends(require_product_orders_enabled)],
)
@limiter.limit("60/minute")
def get_order_menu(
    request: Request,
    producer_id: UUID,
    db: Session = Depends(get_db),
) -> Any:
    """What can be ordered from this business, and when.

    One 404 for every "no": unknown business, a business not shown on the
    site, a seeded test row, ordering never switched on, or switched off.
    """
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    row = (
        db.query(ProducerOrderSettings)
        .filter(ProducerOrderSettings.producer_id == producer_id)
        .first()
    )
    if (
        producer is None
        or producer.is_test
        or not indexnow.is_public_business(producer)
        or row is None
        or not row.enabled
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_DETAIL
        )
    rules = SlotRules(
        slot_minutes=int(row.slot_minutes),
        lead_time_hours=int(row.lead_time_hours),
        shabbat_observant=bool(row.shabbat_observant),
    )
    slots = compute_slots(
        list(_windows(db, producer_id)),  # type: ignore[arg-type]
        rules,
        utc_now(),
        _closed_days(producer),
    )
    return {
        "producer_id": producer_id,
        "min_order_agorot": row.min_order_agorot,
        "cancel_cutoff_hours": row.cancel_cutoff_hours,
        "lead_time_hours": row.lead_time_hours,
        "products": _menu_products(db, producer_id, bool(row.alcohol_licensed)),
        "slots": [
            {
                "start": slot.start.replace(tzinfo=UTC),
                "end": slot.end.replace(tzinfo=UTC),
                "fulfilment": slot.fulfilment,
                "alcohol_ok": slot.alcohol_ok,
            }
            for slot in slots
        ],
    }
