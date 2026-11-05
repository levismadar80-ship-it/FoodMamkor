"""
Module:   test_meh2680_rescue_my_orders
Purpose:  A buyer can read back today's own reservations — the code they must
          say at the counter, the status, and whether they already reviewed —
          after leaving the page. Nobody else's, nothing cancelled, nothing
          from another day.
Related:  backend/app/routers/rescue.py (GET /rescue/orders/mine),
          frontend/components/rescue/RescueSection.jsx (restores from it)
History:  MEH-2680 (creation) — staging 05/11: a reload lost the code, and the
          review (shown only once the order is «handed») was unreachable,
          because the order lived only in component state.
"""

# ruff: noqa: F811 — fixtures reused from test_rescue.py are injected by name.

from datetime import timedelta

from app.utils.clock import israel_today
from tests.conftest import auth_header, make_user
from tests.test_rescue import _seed_offer, rescue_on, shop  # noqa: F401


def _reserve(client, offer, buyer):
    r = client.post(
        "/rescue/orders",
        json={"offer_id": str(offer.id), "qty": 1},
        headers=auth_header(buyer),
    )
    assert r.status_code == 201, r.text
    return r.json()


class TestMine:
    def test_needs_a_signed_in_buyer(self, client, rescue_on):
        assert client.get("/rescue/orders/mine").status_code == 401

    def test_dark_while_the_flag_is_off(self, client, db):
        buyer = make_user(db, email="dark2680@example.com")
        r = client.get("/rescue/orders/mine", headers=auth_header(buyer))
        assert r.status_code == 404

    def test_returns_todays_reservation_with_its_code(
        self, client, db, shop, rescue_on
    ):
        offer = _seed_offer(db, shop["location"])
        buyer = make_user(db, email="mine2680@example.com")
        made = _reserve(client, offer, buyer)

        r = client.get("/rescue/orders/mine", headers=auth_header(buyer))
        assert r.status_code == 200, r.text
        (row,) = r.json()
        assert row["id"] == made["id"]
        assert row["offer_id"] == str(offer.id)
        assert row["pickup_code"] == made["pickup_code"]
        assert row["status"] == "reserved"
        assert row["reviewed"] is False
        assert row["price_agorot"] == offer.price_agorot
        assert row["pickup_start"].endswith("Z")
        assert row["producer_id"] == str(shop["location"].producer_id)

    def test_handed_then_reviewed_is_reported(self, client, db, shop, rescue_on):
        offer = _seed_offer(db, shop["location"])
        buyer = make_user(db, email="rev2680@example.com")
        made = _reserve(client, offer, buyer)
        client.post(
            f"/rescue/orders/{made['id']}/handed", headers=auth_header(shop["owner"])
        )
        (row,) = client.get("/rescue/orders/mine", headers=auth_header(buyer)).json()
        assert (row["status"], row["reviewed"]) == ("handed", False)

        client.post(
            f"/rescue/orders/{made['id']}/review",
            json={"rating": 5},
            headers=auth_header(buyer),
        )
        (row,) = client.get("/rescue/orders/mine", headers=auth_header(buyer)).json()
        assert (row["status"], row["reviewed"]) == ("handed", True)

    def test_cancelled_other_buyers_and_other_days_are_absent(
        self, client, db, shop, rescue_on
    ):
        today = _seed_offer(db, shop["location"])
        buyer = make_user(db, email="only2680@example.com")
        stranger = make_user(db, email="other2680@example.com")

        cancelled = _reserve(client, today, buyer)
        assert (
            client.post(
                f"/rescue/orders/{cancelled['id']}/cancel", headers=auth_header(buyer)
            ).status_code
            == 200
        )
        _reserve(client, today, stranger)
        kept = _reserve(client, today, buyer)

        # An order on yesterday's offer, written directly (the API refuses to
        # reserve a past day, which is the point of the date filter).
        from app.models.models import RescueOrder

        yesterday = _seed_offer(
            db, shop["location"], date=israel_today() - timedelta(days=1)
        )
        db.add(
            RescueOrder(
                offer_id=yesterday.id,
                user_id=buyer.id,
                qty=1,
                pickup_code="9999",
                status="reserved",
            )
        )
        db.commit()

        rows = client.get("/rescue/orders/mine", headers=auth_header(buyer)).json()
        assert [r["id"] for r in rows] == [kept["id"]]
