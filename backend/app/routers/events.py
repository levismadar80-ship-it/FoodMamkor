"""Events feature — sits on top of producers.

GET  /events                     list events (public, filterable)
GET  /events/upcoming            next N upcoming events
GET  /events/{id}                event detail
POST /events                     create event (producer only)
PUT  /events/{id}                update (owner only)
DELETE /events/{id}              delete (owner only)
"""
from datetime import date, datetime, time
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_producer
from app.database import get_db
from app.models import Event, Producer, User
from app.services.sanitization import sanitize_text

router = APIRouter(tags=["events"])


VALID_CATEGORIES = {"סדנה", "סיור", "שוק", "קטיף", "טעימות", "אחר"}


# ============================================================
# Schemas
# ============================================================


class EventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    description: str | None = None
    event_date: date
    event_time: time | None = None
    location: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    image_url: str | None = None
    category: str = Field(..., min_length=1, max_length=30)
    price: int = 0
    max_participants: int | None = None
    registration_url: str | None = None

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v):
        return sanitize_text(v, max_length=2000)

    @field_validator("location")
    @classmethod
    def _sanitize_location(cls, v):
        return sanitize_text(v, max_length=200)


class EventUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    event_date: date | None = None
    event_time: time | None = None
    location: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    image_url: str | None = None
    category: str | None = None
    price: int | None = None
    max_participants: int | None = None
    registration_url: str | None = None
    is_active: bool | None = None

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v):
        return sanitize_text(v, max_length=2000)

    @field_validator("location")
    @classmethod
    def _sanitize_location(cls, v):
        return sanitize_text(v, max_length=200)


class EventOut(BaseModel):
    id: UUID
    producer_id: UUID
    producer_name: str | None = None
    title: str
    description: str | None = None
    event_date: date
    event_time: time | None = None
    location: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    image_url: str | None = None
    category: str
    price: int
    max_participants: int | None = None
    registration_url: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


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


class EventFilters(BaseModel):
    """MEH-447: query-param bag for GET /events. Used via
    Annotated[EventFilters, Depends()] so FastAPI exposes each field as
    an individual query parameter — preserving the pre-refactor OpenAPI
    schema verbatim while keeping list_events under PLR0913's 5-arg cap."""

    city: str | None = Field(default=None)
    category: str | None = Field(default=None)
    from_date: date | None = Field(default=None)
    to_date: date | None = Field(default=None)
    producer_id: UUID | None = Field(default=None)


@router.get("/events", response_model=list[EventOut])
def list_events(
    filters: Annotated[EventFilters, Depends()],
    db: Session = Depends(get_db),
):
    q = (
        db.query(Event)
        .options(joinedload(Event.producer))
        .filter(Event.is_active.is_(True))
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
        q = q.filter(Event.event_date >= date.today())
    if filters.to_date:
        q = q.filter(Event.event_date <= filters.to_date)

    events = q.order_by(Event.event_date.asc(), Event.event_time.asc()).all()
    return [_serialize(ev) for ev in events]


@router.get("/events/upcoming", response_model=list[EventOut])
def upcoming_events(
    limit: int = Query(3, ge=1, le=20),
    db: Session = Depends(get_db),
):
    events = (
        db.query(Event)
        .options(joinedload(Event.producer))
        .filter(Event.is_active.is_(True), Event.event_date >= date.today())
        .order_by(Event.event_date.asc(), Event.event_time.asc())
        .limit(limit)
        .all()
    )
    return [_serialize(ev) for ev in events]


@router.get("/events/{event_id}", response_model=EventOut)
def get_event(event_id: UUID, db: Session = Depends(get_db)):
    event = (
        db.query(Event)
        .options(joinedload(Event.producer))
        .filter(Event.id == event_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return _serialize(event)


@router.post("/events", response_model=EventOut, status_code=201)
def create_event(
    data: EventCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
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
        fire_alerts, db, user.producer_id, "new_event",
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
    if event.producer_id != user.producer_id:
        raise HTTPException(status_code=403, detail="Not the owner of this event")

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
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="אין הרשאה")
    db.delete(event)
    db.commit()
    return {"detail": "Event deleted"}
