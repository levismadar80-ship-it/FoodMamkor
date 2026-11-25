"""MEH-3824 — the map's four offer switches in «סינון» (Sapir 25/11, option ב):
סלי הפתעה · קבוצות רכישה · אירועים · חוויות.

Two things have to hold for the switches to be honest:

1. Each per-business flag on GET /producers says yes exactly when that kind's
   own public list shows the business something. The front end hides a switch
   no business on the map would match, so a flag that disagrees with its list
   either hides a working switch or shows one that lands on nothing.
2. The `?rescue_today` / `?group_buy` / `?event` / `?experience` filters keep
   the businesses with ANY asked kind (OR), and only those.
"""

# ruff: noqa: F811 — fixtures reused from test_rescue_pilot.py are injected by name.
from datetime import time, timedelta
from decimal import Decimal

import pytest

from conftest import make_producer, make_user
from app.models.models import Event, Experience, GroupBuy
from app.utils.clock import israel_today, utc_now
from test_rescue_pilot import _seed_offer, rescue_on, shop  # noqa: F401

CITY = "חיפה"


def _row(client, producer, **params):
    rows = client.get("/producers", params={"city": CITY, **params}).json()
    return next((r for r in rows if r["id"] == str(producer.id)), None)


def _ids(client, **params):
    return {
        r["id"]
        for r in client.get("/producers", params={"city": CITY, **params}).json()
    }


def _business(db, name):
    return make_producer(db, name=name, city=CITY)


def _group_buy(db, producer, **over):
    data = dict(
        producer_id=producer.id,
        title="רכש קמח מלא",
        description='שק 25 ק"ג',
        product_name="קמח מלא",
        unit="שק",
        price_per_unit_regular=120,
        price_per_unit_group=90,
        min_participants=3,
        max_participants=10,
        deadline=utc_now() + timedelta(days=7),
        city=CITY,
        status="open",
    )
    data.update(over)
    gb = GroupBuy(**data)
    db.add(gb)
    db.commit()
    return gb


def _event(db, producer, **over):
    data = dict(
        producer_id=producer.id,
        title="יום פתוח בחווה",
        event_date=israel_today() + timedelta(days=3),
        category="יום פתוח",
        city=CITY,
        is_active=True,
    )
    data.update(over)
    ev = Event(**data)
    db.add(ev)
    db.commit()
    return ev


def _experience(db, producer, **over):
    host = make_user(db, email=f"host-{producer.id}@example.com", role="producer")
    host.producer_id = producer.id
    host.is_producer = True
    db.commit()
    data = dict(
        title="סדנת לחם",
        description="סדנה של שלוש שעות על לחם מחמצת, מהתחלה ועד הסוף.",
        image_url="https://res.cloudinary.com/demo/image/upload/sample.jpg",
        category="בישול",
        host_user_id=host.id,
        event_date=israel_today() + timedelta(days=7),
        event_time=time(10, 0),
        location_type="home",
        city=CITY,
        max_participants=10,
        price_per_person=Decimal("150"),
        status="approved",
        moderation_status="APPROVED",
    )
    data.update(over)
    ex = Experience(**data)
    db.add(ex)
    db.commit()
    return ex


def _public_list_has(client, path, producer):
    """Does the kind's own public list (as a stranger) show this business?"""
    return len(client.get(path, params={"producer_id": str(producer.id)}).json()) > 0


class TestFlagsMirrorTheirPublicList:
    """Each case seeds one business, then checks the flag AND that the flag
    equals what the kind's public list says — so a drift in either one
    goes red here, not on the map."""

    @pytest.mark.parametrize(
        "over, expected",
        [
            ({}, True),
            ({"status": "funded"}, False),
            ({"deadline": utc_now() - timedelta(hours=1)}, False),
        ],
        ids=["open", "funded-is-not-open", "past-deadline"],
    )
    def test_open_group_buy(self, client, db, over, expected):
        b = _business(db, "קמח הגליל")
        _group_buy(db, b, **over)
        flag = _row(client, b)["has_open_group_buy"]
        assert flag is expected
        assert flag == _public_list_has(client, "/group-buys", b)

    @pytest.mark.parametrize(
        "over, expected",
        [
            ({}, True),
            ({"event_date": israel_today()}, True),
            ({"event_date": israel_today() - timedelta(days=1)}, False),
            ({"is_active": False}, False),
        ],
        ids=["upcoming", "today", "yesterday", "cancelled"],
    )
    def test_upcoming_event(self, client, db, over, expected):
        b = _business(db, "חוות הכרמל")
        _event(db, b, **over)
        flag = _row(client, b)["has_upcoming_event"]
        assert flag is expected
        assert flag == _public_list_has(client, "/events", b)

    @pytest.mark.parametrize(
        "over, expected",
        [
            ({}, True),
            ({"status": "pending"}, False),
            ({"event_date": israel_today() - timedelta(days=2)}, False),
            (
                {
                    "event_date": israel_today() - timedelta(days=2),
                    "is_recurring": True,
                },
                True,
            ),
            ({"is_active": False}, False),
        ],
        ids=["approved-upcoming", "pending", "past", "past-but-recurring", "cancelled"],
    )
    def test_listed_experience(self, client, db, over, expected):
        b = _business(db, "בית הלחם")
        _experience(db, b, **over)
        flag = _row(client, b)["has_listed_experience"]
        assert flag is expected
        assert flag == _public_list_has(client, "/experiences", b)

    def test_a_business_with_nothing_has_no_flags(self, client, db):
        b = _business(db, "סתם בית עסק")
        row = _row(client, b)
        assert (
            row["has_open_group_buy"],
            row["has_upcoming_event"],
            row["has_listed_experience"],
        ) == (
            False,
            False,
            False,
        )

    def test_a_flag_belongs_to_its_own_business_on_a_shared_page(self, client, db):
        # Both businesses come back in ONE page, so a flag computed for the page
        # instead of per business would mark the second one too.
        with_offers = _business(db, "קמח הגליל")
        _group_buy(db, with_offers)
        _event(db, with_offers)
        _experience(db, with_offers)
        without = _business(db, "סתם בית עסק")
        page = {r["id"]: r for r in client.get("/producers", params={"city": CITY}).json()}
        keys = ("has_open_group_buy", "has_upcoming_event", "has_listed_experience")
        assert [page[str(with_offers.id)][k] for k in keys] == [True, True, True]
        assert [page[str(without.id)][k] for k in keys] == [False, False, False]


class TestTheFilters:
    def test_each_switch_keeps_only_its_businesses(self, client, db, shop, rescue_on):
        gb = _business(db, "קמח הגליל")
        _group_buy(db, gb)
        ev = _business(db, "חוות הכרמל")
        _event(db, ev)
        ex = _business(db, "בית הלחם")
        _experience(db, ex)
        _business(db, "סתם בית עסק")
        _seed_offer(db, shop["location"])
        bag = str(shop["producer"].id)

        assert _ids(client, rescue_today="true") == {bag}
        assert _ids(client, group_buy="true") == {str(gb.id)}
        assert _ids(client, event="true") == {str(ev.id)}
        assert _ids(client, experience="true") == {str(ex.id)}

    def test_two_switches_are_either_not_both(self, client, db, shop, rescue_on):
        gb = _business(db, "קמח הגליל")
        _group_buy(db, gb)
        _business(db, "סתם בית עסק")
        _seed_offer(db, shop["location"])
        assert _ids(client, rescue_today="true", group_buy="true") == {
            str(shop["producer"].id),
            str(gb.id),
        }

    def test_the_count_header_agrees_with_the_rows(self, client, db):
        gb = _business(db, "קמח הגליל")
        _group_buy(db, gb)
        _business(db, "סתם בית עסק")
        res = client.get("/producers", params={"city": CITY, "group_buy": "true"})
        assert res.headers["X-Total-Count"] == "1"

    def test_bags_switch_matches_nothing_while_the_pilot_is_off(self, client, db, shop):
        _seed_offer(db, shop["location"])
        _business(db, "סתם בית עסק")
        assert _ids(client, rescue_today="true") == set()

    def test_the_other_filters_still_apply(self, client, db):
        here = _business(db, "קמח הגליל")
        _group_buy(db, here)
        there = make_producer(db, name="קמח הנגב", city="באר שבע")
        _group_buy(db, there, city="באר שבע")
        assert _ids(client, group_buy="true") == {str(here.id)}
