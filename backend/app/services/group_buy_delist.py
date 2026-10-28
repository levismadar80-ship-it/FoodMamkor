"""
Module:   group_buy_delist
Purpose:  When an admin takes a business off the site, cancel its live group
          buys and tell their participants (MEH-2498).
Touches:  group_buys (status), group_buy_commits + users (read, for recipients),
          Resend via group_buy_notifications (background task).
Does NOT: decide WHEN a business leaves the site — the two admin routes that
          move a producer out of 'approved' (admin.toggle_producer_status,
          admin.reject_producer) call this. Does not commit: the caller commits
          the producer status change and these cancellations together.
Related:  group_buys._public_group_buys (MEH-2484 — why a hidden group buy
          strands its participants) · group_buy_notifications
          .send_cancelled_notifications(delisted=True).
History:  MEH-2498 (creation).
"""

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.models.models import GroupBuy, GroupBuyCommit, Producer, User
from app.services.group_buy_notifications import send_cancelled_notifications

# Statuses a participant is still waiting on. fulfilled/cancelled are final.
LIVE_STATUSES = ("open", "funded")


def cancel_live_group_buys(
    db: Session, producer: Producer, background_tasks: BackgroundTasks
) -> int:
    """Cancel every open/funded group buy of ``producer``; return how many.

    Rows are locked (as in group_buys.update_group_buy_status) so a participant
    joining in the same instant cannot flip one open→funded underneath us.
    Recipients are resolved now, while the session is open; the background task
    gets plain strings. The business's own users are not mailed — the owner may
    have joined her own group, and she is told about the decision separately.
    """
    live = (
        db.query(GroupBuy)
        .filter(
            GroupBuy.producer_id == producer.id,
            GroupBuy.status.in_(LIVE_STATUSES),
        )
        .with_for_update()
        .all()
    )
    for gb in live:
        emails = [
            email
            for (email,) in db.query(User.email)
            .join(GroupBuyCommit, GroupBuyCommit.user_id == User.id)
            .filter(GroupBuyCommit.group_buy_id == gb.id)
            .filter((User.producer_id.is_(None)) | (User.producer_id != producer.id))
            .all()
        ]
        gb.status = "cancelled"
        if emails:
            background_tasks.add_task(
                send_cancelled_notifications,
                emails,
                gb.title,
                producer.name,
                str(gb.id),
                delisted=True,
            )
    return len(live)
