"""MEH-2763 — on-site sign-ups for events and experiences («איך נרשמים?» =
טופס הרשמה באתר).

POST /events/{id}/registrations            visitor signs up (no account)
POST /experiences/{id}/registrations       visitor signs up (no account)
GET  /events/{id}/registrations            the owner's list (owner / admin)
GET  /experiences/{id}/registrations       the host's list (host / admin)
GET  /registrations/{token}                what the cancel page shows
POST /registrations/{token}/cancel         visitor cancels from her email

Rules:
  - Sign-up is open only while the item is public, upcoming, active, and its
    owner picked registration_method = "site_form".
  - Capacity is checked under a row lock on the item, so two last-seat
    sign-ups can't both land (the group_buys MEH-773 pattern).
  - The same email signing up twice to the same item is answered with the
    same 201 and creates / sends nothing — no new copy, and nothing to learn
    about who else signed up.
  - Registrant PII is returned only to the owner or an admin (IDOR rule);
    the visitor's only credential is the cancel token in her email.
  - Emails are queued after the commit, as plain values (rescue.py MEH-2715).
"""

from __future__ import annotations

from datetime import date, time
from typing import Any
import secrets
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import Event, Experience, Producer, Registration, User
from app.rate_limit import limiter
from app.services import billing_ledger  # MEH-3179
from app.services.producer_listing import is_live_owner_row  # MEH-2952
from app.routers.experiences import _publicly_visible_query
from app.schemas.schemas import (
    RegistrationCancelInfoOut,
    RegistrationCreate,
    RegistrationCreatedOut,
    RegistrationOwnerOut,
)
from app.services.experience_notifications import host_test_cause  # MEH-2952
from app.services.registration_emails import (
    OwnerCancelEmail,
    OwnerNewEmail,
    VisitorEmail,
    send_owner_cancellation,
    send_owner_new_registration,
    send_visitor_confirmation,
)
from app.services.registrations import registered_counts
from app.utils.clock import israel_now, israel_today, utc_now

router = APIRouter(tags=["registrations"])

_CLOSED = {"code": "registration_closed", "message": "ההרשמה סגורה"}
_FULL = {"code": "registration_full", "message": "אין יותר מקומות"}


# ---------- item lookups ----------


def _has_started(day: date, at: time | None) -> bool:
    """MEH-3288: past day, or today at/after its start time (Israel clock).

    No start time = the whole day stays open, as before."""
    today = israel_today()
    if day != today:
        return day < today
    return at is not None and israel_now().time() >= at


def _event_for_signup(db: Session, event_id: UUID) -> Event:
    """The event, row-locked, or 404 if a stranger could not see it."""
    event = db.query(Event).filter(Event.id == event_id).with_for_update().first()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    producer = db.get(Producer, event.producer_id)
    # MEH-2952: a seeded test row's event takes no real sign-ups either.
    if not is_live_owner_row(producer):
        raise HTTPException(status_code=404, detail="Event not found")
    if not event.is_active or _has_started(event.event_date, event.event_time):  # type: ignore[arg-type]
        raise HTTPException(status_code=409, detail=_CLOSED)
    if event.registration_method != "site_form":
        raise HTTPException(status_code=409, detail=_CLOSED)
    return event


def _experience_for_signup(db: Session, experience_id: UUID) -> Experience:
    # Visible (approved host + business) — past / cancelled are 409 below,
    # like events, not 404: the detail page still shows them by link.
    visible = _publicly_visible_query(db).filter(Experience.id == experience_id).first()
    if visible is None:
        raise HTTPException(status_code=404, detail="Experience not found")
    ex = (
        db.query(Experience)
        .filter(Experience.id == experience_id)
        .with_for_update()
        .first()
    )
    # Re-check on the locked row: it can be deleted, cancelled or moved into
    # the past between the visibility query and the lock.
    if ex is None:
        raise HTTPException(status_code=404, detail="Experience not found")
    # MEH-3219 B12: a recurring experience's event_date is its first
    # occasion, not its last — it stays open after it (experiences.py feed).
    # MEH-3288: a dated one also closes once it has started today.
    started = _has_started(ex.event_date, ex.event_time)  # type: ignore[arg-type]
    if not ex.is_active or (started and not ex.is_recurring):
        raise HTTPException(status_code=409, detail=_CLOSED)
    if ex.registration_method != "site_form":
        raise HTTPException(status_code=409, detail=_CLOSED)
    return ex


def _owner_email_for_event(db: Session, event: Event) -> str | None:
    # .first(): no DB constraint stops two users sharing a producer_id
    # (group_buys.py:208 convention).
    row = db.query(User.email).filter(User.producer_id == event.producer_id).first()
    return row[0] if row else None


def _date_text(d: date) -> str:
    return d.strftime("%d.%m.%Y")


def _time_text(t: time | None) -> str:
    return t.strftime("%H:%M") if t else ""


def _experience_when(ex: Experience) -> str:
    if ex.is_recurring:
        schedule = (ex.recurring_schedule or "").strip()
        return f"מתקיימת באופן קבוע: {schedule}" if schedule else "מתקיימת באופן קבוע"
    return _date_text(ex.event_date)  # type: ignore[arg-type]


# ---------- sign-up ----------


def _existing(
    db: Session, column: Any, item_id: UUID, email: str
) -> Registration | None:
    return (
        db.query(Registration)
        .filter(
            column == item_id,
            Registration.email == email,
            Registration.status == "registered",
        )
        .first()
    )


def _new_registration(data: RegistrationCreate, **item: Any) -> Registration:
    return Registration(
        name=data.name,
        phone=data.phone,
        email=data.email,
        cancel_token=secrets.token_urlsafe(32),
        status="registered",
        **item,
    )


@router.post(
    "/events/{event_id}/registrations",
    response_model=RegistrationCreatedOut,
    status_code=201,
)
@limiter.limit("10/hour")
def register_for_event(
    request: Request,
    event_id: UUID,
    data: RegistrationCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> RegistrationCreatedOut:
    event = _event_for_signup(db, event_id)
    # Capacity before the duplicate check: the other order answers 201 for an
    # email already signed up and 409 for a new one on a full item, which
    # tells a stranger whether that address is on the list.
    taken = registered_counts(db, event_ids=[event.id]).get(event.id, 0)  # type: ignore[call-overload,list-item]
    if event.max_participants is not None and taken >= event.max_participants:
        raise HTTPException(status_code=409, detail=_FULL)
    if _existing(db, Registration.event_id, event.id, data.email):  # type: ignore[arg-type]
        db.rollback()  # releases the FOR UPDATE lock on the event row
        return RegistrationCreatedOut()

    reg = _new_registration(data, event_id=event.id)
    db.add(reg)
    db.flush()
    # MEH-3179: counted in the same transaction; never fails the sign-up.
    billing_ledger.record_event_registration(db, reg, event)
    db.commit()

    producer = db.get(Producer, event.producer_id)
    place = ", ".join(p for p in (event.location, event.city) if p)  # type: ignore[misc]
    item_url = f"{settings.frontend_url}/events/{event.id}"
    background_tasks.add_task(
        send_visitor_confirmation,
        reg.email,  # type: ignore[arg-type]
        VisitorEmail(
            title=event.title,  # type: ignore[arg-type]
            date_text=_date_text(event.event_date),  # type: ignore[arg-type]
            time_text=_time_text(event.event_time),  # type: ignore[arg-type]
            place=place,
            host_name=producer.name if producer else "",  # type: ignore[arg-type]
            item_url=item_url,
            cancel_url=f"{settings.frontend_url}/registration/{reg.cancel_token}",
        ),
        # MEH-2952: caused by the business that runs the event.
        test_cause=bool(producer and producer.is_test),
    )
    owner_email = _owner_email_for_event(db, event)
    if owner_email:
        spots = (
            event.max_participants - (taken + 1)
            if event.max_participants is not None
            else None
        )
        background_tasks.add_task(
            send_owner_new_registration,
            owner_email,
            OwnerNewEmail(
                title=event.title,  # type: ignore[arg-type]
                name=reg.name,  # type: ignore[arg-type]
                phone=reg.phone,  # type: ignore[arg-type]
                email=reg.email,  # type: ignore[arg-type]
                spots_left=spots,
                # MEH-2884 (placement audit item 10): straight to the tool that lists
                # the registrations, not the dashboard home (one tap saved).
                manage_url=f"{settings.frontend_url}/producer/dashboard/events",
            ),
            test_cause=bool(producer and producer.is_test),  # MEH-2952
        )
    return RegistrationCreatedOut()


@router.post(
    "/experiences/{experience_id}/registrations",
    response_model=RegistrationCreatedOut,
    status_code=201,
)
@limiter.limit("10/hour")
def register_for_experience(
    request: Request,
    experience_id: UUID,
    data: RegistrationCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> RegistrationCreatedOut:
    ex = _experience_for_signup(db, experience_id)
    # Capacity first, for the same reason as register_for_event.
    taken = registered_counts(db, experience_ids=[ex.id]).get(ex.id, 0)  # type: ignore[call-overload,list-item]
    # The host's own tally (WhatsApp / phone sign-ups) shares the cap.
    occupied = (ex.participants_count or 0) + taken
    if ex.max_participants is not None and occupied >= ex.max_participants:
        raise HTTPException(status_code=409, detail=_FULL)
    if _existing(db, Registration.experience_id, ex.id, data.email):  # type: ignore[arg-type]
        db.rollback()  # releases the FOR UPDATE lock on the experience row
        return RegistrationCreatedOut()

    reg = _new_registration(data, experience_id=ex.id)
    db.add(reg)
    db.flush()
    # MEH-3179: counted for the host's business, if the host has one.
    ledger_host = db.get(User, ex.host_user_id)
    billing_ledger.record_experience_registration(
        db, reg, ex, ledger_host.producer_id if ledger_host else None
    )
    db.commit()

    host = db.get(User, ex.host_user_id)
    business = host.producer if host else None
    host_name = (business.name if business else None) or (host.name if host else "")
    place = ex.city or ""
    # A home address is private (MEH-1417) — the city only. A public venue's
    # address is already on the page.
    if ex.location_type == "public" and ex.address:
        place = ", ".join(p for p in (ex.address, ex.city) if p)  # type: ignore[misc]
    background_tasks.add_task(
        send_visitor_confirmation,
        reg.email,  # type: ignore[arg-type]
        VisitorEmail(
            title=ex.title,  # type: ignore[arg-type]
            # MEH-3250: a recurring experience's event_date is its FIRST
            # occasion, often long past — the email gives the host's schedule
            # (approved page copy «מתקיימת באופן קבוע» when she left none).
            date_text=_experience_when(ex),
            time_text="" if ex.is_recurring else _time_text(ex.event_time),  # type: ignore[arg-type]
            place=place,  # type: ignore[arg-type]
            host_name=host_name,  # type: ignore[arg-type]
            item_url=f"{settings.frontend_url}/experiences/{ex.id}",
            cancel_url=f"{settings.frontend_url}/registration/{reg.cancel_token}",
        ),
        # MEH-2952: caused by the host (or her business).
        test_cause=host_test_cause(host),
    )
    if host and host.email:
        spots = (
            ex.max_participants - (occupied + 1)
            if ex.max_participants is not None
            else None
        )
        background_tasks.add_task(
            send_owner_new_registration,
            host.email,  # type: ignore[arg-type]
            OwnerNewEmail(
                title=ex.title,  # type: ignore[arg-type]
                name=reg.name,  # type: ignore[arg-type]
                phone=reg.phone,  # type: ignore[arg-type]
                email=reg.email,  # type: ignore[arg-type]
                spots_left=spots,
                # MEH-2884: experiences tab, where the host sees this registration.
                manage_url=f"{settings.frontend_url}/producer/dashboard/experiences",
            ),
            test_cause=host_test_cause(host),  # MEH-2952
        )
    return RegistrationCreatedOut()


# ---------- owner list ----------


def _is_admin(user: User) -> bool:
    return getattr(user, "role", None) == "admin"


@router.get(
    "/events/{event_id}/registrations", response_model=list[RegistrationOwnerOut]
)
@limiter.limit("30/minute")
def list_event_registrations(
    request: Request,
    event_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RegistrationOwnerOut] | list[Registration]:
    event = db.get(Event, event_id)
    # MEH-1001: 404, not 403, so a stranger can't confirm the event exists.
    if event is None or not (
        _is_admin(user)
        or (user.producer_id is not None and user.producer_id == event.producer_id)
    ):
        raise HTTPException(status_code=404, detail="Event not found")
    return (
        db.query(Registration)
        .filter(Registration.event_id == event.id)
        .order_by(Registration.created_at.asc())
        .all()
    )


@router.get(
    "/experiences/{experience_id}/registrations",
    response_model=list[RegistrationOwnerOut],
)
@limiter.limit("30/minute")
def list_experience_registrations(
    request: Request,
    experience_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RegistrationOwnerOut] | list[Registration]:
    ex = db.get(Experience, experience_id)
    if ex is None or not (_is_admin(user) or ex.host_user_id == user.id):
        raise HTTPException(status_code=404, detail="Experience not found")
    return (
        db.query(Registration)
        .filter(Registration.experience_id == ex.id)
        .order_by(Registration.created_at.asc())
        .all()
    )


# ---------- cancel by token ----------


def _by_token(db: Session, token: str, *, lock: bool = False) -> Registration:
    q = db.query(Registration).options(
        joinedload(Registration.event), joinedload(Registration.experience)
    )
    if lock:
        q = q.with_for_update(of=Registration)
    reg = q.filter(Registration.cancel_token == token).first()
    if reg is None:
        raise HTTPException(status_code=404, detail="Registration not found")
    return reg


def _item(reg: Registration) -> Any:
    return reg.event if reg.event_id else reg.experience


@router.get("/registrations/{token}", response_model=RegistrationCancelInfoOut)
@limiter.limit("30/minute")
def get_registration(
    request: Request, token: str, db: Session = Depends(get_db)
) -> RegistrationCancelInfoOut:
    reg = _by_token(db, token)
    item = _item(reg)
    return RegistrationCancelInfoOut(
        kind="event" if reg.event_id else "experience",
        item_id=item.id,
        title=item.title,
        event_date=item.event_date,
        status=reg.status,
    )


@router.post("/registrations/{token}/cancel", response_model=RegistrationCancelInfoOut)
@limiter.limit("10/minute")
def cancel_registration(
    request: Request,
    token: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> RegistrationCancelInfoOut:
    reg = _by_token(db, token, lock=True)
    item = _item(reg)
    was_active = reg.status == "registered"
    if was_active:
        reg.status = "cancelled"  # type: ignore[assignment]
        reg.cancelled_at = utc_now()  # type: ignore[assignment]
        # MEH-3179: a cancel before the item took place is not a booking the
        # business got. A late cancel of a past item stays counted.
        if item.event_date >= israel_today():
            billing_ledger.void(
                db,
                kind=(
                    "event_registration" if reg.event_id else "experience_registration"
                ),
                source_id=reg.id,
            )
    db.commit()

    # A late cancel of a past item changes nothing for the owner — no email.
    # MEH-3250: a recurring experience is never past by its first date.
    is_upcoming = item.event_date >= israel_today() or bool(
        getattr(item, "is_recurring", False)
    )
    if was_active and is_upcoming:
        if reg.event_id:
            owner_email = _owner_email_for_event(db, item)
            owner = db.get(Producer, item.producer_id)
            test_cause = bool(owner and owner.is_test)  # MEH-2952
        else:
            host = db.get(User, item.host_user_id)
            owner_email = host.email if host else None  # type: ignore[assignment]
            test_cause = host_test_cause(host)  # MEH-2952
        if owner_email:
            background_tasks.add_task(
                send_owner_cancellation,
                owner_email,
                OwnerCancelEmail(
                    title=item.title,
                    name=reg.name,  # type: ignore[arg-type]
                    # MEH-2884: the tab that lists this item's registrations.
                    manage_url=(
                        f"{settings.frontend_url}/producer/dashboard/"
                        + ("events" if reg.event_id else "experiences")
                    ),
                ),
                test_cause=test_cause,
            )
    return RegistrationCancelInfoOut(
        kind="event" if reg.event_id else "experience",
        item_id=item.id,
        title=item.title,
        event_date=item.event_date,
        status=reg.status,
    )
