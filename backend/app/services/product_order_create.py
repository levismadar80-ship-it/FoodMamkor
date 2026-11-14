"""
Module:   product_order_create
Purpose:  Write one buyer's order request: check that the business takes
          orders, that the slot, the products and the delivery are still
          real, price everything from the DB, and store the order.
Touches:  DB tables product_orders, product_order_items, product_order_events
          (through product_order_state), product_order_phone_codes (the code
          is consumed in the same transaction). Locks, in this order: the
          phone (advisory), then the business row. Commits.
Does NOT: accept a price, a total or a delivery fee from the request.
          Does NOT send a message to the business — notifications are stage 3
          of MEH-3216 and hang off the event rows.
          Does NOT set a status by hand: an order is born `pending`, and the
          automatic confirmation is a move made by product_order_state.
Related:  app/routers/product_order_buyer.py (the route),
          app/services/product_order_phone.py (the phone proof),
          app/services/product_order_delivery.py (the delivery fee),
          app/services/product_order_actions.py (pickup code, views)
History:  MEH-3263 (creation; stage 2b of MEH-3216)
"""

import base64
import hashlib
import hmac
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.data.cities import canonical_city
from app.models.models import Producer, Product, User
from app.models.product_orders import (
    PRODUCT_ORDER_CODE_STATUSES,
    PRODUCT_ORDER_OPEN_STATUSES,
    ProducerOrderSettings,
    ProductOrder,
    ProductOrderItem,
)
from app.schemas.product_order_buy import OrderCreateIn
from app.services import product_order_delivery as delivery
from app.services import product_order_phone as phone_codes
from app.services.product_order_actions import assign_pickup_code
from app.services.product_order_menu import offered_slots, takes_orders
from app.services.product_order_slots import Slot
from app.services.product_order_state import (
    SYSTEM,
    Actor,
    apply_transition,
    record_created,
)
from app.utils.clock import utc_now

# Sapir's decisions of 14/11: three open orders to one phone across the site;
# two no-shows in ninety days close ordering to that phone; a request the
# business does not answer lapses after a day (the timer is stage 3).
MAX_OPEN_ORDERS_PER_PHONE = 3
NO_SHOW_LIMIT = 2
NO_SHOW_WINDOW = timedelta(days=90)
ANSWER_WINDOW = timedelta(hours=24)
# The bound that keeps one business's open orders finite (MEH-3022). Far
# above a real small business's week; closed orders do not count.
MAX_OPEN_ORDERS_PER_BUSINESS = 200
# A retry with the same idempotency key gets the same order back only this
# long — long enough for a lost answer, short enough that the key is not a
# standing credential.
REPLAY_WINDOW = timedelta(minutes=10)

_AGOROT_PER_SHEKEL = 100

NOT_FOUND_DETAIL = "לא נמצא"
PHONE_BLOCKED_DETAIL = "אי אפשר לשלוח הזמנה מהמספר הזה כרגע"
TOO_MANY_OPEN_DETAIL = (
    "יש כבר שלוש הזמנות פתוחות מהמספר הזה. אפשר להזמין שוב אחרי שאחת מהן תיסגר"
)
BUSINESS_FULL_DETAIL = "בית העסק לא מקבל כרגע הזמנות נוספות. נסו שוב מאוחר יותר"
SLOT_GONE_DETAIL = "המועד שנבחר כבר לא זמין. צריך לבחור מועד אחר"
PRODUCT_GONE_DETAIL = "אחד המוצרים כבר לא זמין להזמנה. צריך לעדכן את ההזמנה"
BELOW_MINIMUM_DETAIL = "סכום ההזמנה נמוך ממינימום ההזמנה של בית העסק"
AGE_DETAIL = "להזמנה שיש בה אלכוהול צריך להצהיר על גיל 18 ומעלה"
ALCOHOL_SLOT_DETAIL = "אי אפשר לקבל הזמנה שיש בה אלכוהול במועד הזה. צריך לבחור מועד אחר"
KEY_REUSED_DETAIL = "ההזמנה הזאת כבר נשלחה"
CODE_USED_DETAIL = phone_codes.CODE_WRONG_DETAIL


@dataclass(frozen=True)
class Created:
    order: ProductOrder
    status_token: str


def status_token_for(idempotency_key: str) -> str:
    """The buyer's token, derived from her idempotency key and the server
    secret. Derived, not random, so the retry of a request whose answer was
    lost returns the SAME token — a second random one would kill the first
    tab's link. Without the server secret the key alone yields nothing."""
    digest = hmac.new(
        settings.secret_key.encode(),
        f"product-order-status:{idempotency_key}".encode(),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def _replayed(db: Session, body: OrderCreateIn, phone: str) -> ProductOrder | None:
    """The order this idempotency key already created, when the retry is the
    same buyer's and still fresh; 409 when the key belongs to anything else."""
    existing = (
        db.query(ProductOrder)
        .filter(ProductOrder.idempotency_key == str(body.idempotency_key))
        .first()
    )
    if existing is None:
        return None
    same_request = (
        str(existing.customer_phone) == phone
        and existing.producer_id == body.producer_id
        and existing.created_at >= utc_now() - REPLAY_WINDOW
    )
    if not same_request:
        raise _conflict(KEY_REUSED_DETAIL)
    return existing


def _check_phone_standing(db: Session, phone: str, now: datetime) -> None:
    no_shows = (
        db.query(func.count(ProductOrder.id))
        .filter(
            ProductOrder.customer_phone == phone,
            ProductOrder.status == "no_show",
            ProductOrder.closed_at >= now - NO_SHOW_WINDOW,
        )
        .scalar()
    )
    if int(no_shows or 0) >= NO_SHOW_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=PHONE_BLOCKED_DETAIL
        )
    open_orders = (
        db.query(func.count(ProductOrder.id))
        .filter(
            ProductOrder.customer_phone == phone,
            ProductOrder.status.in_(PRODUCT_ORDER_OPEN_STATUSES),
        )
        .scalar()
    )
    if int(open_orders or 0) >= MAX_OPEN_ORDERS_PER_PHONE:
        raise _conflict(TOO_MANY_OPEN_DETAIL)


def _check_business_room(db: Session, producer_id: Any) -> None:
    open_orders = (
        db.query(func.count(ProductOrder.id))
        .filter(
            ProductOrder.producer_id == producer_id,
            ProductOrder.status.in_(PRODUCT_ORDER_OPEN_STATUSES),
        )
        .scalar()
    )
    if int(open_orders or 0) >= MAX_OPEN_ORDERS_PER_BUSINESS:
        raise _conflict(BUSINESS_FULL_DETAIL)


def _agorot(shekels: Decimal) -> int:
    return int((shekels * _AGOROT_PER_SHEKEL).to_integral_value())


def _lines(
    db: Session, body: OrderCreateIn, alcohol_licensed: bool
) -> list[ProductOrderItem]:
    """One order line per requested product, priced from the DB.

    A price range is stored at its HIGH end and marked an estimate: the
    buyer is told the most she might pay, and the business sets the final
    total when it confirms. A weighed product is an estimate at any price.
    """
    wanted = {line.product_id: line.qty for line in body.items}
    products = (
        db.query(Product)
        .filter(
            Product.id.in_(list(wanted)),
            Product.producer_id == body.producer_id,
            Product.is_orderable.is_(True),
            Product.in_stock.is_(True),
            Product.price_min.isnot(None),
        )
        .all()
    )
    if not alcohol_licensed:
        products = [p for p in products if not p.contains_alcohol]
    if len(products) != len(wanted):
        raise _conflict(PRODUCT_GONE_DETAIL)
    by_id: dict[Any, Product] = {p.id: p for p in products}
    lines = []
    for line in body.items:  # the buyer's own order of lines
        product = by_id[line.product_id]
        low = _agorot(product.price_min)  # type: ignore[arg-type]
        high = _agorot(product.price_max) if product.price_max is not None else low  # type: ignore[arg-type]
        lines.append(
            ProductOrderItem(
                product_id=product.id,
                name=product.name,
                unit_price_agorot=max(low, high),
                price_is_estimate=high != low or product.price_unit != "unit",
                price_unit=product.price_unit,
                qty=line.qty,
                contains_alcohol=bool(product.contains_alcohol),
            )
        )
    return lines


def _slot(slots: list[Slot], body: OrderCreateIn) -> Slot:
    for slot in slots:
        if slot.start == body.slot_start and slot.fulfilment == body.fulfilment:
            return slot
    raise _conflict(SLOT_GONE_DETAIL)


def _delivery_fee(
    db: Session, producer: Producer, body: OrderCreateIn, subtotal: int
) -> tuple[int, str | None, str | None]:
    """(fee in agorot, city as stored, address) — all empty for a pickup."""
    if body.fulfilment != "delivery":
        return 0, None, None
    city = canonical_city(body.delivery_city) or ""
    try:
        fee = delivery.quote(delivery.facts_for(db, producer, city), city, subtotal)
    except delivery.DeliveryRefused as refused:
        raise _conflict(refused.detail) from refused
    return fee, city, body.delivery_address


def _may_auto_confirm(
    db: Session, row: ProducerOrderSettings, order: ProductOrder, has_estimate: bool
) -> bool:
    """Automatic confirmation needs the business's own cap per slot, room
    under it, and a total that is already final."""
    if not row.auto_confirm or row.auto_confirm_slot_cap is None or has_estimate:
        return False
    taken = (
        db.query(func.count(ProductOrder.id))
        .filter(
            ProductOrder.producer_id == order.producer_id,
            ProductOrder.slot_start == order.slot_start,
            ProductOrder.status.in_(PRODUCT_ORDER_CODE_STATUSES),
        )
        .scalar()
    )
    return int(taken or 0) < int(row.auto_confirm_slot_cap)


def _locked_business(
    db: Session, producer_id: Any
) -> tuple[Producer, ProducerOrderSettings]:
    """The business row, locked until commit: two orders to one business are
    written one after the other (the per-slot cap, the pickup codes), and a
    delete of the business waits for the order — or the order for the delete
    (product_order_guards locks the same row). FOR NO KEY UPDATE, so reads
    and foreign-key inserts on the business are not held up."""
    producer = (
        db.query(Producer)
        .filter(Producer.id == producer_id)
        .with_for_update(key_share=True)
        .first()
    )
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
    return producer, row


def create_order(db: Session, body: OrderCreateIn, user: User | None) -> Created:
    """Write the order and return it with the buyer's status token."""
    phone = phone_codes.canonical_phone(body.phone)
    key = str(body.idempotency_key)
    token = status_token_for(key)

    phone_codes.lock_phone(db, phone)
    replay = _replayed(db, body, phone)
    if replay is not None:
        return Created(replay, token)
    # Nothing is written before this line: a wrong code commits its own try.
    code_row = phone_codes.check_code(db, phone, body.code)

    producer, row = _locked_business(db, body.producer_id)
    now = utc_now()
    _check_phone_standing(db, phone, now)
    _check_business_room(db, producer.id)

    slot = _slot(offered_slots(db, producer, row, now), body)
    lines = _lines(db, body, bool(row.alcohol_licensed))
    has_alcohol = any(line.contains_alcohol for line in lines)
    if has_alcohol and not body.age_declared:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=AGE_DETAIL
        )
    if has_alcohol and not slot.alcohol_ok:
        raise _conflict(ALCOHOL_SLOT_DETAIL)
    subtotal = sum(int(line.unit_price_agorot) * int(line.qty) for line in lines)
    if row.min_order_agorot is not None and subtotal < int(row.min_order_agorot):
        raise _conflict(BELOW_MINIMUM_DETAIL)
    fee, city, address = _delivery_fee(db, producer, body, subtotal)

    order = ProductOrder(
        producer_id=producer.id,
        user_id=user.id if user is not None else None,
        customer_name=body.customer_name,
        customer_phone=phone,
        fulfilment=body.fulfilment,
        delivery_city=city,
        delivery_address=address,
        slot_start=slot.start,
        slot_end=slot.end,
        note=body.note,
        estimated_total_agorot=subtotal,
        delivery_fee_agorot=fee,
        age_declared=bool(has_alcohol and body.age_declared),
        expires_at=now + ANSWER_WINDOW,
        status_token_hash=token_hash(token),
        idempotency_key=key,
        items=lines,
    )
    db.add(order)
    db.flush()
    record_created(db, order, Actor("customer", user.id if user else None))  # type: ignore[arg-type]
    has_estimate = any(line.price_is_estimate for line in lines)
    if _may_auto_confirm(db, row, order, has_estimate):
        apply_transition(db, order, "confirmed", SYSTEM)
        order.final_total_agorot = subtotal  # type: ignore[assignment]
        assign_pickup_code(db, order)
    if not phone_codes.consume(db, code_row):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=CODE_USED_DETAIL
        )
    try:
        db.commit()
    except IntegrityError as clash:
        # The unique index on the idempotency key: a twin request on another
        # phone number's lock. It created nothing; say so.
        db.rollback()
        raise _conflict(KEY_REUSED_DETAIL) from clash
    return Created(order, token)
