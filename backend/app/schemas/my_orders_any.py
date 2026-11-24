"""
Module:   my_orders_any (schemas)
Purpose:  The answer of GET /users/me/orders/any (MEH-3698): whether
          «ההזמנות שלי» has anything to show the caller.
Does NOT: carry the rows — /my-orders reads the three lists itself.
Related:  app/routers/my_orders_any.py
History:  MEH-3698 (creation; moved out of the router per ADR-006 R1)
"""

from pydantic import BaseModel


class MyOrdersAnyOut(BaseModel):
    """`any`: at least one row in one of the three lists /my-orders shows."""

    any: bool
