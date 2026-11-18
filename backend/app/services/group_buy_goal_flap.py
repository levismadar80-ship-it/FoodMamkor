"""
Module:   group_buy_goal_flap
Purpose:  A funded group buy can drop below its minimum when someone leaves,
          and then cross it again. The participants hear about both, once
          each: «the group dropped below its goal» to those who stayed, then
          the funded email again to everyone when it is back at the goal.
Touches:  group_buys (two one-way stamps), users + group_buy_commits (read,
          for recipients), Resend via send_email (background task).
Does NOT: change the status (the routes do), touch `funded_notified_at`
          (MEH-1651 keeps it one-way), or mail the business. The account-
          deletion revert (group_buy_delist.withdraw_user_commits) has no
          BackgroundTasks and does not call this.
Related:  routers/group_buys.py::cancel_commit, ::_maybe_notify_funded;
          services/group_buy_notifications.py (the funded email reused here)
History:  MEH-3311 (creation)
"""

from __future__ import annotations

from typing import Any

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import GroupBuy, GroupBuyCommit, User
from app.services.email import send_email
from app.services.group_buy_notifications import send_funded_notifications
from app.utils.clock import utc_now

# DO NOT interpolate a participant list, phone, or email into the body below
#        (MEH-1651 privacy contract, group_buy_notifications.py header).


def _participant_emails(
    db: Session, gb: GroupBuy, leaving_user_id: Any = None
) -> list[str]:
    # The session does not autoflush, so the leaver's row may still be there:
    # she is excluded by id, never by relying on the delete being flushed.
    query = (
        db.query(User.email)
        .join(GroupBuyCommit, GroupBuyCommit.user_id == User.id)
        .filter(GroupBuyCommit.group_buy_id == gb.id)
    )
    if leaving_user_id is not None:
        query = query.filter(User.id != leaving_user_id)
    return sorted({str(email) for (email,) in query.all() if email})


def _facts(gb: GroupBuy) -> dict[str, Any]:
    return {
        "title": str(gb.title or ""),
        "producer_name": str(gb.producer.name if gb.producer else ""),
        "group_buy_id": str(gb.id),
        "test_cause": bool(gb.producer and gb.producer.is_test),  # MEH-2952
    }


def send_below_goal_emails(
    emails: list[str],
    title: str,
    producer_name: str,
    group_buy_id: str,
    test_cause: bool = False,
) -> None:
    """BackgroundTask: one email per participant who stayed. Never raises
    past one recipient — send_email is fail-open."""
    subject = f'מהמקור — הקבוצה "{title}" ירדה מתחת ליעד'
    url = f"{settings.frontend_url}/group-buys/{group_buy_id}"
    body = (
        "שלום,\n\n"
        f'מישהו עזב את הקבוצה "{title}" של {producer_name}, ועכשיו יש בה פחות '
        "משתתפים מהמינימום. המחיר הקבוצתי ייפתח שוב כשהקבוצה תחזור ליעד, "
        "ונעדכן אתכם כשזה יקרה.\n\n"
        f"ההצטרפות שלכם נשארת בתוקף. לפרטי הקבוצה: {url}\n\n"
        "בברכה,\nצוות מהמקור"
    )
    for to in emails:
        send_email(to, subject, body, test_cause=test_cause)


def notify_below_goal(
    db: Session,
    gb: GroupBuy,
    background_tasks: BackgroundTasks,
    leaving_user_id: Any = None,
) -> int:
    """Call after the leave and the status set back to open. Sends
    only if the group was announced as funded and was never announced as
    below goal. Returns how many participants were queued."""
    if gb.funded_notified_at is None or gb.below_goal_notified_at is not None:
        return 0
    emails = _participant_emails(db, gb, leaving_user_id)
    gb.below_goal_notified_at = utc_now()
    if emails:
        f = _facts(gb)
        background_tasks.add_task(
            send_below_goal_emails,
            emails,
            f["title"],
            f["producer_name"],
            f["group_buy_id"],
            test_cause=f["test_cause"],
        )
    return len(emails)


def notify_back_at_goal(
    db: Session, gb: GroupBuy, background_tasks: BackgroundTasks
) -> int:
    """Call when a join re-crosses the minimum of a group whose funded email
    already went out (the latch is set). Sends the funded email again to
    every participant, once — only if they were told it dropped."""
    if gb.below_goal_notified_at is None or gb.refunded_notified_at is not None:
        return 0
    emails = _participant_emails(db, gb)
    gb.refunded_notified_at = utc_now()
    if emails:
        f = _facts(gb)
        background_tasks.add_task(
            send_funded_notifications,
            None,  # the business was told at the first funding
            emails,
            f["title"],
            f["producer_name"],
            f["group_buy_id"],
            str(gb.producer_id),
            test_cause=f["test_cause"],
        )
    return len(emails)
