"""
Module:   prepay_refunds
Purpose:  When money may have been paid ahead through the business's own link
          (MEH-3895) and the thing it paid for is gone, the business is told
          what to return: a group-buy member left, a group buy was cancelled
          (by the business, the admin, the delist of the business, or the
          daily close of a group that had been funded and fell back), or the
          business cancelled a bag.
Touches:  Resend via send_email (background tasks / after the commit) — read
          only on users, group_buy_commits and rescue_orders.
Does NOT: move money or know whether anyone paid: the link does not tell us,
          so every line says «אם … כבר התקבל». A single buyer's cancel of a bag
          is rescue_business_emails.send_business_refund_email.
Related:  app/schemas/payment_link.py::prepay_link (when a link counts) ·
          routers/group_buys.py::cancel_commit, ::update_group_buy_status ·
          services/group_buy_expiry.py · routers/rescue.py::cancel_offer
History:  MEH-3897 (creation)
"""

from __future__ import annotations

import functools
import logging
from datetime import datetime
from typing import Any, Callable, TypeVar

from fastapi import BackgroundTasks
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.sentry import capture_background_exception
from app.models.models import (
    GroupBuy,
    GroupBuyCommit,
    Producer,
    RescueOffer,
    RescueOrder,
)
from app.services.booking_cancellations import owner_emails
from app.services.email import send_email
from app.services.prepay_copy import Prepay, prepay_from_info
from app.utils.money import agorot_from_shekels, shekels_text

logger = logging.getLogger(__name__)

Mail = tuple[str, str, str, bool]  # to, subject, body, test_cause


_F = TypeVar("_F", bound=Callable[..., list["Mail"]])


def _fail_open(fn: _F) -> _F:
    """A refund note must never turn a done leave or cancel into a 500."""

    @functools.wraps(fn)
    def wrapper(db: Session, *args: Any, **kwargs: Any) -> list[Mail]:
        try:
            # A savepoint: a failed read must not leave the caller's
            # transaction aborted, or its own commit would 500 after all.
            with db.begin_nested():
                return fn(db, *args, **kwargs)
        except Exception as exc:  # noqa: BLE001 — fail-open, as every other email
            capture_background_exception(exc, task="prepay_refund_email")
            logger.exception("[prepay] refund note not built")
            return []

    return wrapper  # type: ignore[return-value]


def prepay_of(producer: Producer | None) -> Prepay | None:
    return prepay_from_info(producer.payment_info if producer is not None else None)


# --- the refund notes ----------------------------------------------------------


def _refund_body(
    intro: str, items: list[tuple[str | None, int]], deposit: bool, path: str
) -> str:
    """`items` = (pickup code or None, agorot). A deposit's size is the
    business's, not ours, so it names codes only (the MEH-3895 rule)."""
    if deposit:
        ask = "אם המקדמה כבר התקבלה, צריך להחזיר אותה באותה דרך שבה שולמה."
    else:
        ask = "אם התשלום מראש כבר התקבל, צריך להחזיר אותו באותה דרך שבה שולם."
    lines = []
    for code, agorot in items:
        who = f"קוד {code}" if code else "בלי קוד איסוף"
        lines.append(f"• {who}" if deposit else f"• {who}: {shekels_text(agorot)} ₪")
    return (
        "שלום,\n\n"
        f"{intro}\n{ask}\n\n"
        + "\n".join(lines)
        + f"\n\nאפשר לראות הכל בלוח הבקרה:\n{settings.frontend_url}{path}\n\n"
        "צוות מהמקור"
    )


def _mails(db: Session, producer: Producer, subject: str, body: str) -> list[Mail]:
    test_cause = bool(producer.is_test)  # MEH-2952
    return [(to, subject, body, test_cause) for to in owner_emails(db, producer)]


def send_mails(mails: list[Mail]) -> None:
    """Background task / after-commit sender. One failure never stops the rest."""
    for to, subject, body, test_cause in mails:
        try:
            send_email(to, subject, body, test_cause=test_cause, kind="prepay_refund")
        except Exception:  # noqa: BLE001 — send_email is fail-open; belt and braces
            logger.exception("[prepay] refund email failed")


def _gb_agorot(gb: GroupBuy, c: GroupBuyCommit) -> int:
    return agorot_from_shekels(gb.price_per_unit_group) * int(c.quantity or 1)  # type: ignore[arg-type]


def _gb_could_be_paid(gb: GroupBuy) -> Prepay | None:
    """The buyer is shown the link only once the group is funded
    (MEH-3895). `funded_notified_at` is one-way (MEH-1651), so a group that
    was funded and fell back still counts: someone may have paid then."""
    if gb.funded_notified_at is None and gb.status != "funded":
        return None
    return prepay_of(gb.producer)


GB_PATH = "/producer/dashboard/group-buys"


@_fail_open
def group_buy_leave_mails(
    db: Session, gb: GroupBuy, commit: GroupBuyCommit
) -> list[Mail]:
    """Read BEFORE the commit row is deleted."""
    p = _gb_could_be_paid(gb)
    if p is None or gb.producer is None:
        return []
    title = " ".join(str(gb.title or "").split())
    code = f" (קוד האיסוף {commit.pickup_code})" if commit.pickup_code else ""
    body = _refund_body(
        f'הצטרפות לקבוצה "{title}" בוטלה עכשיו{code}.',
        [(commit.pickup_code, _gb_agorot(gb, commit))],  # type: ignore[list-item]
        p.deposit,
        GB_PATH,
    )
    return _mails(db, gb.producer, f'בוטלה הצטרפות לקבוצה "{title}"', body)


GB_CANCEL_INTRO = {
    "owner": 'ביטלתם את הקבוצה "{title}".',
    "admin": 'הקבוצה "{title}" בוטלה.',
    "expired": 'הקבוצה "{title}" נסגרה בלי להגיע למינימום.',
    "delisted": 'בית העסק כבר לא מופיע במהמקור, ולכן הקבוצה "{title}" בוטלה.',
}


@_fail_open
def group_buy_cancel_mails(db: Session, gb: GroupBuy, why: str) -> list[Mail]:
    """Read BEFORE the status write's commit (the commits stay either way)."""
    p = _gb_could_be_paid(gb)
    if p is None or gb.producer is None:
        return []
    commits = sorted(gb.commits, key=lambda c: (c.pickup_code or "", str(c.id)))
    if not commits:
        return []
    title = " ".join(str(gb.title or "").split())
    body = _refund_body(
        GB_CANCEL_INTRO[why].format(title=title) + " אלה ההצטרפויות שבה.",
        [(c.pickup_code, _gb_agorot(gb, c)) for c in commits],
        p.deposit,
        GB_PATH,
    )
    return _mails(db, gb.producer, f'הקבוצה "{title}" בוטלה: מה להחזיר', body)


def queue_mails(background_tasks: BackgroundTasks, mails: list[Mail]) -> int:
    if mails:
        background_tasks.add_task(send_mails, mails)
    return len(mails)


@_fail_open
def bag_business_cancel_mails(
    db: Session, offer: RescueOffer, buyer_ids: set[Any]
) -> list[Mail]:
    """After cancel_whole_offer's commit: the reservations it cancelled are
    the offer's cancelled orders stamped at its one `now` (an earlier buyer's
    own cancel has an earlier stamp, and was told about already). No buyer
    ids = it cancelled none, so the newest stamp would be a buyer's own."""
    location = offer.location
    producer = location.producer if location else None
    p = prepay_of(producer)
    if p is None or producer is None or not buyer_ids:
        return []
    last: datetime | None = (
        db.query(func.max(RescueOrder.cancelled_at))
        .filter(RescueOrder.offer_id == offer.id, RescueOrder.status == "cancelled")
        .scalar()
    )
    if last is None:
        return []
    orders: list[Any] = (
        db.query(RescueOrder)
        .filter(
            RescueOrder.offer_id == offer.id,
            RescueOrder.status == "cancelled",
            RescueOrder.cancelled_at == last,
            RescueOrder.user_id.in_(buyer_ids),
            # A reservation marked «שולם» gets its own, certain refund email
            # (rescue_payment.queue_paid_refunds); listing it again here
            # would tell the business to return it twice.
            RescueOrder.paid_at.is_(None),
        )
        .order_by(RescueOrder.pickup_code)
        .all()
    )
    if not orders:
        return []
    name = " ".join(str(producer.name or "").split())
    body = _refund_body(
        "ביטלתם את סל ההפתעה, ואיתו בוטלו השריונים האלה, שלא סימנתם «שולם».",
        [(o.pickup_code, int(offer.price_agorot) * int(o.qty)) for o in orders],
        p.deposit,
        "/producer/dashboard/rescue",
    )
    return _mails(db, producer, f"בוטל סל הפתעה ב{name}: מה להחזיר", body)
