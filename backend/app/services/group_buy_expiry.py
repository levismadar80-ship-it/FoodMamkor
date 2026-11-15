"""
Module:   group_buy_expiry
Purpose:  Close every open group buy whose deadline passed below its minimum,
          and tell each participant it is not going ahead (MEH-3287).
Touches:  group_buys (status), group_buy_commits + users (read, recipients),
          Resend via group_buy_notifications.notify_participant_expired.
Does NOT: touch funded groups (they reached the goal; the business closes them
          with fulfilled/cancelled, group_buys.update_group_buy_status), or
          email the business (new copy, not in this card).
Related:  startup._run_group_buy_expiry_job (the daily trigger, 06:00 UTC) ·
          group_buys._public_group_buys (MEH-2540 already hides these) ·
          group_buy_delist.cancel_live_group_buys (same lock + recipients shape).
History:  MEH-3287 (creation).
"""

from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.models import GroupBuy, GroupBuyCommit, Producer, User
from app.services.group_buy_notifications import notify_participant_expired
from app.utils.clock import utc_now

logger = logging.getLogger(__name__)


def expire_unfunded_group_buys(db: Session, now: datetime | None = None) -> int:
    """Cancel open groups past their deadline; mail participants; return count.

    Idempotent by construction: the status change is the stamp, so a second
    run selects nothing. Rows are locked (SKIP LOCKED) so a join or an owner's
    status change in the same instant is never overwritten; a row skipped now
    is picked up on the next run. Emails go out after the commit, from plain
    values, and one failure never stops the rest.
    """
    cutoff = now or utc_now()
    due = (
        db.query(GroupBuy)
        .filter(GroupBuy.status == "open", GroupBuy.deadline < cutoff)
        .with_for_update(skip_locked=True)
        .all()
    )
    outbox: list[tuple[str, str, str, bool]] = []
    for gb in due:
        producer = db.get(Producer, gb.producer_id)
        name = producer.name if producer else ""
        test_cause = bool(producer and producer.is_test)  # MEH-2952
        for (email,) in (
            db.query(User.email)
            .join(GroupBuyCommit, GroupBuyCommit.user_id == User.id)
            .filter(GroupBuyCommit.group_buy_id == gb.id)
            .all()
        ):
            if email:
                outbox.append((email, gb.title, name, test_cause))  # type: ignore[arg-type]
        gb.status = "cancelled"  # type: ignore[assignment]
    db.commit()
    for email, title, name, test_cause in outbox:
        try:
            notify_participant_expired(email, title, name, test_cause=test_cause)
        except Exception:  # noqa: BLE001 — one failure must not stop the rest
            logger.exception("[group-buy] expiry email to a participant failed")
    if due:
        logger.info("[group-buy] expired %d unfunded group buy(s)", len(due))
    return len(due)
