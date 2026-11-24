"""
Module:   group_buy_no_show
Purpose:  MEH-3735 — «לא הגיע» for group buys, the rescue mechanism's sibling.
          Each participant has a pickup code; after pickup the business marks
          a code handed or not collected; a no-show mails her, and two inside
          30 days block joining new group buys until an admin releases her.
Touches:  group_buy_commits (pickup_code, handed_at, no_show_at) + users
          (group_buy_block_cleared_at); Resend via send_email (background task).
Does NOT: count rescue no-shows. The two counts are separate on purpose: the
          rescue mails' approved copy says «סלים», and the rescue pilot sits
          behind its own flag. Rescue lives in services/rescue_no_show.py.
          Does not keep tombstones on account deletion (rescue does, MEH-3225);
          a deleted account's commits go with it.
Related:  routers/group_buy_pickup.py (the routes) · routers/group_buys.py
          (commit_to_group_buy calls refuse_if_blocked and new_code)
History:  MEH-3735 (creation)
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta
from html import escape as html_escape
from typing import Any
from uuid import UUID

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import GroupBuy, GroupBuyCommit, User
from app.services.email import send_email
from app.services.group_buy_pickup_text import is_delivery_only
from app.services.registration_emails import _shell
from app.services.rescue_no_show import NO_SHOW_BLOCK_AT, NO_SHOW_WINDOW_DAYS
from app.utils.clock import utc_now

# REUSES: backend/app/services/rescue_writes.py:72 — secrets, 4 digits.
CODE_ATTEMPTS = 8
# A group that reached its goal is the only one with anything to pick up.
MARKABLE_STATUSES = ("funded", "fulfilled")
# MEH-3735 review: a mark is a fresh memory of the counter, not an audit of
# last spring. Past this many days after the pickup ends, nothing is marked.
MARK_WINDOW_DAYS = 14

NOT_FUNDED_DETAIL = "הקבוצה לא הגיעה ליעד"
DELIVERY_ONLY_DETAIL = "בקבוצה עם משלוח בלבד אין איסוף לסמן."
NO_WINDOW_DETAIL = "כדי לסמן «לא הגיע», קבעו זמן איסוף לקבוצה."
WAIT_DETAIL = "אפשר לסמן «לא הגיע» רק אחרי שזמן האיסוף נגמר"
CLOSED_DETAIL = "עברו 14 יום מסוף האיסוף, ולכן אי אפשר לסמן יותר."
# One 409 per state that refuses a mark; "open" is the only one that allows.
_STATE_DETAIL = {
    "not_funded": NOT_FUNDED_DETAIL,
    "delivery": DELIVERY_ONLY_DETAIL,
    "no_window": NO_WINDOW_DETAIL,
    "wait": WAIT_DETAIL,
    "closed": CLOSED_DETAIL,
}

REFUSED_DETAIL = (
    "כרגע אי אפשר להצטרף: היו שתי אי-הגעות ב-30 הימים האחרונים. "
    "אם זו טעות, כתבו לנו."
)


def new_code(taken: set[str]) -> str:
    """A 4-digit code not yet used in this group. `secrets`: the code is what
    stands between a stranger and someone else's order at the counter."""
    for _ in range(CODE_ATTEMPTS):
        code = f"{secrets.randbelow(10000):04d}"
        if code not in taken:
            return code
    raise HTTPException(status_code=409, detail="נסו שוב בעוד רגע")


def codes_in_use(db: Session, group_buy_id: UUID) -> set[str]:
    rows = (
        db.query(GroupBuyCommit.pickup_code)
        .filter(GroupBuyCommit.group_buy_id == group_buy_id)
        .all()
    )
    return {str(c) for (c,) in rows if c}


def mark_state(gb: GroupBuy) -> str:
    """Whether the business may mark this group now, and if not, why.
    # DO NOT fall back to the deadline when there is no window — the deadline
    # is when joining closes, not when anyone was due at the counter (review).
    """
    if gb.status not in MARKABLE_STATUSES:
        return "not_funded"
    if is_delivery_only(gb.pickup_note, gb.delivery_note, gb.fulfillment_note):  # type: ignore[arg-type]
        return "delivery"
    ends: datetime | None = gb.pickup_ends_at  # type: ignore[assignment]
    if ends is None:
        return "no_window"
    now = utc_now()
    if ends > now:
        return "wait"
    if now - ends > timedelta(days=MARK_WINDOW_DAYS):
        return "closed"
    return "open"


def can_mark(gb: GroupBuy) -> bool:
    return mark_state(gb) == "open"


def group_buy_active_no_show_counts(db: Session, user_ids: list[Any]) -> dict[Any, int]:
    """No-shows still counting against each user: marked inside the window and
    after her last admin release. Users with none are absent."""
    if not user_ids:
        return {}
    cutoff = utc_now() - timedelta(days=NO_SHOW_WINDOW_DAYS)
    rows = (
        db.query(GroupBuyCommit.user_id, func.count(GroupBuyCommit.id))
        .join(User, GroupBuyCommit.user_id == User.id)
        .join(GroupBuy, GroupBuyCommit.group_buy_id == GroupBuy.id)
        .filter(
            # A group the business later cancelled leaves nothing owed.
            GroupBuy.status != "cancelled",
            GroupBuyCommit.user_id.in_(user_ids),
            GroupBuyCommit.no_show_at.isnot(None),
            GroupBuyCommit.no_show_at >= cutoff,
            or_(
                User.group_buy_block_cleared_at.is_(None),
                GroupBuyCommit.no_show_at > User.group_buy_block_cleared_at,
            ),
        )
        .group_by(GroupBuyCommit.user_id)
        .all()
    )
    return {uid: int(n) for uid, n in rows}


def group_buy_active_no_shows_of(db: Session, user_id: Any) -> int:
    return group_buy_active_no_show_counts(db, [user_id]).get(user_id, 0)


def refuse_if_blocked(db: Session, user: User) -> None:
    if group_buy_active_no_shows_of(db, user.id) >= NO_SHOW_BLOCK_AT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=REFUSED_DETAIL)


def require_owner(user: User, gb: GroupBuy) -> None:
    """The group's business, or an admin (house IDOR rule)."""
    if user.role == "admin":
        return
    if user.producer_id is None or gb.producer_id != user.producer_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="אין הרשאה")


def group_or_404(db: Session, group_buy_id: UUID, *, lock: bool = False) -> GroupBuy:
    q = db.query(GroupBuy).filter(GroupBuy.id == group_buy_id)
    gb = (q.with_for_update() if lock else q).first()
    if not gb:
        raise HTTPException(status_code=404, detail="קבוצת הרכישה לא נמצאה")
    return gb


def mark(
    db: Session, *, user: User, group_buy_id: UUID, commit_id: UUID, outcome: str
) -> GroupBuyCommit:
    """Write handed_at or no_show_at once, under the group's row lock (a
    participant cancelling in the same instant serialises behind it).
    Commits. `outcome` is "handed" or "no_show"."""
    gb = group_or_404(db, group_buy_id, lock=True)
    require_owner(user, gb)
    commit = (
        db.query(GroupBuyCommit)
        .filter(GroupBuyCommit.id == commit_id, GroupBuyCommit.group_buy_id == gb.id)
        .with_for_update()
        .first()
    )
    if not commit:
        raise HTTPException(status_code=404, detail="לא נמצאה הצטרפות")
    state = mark_state(gb)
    if state != "open":
        raise HTTPException(status_code=409, detail=_STATE_DETAIL[state])
    if commit.handed_at is not None or commit.no_show_at is not None:
        raise HTTPException(status_code=409, detail="ההזמנה הזאת כבר סומנה")
    now = utc_now()
    if outcome == "no_show":
        commit.no_show_at = now
    else:
        commit.handed_at = now
    db.commit()
    db.refresh(commit)
    return commit


def release_group_buy_block(db: Session, user_id: UUID) -> dict[str, Any]:
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="המשתמשת לא נמצאה")
    target.group_buy_block_cleared_at = utc_now()  # type: ignore[assignment]
    db.commit()
    return {"user_id": target.id, "active_no_shows": group_buy_active_no_shows_of(db, target.id)}


def send_group_buy_no_show_email(
    to: str, business: str, title: str, *, active: int, test_cause: bool = False
) -> None:
    """One mail per no-show; `active` = no-shows counting after this one.
    Copy: MEH-3735 table, rows 7-11."""
    name = " ".join((business or "").split())
    contact = f"{settings.frontend_url}/contact"
    lines = [
        f"בית העסק {name} סימן שההזמנה שלכם בקבוצת הרכישה «{title}» לא נאספה."
    ]
    if active >= NO_SHOW_BLOCK_AT:
        lines.append(
            "זו אי-ההגעה השנייה ב-30 הימים האחרונים, ולכן כרגע אי אפשר להצטרף "
            "לקבוצות רכישה חדשות."
        )
    else:
        lines.append(
            "שתי אי-הגעות בתוך 30 יום חוסמות הצטרפות לקבוצות רכישה חדשות. "
            "אם אי אפשר להגיע, אפשר לבטל את ההצטרפות עד המועד האחרון של הקבוצה."
        )
    body_html = "".join(
        f'<p style="margin:0 0 12px;">{html_escape(line)}</p>' for line in lines
    ) + (
        f'<p style="margin:0 0 12px;">אם זו טעות, '
        f'<a href="{html_escape(contact)}" style="color:#2e6853;">כתבו לנו</a> ונבדוק.</p>'
    )
    lines.append(f"אם זו טעות, כתבו לנו ונבדוק: {contact}")
    subject = f"ההזמנה מ{name} לא נאספה"
    send_email(
        to,
        subject,
        "\n\n".join(lines),
        html=_shell(html_escape(subject), body_html),
        test_cause=test_cause,
    )


def queue_group_buy_no_show_email(
    db: Session, background_tasks: BackgroundTasks, commit: GroupBuyCommit
) -> None:
    """Read plain values now, send after the response. Fail-open is the
    caller's (the mark is already committed)."""
    buyer = commit.user
    gb = commit.group_buy
    if not (buyer and buyer.email and gb):
        return
    business = gb.producer
    background_tasks.add_task(
        send_group_buy_no_show_email,
        str(buyer.email),
        str(business.name or "") if business else "",
        str(gb.title or ""),
        active=group_buy_active_no_shows_of(db, buyer.id),
        test_cause=bool((business and business.is_test) or buyer.is_test),
    )
