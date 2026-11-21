"""
Module:   product_order_customers
Purpose:  «הלקוחות שלכם» — who ordered from a business through the site, one
          row per customer: the name on their latest order, the phone, how many
          orders and when the last one was. The business downloads it as CSV.
Touches:  DB read only (product_orders).
Does NOT: count an order the business never took — declined, expired, or
          cancelled (CUSTOMER_EXCLUDED_STATUSES). Does NOT join users: a guest
          order has no account, so a customer is a phone number, as the
          business already sees it on each order card. Does NOT list a buyer
          who deleted her account: her orders keep no phone.
Related:  app/routers/product_order_business.py (GET …/customers);
          frontend/components/dashboard/orders/OrderCustomersCard.jsx
History:  MEH-3561 (creation)
"""

from datetime import datetime
from typing import TypedDict
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.product_orders import ProductOrder

# MEH-3561: an order she declined, that expired unanswered, or that was
# cancelled is not a purchase; it does not make anyone a customer.
CUSTOMER_EXCLUDED_STATUSES = ("declined", "expired", "cancelled")
# The list is for a small business; a cap keeps one response bounded.
MAX_CUSTOMERS = 2000


class CustomerRow(TypedDict):
    name: str
    phone: str
    order_count: int
    last_order_at: datetime


def list_customers(db: Session, producer_id: UUID) -> list[CustomerRow]:
    """The business's customers, the most recent buyer first."""
    rows = (
        db.query(
            ProductOrder.customer_phone,
            ProductOrder.customer_name,
            ProductOrder.created_at,
        )
        .filter(
            ProductOrder.producer_id == producer_id,
            ProductOrder.status.notin_(CUSTOMER_EXCLUDED_STATUSES),
            # A buyer who deleted her account left orders with no phone
            # (services/product_order_privacy.py); she is no one's customer.
            ProductOrder.customer_phone != "",
        )
        .order_by(ProductOrder.created_at.desc())
        .all()
    )
    by_phone: dict[str, CustomerRow] = {}
    for phone, name, created_at in rows:
        key = str(phone)
        row = by_phone.get(key)
        if row is None:
            # Newest first, so the first order seen carries the current name.
            by_phone[key] = {
                "name": str(name),
                "phone": key,
                "order_count": 1,
                "last_order_at": created_at,
            }
        else:
            row["order_count"] += 1
    return list(by_phone.values())[:MAX_CUSTOMERS]
