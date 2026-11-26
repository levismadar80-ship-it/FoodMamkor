"""
Module:   rescue_routine_writes
Purpose:  The rules behind the weekly-routine routes under
          /producers/me/rescue (MEH-3703): find the caller's own pickup point,
          save or stop its routine, skip or un-skip a day, and build the row
          the dashboard reads back.
Touches:  DB `producer_locations.rescue_schedule` (row-locked per write) and,
          through services/rescue_schedule.py `publish_due`, new rows in
          rescue_offers. Commits.
Does NOT: cancel a day's bag or mail its buyers. A skip of a published day
          goes through `cancel_whole_offer` (services/rescue_writes.py) and
          `queue_business_cancel_emails` (services/rescue_notify.py), called
          from the router so the router's lock is the one used. It doesn't
          parse or store the routine itself either (services/rescue_schedule.py),
          and it doesn't read the clock or the pilot towns: the router passes
          them in `RoutineCall`, so a test that pins the router's clock pins
          these too.
Related:  app/routers/rescue.py list_my_schedules · save_my_schedule ·
          delete_my_schedule · skip_my_day · unskip_my_day (the callers).
History:  MEH-3537 (moved verbatim from routers/rescue.py; the clock and the
          pilot check became parameters). Originally MEH-3703.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.models import ProducerLocation, RescueOffer, RescueOrder, User
from app.schemas.rescue_schedule import (  # MEH-3703
    RescueScheduleIn,
    RescueScheduleRow,
    weekday_bit,
)
from app.services.rescue_schedule import (  # MEH-3703
    can_host,
    cancelled_days_in_reach,
    publish_due,
    save_routine,
    set_skip,
)
from app.services.rescue_schedule import stored as stored_routine


@dataclass(frozen=True)
class RoutineCall:
    """The router's clock and pilot check for one request (MEH-3537)."""

    today: date
    now: datetime
    in_pilot: Callable[[str | None], bool]


def owned_location(db: Session, user: User, location_id: UUID) -> ProducerLocation:
    """The caller's own pickup point, locked for this write (two quick skips
    must not overwrite each other's list); 404 otherwise, so another
    business's point is indistinguishable from a missing one. Owners only:
    these routes sit behind require_producer, which an admin does not pass."""
    location = (
        db.query(ProducerLocation)
        .filter(
            ProducerLocation.id == location_id,
            ProducerLocation.producer_id == user.producer_id,
        )
        .with_for_update()
        .first()
    )
    if location is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="נקודת האיסוף לא נמצאה"
        )
    return location


def schedule_row(
    db: Session, location: ProducerLocation, call: RoutineCall
) -> RescueScheduleRow:
    return RescueScheduleRow(
        producer_location_id=location.id,
        label=location.label,
        address=location.address,
        city=location.city,
        exact=location.location_precision == "exact",
        publishing=can_host(db, location, call.in_pilot),
        closed_days=cancelled_days_in_reach(db, location.id, call.today),
        schedule=stored_routine(location),
    )


def schedule_rows(
    db: Session, producer_id: UUID, call: RoutineCall
) -> list[RescueScheduleRow]:
    """Every pickup point of this business, with its routine or none."""
    points = (
        db.query(ProducerLocation)
        .filter(ProducerLocation.producer_id == producer_id)
        .order_by(ProducerLocation.is_primary.desc(), ProducerLocation.created_at)
        .all()
    )
    return [schedule_row(db, p, call) for p in points]


def save_schedule(
    db: Session,
    location: ProducerLocation,
    body: RescueScheduleIn,
    call: RoutineCall,
) -> RescueScheduleRow:
    """Set or change the routine, then publish any day already in reach."""
    if location.location_precision != "exact":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="נקודת האיסוף צריכה כתובת מדויקת כדי לפרסם סל",
        )
    if not call.in_pilot(location.city):  # type: ignore[arg-type]
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="סלי הפתעה עדיין לא פתוחים ביישוב הזה",
        )
    save_routine(location, body, call.today)
    db.commit()
    publish_due(
        db,
        today=call.today,
        now=call.now,
        in_pilot=call.in_pilot,
        location_id=location.id,  # type: ignore[arg-type]
    )
    db.refresh(location)
    return schedule_row(db, location, call)


def clear_schedule(
    db: Session, location: ProducerLocation, call: RoutineCall
) -> RescueScheduleRow:
    """Stop the routine. Bags already published stay, as a pause leaves them."""
    location.rescue_schedule = None  # type: ignore[assignment]
    db.commit()
    db.refresh(location)
    return schedule_row(db, location, call)


def routine_bag_to_skip(
    db: Session,
    location: ProducerLocation,
    day: date,
    now: datetime,
    cancel_reserved: bool,
) -> RescueOffer | None:
    """The routine's bag that a skip of `day` would cancel, read under its row
    lock; None when the day holds none. If someone reserved it and the caller
    has not confirmed (`cancel_reserved`), 409 so the dashboard asks first."""
    routine = stored_routine(location)
    # Only a day the routine covers can hold a routine bag; a bag published by
    # hand on another day is cancelled from its own card, never by a skip.
    covered = routine is not None and bool(routine.weekdays & weekday_bit(day))
    bag = (
        None
        if not covered
        else (
            db.query(RescueOffer)
            .filter(
                RescueOffer.producer_location_id == location.id,
                RescueOffer.date == day,
                RescueOffer.status == "active",
                RescueOffer.pickup_end > now,
            )
            .with_for_update()
            .first()
        )
    )
    if bag is not None and not cancel_reserved:
        reserved = (
            db.query(RescueOrder.id)
            .filter(RescueOrder.offer_id == bag.id, RescueOrder.status == "reserved")
            .first()
        )
        if reserved is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="יש הזמנות לסל של היום הזה",
            )
    return bag


def mark_skip(
    location: ProducerLocation, day: date, today: date, *, skip: bool
) -> None:
    """Add or remove `day` in the routine's skip list; a day the routine
    refuses (past, out of reach) is a 422 with its own message."""
    try:
        set_skip(location, day, skip=skip, today=today)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc


def unskip_day(
    db: Session, location: ProducerLocation, day: date, call: RoutineCall
) -> RescueScheduleRow:
    """Take a skip back, then publish the day if it is already in reach."""
    mark_skip(location, day, call.today, skip=False)
    db.commit()
    publish_due(
        db,
        today=call.today,
        now=call.now,
        in_pilot=call.in_pilot,
        location_id=location.id,  # type: ignore[arg-type]
    )
    db.refresh(location)
    return schedule_row(db, location, call)
