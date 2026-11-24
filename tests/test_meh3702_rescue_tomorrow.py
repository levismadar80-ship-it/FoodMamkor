"""MEH-3702 — a rescue bag can be published and reserved for tomorrow, and a
buyer who reserved on an earlier day gets a morning-of reminder email.

CLOCK BASIS (testing.md): `rescue_offers.date` is an Israel calendar date. The
`rescue_on` fixture from test_rescue.py pins one "today" for the routes and the
seed, and every date here is read back from that pinned clock
(`rescue_module.israel_today()`), never from `date.today()`.

Each guard was shown red against a broken build (PR body):
  - reserve_days back to "today only"   -> test_tomorrows_bag_is_listed_and_reservable
  - the +1 publish cap removed          -> test_a_bag_two_days_ahead_is_refused
  - the reserve window opened past +1   -> test_a_bag_two_days_ahead_cannot_be_reserved
  - the created_at filter removed       -> test_a_same_day_reservation_gets_no_reminder
  - the pickup-day check removed        -> test_a_bag_for_tomorrow_with_todays_hours_is_refused
  - the ended-window check removed      -> test_a_bag_whose_window_is_over_is_refused
  - the once-a-day guard removed        -> test_a_second_run_the_same_day_sends_nothing
MEH-3805 additions, each shown red the same way:
  - the evening window filter removed   -> test_an_early_window_is_reminded_the_evening_before
  - the morning 08:00 line removed      -> test_the_line_at_eight_splits_the_two_runs
  - the pickup-day hand-over check gone -> test_handing_over_tomorrows_bag_is_a_409
"""

# ruff: noqa: F811 — fixtures reused from test_rescue.py are injected by name.
from datetime import date, time, timedelta

from conftest import auth_header, make_user

from app.models.email_outbox import EmailOutbox
from app.models.models import RescueOrder
from app.routers import rescue as rescue_module
from app.services.rescue_emails import day_word
from app.services.rescue_reminders import (
    EVENING_REMINDER_KIND,
    REMINDER_KIND,
    _day_start_utc,
    _israel_utc,
    queue_evening_reminders,
    queue_morning_reminders,
)
from app.utils.clock import utc_now
from test_rescue import _offer_payload, _seed_offer, rescue_on, shop  # noqa: F401

DAY = timedelta(days=1)


def _today():
    return rescue_module.israel_today()


def _tomorrow_offer(db, location, **over):
    now = utc_now()
    over.setdefault("date", _today() + DAY)
    over.setdefault("pickup_start", now + DAY + timedelta(hours=1))
    over.setdefault("pickup_end", now + DAY + timedelta(hours=3))
    over.setdefault("cancel_until", now + DAY + timedelta(minutes=30))
    return _seed_offer(db, location, **over)


def _order(db, offer, buyer, **over):
    order = RescueOrder(
        offer_id=offer.id,
        user_id=buyer.id,
        qty=1,
        pickup_code=over.get("code", "1234"),
        status=over.get("status", "reserved"),
    )
    if "created_at" in over:
        order.created_at = over["created_at"]
    db.add(order)
    db.commit()
    return order


def _at(day, hour, minute=0):
    """`hour:minute` on `day` on the Israel clock, as naive UTC (MEH-3805:
    the reminder runs are pinned to their clock, not to the suite's hour)."""
    return _israel_utc(day, time(hour, minute))


def _morning_offer(db, location, **over):
    """Today's bag, 09:00–11:00 Israel: the morning run's, at 08:00."""
    day = over.setdefault("date", _today())
    over.setdefault("pickup_start", _at(day, 9))
    over.setdefault("pickup_end", _at(day, 11))
    over.setdefault("cancel_until", _at(day, 8, 30))
    return _seed_offer(db, location, **over)


def _yesterday_evening():
    """A minute before 00:00 on the Israel clock, as naive UTC."""
    return _day_start_utc(_today()) - timedelta(minutes=1)


class TestDayWord:
    def test_today_tomorrow_and_any_other_day(self):
        today = date(2026, 11, 23)
        assert day_word(today, today) == "היום"
        assert day_word(today + DAY, today) == "מחר"
        assert day_word(today + 2 * DAY, today) == ""
        assert day_word(today - DAY, today) == ""


class TestPublish:
    def test_a_bag_for_tomorrow_is_published(self, client, db, shop, rescue_on):
        tomorrow = _today() + DAY
        now = utc_now()
        r = client.post(
            "/rescue/offers",
            json=_offer_payload(
                shop["location"],
                date=tomorrow.isoformat(),
                pickup_start=(now + DAY + timedelta(hours=1)).isoformat(),
                pickup_end=(now + DAY + timedelta(hours=3)).isoformat(),
                cancel_until=(now + DAY + timedelta(minutes=30)).isoformat(),
            ),
            headers=auth_header(shop["owner"]),
        )
        assert r.status_code == 201, r.text
        assert r.json()["date"] == tomorrow.isoformat()

    def test_a_bag_two_days_ahead_is_refused(self, client, db, shop, rescue_on):
        r = client.post(
            "/rescue/offers",
            json=_offer_payload(
                shop["location"], date=(_today() + 2 * DAY).isoformat()
            ),
            headers=auth_header(shop["owner"]),
        )
        assert r.status_code == 422
        assert r.json()["detail"] == "אפשר לפרסם סל רק להיום או למחר"

    def test_a_bag_for_tomorrow_with_todays_hours_is_refused(
        self, client, db, shop, rescue_on
    ):
        """Edge case: tomorrow's date, today's window (an owner's device on
        another clock). It would sit under «מחר» with a window long over."""
        r = client.post(
            "/rescue/offers",
            json=_offer_payload(shop["location"], date=(_today() + DAY).isoformat()),
            headers=auth_header(shop["owner"]),
        )
        assert r.status_code == 422
        assert r.json()["detail"] == "שעות האיסוף צריכות להיות ביום של הסל"

    def test_a_bag_whose_window_is_over_is_refused(self, client, db, shop, rescue_on):
        now = utc_now()
        r = client.post(
            "/rescue/offers",
            json=_offer_payload(
                shop["location"],
                pickup_start=(now - timedelta(hours=3)).isoformat(),
                pickup_end=(now - timedelta(minutes=1)).isoformat(),
                cancel_until=(now - timedelta(hours=4)).isoformat(),
            ),
            headers=auth_header(shop["owner"]),
        )
        assert r.status_code == 422
        assert r.json()["detail"] == "שעת סיום האיסוף כבר עברה"


class TestReserveTomorrow:
    def test_tomorrows_bag_is_listed_and_reservable(self, client, db, shop, rescue_on):
        offer = _tomorrow_offer(db, shop["location"])
        buyer = make_user(db, email="early@example.com")
        db.commit()

        listed = client.get("/rescue/offers").json()
        assert [row["id"] for row in listed] == [str(offer.id)]

        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert r.status_code == 201, r.text
        assert r.json()["date"] == (_today() + DAY).isoformat()

        mine = client.get("/rescue/orders/mine", headers=auth_header(buyer)).json()
        assert [row["date"] for row in mine] == [(_today() + DAY).isoformat()]

    def test_a_bag_two_days_ahead_cannot_be_reserved(self, client, db, shop, rescue_on):
        """Seeded directly: the publish route would refuse it, but a row that
        is already there (an older build, an admin edit) must still be shut."""
        offer = _tomorrow_offer(db, shop["location"], date=_today() + 2 * DAY)
        buyer = make_user(db, email="tooearly@example.com")
        db.commit()
        assert client.get("/rescue/offers").json() == []
        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert r.status_code == 409
        assert r.json()["detail"] == "אפשר לשריין רק סלים של היום ושל מחר"

    def test_the_owner_sees_tomorrows_bag_and_its_orders_with_the_date(
        self, client, db, shop, rescue_on
    ):
        today_offer = _seed_offer(db, shop["location"])
        tomorrow_offer = _tomorrow_offer(db, shop["location"])
        buyer = make_user(db, email="ownerview@example.com")
        db.commit()
        _order(db, tomorrow_offer, buyer, code="2222")
        _order(db, today_offer, buyer, code="1111")

        owner = auth_header(shop["owner"])
        offers = client.get("/producers/me/rescue/offers", headers=owner).json()
        assert sorted(o["date"] for o in offers) == [
            _today().isoformat(),
            (_today() + DAY).isoformat(),
        ]
        orders = client.get("/producers/me/rescue/orders", headers=owner).json()
        # Today's pickups first, whatever order they were reserved in.
        assert [o["date"] for o in orders] == [
            _today().isoformat(),
            (_today() + DAY).isoformat(),
        ]

    def test_the_confirmation_email_says_tomorrow(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        sent = []
        monkeypatch.setattr(
            "app.services.rescue_emails.send_email",
            lambda to, subject, body, html=None, reply_to=None, test_cause=False, kind=None: (
                sent.append({"body": body, "html": html})
            ),
        )
        offer = _tomorrow_offer(db, shop["location"])
        buyer = make_user(db, email="tomorrowmail@example.com")
        db.commit()
        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert r.status_code == 201, r.text
        assert len(sent) == 1
        assert "איסוף מחר " in sent[0]["body"]
        assert "איסוף היום" not in sent[0]["body"]
        assert "לבטל בחינם עד מחר ב-" in sent[0]["body"]


class TestTomorrowEmails:
    """Copy approved by Sapir 24/11 (rows 11 and 12 of the thread table)."""

    @staticmethod
    def _capture(monkeypatch, module):
        sent = []
        monkeypatch.setattr(
            f"app.services.{module}.send_email",
            lambda to, subject, body, html=None, reply_to=None, test_cause=False, kind=None: (
                sent.append(body)
            ),
        )
        return sent

    def test_the_business_hears_of_a_reservation_for_tomorrow(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        sent = self._capture(monkeypatch, "rescue_business_emails")
        monkeypatch.setattr(
            "app.services.rescue_emails.send_email", lambda *a, **k: None
        )
        offer = _tomorrow_offer(db, shop["location"])
        buyer = make_user(db, email="bizmail@example.com")
        db.commit()
        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert r.status_code == 201, r.text
        assert len(sent) == 1
        assert "עכשיו מסלי ההפתעה של מחר." in sent[0]
        assert "איסוף מחר " in sent[0]
        assert "את כל השריונים של היום ושל מחר אפשר לראות בלוח הבקרה:" in sent[0]

    def test_a_buyer_hears_the_business_cancelled_tomorrows_bag(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        sent = self._capture(monkeypatch, "rescue_emails")
        offer = _tomorrow_offer(db, shop["location"])
        buyer = make_user(db, email="cancelmail@example.com")
        db.commit()
        _order(db, offer, buyer)
        r = client.post(
            f"/rescue/offers/{offer.id}/cancel", headers=auth_header(shop["owner"])
        )
        assert r.status_code == 200, r.text
        assert len(sent) == 1
        assert sent[0].startswith(
            "בית העסק מאפיית ההצלה ביטל את סל ההפתעה של מחר, ולכן גם השריון שלכם בוטל. "
            "אין צורך להגיע ואין מה לשלם."
        )


class TestMorningReminder:
    def _rows(self, db):
        return db.query(EmailOutbox).filter(EmailOutbox.kind == REMINDER_KIND).all()

    def test_an_order_from_an_earlier_day_is_reminded_once(self, db, shop, rescue_on):
        offer = _morning_offer(db, shop["location"])
        buyer = make_user(db, email="remindme@example.com")
        db.commit()
        _order(db, offer, buyer, created_at=_yesterday_evening(), code="4321")

        counters = queue_morning_reminders(db, today=_today(), now=_at(_today(), 8))
        assert counters == {"due": 1, "queued": 1}
        rows = self._rows(db)
        assert [r.to_email for r in rows] == ["remindme@example.com"]
        assert rows[0].subject == "היום אוספים את הסל במאפיית ההצלה"
        assert "4321" in rows[0].body
        assert "איסוף היום " in rows[0].body

    def test_a_second_run_the_same_day_sends_nothing(self, db, shop, rescue_on):
        """A second replica or a manual re-run must not send it twice."""
        offer = _morning_offer(db, shop["location"])
        buyer = make_user(db, email="twice@example.com")
        db.commit()
        _order(db, offer, buyer, created_at=_yesterday_evening())

        assert (
            queue_morning_reminders(db, today=_today(), now=_at(_today(), 8))["queued"]
            == 1
        )
        again = queue_morning_reminders(db, today=_today(), now=_at(_today(), 8))
        assert again["queued"] == 0
        assert len(self._rows(db)) == 1

    def test_a_same_day_reservation_gets_no_reminder(self, db, shop, rescue_on):
        """Reserved after 00:00 Israel: the code email reached her today."""
        offer = _morning_offer(db, shop["location"])
        buyer = make_user(db, email="sameday@example.com")
        db.commit()
        _order(
            db, offer, buyer, created_at=_day_start_utc(_today()) + timedelta(minutes=1)
        )

        assert queue_morning_reminders(db, today=_today(), now=_at(_today(), 8)) == {
            "due": 0,
            "queued": 0,
        }
        assert self._rows(db) == []

    def test_cancelled_tomorrow_and_ended_bags_are_skipped(self, db, shop, rescue_on):
        early = _yesterday_evening()
        cancelled = _morning_offer(db, shop["location"])
        buyer = make_user(db, email="skipped@example.com")
        db.commit()
        _order(db, cancelled, buyer, status="cancelled", created_at=early)
        # Tomorrow's bag is reminded tomorrow, not today.
        _order(
            db,
            _tomorrow_offer(db, shop["location"]),
            buyer,
            created_at=early,
            code="5555",
        )

        assert (
            queue_morning_reminders(db, today=_today(), now=_at(_today(), 8))["due"]
            == 0
        )
        # The window is over: nothing to remind about.
        later = cancelled.pickup_end + timedelta(minutes=1)
        assert queue_morning_reminders(db, today=_today(), now=later)["due"] == 0
        assert self._rows(db) == []

    def test_a_test_business_queues_nothing(self, db, shop, rescue_on):
        shop["producer"].is_test = True
        offer = _morning_offer(db, shop["location"])
        buyer = make_user(db, email="testshop@example.com")
        db.commit()
        _order(db, offer, buyer, created_at=_yesterday_evening())

        assert queue_morning_reminders(db, today=_today(), now=_at(_today(), 8)) == {
            "due": 1,
            "queued": 0,
        }
        assert self._rows(db) == []


class TestEveningReminder:
    """MEH-3805: a window that ends by 08:00 is reminded the evening before,
    and only there; the morning run keeps every later window."""

    def _rows(self, db, kind=EVENING_REMINDER_KIND):
        return db.query(EmailOutbox).filter(EmailOutbox.kind == kind).all()

    def _early(self, db, location, end_hour=8):
        day = _today() + DAY
        return _seed_offer(
            db,
            location,
            date=day,
            pickup_start=_at(day, 6),
            pickup_end=_at(day, end_hour),
            cancel_until=_at(day, 5),
        )

    def test_an_early_window_is_reminded_the_evening_before(self, db, shop, rescue_on):
        offer = self._early(db, shop["location"])
        buyer = make_user(db, email="earlybird@example.com")
        db.commit()
        _order(db, offer, buyer, created_at=_at(_today(), 10), code="2468")

        counters = queue_evening_reminders(db, today=_today(), now=_at(_today(), 20))
        assert counters == {"due": 1, "queued": 1}
        rows = self._rows(db)
        assert [r.to_email for r in rows] == ["earlybird@example.com"]
        assert rows[0].subject == "מחר אוספים את הסל במאפיית ההצלה"
        assert "2468" in rows[0].body

    def test_the_line_at_eight_splits_the_two_runs(self, db, shop, rescue_on):
        """Ends 08:00 → evening only; ends 08:01 → morning only."""
        buyer = make_user(db, email="split@example.com")
        db.commit()
        _order(
            db,
            self._early(db, shop["location"]),
            buyer,
            created_at=_at(_today(), 10),
            code="0800",
        )
        day = _today() + DAY
        later = _seed_offer(
            db,
            shop["location"],
            date=day,
            pickup_start=_at(day, 7),
            pickup_end=_at(day, 8, 1),
            cancel_until=_at(day, 6),
        )
        _order(db, later, buyer, created_at=_at(_today(), 10), code="0801")

        queue_evening_reminders(db, today=_today(), now=_at(_today(), 20))
        assert ["0800" in r.body for r in self._rows(db)] == [True]
        # A morning run that fires early (a manual run at 07:00) still leaves
        # the 08:00 window to the evening run that already sent it.
        queue_morning_reminders(db, today=day, now=_at(day, 7))
        morning = self._rows(db, REMINDER_KIND)
        assert ["0801" in r.body for r in morning] == [True]

    def test_a_second_evening_run_sends_nothing(self, db, shop, rescue_on):
        buyer = make_user(db, email="eveagain@example.com")
        db.commit()
        _order(
            db, self._early(db, shop["location"]), buyer, created_at=_at(_today(), 10)
        )

        assert (
            queue_evening_reminders(db, today=_today(), now=_at(_today(), 20))["queued"]
            == 1
        )
        again = queue_evening_reminders(db, today=_today(), now=_at(_today(), 20))
        assert again["queued"] == 0
        assert len(self._rows(db)) == 1

    def test_a_late_window_and_a_cancelled_order_are_not_evening_rows(
        self, db, shop, rescue_on
    ):
        buyer = make_user(db, email="notevening@example.com")
        db.commit()
        _order(
            db,
            _tomorrow_offer(
                db,
                shop["location"],
                pickup_start=_at(_today() + DAY, 17),
                pickup_end=_at(_today() + DAY, 19),
                cancel_until=_at(_today() + DAY, 16),
            ),
            buyer,
        )
        _order(db, self._early(db, shop["location"]), buyer, status="cancelled")

        assert queue_evening_reminders(db, today=_today(), now=_at(_today(), 20)) == {
            "due": 0,
            "queued": 0,
        }


class TestHandOverOnlyOnThePickupDay:
    def test_handing_over_tomorrows_bag_is_a_409(self, client, db, shop, rescue_on):
        """MEH-3805: the dashboard shows no button on tomorrow's rows; a direct
        call is refused too, and the order stays reserved."""
        offer = _tomorrow_offer(db, shop["location"])
        buyer = make_user(db, email="handtomorrow@example.com")
        db.commit()
        order = _order(db, offer, buyer)

        r = client.post(
            f"/rescue/orders/{order.id}/handed", headers=auth_header(shop["owner"])
        )
        assert r.status_code == 409
        assert r.json()["detail"] == "אפשר למסור את הסל רק ביום האיסוף"
        db.refresh(order)
        assert order.status == "reserved"

    def test_yesterdays_bag_can_still_be_marked_handed(
        self, client, db, shop, rescue_on
    ):
        """A business may mark yesterday's bag late: only a future day is refused."""
        now = utc_now()
        offer = _seed_offer(
            db,
            shop["location"],
            date=_today() - DAY,
            pickup_start=now - DAY - timedelta(hours=3),
            pickup_end=now - DAY - timedelta(hours=1),
            cancel_until=now - DAY - timedelta(hours=4),
        )
        buyer = make_user(db, email="handyesterday@example.com")
        db.commit()
        order = _order(db, offer, buyer)

        r = client.post(
            f"/rescue/orders/{order.id}/handed", headers=auth_header(shop["owner"])
        )
        assert r.status_code == 200
        db.refresh(order)
        assert order.status == "handed"

    def test_todays_bag_is_still_handed(self, client, db, shop, rescue_on):
        offer = _seed_offer(db, shop["location"])
        buyer = make_user(db, email="handtoday@example.com")
        db.commit()
        order = _order(db, offer, buyer)

        r = client.post(
            f"/rescue/orders/{order.id}/handed", headers=auth_header(shop["owner"])
        )
        assert r.status_code == 200
