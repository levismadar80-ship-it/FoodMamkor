"""
Admin moderation routes for Events & Experiences.

  GET  /admin/events                   — list by status (pending/approved/rejected/changes_requested/all)
  POST /admin/events/{id}/approve      — publish
  POST /admin/events/{id}/request-changes — return to host with feedback
  POST /admin/events/{id}/reject       — reject with reason
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth import require_admin
from app.database import get_db
from app.models import Event, User
from app.routers.events import _serialize
from app.schemas.schemas import EventModerationAction, EventOut
from app.services.event_notifications import (
    notify_host_approved,
    notify_host_changes_requested,
    notify_host_rejected,
)

router = APIRouter(prefix="/admin/events", tags=["admin-events"])


@router.get("", response_model=list[EventOut])
def admin_list_events(
    status: str | None = Query(
        None, pattern="^(pending|approved|rejected|changes_requested|all)$"
    ),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Event).options(joinedload(Event.host), joinedload(Event.producer))
    if status and status != "all":
        q = q.filter(Event.status == status)
    events = q.order_by(Event.created_at.desc()).all()
    return [_serialize(e) for e in events]


@router.post("/{event_id}/approve", response_model=EventOut)
def approve_event(
    event_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    event = (
        db.query(Event)
        .options(joinedload(Event.host), joinedload(Event.producer))
        .filter(Event.id == event_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    event.status = "approved"
    event.rejection_reason = None
    event.admin_feedback = None
    db.commit()
    db.refresh(event)

    if event.host and event.host.email:
        notify_host_approved(event.host.email, event.title, str(event.id))

    return _serialize(event)


@router.post("/{event_id}/request-changes", response_model=EventOut)
def request_changes(
    event_id: UUID,
    action: EventModerationAction,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    event = (
        db.query(Event)
        .options(joinedload(Event.host), joinedload(Event.producer))
        .filter(Event.id == event_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not action.feedback:
        raise HTTPException(status_code=400, detail="feedback is required")

    event.status = "changes_requested"
    event.admin_feedback = action.feedback
    db.commit()
    db.refresh(event)

    if event.host and event.host.email:
        notify_host_changes_requested(
            event.host.email, event.title, str(event.id), action.feedback
        )

    return _serialize(event)


@router.post("/{event_id}/reject", response_model=EventOut)
def reject_event(
    event_id: UUID,
    action: EventModerationAction,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    event = (
        db.query(Event)
        .options(joinedload(Event.host), joinedload(Event.producer))
        .filter(Event.id == event_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    event.status = "rejected"
    event.rejection_reason = action.feedback or ""
    db.commit()
    db.refresh(event)

    if event.host and event.host.email:
        notify_host_rejected(
            event.host.email, event.title, action.feedback or ""
        )

    return _serialize(event)
