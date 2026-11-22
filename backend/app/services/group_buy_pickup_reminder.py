"""
Module:   group_buy_pickup_reminder
Purpose:  The reminder before pickup (MEH-3610): once per funded group buy,
          the evening before its pickup window, each participant gets the time,
          the place and the notes.
Touches:  group_buys (pickup_reminder_sent_at), group_buy_commits + users
          (read, recipients), Resend via group_buy_notifications.
Does NOT: remind a group with no pickup window, a delivery-only group, an open
          or closed one, or a business that is no longer public; never mails
          the business (it set the time).
Related:  startup._run_group_buy_pickup_reminder_job (17:00 Israel) ·
          registration_reminders.py (the evening-before shape, MEH-3312) ·
          group_buy_expiry.py (lock + outbox shape)
History:  MEH-3610 (creation)
"""

from __future__ import annotations

import logging
from datetime import datetime, time, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.models import GroupBuy, GroupBuyCommit, Producer, User
from app.services.group_buy_notifications import notify_pickup_reminder
from app.services.group_buy_pickup_place import place_line
from app.services.group_buy_pickup_text import is_delivery_only, pickup_lines
from app.services.producer_listing import is_business
from app.utils.clock import ISRAEL_TZ, utc_now

logger = logging.getLogger(__name__)


def _until_end_of_tomorrow(now: datetime) -> datetime:
    """Naive UTC for the end of tomorrow on the Israel clock: a 17:00 run
    covers tomorrow's pickups, and any later today it has not mailed yet."""
    local = now.replace(tzinfo=timezone.utc).astimezone(ISRAEL_TZ)
    end_local = datetime.combine(local.date() + timedelta(days=2), time(0), ISRAEL_TZ)
    return end_local.astimezone(timezone.utc).replace(tzinfo=None)


def send_pickup_reminders(db: Session, now: datetime | None = None) -> int:
    """Stamp and mail every due group; return how many groups were reminded.

    Idempotent: the stamp is set in the same commit that selects the row (SKIP
    LOCKED), and the mail goes out after it, so a second run selects nothing
    and a crash after the commit loses a reminder rather than doubling it.
    The stamp is cleared when the pickup time moves (settings), so a moved
    pickup is reminded again. Someone who joins after the reminder went out
    gets none: her join email already carries the pickup time.
    """
    now = now or utc_now()
    due = (
        db.query(GroupBuy)
        .join(Producer, GroupBuy.producer_id == Producer.id)
        .filter(
            is_business(),
            GroupBuy.status == "funded",
            GroupBuy.pickup_reminder_sent_at.is_(None),
            GroupBuy.pickup_starts_at.isnot(None),
            GroupBuy.pickup_starts_at > now,
            GroupBuy.pickup_starts_at < _until_end_of_tomorrow(now),
        )
        .with_for_update(of=GroupBuy, skip_locked=True)
        .all()
    )
    outbox: list[tuple[str, str, str, str, str, bool]] = []
    reminded = 0
    for gb in due:
        gb.pickup_reminder_sent_at = now  # type: ignore[assignment]
        if is_delivery_only(gb.pickup_note, gb.delivery_note, gb.fulfillment_note):  # type: ignore[arg-type]
            continue  # nobody comes to pick up; stamped so it is not re-read
        reminded += 1
        producer = gb.producer
        pickup = place_line(gb.pickup_location) + pickup_lines(
            gb.pickup_starts_at,  # type: ignore[arg-type]
            gb.pickup_ends_at,  # type: ignore[arg-type]
            gb.pickup_note,  # type: ignore[arg-type]
            gb.delivery_note,  # type: ignore[arg-type]
        )
        for (email,) in (
            db.query(User.email)
            .join(GroupBuyCommit, GroupBuyCommit.user_id == User.id)
            .filter(GroupBuyCommit.group_buy_id == gb.id)
            .all()
        ):
            if email:
                outbox.append(
                    (
                        email,
                        str(gb.title),
                        str(producer.name if producer else ""),
                        str(gb.id),
                        pickup,
                        bool(producer and producer.is_test),  # MEH-2952
                    )
                )
    db.commit()
    for email, title, name, gb_id, pickup, test_cause in outbox:
        try:
            notify_pickup_reminder(
                email, title, name, gb_id, pickup, test_cause=test_cause
            )
        except Exception:  # noqa: BLE001 — one failure must not stop the rest
            logger.exception("[group-buy] pickup reminder to a participant failed")
    if reminded:
        logger.info("[group-buy] pickup reminders for %d group buy(s)", reminded)
    return reminded
