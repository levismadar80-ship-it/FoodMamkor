"""Availability write-path validation + Israel-tz handling — AUD-039/040.

Two layers:
  * pure unit (no DB) — the clock primitive, the transition matrix, and
    the vacation return-date guard, incl. the Fri-23:30-Israel boundary;
  * API (Postgres, CI-gated) — past `vacation_until` rejected on both the
    new and legacy write endpoints.

Does NOT modify the merged mutation suite (test_expansion_availability.py)
— the read-path auto-clear boundary it pins (`< date.today()`) is left
untouched (see docs/discovery/2026-06-availability-phase0.md).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.services import availability_validation as av
from app.services.availability_validation import (
    AvailabilityValidationError,
    resolve_vacation_until,
    validate_transition,
)
from app.utils import clock

UTC = ZoneInfo("UTC")
ISRAEL = ZoneInfo("Asia/Jerusalem")


# ---------- clock primitive ----------

def test_israel_today_follows_israel_now(monkeypatch):
    frozen = datetime(2026, 6, 5, 23, 30, tzinfo=ISRAEL)  # Fri 23:30 Israel
    monkeypatch.setattr(clock, "israel_now", lambda: frozen)
    assert clock.israel_today() == date(2026, 6, 5)


def test_friday_2330_israel_is_friday_not_utc_saturday():
    """Fri 23:30 Israel == 20:30 UTC (summer DST, UTC+3) — same calendar
    day; the divergence appears one hour later."""
    israel_dt = datetime(2026, 6, 5, 20, 30, tzinfo=UTC).astimezone(ISRAEL)
    assert israel_dt.strftime("%A") == "Friday"
    assert (israel_dt.hour, israel_dt.minute) == (23, 30)


def test_utc_friday_can_be_israel_saturday():
    """UTC Fri 21:30 is already Sat 00:30 in Israel — the exact window
    where a naive `date.today()` (UTC) lags the producer's local date."""
    utc_instant = datetime(2026, 6, 5, 21, 30, tzinfo=UTC)
    assert utc_instant.strftime("%A") == "Friday"
    israel_dt = utc_instant.astimezone(ISRAEL)
    assert israel_dt.strftime("%A") == "Saturday"
    assert israel_dt.date() == utc_instant.date() + timedelta(days=1)


# ---------- transition matrix ----------

@pytest.mark.parametrize("from_state", list(av.ALLOWED_TRANSITIONS))
@pytest.mark.parametrize(
    "to_state",
    ["accepting_orders", "available_today", "full_this_week", "on_vacation"],
)
def test_all_transitions_permitted(from_state, to_state):
    # Fully permissive matrix — never raises for valid state pairs.
    validate_transition(from_state, to_state)


def test_transition_to_unknown_state_rejected():
    with pytest.raises(AvailabilityValidationError) as ei:
        validate_transition("accepting_orders", "banana_state")
    assert ei.value.kind == "value"


def test_transition_from_none_allows_any_initial_state():
    validate_transition(None, "on_vacation")  # new producer — no constraint


def test_transition_from_legacy_unknown_state_not_locked_out():
    # A row carrying a pre-enum state must still be able to move forward.
    validate_transition("legacy_weird", "accepting_orders")


# ---------- vacation return-date guard ----------

def test_non_vacation_state_clears_vacation_until():
    assert resolve_vacation_until("accepting_orders", date(2099, 1, 1)) is None


def test_on_vacation_requires_return_date():
    with pytest.raises(AvailabilityValidationError) as ei:
        resolve_vacation_until("on_vacation", None)
    assert ei.value.kind == "return_date"


def test_on_vacation_rejects_past_return_date(monkeypatch):
    monkeypatch.setattr(av, "israel_today", lambda: date(2026, 6, 5))
    with pytest.raises(AvailabilityValidationError) as ei:
        resolve_vacation_until("on_vacation", date(2026, 6, 4))
    assert ei.value.kind == "return_date"


def test_on_vacation_accepts_today_boundary(monkeypatch):
    """Return date == today (Israel) is allowed — only strictly-past is rejected."""
    monkeypatch.setattr(av, "israel_today", lambda: date(2026, 6, 5))
    assert resolve_vacation_until("on_vacation", date(2026, 6, 5)) == date(2026, 6, 5)


def test_on_vacation_accepts_future_return_date(monkeypatch):
    monkeypatch.setattr(av, "israel_today", lambda: date(2026, 6, 5))
    assert resolve_vacation_until("on_vacation", date(2026, 6, 20)) == date(2026, 6, 20)


# ---------- API write paths (Postgres / CI) ----------

def _producer_user(db):
    from tests.conftest import make_producer, make_user

    producer = make_producer(db, name="חוות tz")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def test_api_new_endpoint_rejects_past_vacation(client, db):
    from tests.conftest import auth_header

    user, _ = _producer_user(db)
    past = (date.today() - timedelta(days=5)).isoformat()
    resp = client.post(
        "/producers/me/availability-state",
        json={"state": "on_vacation", "vacation_until": past},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_api_new_endpoint_accepts_future_vacation(client, db):
    from tests.conftest import auth_header

    user, _ = _producer_user(db)
    future = (date.today() + timedelta(days=10)).isoformat()
    resp = client.post(
        "/producers/me/availability-state",
        json={"state": "on_vacation", "vacation_until": future},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["vacation_until"] == future


def test_api_legacy_status_rejects_past_vacation(client, db):
    from tests.conftest import auth_header

    user, _ = _producer_user(db)
    past = (date.today() - timedelta(days=3)).isoformat()
    resp = client.post(
        "/producers/me/availability-status",
        json={"status": "vacation", "vacation_until": past},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text
