"""
Module:   group_buy_counts (schemas)
Purpose:  The public per-status count behind the /group-buys status tabs, so
          a tab with nothing in it is not drawn (MEH-3128).
Does NOT: carry titles, ids or anything else — a number per status only, the
          same rule as ExperienceCountOut (MEH-1918): any extra field would be
          a second, unaudited public read path.
Related:  app/routers/group_buys.py (count_group_buys_by_status)
History:  MEH-3128 (creation)
"""

from pydantic import BaseModel


class GroupBuyStatusCountsOut(BaseModel):
    """How many group buys each public status tab would list right now."""

    open: int
    funded: int
    fulfilled: int
