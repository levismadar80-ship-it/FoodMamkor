"""MEH-2649 — the pilot controls: per-town gate, the business's counter list,
and the admin metrics (chunk 5 of MEH-2643).

The town gate is the part worth reading. `RESCUE_BAGS_CITIES` empty means NO
town, not every town, and both halves matter:
  - a business outside the list cannot publish (a bag nobody could see), and
  - the public list filters by the same set on READ, so a town removed from
    the list stops serving offers that were published while it was in.
A gate on the write alone would leave yesterday's towns live.
"""

from datetime import timedelta

import pytest
from conftest import auth_header, make_producer, make_user

from app.models.models import ProducerLocation, RescueOffer, RescueOrder
from app.routers import rescue as rescue_module
from app.utils.clock import israel_today, utc_now


@pytest.fixture
def rescue_on(monkeypatch):
    monkeypatch.setattr(rescue_module, "rescue_bags_enabled", lambda: True)
    monkeypatch.setattr(rescue_module, "rescue_cities", lambda: ("חיפה",))
    return True


@pytest.fixture
def shop(db):
    producer = make_producer(db, name="מאפיית הפיילוט", city="חיפה")
    owner = make_user(db, email="pilot-owner@example.com", role="producer")
    owner.producer_id = producer.id
    owner.is_producer = True
    location = ProducerLocation(
        producer_id=producer.id,
        kind="branch",
        is_primary=True,
        city="חיפה",
        address="הנביאים 10",
        lat=32.7940,
        lng=34.9896,
        location_precision="exact",
    )
    db.add(location)
    db.commit()
    db.refresh(location)
    return {"producer": producer, "owner": owner, "location": location}


def _payload(location, **over):
    now = utc_now()
    body = {
        "producer_location_id": str(location.id),
        "date": israel_today().isoformat(),
        "qty_total": 4,
        "price_agorot": 1500,
        "pickup_start": (now + timedelta(hours=1)).isoformat(),
        "pickup_end": (now + timedelta(hours=3)).isoformat(),
        "cancel_until": (now + timedelta(minutes=30)).isoformat(),
    }
    body.update(over)
    return body


def _seed_offer(db, location, **over):
    now = utc_now()
    offer = RescueOffer(
        producer_location_id=location.id,
        date=over.get("date", israel_today()),
        qty_total=over.get("qty_total", 4),
        qty_left=over.get("qty_left", 4),
        price_agorot=1500,
        pickup_start=over.get("pickup_start", now + timedelta(hours=1)),
        pickup_end=over.get("pickup_end", now + timedelta(hours=3)),
        cancel_until=over.get("cancel_until", now + timedelta(minutes=30)),
        status=over.get("status", "active"),
    )
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return offer


class TestTownGate:
    def test_empty_city_list_means_no_town_not_every_town(
        self, client, db, shop, monkeypatch, rescue_on
    ):
        """The safe default, and the one a missing env var produces."""
        monkeypatch.setattr(rescue_module, "rescue_cities", lambda: ())
        r = client.post(
            "/rescue/offers",
            json=_payload(shop["location"]),
            headers=auth_header(shop["owner"]),
        )
        assert r.status_code == 403
        assert client.get("/rescue/offers").json() == []

    def test_a_business_outside_the_pilot_towns_cannot_publish(
        self, client, db, shop, monkeypatch, rescue_on
    ):
        monkeypatch.setattr(rescue_module, "rescue_cities", lambda: ("אילת",))
        r = client.post(
            "/rescue/offers",
            json=_payload(shop["location"]),
            headers=auth_header(shop["owner"]),
        )
        assert r.status_code == 403
        assert "ביישוב" in r.json()["detail"]

    def test_the_read_is_gated_too_so_a_removed_town_stops_serving(
        self, client, db, shop, monkeypatch, rescue_on
    ):
        """Publish while the town is in, then take the town out.

        This is the case a write-only gate gets wrong: the offer already
        exists, and nothing would stop it being listed.
        """
        _seed_offer(db, shop["location"])
        assert len(client.get("/rescue/offers").json()) == 1  # control: it IS listed

        monkeypatch.setattr(rescue_module, "rescue_cities", lambda: ("אילת",))
        assert client.get("/rescue/offers").json() == []

    def test_asking_for_a_town_outside_the_pilot_returns_empty(
        self, client, db, shop, rescue_on
    ):
        _seed_offer(db, shop["location"])
        assert client.get("/rescue/offers", params={"city": "אילת"}).json() == []
        # Control: the pilot town still answers.
        assert len(client.get("/rescue/offers", params={"city": "חיפה"}).json()) == 1

    def test_the_city_list_is_parsed_and_CANONICALISED(self, monkeypatch):
        """Whitespace and empty entries are forgiven, and each name is run
        through `canonical_city` — so an operator who writes «תל אביב» in the
        env var still matches rows stored as «תל אביב-יפו». Without that the
        gate would silently close on a town someone believed they had opened,
        which is the worst failure this setting can have."""

        class Fake:
            rescue_bags_cities = " חיפה , תל אביב ,, "

        monkeypatch.setattr(rescue_module, "settings", Fake())
        assert rescue_module.rescue_cities() == ("חיפה", "תל אביב-יפו")
        assert rescue_module.city_in_pilot("תל אביב") is True
        assert rescue_module.city_in_pilot("תל אביב-יפו") is True
        assert rescue_module.city_in_pilot("חיפה") is True
        assert rescue_module.city_in_pilot("אילת") is False
        assert rescue_module.city_in_pilot(None) is False

        class Empty:
            pass

        monkeypatch.setattr(rescue_module, "settings", Empty())
        assert rescue_module.rescue_cities() == ()
        assert rescue_module.city_in_pilot("חיפה") is False


class TestOwnerOrderList:
    def _order(self, db, offer, buyer, code, **over):
        order = RescueOrder(
            offer_id=offer.id,
            user_id=buyer.id,
            qty=over.get("qty", 1),
            pickup_code=code,
            status=over.get("status", "reserved"),
        )
        db.add(order)
        db.commit()
        db.refresh(order)
        return order

    def test_lists_todays_codes_for_this_business_only(
        self, client, db, shop, rescue_on
    ):
        buyer = make_user(db, email="b1@example.com")
        db.commit()
        offer = _seed_offer(db, shop["location"])
        self._order(db, offer, buyer, "0431")

        # Another business's bag must not appear on this dashboard.
        other = make_producer(db, name="עסק אחר", city="חיפה")
        other_loc = ProducerLocation(
            producer_id=other.id,
            kind="branch",
            is_primary=True,
            city="חיפה",
            address="אחר 1",
            lat=32.79,
            lng=34.98,
            location_precision="exact",
        )
        db.add(other_loc)
        db.commit()
        db.refresh(other_loc)
        self._order(db, _seed_offer(db, other_loc), buyer, "0999")

        r = client.get(
            "/producers/me/rescue/orders", headers=auth_header(shop["owner"])
        )
        assert r.status_code == 200
        rows = r.json()
        assert [row["pickup_code"] for row in rows] == ["0431"]
        # The dashboard needs pickup_end to decide whether «לא הגיע» is legal.
        assert rows[0]["pickup_end"] is not None

    def test_does_not_return_who_the_buyer_is(self, client, db, shop, rescue_on):
        """Handing a bag over needs four digits, not a customer list."""
        buyer = make_user(db, email="private@example.com", name="שם פרטי")
        db.commit()
        self._order(db, _seed_offer(db, shop["location"]), buyer, "0500")
        row = client.get(
            "/producers/me/rescue/orders", headers=auth_header(shop["owner"])
        ).json()[0]
        serialized = str(row)
        assert "private@example.com" not in serialized
        assert "שם פרטי" not in serialized
        assert "user_id" not in row

    def test_yesterdays_bags_are_not_on_the_counter_list(
        self, client, db, shop, rescue_on
    ):
        buyer = make_user(db, email="yesterday@example.com")
        db.commit()
        old = _seed_offer(db, shop["location"], date=israel_today() - timedelta(days=1))
        self._order(db, old, buyer, "0001")
        assert (
            client.get(
                "/producers/me/rescue/orders", headers=auth_header(shop["owner"])
            ).json()
            == []
        )
        # Control: the same shape dated today DOES appear.
        self._order(db, _seed_offer(db, shop["location"]), buyer, "0002")
        assert (
            len(
                client.get(
                    "/producers/me/rescue/orders", headers=auth_header(shop["owner"])
                ).json()
            )
            == 1
        )

    def test_a_business_without_a_linked_producer_is_refused(
        self, client, db, rescue_on
    ):
        orphan = make_user(db, email="orphan@example.com", role="producer")
        db.commit()
        r = client.get("/producers/me/rescue/orders", headers=auth_header(orphan))
        assert r.status_code == 403


class TestPilotMetrics:
    def test_rates_are_none_rather_than_zero_when_nothing_was_offered(
        self, client, db, rescue_on
    ):
        """A pilot with no bags has no sell-through. Reporting 0% would read
        as "nothing sold" rather than "nothing published" — the one thing the
        operator must not be told wrongly in week one."""
        admin = make_user(db, email="metrics-admin@example.com", role="admin")
        db.commit()
        body = client.get("/admin/rescue/metrics", headers=auth_header(admin)).json()
        assert body["offers_total"] == 0
        assert body["sell_through"] is None
        assert body["no_show_rate"] is None

    def test_counts_sell_through_no_show_rate_and_repeat_buyers(
        self, client, db, shop, rescue_on
    ):
        admin = make_user(db, email="metrics2@example.com", role="admin")
        repeat = make_user(db, email="repeat@example.com")
        once = make_user(db, email="once@example.com")
        db.commit()

        offer = _seed_offer(
            db, shop["location"], qty_total=10, qty_left=7
        )  # 3 reserved
        db.add_all(
            [
                RescueOrder(
                    offer_id=offer.id,
                    user_id=repeat.id,
                    qty=1,
                    pickup_code="1001",
                    status="handed",
                ),
                RescueOrder(
                    offer_id=offer.id,
                    user_id=repeat.id,
                    qty=1,
                    pickup_code="1002",
                    status="no_show",
                ),
                RescueOrder(
                    offer_id=offer.id,
                    user_id=once.id,
                    qty=1,
                    pickup_code="1003",
                    status="reserved",
                ),
            ]
        )
        db.commit()

        body = client.get("/admin/rescue/metrics", headers=auth_header(admin)).json()
        assert body["bags_offered"] == 10
        assert body["bags_reserved"] == 3
        assert body["sell_through"] == 0.3
        assert body["orders_total"] == 3
        assert body["no_shows"] == 1
        assert round(body["no_show_rate"], 4) == round(1 / 3, 4)
        assert body["buyers_total"] == 2
        assert body["repeat_buyers"] == 1, "a buyer with two reservations is the repeat"

    def test_only_an_admin_may_read_the_metrics(self, client, db, shop, rescue_on):
        r = client.get("/admin/rescue/metrics", headers=auth_header(shop["owner"]))
        assert r.status_code == 403


class TestTypicalItems:
    def test_empty_until_set_then_upserts_in_place(self, client, db, shop, rescue_on):
        headers = auth_header(shop["owner"])
        assert (
            client.get("/producers/me/rescue/typical-items", headers=headers).json()[
                "items"
            ]
            == []
        )

        first = client.put(
            "/producers/me/rescue/typical-items",
            json={"items": ["לחם", "  חלה  ", "", "בורקס"]},
            headers=headers,
        )
        assert first.status_code == 200
        # Blank entries dropped, surrounding space trimmed.
        assert first.json()["items"] == ["לחם", "חלה", "בורקס"]

        second = client.put(
            "/producers/me/rescue/typical-items",
            json={"items": ["ירקות"]},
            headers=headers,
        )
        assert second.json()["items"] == ["ירקות"]
        # ONE row per business — the second PUT must not insert a second.
        from app.models.models import RescueTypicalItems as _T

        assert db.query(_T).filter(_T.producer_id == shop["producer"].id).count() == 1

    def test_the_list_is_bounded(self, client, db, shop, rescue_on):
        """A «בדרך כלל» line has to stay one line on a phone."""
        r = client.put(
            "/producers/me/rescue/typical-items",
            json={"items": [f"פריט {i}" for i in range(20)]},
            headers=auth_header(shop["owner"]),
        )
        assert r.status_code == 422

    def test_another_business_cannot_write_mine(self, client, db, shop, rescue_on):
        intruder = make_user(db, email="intruder-items@example.com", role="producer")
        other = make_producer(db, name="עסק זר", city="חיפה")
        intruder.producer_id = other.id
        intruder.is_producer = True
        db.commit()
        client.put(
            "/producers/me/rescue/typical-items",
            json={"items": ["זר"]},
            headers=auth_header(intruder),
        )
        # The write landed on the INTRUDER's own business, not on mine.
        mine = client.get(
            "/producers/me/rescue/typical-items", headers=auth_header(shop["owner"])
        ).json()
        assert mine["items"] == []


class TestPilotMetricsCancellations:
    """MEH-2737 — cancelled reservations and cancelled bags must not move the
    two numbers the pilot is judged on (no-show rate → prepay decision, and
    sell-through)."""

    def test_cancelled_orders_leave_the_no_show_denominator(
        self, client, db, shop, rescue_on
    ):
        admin = make_user(db, email="m-cancel@example.com", role="admin")
        a = make_user(db, email="m-a@example.com")
        b = make_user(db, email="m-b@example.com")
        db.commit()
        offer = _seed_offer(db, shop["location"], qty_total=10, qty_left=8)
        db.add_all(
            [
                RescueOrder(offer_id=offer.id, user_id=a.id, qty=1,
                            pickup_code="2001", status="handed"),
                RescueOrder(offer_id=offer.id, user_id=a.id, qty=1,
                            pickup_code="2002", status="no_show"),
                RescueOrder(offer_id=offer.id, user_id=b.id, qty=1,
                            pickup_code="2003", status="cancelled"),
                RescueOrder(offer_id=offer.id, user_id=b.id, qty=1,
                            pickup_code="2004", status="cancelled"),
            ]
        )
        db.commit()
        body = client.get("/admin/rescue/metrics", headers=auth_header(admin)).json()
        assert body["orders_total"] == 4
        assert body["orders_cancelled"] == 2
        assert body["no_show_rate"] == 0.5, "1 no-show of 2 orders that stood"
        assert body["buyers_total"] == 1, "a buyer who only cancelled bought nothing"
        assert body["repeat_buyers"] == 1

    def test_a_cancelled_bag_is_neither_offered_nor_reserved(
        self, client, db, shop, rescue_on
    ):
        admin = make_user(db, email="m-offer@example.com", role="admin")
        db.commit()
        _seed_offer(db, shop["location"], qty_total=10, qty_left=5)
        _seed_offer(
            db, shop["location"], qty_total=6, qty_left=2, status="cancelled"
        )
        body = client.get("/admin/rescue/metrics", headers=auth_header(admin)).json()
        assert body["bags_offered"] == 10
        assert body["bags_reserved"] == 5
        assert body["sell_through"] == 0.5
        assert body["offers_cancelled"] == 1
