"""
Module:   booking_cancellations
Purpose:  When bookings stop being real, cancel them and tell the people who
          made them (D1 of the 14/11 grill retro, MEH-3227):
            1. the site takes a business off (suspend, reject a live one,
               admin delete, owner deletes her account) → its live rescue
               bags and the sign-ups to its upcoming events and experiences
               are cancelled, each buyer / registrant mailed once, and the
               owner is told (suspend / admin delete);
            2. the business cancels, deletes or moves one event or
               experience → its sign-ups are cancelled (cancel, delete) or
               kept (move), each registrant mailed.
Touches:  rescue_offers / rescue_orders / registrations (status), users +
          events + experiences (read, for recipients), Resend via
          rescue_emails / registration_emails (background tasks).
Does NOT: commit — the caller commits its own change and these
          cancellations together (the group_buy_delist convention). Group
          buys stay in services/group_buy_delist.py. Does not decide WHEN a
          business leaves the site; the admin routes and user_deletion do.
Related:  services/group_buy_delist.py::cancel_live_group_buys (MEH-2498,
          the precedent) · routers/rescue.py::cancel_offer (the business's
          own bag cancel) · routers/registrations.py (the confirmation email
          these mirror).
History:  MEH-3227 (creation)
"""

from __future__ import annotations

from datetime import date, time
from typing import Any

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Event,
    Experience,
    Producer,
    ProducerLocation,
    Registration,
    RescueOffer,
    RescueOrder,
    User,
)
from app.services.email import send_email
from app.services.group_buy_delist import cancel_live_group_buys
from app.services.registration_emails import (
    RegistrantEmail,
    send_registrant_cancelled,
    send_registrant_delisted,
    send_registrant_moved,
)
from app.services.rescue_emails import send_delisted_cancel_email
from app.utils.clock import israel_today, utc_now


def _date_text(d: date | None) -> str:
    return d.strftime("%d.%m.%Y") if d else ""  # routers/registrations.py


def _time_text(t: time | None) -> str:
    return t.strftime("%H:%M") if t else ""


def _event_place(event: Event) -> str:
    return ", ".join(p for p in (event.location, event.city) if p)  # type: ignore[misc]


def _experience_place(ex: Experience) -> str:
    # A home address is private (MEH-1417) — the city only.
    if ex.location_type == "public" and ex.address:
        return ", ".join(p for p in (ex.address, ex.city) if p)  # type: ignore[misc]
    return ex.city or ""  # type: ignore[return-value]


def _experience_host_name(ex: Experience) -> str:
    host = ex.host
    business = host.producer if host else None
    return (business.name if business else None) or (host.name if host else "") or ""


def _message(
    reg: Registration, item: Event | Experience, host_name: str
) -> RegistrantEmail:
    place = _event_place(item) if isinstance(item, Event) else _experience_place(item)
    return RegistrantEmail(
        title=item.title or "",  # type: ignore[arg-type]
        date_text=_date_text(item.event_date),  # type: ignore[arg-type]
        time_text=_time_text(item.event_time),  # type: ignore[arg-type]
        place=place,
        host_name=host_name,
        cancel_url=f"{settings.frontend_url}/registration/{reg.cancel_token}",
    )


def _active_registrations(
    db: Session, column: Any, ids: list[Any]
) -> list[Registration]:
    if not ids:
        return []
    return (
        db.query(Registration)
        # MEH-3314: a waitlisted visitor is told the item is off too.
        .filter(column.in_(ids), Registration.status.in_(("registered", "waitlisted")))
        .with_for_update()
        .all()
    )


def _cancel_and_queue(
    background_tasks: BackgroundTasks,
    regs: list[tuple[Registration, Event | Experience, str]],
    sender: Any,
    test_cause: bool,
) -> int:
    """Cancel each sign-up and queue one email per sign-up (plain values)."""
    now = utc_now()
    for reg, item, host_name in regs:
        message = _message(reg, item, host_name)
        reg.status = "cancelled"  # type: ignore[assignment]
        reg.cancelled_at = now  # type: ignore[assignment]
        if reg.email:
            background_tasks.add_task(sender, reg.email, message, test_cause=test_cause)
    return len(regs)


# ---------- 1. the site takes a business off ----------


def _cancel_live_bags(
    db: Session, producer: Producer, background_tasks: BackgroundTasks
) -> int:
    """Every active bag whose pickup has not ended → cancelled, with its
    reservations; one email per buyer. Rows are locked as cancel_offer locks
    them, so a reservation landing at the same instant cannot slip past."""
    now = utc_now()
    offers = (
        db.query(RescueOffer)
        .join(ProducerLocation, RescueOffer.producer_location_id == ProducerLocation.id)
        .filter(
            ProducerLocation.producer_id == producer.id,
            RescueOffer.status == "active",
            RescueOffer.pickup_end > now,
        )
        .with_for_update(of=RescueOffer)
        .all()
    )
    if not offers:
        return 0
    offer_ids = [o.id for o in offers]
    emails = {
        email
        for (email,) in db.query(User.email)
        .join(RescueOrder, RescueOrder.user_id == User.id)
        .filter(RescueOrder.offer_id.in_(offer_ids), RescueOrder.status == "reserved")
        # The business's own users are told by the owner email instead.
        .filter((User.producer_id.is_(None)) | (User.producer_id != producer.id))
        if email
    }
    cancelled = (
        db.query(RescueOrder)
        .filter(RescueOrder.offer_id.in_(offer_ids), RescueOrder.status == "reserved")
        .update({"status": "cancelled", "cancelled_at": now}, synchronize_session=False)
    )
    for offer in offers:
        offer.status = "cancelled"  # type: ignore[assignment]
    for email in sorted(emails):
        background_tasks.add_task(
            send_delisted_cancel_email,
            email,
            str(producer.name or ""),
            test_cause=bool(producer.is_test),  # MEH-2952
        )
    return int(cancelled or 0)


def _cancel_upcoming_signups(
    db: Session, producer: Producer, background_tasks: BackgroundTasks
) -> int:
    """Sign-ups to this business's events, and to experiences its owner
    hosts, from today on → cancelled, one email each. A recurring experience
    is dated too: sign-up closes once its date passes (registrations.py)."""
    today = israel_today()
    events = (
        db.query(Event)
        .filter(Event.producer_id == producer.id, Event.event_date >= today)
        .all()
    )
    experiences = (
        db.query(Experience)
        .join(User, Experience.host_user_id == User.id)
        .filter(User.producer_id == producer.id)
        .filter(Experience.event_date >= today)
        .all()
    )
    by_event = {e.id: e for e in events}
    by_ex = {x.id: x for x in experiences}
    name = str(producer.name or "")
    regs: list[tuple[Registration, Event | Experience, str]] = [
        (r, by_event[r.event_id], name)
        for r in _active_registrations(db, Registration.event_id, list(by_event))
    ] + [
        (r, by_ex[r.experience_id], name)
        for r in _active_registrations(db, Registration.experience_id, list(by_ex))
    ]
    return _cancel_and_queue(
        background_tasks, regs, send_registrant_delisted, bool(producer.is_test)
    )


def cancel_business_bookings(
    db: Session, producer: Producer, background_tasks: BackgroundTasks
) -> int:
    """Rescue bags + sign-ups of a business leaving the site; return how many
    bookings were cancelled. Call it BEFORE a delete — the cascade removes
    the rows these emails are read from."""
    return _cancel_live_bags(db, producer, background_tasks) + _cancel_upcoming_signups(
        db, producer, background_tasks
    )


def owner_emails(db: Session, producer: Producer) -> list[str]:
    """The business's own login emails — read before an unlink or a delete."""
    return sorted(
        {
            e
            for (e,) in db.query(User.email).filter(User.producer_id == producer.id)
            if e
        }
    )


def send_owner_delisted(
    to: str,
    producer_name: str,
    *,
    deleted: bool,
    cancelled_any: bool,
    test_cause: bool = False,
) -> None:
    """The site hid (suspend) or removed (admin delete) the owner's page.
    Copy approved by Sapir 14/11. No reason is given, as in every other
    delisting email; the contact page is where she asks."""
    name = " ".join((producer_name or "").split())
    contact = f"{settings.frontend_url}/contact"
    if deleted:
        subject = f"מהמקור — הדף של {name} הוסר"
        first = f"הדף של {name} הוסר ממהמקור על ידי צוות האתר. החשבון שלכם נשאר פעיל."
    else:
        subject = f"מהמקור — הדף של {name} הוסתר מהאתר"
        first = (
            f"הדף של {name} הוסתר מהאתר על ידי צוות מהמקור, וכרגע הוא לא מופיע "
            "בחיפוש, במפה וברשימות."
        )
    lines = [first]
    if cancelled_any:
        lines.append(
            "שריונים לסלי הצלה, הרשמות לאירועים וקניות קבוצתיות פתוחות בוטלו, "
            "והלקוחות קיבלו על כך מייל."
        )
    lines.append(f"לשאלות אפשר לכתוב לנו: {contact}")
    body = "שלום,\n\n" + "\n".join(lines) + "\n\nבברכה,\nצוות מהמקור"
    send_email(to, subject, body, test_cause=test_cause)


def queue_owner_delisted(
    background_tasks: BackgroundTasks,
    emails: list[str],
    producer: Producer,
    *,
    deleted: bool,
    cancelled_any: bool,
) -> None:
    for email in emails:
        background_tasks.add_task(
            send_owner_delisted,
            email,
            str(producer.name or ""),
            deleted=deleted,
            cancelled_any=cancelled_any,
            test_cause=bool(producer.is_test),
        )


def delist_business(
    db: Session,
    producer: Producer,
    background_tasks: BackgroundTasks,
    owner_notice: str | None = None,
) -> int:
    """The one call every take-off path makes (MEH-3227): group buys
    (MEH-2498), rescue bags and sign-ups are cancelled and their holders
    mailed; with ``owner_notice`` "hidden" or "deleted" the owner is mailed
    too. Before any unlink or delete — it reads User.producer_id."""
    owners = owner_emails(db, producer) if owner_notice else []
    count = cancel_live_group_buys(db, producer, background_tasks)
    count += cancel_business_bookings(db, producer, background_tasks)
    queue_owner_delisted(
        background_tasks,
        owners,
        producer,
        deleted=owner_notice == "deleted",
        cancelled_any=count > 0,
    )
    return count


# ---------- 2. the business changes one event or experience ----------


def _host_name_for(item: Event | Experience) -> str:
    if isinstance(item, Event):
        return (item.producer.name if item.producer else "") or ""
    return _experience_host_name(item)


def _column_for(item: Event | Experience) -> Any:
    return (
        Registration.event_id if isinstance(item, Event) else Registration.experience_id
    )


def _is_upcoming(item: Event | Experience) -> bool:
    return bool(item.event_date and item.event_date >= israel_today())


def cancel_item_signups(
    db: Session,
    item: Event | Experience,
    background_tasks: BackgroundTasks,
    test_cause: bool,
) -> int:
    """The business cancelled or is deleting ``item``: cancel its active
    sign-ups and mail each registrant. Before a delete — the cascade removes
    the rows. A past item is left alone (nobody is waiting on it)."""
    if not _is_upcoming(item):
        return 0
    host_name = _host_name_for(item)
    regs = [
        (r, item, host_name)
        for r in _active_registrations(db, _column_for(item), [item.id])
    ]
    return _cancel_and_queue(
        background_tasks, regs, send_registrant_cancelled, test_cause
    )


def notify_item_moved(
    db: Session,
    item: Event | Experience,
    background_tasks: BackgroundTasks,
    test_cause: bool,
) -> int:
    """The business moved ``item``'s date or time (already applied): each
    active registrant gets the new time and her cancel link. Sign-ups stay."""
    if not _is_upcoming(item):
        return 0
    host_name = _host_name_for(item)
    regs = (
        db.query(Registration)
        .filter(_column_for(item) == item.id, Registration.status == "registered")
        .all()
    )
    for reg in regs:
        if reg.email:
            background_tasks.add_task(
                send_registrant_moved,
                str(reg.email),
                _message(reg, item, host_name),
                test_cause=test_cause,
            )
    return len(regs)


def is_test_item(item: Event | Experience) -> bool:
    """MEH-2952: a test business's mail goes to the test sink."""
    if isinstance(item, Event):
        return bool(item.producer and item.producer.is_test)
    business = item.host.producer if item.host else None
    return bool(business and business.is_test)


def item_state(item: Event | Experience) -> tuple[Any, Any, Any]:
    """What an edit is compared against: (is_active, date, time). Read it
    before the route applies the edit."""
    return (bool(item.is_active), item.event_date, item.event_time)


def after_item_edit(
    db: Session,
    item: Event | Experience,
    before: tuple[Any, Any, Any],
    background_tasks: BackgroundTasks,
    test_cause: bool,
) -> int:
    """Call after the edit is applied, before the commit (MEH-3227 D1b):
    active → cancelled cancels the sign-ups; a new date or time on a live
    item mails each registrant the new time. Anything else sends nothing."""
    was_active, old_date, old_time = before
    if was_active and not item.is_active:
        return cancel_item_signups(db, item, background_tasks, test_cause)
    moved = (item.event_date, item.event_time) != (old_date, old_time)
    # A past item moved forward: its registrants were for the old, past date.
    was_upcoming = bool(old_date and old_date >= israel_today())
    if item.is_active and moved and was_upcoming:
        return notify_item_moved(db, item, background_tasks, test_cause)
    return 0
