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
from app.schemas.group_buys_requests import PICKUP_ALREADY_ENDED, PICKUP_BEFORE_DEADLINE
from app.schemas.schemas import (
    GroupBuyQuantityUpdate,
    GroupBuySettingsUpdate,
    GroupBuyWaitlistRequest,
)
from app.services import group_buy_capacity as capacity
from app.services.group_buy_goal_flap import participant_emails
from app.services.group_buy_notifications import (
    send_allergens_changed,
    send_pickup_changed,
)
from app.services.group_buy_pickup_place import own_location  # MEH-3610
from app.services.group_buy_pickup_text import (
    is_delivery_only,
    note_lines,
    pickup_window_he,
)
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
    capacity.refuse_own_group(gb, current_user)  # MEH-3691
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
        raise HTTPException(
            status_code=400, detail="ההצטרפות לקבוצת הרכישה הזאת כבר קיימת"
        )
    waiting = (
        db.query(GroupBuyWaitlist.id)
        .filter(
            GroupBuyWaitlist.group_buy_id == gb.id,
            GroupBuyWaitlist.user_id == current_user.id,
        )
        .first()
    )
    if waiting:
        raise HTTPException(status_code=400, detail="ההרשמה לרשימת ההמתנה כבר קיימת")
    if capacity.waitlist_count(db, gb.id) >= capacity.WAITLIST_MAX:
        raise HTTPException(status_code=409, detail="רשימת ההמתנה מלאה")
    db.add(
        GroupBuyWaitlist(
            group_buy_id=gb.id, user_id=current_user.id, quantity=data.quantity
        )
    )
    db.commit()
    return {"detail": "ההרשמה לרשימת ההמתנה נקלטה"}


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


_PICKUP_FIELDS = {"pickup_starts_at", "pickup_ends_at"}
# MEH-3610: what a participant needs to collect safely can still be fixed once
# joining closed — the time, the branch, the allergens.
_AFTER_CLOSE_FIELDS = _PICKUP_FIELDS | {"pickup_location_id", "allergens"}


def _set_pickup_window(
    db: Session,
    gb: GroupBuy,
    data: GroupBuySettingsUpdate,
    background_tasks: BackgroundTasks,
) -> None:
    """MEH-3597: the window, never starting before joining closes. A change
    on a group people already joined emails each of them the new time."""
    if data.pickup_starts_at is not None and data.pickup_starts_at < gb.deadline:
        raise HTTPException(status_code=400, detail=PICKUP_BEFORE_DEADLINE)
    if (gb.pickup_starts_at, gb.pickup_ends_at) == (
        data.pickup_starts_at,
        data.pickup_ends_at,
    ):  # type: ignore[comparison-overlap]
        return
    # MEH-3735: a new end that already passed would let the business mark
    # «לא הגיע» before anyone could come. An unchanged window is let through above.
    if data.pickup_ends_at is not None and data.pickup_ends_at <= utc_now():
        raise HTTPException(status_code=400, detail=PICKUP_ALREADY_ENDED)
    first = gb.pickup_starts_at is None
    gb.pickup_starts_at = data.pickup_starts_at  # type: ignore[assignment]
    gb.pickup_ends_at = data.pickup_ends_at  # type: ignore[assignment]
    # MEH-3610: one reminder per pickup time, not per group — a moved pickup
    # is reminded again before its new date.
    gb.pickup_reminder_sent_at = None  # type: ignore[assignment]
    # A delivery-only group shows no pickup time, so nobody is told of one.
    if is_delivery_only(gb.pickup_note, gb.delivery_note, gb.fulfillment_note):  # type: ignore[arg-type]
        return
    emails = participant_emails(db, gb)
    if emails:
        background_tasks.add_task(
            send_pickup_changed,
            emails,
            str(gb.title),
            str(gb.id),
            pickup_window_he(gb.pickup_starts_at, gb.pickup_ends_at),  # type: ignore[arg-type]
            note_lines(gb.pickup_note, gb.delivery_note),  # type: ignore[arg-type]
            first=first,
            test_cause=bool(gb.producer and gb.producer.is_test),  # MEH-2952
        )


def _set_allergens_and_place(
    db: Session,
    gb: GroupBuy,
    data: GroupBuySettingsUpdate,
    background_tasks: BackgroundTasks,
) -> None:
    """MEH-3610: allergens and the pickup branch; an explicit null clears
    either, a field left out is unchanged. A real allergen change on a group
    people already joined emails each of them (safety: she joined on the old
    list)."""
    sent = data.model_fields_set
    if "allergens" in sent and (gb.allergens or None) != (data.allergens or None):
        gb.allergens = data.allergens  # type: ignore[assignment]
        emails = participant_emails(db, gb)
        if emails:
            background_tasks.add_task(
                send_allergens_changed,
                emails,
                str(gb.title),
                str(gb.id),
                test_cause=bool(gb.producer and gb.producer.is_test),  # MEH-2952
            )
    if "pickup_location_id" in sent:
        gb.pickup_location_id = own_location(  # type: ignore[assignment]
            db, gb.producer_id, data.pickup_location_id
        )


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
    sent = data.model_fields_set
    # MEH-3597: the pickup time can still change once joining has closed —
    # that is when a business most needs to move it. Everything else waits
    # for a running group.
    if not (sent <= _AFTER_CLOSE_FIELDS and gb.status in ("open", "funded")):
        _refuse_unless_running(gb)
    before = (gb.max_participants, gb.max_units, gb.joins_closed_at is not None)
    people, units = capacity.counts(db, gb.id)
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
    if "pickup_starts_at" in sent:  # MEH-3597: the schema sends both or neither
        _set_pickup_window(db, gb, data, background_tasks)
    _set_allergens_and_place(db, gb, data, background_tasks)
    if data.joins_open is not None:
        gb.joins_closed_at = (
            None if data.joins_open else (gb.joins_closed_at or utc_now())  # type: ignore[assignment]
        )
    db.flush()
    if _room_grew(before, gb):
        capacity.offer_freed_place(db, gb, background_tasks)
    db.commit()
    return {
        "detail": "ההגדרות נשמרו",
        "max_participants": gb.max_participants,
        "max_units": gb.max_units,
        "joins_closed": gb.joins_closed_at is not None,
        "pickup_starts_at": gb.pickup_starts_at,
        "pickup_ends_at": gb.pickup_ends_at,
        "allergens": gb.allergens,
        "pickup_location_id": gb.pickup_location_id,
    }
