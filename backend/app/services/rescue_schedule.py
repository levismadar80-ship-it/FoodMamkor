"""
Module:   rescue_schedule
Purpose:  Turn each pickup point's weekly routine into ordinary rescue_offers
          rows for the days buyers can reserve (today and tomorrow), and keep
          the routine itself: save, remove, skip a day.
Touches:  producer_locations.rescue_schedule (read, write), rescue_offers
          (insert only).
Does NOT: email anyone. Cancelling a day that is already published goes
          through rescue_writes.cancel_whole_offer and the router's buyer
          email, exactly as a hand cancel does. It also does not decide the
          pilot towns (passed in as `in_pilot`, like publish_offer).
Related:  app/schemas/rescue_schedule.py (the JSON shape) ·
          app/services/rescue_writes.py:193 publish_offer (the same rules for a
          bag published by hand) · app/startup.py _run_rescue_schedule_job
History:  MEH-3703 (creation)
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session, selectinload

from app import pricing
from app.models.models import Producer, ProducerLocation, RescueOffer
from app.schemas.rescue_schedule import (
    SKIP_DAYS_AHEAD,
    RescueScheduleIn,
    RescueScheduleStored,
    weekday_bit,
)
from app.services.capabilities import billing_state, paid_tools_open
from app.services.rescue_reads import RESERVE_CLOSES_BEFORE_END, reserve_days
from app.services.rescue_writes import lock_offer_publishing
from app.utils.clock import ISRAEL_TZ

log = logging.getLogger(__name__)


def _israel_utc(day: date, hhmm: str) -> datetime:
    """An Israel wall-clock time on `day`, as the naive UTC the columns store.
    zoneinfo applies the offset of that date, so a DST switch moves nothing."""
    hours, minutes = (int(part) for part in hhmm.split(":"))
    local = datetime.combine(day, time(hours, minutes), tzinfo=ISRAEL_TZ)
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def stored(location: ProducerLocation) -> RescueScheduleStored | None:
    """The point's routine, or None. A stored value that no longer validates
    (a bound tightened later) reads as no routine rather than a crash."""
    raw = location.rescue_schedule
    if not raw:
        return None
    try:
        return RescueScheduleStored.model_validate(raw)
    except ValueError:
        log.warning("[RESCUE-SCHEDULE] unreadable routine location=%s", location.id)
        return None


def _bag_for(
    location: ProducerLocation, routine: RescueScheduleStored, day: date
) -> RescueOffer:
    start = _israel_utc(day, routine.pickup_start)
    return RescueOffer(
        producer_location_id=location.id,
        date=day,
        qty_total=routine.qty,
        qty_left=routine.qty,
        price_agorot=routine.price_agorot,
        value_min_agorot=routine.value_min_agorot,
        value_max_agorot=routine.value_max_agorot,
        pickup_start=start,
        pickup_end=_israel_utc(day, routine.pickup_end),
        cancel_until=start - timedelta(minutes=routine.cancel_minutes),
        status="active",
    )


def _due_days(routine: RescueScheduleStored, today: date) -> list[date]:
    first, last = reserve_days(today)
    days = [first + timedelta(days=n) for n in range((last - first).days + 1)]
    return [
        day
        for day in days
        if routine.weekdays & weekday_bit(day) and day not in routine.skip_dates
    ]


def can_host(
    db: Session, location: ProducerLocation, in_pilot: Callable[[str | None], bool]
) -> bool:
    """The rules a hand-published bag passes, read as yes/no: an approved
    business, an exact address, a pilot town, and the paid tool open (the
    `bags_open` gate; always open while billing is off)."""
    producer: Producer | None = location.producer
    return bool(
        producer is not None
        and producer.status == "approved"
        and location.location_precision == "exact"
        and in_pilot(location.city)  # type: ignore[arg-type]
        and (
            not pricing.billing_is_on()
            or paid_tools_open(billing_state(db, producer.id))
        )
    )


def cancelled_days_in_reach(db: Session, location_id: Any, today: date) -> list[date]:
    """The days in reach (today, tomorrow) that have a bag that is not up: a
    cancelled one. The routine never republishes them."""
    first, last = reserve_days(today)
    rows = (
        db.query(RescueOffer.date)
        .filter(
            RescueOffer.producer_location_id == location_id,
            RescueOffer.date >= first,
            RescueOffer.date <= last,
            RescueOffer.status != "active",
        )
        .distinct()
        .all()
    )
    return sorted(day for (day,) in rows)


def _has_offer(db: Session, location_id: Any, day: date) -> bool:
    """Any offer on that day, cancelled ones included: a day the business
    cancelled by hand must not come back on the next run."""
    return (
        db.query(RescueOffer.id)
        .filter(
            RescueOffer.producer_location_id == location_id, RescueOffer.date == day
        )
        .first()
        is not None
    )


def publish_due(
    db: Session,
    *,
    today: date,
    now: datetime,
    in_pilot: Callable[[str | None], bool],
    location_id: UUID | None = None,
) -> int:
    """Publish every scheduled day that has no bag yet; commits. Returns how
    many bags were published. Safe to run again: a day with any offer is left
    alone. `location_id` limits the run to one point (a save on the page)."""
    lock_offer_publishing(db)
    query = (
        db.query(ProducerLocation)
        .options(selectinload(ProducerLocation.producer))
        .filter(ProducerLocation.rescue_schedule.isnot(None))
    )
    if location_id is not None:
        query = query.filter(ProducerLocation.id == location_id)
    published = 0
    for location in query.all():
        # One savepoint per point: anything that goes wrong at one point is
        # logged and skipped, and every other business still gets its bags.
        try:
            with db.begin_nested():
                # Re-read under the point's row lock: a skip or save committed
                # since the list was loaded must count (the skip route holds
                # the same lock while it writes).
                db.refresh(location, with_for_update=True)
                routine = stored(location)
                if (
                    routine is None
                    or routine.paused
                    or not can_host(db, location, in_pilot)
                ):
                    continue
                published += _publish_point(db, location, routine, today, now)
        except Exception:  # noqa: BLE001 — one point must never stop the run
            log.exception("[RESCUE-SCHEDULE] publish failed location=%s", location.id)
    db.commit()
    return published


def _publish_point(
    db: Session,
    location: ProducerLocation,
    routine: RescueScheduleStored,
    today: date,
    now: datetime,
) -> int:
    count = 0
    for day in _due_days(routine, today):
        bag = _bag_for(location, routine, day)
        # Not offered: a window whose reserve cut-off passed (nobody could
        # take it), or one a clock change folded to nothing (an hour that does
        # not exist that night).
        if (
            bag.pickup_end <= bag.pickup_start
            or bag.pickup_end <= now + RESERVE_CLOSES_BEFORE_END
            or _has_offer(db, location.id, day)
        ):
            continue
        db.add(bag)
        db.flush()
        count += 1
    return count


def _raw_skips(location: ProducerLocation) -> list[date]:
    """The skipped days of a routine that no longer validates, so a save that
    replaces it does not silently bring those days back."""
    raw = location.rescue_schedule
    out: list[date] = []
    values: list[Any] = (
        list(raw.get("skip_dates") or []) if isinstance(raw, dict) else []
    )
    for value in values:
        try:
            out.append(date.fromisoformat(str(value)))
        except ValueError:
            continue
    return out


def save_routine(
    location: ProducerLocation, body: RescueScheduleIn, today: date
) -> None:
    """Write the routine, keeping the skipped days that are still ahead."""
    old = stored(location)
    skips = [d for d in (old.skip_dates if old else _raw_skips(location)) if d >= today]
    location.rescue_schedule = RescueScheduleStored(  # type: ignore[assignment]
        **body.model_dump(), skip_dates=skips
    ).model_dump(mode="json")


def set_skip(
    location: ProducerLocation, day: date, *, skip: bool, today: date
) -> RescueScheduleStored:
    """Add or remove one skipped day; past days are dropped on every write.
    Raises ValueError for a day outside today … today + SKIP_DAYS_AHEAD or a
    point with no routine."""
    routine = stored(location)
    if routine is None:
        raise ValueError("אין לוח קבוע בנקודה הזאת")
    if not today <= day <= today + timedelta(days=SKIP_DAYS_AHEAD):
        raise ValueError("אפשר לדלג רק על יום בשבועיים הקרובים")
    skips = {d for d in routine.skip_dates if d >= today}
    if skip:
        skips.add(day)
    else:
        skips.discard(day)
    routine.skip_dates = sorted(skips)
    location.rescue_schedule = routine.model_dump(mode="json")  # type: ignore[assignment]
    return routine
