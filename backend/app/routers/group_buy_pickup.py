"""
Module:   group_buy_pickup
Purpose:  MEH-3735 — the business's pickup list for a group buy (codes and
          quantities only) and its «נמסר» / «לא הגיע» marks; the admin release
          of a group-buy no-show block.
Touches:  group_buy_commits (handed_at, no_show_at), users
          (group_buy_block_cleared_at); EMAIL to the participant on a no-show.
Does NOT: hand out the code (commit_to_group_buy in group_buys.py does) or
          refuse a blocked join (also there, via refuse_if_blocked). The
          rules themselves live in services/group_buy_no_show.py.
Related:  routers/rescue.py::mark_no_show (the model) · routers/group_buys.py
History:  MEH-3735 (creation)
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.database import get_db
from app.models.models import GroupBuyCommit, User
from app.rate_limit import limiter
from app.schemas.group_buy_pickup import (
    GroupBuyBlockStateOut,
    GroupBuyPickupOut,
    GroupBuyPickupsOut,
)
from app.services import group_buy_no_show as no_show
from app.sentry import capture_background_exception

router = APIRouter(tags=["group-buys"])
admin_router = APIRouter(prefix="/admin/group-buys", tags=["admin-group-buys"])


@router.get(
    "/producers/me/group-buys/{group_buy_id}/pickups",
    response_model=GroupBuyPickupsOut,
)
@limiter.limit("60/minute")
def list_pickups(
    request: Request,
    group_buy_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """Codes and quantities of one of the business's group buys."""
    gb = no_show.group_or_404(db, group_buy_id)
    no_show.require_owner(current_user, gb)
    rows = (
        db.query(GroupBuyCommit)
        .filter(GroupBuyCommit.group_buy_id == gb.id)
        .order_by(GroupBuyCommit.pickup_code, GroupBuyCommit.id)
        .all()
    )
    return {
        "can_mark": no_show.can_mark(gb),
        "mark_state": no_show.mark_state(gb),
        "pickup_ended_at": gb.pickup_ends_at,
        "pickups": rows,
    }


@router.post(
    "/group-buys/{group_buy_id}/commits/{commit_id}/handed",
    response_model=GroupBuyPickupOut,
)
@limiter.limit("60/minute")
def mark_group_buy_handed(
    request: Request,
    group_buy_id: UUID,
    commit_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    return no_show.mark(
        db,
        user=current_user,
        group_buy_id=group_buy_id,
        commit_id=commit_id,
        outcome="handed",
    )


@router.post(
    "/group-buys/{group_buy_id}/commits/{commit_id}/no-show",
    response_model=GroupBuyPickupOut,
)
@limiter.limit("60/minute")
def mark_group_buy_no_show(  # noqa: PLR0913 — FastAPI-injected
    request: Request,
    group_buy_id: UUID,
    commit_id: UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """Only after the pickup ended, once per commit; mails the participant."""
    commit = no_show.mark(
        db,
        user=current_user,
        group_buy_id=group_buy_id,
        commit_id=commit_id,
        outcome="no_show",
    )
    try:  # the mark is committed; a mail-side failure must not 500 it
        no_show.queue_group_buy_no_show_email(db, background_tasks, commit)
    except Exception as exc:  # noqa: BLE001 — fail-open, as rescue's
        capture_background_exception(exc, task="group_buy_no_show_email")
    return commit


@admin_router.post("/users/{user_id}/clear-block", response_model=GroupBuyBlockStateOut)
@limiter.limit("30/minute")
def clear_group_buy_block(
    request: Request,
    user_id: UUID,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Any:
    """Release a group-buy no-show block. The marks stay; they stop counting."""
    return no_show.release_group_buy_block(db, user_id)
