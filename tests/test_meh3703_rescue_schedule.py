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
  - one transaction for every point        -> test_one_point_the_database_refuses_does_not_stop_the_others
  - a skip that leaves the bag up          -> test_skipping_a_day_cancels_its_bag_already_up
  - the reserved check dropped             -> test_skipping_a_reserved_bag_asks_first
  - require_producer on save again         -> test_an_unverified_owner_cannot_save
  - the paid-tool check dropped from the job -> test_a_closed_paid_tool_publishes_nothing
"""

# ruff: noqa: F811 — fixtures reused from test_rescue.py are injected by name.
from datetime import date, datetime, timedelta

import pytest
from conftest import auth_header, make_producer, make_user

from app import pricing
from app.models.billing import BusinessBilling
from app.models.models import RescueOffer, RescueOrder
from app.routers import rescue as rescue_module
from app.schemas.rescue_schedule import RescueScheduleIn, weekday_bit
from app.services import rescue_schedule as schedule_module
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


@pytest.fixture
def morning(monkeypatch, rescue_on):
    """The routes' UTC clock pinned to 07:00 UTC of the pinned Israel today
    (09:00 or 10:00 in Israel), so today's and tomorrow's windows are ahead."""
    today = rescue_module.israel_today()
    now = datetime(today.year, today.month, today.day, 7, 0)
    monkeypatch.setattr(rescue_module, "utc_now", lambda: now)
    return today


def _intruder(db):
    other = make_producer(db, name="עסק אחר", city="חיפה")
    intruder = make_user(db, email="intruder@example.com", role="producer")
    intruder.producer_id = other.id
    intruder.is_producer = True
    db.commit()
    return intruder


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
        assert [b.status for b in _bags(db, shop["location"])] == [
            "active",
            "cancelled",
        ]

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
        publish_due(
            db, today=thursday, now=datetime(2027, 3, 25, 7, 0), in_pilot=_pilot
        )
        thu, fri = _bags(db, shop["location"])
        assert thu.pickup_start == datetime(2027, 3, 25, 16, 0)
        assert fri.pickup_start == datetime(2027, 3, 26, 15, 0)

    def test_a_point_that_cannot_host_a_bag_publishes_nothing(self, db, shop):
        _set(db, shop["location"])
        assert (
            publish_due(db, today=THU, now=THU_MORNING, in_pilot=lambda _c: False) == 0
        )
        shop["location"].location_precision = "approximate"
        db.commit()
        assert publish_due(db, today=THU, now=THU_MORNING, in_pilot=_pilot) == 0

    def test_a_point_without_a_routine_is_untouched(self, db, shop):
        assert publish_due(db, today=THU, now=THU_MORNING, in_pilot=_pilot) == 0
        assert _bags(db, shop["location"]) == []

    def test_an_unapproved_business_publishes_nothing(self, db, shop):
        _set(db, shop["location"])
        shop["producer"].status = "pending"
        db.commit()
        assert publish_due(db, today=THU, now=THU_MORNING, in_pilot=_pilot) == 0

    def test_a_closed_paid_tool_publishes_nothing(self, db, shop, monkeypatch):
        _set(db, shop["location"])
        monkeypatch.setattr(pricing, "BILLING_PHASE", "billing")
        db.add(BusinessBilling(producer_id=shop["producer"].id, state="unpaid"))
        db.commit()
        assert publish_due(db, today=THU, now=THU_MORNING, in_pilot=_pilot) == 0

    def test_a_window_past_its_reserve_cut_off_is_not_published(self, db, shop):
        _set(db, shop["location"])
        # 19:50 Israel: today's window ends at 20:00, reserving closed at 19:45.
        late = datetime(2026, 12, 10, 17, 50)
        assert publish_due(db, today=THU, now=late, in_pilot=_pilot) == 1
        assert [b.date for b in _bags(db, shop["location"])] == [THU + DAY]

    def test_a_window_the_clock_change_folds_away_is_not_published(self, db, shop):
        """02:00 does not exist on Friday 26/3/2027 (the clock jumps to 03:00),
        so 02:30–03:15 that night ends before it starts. Thursday is normal."""
        thursday = date(2027, 3, 25)
        _set(
            db,
            shop["location"],
            today=thursday,
            pickup_start="02:30",
            pickup_end="03:15",
        )
        midnight = datetime(2027, 3, 24, 22, 0)  # 00:00 Israel on Thursday
        assert publish_due(db, today=thursday, now=midnight, in_pilot=_pilot) == 1
        assert [b.date for b in _bags(db, shop["location"])] == [thursday]

    def test_one_point_the_database_refuses_does_not_stop_the_others(
        self, db, shop, monkeypatch
    ):
        other = make_producer(db, name="מאפייה שנייה", city="חיפה")
        healthy = type(shop["location"])(
            producer_id=other.id,
            kind="branch",
            is_primary=True,
            city="חיפה",
            address="הרצל 1",
            lat=32.8,
            lng=35.0,
            location_precision="exact",
        )
        db.add(healthy)
        db.commit()
        _set(db, shop["location"])
        _set(db, healthy)
        real = schedule_module._bag_for

        def overflowing(location, routine, day):
            bag = real(location, routine, day)
            if location.id == shop["location"].id:
                bag.price_agorot = 10**12  # past INTEGER: the database refuses it
            return bag

        monkeypatch.setattr(schedule_module, "_bag_for", overflowing)
        assert publish_due(db, today=THU, now=THU_MORNING, in_pilot=_pilot) == 2
        assert len(_bags(db, healthy)) == 2
        assert _bags(db, shop["location"]) == []


class TestSkip:
    def test_a_day_past_two_weeks_is_refused(self, db, shop):
        _set(db, shop["location"])
        with pytest.raises(ValueError):
            set_skip(shop["location"], THU + 15 * DAY, skip=True, today=THU)

    def test_skips_in_the_past_are_dropped_on_the_next_write(self, db, shop):
        _set(db, shop["location"])
        set_skip(shop["location"], THU + DAY, skip=True, today=THU)
        routine = set_skip(
            shop["location"], THU + 3 * DAY, skip=True, today=THU + 2 * DAY
        )
        assert routine.skip_dates == [THU + 3 * DAY]

    def test_saving_the_routine_again_keeps_the_skips_ahead(self, db, shop):
        _set(db, shop["location"])
        set_skip(shop["location"], THU + 2 * DAY, skip=True, today=THU)
        _set(db, shop["location"], qty=6)
        assert shop["location"].rescue_schedule["skip_dates"] == [
            (THU + 2 * DAY).isoformat()
        ]

    def test_saving_over_an_unreadable_routine_keeps_its_skips(self, db, shop):
        shop["location"].rescue_schedule = {
            "weekdays": 0,  # no longer valid
            "skip_dates": [(THU + 2 * DAY).isoformat()],
        }
        db.commit()
        _set(db, shop["location"])
        assert shop["location"].rescue_schedule["skip_dates"] == [
            (THU + 2 * DAY).isoformat()
        ]


class TestRoutes:
    def _body(self, **over):
        return _routine(**over).model_dump()

    def test_save_lists_and_publishes_at_once(self, client, db, shop, morning):
        url = f"/producers/me/rescue/locations/{shop['location'].id}/schedule"
        r = client.put(url, json=self._body(), headers=auth_header(shop["owner"]))
        assert r.status_code == 200, r.text
        assert r.json()["schedule"]["qty"] == 4
        assert r.json()["publishing"] is True
        assert [b.date for b in _bags(db, shop["location"])] == [morning, morning + DAY]
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
        intruder = _intruder(db)
        url = f"/producers/me/rescue/locations/{shop['location'].id}/schedule"
        r = client.put(url, json=self._body(), headers=auth_header(intruder))
        assert r.status_code == 404
        db.refresh(shop["location"])
        assert shop["location"].rescue_schedule is None

    def test_another_business_cannot_touch_my_routine_or_skips(
        self, client, db, shop, morning
    ):
        base = f"/producers/me/rescue/locations/{shop['location'].id}/schedule"
        client.put(base, json=self._body(), headers=auth_header(shop["owner"]))
        intruder = _intruder(db)
        day = (morning + 3 * DAY).isoformat()
        assert client.delete(base, headers=auth_header(intruder)).status_code == 404
        assert (
            client.put(f"{base}/skips/{day}", headers=auth_header(intruder)).status_code
            == 404
        )
        assert (
            client.delete(
                f"{base}/skips/{day}", headers=auth_header(intruder)
            ).status_code
            == 404
        )
        listed = client.get(
            "/producers/me/rescue/schedules", headers=auth_header(intruder)
        )
        assert listed.json() == []
        db.refresh(shop["location"])
        assert shop["location"].rescue_schedule["skip_dates"] == []
        assert all(b.status == "active" for b in _bags(db, shop["location"]))

    def test_an_admin_is_not_an_owner_here(self, client, db, shop, rescue_on):
        admin = make_user(db, email="admin3703@example.com", role="admin")
        url = f"/producers/me/rescue/locations/{shop['location'].id}/schedule"
        r = client.put(url, json=self._body(), headers=auth_header(admin))
        assert r.status_code == 403

    def test_an_unverified_owner_cannot_save(self, client, db, shop, rescue_on):
        shop["owner"].email_verified = False
        db.commit()
        url = f"/producers/me/rescue/locations/{shop['location'].id}/schedule"
        r = client.put(url, json=self._body(), headers=auth_header(shop["owner"]))
        assert r.status_code == 403
        db.refresh(shop["location"])
        assert shop["location"].rescue_schedule is None

    def test_a_closed_paid_tool_cannot_save(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        monkeypatch.setattr(pricing, "BILLING_PHASE", "billing")
        db.add(BusinessBilling(producer_id=shop["producer"].id, state="unpaid"))
        db.commit()
        url = f"/producers/me/rescue/locations/{shop['location'].id}/schedule"
        r = client.put(url, json=self._body(), headers=auth_header(shop["owner"]))
        assert r.status_code == 403
        assert _bags(db, shop["location"]) == []

    def test_a_price_past_the_bound_is_refused(self, client, db, shop, rescue_on):
        url = f"/producers/me/rescue/locations/{shop['location'].id}/schedule"
        body = self._body()
        body["price_agorot"] = 1_000_001
        r = client.put(url, json=body, headers=auth_header(shop["owner"]))
        assert r.status_code == 422
        db.refresh(shop["location"])
        assert shop["location"].rescue_schedule is None

    def test_the_routes_are_hidden_while_the_flag_is_off(self, client, db, shop):
        r = client.get(
            "/producers/me/rescue/schedules", headers=auth_header(shop["owner"])
        )
        assert r.status_code == 404

    def test_the_row_says_when_the_routine_cannot_publish(
        self, client, db, shop, morning
    ):
        shop["producer"].status = "pending"
        db.commit()
        r = client.get(
            "/producers/me/rescue/schedules", headers=auth_header(shop["owner"])
        )
        assert [row["publishing"] for row in r.json()] == [False]

    def test_skipping_a_day_cancels_its_bag_already_up(self, client, db, shop, morning):
        base = f"/producers/me/rescue/locations/{shop['location'].id}/schedule"
        client.put(base, json=self._body(), headers=auth_header(shop["owner"]))
        tomorrow = (morning + DAY).isoformat()
        r = client.put(f"{base}/skips/{tomorrow}", headers=auth_header(shop["owner"]))
        assert r.status_code == 200, r.text
        assert r.json()["schedule"]["skip_dates"] == [tomorrow]
        assert r.json()["closed_days"] == [tomorrow]
        assert [b.status for b in _bags(db, shop["location"])] == [
            "active",
            "cancelled",
        ]

    def test_skipping_a_reserved_bag_asks_first(self, client, db, shop, morning):
        base = f"/producers/me/rescue/locations/{shop['location'].id}/schedule"
        client.put(base, json=self._body(), headers=auth_header(shop["owner"]))
        bag = _bags(db, shop["location"])[1]
        buyer = make_user(db, email="buyer3703@example.com", role="consumer")
        db.add(
            RescueOrder(
                offer_id=bag.id,
                user_id=buyer.id,
                qty=1,
                pickup_code="3703",
                status="reserved",
            )
        )
        bag.qty_left = bag.qty_total - 1
        db.commit()
        tomorrow = (morning + DAY).isoformat()
        r = client.put(f"{base}/skips/{tomorrow}", headers=auth_header(shop["owner"]))
        assert r.status_code == 409
        assert r.json()["detail"] == "יש הזמנות לסל של היום הזה"
        db.refresh(bag)
        db.refresh(shop["location"])
        assert bag.status == "active"
        assert shop["location"].rescue_schedule["skip_dates"] == []
        r = client.put(
            f"{base}/skips/{tomorrow}",
            params={"cancel_reserved": "true"},
            headers=auth_header(shop["owner"]),
        )
        assert r.status_code == 200, r.text
        db.refresh(bag)
        assert bag.status == "cancelled"
        order = db.query(RescueOrder).filter(RescueOrder.offer_id == bag.id).one()
        assert order.status == "cancelled"

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
        client.put(
            base,
            json=self._body(weekdays=weekday_bit(today + 3 * DAY)),
            headers=auth_header(shop["owner"]),
        )
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
