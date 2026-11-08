"""
Admin moderation routes for experiences (community workshops).

  GET  /admin/experiences                          — list by status
  POST /admin/experiences/{id}/approve             — publish
  POST /admin/experiences/{id}/request-changes     — send back to host with feedback
  POST /admin/experiences/{id}/reject              — reject with reason

Every state-changing action sends a best-effort email to the host
(see app/services/experience_notifications.py). Emails are fail-open:
if RESEND_API_KEY isn't configured the log line is still written but the router
always returns 200 so the admin UI can move on.
"""

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth import require_admin
from app.database import get_db
from app.models import Experience, User
from app.routers.experiences import _serialize_detail
from app.services import indexnow  # MEH-2852
from app.services.registrations import registered_counts
from app.schemas.schemas import ExperienceDetailOut, ExperienceModerationAction
from app.services.experience_notifications import (
    notify_host_approved,
    notify_host_changes_requested,
    notify_host_rejected,
)

router = APIRouter(prefix="/admin/experiences", tags=["admin-experiences"])


def _host_business(ex: Experience):
    """MEH-2852: the business behind the host — public only when approved
    (experiences._publicly_visible_query)."""
    return ex.host.producer if ex.host else None


def _ping_if_public(background_tasks: BackgroundTasks, ex: Experience) -> None:
    if indexnow.is_public_owner(_host_business(ex)):
        indexnow.schedule(background_tasks, indexnow.experience_urls(ex.id))


# ---------- List ----------


@router.get("", response_model=list[ExperienceDetailOut])
def admin_list_experiences(
    status: str | None = Query(
        None,
        pattern="^(pending|approved|rejected|changes_requested|all)$",
    ),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Experience).options(
        joinedload(Experience.host).joinedload(User.producer)
    )
    if status and status != "all":
        q = q.filter(Experience.status == status)
    rows = q.order_by(Experience.created_at.desc()).all()
    counts = registered_counts(db, experience_ids=[ex.id for ex in rows])
    return [_serialize_detail(ex, counts.get(ex.id, 0)) for ex in rows]


# ---------- Approve ----------


@router.post("/{experience_id}/approve", response_model=ExperienceDetailOut)
def approve_experience(
    experience_id: UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ex = (
        db.query(Experience)
        .options(joinedload(Experience.host).joinedload(User.producer))
        .filter(Experience.id == experience_id)
        .first()
    )
    if not ex:
        raise HTTPException(status_code=404, detail="Experience not found")

    ex.status = "approved"
    ex.admin_feedback = None
    ex.rejection_reason = None
    db.commit()
    db.refresh(ex)
    _ping_if_public(background_tasks, ex)  # MEH-2852: the page appeared

    if ex.host and ex.host.email:
        notify_host_approved(ex.host.email, ex.title, str(ex.id))

    return _serialize_detail(ex)


# ---------- Request changes ----------


@router.post(
    "/{experience_id}/request-changes",
    response_model=ExperienceDetailOut,
)
def request_changes(
    experience_id: UUID,
    action: ExperienceModerationAction,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not action.feedback:
        raise HTTPException(status_code=400, detail="feedback is required")

    ex = (
        db.query(Experience)
        .options(joinedload(Experience.host).joinedload(User.producer))
        .filter(Experience.id == experience_id)
        .first()
    )
    if not ex:
        raise HTTPException(status_code=404, detail="Experience not found")

    was_live = ex.status == "approved"  # MEH-2852
    ex.status = "changes_requested"
    ex.admin_feedback = action.feedback
    db.commit()
    db.refresh(ex)
    if was_live:  # MEH-2852: the live page just went away
        _ping_if_public(background_tasks, ex)

    if ex.host and ex.host.email:
        notify_host_changes_requested(
            ex.host.email, ex.title, str(ex.id), action.feedback
        )

    return _serialize_detail(ex)


# ---------- Reject ----------


@router.post("/{experience_id}/reject", response_model=ExperienceDetailOut)
def reject_experience(
    experience_id: UUID,
    action: ExperienceModerationAction,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ex = (
        db.query(Experience)
        .options(joinedload(Experience.host).joinedload(User.producer))
        .filter(Experience.id == experience_id)
        .first()
    )
    if not ex:
        raise HTTPException(status_code=404, detail="Experience not found")

    was_live = ex.status == "approved"  # MEH-2852
    ex.status = "rejected"
    ex.rejection_reason = action.feedback or ""
    db.commit()
    db.refresh(ex)
    if was_live:  # MEH-2852: the live page just went away
        _ping_if_public(background_tasks, ex)

    if ex.host and ex.host.email:
        notify_host_rejected(ex.host.email, ex.title, action.feedback or "")

    return _serialize_detail(ex)
