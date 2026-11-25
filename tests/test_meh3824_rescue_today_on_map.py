"""MEH-3824 — the map shows a business's bag today as a row in its card
(no pin badge: Sapir 25/11). The map reads `rescue_today` off the producer list it already
loads, so the field has to carry exactly the bags the bag list would offer
today, the earliest first, and nothing while the pilot is off.
"""

# ruff: noqa: F811 — fixtures reused from test_rescue_pilot.py are injected by name.
from datetime import timedelta

from app.models.models import ProducerLocation
from app.routers import rescue as rescue_module
from app.utils.clock import israel_today, utc_now
from test_rescue_pilot import _seed_offer, rescue_on, shop  # noqa: F401


def _listed(client, producer):
    rows = client.get("/producers", params={"city": "חיפה"}).json()
    return next(r for r in rows if r["id"] == str(producer.id))


class TestRescueTodayOnTheList:
    def test_no_bag_no_field(self, client, db, shop, rescue_on):
        assert _listed(client, shop["producer"])["rescue_today"] is None

    def test_a_bag_today_is_carried_with_price_and_window(
        self, client, db, shop, rescue_on
    ):
        offer = _seed_offer(db, shop["location"], qty_left=3)
        offer.value_min_agorot = 4500
        db.commit()
        row = _listed(client, shop["producer"])["rescue_today"]
        assert row["offer_id"] == str(offer.id)
        assert row["location_id"] == str(shop["location"].id)
        assert row["price_agorot"] == 1500
        assert row["value_min_agorot"] == 4500
        assert row["qty_left"] == 3
        # UTC on the wire, like every rescue time (MEH-2679).
        assert row["pickup_start"].endswith(("Z", "+00:00"))

    def test_the_earliest_pickup_wins(self, client, db, shop, rescue_on):
        now = utc_now()
        _seed_offer(
            db,
            shop["location"],
            pickup_start=now + timedelta(hours=4),
            pickup_end=now + timedelta(hours=6),
        )
        early = _seed_offer(db, shop["location"])  # +1h .. +3h
        row = _listed(client, shop["producer"])["rescue_today"]
        assert row["offer_id"] == str(early.id)

    def test_a_bag_at_a_second_point_counts(self, client, db, shop, rescue_on):
        point = ProducerLocation(
            producer_id=shop["producer"].id,
            kind="pickup",
            is_primary=False,
            city="חיפה",
            address="מסדה 5",
            lat=32.80,
            lng=34.99,
            location_precision="exact",
        )
        db.add(point)
        db.commit()
        offer = _seed_offer(db, point)
        row = _listed(client, shop["producer"])["rescue_today"]
        assert row["location_id"] == str(point.id)
        assert row["offer_id"] == str(offer.id)

    def test_the_earliest_pickup_wins_across_points(
        self, client, db, shop, rescue_on
    ):
        point = ProducerLocation(
            producer_id=shop["producer"].id,
            kind="pickup",
            is_primary=False,
            city="חיפה",
            address="מסדה 5",
            lat=32.80,
            lng=34.99,
            location_precision="exact",
        )
        db.add(point)
        db.commit()
        now = utc_now()
        _seed_offer(
            db,
            shop["location"],
            pickup_start=now + timedelta(hours=4),
            pickup_end=now + timedelta(hours=6),
        )
        early = _seed_offer(db, point)  # +1h .. +3h
        row = _listed(client, shop["producer"])["rescue_today"]
        assert row["offer_id"] == str(early.id)
        assert row["location_id"] == str(point.id)

    def test_tomorrows_bag_is_not_today(self, client, db, shop, rescue_on):
        now = utc_now()
        _seed_offer(
            db,
            shop["location"],
            date=israel_today() + timedelta(days=1),
            pickup_start=now + timedelta(days=1, hours=1),
            pickup_end=now + timedelta(days=1, hours=3),
            cancel_until=now + timedelta(days=1),
        )
        assert _listed(client, shop["producer"])["rescue_today"] is None

    def test_sold_out_is_not_shown(self, client, db, shop, rescue_on):
        _seed_offer(db, shop["location"], qty_left=0)
        assert _listed(client, shop["producer"])["rescue_today"] is None

    def test_cancelled_is_not_shown(self, client, db, shop, rescue_on):
        _seed_offer(db, shop["location"], status="cancelled")
        assert _listed(client, shop["producer"])["rescue_today"] is None

    def test_a_bag_past_its_reserve_cutoff_is_not_shown(
        self, client, db, shop, rescue_on
    ):
        # Reserving closes 15 minutes before the window ends (MEH-2726); the
        # map row must not offer a bag the reserve button would refuse.
        now = utc_now()
        _seed_offer(
            db,
            shop["location"],
            pickup_start=now - timedelta(hours=1),
            pickup_end=now + timedelta(minutes=10),
            cancel_until=now - timedelta(hours=2),
        )
        assert _listed(client, shop["producer"])["rescue_today"] is None

    def test_a_town_outside_the_pilot_is_not_shown(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        _seed_offer(db, shop["location"])
        monkeypatch.setattr(rescue_module, "rescue_cities", lambda: ("חדרה",))
        assert _listed(client, shop["producer"])["rescue_today"] is None

    def test_an_unapproved_business_is_not_shown(self, client, db, shop, rescue_on):
        # A pending business is not on the public list at all; the field must
        # still never describe it. Seed it, approve-gate it, read the helper.
        from app.services.producer_queries import attach_rescue_today

        _seed_offer(db, shop["location"])
        producer = shop["producer"]
        producer.status = "pending"
        db.commit()
        attach_rescue_today([producer], db)
        assert producer.rescue_today is None

    def test_dark_while_the_pilot_is_off(self, client, db, shop, monkeypatch):
        # The town list names Haifa, so only the switch keeps it dark.
        monkeypatch.setattr(rescue_module, "rescue_cities", lambda: ("חיפה",))
        _seed_offer(db, shop["location"])
        assert _listed(client, shop["producer"])["rescue_today"] is None
