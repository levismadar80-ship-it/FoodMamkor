"""MEH-2703 — «נמסרו בחינם»: today's offers with their leftover, and the
owner's report of how many uncollected bags were given away free.

Each guard below was shown red against a broken build (PR body):
  - leftover counted before pickup_end            -> test_leftover_is_zero_until_the_window_closes
  - no-show bags left out of the leftover         -> test_leftover_is_unreserved_plus_no_show
  - cap removed from set_donated                  -> test_cannot_report_more_than_was_left
  - ownership check removed                       -> test_another_business_cannot_report_on_mine
"""

# ruff: noqa: F811 — fixtures reused from test_rescue_pilot.py are injected by name.
from datetime import timedelta

from conftest import auth_header, make_producer, make_user

from app.models.models import ProducerLocation, RescueOrder
from app.utils.clock import utc_now
from test_rescue_pilot import _seed_offer, rescue_on, shop  # noqa: F401


def _closed_offer(db, location, **over):
    now = utc_now()
    over.setdefault("pickup_start", now - timedelta(hours=3))
    over.setdefault("pickup_end", now - timedelta(minutes=5))
    over.setdefault("cancel_until", now - timedelta(hours=4))
    return _seed_offer(db, location, **over)


def _order(db, offer, buyer, code, status, qty=1):
    order = RescueOrder(
        offer_id=offer.id, user_id=buyer.id, qty=qty, pickup_code=code, status=status
    )
    db.add(order)
    db.commit()
    return order


class TestTodaysOffers:
    def test_leftover_is_zero_until_the_window_closes(
        self, client, db, shop, rescue_on
    ):
        _seed_offer(db, shop["location"], qty_total=4, qty_left=3)
        rows = client.get(
            "/producers/me/rescue/offers", headers=auth_header(shop["owner"])
        ).json()
        assert [(r["qty_left"], r["leftover"]) for r in rows] == [(3, 0)]

    def test_leftover_is_unreserved_plus_no_show(self, client, db, shop, rescue_on):
        buyer = make_user(db, email="d1@example.com")
        db.commit()
        # 5 bags: 2 never reserved, 1 handed, 2 reserved by one buyer who did
        # not come, 0 still unmarked.
        offer = _closed_offer(db, shop["location"], qty_total=5, qty_left=2)
        _order(db, offer, buyer, "1111", "handed")
        _order(db, offer, buyer, "2222", "no_show", qty=2)
        rows = client.get(
            "/producers/me/rescue/offers", headers=auth_header(shop["owner"])
        ).json()
        assert rows[0]["leftover"] == 4
        assert rows[0]["qty_donated"] == 0

    def test_an_unmarked_reservation_is_not_leftover(self, client, db, shop, rescue_on):
        buyer = make_user(db, email="d2@example.com")
        db.commit()
        offer = _closed_offer(db, shop["location"], qty_total=2, qty_left=0)
        _order(db, offer, buyer, "3333", "reserved", qty=2)
        rows = client.get(
            "/producers/me/rescue/offers", headers=auth_header(shop["owner"])
        ).json()
        assert rows[0]["leftover"] == 0

    def test_a_cancelled_offer_has_no_leftover(self, client, db, shop, rescue_on):
        _closed_offer(db, shop["location"], qty_total=3, qty_left=3, status="cancelled")
        rows = client.get(
            "/producers/me/rescue/offers", headers=auth_header(shop["owner"])
        ).json()
        assert rows[0]["leftover"] == 0


class TestReportDonated:
    def _put(self, client, user, offer, qty):
        return client.put(
            f"/producers/me/rescue/offers/{offer.id}/donated",
            json={"qty": qty},
            headers=auth_header(user),
        )

    def test_records_and_corrects_the_count(self, client, db, shop, rescue_on):
        offer = _closed_offer(db, shop["location"], qty_total=4, qty_left=3)
        r = self._put(client, shop["owner"], offer, 3)
        assert r.status_code == 200, r.text
        assert r.json()["qty_donated"] == 3
        # A set, not an increment: the same tap twice stays 3, and a mistake
        # is corrected by sending the right number.
        assert self._put(client, shop["owner"], offer, 3).json()["qty_donated"] == 3
        assert self._put(client, shop["owner"], offer, 1).json()["qty_donated"] == 1
        db.refresh(offer)
        assert offer.qty_donated == 1

    def test_cannot_report_more_than_was_left(self, client, db, shop, rescue_on):
        offer = _closed_offer(db, shop["location"], qty_total=4, qty_left=2)
        r = self._put(client, shop["owner"], offer, 3)
        assert r.status_code == 422
        db.refresh(offer)
        assert offer.qty_donated == 0

    def test_not_before_the_window_closes(self, client, db, shop, rescue_on):
        offer = _seed_offer(db, shop["location"], qty_total=4, qty_left=4)
        assert self._put(client, shop["owner"], offer, 1).status_code == 409

    def test_not_on_a_cancelled_offer(self, client, db, shop, rescue_on):
        offer = _closed_offer(db, shop["location"], status="cancelled")
        assert self._put(client, shop["owner"], offer, 1).status_code == 409

    def test_another_business_cannot_report_on_mine(self, client, db, shop, rescue_on):
        offer = _closed_offer(db, shop["location"], qty_total=4, qty_left=4)
        other = make_producer(db, name="עסק זר", city="חיפה")
        intruder = make_user(db, email="intruder@example.com", role="producer")
        intruder.producer_id = other.id
        intruder.is_producer = True
        db.add(
            ProducerLocation(
                producer_id=other.id,
                kind="branch",
                is_primary=True,
                city="חיפה",
                address="זר 1",
                lat=32.79,
                lng=34.98,
                location_precision="exact",
            )
        )
        db.commit()
        assert self._put(client, intruder, offer, 1).status_code == 403
        db.refresh(offer)
        assert offer.qty_donated == 0

    def test_metrics_sum_what_was_given_away(self, client, db, shop, rescue_on):
        offer = _closed_offer(db, shop["location"], qty_total=4, qty_left=3)
        self._put(client, shop["owner"], offer, 2)
        admin = make_user(db, email="pilot-admin@example.com", role="admin")
        db.commit()
        m = client.get("/admin/rescue/metrics", headers=auth_header(admin)).json()
        assert m["bags_donated"] == 2
