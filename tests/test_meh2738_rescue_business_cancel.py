"""
Module:   test_meh2738_rescue_business_cancel
Purpose:  The business cancels today's bag. Every open reservation goes with
          it, each buyer gets one email, a bag already handed over stays
          handed, a window that already closed cannot be cancelled, and the
          buyer's page can say that the BUSINESS cancelled.
Related:  backend/app/routers/rescue.py (cancel_offer, list_my_reservations),
          backend/app/services/rescue_emails.py (send_business_cancel_email)
History:  MEH-2738 (creation) — research 6/11 on what is missing when a
          reservation is cancelled; copy approved word for word by Sapir
          («מאשרת 1-8», texts 7 and 8 here).
"""

# ruff: noqa: F811 — fixtures reused from test_rescue.py are injected by name.

from datetime import timedelta

from app.models.models import RescueOffer, RescueOrder
from app.utils.clock import utc_now
from tests.conftest import auth_header, make_user
from tests.test_rescue import _seed_offer, rescue_on, shop  # noqa: F401


def _capture(monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.services.rescue_emails.send_email",
        lambda to, subject, body, html=None, reply_to=None: sent.append(
            {"to": to, "subject": subject, "body": body, "html": html}
        ),
    )
    return sent


def _reserve(client, offer, buyer, qty=1):
    r = client.post(
        "/rescue/orders",
        json={"offer_id": str(offer.id), "qty": qty},
        headers=auth_header(buyer),
    )
    assert r.status_code == 201, r.text
    return r.json()


def _cancel_offer(client, offer, shop):
    return client.post(
        f"/rescue/offers/{offer.id}/cancel", headers=auth_header(shop["owner"])
    )


def _mine(client, buyer):
    r = client.get("/rescue/orders/mine", headers=auth_header(buyer))
    assert r.status_code == 200, r.text
    return r.json()


class TestCancelOffer:
    def test_after_the_pickup_window_closed_it_is_refused(
        self, client, db, shop, rescue_on
    ):
        now = utc_now()
        offer = _seed_offer(
            db,
            shop["location"],
            pickup_start=now - timedelta(hours=3),
            pickup_end=now - timedelta(minutes=1),
            cancel_until=now - timedelta(hours=4),
        )
        r = _cancel_offer(client, offer, shop)
        assert r.status_code == 409
        assert r.json()["detail"] == "זמן האיסוף חלף"
        db.refresh(offer)
        assert offer.status == "active"

    def test_a_bag_already_handed_over_stays_handed(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        _capture(monkeypatch)
        offer = _seed_offer(db, shop["location"])
        handed_buyer = make_user(db, email="handed2738@example.com")
        open_buyer = make_user(db, email="open2738@example.com")
        handed = _reserve(client, offer, handed_buyer)
        waiting = _reserve(client, offer, open_buyer)
        assert (
            client.post(
                f"/rescue/orders/{handed['id']}/handed",
                headers=auth_header(shop["owner"]),
            ).status_code
            == 200
        )

        assert _cancel_offer(client, offer, shop).status_code == 200
        statuses = {
            str(o.id): o.status
            for o in db.query(RescueOrder).filter(RescueOrder.offer_id == offer.id)
        }
        assert statuses == {handed["id"]: "handed", waiting["id"]: "cancelled"}

    def test_each_buyer_with_an_open_reservation_gets_one_email(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        sent = _capture(monkeypatch)
        offer = _seed_offer(db, shop["location"], qty_total=6)
        twice = make_user(db, email="twice2738@example.com")
        once = make_user(db, email="once2738@example.com")
        gone = make_user(db, email="gone2738@example.com")
        handed_buyer = make_user(db, email="got2738@example.com")
        _reserve(client, offer, twice)
        _reserve(client, offer, twice)
        _reserve(client, offer, once)
        left = _reserve(client, offer, gone)
        client.post(f"/rescue/orders/{left['id']}/cancel", headers=auth_header(gone))
        got = _reserve(client, offer, handed_buyer)
        client.post(
            f"/rescue/orders/{got['id']}/handed", headers=auth_header(shop["owner"])
        )
        sent.clear()

        assert _cancel_offer(client, offer, shop).status_code == 200
        assert sorted(m["to"] for m in sent) == [
            "once2738@example.com",
            "twice2738@example.com",
        ]

    def test_the_email_says_it_word_for_word(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        sent = _capture(monkeypatch)
        offer = _seed_offer(db, shop["location"])
        buyer = make_user(db, email="copy2738@example.com")
        _reserve(client, offer, buyer)
        sent.clear()

        assert _cancel_offer(client, offer, shop).status_code == 200
        (mail,) = sent
        name = shop["producer"].name
        assert mail["subject"] == f"הסל ב{name} בוטל"
        assert (
            f"בית העסק {name} ביטל את סל ההפתעה של היום, ולכן גם השריון שלכם בוטל. "
            "אין צורך להגיע ואין מה לשלם."
        ) in mail["body"]
        assert "מצטערים. אולי יש סל אחר באזור: לסלים של היום" in mail["body"]
        assert "/rescue" in mail["body"]
        assert "צוות מהמקור 🌱" in mail["body"]
        assert 'href="' in mail["html"] and '/rescue"' in mail["html"]
        assert "לסלים של היום" in mail["html"]

    def test_no_reservations_no_email(self, client, db, shop, rescue_on, monkeypatch):
        sent = _capture(monkeypatch)
        offer = _seed_offer(db, shop["location"])
        assert _cancel_offer(client, offer, shop).status_code == 200
        assert sent == []

    def test_a_refused_cancel_sends_nothing(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        sent = _capture(monkeypatch)
        offer = _seed_offer(db, shop["location"])
        buyer = make_user(db, email="refused2738@example.com")
        _reserve(client, offer, buyer)
        assert _cancel_offer(client, offer, shop).status_code == 200
        sent.clear()
        assert _cancel_offer(client, offer, shop).status_code == 409
        assert sent == []


class TestMineAfterABusinessCancel:
    def test_the_business_cancelled_reservation_is_returned_and_flagged(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        _capture(monkeypatch)
        offer = _seed_offer(db, shop["location"])
        buyer = make_user(db, email="flag2738@example.com")
        made = _reserve(client, offer, buyer)
        (row,) = _mine(client, buyer)
        assert row["cancelled_by_business"] is False

        assert _cancel_offer(client, offer, shop).status_code == 200
        (row,) = _mine(client, buyer)
        assert row["id"] == made["id"]
        assert row["status"] == "cancelled"
        assert row["cancelled_by_business"] is True

    def test_a_buyer_who_cancelled_first_is_not_told_the_business_did(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        """The edge case: she cancelled, nobody else held a bag, then the
        business cancelled. Her row is the latest cancel on the offer, so a
        "latest cancelled_at" rule alone would mislabel it."""
        _capture(monkeypatch)
        offer = _seed_offer(db, shop["location"])
        buyer = make_user(db, email="first2738@example.com")
        made = _reserve(client, offer, buyer)
        client.post(f"/rescue/orders/{made['id']}/cancel", headers=auth_header(buyer))
        assert _cancel_offer(client, offer, shop).status_code == 200
        assert _mine(client, buyer) == []

    def test_only_the_rows_the_business_cancelled_are_flagged(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        _capture(monkeypatch)
        offer = _seed_offer(db, shop["location"])
        early = make_user(db, email="early2738@example.com")
        late = make_user(db, email="late2738@example.com")
        mine_early = _reserve(client, offer, early)
        client.post(
            f"/rescue/orders/{mine_early['id']}/cancel", headers=auth_header(early)
        )
        mine_late = _reserve(client, offer, late)
        assert _cancel_offer(client, offer, shop).status_code == 200

        assert _mine(client, early) == []
        (row,) = _mine(client, late)
        assert (row["id"], row["cancelled_by_business"]) == (mine_late["id"], True)

    def test_a_buyer_cancel_on_a_live_offer_stays_absent(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        _capture(monkeypatch)
        offer = _seed_offer(db, shop["location"])
        buyer = make_user(db, email="live2738@example.com")
        made = _reserve(client, offer, buyer)
        client.post(f"/rescue/orders/{made['id']}/cancel", headers=auth_header(buyer))
        assert db.get(RescueOffer, offer.id).status == "active"
        assert _mine(client, buyer) == []
