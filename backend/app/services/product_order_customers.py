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

from datetime import UTC, datetime
from typing import TypedDict
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import aggregate_order_by
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
    """The business's customers, the most recent buyer first.

    One GROUP BY in the database, so a long-lived business never ships every
    order it ever took into Python; the cap is a LIMIT on customers.
    """
    last = func.max(ProductOrder.created_at)
    latest_name = func.array_agg(
        aggregate_order_by(ProductOrder.customer_name, ProductOrder.created_at.desc())
    )[1]
    rows = (
        db.query(
            ProductOrder.customer_phone,
            latest_name,
            func.count(ProductOrder.id),
            last,
        )
        .filter(
            ProductOrder.producer_id == producer_id,
            ProductOrder.status.notin_(CUSTOMER_EXCLUDED_STATUSES),
            # A buyer who deleted her account left orders with no phone
            # (services/product_order_privacy.py); she is no one's customer.
            ProductOrder.customer_phone != "",
        )
        .group_by(ProductOrder.customer_phone)
        .order_by(last.desc())
        .limit(MAX_CUSTOMERS)
        .all()
    )
    # created_at is stored as naive UTC; sent with its zone, so the browser
    # does not read it as local time and show the day before (review, MEH-3561).
    return [
        {
            "name": str(name),
            "phone": str(phone),
            "order_count": int(count),
            "last_order_at": when.replace(tzinfo=UTC),
        }
        for phone, name, count, when in rows
    ]
