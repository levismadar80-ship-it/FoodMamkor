"""
Module:   product_order_quote
Purpose:  The price of an order before it is sent: the goods at the price
          the order route will store, the delivery fee for the buyer's city,
          and the total — so the sheet shows the fee before «שליחת הבקשה».
Touches:  Reads producers, products, delivery_areas, producer_order_settings.
          Writes nothing.
Does NOT: check the phone, the slot or the age declaration — the order route
          (product_order_create.py) does, and stays the only writer.
Related:  app/services/product_order_create.py::order_lines (one pricing rule),
          app/services/product_order_delivery.py::quote (the fee)
History:  MEH-3216 stage 5c (creation)
"""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.data.cities import canonical_city
from app.models.models import Producer
from app.models.product_orders import ProducerOrderSettings
from app.schemas.product_order_buy import OrderQuoteIn, OrderQuoteOut
from app.services import product_order_delivery as delivery
from app.services.product_order_create import (
    BELOW_MINIMUM_DETAIL,
    MAX_ORDER_TOTAL_AGOROT,
    NOT_FOUND_DETAIL,
    TOO_LARGE_DETAIL,
    order_lines,
)
from app.services.product_order_menu import takes_orders


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def quote_order(db: Session, body: OrderQuoteIn) -> OrderQuoteOut:
    """The same refusals as the order route, in the same Hebrew, for the
    parts a quote can know: a product gone, the minimum, the city."""
    producer = db.query(Producer).filter(Producer.id == body.producer_id).first()
    row = (
        db.query(ProducerOrderSettings)
        .filter(ProducerOrderSettings.producer_id == body.producer_id)
        .first()
    )
    if producer is None or row is None or not takes_orders(producer, row):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_DETAIL
        )
    lines = order_lines(db, body, bool(row.alcohol_licensed))
    subtotal = sum(int(line.unit_price_agorot) * int(line.qty) for line in lines)
    if subtotal > MAX_ORDER_TOTAL_AGOROT:
        raise _conflict(TOO_LARGE_DETAIL)
    if row.min_order_agorot is not None and subtotal < int(row.min_order_agorot):
        raise _conflict(BELOW_MINIMUM_DETAIL)
    fee = 0
    if body.fulfilment == "delivery":
        city = canonical_city(body.delivery_city) or ""
        try:
            fee = delivery.quote(delivery.facts_for(db, producer, city), city, subtotal)
        except delivery.DeliveryRefused as refused:
            raise _conflict(refused.detail) from refused
    return OrderQuoteOut(
        subtotal_agorot=subtotal,
        delivery_fee_agorot=fee,
        total_agorot=subtotal + fee,
        has_estimate=any(bool(line.price_is_estimate) for line in lines),
    )
