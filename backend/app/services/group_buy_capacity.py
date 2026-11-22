"""
Module:   group_buy_capacity
Purpose:  What a group buy may still take — people, units, an open/closed
          switch — and who is told when a place frees (MEH-3592).
Touches:  group_buys (read), group_buy_commits (counts), group_buy_waitlist
          (rows, offered_at), users (emails, read). Emails are queued by the
          caller through group_buy_notifications after the commit.
Does NOT: own status transitions (routers/group_buys.py OWNER_TRANSITIONS),
          the funded latch (MEH-1651) or the below-goal flap (MEH-3311).
Related:  routers/group_buys.py::commit_to_group_buy / ::cancel_commit /
          ::update_commit / ::update_group_buy_settings / waitlist routes;
          services/registration_waitlist.py (the events waitlist, MEH-3314 —
          same «first not yet offered, place not held» rule).
History:  MEH-3592 (creation).
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import exists, func, or_
from sqlalchemy.orm import Session, object_session

from app.models.models import GroupBuy, GroupBuyCommit, GroupBuyWaitlist, User
from app.services.group_buy_notifications import (
    send_late_joiner_to_producer,
    send_waitlist_place,
)
from app.utils.clock import utc_now

# MEH-3022: a waitlist longer than this would never be reached, and each row is
# a stranger's account. Same number as the events waitlist (MEH-3314).
WAITLIST_MAX = 50

# MEH-3592: Kickstarter's rule — in the last 24 hours a backer may not cancel
# if that drops a funded project below its goal. A last-minute leave would
# otherwise cancel the group for everyone (the daily job, MEH-3287).
LAST_CALL = timedelta(hours=24)

# MEH-3592 review: an offered row is offered again after this long, if the
# place went to someone else; and at most this many emails per freed batch.
REOFFER_AFTER = timedelta(hours=24)
OFFER_BATCH = 10

JOINS_CLOSED = "בית העסק עצר את ההצטרפות לקבוצה הזאת"
FULL = "קבוצת הרכישה מלאה"
LAST_CALL_REFUSED = "ב-24 השעות האחרונות אי אפשר לבטל אם הקבוצה תרד מתחת ליעד"


def counts(db: Session, gb_id: Any) -> tuple[int, int]:
    """(participants, units) under the caller's row lock — never the cached
    `gb.commits` relationship, which can be stale (MEH-773)."""
    people, units = (
        db.query(
            func.count(GroupBuyCommit.id),
            func.coalesce(func.sum(GroupBuyCommit.quantity), 0),
        )
        .filter(GroupBuyCommit.group_buy_id == gb_id)
        .one()
    )
    return int(people or 0), int(units or 0)


def units_left(gb: GroupBuy, units: int) -> int | None:
    if gb.max_units is None:
        return None
    return max(0, int(gb.max_units) - units)


def is_full(gb: GroupBuy, people: int, units: int) -> bool:
    """No room for one more participant with one unit."""
    if gb.max_participants and people >= gb.max_participants:
        return True
    left = units_left(gb, units)
    return left is not None and left < 1


def refuse_unless_room(
    gb: GroupBuy, people: int, units: int, add_people: int, add_units: int
) -> None:
    """400 when the join (or a bigger quantity) would pass either cap."""
    if gb.joins_closed_at is not None and add_people:
        raise HTTPException(status_code=400, detail=JOINS_CLOSED)
    if add_people and gb.max_participants and people + add_people > gb.max_participants:
        raise HTTPException(status_code=400, detail=FULL)
    left = units_left(gb, units)
    if left is not None and add_units > left:
        if left < 1:
            raise HTTPException(status_code=400, detail=FULL)
        raise HTTPException(
            status_code=400, detail=f"נשארו רק {left} יחידות בקבוצה הזאת"
        )


def refuse_last_call_drop(gb: GroupBuy, remaining_people: int) -> None:
    """MEH-3592: in the last 24 h, a leave may not take a funded group below
    its goal."""
    if (
        gb.status == "funded"
        and remaining_people < gb.min_participants
        and gb.deadline - utc_now() < LAST_CALL
    ):
        raise HTTPException(status_code=400, detail=LAST_CALL_REFUSED)


def waitlist_count(db: Session, gb_id: Any) -> int:
    return int(
        db.query(func.count(GroupBuyWaitlist.id))
        .filter(GroupBuyWaitlist.group_buy_id == gb_id)
        .scalar()
        or 0
    )


def drop_from_waitlist(db: Session, gb_id: Any, user_id: Any) -> None:
    db.query(GroupBuyWaitlist).filter(
        GroupBuyWaitlist.group_buy_id == gb_id, GroupBuyWaitlist.user_id == user_id
    ).delete(synchronize_session=False)


def is_waitlisted(gb: GroupBuy, user_id: Any) -> bool:
    """One EXISTS query, not the whole waitlist relationship."""
    db = object_session(gb)
    if db is None:
        return False
    return (
        db.query(
            exists().where(
                GroupBuyWaitlist.group_buy_id == gb.id,
                GroupBuyWaitlist.user_id == user_id,
            )
        ).scalar()
        is True
    )


def _next_in_line(
    db: Session, gb_id: Any, left: int | None, skip: set[Any]
) -> GroupBuyWaitlist | None:
    """The first row never offered, else the oldest offered more than
    REOFFER_AFTER ago — so a place taken back (a quantity toggled down and up,
    a leave and a rejoin) cannot spend every row's only offer (MEH-3592 review)."""
    q = db.query(GroupBuyWaitlist).filter(
        GroupBuyWaitlist.group_buy_id == gb_id,
        or_(
            GroupBuyWaitlist.offered_at.is_(None),
            GroupBuyWaitlist.offered_at < utc_now() - REOFFER_AFTER,
        ),
    )
    if skip:
        q = q.filter(GroupBuyWaitlist.id.notin_(skip))
    if left is not None:
        q = q.filter(GroupBuyWaitlist.quantity <= left)
    return q.order_by(
        GroupBuyWaitlist.offered_at.asc().nullsfirst(),
        GroupBuyWaitlist.created_at.asc(),
    ).first()


def offer_freed_place(
    db: Session, gb: GroupBuy, background_tasks: BackgroundTasks
) -> int:
    """Places freed: email the next waitlisted visitors in line, one per free
    place (at most OFFER_BATCH a call), and stamp offered_at. The place is not
    held. Caller holds the row lock and commits. Returns how many were told."""
    if gb.status not in ("open", "funded") or gb.joins_closed_at is not None:
        return 0
    if gb.deadline < utc_now():
        return 0
    people, units = counts(db, gb.id)
    free_people = (gb.max_participants - people) if gb.max_participants else OFFER_BATCH
    left = units_left(gb, units)
    told = 0
    skip: set[Any] = set()
    while told < min(free_people, OFFER_BATCH) and (left is None or left >= 1):
        row = _next_in_line(db, gb.id, left, skip)
        if row is None:
            break
        skip.add(row.id)
        email = db.query(User.email).filter(User.id == row.user_id).scalar()
        if not email:
            continue  # an offer to nobody is not spent
        row.offered_at = utc_now()
        background_tasks.add_task(
            send_waitlist_place,
            str(email),
            str(gb.title),
            str(gb.id),
            test_cause=bool(gb.producer and gb.producer.is_test),
        )
        told += 1
        if left is not None:
            left -= int(row.quantity or 1)
    return told


def tell_owner_of_late_join(
    db: Session, gb: GroupBuy, background_tasks: BackgroundTasks
) -> None:
    """MEH-3592: a join to a funded group — the business hears it."""
    owner = db.query(User.email).filter(User.producer_id == gb.producer_id).first()
    people, units = counts(db, gb.id)
    background_tasks.add_task(
        send_late_joiner_to_producer,
        owner[0] if owner else None,
        str(gb.title),
        people,
        units,
        str(gb.id),
        test_cause=bool(gb.producer and gb.producer.is_test),
    )
