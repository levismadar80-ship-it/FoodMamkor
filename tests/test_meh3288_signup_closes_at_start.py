"""MEH-3288 — on-site sign-up closes once the item has started today.

Before: only the date was compared (registrations.py `_event_for_signup` /
`_experience_for_signup`), so an event at 10:00 took a sign-up at 20:00 the
same day and mailed a confirmation. Now, when the item has a start time, the
Israel clock decides; with no time, the day stays open (unchanged).

The clock is frozen in the consumer module (testing.md, MEH-2290): the
assertions must read the same at 21:30 UTC as at noon.
"""

from datetime import date, datetime, time

import pytest

import app.routers.registrations as reg_router
from app.models.models import Registration
from app.utils.clock import ISRAEL_TZ
from test_meh2763_registrations import _event, _experience, _owner, _signup

TODAY = date(2026, 11, 16)  # a Monday, no DST edge


@pytest.fixture
def sent(monkeypatch):
    """Every email the router queued, as (kind, to)."""
    # REUSES: tests/test_meh2763_registrations.py:30 — the same three patches.
    calls = []
    for name in (
        "send_visitor_confirmation",
        "send_owner_new_registration",
        "send_owner_cancellation",
    ):
        monkeypatch.setattr(
            reg_router,
            name,
            lambda to, m, test_cause=False, _n=name: calls.append((_n, to)),
        )
    return calls


@pytest.fixture
def at(monkeypatch):
    """Freeze the router's Israel clock at TODAY hh:mm."""

    def _set(hh: int, mm: int = 0) -> None:
        now = datetime(TODAY.year, TODAY.month, TODAY.day, hh, mm, tzinfo=ISRAEL_TZ)
        monkeypatch.setattr(reg_router, "israel_today", lambda: TODAY)
        monkeypatch.setattr(reg_router, "israel_now", lambda: now)

    return _set


class TestEventStartTime:
    def test_event_that_started_this_morning_is_closed(self, client, db, sent, at):
        at(11)
        ev = _event(db, _owner(db), event_date=TODAY, event_time=time(10, 0))
        r = client.post(f"/events/{ev.id}/registrations", json=_signup())
        assert r.status_code == 409, r.text
        assert r.json()["detail"]["code"] == "registration_closed"
        assert db.query(Registration).count() == 0
        assert sent == []

    def test_event_later_today_is_open(self, client, db, sent, at):
        at(9)
        ev = _event(db, _owner(db), event_date=TODAY, event_time=time(10, 0))
        r = client.post(f"/events/{ev.id}/registrations", json=_signup())
        assert r.status_code == 201, r.text

    def test_event_without_time_stays_open_all_day(self, client, db, sent, at):
        at(22)
        ev = _event(db, _owner(db), event_date=TODAY)
        r = client.post(f"/events/{ev.id}/registrations", json=_signup())
        assert r.status_code == 201, r.text


class TestExperienceStartTime:
    def test_experience_that_started_is_closed(self, client, db, sent, at):
        at(11)
        ex = _experience(db, _owner(db), event_date=TODAY, event_time=time(10, 0))
        r = client.post(f"/experiences/{ex.id}/registrations", json=_signup())
        assert r.status_code == 409, r.text

    def test_experience_later_today_is_open(self, client, db, sent, at):
        at(9)
        ex = _experience(db, _owner(db), event_date=TODAY, event_time=time(10, 0))
        r = client.post(f"/experiences/{ex.id}/registrations", json=_signup())
        assert r.status_code == 201, r.text

    def test_recurring_experience_is_not_closed_by_its_first_time(
        self, client, db, sent, at
    ):
        # MEH-3250: event_date/time of a recurring one is its FIRST occasion.
        at(11)
        ex = _experience(
            db, _owner(db), event_date=TODAY, event_time=time(10, 0), is_recurring=True
        )
        r = client.post(f"/experiences/{ex.id}/registrations", json=_signup())
        assert r.status_code == 201, r.text


class TestBoundaries:
    def test_exactly_at_start_time_is_closed(self, client, db, sent, at):
        # Pins `>=`: the minute it starts, it is closed.
        at(10, 0)
        ev = _event(db, _owner(db), event_date=TODAY, event_time=time(10, 0))
        r = client.post(f"/events/{ev.id}/registrations", json=_signup())
        assert r.status_code == 409, r.text

    def test_a_past_day_is_closed_even_without_a_time(self, client, db, sent, at):
        at(8)
        ev = _event(db, _owner(db), event_date=date(2026, 11, 15))
        r = client.post(f"/events/{ev.id}/registrations", json=_signup())
        assert r.status_code == 409, r.text
