"""MEH-3375: before an admin blocks a user, she sees what the block takes down.

GET /admin/users/{id}/block-impact names the live business that blocking would
hide (the MEH-2871 rule: only owner who can still sign in) and counts the open
bookings that would be cancelled and mailed: reserved bags, event and workshop
sign-ups (registered or waitlisted) and group-buy participants. It reads only.
The block itself reports the same number back as ``cancelled``.
"""

# ruff: noqa: F811 — fixtures from test_meh3227_delist_cascade are injected by name.

from datetime import timedelta

from app.models import Producer, Registration
from app.models.models import GroupBuy, GroupBuyCommit, RescueOrder
from app.utils.clock import utc_now

from tests.conftest import auth_header, make_user
from tests.test_meh3227_delist_cascade import (  # noqa: F401
    _admin,
    _bag,
    _business,
    _event,
    _experience,
    _signup,
    sent,
)


def _impact(client, db, user, admin=None):
    r = client.get(
        f"/admin/users/{user.id}/block-impact",
        headers=auth_header(admin or _admin(db)),
    )
    assert r.status_code == 200, r.text
    return r.json()


def _group_buy(db, producer, emails, status="open", own=()):
    gb = GroupBuy(
        producer_id=producer.id,
        title="רכש קמח מלא",
        product_name="קמח מלא",
        price_per_unit_regular=120,
        price_per_unit_group=90,
        min_participants=5,
        deadline=utc_now() + timedelta(days=5),
        status=status,
    )
    db.add(gb)
    db.commit()
    for email in emails:
        buyer = make_user(db, email=email)
        db.add(GroupBuyCommit(group_buy_id=gb.id, user_id=buyer.id, quantity=1))
    for member in own:  # the business's own users: told by the owner email
        db.add(GroupBuyCommit(group_buy_id=gb.id, user_id=member.id, quantity=1))
    db.commit()
    return gb


class TestBlockImpact:
    def test_no_open_bookings(self, client, db):
        producer, owner = _business(db)
        assert _impact(client, db, owner) == {
            "business_name": producer.name,
            "open_bookings": 0,
        }

    def test_one_open_booking(self, client, db):
        producer, owner = _business(db)
        _signup(db, _event(db, producer), "guest@example.com")
        assert _impact(client, db, owner)["open_bookings"] == 1

    def test_counts_every_kind_and_the_block_cancels_them(self, client, db, sent):
        producer, owner = _business(db)
        # Counted — 9 customers' bookings:
        bag = _bag(db, producer, ["bag1@example.com", "bag2@example.com"])  # 2
        _signup(db, _event(db, producer), "event@example.com")  # 1
        wait = _signup(db, _event(db, producer), "wait@example.com")  # 1
        wait.status = "waitlisted"
        _signup(db, _experience(db, owner), "workshop@example.com")  # 1
        # A recurring workshop whose first date has passed is still live.
        _signup(
            db, _experience(db, owner, days=-10, is_recurring=True), "rec@example.com"
        )  # 1
        live_gb = _group_buy(
            db, producer, ["gb1@example.com", "gb2@example.com"], own=[owner]
        )  # 2
        funded = _group_buy(db, producer, ["fund@example.com"], status="funded")  # 1
        # Not counted:
        _signup(db, _event(db, producer, days=-3), "past@example.com")  # past event
        done = _signup(db, _event(db, producer), "done@example.com")
        done.status = "cancelled"  # already cancelled
        _group_buy(db, producer, ["old@example.com"], status="cancelled")
        _bag(
            db,
            producer,
            ["gone@example.com"],
            pickup_start=utc_now() - timedelta(hours=3),
            pickup_end=utc_now() - timedelta(hours=1),
        )
        picked = db.query(RescueOrder).filter(RescueOrder.offer_id == bag.id).first()
        _bag(db, producer, ["late@example.com"], status="cancelled")
        db.commit()

        admin = _admin(db)
        assert _impact(client, db, owner, admin)["open_bookings"] == 9

        r = client.post(f"/admin/users/{owner.id}/block", headers=auth_header(admin))
        assert r.status_code == 200, r.text
        assert r.json()["business_hidden"] is True
        # The number the block reports is the number the admin was shown.
        assert r.json()["cancelled"] == 9
        db.expire_all()
        assert db.get(Producer, producer.id).status == "inactive"
        # Nothing the count named is still open.
        left = (
            db.query(Registration)
            .filter(Registration.status.in_(("registered", "waitlisted")))
            .count()
        )
        assert left == 1  # only the past event's sign-up, which was never counted
        assert db.get(RescueOrder, picked.id).status == "cancelled"
        assert db.get(GroupBuy, live_gb.id).status == "cancelled"
        assert db.get(GroupBuy, funded.id).status == "cancelled"

    def test_reading_the_impact_changes_nothing(self, client, db, sent):
        producer, owner = _business(db)
        reg = _signup(db, _event(db, producer), "guest@example.com")
        _impact(client, db, owner)
        db.expire_all()
        assert db.get(Producer, producer.id).status == "approved"
        assert db.get(Registration, reg.id).status == "registered"
        assert sent == []

    def test_a_consumer_has_no_business(self, client, db):
        shopper = make_user(db, email="shopper@example.com")
        assert _impact(client, db, shopper) == {
            "business_name": None,
            "open_bookings": 0,
        }

    def test_a_co_owner_who_can_sign_in_keeps_it_up(self, client, db):
        producer, owner = _business(db)
        co = make_user(db, role="producer", email="co@example.com")
        co.producer_id = producer.id
        db.commit()
        _signup(db, _event(db, producer), "guest@example.com")
        assert _impact(client, db, owner) == {
            "business_name": None,
            "open_bookings": 0,
        }

    def test_an_already_blocked_user_shows_nothing(self, client, db):
        producer, owner = _business(db)
        _signup(db, _event(db, producer), "guest@example.com")
        owner.is_blocked = True
        db.commit()
        assert _impact(client, db, owner)["business_name"] is None

    def test_block_reports_how_many_it_cancelled(self, client, db, sent):
        producer, owner = _business(db)
        _signup(db, _event(db, producer), "a@example.com")
        _signup(db, _event(db, producer), "b@example.com")
        r = client.post(
            f"/admin/users/{owner.id}/block", headers=auth_header(_admin(db))
        )
        assert r.json()["cancelled"] == 2

    def test_unknown_user_is_404(self, client, db):
        r = client.get(
            "/admin/users/00000000-0000-0000-0000-000000000000/block-impact",
            headers=auth_header(_admin(db)),
        )
        assert r.status_code == 404

    def test_not_an_admin_is_refused(self, client, db):
        _producer, owner = _business(db)
        other = make_user(db, email="nosy@example.com", email_verified=True)
        r = client.get(
            f"/admin/users/{owner.id}/block-impact", headers=auth_header(other)
        )
        assert r.status_code == 403
