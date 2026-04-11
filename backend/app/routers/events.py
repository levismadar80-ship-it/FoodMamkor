"""
Public + authenticated routes for Events & Experiences.

  GET  /events                 — list published (approved) events + filters
  GET  /events/mine            — current user's submissions (any status)
  GET  /events/{id}            — single event (published, or owned by caller)
  POST /events                 — submit new event → pending + Claude pre-moderation
  PUT  /events/{id}            — edit own event (resets to pending)
  DELETE /events/{id}          — delete own event
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, get_current_user_optional
from app.database import get_db
from app.models import Event, Producer, User
from app.schemas.schemas import EventCreate, EventOut, EventUpdate
from app.services.event_moderation import moderate_event
from app.services.event_notifications import (
    notify_admin_new_event,
    notify_followers_new_event,
)

router = APIRouter(prefix="/events", tags=["events"])


def _serialize(event: Event) -> dict:
    """Build EventOut payload with computed `spots_left`."""
    spots_left = None
    if event.max_participants is not None:
        spots_left = max(0, event.max_participants - (event.participants_count or 0))
    return {
        "id": event.id,
        "title": event.title,
        "description": event.description,
        "images": event.images or [],
        "category": event.category,
        "type": event.type,
        "host_type": event.host_type,
        "location_type": event.location_type,
        "host_user_id": event.host_user_id,
        "producer_id": event.producer_id,
        "starts_at": event.starts_at,
        "ends_at": event.ends_at,
        "is_recurring": event.is_recurring or False,
        "recurring_schedule": event.recurring_schedule,
        "city": event.city,
        "address": event.address,
        "lat": event.lat,
        "lng": event.lng,
        "max_participants": event.max_participants,
        "participants_count": event.participants_count or 0,
        "spots_left": spots_left,
        "price_per_person": event.price_per_person,
        "requirements": event.requirements,
        "status": event.status,
        "rejection_reason": event.rejection_reason,
        "admin_feedback": event.admin_feedback,
        "moderation_flags": event.moderation_flags,
        "host": {"id": event.host.id, "name": event.host.name} if event.host else None,
        "producer": (
            {"id": event.producer.id, "name": event.producer.name, "slug": event.producer.slug}
            if event.producer
            else None
        ),
        "created_at": event.created_at,
    }


@router.get("", response_model=list[EventOut])
def list_events(
    type: str | None = Query(None, pattern="^(event|experience)$"),
    category: str | None = None,
    city: str | None = None,
    db: Session = Depends(get_db),
):
    """Public listing — only approved, upcoming events."""
    q = (
        db.query(Event)
        .options(joinedload(Event.host), joinedload(Event.producer))
        .filter(Event.status == "approved")
    )
    if type:
        q = q.filter(Event.type == type)
    if category:
        q = q.filter(func.lower(Event.category) == category.lower())
    if city:
        q = q.filter(func.lower(Event.city) == city.lower())

    events = q.order_by(Event.starts_at.asc()).all()
    return [_serialize(e) for e in events]


@router.get("/mine", response_model=list[EventOut])
def list_my_events(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    events = (
        db.query(Event)
        .options(joinedload(Event.host), joinedload(Event.producer))
        .filter(Event.host_user_id == user.id)
        .order_by(Event.created_at.desc())
        .all()
    )
    return [_serialize(e) for e in events]


@router.get("/{event_id}", response_model=EventOut)
def get_event(
    event_id: UUID,
    user: User | None = Depends(get_current_user_optional),
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

    # Only owner or admin can see non-approved events
    if event.status != "approved":
        is_owner = user and user.id == event.host_user_id
        is_admin = user and user.role == "admin"
        if not (is_owner or is_admin):
            raise HTTPException(status_code=404, detail="Event not found")

    return _serialize(event)


@router.post("", response_model=EventOut, status_code=201)
def submit_event(
    data: EventCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submit a new event or experience.
    Flow:
      1. Determine host_type from user role (producer → producer, else community)
      2. Run Claude pre-moderation (non-blocking)
      3. Save with status=pending
      4. Email admin
    """
    # Decide host_type based on user role.
    # Approved producers submit "events" by default.
    producer_id = None
    host_type = "community"
    if user.role == "producer" and user.producer_id:
        producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
        if producer and producer.status == "approved":
            host_type = "producer"
            producer_id = producer.id

    moderation = moderate_event(data.model_dump(mode="json"))

    event = Event(
        title=data.title.strip(),
        description=data.description.strip(),
        images=data.images or [],
        category=data.category,
        type=data.type,
        host_type=host_type,
        location_type=data.location_type,
        host_user_id=user.id,
        producer_id=producer_id,
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        is_recurring=data.is_recurring,
        recurring_schedule=data.recurring_schedule,
        city=data.city,
        address=data.address,
        lat=data.lat,
        lng=data.lng,
        max_participants=data.max_participants,
        price_per_person=data.price_per_person,
        requirements=data.requirements,
        status="pending",
        moderation_flags=moderation,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    # Reload with joins so _serialize has host/producer populated
    event = (
        db.query(Event)
        .options(joinedload(Event.host), joinedload(Event.producer))
        .filter(Event.id == event.id)
        .first()
    )

    # Best-effort notifications
    notify_admin_new_event(event.title, user.name, event.city)
    notify_followers_new_event(user.name, event.title)

    return _serialize(event)


@router.put("/{event_id}", response_model=EventOut)
def update_event(
    event_id: UUID,
    data: EventUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.host_user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your event")

    payload = data.model_dump(exclude_unset=True)
    for field, value in payload.items():
        setattr(event, field, value)

    # Any edit sends the event back to pending moderation
    if event.status in ("rejected", "changes_requested", "approved"):
        event.status = "pending"
        event.admin_feedback = None
        event.rejection_reason = None
        # Re-run Claude pre-moderation
        event.moderation_flags = moderate_event({
            "title": event.title,
            "description": event.description,
            "type": event.type,
            "category": event.category,
            "city": event.city,
            "address": event.address,
            "price_per_person": str(event.price_per_person) if event.price_per_person else None,
            "max_participants": event.max_participants,
            "requirements": event.requirements,
        })
        notify_admin_new_event(event.title, user.name, event.city)

    db.commit()
    db.refresh(event)

    event = (
        db.query(Event)
        .options(joinedload(Event.host), joinedload(Event.producer))
        .filter(Event.id == event.id)
        .first()
    )
    return _serialize(event)


@router.delete("/{event_id}")
def delete_event(
    event_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.host_user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not your event")
    db.delete(event)
    db.commit()
    return {"detail": "Event deleted"}
