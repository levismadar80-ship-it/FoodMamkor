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
History:  MEH-3262 (creation; stage 2a of MEH-3216); MEH-3263 (the two
          shared reads moved to services/product_order_menu.py); MEH-3216
          gaps (GET of the owner's products with their ordering fields);
          MEH-3746 (the owner's preview of her own order menu); daily stock
          (27/11: a product's and its variants' day limits, units left per
          offered day in the menu, the prep list «מה להכין»)

A file of its own because producer_me.py is on the file-size baseline and
does not grow (code-execution.md §16).
"""

from datetime import UTC
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth import require_producer
from app.database import get_db
from app.models.catalog import ProductVariant
from app.models.models import Producer, Product, User
from app.models.product_orders import (
    WEIGHED_PRICE_UNITS,
    ProducerOrderSettings,
    ProducerOrderWindow,
)
from app.rate_limit import limiter
from app.routers.product_orders import (
    NO_BUSINESS_DETAIL,
    _defaults,
    require_product_orders_enabled,
)
from app.schemas.product_order_offer import (
    MyProductsOrderingOut,
    OrderMenuOut,
    PrepListOut,
    OrderWindowsIn,
    OrderWindowsOut,
    ProductOrderingIn,
    ProductOrderingOut,
)
from app.services import product_daily_stock  # daily stock (27/11)
from app.services import product_variants  # MEH-3617
from app.services import product_order_delivery as delivery  # MEH-3970
from app.services.order_access import OrderAccess, require_order_access
from app.services.product_order_menu import offered_slots, takes_orders, windows
from app.utils.clock import israel_today, utc_now
from app.utils.money import agorot_from_shekels as _agorot

me_router = APIRouter(tags=["product-orders"])
public_router = APIRouter(tags=["product-orders"])

NOT_FOUND_DETAIL = "לא נמצא"
PRODUCT_NOT_FOUND_DETAIL = "המוצר לא נמצא"
ORDERABLE_NEEDS_PRICE_DETAIL = "כדי לאפשר הזמנה של המוצר צריך לקבוע לו מחיר"
VARIANT_NOT_FOUND_DETAIL = "האפשרות לא נמצאה במוצר הזה"


def _own_producer_id(user: User) -> Any:
    """The caller's own business; no business id is taken from the request."""
    if not user.producer_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=NO_BUSINESS_DETAIL
        )
    return user.producer_id


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
    return _week(db, _own_producer_id(user))


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
    return _week(db, producer_id)


def _week(db: Session, producer_id: Any) -> dict[str, Any]:
    producer = db.query(Producer).filter(Producer.id == producer_id).one()
    return {
        "windows": windows(db, producer_id),
        "delivery_priced": delivery.can_price_some_city(db, producer),
    }


@me_router.get(
    "/producers/me/products/ordering",
    response_model=MyProductsOrderingOut,
    dependencies=[Depends(require_product_orders_enabled)],
)
@limiter.limit("120/minute")
def get_my_products_ordering(
    request: Request,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Any:
    """The caller's own products with their ordering fields, in the order her
    business page shows them. Bounded by the products cap (limits.py)."""
    rows = (
        db.query(Product)
        .filter(Product.producer_id == _own_producer_id(user))
        .order_by(Product.position.asc().nullslast(), Product.name)
        .all()
    )
    return {
        "products": [
            {
                "id": p.id,
                "name": p.name,
                "has_price": p.price_min is not None,
                "is_orderable": p.is_orderable,
                "in_stock": p.in_stock,
                "price_unit": p.price_unit,
                "contains_alcohol": p.contains_alcohol,
                "daily_limit": p.daily_limit,
                "lead_days": p.lead_days,
                "variants": p.variants,
            }
            for p in rows
        ]
    }


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
        .filter(
            Product.id == product_id,
            Product.producer_id == _own_producer_id(user),
            Product.is_draft.is_(False),  # MEH-2312: the owner never sees drafts
        )
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
    # MEH-2936: exclude_unset — an omitted price_unit keeps the stored one.
    fields = body.model_dump(exclude_unset=True)
    _set_variant_limits(product, body)
    fields.pop("variant_limits", None)
    for field, value in fields.items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return product


def _set_variant_limits(product: Product, body: ProductOrderingIn) -> None:
    """Daily stock: each listed variant's own limit. A variant of another
    product is a 404, so nothing is written for any of them."""
    if body.variant_limits is None:
        return
    own: dict[Any, ProductVariant] = {v.id: v for v in product.variants}
    if any(item.id not in own for item in body.variant_limits):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=VARIANT_NOT_FOUND_DETAIL
        )
    for item in body.variant_limits:
        own[item.id].daily_limit = item.daily_limit  # type: ignore[assignment]


def _menu_product(product: Product) -> dict[str, Any]:
    low = _agorot(product.price_min)  # type: ignore[arg-type]
    high = _agorot(product.price_max) if product.price_max is not None else low  # type: ignore[arg-type]
    weighed = product.price_unit in WEIGHED_PRICE_UNITS
    return {
        "id": product.id,
        "name": product.name,
        "image_url": product.image_url,
        "price_min_agorot": low,
        "price_max_agorot": high,
        "price_unit": product.price_unit,
        # A weighed product is an estimate even at one price a kilo: the
        # weight is only known when the order is packed.
        "price_is_estimate": high != low or weighed,  # MEH-2936
        # MEH-3617: all variants out = the product is out.
        "in_stock": product_variants.has_stock(product),
        "contains_alcohol": product.contains_alcohol,
        "available_weekdays": product.available_weekdays,  # MEH-3618
        "lead_days": product.lead_days,  # MEH-3932
        "variants": product_variants.menu_variants(product, low, high, weighed),
    }


def _menu_products(
    db: Session, producer_id: Any, alcohol_licensed: bool
) -> list[Product]:
    query = db.query(Product).filter(
        Product.producer_id == producer_id,
        Product.is_draft.is_(False),  # MEH-2312: an unapproved draft is not public
        Product.is_orderable.is_(True),
        Product.price_min.isnot(None),
    )
    if not alcohol_licensed:
        query = query.filter(Product.contains_alcohol.is_(False))
    return query.order_by(Product.position.asc().nullslast(), Product.name).all()


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
    if not takes_orders(producer, row):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_DETAIL
        )
    assert producer is not None and row is not None  # takes_orders() said so
    return _menu_body(db, producer, row)


def _menu_body(
    db: Session, producer: Producer, row: ProducerOrderSettings
) -> dict[str, Any]:
    """The order menu as a buyer reads it. One shape for the public route and
    the owner's preview, so the preview cannot drift from what buyers see."""
    slots = offered_slots(db, producer, row, utc_now())
    products = _menu_products(db, producer.id, bool(row.alcohol_licensed))
    days = {product_daily_stock.israel_day(slot.start) for slot in slots}
    return {
        "producer_id": producer.id,
        "min_order_agorot": row.min_order_agorot,
        "cancel_cutoff_hours": row.cancel_cutoff_hours,
        "lead_time_hours": row.lead_time_hours,
        "business_id_number": row.business_id_number,
        "products": [_menu_product(product) for product in products],
        # Daily stock: units left per offered day of each limited line.
        "stock": product_daily_stock.menu_stock(db, producer.id, products, days),
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


@me_router.get(
    "/producers/me/order-menu/preview",
    response_model=OrderMenuOut,
    dependencies=[Depends(require_product_orders_enabled)],
)
@limiter.limit("60/minute")
def get_my_order_menu_preview(
    request: Request,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Any:
    """MEH-3746: the caller's own order menu, exactly as a buyer would get it,
    BEFORE ordering is switched on — the public route 404s until then, so the
    owner could not see what her settings do. No `takes_orders()` gate here:
    only her own business is read (no id is taken from the request), and a
    business that never saved settings gets the defaults, unsaved. Read only:
    the preview cannot place an order (MEH-3691 refuses an owner's order)."""
    producer_id = _own_producer_id(user)
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if producer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=NO_BUSINESS_DETAIL
        )
    row = (
        db.query(ProducerOrderSettings)
        .filter(ProducerOrderSettings.producer_id == producer_id)
        .first()
    )
    if row is None:
        # Transient, never added to the session: nothing is written.
        row = ProducerOrderSettings(**_defaults(producer_id))
    body = _menu_body(db, producer, row)
    # The buyer's shape requires a business number; before she typed one the
    # preview shows the seller line without it, which is what is missing.
    body["business_id_number"] = body["business_id_number"] or ""
    return body


@me_router.get(
    "/producers/me/orders/prep",
    response_model=PrepListOut,
    dependencies=[Depends(require_product_orders_enabled)],
)
@limiter.limit("120/minute")
def get_my_prep_list(
    request: Request,
    access: OrderAccess = Depends(require_order_access),
    db: Session = Depends(get_db),
) -> Any:
    """Daily stock: «מה להכין» — per Israel day from today for a week, how
    many of each product and variant are ordered (confirmed / still waiting),
    with the limit. Counts only, no customer: staff read it too."""
    return {
        "days": product_daily_stock.prep_list(db, access.producer_id, israel_today())
    }
