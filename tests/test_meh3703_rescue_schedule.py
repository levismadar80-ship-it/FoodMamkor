"""MEH-3703 — a business sets its surprise-bag routine once, and the bags of
each scheduled day in reach (today, tomorrow) publish themselves.

CLOCK BASIS (testing.md): the service takes `today` and `now` as arguments, so
every case below passes a fixed Israel date and a fixed UTC instant and never
reads the runner's clock. The route cases use `rescue_on`, which pins
`rescue_module.israel_today()` for the whole test.

Shown red against a broken build (PR body):
  - the weekday mask ignored               -> test_only_the_routine_days_publish
  - the existence check dropped            -> test_a_second_run_publishes_nothing
  - cancelled offers not counted           -> test_a_day_cancelled_by_hand_does_not_come_back
  - skip_dates ignored                     -> test_a_skipped_day_does_not_publish
  - a fixed +2 offset instead of zoneinfo  -> test_the_clock_change_moves_no_pickup_hour
  - paused ignored                         -> test_a_paused_routine_publishes_nothing
  - the ownership check removed            -> test_another_business_cannot_set_my_routine
"""

# ruff: noqa: F811 — fixtures reused from test_rescue.py are injected by name.
from datetime import date, datetime, timedelta

import pytest
from conftest import auth_header, make_producer, make_user

from app.models.models import RescueOffer
from app.routers import rescue as rescue_module
from app.schemas.rescue_schedule import RescueScheduleIn, weekday_bit
from app.services.rescue_schedule import publish_due, save_routine, set_skip
from test_rescue import rescue_on, shop  # noqa: F401

DAY = timedelta(days=1)
# Thursday 10/12/2026, 09:00 Israel (07:00 UTC). Tomorrow is Friday.
THU = date(2026, 12, 10)
THU_MORNING = datetime(2026, 12, 10, 7, 0)
EVERY_DAY = 127


def _pilot(city):
    return city == "חיפה"


def _routine(**over):
    body = {
        "weekdays": EVERY_DAY,
        "pickup_start": "18:00",
        "pickup_end": "20:00",
        "cancel_minutes": 60,
        "qty": 4,
        "price_agorot": 1500,
    }
    body.update(over)
    return RescueScheduleIn(**body)


def _set(db, location, today=THU, **over):
    save_routine(location, _routine(**over), today)
    db.commit()


def _bags(db, location):
    return (
        db.query(RescueOffer)
        .filter(RescueOffer.producer_location_id == location.id)
        .order_by(RescueOffer.date)
        .all()
    )


class TestWeekdayBit:
    def test_sunday_is_one_and_saturday_sixty_four(self):
        assert weekday_bit(date(2026, 12, 6)) == 1  # Sunday
        assert weekday_bit(date(2026, 12, 10)) == 16  # Thursday
        assert weekday_bit(date(2026, 12, 12)) == 64  # Saturday


class TestPublish:
    def test_today_and_tomorrow_publish_with_the_routine_values(self, db, shop):
        _set(db, shop["location"])
        assert publish_due(db, today=THU, now=THU_MORNING, in_pilot=_pilot) == 2
        bags = _bags(db, shop["location"])
        assert [b.date for b in bags] == [THU, THU + DAY]
        thu = bags[0]
        # 18:00 Israel in December (UTC+2) is 16:00 UTC; cancel 60 minutes before.
        assert thu.pickup_start == datetime(2026, 12, 10, 16, 0)
        assert thu.pickup_end == datetime(2026, 12, 10, 18, 0)
        assert thu.cancel_until == datetime(2026, 12, 10, 15, 0)
        assert (thu.qty_total, thu.qty_left, thu.price_agorot) == (4, 4, 1500)
        assert thu.status == "active"

    def test_only_the_routine_days_publish(self, db, shop):
        _set(db, shop["location"], weekdays=weekday_bit(THU + DAY))  # Fridays only
        assert publish_due(db, today=THU, now=THU_MORNING, in_pilot=_pilot) == 1
        assert [b.date for b in _bags(db, shop["location"])] == [THU + DAY]

    def test_a_second_run_publishes_nothing(self, db, shop):
        _set(db, shop["location"])
        publish_due(db, today=THU, now=THU_MORNING, in_pilot=_pilot)
        assert publish_due(db, today=THU, now=THU_MORNING, in_pilot=_pilot) == 0
        assert len(_bags(db, shop["location"])) == 2

    def test_a_day_cancelled_by_hand_does_not_come_back(self, db, shop):
        _set(db, shop["location"])
        publish_due(db, today=THU, now=THU_MORNING, in_pilot=_pilot)
        friday = _bags(db, shop["location"])[1]
        friday.status = "cancelled"
        db.commit()
        assert publish_due(db, today=THU, now=THU_MORNING, in_pilot=_pilot) == 0
        assert [b.status for b in _bags(db, shop["location"])] == ["active", "cancelled"]

    def test_a_skipped_day_does_not_publish(self, db, shop):
        _set(db, shop["location"])
        set_skip(shop["location"], THU + DAY, skip=True, today=THU)
        db.commit()
        assert publish_due(db, today=THU, now=THU_MORNING, in_pilot=_pilot) == 1
        assert [b.date for b in _bags(db, shop["location"])] == [THU]

    def test_a_paused_routine_publishes_nothing(self, db, shop):
        _set(db, shop["location"], paused=True)
        assert publish_due(db, today=THU, now=THU_MORNING, in_pilot=_pilot) == 0

    def test_a_window_already_over_today_is_not_published(self, db, shop):
        _set(db, shop["location"])
        evening = datetime(2026, 12, 10, 18, 30)  # 20:30 Israel, today's window over
        assert publish_due(db, today=THU, now=evening, in_pilot=_pilot) == 1
        assert [b.date for b in _bags(db, shop["location"])] == [THU + DAY]

    def test_the_clock_change_moves_no_pickup_hour(self, db, shop):
        """Israel moves to summer time on Friday 26/3/2027. 18:00 stays 18:00
        on the wall: 16:00 UTC on Thursday, 15:00 UTC on Friday."""
        thursday = date(2027, 3, 25)
        _set(db, shop["location"], today=thursday)
        publish_due(db, today=thursday, now=datetime(2027, 3, 25, 7, 0), in_pilot=_pilot)
        thu, fri = _bags(db, shop["location"])
        assert thu.pickup_start == datetime(2027, 3, 25, 16, 0)
        assert fri.pickup_start == datetime(2027, 3, 26, 15, 0)

    def test_a_point_that_cannot_host_a_bag_publishes_nothing(self, db, shop):
        _set(db, shop["location"])
        assert publish_due(db, today=THU, now=THU_MORNING, in_pilot=lambda _c: False) == 0
        shop["location"].location_precision = "approximate"
        db.commit()
        assert publish_due(db, today=THU, now=THU_MORNING, in_pilot=_pilot) == 0

    def test_a_point_without_a_routine_is_untouched(self, db, shop):
        assert publish_due(db, today=THU, now=THU_MORNING, in_pilot=_pilot) == 0
        assert _bags(db, shop["location"]) == []


class TestSkip:
    def test_a_day_past_two_weeks_is_refused(self, db, shop):
        _set(db, shop["location"])
        with pytest.raises(ValueError):
            set_skip(shop["location"], THU + 15 * DAY, skip=True, today=THU)

    def test_skips_in_the_past_are_dropped_on_the_next_write(self, db, shop):
        _set(db, shop["location"])
        set_skip(shop["location"], THU + DAY, skip=True, today=THU)
        routine = set_skip(shop["location"], THU + 3 * DAY, skip=True, today=THU + 2 * DAY)
        assert routine.skip_dates == [THU + 3 * DAY]

    def test_saving_the_routine_again_keeps_the_skips_ahead(self, db, shop):
        _set(db, shop["location"])
        set_skip(shop["location"], THU + 2 * DAY, skip=True, today=THU)
        _set(db, shop["location"], qty=6)
        assert shop["location"].rescue_schedule["skip_dates"] == [
            (THU + 2 * DAY).isoformat()
        ]


class TestRoutes:
    def _body(self, **over):
        return _routine(**over).model_dump()

    def test_save_lists_and_publishes_at_once(self, client, db, shop, rescue_on):
        url = f"/producers/me/rescue/locations/{shop['location'].id}/schedule"
        r = client.put(url, json=self._body(), headers=auth_header(shop["owner"]))
        assert r.status_code == 200, r.text
        assert r.json()["schedule"]["qty"] == 4
        # Saved at test time: tomorrow's window is always ahead, today's may
        # be over, so at least tomorrow's bag is up.
        dates = {b.date for b in _bags(db, shop["location"])}
        assert rescue_module.israel_today() + DAY in dates
        listed = client.get(
            "/producers/me/rescue/schedules", headers=auth_header(shop["owner"])
        )
        assert listed.status_code == 200
        assert [row["schedule"]["qty"] for row in listed.json()] == [4]

    def test_no_points_lists_nothing(self, client, db, rescue_on):
        producer = make_producer(db, name="בלי נקודות", city="חיפה")
        owner = make_user(db, email="nopoints@example.com", role="producer")
        owner.producer_id = producer.id
        owner.is_producer = True
        db.commit()
        r = client.get("/producers/me/rescue/schedules", headers=auth_header(owner))
        assert r.status_code == 200
        assert r.json() == []

    def test_another_business_cannot_set_my_routine(self, client, db, shop, rescue_on):
        other = make_producer(db, name="עסק אחר", city="חיפה")
        intruder = make_user(db, email="intruder@example.com", role="producer")
        intruder.producer_id = other.id
        intruder.is_producer = True
        db.commit()
        url = f"/producers/me/rescue/locations/{shop['location'].id}/schedule"
        r = client.put(url, json=self._body(), headers=auth_header(intruder))
        assert r.status_code == 404
        db.refresh(shop["location"])
        assert shop["location"].rescue_schedule is None

    def test_an_inexact_point_is_refused(self, client, db, shop, rescue_on):
        shop["location"].location_precision = "approximate"
        db.commit()
        url = f"/producers/me/rescue/locations/{shop['location'].id}/schedule"
        r = client.put(url, json=self._body(), headers=auth_header(shop["owner"]))
        assert r.status_code == 422
        assert r.json()["detail"] == "נקודת האיסוף צריכה כתובת מדויקת כדי לפרסם סל"

    def test_a_window_that_ends_before_it_starts_is_refused(
        self, client, db, shop, rescue_on
    ):
        url = f"/producers/me/rescue/locations/{shop['location'].id}/schedule"
        body = self._body()
        body["pickup_end"] = "17:00"
        r = client.put(url, json=body, headers=auth_header(shop["owner"]))
        assert r.status_code == 422

    def test_skip_then_unskip_a_day(self, client, db, shop, rescue_on):
        today = rescue_module.israel_today()
        base = f"/producers/me/rescue/locations/{shop['location'].id}/schedule"
        client.put(base, json=self._body(weekdays=weekday_bit(today + 3 * DAY)),
                   headers=auth_header(shop["owner"]))
        day = (today + 3 * DAY).isoformat()
        r = client.put(f"{base}/skips/{day}", headers=auth_header(shop["owner"]))
        assert r.status_code == 200, r.text
        assert r.json()["schedule"]["skip_dates"] == [day]
        r = client.delete(f"{base}/skips/{day}", headers=auth_header(shop["owner"]))
        assert r.json()["schedule"]["skip_dates"] == []

    def test_skip_without_a_routine_is_refused(self, client, db, shop, rescue_on):
        day = (rescue_module.israel_today() + DAY).isoformat()
        r = client.put(
            f"/producers/me/rescue/locations/{shop['location'].id}/schedule/skips/{day}",
            headers=auth_header(shop["owner"]),
        )
        assert r.status_code == 422
        assert r.json()["detail"] == "אין לוח קבוע בנקודה הזאת"

    def test_delete_stops_the_routine_and_keeps_the_bags(
        self, client, db, shop, rescue_on
    ):
        base = f"/producers/me/rescue/locations/{shop['location'].id}/schedule"
        client.put(base, json=self._body(), headers=auth_header(shop["owner"]))
        before = len(_bags(db, shop["location"]))
        r = client.delete(base, headers=auth_header(shop["owner"]))
        assert r.status_code == 200
        assert r.json()["schedule"] is None
        assert len(_bags(db, shop["location"])) == before

