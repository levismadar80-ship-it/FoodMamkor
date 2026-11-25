"""
Module:   order_access
Purpose:  Who may handle a business's orders: its owner, or a staff member
          with an active `producer_staff` row on a business that still has an
          owner. Read from the database on every request, so a removed staff
          member is out on their very next call with no token to wait out.
Touches:  producer_staff, users (read only).
Does NOT: grant anything outside the order-handling routes of
          routers/product_order_business.py. Settings, order windows, the
          `/producers/me` profile and every other owner route keep
          `require_producer`. Does not invite or revoke (routers/producer_staff.py).
Related:  routers/product_order_business.py (the only caller of
          `require_order_access`), routers/producer_owner_invite.py `_business_has_owner`
          (the owner predicate reused here), models/producer_staff.py.
History:  MEH-3526 (creation).
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.models import Producer, User
from app.models.producer_staff import ProducerStaff
from app.models.product_orders import ProductOrder
from app.routers.product_orders import NO_BUSINESS_DETAIL
from app.utils.clock import utc_now

# A staff member sees the open orders and those closed in the last 7 days
# (card MEH-3526). Older history is the owner's.
STAFF_CLOSED_WINDOW = timedelta(days=7)
NO_ORDER_ACCESS = "אין לחשבון הזה גישה להזמנות של בית עסק."


@dataclass(frozen=True)
class OrderAccess:
    producer_id: UUID
    user: User
    is_owner: bool


def _business_has_owner(db: Session, producer_id: Any) -> bool:
    return db.query(User.id).filter(User.producer_id == producer_id).first() is not None


def active_staff_row(db: Session, user_id: Any) -> ProducerStaff | None:
    """The caller's active membership, if the business still has an owner.

    A business whose owner is gone has no one who can remove its staff, so
    their access ends with the owner's (card: «עסק בלי בעלים → העובד נדחה»).
    """
    row = (
        db.query(ProducerStaff)
        .filter(ProducerStaff.user_id == user_id, ProducerStaff.status == "active")
        .first()
    )
    if row is None or not _business_has_owner(db, row.producer_id):
        return None
    return row


def staff_of(db: Session, user: User) -> dict[str, Any] | None:
    """`/auth/me`'s `staff_of`: the business this account handles orders for."""
    row = active_staff_row(db, user.id)
    if row is None:
        return None
    name = db.query(Producer.name).filter(Producer.id == row.producer_id).scalar()
    return {"producer_id": row.producer_id, "name": name or ""}


def require_order_access(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrderAccess:
    """The owner (as `require_producer` + a linked business), else active staff."""
    if user.role == "producer":
        if not user.producer_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=NO_BUSINESS_DETAIL
            )
        return OrderAccess(user.producer_id, user, True)  # type: ignore[arg-type]
    row = active_staff_row(db, user.id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=NO_ORDER_ACCESS
        )
    return OrderAccess(row.producer_id, user, False)  # type: ignore[arg-type]


def visible_orders(query: Any, access: OrderAccess, now: datetime | None = None) -> Any:
    """Narrow an order query to what this caller may see.

    `closed_at` is naive UTC (product_orders, `utc_now`), so the cutoff is too.
    """
    query = query.filter(ProductOrder.producer_id == access.producer_id)
    if access.is_owner:
        return query
    cutoff = (now or utc_now()) - STAFF_CLOSED_WINDOW
    return query.filter(
        or_(ProductOrder.closed_at.is_(None), ProductOrder.closed_at >= cutoff)
    )
