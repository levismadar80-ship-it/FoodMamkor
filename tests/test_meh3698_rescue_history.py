"""
Module:   test_meh3698_rescue_history
Purpose:  A buyer can read back every reservation of theirs, from any day,
          with the business name, so «ההזמנות שלי» can list surprise bags
          next to orders and group buys. Nobody else's rows, newest first,
          capped, and dark while the pilot flag is off.
Related:  backend/app/routers/rescue.py (GET /rescue/orders/history),
          backend/app/services/rescue_reads.py (my_reservation_history)
History:  MEH-3698 (creation)
"""

# ruff: noqa: F811 — fixtures reused from test_rescue.py are injected by name.

from datetime import timedelta

from app.models.models import RescueOrder
from app.services.rescue_reads import HISTORY_MAX_ROWS
from app.utils.clock import israel_today
from tests.conftest import auth_header, make_user
from tests.test_rescue import _seed_offer, rescue_on, shop  # noqa: F401

URL = "/rescue/orders/history"


def _order(db, offer, user, code, status="handed"):
    row = RescueOrder(
        offer_id=offer.id, user_id=user.id, qty=1, pickup_code=code, status=status
    )
    db.add(row)
    db.commit()
    return row


class TestHistory:
    def test_needs_a_signed_in_buyer(self, client, rescue_on):
        assert client.get(URL).status_code == 401

    def test_dark_while_the_flag_is_off(self, client, db):
        buyer = make_user(db, email="dark3698@example.com")
        assert client.get(URL, headers=auth_header(buyer)).status_code == 404

    def test_empty_for_a_buyer_with_no_reservations(self, client, db, rescue_on):
        buyer = make_user(db, email="none3698@example.com")
        r = client.get(URL, headers=auth_header(buyer))
        assert (r.status_code, r.json()) == (200, [])

    def test_past_days_come_back_with_the_business_name(
        self, client, db, shop, rescue_on
    ):
        buyer = make_user(db, email="past3698@example.com")
        old = _seed_offer(db, shop["location"], date=israel_today() - timedelta(days=3))
        made = _order(db, old, buyer, "1234", status="handed")

        r = client.get(URL, headers=auth_header(buyer))
        assert r.status_code == 200, r.text
        (row,) = r.json()
        assert row["id"] == str(made.id)
        assert row["offer_id"] == str(old.id)
        assert row["status"] == "handed"
        assert row["producer_name"] == "מאפיית ההצלה"
        assert row["producer_id"] == str(shop["location"].producer_id)
        assert row["date"] == old.date.isoformat()
        assert row["pickup_end"].endswith("Z")
        assert row["cancelled_by_business"] is False
        # The code is said at the counter on the day; a list row never needs it.
        assert "pickup_code" not in row

    def test_newest_first_and_only_the_callers_rows(self, client, db, shop, rescue_on):
        buyer = make_user(db, email="many3698@example.com")
        stranger = make_user(db, email="other3698@example.com")
        offers = [
            _seed_offer(db, shop["location"], date=israel_today() - timedelta(days=d))
            for d in (5, 0, 2)
        ]
        for i, offer in enumerate(offers):
            _order(db, offer, buyer, f"10{i}0", status="no_show" if i else "handed")
        _order(db, offers[1], stranger, "5555")

        rows = client.get(URL, headers=auth_header(buyer)).json()
        assert [r["offer_id"] for r in rows] == [
            str(offers[1].id),
            str(offers[2].id),
            str(offers[0].id),
        ]
        assert {r["status"] for r in rows} == {"handed", "no_show"}

    def test_capped(self, client, db, shop, rescue_on):
        buyer = make_user(db, email="cap3698@example.com")
        for d in range(HISTORY_MAX_ROWS + 2):
            offer = _seed_offer(
                db, shop["location"], date=israel_today() - timedelta(days=d)
            )
            _order(db, offer, buyer, "4321")
        rows = client.get(URL, headers=auth_header(buyer)).json()
        assert len(rows) == HISTORY_MAX_ROWS
        # The cap drops the OLDEST, not the newest.
        assert rows[0]["date"] == israel_today().isoformat()

    def test_a_business_cancel_is_flagged(self, client, db, shop, rescue_on):
        offer = _seed_offer(db, shop["location"])
        buyer = make_user(db, email="bc3698@example.com")
        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert r.status_code == 201, r.text
        assert (
            client.post(
                f"/rescue/offers/{offer.id}/cancel",
                headers=auth_header(shop["owner"]),
            ).status_code
            == 200
        )
        (row,) = client.get(URL, headers=auth_header(buyer)).json()
        assert (row["status"], row["cancelled_by_business"]) == ("cancelled", True)
