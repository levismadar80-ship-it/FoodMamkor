"""Events feature — sits on top of producers.

GET  /events                     list events (public, filterable)
GET  /events/upcoming            next N upcoming events
GET  /events/{id}                event detail
POST /events                     create event (producer only)
PUT  /events/{id}                update (owner only)
DELETE /events/{id}              delete (owner only)

MEH-458: Pydantic schemas live in app.schemas.schemas per ADR-006 R1.
"""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from app.rate_limit import limiter
from sqlalchemy.orm import Session, joinedload

from app.auth import (
    get_current_user,
    get_current_user_optional,
    require_producer,
    require_verified_producer,
)
from app.database import get_db
from app.models import Event, Producer, User
from app.schemas.schemas import EventCreate, EventFilters, EventOut, EventUpdate
from app.utils.clock import israel_today

router = APIRouter(tags=["events"])


# MEH-1657: locked axis — an Event is a ONE-TIME thing on a date; a guided
# activity people sign up for is an Experience. The "workshop" and "tour"
# categories were removed here (6 -> 4) because they name exactly the Experience
# side of that axis, and offering them as Event categories is what made owners
# guess which surface to publish on. The Experience category set is separate
# (frontend/lib/event-categories.js EXPERIENCE_CATEGORIES) and still carries
# both words — deliberately. Hebrew wire values are intentionally absent from
# this comment so the absence assertion in the card greps clean.
VALID_CATEGORIES = {"שוק", "קטיף", "טעימות", "אחר"}


def _serialize(event: Event) -> EventOut:
    return EventOut(
        id=event.id,
        producer_id=event.producer_id,
        producer_name=event.producer.name if event.producer else None,
        title=event.title,
        description=event.description,
        event_date=event.event_date,
        event_time=event.event_time,
        location=event.location,
        city=event.city,
        lat=event.lat,
        lng=event.lng,
        image_url=event.image_url,
        category=event.category,
        price=int(event.price or 0),
        max_participants=event.max_participants,
        registration_url=event.registration_url,
        is_active=bool(event.is_active),
        created_at=event.created_at or datetime.utcnow(),
    )


# ============================================================
# Routes
# ============================================================


@router.get("/events", response_model=list[EventOut])
def list_events(
    filters: Annotated[EventFilters, Depends()],
    viewer: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    q = (
        db.query(Event)
        .options(joinedload(Event.producer))
        .filter(Event.is_active.is_(True))
    )
    # MEH-1161: the public feed only lists events of approved producers — a
    # pending producer's event (business name included) must not go public
    # before the business is approved. Bypass: an admin, or the owner viewing
    # their own producer page (?producer_id=<own>), still sees pending events.
    is_admin = getattr(viewer, "role", None) == "admin"
    is_owner_view = (
        viewer is not None
        and filters.producer_id is not None
        and viewer.producer_id == filters.producer_id
    )
    if not (is_admin or is_owner_view):
        q = q.join(Producer, Event.producer_id == Producer.id).filter(
            Producer.status == "approved"
        )
    if filters.producer_id:
        q = q.filter(Event.producer_id == filters.producer_id)
    if filters.city:
        q = q.filter(Event.city == filters.city)
    if filters.category:
        q = q.filter(Event.category == filters.category)
    if filters.from_date:
        q = q.filter(Event.event_date >= filters.from_date)
    else:
        # Default: only show events from today onward
        # MEH-1883: `event_date` is a plain Date, so "upcoming" is a calendar
        # question and the calendar that matters is Israel's. Under UTC an
        # event happening TODAY dropped out of the feed at 21:00 the evening
        # before, because the server had already rolled to the next day.
        q = q.filter(Event.event_date >= israel_today())
    if filters.to_date:
        q = q.filter(Event.event_date <= filters.to_date)

    events = q.order_by(Event.event_date.asc(), Event.event_time.asc()).all()
    return [_serialize(ev) for ev in events]


@router.get("/events/upcoming", response_model=list[EventOut])
@limiter.limit("120/minute")
def upcoming_events(
    request: Request,
    limit: int = Query(3, ge=1, le=20),
    db: Session = Depends(get_db),
):
    events = (
        db.query(Event)
        .options(joinedload(Event.producer))
        # MEH-1161: home-page cards are pure-public — approved producers only.
        .join(Producer, Event.producer_id == Producer.id)
        .filter(
            Event.is_active.is_(True),
            Event.event_date >= israel_today(),
            Producer.status == "approved",
        )
        .order_by(Event.event_date.asc(), Event.event_time.asc())
        .limit(limit)
        .all()
    )
    return [_serialize(ev) for ev in events]


# MEH-1405: owner-scoped list so a producer can manage her own events from the
# dashboard — includes inactive (canceled) events, unlike the public feed which
# filters is_active. Mirrors GET /experiences/mine (experiences.py:141). Declared
# BEFORE /events/{event_id} so "mine" isn't captured as a UUID path param.
@router.get("/events/mine", response_model=list[EventOut])
def list_my_events(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    events = (
        db.query(Event)
        .options(joinedload(Event.producer))
        .filter(Event.producer_id == user.producer_id)
        .order_by(Event.event_date.desc(), Event.event_time.desc())
        .all()
    )
    return [_serialize(ev) for ev in events]


@router.get("/events/{event_id}", response_model=EventOut)
def get_event(
    event_id: UUID,
    viewer: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    event = (
        db.query(Event)
        .options(joinedload(Event.producer))
        .filter(Event.id == event_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    # MEH-1161: a pending/rejected producer's event is not consented-to-public.
    # Strangers get 404 (not 403) so the UUID can't be used to enumerate queue
    # state — REUSES: backend/app/routers/producers.py:210-217 (MEH-254) and
    # the MEH-1001 cross-owner convention. Owner + admin still see it.
    producer_status = event.producer.status if event.producer else None
    if producer_status != "approved":
        is_admin = getattr(viewer, "role", None) == "admin"
        is_owner = viewer is not None and viewer.producer_id == event.producer_id
        if not (is_admin or is_owner):
            raise HTTPException(status_code=404, detail="Event not found")
    return _serialize(event)


@router.post("/events", response_model=EventOut, status_code=201)
def create_event(
    data: EventCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_verified_producer),
    db: Session = Depends(get_db),
):
    if data.category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"קטגוריה לא חוקית. אפשרויות: {', '.join(sorted(VALID_CATEGORIES))}",
        )
    if not user.producer_id:
        raise HTTPException(status_code=403, detail="Producer account required")

    event = Event(
        producer_id=user.producer_id,
        title=data.title,
        description=data.description,
        event_date=data.event_date,
        event_time=data.event_time,
        location=data.location,
        city=data.city,
        lat=data.lat,
        lng=data.lng,
        image_url=data.image_url,
        category=data.category,
        price=data.price or 0,
        max_participants=data.max_participants,
        registration_url=data.registration_url,
        is_active=True,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    # Reload with producer relation for serialization
    event = (
        db.query(Event)
        .options(joinedload(Event.producer))
        .filter(Event.id == event.id)
        .first()
    )

    # MEH-54: notify favoriting users who opted in for new-event alerts
    from app.routers.alerts import AlertContent, fire_alerts

    producer_name = event.producer.name if event.producer else ""
    background_tasks.add_task(
        fire_alerts,
        db,
        user.producer_id,
        "new_event",
        AlertContent(
            title=f"🎉 אירוע חדש: {data.title}",
            body=f"{producer_name} — {data.city or ''}\n{data.event_date}",
            url=f"/events/{event.id}",
        ),
    )

    return _serialize(event)


@router.put("/events/{event_id}", response_model=EventOut)
def update_event(
    event_id: UUID,
    data: EventUpdate,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    # MEH-1001: 404 (not 403) on cross-owner access so a stranger can't
    # confirm another producer's event exists. Stays owner-only — admin
    # management lives on admin endpoints (REUSES producer_recipes.py:203-206).
    if event.producer_id != user.producer_id:
        raise HTTPException(status_code=404, detail="Event not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "category" and value not in VALID_CATEGORIES:
            raise HTTPException(status_code=400, detail="קטגוריה לא תקינה")
        setattr(event, field, value)

    db.commit()
    db.refresh(event)
    event = (
        db.query(Event)
        .options(joinedload(Event.producer))
        .filter(Event.id == event.id)
        .first()
    )
    return _serialize(event)


@router.delete("/events/{event_id}")
def delete_event(
    event_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    is_owner = user.producer_id == event.producer_id
    is_admin = getattr(user, "role", None) == "admin"
    # MEH-1001: a stranger (non-owner, non-admin) gets 404 (not 403) so the
    # event's existence isn't leaked. Admin-override preserved (admin → 200).
    if not (is_owner or is_admin):
        raise HTTPException(status_code=404, detail="Event not found")
    db.delete(event)
    db.commit()
    return {"detail": "Event deleted"}
