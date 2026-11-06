"""MEH-2716 — «מצילים מזון»: a system badge for a business that saved at
least one surprise bag in the last 30 days (a bag handed over at the counter,
or bags reported «נמסרו בחינם»). Computed, never declared; dark while the
pilot is off.
"""

# ruff: noqa: F811 — fixtures reused from test_rescue_pilot.py are injected by name.
from datetime import timedelta

from conftest import make_user

from app.models.models import RescueOrder
from app.utils.clock import utc_now
from test_rescue_pilot import _seed_offer, rescue_on, shop  # noqa: F401


def _detail(client, producer):
    return client.get(f"/producers/{producer.id}").json()


def _listed(client, producer):
    rows = client.get("/producers", params={"city": "חיפה"}).json()
    return next(r for r in rows if r["id"] == str(producer.id))


def _handed(db, shop, days_ago):
    buyer = make_user(db, email=f"saver-{days_ago}@example.com")
    db.commit()
    offer = _seed_offer(db, shop["location"])
    db.add(
        RescueOrder(
            offer_id=offer.id,
            user_id=buyer.id,
            qty=1,
            pickup_code="4321",
            status="handed",
            handed_at=utc_now() - timedelta(days=days_ago),
        )
    )
    db.commit()


class TestRescueSavingBadge:
    def test_no_bag_saved_no_badge(self, client, db, shop, rescue_on):
        assert _detail(client, shop["producer"])["rescued_recently"] is False
        assert _listed(client, shop["producer"])["rescued_recently"] is False

    def test_a_bag_handed_this_month_lights_it(self, client, db, shop, rescue_on):
        _handed(db, shop, days_ago=3)
        assert _detail(client, shop["producer"])["rescued_recently"] is True
        assert _listed(client, shop["producer"])["rescued_recently"] is True

    def test_bags_given_away_free_light_it(self, client, db, shop, rescue_on):
        now = utc_now()
        offer = _seed_offer(
            db,
            shop["location"],
            pickup_start=now - timedelta(days=2, hours=2),
            pickup_end=now - timedelta(days=2),
            cancel_until=now - timedelta(days=2, hours=3),
        )
        offer.qty_donated = 1
        db.commit()
        assert _detail(client, shop["producer"])["rescued_recently"] is True

    def test_a_bag_saved_31_days_ago_does_not(self, client, db, shop, rescue_on):
        _handed(db, shop, days_ago=31)
        assert _detail(client, shop["producer"])["rescued_recently"] is False

    def test_a_reservation_not_yet_handed_does_not(self, client, db, shop, rescue_on):
        buyer = make_user(db, email="waiting@example.com")
        db.commit()
        offer = _seed_offer(db, shop["location"])
        db.add(
            RescueOrder(
                offer_id=offer.id,
                user_id=buyer.id,
                qty=1,
                pickup_code="5555",
                status="reserved",
            )
        )
        db.commit()
        assert _detail(client, shop["producer"])["rescued_recently"] is False

    def test_dark_while_the_pilot_is_off(self, client, db, shop):
        # No rescue_on: the switch reads False, so the data is there but the
        # badge must not be.
        _handed(db, shop, days_ago=3)
        assert _detail(client, shop["producer"])["rescued_recently"] is False
