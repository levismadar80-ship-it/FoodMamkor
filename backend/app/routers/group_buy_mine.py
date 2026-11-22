"""
Module:   group_buy_mine
Purpose:  «הקבוצות שלי» (MEH-3609): the signed-in person's own group buys, so
          she can get back to one without the email link.
Touches:  group_buys, group_buy_commits (read only)
Does NOT: show a group buy whose business is no longer public — its page
          answers 404 to her (group_buys._public_group_buys), so the row would
          be a dead link. Join, leave and quantity live in group_buys.py and
          group_buy_capacity.py.
Related:  app/routers/product_order_buyer.py:241 (the «ההזמנות שלי» shape)
History:  MEH-3609 (creation)
"""

from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models.models import GroupBuy, GroupBuyCommit, User
from app.rate_limit import limiter
from app.routers.group_buys import _public_group_buys
from app.schemas.group_buy_mine import MyGroupBuysOut
from app.services.group_buy_pickup_text import is_delivery_only
from app.utils.clock import utc_now

router = APIRouter(tags=["group-buys"])

# Same cap as «ההזמנות שלי» (product_order_buyer.MAX_OWN_ORDERS).
MAX_OWN_GROUP_BUYS = 50


@router.get("/users/me/group-buys", response_model=MyGroupBuysOut)
@limiter.limit("60/minute")
def list_own_group_buys(
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """The caller's group buys: running ones by nearest deadline, then the
    rest, newest deadline first."""
    rows = (
        _public_group_buys(db)
        .join(GroupBuyCommit, GroupBuyCommit.group_buy_id == GroupBuy.id)
        .filter(GroupBuyCommit.user_id == user.id)
        .options(joinedload(GroupBuy.producer))
        .add_columns(GroupBuyCommit.quantity, GroupBuyCommit.created_at)
        # id breaks a tie, so two equal deadlines never swap between loads.
        .order_by(GroupBuy.deadline.desc(), GroupBuy.id)
        .limit(MAX_OWN_GROUP_BUYS)
        .all()
    )
    now = utc_now()

    def running(gb: GroupBuy) -> bool:
        # An "open" group past its deadline waits for the daily expiry job;
        # it is not running any more, so it does not lead the list.
        return bool(
            gb.status == "funded" or (gb.status == "open" and gb.deadline > now)
        )

    active = [r for r in rows if running(r[0])]
    active.sort(key=lambda r: (r[0].deadline, str(r[0].id)))
    rest = [r for r in rows if not running(r[0])]
    # A personal list: never cached by a shared cache.
    response.headers["Cache-Control"] = "private, no-store"
    return {
        "group_buys": [
            {
                "id": gb.id,
                "title": gb.title,
                "producer_name": gb.producer.name if gb.producer else None,
                "status": gb.status,
                "quantity": quantity or 1,
                "unit": gb.unit,
                "deadline": gb.deadline,
                # MEH-3597's rule: a delivery-only group shows no pickup time
                # (the card and the page hide it), so neither does this list.
                **_pickup(gb),
                "joined_at": joined_at,
            }
            for gb, quantity, joined_at in active + rest
        ]
    }


def _pickup(gb: GroupBuy) -> dict[str, Any]:
    if is_delivery_only(gb.pickup_note, gb.delivery_note, gb.fulfillment_note):  # type: ignore[arg-type]
        return {"pickup_starts_at": None, "pickup_ends_at": None}
    return {
        "pickup_starts_at": gb.pickup_starts_at,
        "pickup_ends_at": gb.pickup_ends_at,
    }
