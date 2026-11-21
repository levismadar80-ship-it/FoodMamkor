"""
Module:   group_buy_capacity (router)
Purpose:  The MEH-3592 group-buy routes: a participant changes her quantity,
          a visitor joins or leaves the waitlist of a full group, and the
          business changes its caps or stops / reopens joins.
Touches:  group_buys (max_participants, max_units, joins_closed_at),
          group_buy_commits (quantity), group_buy_waitlist (rows).
Does NOT: join, leave or change status (routers/group_buys.py); decide room or
          send mail itself (services/group_buy_capacity.py).
Related:  routers/group_buys.py::commit_to_group_buy (same lock + public gate)
History:  MEH-3592 (creation).
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.models import GroupBuy, GroupBuyCommit, GroupBuyWaitlist, User
from app.rate_limit import limiter
from app.routers.group_buys import _is_public
from app.schemas.schemas import (
    GroupBuyQuantityUpdate,
    GroupBuySettingsUpdate,
    GroupBuyWaitlistRequest,
)
from app.services import group_buy_capacity as capacity
from app.utils.clock import utc_now

router = APIRouter(prefix="/group-buys", tags=["group-buys"])

_NOT_FOUND = "קבוצת הרכישה לא נמצאה"
_NOT_OPEN = "קבוצת הרכישה אינה פתוחה להצטרפות"
_DEADLINE = "המועד האחרון חלף"


def _locked(db: Session, group_buy_id: UUID) -> GroupBuy:
    """The row under FOR UPDATE, like /commit (MEH-773)."""
    gb = (
        db.query(GroupBuy).filter(GroupBuy.id == group_buy_id).with_for_update().first()
    )
    if not gb:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return gb


def _refuse_unless_owner(db: Session, group_buy_id: UUID, user: User) -> None:
    """IDOR (security.md): the owning business, or an admin — checked before
    the row lock, and a hidden group answers 404 to a stranger (MEH-2484)."""
    peek = db.query(GroupBuy.producer_id).filter(GroupBuy.id == group_buy_id).first()
    if not peek:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if (user.producer_id and user.producer_id == peek[0]) or user.role == "admin":
        return
    if not _is_public(db, group_buy_id):
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    raise HTTPException(status_code=403, detail="אין הרשאה לשנות את קבוצת הרכישה הזאת")


def _cap_grew(old: Any, new: Any) -> bool:
    """None is no cap: removing one, or a bigger number, is more room."""
    if old is None:
        return False
    return new is None or new > old


def _room_grew(before: tuple[Any, Any, bool], gb: GroupBuy) -> bool:
    """Only a raised cap or reopened joins offers waitlist places (review: an
    unchanged save must not spend the next offer)."""
    old_people, old_units, was_closed = before
    reopened = was_closed and gb.joins_closed_at is None
    return (
        reopened
        or _cap_grew(old_people, gb.max_participants)
        or _cap_grew(old_units, gb.max_units)
    )


def _refuse_unless_running(gb: GroupBuy) -> None:
    if gb.status not in ("open", "funded"):
        raise HTTPException(status_code=400, detail=_NOT_OPEN)
    if gb.deadline < utc_now():
        raise HTTPException(status_code=400, detail=_DEADLINE)


@router.patch("/{group_buy_id}/commit", response_model=None)
@limiter.limit("20/minute")  # MEH-3022
def update_commit(  # noqa: PLR0913 — FastAPI-injected args
    request: Request,
    group_buy_id: UUID,
    data: GroupBuyQuantityUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    # Her commit first: a stranger learns nothing about a hidden group (review).
    if (
        not db.query(GroupBuyCommit.id)
        .filter(
            GroupBuyCommit.group_buy_id == group_buy_id,
            GroupBuyCommit.user_id == current_user.id,
        )
        .first()
    ):
        raise HTTPException(status_code=404, detail="לא נמצאה הצטרפות")
    gb = _locked(db, group_buy_id)
    _refuse_unless_running(gb)
    commit = (
        db.query(GroupBuyCommit)
        .filter(
            GroupBuyCommit.group_buy_id == gb.id,
            GroupBuyCommit.user_id == current_user.id,
        )
        .first()
    )
    if not commit:
        raise HTTPException(status_code=404, detail="לא נמצאה הצטרפות")
    delta = data.quantity - int(commit.quantity or 0)
    if delta > 0:
        people, units = capacity.counts(db, gb.id)
        capacity.refuse_unless_room(gb, people, units, 0, delta)
    commit.quantity = data.quantity  # type: ignore[assignment]
    db.flush()
    if delta < 0:
        capacity.offer_freed_place(db, gb, background_tasks)
    db.commit()
    return {"detail": "הכמות עודכנה", "quantity": data.quantity}


@router.post("/{group_buy_id}/waitlist", status_code=201, response_model=None)
@limiter.limit("20/minute")  # MEH-3022
def join_waitlist(  # noqa: PLR0913 — FastAPI-injected args
    request: Request,
    group_buy_id: UUID,
    data: GroupBuyWaitlistRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    gb = _locked(db, group_buy_id)
    if not _is_public(db, gb.id):  # type: ignore[arg-type]
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    _refuse_unless_running(gb)
    if gb.joins_closed_at is not None:
        raise HTTPException(status_code=400, detail=capacity.JOINS_CLOSED)
    people, units = capacity.counts(db, gb.id)
    left = capacity.units_left(gb, units)
    has_room = not capacity.is_full(gb, people, units) and (
        left is None or data.quantity <= left
    )
    if has_room:
        raise HTTPException(
            status_code=409, detail="יש מקום בקבוצה, אפשר להצטרף ישירות"
        )
    joined = (
        db.query(GroupBuyCommit.id)
        .filter(
            GroupBuyCommit.group_buy_id == gb.id,
            GroupBuyCommit.user_id == current_user.id,
        )
        .first()
    )
    if joined:
        raise HTTPException(status_code=400, detail="כבר הצטרפת לקבוצת רכישה זו")
    waiting = (
        db.query(GroupBuyWaitlist.id)
        .filter(
            GroupBuyWaitlist.group_buy_id == gb.id,
            GroupBuyWaitlist.user_id == current_user.id,
        )
        .first()
    )
    if waiting:
        raise HTTPException(status_code=400, detail="כבר נרשמת לרשימת ההמתנה")
    if capacity.waitlist_count(db, gb.id) >= capacity.WAITLIST_MAX:
        raise HTTPException(status_code=409, detail="רשימת ההמתנה מלאה")
    db.add(
        GroupBuyWaitlist(
            group_buy_id=gb.id, user_id=current_user.id, quantity=data.quantity
        )
    )
    db.commit()
    return {"detail": "נרשמת לרשימת ההמתנה"}


@router.delete("/{group_buy_id}/waitlist", response_model=None)
@limiter.limit("20/minute")  # MEH-3022
def leave_waitlist(
    request: Request,
    group_buy_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    deleted = (
        db.query(GroupBuyWaitlist)
        .filter(
            GroupBuyWaitlist.group_buy_id == group_buy_id,
            GroupBuyWaitlist.user_id == current_user.id,
        )
        .delete(synchronize_session=False)
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="לא נמצאה הרשמה לרשימת ההמתנה")
    db.commit()
    return {"detail": "יצאת מרשימת ההמתנה"}


@router.patch("/{group_buy_id}/settings", response_model=None)
@limiter.limit("30/minute")  # MEH-3022
def update_group_buy_settings(  # noqa: PLR0913 — FastAPI-injected args
    request: Request,
    group_buy_id: UUID,
    data: GroupBuySettingsUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _refuse_unless_owner(db, group_buy_id, current_user)
    gb = _locked(db, group_buy_id)
    _refuse_unless_running(gb)
    before = (gb.max_participants, gb.max_units, gb.joins_closed_at is not None)
    people, units = capacity.counts(db, gb.id)
    sent = data.model_fields_set
    # Eventbrite: capacity can change, never below what is already sold.
    if "max_participants" in sent:
        if data.max_participants is not None and data.max_participants < people:
            raise HTTPException(
                status_code=400, detail=f"כבר הצטרפו {people}, אי אפשר להגביל לפחות מזה"
            )
        if (
            data.max_participants is not None
            and data.max_participants < gb.min_participants
        ):
            raise HTTPException(
                status_code=400,
                detail=f"המקסימום לא יכול להיות קטן מהיעד ({gb.min_participants} משתתפים)",
            )
        gb.max_participants = data.max_participants  # type: ignore[assignment]
    if "max_units" in sent:
        if data.max_units is not None and data.max_units < units:
            raise HTTPException(
                status_code=400,
                detail=f"כבר הוזמנו {units} יחידות, אי אפשר להגביל לפחות מזה",
            )
        gb.max_units = data.max_units  # type: ignore[assignment]
    if data.joins_open is not None:
        gb.joins_closed_at = (
            None if data.joins_open else (gb.joins_closed_at or utc_now())
        )  # type: ignore[assignment]
    db.flush()
    if _room_grew(before, gb):
        capacity.offer_freed_place(db, gb, background_tasks)
    db.commit()
    return {
        "detail": "ההגדרות נשמרו",
        "max_participants": gb.max_participants,
        "max_units": gb.max_units,
        "joins_closed": gb.joins_closed_at is not None,
    }
