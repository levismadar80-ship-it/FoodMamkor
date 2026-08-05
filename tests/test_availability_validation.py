"""Availability write-path validation + Israel-tz handling — AUD-039/040.

Three layers:
  * pure unit (no DB) — the clock primitive, the transition matrix, and
    the vacation return-date guard, incl. the Fri-23:30-Israel boundary;
  * API (Postgres, CI-gated) — past `vacation_until` rejected on both the
    new and legacy write endpoints;
  * MEH-1883 — the READ-path auto-clear boundary, at the hour where the two
    clocks disagree.

MEH-1883 note: this docstring used to end "the read-path auto-clear boundary
it pins (`< date.today()`) is left untouched". That is no longer true and the
sentence is replaced rather than kept — the write path had been on
`israel_today()` since AUD-039/040 while the read path stayed on the server
clock, so the two halves of the same feature disagreed for the three hours
after Israeli midnight. The read path now uses `israel_today()` too, and the
boundary test at the bottom of this file is what pins it.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from uuid import uuid4
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


# ---------- MEH-1883: the read-path auto-clear, at the disagreeing hour ----------
#
# The whole defect lives in a three-hour window and is invisible outside it, so a
# test that just freezes one clock proves nothing: with a single mock the old
# `date.today()` and the new `israel_today()` return the same day and the
# assertion passes against both implementations. That is the "green with two
# possible causes" shape.
#
# So both clocks are frozen, one day apart, exactly as they stand at 00:30 in
# Israel (21:30 UTC the previous day):
#
#     israel_today() -> 2026-06-05   (Israel has rolled over)
#     date.today()   -> 2026-06-04   (the server has not)
#
# and `vacation_until` is set to 2026-06-04 — a vacation that ended YESTERDAY in
# Israel. Under `israel_today()` the strict `<` fires and the business reopens.
# Under `date.today()` it is `06-04 < 06-04`, false, and the business stays
# hidden from the listings (which default-hide `on_vacation`) until the server
# clock catches up around 03:00 Israel. Reverting schemas.py to `date.today()`
# turns this test red; that is what makes it a test of the change and not of the
# feature in general.


class _ServerClockOneDayBehind(date):
    """A `date` whose `.today()` still reads yesterday — the UTC server at 00:30 Israel.

    Subclasses `date` rather than replacing it so every other use of the name
    inside the schemas module (constructor calls, isinstance checks, Pydantic's
    own coercion) keeps working while only `.today()` is redirected.
    """

    @classmethod
    def today(cls):
        return date(2026, 6, 4)


def test_read_path_auto_clear_uses_israel_day(monkeypatch):
    from app.schemas import schemas as sch

    monkeypatch.setattr(sch, "israel_today", lambda: date(2026, 6, 5))
    monkeypatch.setattr(sch, "date", _ServerClockOneDayBehind)

    out = sch.ProducerListOut.model_validate(
        {
            "id": uuid4(),
            "name": "חוות סוף החופשה",
            "vacation_until": date(2026, 6, 4),
            "availability_state": "on_vacation",
            "availability_status": "vacation",
        }
    )

    assert out.vacation_until is None
    assert out.availability_state == "accepting_orders"
    assert out.availability_status == "available"


def test_read_path_keeps_a_vacation_that_ends_today(monkeypatch):
    """The boundary itself: `vacation_until == today` is still ON vacation.

    The comparison is strict `<`, and this pins that it stays strict — an
    off-by-one here would reopen every business on the morning of its last
    vacation day, which is the mirror of the bug the sweep fixes.
    """
    from app.schemas import schemas as sch

    monkeypatch.setattr(sch, "israel_today", lambda: date(2026, 6, 5))
    monkeypatch.setattr(sch, "date", _ServerClockOneDayBehind)

    out = sch.ProducerListOut.model_validate(
        {
            "id": uuid4(),
            "name": "חוות סוף החופשה",
            "vacation_until": date(2026, 6, 5),
            "availability_state": "on_vacation",
            "availability_status": "vacation",
        }
    )

    assert out.vacation_until == date(2026, 6, 5)
    assert out.availability_state == "on_vacation"
