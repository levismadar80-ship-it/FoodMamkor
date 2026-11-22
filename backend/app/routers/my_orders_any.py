"""
Module:   my_orders_any
Purpose:  MEH-3698 — whether «ההזמנות שלי» has anything to show the caller:
          a product order, a group buy or a surprise bag. The account menus
          read it to decide whether to show the row at all.
Touches:  product_orders, group_buys, group_buy_commits, rescue_orders
          (SELECT … EXISTS only).
Does NOT: list anything — /my-orders reads the three lists itself
          (product_order_buyer.list_own_orders, group_buy_mine,
          rescue.list_my_reservation_history). One request here instead of
          three per page load: every CI request comes from one IP, and a
          per-page-load read per list would meet the per-IP limits
          (testing.md «E2E flake prevention», MEH-2972).
Related:  frontend/lib/use-my-orders-nav-gate.js (the one caller)
History:  MEH-3698 (creation)
"""

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.models import GroupBuy, GroupBuyCommit, RescueOrder, User
from app.models.product_orders import ProductOrder
from app.rate_limit import limiter
from app.routers import product_orders as product_orders_module
from app.routers import rescue as rescue_module
from app.routers.group_buys import _public_group_buys
from app.services.product_order_views import BUYER_VIEW_AFTER_CLOSE
from app.utils.clock import utc_now

router = APIRouter(tags=["users"])


class MyOrdersAnyOut(BaseModel):
    """`any`: at least one row in one of the three lists /my-orders shows."""

    any: bool


def _has_product_order(db: Session, user: User) -> bool:
    # Read through the module so a test's patch of the flag applies here too.
    if not product_orders_module.product_orders_enabled():
        return False
    # Same window as list_own_orders: an order closed longer ago is not listed.
    shown_since = utc_now() - BUYER_VIEW_AFTER_CLOSE
    query = db.query(ProductOrder.id).filter(
        ProductOrder.user_id == user.id,
        ProductOrder.closed_at.is_(None) | (ProductOrder.closed_at >= shown_since),
    )
    return bool(db.query(query.exists()).scalar())


def _has_group_buy(db: Session, user: User) -> bool:
    # Through _public_group_buys, as group_buy_mine lists them: a group whose
    # business is no longer public is not in the list, so it does not count.
    query = (
        _public_group_buys(db)
        .join(GroupBuyCommit, GroupBuyCommit.group_buy_id == GroupBuy.id)
        .filter(GroupBuyCommit.user_id == user.id)
    )
    return bool(db.query(query.exists()).scalar())


def _has_bag(db: Session, user: User) -> bool:
    if not rescue_module.rescue_bags_enabled():
        return False
    query = db.query(RescueOrder.id).filter(RescueOrder.user_id == user.id)
    return bool(db.query(query.exists()).scalar())


@router.get("/users/me/orders/any", response_model=MyOrdersAnyOut)
@limiter.limit("60/minute")
def has_any_orders(
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MyOrdersAnyOut:
    """True when the caller has an order, a group buy or a bag to list."""
    # A personal answer: never cached by a shared cache.
    response.headers["Cache-Control"] = "private, no-store"
    found = (
        _has_product_order(db, user) or _has_group_buy(db, user) or _has_bag(db, user)
    )
    return MyOrdersAnyOut(any=found)
