"""
Module:   product_order_outbox
Purpose:  The messages an order owes: written in the same transaction as the
          status move that causes them, and sent later by the dispatcher, with
          retries, so a message is neither lost to a provider hiccup nor sent
          because a move was rolled back.
Touches:  DB table product_order_notifications (insert, then status/attempts);
          reads product_orders, producers, users, producer_order_settings.
          Sends through whatsapp.send_template_result and
          email.send_email_result — both fail-open, neither raises.
Does NOT: change an order's status (product_order_state / product_order_sweeper).
          Does NOT store a phone, an address or a link: each is read from the
          order when the row is sent, so an account deleted in between leaves
          nothing to send to (the row ends `skipped`, `no_address`).
Related:  app/services/product_order_state.py (calls on_status on every move),
          app/services/product_order_sweeper.py (expiry),
          app/startup.py (the two scheduler jobs)
History:  MEH-3296 (creation; stage 3 of MEH-3216)

Delivery is at least once: a row is locked (SKIP LOCKED), sent, marked and
committed one at a time, so a crash between the send and the commit sends
that one message again on the next tick. There is no `sending` state to get
stuck in.
"""

import logging
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import Producer, User
from app.models.product_orders import (
    ProducerOrderSettings,
    ProductOrder,
    ProductOrderNotification,
)
from app.services import email as email_service
from app.services import whatsapp
from app.services import whatsapp_templates as wt
from app.services.product_order_clock import active_deadline, rest_end_if_inside
from app.utils.clock import ISRAEL_TZ, utc_now
from app.utils.phone import canonical_il_msisdn

log = logging.getLogger(__name__)

# The account-deletion cancel (services/product_order_privacy.py) carries this
# note; the buyer asked to leave, so no message goes to her.
ACCOUNT_DELETED_NOTE = "החשבון נמחק"

REMIND_BUSINESS_AFTER_HOURS = 4
# Sapir's 24-hour answer window, as the reminder states it.
ANSWER_HOURS = 24
DAY_BEFORE = timedelta(hours=24)
# A confirmation that lands this close to the slot needs no separate
# reminder: it would arrive minutes after the confirmation itself.
DAY_BEFORE_MIN_NOTICE = timedelta(hours=26)
MAX_ATTEMPTS = 5
RETRY_BASE = timedelta(minutes=5)
# A message more than this late (downtime, the flag turned on over a backlog)
# is dropped, not sent: "your order was confirmed" a day later misleads.
STALE_AFTER = timedelta(hours=6)
BATCH = 20

_WA_PARAM_MAX_LEN = 200
_DAYS = ("שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת", "ראשון")
_FULFILMENT = {"pickup": "איסוף", "delivery": "משלוח"}

NEW_ORDER_SUBJECT = "הזמנה חדשה מחכה לאישור"
WAITING_SUBJECT = "הזמנה מחכה לתשובה"
NEW_ORDER_AUTO_SUBJECT = "הזמנה חדשה התקבלה ואושרה"
BUYER_CANCELLED_SUBJECT = "הזמנה בוטלה"

_BUSINESS_KINDS = ("new_order", "business_reminder", "buyer_cancelled")


# --- enqueue ---------------------------------------------------------------


def _owe(
    db: Session,
    order: ProductOrder,
    kind: str,
    channels: tuple[str, ...],
    when: datetime,
) -> None:
    for channel in channels:
        db.execute(
            pg_insert(ProductOrderNotification)
            .values(order_id=order.id, kind=kind, channel=channel, send_after=when)
            .on_conflict_do_nothing(index_elements=["order_id", "kind", "channel"])
        )


def on_status(  # noqa: PLR0913 — the move, as product_order_state sees it
    db: Session,
    order: ProductOrder,
    to_status: str,
    actor_kind: str,
    note: str | None,
    now: datetime | None = None,
) -> None:
    """Write the messages this move owes. Called by product_order_state for
    the birth of an order (to_status "pending") and for every move."""
    now = now or utc_now()
    if to_status == "pending":
        _owe(db, order, "new_order", ("whatsapp", "email"), now)
        _owe(
            db,
            order,
            "business_reminder",
            ("whatsapp", "email"),
            active_deadline(now, REMIND_BUSINESS_AFTER_HOURS),
        )
    elif to_status == "confirmed":
        _owe(db, order, "confirmed", ("whatsapp",), now)
        slot_start = order.slot_start
        if (
            isinstance(slot_start, datetime)
            and slot_start - now >= DAY_BEFORE_MIN_NOTICE
        ):
            _owe(db, order, "day_before", ("whatsapp",), slot_start - DAY_BEFORE)
    elif to_status == "change_proposed":
        _owe(db, order, "change_proposed", ("whatsapp",), now)
    elif to_status == "cancelled" and actor_kind == "customer":
        _owe(db, order, "buyer_cancelled", ("email",), now)
    elif (
        to_status == "cancelled"
        and actor_kind == "system"
        and note == ACCOUNT_DELETED_NOTE
    ):
        # Only the system writes this note; a business typing the same words
        # still owes the buyer the «בוטלה» message below.
        _owe(db, order, "buyer_cancelled", ("email",), now)
    elif to_status in ("cancelled", "declined", "expired"):
        _owe(db, order, "closed", ("whatsapp",), now)


# --- composing ---------------------------------------------------------------


def wa_param(text: str) -> str:
    """One line, no tabs, bounded: what Meta accepts as a parameter."""
    flat = re.sub(r"\s+", " ", text.replace("\r", "")).strip()
    return flat[:_WA_PARAM_MAX_LEN]


def _local(at: datetime) -> datetime:
    return at.replace(tzinfo=UTC).astimezone(ISRAEL_TZ)


def _day(at: object) -> str:
    assert isinstance(at, datetime)
    local = _local(at)
    return f"יום {_DAYS[local.weekday()]} {local.day}.{local.month}"


def _hhmm(at: object) -> str:
    assert isinstance(at, datetime)
    return _local(at).strftime("%H:%M")


def _shekels(agorot: int) -> str:
    whole, rest = divmod(int(agorot), 100)
    return f"{whole}" if rest == 0 else f"{whole}.{rest:02d}"


def _to_pay(order: ProductOrder) -> int:
    goods = order.final_total_agorot
    if goods is None:
        goods = order.estimated_total_agorot
    return int(goods) + int(order.delivery_fee_agorot or 0)


def buyer_link(order: ProductOrder) -> str | None:
    """The buyer's page. The token rides after `#`, which a browser never
    sends to a server, so it is in no access log. Derived again from the
    idempotency key: an order whose key was cleared (account deleted) has no
    link."""
    if not order.idempotency_key:
        return None
    from app.services.product_order_create import status_token_for

    token = status_token_for(str(order.idempotency_key))
    return f"{settings.frontend_url}/he/order/{order.id}#t={token}"


def business_link() -> str:
    return f"{settings.frontend_url}/he/producer/dashboard/orders"


@dataclass(frozen=True)
class _Message:
    send: Callable[[], str]  # → an outcome: "sent", "failed", or a skip code


def _wa(to: str, template: wt.WhatsAppTemplate, test: bool) -> Callable[[], str]:
    def send() -> str:
        result = whatsapp.send_template_result(to, template, test_cause=test)
        if result.ok:
            return "sent"
        if result.outcome in (
            whatsapp.OUTCOME_SKIPPED_TEST,
            whatsapp.OUTCOME_UNCONFIGURED,
        ):
            return result.outcome
        # A 4xx from Meta (unknown template, bad number) will not get better.
        status = result.http_status or 0
        retryable = status == 0 or status >= 500 or status == 429
        return "failed" if retryable else "refused"

    return send


def _mail(to: str, subject: str, body: str, test: bool) -> Callable[[], str]:
    def send() -> str:
        return email_service.send_email_result(to, subject, body, test_cause=test)

    return send


def _business_text(
    kind: str, order: ProductOrder, now: datetime
) -> tuple[wt.WhatsAppTemplate, str, str]:
    count = sum(int(line.qty) for line in order.items)
    link = business_link()
    customer = wa_param(str(order.customer_name))
    if kind == "new_order":
        template: wt.WhatsAppTemplate = wt.ProductOrderNewV1(
            customer_name=customer,
            count=str(count),
            total=_shekels(_to_pay(order)),
            fulfilment=_FULFILMENT[str(order.fulfilment)],
            day=_day(order.slot_start),
            starts=_hhmm(order.slot_start),
            ends=_hhmm(order.slot_end),
            link=link,
        )
        body = (
            f"הזמנה חדשה ממהמקור: {customer}, {count} פריטים, "
            f"{_shekels(_to_pay(order))} ₪, {_FULFILMENT[str(order.fulfilment)]} "
            f"ב{_day(order.slot_start)} {_hhmm(order.slot_start)}–{_hhmm(order.slot_end)}. "
            f"לאישור: {link}"
        )
        if str(order.status) != "pending":
            # MEH-3296: confirmed on its own (the business's auto-confirm):
            # nothing waits for approval, so the email says so and the
            # WhatsApp template, whose text asks for approval, is not sent.
            body = body.replace("לאישור:", "פרטים:")
            return template, NEW_ORDER_AUTO_SUBJECT, body
        return template, NEW_ORDER_SUBJECT, body
    if kind == "business_reminder":
        deadline = f"{_day(order.expires_at)} {_hhmm(order.expires_at)}"
        template = wt.ProductOrderWaitingV1(
            hours=str(REMIND_BUSINESS_AFTER_HOURS), deadline=deadline, link=link
        )
        body = (
            f"הזמנה מחכה לתשובה כבר {REMIND_BUSINESS_AFTER_HOURS} שעות. "
            f"אם לא תענו עד {deadline}, היא תתבטל. {link}"
        )
        return template, WAITING_SUBJECT, body
    # buyer_cancelled — email only; the template slot is unused.
    body = (
        f"ההזמנה של {customer} ל"
        f"{_day(order.slot_start)} {_hhmm(order.slot_start)}–{_hhmm(order.slot_end)} "
        f"בוטלה. פרטים: {link}"
    )
    return (
        wt.ProductOrderClosedV1(business_name="", link=link),
        BUYER_CANCELLED_SUBJECT,
        body,
    )


def _buyer_template(
    kind: str, order: ProductOrder, name: str, link: str
) -> wt.WhatsAppTemplate:
    if kind == "confirmed":
        return wt.ProductOrderConfirmedV1(
            business_name=name,
            fulfilment=_FULFILMENT[str(order.fulfilment)],
            day=_day(order.slot_start),
            starts=_hhmm(order.slot_start),
            ends=_hhmm(order.slot_end),
            total=_shekels(_to_pay(order)),
            link=link,
        )
    if kind == "change_proposed":
        return wt.ProductOrderChangeV1(business_name=name, link=link)
    if kind == "day_before":
        return wt.ProductOrderTomorrowV1(
            fulfilment=_FULFILMENT[str(order.fulfilment)],
            business_name=name,
            starts=_hhmm(order.slot_start),
            ends=_hhmm(order.slot_end),
            link=link,
        )
    return wt.ProductOrderClosedV1(business_name=name, link=link)


def _compose(
    db: Session,
    row: ProductOrderNotification,
    order: ProductOrder,
    producer: Producer,
    now: datetime,
) -> _Message | str:
    """The message to send, or the skip code that says why there is none."""
    owner = db.query(User).filter(User.producer_id == producer.id).first()
    buyer = (
        db.query(User).filter(User.id == order.user_id).first()
        if order.user_id
        else None
    )
    test = bool(
        producer.is_test
        or (owner is not None and owner.is_test)
        or (buyer is not None and buyer.is_test)
    )
    if row.kind in _BUSINESS_KINDS:
        template, subject, body = _business_text(str(row.kind), order, now)
        if row.channel == "email":
            address = owner.email if owner is not None else None
            return (
                _Message(_mail(str(address), subject, body, test))
                if address
                else "no_address"
            )
        if row.kind == "new_order" and str(order.status) != "pending":
            return "auto_confirmed"
        # The business's phone is stored as typed (0501234567); WhatsApp
        # needs the international form, and a landline has none.
        msisdn = canonical_il_msisdn(str(producer.phone or ""))
        return _Message(_wa(f"+{msisdn}", template, test)) if msisdn else "no_address"
    link = buyer_link(order)
    if not order.customer_phone or link is None:
        return "no_address"
    template = _buyer_template(str(row.kind), order, wa_param(str(producer.name)), link)
    return _Message(_wa(f"+{order.customer_phone}", template, test))


# --- dispatching ---------------------------------------------------------------


def _still_relevant(
    row: ProductOrderNotification, order: ProductOrder, now: datetime
) -> bool:
    if row.kind == "business_reminder":
        return str(order.status) == "pending"
    if row.kind == "day_before":
        return str(order.status) in ("confirmed", "ready") and bool(
            order.slot_start > now
        )
    return True


def _finish(row: ProductOrderNotification, outcome: str, now: datetime) -> None:
    if outcome == "sent":
        row.outcome, row.sent_at, row.last_error = "sent", now, None  # type: ignore[assignment]
        return
    if outcome not in ("failed", "refused"):
        row.outcome, row.last_error = "skipped", outcome[:20]  # type: ignore[assignment]
        return
    row.attempts = int(row.attempts) + 1  # type: ignore[assignment]
    row.last_error = "provider"  # type: ignore[assignment]
    if outcome == "refused" or int(row.attempts) >= MAX_ATTEMPTS:
        row.outcome = "failed"  # type: ignore[assignment]
    else:
        row.send_after = now + RETRY_BASE * (2 ** (int(row.attempts) - 1))


def _handle(db: Session, row: ProductOrderNotification, now: datetime) -> None:
    order = db.query(ProductOrder).filter(ProductOrder.id == row.order_id).one()
    producer = db.query(Producer).filter(Producer.id == order.producer_id).one()
    if row.send_after < now - STALE_AFTER:
        _finish(row, "stale", now)
        return
    if not _still_relevant(row, order, now):
        _finish(row, "not_relevant", now)
        return
    observant = (
        db.query(ProducerOrderSettings.shabbat_observant)
        .filter(ProducerOrderSettings.producer_id == producer.id)
        .scalar()
    )
    rest_end = rest_end_if_inside(now) if observant else None
    if rest_end is not None:
        # Every message of an observant business's order waits, the buyer's
        # too: they go out in its name. Not an attempt.
        row.send_after = rest_end  # type: ignore[assignment]
        return
    message = _compose(db, row, order, producer, now)
    _finish(row, message if isinstance(message, str) else message.send(), now)


def dispatch_due(db: Session, now: datetime | None = None, limit: int = BATCH) -> int:
    """Send up to `limit` due messages, one short transaction each. Returns
    how many rows were handled (sent, retried later, or closed)."""
    now = now or utc_now()
    handled = 0
    while handled < limit:
        row = (
            db.query(ProductOrderNotification)
            .filter(
                ProductOrderNotification.outcome == "pending",
                ProductOrderNotification.send_after <= now,
            )
            .order_by(ProductOrderNotification.send_after)
            .with_for_update(skip_locked=True)
            .first()
        )
        if row is None:
            break
        try:
            _handle(db, row, now)
            db.commit()
        except Exception:  # noqa: BLE001 — one bad row must not stop the batch
            db.rollback()
            log.exception(
                "product orders: outbox row failed (notification_id=%s)", row.id
            )
            # Only while still pending: after the rollback another worker may
            # have taken and sent the row, and "sent" must not become "failed".
            failed = (
                db.query(ProductOrderNotification)
                .filter_by(id=row.id, outcome="pending")
                .with_for_update()
                .first()
            )
            if failed is not None:
                failed.outcome, failed.last_error = "failed", "error"  # type: ignore[assignment]
            db.commit()
        handled += 1
    return handled
