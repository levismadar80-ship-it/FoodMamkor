"""Broken state combinations found while writing docs/STATE_MACHINES.md
(Refs MEH-2871).

1. A buyer deletes her account while she holds a reserved surprise bag. The
   order row cascades away with the user, and the bag used to stay counted as
   taken — nobody could reserve it and the business had no order to hand over.
2. The host cancels an event, or the business leaves the live state, while
   people are signed up. The sign-ups were cancelled and mailed, and the
   billing ledger kept counting them as bookings the business received.
"""

# ruff: noqa: F811 — fixtures reused from test_rescue.py are injected by name.

from app.models.billing import BillableEvent
from app.models.models import RescueOffer, RescueOrder, User
from app.services import billing_ledger

from tests.conftest import auth_header, make_user
from tests.test_meh2943_rescue_idor import _reserve
from tests.test_meh3227_delist_cascade import (  # noqa: F401
    _admin,
    _business,
    _event,
    _experience,
    _signup,
    sent,
)
from tests.test_rescue import _seed_offer, rescue_on, shop  # noqa: F401


def _ledger(db, reg):
    db.expire_all()
    return [
        row.status
        for row in db.query(BillableEvent).filter(BillableEvent.source_id == reg.id)
    ]


class TestDeletedBuyerReleasesHerBag:
    def test_the_reserved_bags_go_back_to_stock(self, client, db, rescue_on, shop):
        offer = _seed_offer(db, shop["location"], qty_total=4)
        buyer = make_user(db, email="leaving@example.com")
        other = make_user(db, email="staying@example.com")
        _reserve(client, offer, buyer, qty=2)
        _reserve(client, offer, other, qty=1)
        db.refresh(offer)
        assert offer.qty_left == 1  # control: the reservations were counted

        buyer_id, other_id, offer_id = buyer.id, other.id, offer.id
        res = client.delete(
            f"/admin/users/{buyer_id}", headers=auth_header(_admin(db))
        )
        assert res.status_code in (200, 204), res.text

        db.expire_all()
        assert db.query(User).filter(User.id == buyer_id).count() == 0
        # Her two bags are back; the other buyer's one is still taken.
        assert db.get(RescueOffer, offer_id).qty_left == 3
        left = db.query(RescueOrder).filter(RescueOrder.offer_id == offer_id).all()
        assert [(o.user_id, o.status) for o in left] == [(other_id, "reserved")]

    def test_a_handed_bag_is_not_returned(self, client, db, rescue_on, shop):
        offer = _seed_offer(db, shop["location"], qty_total=4)
        buyer = make_user(db, email="leaving@example.com")
        order = _reserve(client, offer, buyer, qty=1)
        row = db.get(RescueOrder, order["id"])
        row.status = "handed"
        db.commit()

        offer_id = offer.id
        client.delete(f"/admin/users/{buyer.id}", headers=auth_header(_admin(db)))

        db.expire_all()
        assert db.get(RescueOffer, offer_id).qty_left == 3  # the bag was really taken


class TestHostCancelVoidsTheLedger:
    def test_cancelling_an_event_voids_its_sign_ups(self, client, db, sent):
        producer, owner = _business(db)
        ev = _event(db, producer)
        reg = _signup(db, ev, "a@example.com")
        billing_ledger.record_event_registration(db, reg, ev)
        db.commit()
        assert _ledger(db, reg) == ["counted"]  # control

        res = client.put(
            f"/events/{ev.id}", json={"is_active": False}, headers=auth_header(owner)
        )
        assert res.status_code == 200, res.text
        assert _ledger(db, reg) == ["voided"]

    def test_pausing_the_business_voids_event_and_workshop_sign_ups(
        self, client, db, sent
    ):
        producer, owner = _business(db)
        ev = _event(db, producer)
        ex = _experience(db, owner)
        reg_ev = _signup(db, ev, "a@example.com")
        reg_ex = _signup(db, ex, "b@example.com")
        billing_ledger.record_event_registration(db, reg_ev, ev)
        billing_ledger.record_experience_registration(db, reg_ex, ex, producer.id)
        db.commit()

        res = client.post(
            f"/admin/producers/{producer.id}/toggle-status",
            headers=auth_header(_admin(db)),
        )
        assert res.status_code == 200, res.text
        assert _ledger(db, reg_ev) == ["voided"]
        assert _ledger(db, reg_ex) == ["voided"]

    def test_a_sign_up_that_was_not_cancelled_stays_counted(self, client, db, sent):
        """The void is per cancelled sign-up, not per business."""
        producer, owner = _business(db)
        cancelled_ev = _event(db, producer, title="שוק ראשון")
        kept_ev = _event(db, producer, title="שוק שני")
        reg_cancelled = _signup(db, cancelled_ev, "a@example.com")
        reg_kept = _signup(db, kept_ev, "b@example.com")
        billing_ledger.record_event_registration(db, reg_cancelled, cancelled_ev)
        billing_ledger.record_event_registration(db, reg_kept, kept_ev)
        db.commit()

        client.put(
            f"/events/{cancelled_ev.id}",
            json={"is_active": False},
            headers=auth_header(owner),
        )
        assert _ledger(db, reg_cancelled) == ["voided"]
        assert _ledger(db, reg_kept) == ["counted"]
