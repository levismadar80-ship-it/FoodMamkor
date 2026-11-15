"""
Module:   registration_reminders
Purpose:  The evening before an event or a one-off workshop, each person who
          signed up on the site gets one reminder with the time, the place and
          her cancel link (MEH-3312). Fewer no-shows; a seat that will not be
          used can still go to someone.
Touches:  registrations (reminder_sent_at stamp), events / experiences
          (read), Resend via registration_emails (after the commit).
Does NOT: remind a recurring workshop — a sign-up has no occurrence date yet
          (MEH-3264), so "tomorrow" is unknown. Does not decide the hour
          (startup.py, REGISTRATION_REMINDER_CRON).
Related:  services/booking_cancellations.py::registrant_message (same values
          as every registrant email); startup.py::_run_registration_reminder_job
History:  MEH-3312 (creation)
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models.models import Event, Experience, Registration
from app.services.booking_cancellations import is_test_item, registrant_message
from app.services.registration_emails import send_registration_reminder
from app.utils.clock import israel_today, utc_now


def _due(db: Session, tomorrow: date) -> list[tuple[Registration, Event | Experience]]:
    """Active, not yet reminded sign-ups to a live item happening tomorrow.
    Locked with SKIP LOCKED so two schedulers never mail one row twice."""
    out: list[tuple[Registration, Event | Experience]] = []
    events = (
        db.query(Registration, Event)
        .join(Event, Registration.event_id == Event.id)
        .filter(
            Registration.status == "registered",
            Registration.reminder_sent_at.is_(None),
            Event.event_date == tomorrow,
            Event.is_active.is_(True),
        )
        .with_for_update(of=Registration, skip_locked=True)
        .all()
    )
    out.extend((r, e) for r, e in events)
    experiences = (
        db.query(Registration, Experience)
        .join(Experience, Registration.experience_id == Experience.id)
        .filter(
            Registration.status == "registered",
            Registration.reminder_sent_at.is_(None),
            Experience.event_date == tomorrow,
            Experience.is_active.is_(True),
            Experience.status == "approved",
            Experience.is_recurring.isnot(True),
        )
        .with_for_update(of=Registration, skip_locked=True)
        .all()
    )
    out.extend((r, x) for r, x in experiences)
    return out


def send_registration_reminders(db: Session, today: date | None = None) -> int:
    """Stamp, commit, then send. Returns how many reminders went out."""
    tomorrow = (today or israel_today()) + timedelta(days=1)
    now = utc_now()
    queued: list[tuple[str, Any, bool]] = []
    for reg, item in _due(db, tomorrow):
        reg.reminder_sent_at = now  # type: ignore[assignment]
        if reg.email:
            queued.append(
                (str(reg.email), registrant_message(reg, item), is_test_item(item))
            )
    db.commit()
    # After the commit: a crash mid-send never re-sends the rows already
    # stamped, and send_email is fail-open, so one bad address stops nothing.
    for to, message, test_cause in queued:
        send_registration_reminder(to, message, test_cause=test_cause)
    return len(queued)
