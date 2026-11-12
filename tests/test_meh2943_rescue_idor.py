"""
Module:   test_meh2943_rescue_idor
Purpose:  The ownership dimension of the rescue-bag order actions — a caller
          who is not the buyer (or not the business) sends someone else's
          `order_id` and is refused, the victim's row is untouched in every
          column, and none of the action's side effects fire.
Touches:  rescue_offers / rescue_orders / rescue_reviews rows, and the
          `users.rescue_no_show_count` counter, through the real routes. The
          cancel path's buyer email is captured, never sent.
Does NOT: re-test the state machine. Repeat transitions, row locking, the
          one-review-per-bag constraint and the no-show window all live in
          `tests/test_rescue.py` and `tests/test_meh2738_rescue_business_cancel.py`
          and are thoroughly covered there — writing them again here was the
          first plan and the measurement killed it (MEH-2943).
Related:  backend/app/routers/rescue.py::cancel_order (:999 the ownership
          check), ::mark_no_show (:948), ::create_review (:1054),
          ::cancel_offer (:572), ::_require_offer_owner (:237-244)
History:  MEH-2943 (creation; area 8 of MEH-2899, rescue-bag half)

WHY THIS FILE EXISTS. The top-20 action map scored these routes on «money,
sends email, object id in the path». The first two dimensions are covered.
The third was not. Measured on staging, `tests/test_rescue.py` (1,195 lines)
carries exactly two 403 assertions and no 401 at all: `:394`
(`test_a_stranger_cannot_mark_a_bag_handed`, which IS an ownership test on an
order action — the buyer calling the business-only `/handed`) and `:749` (the
admin clear-block). So the file is not innocent of this dimension; it covers
it for one route and for none of the four here. **No test anywhere called
`/cancel`, `/no_show` or `/review` with another user's `order_id`**, and no
order-action test uses a second consumer — `test_rescue.py:251-252` creates
one pair, in a stock-contention test that never reaches an order action.

(Both sentences were broader in the first draft of this docstring — "neither
is on an order action", "a search for a second consumer returns zero" — and a
reviewer measured both false. They are narrowed here to what the measurement
actually supports, which is still enough to justify the file.)

The guards themselves all exist (read from the source, see Related). So this
file is not reporting a hole in the product; it is closing the hole in the
suite that would let someone delete a guard and ship green.

HOW EACH TEST DISCRIMINATES. The victim's order is always seeded into the
state where the action WOULD succeed for the rightful caller — `handed` for a
review, `reserved` and inside `cancel_until` for a cancel, `reserved` with the
pickup window closed for a no-show. That matters: if the victim were in a
state the action refuses anyway, deleting the guard would still produce a 4xx
and the test would pass against the broken code. Each pair's second test is
the liveness control that proves it, by running the same action as the
rightful caller and showing the side effect really does fire.

`POST /rescue/orders` IS IN THE CARD'S LIST AND HAS NO IDOR SURFACE —
RECORDED RATHER THAN TESTED. It appears in this file only as setup (`_reserve`
below). Read from the source (`rescue.py:798-858`): the only actor is
`current_user`, the single id in the body names a PUBLIC offer, and the
no-show block that gates the call reads `_active_no_shows(db, current_user)`,
which cannot be pointed at anyone else. There is no object belonging to
another user that a caller can name, so the "someone else's id" test this
file is about cannot be written for it — the same verdict, for the same
reason, that the group-buy half records for `DELETE /group-buys/{id}/commit`.
Written down because a gap that turns out to be covered — or vacuous — is
recorded, never quietly closed.

THE EXISTENCE ORACLE IS RECORDED, NOT FIXED. `cancel_order` and
`create_review` run their ownership check AFTER `_order_or_404`, so a
stranger's id answers 403 while an unknown id answers 404 — the refusal tells
you whether the order exists. Sapir's ruling (11/11): no behaviour change in
a money path today. Each route therefore carries one `xfail(strict=True)`
tied to MEH-2949. `strict` is the point: the day someone unifies the answers,
the xfail fails as XPASS and closes its own card instead of rotting.
"""

# ruff: noqa: F811 — fixtures reused from test_rescue.py are injected by name.

from datetime import timedelta

import pytest
from sqlalchemy import inspect as sa_inspect

from app.models.models import RescueOffer, RescueOrder, RescueReview, User
from app.utils.clock import utc_now

from tests.conftest import auth_header, make_producer, make_user
from tests.test_rescue import _seed_offer, rescue_on, shop  # noqa: F401

# Every mapped column, derived — never a hand-written list. A column added to
# the model later is compared without anyone remembering to add it here, which
# is the whole point: the claim is "nothing changed", not "these seven fields
# did not change".
_ORDER_COLUMNS = tuple(c.key for c in sa_inspect(RescueOrder).mapper.column_attrs)
_OFFER_COLUMNS = tuple(c.key for c in sa_inspect(RescueOffer).mapper.column_attrs)

# A UUID that is not in the database. Used for the existence-oracle xfails.
_ABSENT_ID = "00000000-0000-4000-8000-000000000000"


def _snapshot(row, columns) -> dict:
    return {name: getattr(row, name) for name in columns}


def _capture_emails(monkeypatch) -> list:
    """Collect what the rescue mailer would send. Mirrors test_meh2738's."""
    sent = []
    monkeypatch.setattr(
        "app.services.rescue_emails.send_email",
        lambda to, subject, body, html=None, reply_to=None, test_cause=False: (
            sent.append({"to": to, "subject": subject})
        ),
    )
    return sent


def _reserve(client, offer, buyer, qty=1):
    resp = client.post(
        "/rescue/orders",
        json={"offer_id": str(offer.id), "qty": qty},
        headers=auth_header(buyer),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _a_stranger(db, *, email="stranger@example.com"):
    """A signed-in consumer with no connection to the order or the business."""
    user = make_user(db, email=email)
    db.commit()
    return user


def _another_business(db, *, email="rival@example.com"):
    """An owner of a DIFFERENT approved business.

    Used for the business-side routes: the interesting caller there is not a
    random consumer (who fails on role as well as on ownership) but a producer
    whose only missing qualification is that the bag is not hers. A test that
    used a consumer would pass against `_require_offer_owner` reduced to a
    role check.
    """
    producer = make_producer(db, name="מאפייה מתחרה", city="חיפה")
    owner = make_user(db, email=email, role="producer")
    owner.producer_id = producer.id
    owner.is_producer = True
    db.commit()
    return owner


# ---------------------------------------------------------------------------
# POST /rescue/orders/{id}/cancel — row 6 of the top-20
# ---------------------------------------------------------------------------


class TestCancelSomeoneElsesOrder:
    def test_a_stranger_cannot_cancel_and_nothing_moves(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        """403, the order untouched in every column, the stock unmoved, no mail.

        The order is `reserved` and inside `cancel_until`, i.e. exactly the
        state in which the rightful buyer's cancel returns 200 — see the
        liveness control below. Without the ownership check this call would
        cancel a stranger's reservation and hand the bag back to the shelf.
        """
        offer = _seed_offer(db, shop["location"], qty_total=4)
        buyer = make_user(db, email="victim@example.com")
        db.commit()
        _reserve(client, offer, buyer)
        sent = _capture_emails(monkeypatch)

        db.expire_all()
        order = db.query(RescueOrder).filter(RescueOrder.offer_id == offer.id).one()
        before_order = _snapshot(order, _ORDER_COLUMNS)
        before_offer = _snapshot(db.get(RescueOffer, offer.id), _OFFER_COLUMNS)
        assert before_order["status"] == "reserved", "setup: cancellable"

        resp = client.post(
            f"/rescue/orders/{order.id}/cancel",
            headers=auth_header(_a_stranger(db)),
        )

        assert resp.status_code == 403, resp.text
        db.expire_all()
        after_order = _snapshot(db.get(RescueOrder, before_order["id"]), _ORDER_COLUMNS)
        after_offer = _snapshot(db.get(RescueOffer, offer.id), _OFFER_COLUMNS)
        assert after_order == before_order, "the victim's order row changed"
        assert after_offer == before_offer, "the refused cancel moved the stock"
        assert sent == [], f"the refused cancel sent mail: {sent}"

    def test_the_buyer_herself_can_cancel_and_everything_moves(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        """The liveness control for the three absence assertions above.

        Same fixture, same order, the rightful caller. If this did not move
        the status, the stock and the mailbox, then "nothing moved" in the
        test above would be true of a dead route and would prove nothing.
        """
        offer = _seed_offer(db, shop["location"], qty_total=4)
        buyer = make_user(db, email="victim@example.com")
        db.commit()
        _reserve(client, offer, buyer)
        sent = _capture_emails(monkeypatch)

        db.expire_all()
        order = db.query(RescueOrder).filter(RescueOrder.offer_id == offer.id).one()
        qty_left_before = db.get(RescueOffer, offer.id).qty_left

        resp = client.post(
            f"/rescue/orders/{order.id}/cancel", headers=auth_header(buyer)
        )

        assert resp.status_code == 200, resp.text
        db.expire_all()
        assert db.get(RescueOrder, order.id).status == "cancelled"
        assert db.get(RescueOffer, offer.id).qty_left == qty_left_before + 1
        assert len(sent) == 1, f"expected the buyer's cancel email, got {sent}"

    def test_anonymous_cannot_cancel(self, client, db, shop, rescue_on):
        offer = _seed_offer(db, shop["location"])
        buyer = make_user(db, email="victim@example.com")
        db.commit()
        _reserve(client, offer, buyer)
        db.expire_all()
        order = db.query(RescueOrder).filter(RescueOrder.offer_id == offer.id).one()

        resp = client.post(f"/rescue/orders/{order.id}/cancel")

        assert resp.status_code == 401, resp.text
        db.expire_all()
        assert db.get(RescueOrder, order.id).status == "reserved"

    @pytest.mark.xfail(
        strict=True,
        reason="MEH-2949: the ownership check runs after _order_or_404, so a "
        "stranger's id answers 403 and an unknown id answers 404 — the refusal "
        "reveals whether the order exists. Sapir ruled no behaviour change in a "
        "money path today. strict=True so unifying the answers closes the card.",
    )
    def test_the_refusal_does_not_reveal_whether_the_order_exists(
        self, client, db, shop, rescue_on
    ):
        offer = _seed_offer(db, shop["location"])
        buyer = make_user(db, email="victim@example.com")
        db.commit()
        _reserve(client, offer, buyer)
        db.expire_all()
        order = db.query(RescueOrder).filter(RescueOrder.offer_id == offer.id).one()
        stranger = _a_stranger(db)

        someone_elses = client.post(
            f"/rescue/orders/{order.id}/cancel", headers=auth_header(stranger)
        )
        never_existed = client.post(
            f"/rescue/orders/{_ABSENT_ID}/cancel", headers=auth_header(stranger)
        )

        assert someone_elses.status_code == never_existed.status_code
        assert someone_elses.json() == never_existed.json()


# ---------------------------------------------------------------------------
# POST /rescue/orders/{id}/no_show — row 14
# ---------------------------------------------------------------------------


def _closed_window_offer(db, location):
    """An offer whose pickup window has already shut, so a no-show is allowed."""
    now = utc_now()
    return _seed_offer(
        db,
        location,
        pickup_start=now - timedelta(hours=3),
        pickup_end=now - timedelta(hours=1),
        cancel_until=now - timedelta(hours=4),
    )


def _reserve_directly(db, offer, buyer, *, code="1234"):
    """Seed the reservation in the DB rather than through the route.

    The window is already closed here, so `POST /rescue/orders` would refuse
    it — the route is not the subject of this section and using it would only
    constrain the fixture. `pickup_code` is NOT NULL and the route mints it
    (`rescue.py:199`), so a direct seed has to supply one; the value is
    irrelevant to ownership, and the house pattern for this is
    `tests/test_meh2703_rescue_donated.py:30`.
    """
    order = RescueOrder(
        offer_id=offer.id,
        user_id=buyer.id,
        qty=1,
        pickup_code=code,
        status="reserved",
    )
    offer.qty_left = max(offer.qty_left - 1, 0)
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


class TestNoShowOnSomeoneElsesOrder:
    def test_a_rival_business_cannot_mark_no_show_and_nothing_moves(
        self, client, db, shop, rescue_on
    ):
        """403, the order untouched, and the buyer's counter not incremented.

        The caller is another APPROVED business's owner, not a consumer: a
        consumer would be refused by a `_require_offer_owner` reduced to a
        role check, so this is the caller that actually tests ownership.

        The counter matters more than it looks — `_active_no_shows` is what
        blocks a buyer from reserving again, so a route that let a rival mark
        no-shows would be a way to lock a competitor's customers out.
        """
        offer = _closed_window_offer(db, shop["location"])
        buyer = make_user(db, email="victim@example.com")
        db.commit()
        order = _reserve_directly(db, offer, buyer)
        before_order = _snapshot(order, _ORDER_COLUMNS)
        before_count = db.get(User, buyer.id).rescue_no_show_count

        resp = client.post(
            f"/rescue/orders/{order.id}/no_show",
            headers=auth_header(_another_business(db)),
        )

        assert resp.status_code == 403, resp.text
        db.expire_all()
        assert _snapshot(db.get(RescueOrder, order.id), _ORDER_COLUMNS) == before_order
        assert db.get(User, buyer.id).rescue_no_show_count == before_count, (
            "a rival business incremented the buyer's no-show counter"
        )

    def test_the_owning_business_can_mark_no_show_and_the_counter_rises(
        self, client, db, shop, rescue_on
    ):
        """The liveness control for the counter assertion above."""
        offer = _closed_window_offer(db, shop["location"])
        buyer = make_user(db, email="victim@example.com")
        db.commit()
        order = _reserve_directly(db, offer, buyer)
        before_count = db.get(User, buyer.id).rescue_no_show_count or 0

        resp = client.post(
            f"/rescue/orders/{order.id}/no_show",
            headers=auth_header(shop["owner"]),
        )

        assert resp.status_code == 200, resp.text
        db.expire_all()
        assert db.get(RescueOrder, order.id).status == "no_show"
        assert db.get(User, buyer.id).rescue_no_show_count == before_count + 1

    def test_the_buyer_cannot_mark_her_own_order_no_show(
        self, client, db, shop, rescue_on
    ):
        """The other direction of the same gate.

        `no_show` is the business's verdict about the buyer. A buyer who could
        call it would be marking herself — harmless on its own, but it would
        mean the route reads "is signed in" where it should read "owns the
        offer". Without this, a check reduced to `get_current_user` passes
        every other test in this class.
        """
        offer = _closed_window_offer(db, shop["location"])
        buyer = make_user(db, email="victim@example.com")
        db.commit()
        order = _reserve_directly(db, offer, buyer)

        resp = client.post(
            f"/rescue/orders/{order.id}/no_show", headers=auth_header(buyer)
        )

        assert resp.status_code == 403, resp.text
        db.expire_all()
        assert db.get(RescueOrder, order.id).status == "reserved"

    def test_anonymous_cannot_mark_no_show(self, client, db, shop, rescue_on):
        offer = _closed_window_offer(db, shop["location"])
        buyer = make_user(db, email="victim@example.com")
        db.commit()
        order = _reserve_directly(db, offer, buyer)

        resp = client.post(f"/rescue/orders/{order.id}/no_show")

        assert resp.status_code == 401, resp.text
        db.expire_all()
        assert db.get(RescueOrder, order.id).status == "reserved"


# ---------------------------------------------------------------------------
# POST /rescue/orders/{id}/review — row 15
# ---------------------------------------------------------------------------


def _handed_order(db, offer, buyer):
    order = _reserve_directly(db, offer, buyer)
    order.status = "handed"
    db.commit()
    db.refresh(order)
    return order


class TestReviewSomeoneElsesOrder:
    def test_a_stranger_cannot_review_and_no_row_is_written(
        self, client, db, shop, rescue_on
    ):
        """403, and no review row exists afterwards.

        The order is `handed`, which is the one state where a review is
        accepted — so without the ownership check this call would write a
        review in the victim's name against the business's rating. The row
        count is derived, not asserted as a literal.
        """
        offer = _closed_window_offer(db, shop["location"])
        buyer = make_user(db, email="victim@example.com")
        db.commit()
        order = _handed_order(db, offer, buyer)
        before_order = _snapshot(order, _ORDER_COLUMNS)

        resp = client.post(
            f"/rescue/orders/{order.id}/review",
            json={"rating": 1, "comment": "לא הייתי שם"},
            headers=auth_header(_a_stranger(db)),
        )

        assert resp.status_code == 403, resp.text
        db.expire_all()
        written = db.query(RescueReview).filter(RescueReview.order_id == order.id).all()
        assert len(written) == 0, f"a stranger's review was stored: {written}"
        assert _snapshot(db.get(RescueOrder, order.id), _ORDER_COLUMNS) == before_order

    def test_the_buyer_herself_can_review_and_the_row_appears(
        self, client, db, shop, rescue_on
    ):
        """The liveness control for the "no row is written" assertion above."""
        offer = _closed_window_offer(db, shop["location"])
        buyer = make_user(db, email="victim@example.com")
        db.commit()
        order = _handed_order(db, offer, buyer)

        resp = client.post(
            f"/rescue/orders/{order.id}/review",
            json={"rating": 5, "comment": "היה מצוין"},
            headers=auth_header(buyer),
        )

        assert resp.status_code == 201, resp.text
        db.expire_all()
        written = db.query(RescueReview).filter(RescueReview.order_id == order.id).all()
        assert len(written) == 1
        assert written[0].rating == 5

    def test_anonymous_cannot_review(self, client, db, shop, rescue_on):
        offer = _closed_window_offer(db, shop["location"])
        buyer = make_user(db, email="victim@example.com")
        db.commit()
        order = _handed_order(db, offer, buyer)

        resp = client.post(f"/rescue/orders/{order.id}/review", json={"rating": 5})

        assert resp.status_code == 401, resp.text
        db.expire_all()
        assert db.query(RescueReview).count() == 0

    @pytest.mark.xfail(
        strict=True,
        reason="MEH-2949: same oracle as the cancel route — 403 for a stranger's "
        "id, 404 for an unknown one. strict=True so a uniform 404 closes the card.",
    )
    def test_the_refusal_does_not_reveal_whether_the_order_exists(
        self, client, db, shop, rescue_on
    ):
        offer = _closed_window_offer(db, shop["location"])
        buyer = make_user(db, email="victim@example.com")
        db.commit()
        order = _handed_order(db, offer, buyer)
        stranger = _a_stranger(db)
        body = {"rating": 5}

        someone_elses = client.post(
            f"/rescue/orders/{order.id}/review",
            json=body,
            headers=auth_header(stranger),
        )
        never_existed = client.post(
            f"/rescue/orders/{_ABSENT_ID}/review",
            json=body,
            headers=auth_header(stranger),
        )

        assert someone_elses.status_code == never_existed.status_code
        assert someone_elses.json() == never_existed.json()


# ---------------------------------------------------------------------------
# POST /rescue/offers/{id}/cancel — row 20
# ---------------------------------------------------------------------------


class TestCancelSomeoneElsesOffer:
    def test_a_rival_business_cannot_cancel_the_offer_and_nothing_moves(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        """403, the offer untouched in every column, the reservation intact.

        The bag is `active` with a live reservation on it, i.e. the state in
        which the owning business's cancel succeeds and mails every buyer —
        see the control below. A rival who could call this would take a
        competitor's bags off the site and mail their customers.
        """
        offer = _seed_offer(db, shop["location"], qty_total=4)
        buyer = make_user(db, email="victim@example.com")
        db.commit()
        _reserve(client, offer, buyer)
        sent = _capture_emails(monkeypatch)

        db.expire_all()
        before_offer = _snapshot(db.get(RescueOffer, offer.id), _OFFER_COLUMNS)
        order = db.query(RescueOrder).filter(RescueOrder.offer_id == offer.id).one()
        before_order = _snapshot(order, _ORDER_COLUMNS)
        assert before_offer["status"] == "active", "setup: cancellable"

        resp = client.post(
            f"/rescue/offers/{offer.id}/cancel",
            headers=auth_header(_another_business(db)),
        )

        assert resp.status_code == 403, resp.text
        db.expire_all()
        assert _snapshot(db.get(RescueOffer, offer.id), _OFFER_COLUMNS) == before_offer
        assert _snapshot(db.get(RescueOrder, order.id), _ORDER_COLUMNS) == before_order
        assert sent == [], f"the refused offer-cancel mailed the buyers: {sent}"

    def test_the_owning_business_can_cancel_and_the_buyer_is_mailed(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        """The liveness control for the offer-cancel absence assertions."""
        offer = _seed_offer(db, shop["location"], qty_total=4)
        buyer = make_user(db, email="victim@example.com")
        db.commit()
        _reserve(client, offer, buyer)
        sent = _capture_emails(monkeypatch)
        db.expire_all()
        order = db.query(RescueOrder).filter(RescueOrder.offer_id == offer.id).one()

        resp = client.post(
            f"/rescue/offers/{offer.id}/cancel", headers=auth_header(shop["owner"])
        )

        assert resp.status_code == 200, resp.text
        db.expire_all()
        assert db.get(RescueOffer, offer.id).status == "cancelled"
        assert db.get(RescueOrder, order.id).status != "reserved"
        assert len(sent) == 1, f"expected one buyer email, got {sent}"

    def test_a_consumer_cannot_cancel_an_offer(self, client, db, shop, rescue_on):
        offer = _seed_offer(db, shop["location"])

        resp = client.post(
            f"/rescue/offers/{offer.id}/cancel", headers=auth_header(_a_stranger(db))
        )

        assert resp.status_code == 403, resp.text
        db.expire_all()
        assert db.get(RescueOffer, offer.id).status == "active"

    def test_anonymous_cannot_cancel_an_offer(self, client, db, shop, rescue_on):
        offer = _seed_offer(db, shop["location"])

        resp = client.post(f"/rescue/offers/{offer.id}/cancel")

        assert resp.status_code == 401, resp.text
        db.expire_all()
        assert db.get(RescueOffer, offer.id).status == "active"
