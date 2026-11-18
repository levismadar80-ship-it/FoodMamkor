"""
Module:   product_order_state
Purpose:  The one place an on-site order changes status. It says which moves
          are allowed, who may make each one, and writes the log row for every
          move it makes.
Touches:  DB tables product_orders (status + the four timestamps) and
          product_order_events (one row per transition). It does not commit —
          the caller owns the transaction.
Does NOT: send any message, check who owns the order, or create an order.
          Ownership is the route's job (the house IDOR rule). Every move does
          WRITE the messages it owes, through product_order_outbox.on_status,
          in the caller's transaction (MEH-3296); the dispatcher sends them.
Related:  app/models/product_orders.py (PRODUCT_ORDER_STATUSES, the tables),
          tests/test_meh3218_product_orders.py (the full transition matrix)
History:  MEH-3218 (creation; stage 1 of MEH-3216); MEH-3263 (the system may
          cancel an open order: account deletion)
"""

from dataclasses import dataclass
from typing import Final
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.product_orders import (
    PRODUCT_ORDER_ACTORS,
    PRODUCT_ORDER_STATUSES,
    ProductOrder,
    ProductOrderEvent,
)
from app.services import product_order_outbox as outbox
from app.utils.clock import utc_now

# from_status -> to_status -> who may do it.
#
# Read it as the order's life: the buyer sends a request (pending); the
# business confirms it, proposes a change or declines; a confirmed order is
# made ready and handed over. Every other end — cancelled, expired, no_show,
# declined — is terminal, and so is handed.
#
# `admin` may make any move a `business` may: the admin override of the house
# ownership rule, applied to the state machine too. `system` is the scheduler
# (auto-confirm, the 24-hour expiry) — it never acts for a person. MEH-3263:
# it may also cancel any open order, for one reason: the buyer deleted her
# account (services/product_order_privacy.py), which must not wait for a
# business to release a packed order.
_BUSINESS: Final = frozenset({"business", "admin"})
_CUSTOMER: Final = frozenset({"customer"})
_SYSTEM: Final = frozenset({"system"})

TRANSITIONS: Final[dict[str, dict[str, frozenset[str]]]] = {
    "pending": {
        "confirmed": _BUSINESS | _SYSTEM,
        "change_proposed": _BUSINESS,
        "declined": _BUSINESS,
        "cancelled": _CUSTOMER | _SYSTEM,
        "expired": _SYSTEM,
    },
    "change_proposed": {
        "confirmed": _CUSTOMER,
        "cancelled": _CUSTOMER | _BUSINESS | _SYSTEM,
        "expired": _SYSTEM,
    },
    "confirmed": {
        "ready": _BUSINESS,
        "handed": _BUSINESS,
        "cancelled": _CUSTOMER | _BUSINESS | _SYSTEM,
        "no_show": _BUSINESS,
    },
    "ready": {
        "handed": _BUSINESS,
        "cancelled": _BUSINESS | _SYSTEM,
        "no_show": _BUSINESS,
    },
    "handed": {},
    "declined": {},
    "cancelled": {},
    "expired": {},
    "no_show": {},
}

TERMINAL_STATUSES: Final = frozenset(
    status for status, moves in TRANSITIONS.items() if not moves
)

INVALID_TRANSITION_DETAIL: Final = "אי אפשר לבצע את הפעולה הזאת במצב הנוכחי של ההזמנה"
ACTOR_NOT_ALLOWED_DETAIL: Final = "אין הרשאה לבצע את הפעולה הזאת בהזמנה"


@dataclass(frozen=True)
class Actor:
    """Who is making the move: one of PRODUCT_ORDER_ACTORS, and the account
    behind it when there is one (a guest buyer and the scheduler have none)."""

    kind: str
    user_id: UUID | None = None


SYSTEM: Final = Actor("system")


class InvalidTransition(Exception):
    """The move is not in TRANSITIONS, or this actor may not make it.

    Carries a Hebrew `detail` so the route can answer 409 (a move that does not
    exist from this status) or 403 (a move that exists, for someone else)
    without composing copy of its own.
    """

    def __init__(self, detail: str, *, forbidden: bool = False) -> None:
        super().__init__(detail)
        self.detail = detail
        self.forbidden = forbidden


def can_transition(from_status: str, to_status: str, actor: str) -> bool:
    return actor in TRANSITIONS.get(from_status, {}).get(to_status, frozenset())


def _stamp(order: ProductOrder, to_status: str) -> None:
    """The timestamp columns that mirror a status, so a list query can sort and
    filter without joining the event log."""
    now = utc_now()
    if to_status == "confirmed":
        order.confirmed_at = now  # type: ignore[assignment]
    elif to_status == "handed":
        order.handed_at = now  # type: ignore[assignment]
    if to_status in TERMINAL_STATUSES:
        order.closed_at = now  # type: ignore[assignment]


def apply_transition(
    db: Session,
    order: ProductOrder,
    to_status: str,
    actor: Actor,
    note: str | None = None,
) -> ProductOrderEvent:
    """Move `order` to `to_status` and log it. Raises InvalidTransition.

    The caller must hold the order row locked (`with_for_update`) when two
    people can act on it at once — a business confirming while the buyer
    cancels — and must commit. Nothing here commits or locks.
    """
    if (
        to_status not in PRODUCT_ORDER_STATUSES
        or actor.kind not in PRODUCT_ORDER_ACTORS
    ):
        raise InvalidTransition(INVALID_TRANSITION_DETAIL)
    from_status = str(order.status)
    allowed = TRANSITIONS.get(from_status, {}).get(to_status)
    if allowed is None:
        raise InvalidTransition(INVALID_TRANSITION_DETAIL)
    if actor.kind not in allowed:
        raise InvalidTransition(ACTOR_NOT_ALLOWED_DETAIL, forbidden=True)

    order.status = to_status  # type: ignore[assignment]
    _stamp(order, to_status)
    event = ProductOrderEvent(
        order_id=order.id,
        from_status=from_status,
        to_status=to_status,
        actor=actor.kind,
        actor_user_id=actor.user_id,
        note=note,
    )
    db.add(event)
    # MEH-3296: the messages this move owes, in the same transaction.
    outbox.on_status(db, order, to_status, actor.kind, note)
    return event


def record_created(db: Session, order: ProductOrder, actor: Actor) -> ProductOrderEvent:
    """The first log row of an order: nothing -> pending.

    An order is born pending and nowhere else; anything further is a move, and
    moves go through apply_transition so they are checked and logged as such.
    """
    if str(order.status) != "pending":
        raise InvalidTransition(INVALID_TRANSITION_DETAIL)
    event = ProductOrderEvent(
        order_id=order.id,
        from_status=None,
        to_status=str(order.status),
        actor=actor.kind,
        actor_user_id=actor.user_id,
    )
    db.add(event)
    outbox.on_status(db, order, "pending", actor.kind, None)
    return event
