"""
Module:   capabilities
Purpose:  The one place that answers "what may this business do?" — so no
          route reads `producer.plan` or a billing column on its own. While
          `pricing.BILLING_PHASE` is "launch" every paid tool is open to every
          business (ADR-042).
          Once billing is on, a business whose state is `page_only` or
          `unpaid` cannot open NEW paid bookings; what exists carries on.
Touches:  reads `business_billing` (one row) when billing is on; writes nothing.
Does NOT: charge, decide prices (app/pricing.py), or move a business from one
          state to another (the billing stage, MEH-3180). Does NOT close the
          page, WhatsApp sign-up or free sign-up — those are never paid tools.
Related:  app/pricing.py · services/gallery_cap.py (the free-plan gallery cap
          has its own owner since MEH-3220, not here) ·
          frontend dashboard edit cards (still read `plan` until MEH-3182).
History:  MEH-3181 (creation, 2026-11-14) · MEH-3180 (billing states and the
          paid-tool gate, switched off, 2026-11-14).
"""

from __future__ import annotations

from typing import Any, Final, cast
from uuid import UUID

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app import pricing
from app.auth import require_verified_producer
from app.database import get_db
from app.models.billing import BILLING_STATES, BusinessBilling
from app.models.models import User
from app.utils.clock import israel_today

# ---------- Billing states and paid tools (MEH-3180) ----------

LAUNCH_STATE: Final = "launch"
# launch    — the default; the business has not been asked to pay.
# notice    — it reached the amount and got its written notice; still open.
# active    — it chose a track and pays.
# page_only — it chose (or let the notice run out into) the free page only.
# unpaid    — a charge was not paid after the reminder.
CLOSED_STATES: Final = frozenset({"page_only", "unpaid"})

# The tools docs/PRICING.md names as paid. A sign-up is paid only when it has
# a price AND runs through the site's form (WhatsApp / a link / free: never).
# `product_orders` (MEH-3216) is listed with no route yet: the route that turns
# ordering on for a business joins PAID_TOOL_ROUTES when that work lands.
PAID_TOOLS: Final = ("paid_signup", "group_buy", "rescue_bags", "product_orders")

# How a route of each tool asks (the guard test looks for this call).
PAID_TOOL_CALLS: Final = {
    "paid_signup": "capabilities.require_paid_signup(",
    "group_buy": 'capabilities.require_paid_tool(db, producer.id, "group_buy")',
    # A route dependency, on the decorator (rescue.py is at its size limit).
    "rescue_bags": "Depends(capabilities.bags_open)",
    "product_orders": 'capabilities.require_paid_tool(db, producer.id, "product_orders")',
}

# Every route that opens a NEW paid booking, by tool. The guard test
# (tests/test_meh3180_billing_state.py) fails when one of them stops asking,
# and when a state in BILLING_STATES has no answer here.
PAID_TOOL_ROUTES: Final = {
    "paid_signup": (
        "app.routers.events:create_event",
        "app.routers.events:update_event",
        "app.routers.experiences:submit_experience",
        "app.routers.experiences:update_experience",
    ),
    "group_buy": ("app.routers.group_buys:create_group_buy",),
    "rescue_bags": ("app.routers.rescue:create_offer",),
    "product_orders": (),
}

SITE_FORM: Final = "site_form"
PAID_TOOL_CLOSED_DETAIL: Final = (
    "הכלי הזה סגור כרגע להזמנות חדשות בתשלום. "
    "הזמנות קיימות ממשיכות כרגיל, והעמוד נשאר פעיל."
)


def billing_state(db: Session, producer_id: Any) -> str:
    """The business's billing state. No row is the launch default."""
    if producer_id is None:
        return LAUNCH_STATE
    row = (
        db.query(BusinessBilling.state)
        .filter(BusinessBilling.producer_id == producer_id)
        .first()
    )
    return str(row[0]) if row else LAUNCH_STATE


def paid_tools_open(state: str | None) -> bool:
    """May a business in this state open NEW paid bookings?"""
    current = state or LAUNCH_STATE
    if current not in BILLING_STATES:
        raise ValueError(f"unknown billing state: {current!r}")
    if not pricing.billing_is_on():
        return True
    return current not in CLOSED_STATES


def is_paid_site_signup(price: Any, method: Any) -> bool:
    return method == SITE_FORM and (price or 0) > 0


def require_paid_signup(  # noqa: PLR0913 — keyword-only pairs: now vs before
    db: Session,
    producer_id: Any,
    *,
    price: Any,
    method: Any,
    running: bool = True,
    was_price: Any = None,
    was_method: Any = None,
    was_running: bool = False,
    date: Any = None,
    was_date: Any = None,
) -> None:
    """Ask only when this write OPENS a paid site sign-up: a new item, an edit
    that turns a free / WhatsApp item into one, or one that brings a cancelled
    or past paid item back (reactivating it, moving its date forward). An item
    that is already an open paid site sign-up stays editable, and cancelling
    is never asked (what exists carries on). One open item must not serve as
    an endless supply of new paid bookings, so moving its date LATER or raising
    its price also asks (`date` / `was_date`; a create passes neither).

    `running` = active and not in the past, after the write; `was_running` =
    the same before it. A create passes neither."""
    opens = is_paid_site_signup(price, method) and running
    was_open = is_paid_site_signup(was_price, was_method) and was_running
    later = date is not None and was_date is not None and date > was_date
    dearer = (price or 0) > (was_price or 0)
    if opens and (not was_open or later or dearer):
        require_paid_tool(db, producer_id, "paid_signup")


def is_running(is_active: Any, event_date: Any) -> bool:
    """An item takes sign-ups while it is active and its date has not passed."""
    return bool(is_active) and event_date is not None and event_date >= israel_today()


def require_paid_tool(db: Session, producer_id: Any, tool: str) -> None:
    """403 with a Hebrew reason when the business may not open a new paid
    booking. Costs no query while billing is off."""
    if tool not in PAID_TOOLS:
        raise ValueError(f"unknown paid tool: {tool!r}")
    # A host with no business is never billed (the ledger skips it too).
    if not pricing.billing_is_on() or producer_id is None:
        return
    if not paid_tools_open(billing_state(db, producer_id)):
        raise HTTPException(status_code=403, detail=PAID_TOOL_CLOSED_DETAIL)


def bags_open(
    current_user: User = Depends(require_verified_producer),
    db: Session = Depends(get_db),
) -> None:
    """Route dependency for publishing a rescue bag."""
    require_paid_tool(db, cast("UUID | None", current_user.producer_id), "rescue_bags")
