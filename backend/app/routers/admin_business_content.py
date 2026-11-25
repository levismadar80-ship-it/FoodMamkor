# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3873 PR)
"""
Module:   admin_business_content
Purpose:  Admin creates and edits a business's events and experiences on its
          behalf, with the business's written consent confirmed on every save
          (the box on the form → `owner_consent: true`).
Touches:  events, experiences (through the owner's own write functions);
          the admin audit log (the consent is recorded on the audit row).
Does NOT: Hold any rule about what a valid event or experience is. Every check
          (category, past date, sign-up method, caps, paid sign-up, image
          ownership, moderation) lives in routers/events.py create_event_for /
          update_event_row and routers/experiences.py submit_experience_for /
          update_experience_row, which the owner's routes call too, so the
          admin and the owner can never disagree. Delete stays on the owner
          routes, which already let an admin through (events.py delete_event,
          experiences.py delete_experience).
Related:  routers/admin_producer_locations.py (the same on-behalf shape for
          locations), services/admin_audit.py note(), schemas/admin_on_behalf.py.
History:  MEH-3873 (creation — 25/11, משק פורר: a business built in the admin,
          with no owner account yet, could not get its pick-your-own day or
          its Thursday market on the page).
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload

from app.auth import require_admin
from app.database import get_db
from app.models import Event, Producer, User
from app.rate_limit import limiter
from app.routers.events import _serialize_many, create_event_for, update_event_row
from app.routers.experiences import (
    _experience_for_edit,
    submit_experience_for,
    update_experience_row,
)
from app.schemas.admin_on_behalf import (
    AdminEventCreate,
    AdminEventUpdate,
    AdminExperienceCreate,
    AdminExperienceUpdate,
    without_consent,
)
from app.schemas.schemas import (
    EventCreate,
    EventOut,
    EventUpdate,
    ExperienceCreate,
    ExperienceDetailOut,
    ExperienceUpdate,
)
from app.services import admin_audit

router = APIRouter(tags=["admin-business-content"])

_NO_BUSINESS = "בית העסק לא נמצא"
_NO_EVENT = "האירוע לא נמצא"
_NO_EXPERIENCE = "החוויה לא נמצאה"
# An experience is keyed on a person (experiences.host_user_id, NOT NULL), so a
# business with no owner account cannot host one yet. An event is keyed on the
# business and has no such limit.
_NO_OWNER_FOR_EXPERIENCE = (
    "לבית העסק עוד אין חשבון בעלים, ולכן אי אפשר להוסיף לו חוויה. אפשר להוסיף אירוע."
)


def _business(db: Session, producer_id: UUID) -> Producer:
    producer = db.get(Producer, producer_id)
    if producer is None:
        raise HTTPException(status_code=404, detail=_NO_BUSINESS)
    return producer


def _record_consent(admin: User) -> None:
    """The audit row already says who, when, which route and which target;
    this adds that the business agreed (MEH-3306 keeps only bools/codes)."""
    admin_audit.note(admin, after={"owner_consent": True})


def _owner_account(db: Session, producer_id: UUID) -> User | None:
    """`users.producer_id` means «owner» (models/producer_staff.py docstring).
    The oldest account wins when there are several, so the host is stable."""
    return (
        db.query(User)
        .filter(User.producer_id == producer_id)
        .order_by(User.created_at.asc())
        .first()
    )


# ---------- Events ----------


@router.get("/admin/producers/{producer_id}/events", response_model=list[EventOut])
def admin_list_business_events(
    producer_id: UUID,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[EventOut]:
    """Every event of the business, past and cancelled included, newest
    first — the list the owner sees on her dashboard (events.py list_my_events)."""
    _business(db, producer_id)
    events = (
        db.query(Event)
        .options(joinedload(Event.producer))
        .filter(Event.producer_id == producer_id)
        .order_by(Event.event_date.desc(), Event.event_time.desc())
        .all()
    )
    return _serialize_many(db, events)


@router.post(
    "/admin/producers/{producer_id}/events",
    response_model=EventOut,
    status_code=201,
)
@limiter.limit("120/hour")
def admin_create_business_event(  # noqa: PLR0913 — all args are FastAPI-injected
    request: Request,  # required by slowapi
    producer_id: UUID,
    data: AdminEventCreate,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> EventOut:
    _business(db, producer_id)
    out = create_event_for(
        db,
        producer_id,
        EventCreate.model_validate(without_consent(data)),
        actor=admin,
        background_tasks=background_tasks,
    )
    _record_consent(admin)
    return out


@router.put("/admin/events/{event_id}", response_model=EventOut)
@limiter.limit("120/hour")
def admin_update_business_event(  # noqa: PLR0913 — all args are FastAPI-injected
    request: Request,  # required by slowapi
    event_id: UUID,
    data: AdminEventUpdate,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> EventOut:
    event = db.query(Event).filter(Event.id == event_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail=_NO_EVENT)
    out = update_event_row(
        db,
        event,
        EventUpdate.model_validate(without_consent(data)),
        actor=admin,
        background_tasks=background_tasks,
    )
    _record_consent(admin)
    return out


# ---------- Experiences ----------


@router.post(
    "/admin/producers/{producer_id}/experiences",
    response_model=ExperienceDetailOut,
    status_code=201,
)
@limiter.limit("60/hour")
def admin_create_business_experience(
    request: Request,  # required by slowapi
    producer_id: UUID,
    data: AdminExperienceCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _business(db, producer_id)
    host = _owner_account(db, producer_id)
    if host is None:
        raise HTTPException(status_code=409, detail=_NO_OWNER_FOR_EXPERIENCE)
    out = submit_experience_for(
        db, host, ExperienceCreate.model_validate(without_consent(data)), actor=admin
    )
    _record_consent(admin)
    return out


@router.put("/admin/experiences/{experience_id}", response_model=ExperienceDetailOut)
@limiter.limit("120/hour")
def admin_update_business_experience(  # noqa: PLR0913 — all args are FastAPI-injected
    request: Request,  # required by slowapi
    experience_id: UUID,
    data: AdminExperienceUpdate,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    owner_shape = ExperienceUpdate.model_validate(without_consent(data))
    ex = _experience_for_edit(db, experience_id, owner_shape)
    if ex is None:
        raise HTTPException(status_code=404, detail=_NO_EXPERIENCE)
    out = update_experience_row(
        db, ex, owner_shape, actor=admin, background_tasks=background_tasks
    )
    _record_consent(admin)
    return out
