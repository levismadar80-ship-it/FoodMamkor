"""
Module:   product_order_business
Purpose:  The business's side of on-site ordering: list the orders sent to
          it, and act on one — confirm, decline, propose a change, mark
          ready, hand over, report a no-show, cancel.
Touches:  DB through services/product_order_actions.py. No outbound message.
Does NOT: take a business id from the request: every route works on the
          caller's own business, and another business's order is a 404.
          Does NOT serve an admin acting for a business — the admin screens
          are stage 6 of MEH-3216; the state machine already lets an admin
          make every move a business can.
          Does NOT show the pickup code: the buyer says it, the business
          types it, the server compares.
Related:  app/services/product_order_actions.py (the moves),
          app/services/product_order_views.py (business_view),
          app/routers/product_orders.py (the flag gate)
History:  MEH-3263 (creation; stage 2b of MEH-3216)
"""

from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.auth import require_producer
from app.database import get_db
from app.models.models import User
from app.models.product_orders import ProductOrder
from app.rate_limit import limiter
from app.routers.product_orders import (
    NO_BUSINESS_DETAIL,
    require_product_orders_enabled,
)
from app.schemas.product_order_buy import (
    BusinessOrderOut,
    BusinessOrdersOut,
    ConfirmIn,
    HandedIn,
    NoteIn,
    ProposeChangeIn,
)
from app.services import product_order_actions as actions
from app.services.product_order_state import Actor
from app.services.product_order_views import business_view

router = APIRouter(
    prefix="/producers/me/product-orders",
    tags=["product-orders"],
    dependencies=[Depends(require_product_orders_enabled)],
)

StatusFilter = Literal[
    "pending",
    "confirmed",
    "change_proposed",
    "ready",
    "handed",
    "declined",
    "cancelled",
    "expired",
    "no_show",
]
MAX_PAGE = 50
_ACTION_LIMIT = "240/hour"


def _own_order_id(db: Session, order_id: UUID, user: User) -> Any:
    """The id, once it is known to be an order of the caller's own business."""
    if not user.producer_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=NO_BUSINESS_DETAIL
        )
    found = (
        db.query(ProductOrder.id)
        .filter(
            ProductOrder.id == order_id,
            ProductOrder.producer_id == user.producer_id,
        )
        .first()
    )
    if found is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=actions.NOT_FOUND_DETAIL
        )
    return found[0]


def _done(db: Session, response: Response, order: ProductOrder) -> dict[str, Any]:
    db.commit()
    response.headers["Cache-Control"] = "no-store"
    return business_view(order)


@router.get("", response_model=BusinessOrdersOut)
@limiter.limit("120/minute")
def list_business_orders(  # noqa: PLR0913 — FastAPI dependencies, not arguments
    request: Request,
    response: Response,
    status_filter: StatusFilter | None = Query(default=None, alias="status"),
    limit: int = Query(default=20, ge=1, le=MAX_PAGE),
    offset: int = Query(default=0, ge=0, le=100_000),
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Any:
    """The business's orders, the soonest slot first."""
    if not user.producer_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=NO_BUSINESS_DETAIL
        )
    query = db.query(ProductOrder).filter(ProductOrder.producer_id == user.producer_id)
    if status_filter is not None:
        query = query.filter(ProductOrder.status == status_filter)
    total = query.count()
    orders = (
        query.order_by(ProductOrder.slot_start.asc(), ProductOrder.created_at.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    response.headers["Cache-Control"] = "no-store"
    return {"orders": [business_view(order) for order in orders], "total": total}


def _actor(user: User) -> Actor:
    return Actor("business", user.id)  # type: ignore[arg-type]


@router.post("/{order_id}/confirm", response_model=BusinessOrderOut)
@limiter.limit(_ACTION_LIMIT)
def confirm_order(  # noqa: PLR0913
    request: Request,
    response: Response,
    order_id: UUID,
    body: ConfirmIn,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Any:
    own = _own_order_id(db, order_id, user)
    order = actions.business_confirm(db, own, _actor(user), body.final_total_agorot)
    return _done(db, response, order)


@router.post("/{order_id}/propose-change", response_model=BusinessOrderOut)
@limiter.limit(_ACTION_LIMIT)
def propose_order_change(  # noqa: PLR0913
    request: Request,
    response: Response,
    order_id: UUID,
    body: ProposeChangeIn,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Any:
    own = _own_order_id(db, order_id, user)
    order = actions.business_propose_change(
        db, own, _actor(user), body.slot_start, body.total_agorot, body.note
    )
    return _done(db, response, order)


@router.post("/{order_id}/handed", response_model=BusinessOrderOut)
@limiter.limit(_ACTION_LIMIT)
def hand_order_over(  # noqa: PLR0913
    request: Request,
    response: Response,
    order_id: UUID,
    body: HandedIn,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Any:
    own = _own_order_id(db, order_id, user)
    order = actions.business_hand_over(db, own, _actor(user), body.pickup_code)
    return _done(db, response, order)


@router.post("/{order_id}/no-show", response_model=BusinessOrderOut)
@limiter.limit(_ACTION_LIMIT)
def report_no_show(
    request: Request,
    response: Response,
    order_id: UUID,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Any:
    own = _own_order_id(db, order_id, user)
    return _done(db, response, actions.business_no_show(db, own, _actor(user)))


def _simple_move(  # noqa: PLR0913
    response: Response,
    order_id: UUID,
    body: NoteIn,
    user: User,
    db: Session,
    to_status: str,
) -> Any:
    own = _own_order_id(db, order_id, user)
    order = actions.business_simple_move(db, own, _actor(user), to_status, body.note)
    return _done(db, response, order)


# decline, ready, cancel: one shape — a move with an optional note. Written as
# three decorated routes, not a loop, so scripts/check_api_contract.py can see
# them (it reads decorators; MEH-3316 call site frontend/lib/product-orders.js).
@router.post("/{order_id}/decline", response_model=BusinessOrderOut)
@limiter.limit(_ACTION_LIMIT)
def decline_order(  # noqa: PLR0913
    request: Request,
    response: Response,
    order_id: UUID,
    body: NoteIn,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Any:
    return _simple_move(response, order_id, body, user, db, "declined")


@router.post("/{order_id}/ready", response_model=BusinessOrderOut)
@limiter.limit(_ACTION_LIMIT)
def ready_order(  # noqa: PLR0913
    request: Request,
    response: Response,
    order_id: UUID,
    body: NoteIn,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Any:
    return _simple_move(response, order_id, body, user, db, "ready")


@router.post("/{order_id}/cancel", response_model=BusinessOrderOut)
@limiter.limit(_ACTION_LIMIT)
def cancel_order(  # noqa: PLR0913
    request: Request,
    response: Response,
    order_id: UUID,
    body: NoteIn,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Any:
    return _simple_move(response, order_id, body, user, db, "cancelled")
