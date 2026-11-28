"""
Module:   product_order_month
Purpose:  How many product orders a business handed over in one Israel
          calendar month, and their value, for the dashboard's «החודש הגיעו
          דרך האתר» line (MEH-3980).
Touches:  product_orders (read only).
Does NOT: write the billable-events ledger or count toward a fee or the
          results threshold. The commission on a purchase through the site is
          not set yet (docs/PRICING.md «רכישה דרך האתר | ייקבע»); that is
          billing_ledger.py's job once it is.
Related:  app/services/billing_summary.py (Month) · app/routers/billing.py
          (my_billing_summary merges this in)
History:  MEH-3980 (creation).
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.product_orders import ProductOrder
from app.services.billing_summary import Month


def _utc_naive(moment: datetime) -> datetime:
    """`handed_at` is stored as naive UTC; the month edges are Israel time."""
    return moment.astimezone(timezone.utc).replace(tzinfo=None)


def month_product_orders(db: Session, producer_id: UUID, month: Month) -> dict[str, int]:
    """Handed orders in the month and their value: the final total, or the
    estimate when the business never set one."""
    count, value = (
        db.query(
            func.count(ProductOrder.id),
            func.coalesce(
                func.sum(
                    func.coalesce(
                        ProductOrder.final_total_agorot,
                        ProductOrder.estimated_total_agorot,
                    )
                ),
                0,
            ),
        )
        .filter(
            ProductOrder.producer_id == producer_id,
            ProductOrder.status == "handed",
            ProductOrder.handed_at >= _utc_naive(month.start()),
            ProductOrder.handed_at < _utc_naive(month.next().start()),
        )
        .one()
    )
    return {"product_orders": int(count), "product_orders_value_agorot": int(value)}
