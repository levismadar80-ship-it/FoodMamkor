"""
Module:   product_order_buyer
Purpose:  The buyer's side of on-site ordering: ask for a phone code, send an
          order, read its status, cancel it, accept a change the business
          proposed, and list one's own orders when logged in.
Touches:  DB through the product_order_* services. Sends ONE outbound
          message: the WhatsApp authentication template with the phone code.
Does NOT: take the status token in a URL — it travels in the POST body, and
          every answer that shows an order carries `Cache-Control: no-store`.
          Does NOT tell a blocked phone from a free one when a code is asked
          for; the block is only stated when an order is sent with a proven
          phone.
          Does NOT notify the business of a new order (stage 3 of MEH-3216).
Related:  app/services/product_order_create.py, product_order_actions.py,
          product_order_phone.py, product_order_views.py;
          app/routers/product_orders.py (the flag gate)
History:  MEH-3263 (creation; stage 2b of MEH-3216)
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_current_user_optional
from app.database import get_db
from app.models.models import Producer, User
from app.models.product_orders import ProducerOrderSettings, ProductOrder
from app.rate_limit import limiter
from app.routers.producer_me import _otp_test_code_for, _send_whatsapp_otp
from app.routers.product_orders import require_product_orders_enabled
from app.schemas.product_order_buy import (
    BuyerOrderOut,
    BuyerOrdersOut,
    BuyerRefIn,
    OrderCreatedOut,
    OrderCreateIn,
    PhoneCodeIn,
)
from app.services import product_order_actions as actions
from app.services import product_order_phone as phone_codes
from app.services import whatsapp
from app.services.product_order_create import create_order, token_hash
from app.services.product_order_menu import takes_orders
from app.services.product_order_state import Actor
from app.services.product_order_views import buyer_view, buyer_view_expired
from app.utils.clock import utc_now

log = logging.getLogger(__name__)

router = APIRouter(tags=["product-orders"])

NOT_FOUND_DETAIL = "לא נמצא"
CODE_SENT_DETAIL = "קוד נשלח"
MAX_OWN_ORDERS = 50

_GATE = [Depends(require_product_orders_enabled)]


def _private(response: Response) -> None:
    """An order page holds a name, a city and a pickup code: no cache keeps it."""
    response.headers["Cache-Control"] = "no-store"


@router.post("/product-orders/phone-code", dependencies=_GATE)
@limiter.limit("10/hour")
def send_order_phone_code(
    request: Request,
    body: PhoneCodeIn,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Send a six-digit code to the phone a buyer wants to order with.

    Only for a business that takes orders now, so the route cannot be used to
    message phones at will. Fails closed: with WhatsApp not configured there
    is no way to prove a phone, so there is no order.
    """
    phone = phone_codes.canonical_phone(body.phone)
    producer = db.query(Producer).filter(Producer.id == body.producer_id).first()
    row = (
        db.query(ProducerOrderSettings)
        .filter(ProducerOrderSettings.producer_id == body.producer_id)
        .first()
    )
    if not takes_orders(producer, row):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_DETAIL
        )
    # REUSES: backend/app/routers/producer_me.py::send_phone_otp — the same
    # test-number path (MEH-2231) and the same template sender (MEH-754).
    test_code = _otp_test_code_for(body.phone)
    if test_code is None and not whatsapp.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=phone_codes.CODES_UNAVAILABLE_DETAIL,
        )
    code = phone_codes.issue_code(db, phone, fixed_code=test_code)
    if test_code is None:
        _send_whatsapp_otp(f"+{phone}", code)
    else:
        log.warning(
            "product orders: OTP test mode, fixed code issued, WhatsApp "
            "suppressed (producer_id=%s)",
            body.producer_id,
        )
    return {"detail": CODE_SENT_DETAIL}


@router.post(
    "/product-orders",
    response_model=OrderCreatedOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_GATE,
)
@limiter.limit("20/hour")
def send_order(
    request: Request,
    response: Response,
    body: OrderCreateIn,
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> Any:
    """Send an order request. A guest and a logged-in buyer take the same
    path: both prove the phone with a code."""
    created = create_order(db, body, user)
    _private(response)
    return {**buyer_view(db, created.order), "status_token": created.status_token}


def _own_order(db: Session, body: BuyerRefIn, user: User | None) -> ProductOrder:
    """The order this caller may act on: by her token, or — logged in — by id
    among her own. One 404 for everything else, so neither a token nor an id
    can be probed."""
    order = None
    if body.token is not None:
        order = (
            db.query(ProductOrder)
            .filter(ProductOrder.status_token_hash == token_hash(body.token))
            .first()
        )
    elif body.order_id is not None and user is not None:
        order = (
            db.query(ProductOrder)
            .filter(ProductOrder.id == body.order_id, ProductOrder.user_id == user.id)
            .first()
        )
    if order is None or buyer_view_expired(order, utc_now()):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=actions.NOT_FOUND_DETAIL
        )
    return order


def _buyer(order: ProductOrder) -> Actor:
    return Actor("customer", order.user_id)  # type: ignore[arg-type]


@router.post("/product-orders/status", response_model=BuyerOrderOut, dependencies=_GATE)
@limiter.limit("60/minute")
def read_order_status(
    request: Request,
    response: Response,
    body: BuyerRefIn,
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> Any:
    """A read, sent as POST so the token stays out of the URL."""
    order = _own_order(db, body, user)
    _private(response)
    return buyer_view(db, order)


@router.post(
    "/product-orders/status/cancel", response_model=BuyerOrderOut, dependencies=_GATE
)
@limiter.limit("30/hour")
def cancel_own_order(
    request: Request,
    response: Response,
    body: BuyerRefIn,
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> Any:
    order = _own_order(db, body, user)
    order = actions.buyer_cancel(db, order.id, _buyer(order))
    db.commit()
    _private(response)
    return buyer_view(db, order)


@router.post(
    "/product-orders/status/accept-change",
    response_model=BuyerOrderOut,
    dependencies=_GATE,
)
@limiter.limit("30/hour")
def accept_proposed_change(
    request: Request,
    response: Response,
    body: BuyerRefIn,
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> Any:
    order = _own_order(db, body, user)
    order = actions.buyer_accept_change(db, order, _buyer(order))
    db.commit()
    _private(response)
    return buyer_view(db, order)


@router.get(
    "/users/me/product-orders", response_model=BuyerOrdersOut, dependencies=_GATE
)
@limiter.limit("60/minute")
def list_own_orders(
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """The logged-in buyer's orders, newest first."""
    orders = (
        db.query(ProductOrder)
        .filter(ProductOrder.user_id == user.id)
        .order_by(ProductOrder.created_at.desc())
        .limit(MAX_OWN_ORDERS)
        .all()
    )
    _private(response)
    return {"orders": [buyer_view(db, order) for order in orders]}
