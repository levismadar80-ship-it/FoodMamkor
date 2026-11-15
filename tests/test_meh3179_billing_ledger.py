"""MEH-3179 — the billable-events ledger (subscription infrastructure, stage 1).

Nothing is charged. These tests pin what is COUNTED:
  - a sign-up for an event / an experience writes one row, with the fee the
    price list would ask (5% of a paid sign-up, 0 for a free one);
  - a cancel before the item's date voids the row; a late cancel does not;
  - each participant's order counts when a group buy becomes fulfilled, once;
  - a collected rescue bag counts, with the fixed per-bag fee;
  - the row survives the 30-day purge of the registration it counts;
  - a ledger failure never fails the sign-up;
  - the row carries no personal data.
"""

from datetime import timedelta

import pytest

from app.models.billing import BillableEvent
from app.models.models import GroupBuyCommit, ProducerLocation, Registration
from app.services import billing_ledger
from app.services.retention_purge import run_purge
from app.utils.clock import israel_today
from conftest import auth_header, make_producer, make_user
from test_group_buys_api import _make_group_buy, _producer_user
from test_meh2763_registrations import _event, _experience, _owner, _signup
from test_rescue import _seed_offer


@pytest.fixture(autouse=True)
def _no_emails(monkeypatch):
    """The sign-up routes queue emails; none of them is under test here."""
    import app.routers.registrations as r

    for name in (
        "send_visitor_confirmation",
        "send_owner_new_registration",
        "send_owner_cancellation",
    ):
        monkeypatch.setattr(r, name, lambda *a, **kw: None)


@pytest.fixture
def bag_shop(db, monkeypatch):
    """The rescue pilot switched on for Haifa, and a business with a pickup point."""
    import app.routers.rescue as rescue_module

    monkeypatch.setattr(rescue_module, "rescue_bags_enabled", lambda: True)
    monkeypatch.setattr(rescue_module, "rescue_cities", lambda: ("חיפה",))
    producer = make_producer(db, name="מאפיית היומן", city="חיפה")
    owner = make_user(db, email="ledger-owner@example.com", role="producer")
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


def _rows(db):
    db.expire_all()
    return db.query(BillableEvent).order_by(BillableEvent.created_at).all()


class TestRegistrations:
    def test_paid_event_signup_is_counted_with_five_percent(self, client, db):
        owner = _owner(db)
        ev = _event(db, owner, price=200)
        r = client.post(f"/events/{ev.id}/registrations", json=_signup())
        assert r.status_code == 201, r.text

        reg = db.query(Registration).filter_by(event_id=ev.id).one()
        (row,) = _rows(db)
        assert (row.kind, row.source_id, row.producer_id) == (
            "event_registration",
            reg.id,
            owner.producer_id,
        )
        assert (row.base_amount_agorot, row.fee_agorot) == (20000, 1000)
        assert (row.status, row.quantity, row.price_list_version) == ("counted", 1, 1)

    def test_free_event_signup_is_counted_with_no_fee(self, client, db):
        owner = _owner(db)
        ev = _event(db, owner, price=0)
        assert (
            client.post(f"/events/{ev.id}/registrations", json=_signup()).status_code
            == 201
        )
        (row,) = _rows(db)
        assert (row.base_amount_agorot, row.fee_agorot) == (0, 0)

    def test_recording_one_signup_twice_writes_one_row(self, client, db):
        """The route answers a repeat sign-up before it reaches the ledger, so
        the ledger's own guard is exercised by calling it twice."""
        owner = _owner(db)
        ev = _event(db, owner, price=50)
        client.post(f"/events/{ev.id}/registrations", json=_signup())
        reg = db.query(Registration).filter_by(event_id=ev.id).one()
        billing_ledger.record_event_registration(db, reg, ev)
        db.commit()
        assert len(_rows(db)) == 1

    def test_a_host_with_no_business_is_not_counted(self, client, db):
        """The sign-up route refuses such an experience (404), so the ledger's
        own guard is what is checked: no business, no row."""
        host = _owner(db)
        ex = _experience(db, host, price_per_person=120)
        client.post(f"/experiences/{ex.id}/registrations", json=_signup())
        reg = db.query(Registration).filter_by(experience_id=ex.id).one()
        db.query(BillableEvent).delete()
        db.commit()

        billing_ledger.record_experience_registration(db, reg, ex, None)
        db.commit()
        assert _rows(db) == []
        billing_ledger.record_experience_registration(db, reg, ex, host.producer_id)
        db.commit()
        assert len(_rows(db)) == 1  # control: the same call with a business writes

    def test_cancelling_an_experience_signup_voids_the_row(self, client, db):
        host = _owner(db)
        ex = _experience(db, host, price_per_person=120)
        client.post(f"/experiences/{ex.id}/registrations", json=_signup())
        reg = db.query(Registration).filter_by(experience_id=ex.id).one()
        r = client.post(f"/registrations/{reg.cancel_token}/cancel")
        assert r.status_code == 200, r.text
        (row,) = _rows(db)
        assert row.status == "voided"

    def test_deleting_an_upcoming_event_voids_its_rows(self, client, db):
        owner = _owner(db)
        ev = _event(db, owner, price=200)
        client.post(f"/events/{ev.id}/registrations", json=_signup())
        r = client.delete(f"/events/{ev.id}", headers=auth_header(owner))
        assert r.status_code in (200, 204), r.text
        (row,) = _rows(db)
        assert row.status == "voided"

    def test_deleting_a_past_event_keeps_its_rows_counted(self, client, db):
        owner = _owner(db)
        ev = _event(db, owner, price=200)
        client.post(f"/events/{ev.id}/registrations", json=_signup())
        ev.event_date = israel_today() - timedelta(days=1)
        db.commit()
        r = client.delete(f"/events/{ev.id}", headers=auth_header(owner))
        assert r.status_code in (200, 204), r.text
        (row,) = _rows(db)
        assert row.status == "counted"

    def test_deleting_an_upcoming_experience_voids_its_rows(self, client, db):
        host = _owner(db)
        ex = _experience(db, host, price_per_person=120)
        client.post(f"/experiences/{ex.id}/registrations", json=_signup())
        r = client.delete(f"/experiences/{ex.id}", headers=auth_header(host))
        assert r.status_code in (200, 204), r.text
        (row,) = _rows(db)
        assert row.status == "voided"

    def test_a_database_error_in_the_ledger_does_not_fail_the_signup(
        self, client, db, monkeypatch
    ):
        """A negative fee breaks ck_billable_events_amounts INSIDE the
        savepoint: the row is refused, the sign-up still commits."""
        seen = []
        monkeypatch.setattr(billing_ledger, "booking_fee_agorot", lambda base: -1)
        monkeypatch.setattr(
            billing_ledger,
            "capture_background_exception",
            lambda exc, **kw: seen.append(type(exc).__name__),
        )
        owner = _owner(db)
        ev = _event(db, owner, price=200)
        r = client.post(f"/events/{ev.id}/registrations", json=_signup())
        assert r.status_code == 201, r.text
        assert db.query(Registration).filter_by(event_id=ev.id).count() == 1
        assert _rows(db) == []
        assert seen == ["IntegrityError"]

    def test_a_failed_void_does_not_fail_the_cancel(self, client, db, monkeypatch):
        owner = _owner(db)
        ev = _event(db, owner, price=200)
        client.post(f"/events/{ev.id}/registrations", json=_signup())
        reg = db.query(Registration).filter_by(event_id=ev.id).one()

        def boom():
            raise RuntimeError("clock down")

        monkeypatch.setattr(billing_ledger, "_now", boom)
        monkeypatch.setattr(
            billing_ledger, "capture_background_exception", lambda *a, **kw: None
        )
        r = client.post(f"/registrations/{reg.cancel_token}/cancel")
        assert r.status_code == 200, r.text
        db.expire_all()
        assert db.query(Registration).filter_by(id=reg.id).one().status == "cancelled"
        (row,) = _rows(db)
        assert row.status == "counted"

    def test_timestamps_are_timezone_aware(self, client, db):
        owner = _owner(db)
        ev = _event(db, owner, price=200)
        client.post(f"/events/{ev.id}/registrations", json=_signup())
        (row,) = _rows(db)
        assert row.occurred_at.tzinfo is not None
        assert row.created_at.tzinfo is not None

    def test_experience_signup_is_counted_for_the_hosts_business(self, client, db):
        host = _owner(db)
        ex = _experience(db, host, price_per_person=120)
        r = client.post(f"/experiences/{ex.id}/registrations", json=_signup())
        assert r.status_code == 201, r.text
        (row,) = _rows(db)
        assert (row.kind, row.producer_id) == (
            "experience_registration",
            host.producer_id,
        )
        assert (row.base_amount_agorot, row.fee_agorot) == (12000, 600)

    def test_cancel_before_the_date_voids_the_row(self, client, db):
        owner = _owner(db)
        ev = _event(db, owner, price=200)
        client.post(f"/events/{ev.id}/registrations", json=_signup())
        reg = db.query(Registration).filter_by(event_id=ev.id).one()

        r = client.post(f"/registrations/{reg.cancel_token}/cancel")
        assert r.status_code == 200, r.text
        (row,) = _rows(db)
        assert row.status == "voided"
        assert row.voided_at is not None

    def test_late_cancel_of_a_past_item_stays_counted(self, client, db):
        owner = _owner(db)
        ev = _event(db, owner, price=200)
        client.post(f"/events/{ev.id}/registrations", json=_signup())
        reg = db.query(Registration).filter_by(event_id=ev.id).one()
        ev.event_date = israel_today() - timedelta(days=1)
        db.commit()

        client.post(f"/registrations/{reg.cancel_token}/cancel")
        (row,) = _rows(db)
        assert row.status == "counted"

    def test_the_row_outlives_the_purged_registration(self, client, db):
        owner = _owner(db)
        ev = _event(db, owner, price=200)
        client.post(f"/events/{ev.id}/registrations", json=_signup())
        ev.event_date = israel_today() - timedelta(days=31)
        db.commit()

        run_purge(db)
        db.expire_all()
        assert db.query(Registration).count() == 0  # the purge really ran
        assert len(_rows(db)) == 1

    def test_a_ledger_failure_does_not_fail_the_signup(self, client, db, monkeypatch):
        def boom(*a, **kw):
            raise RuntimeError("ledger down")

        monkeypatch.setattr(billing_ledger, "current_price_list", boom)
        monkeypatch.setattr(
            billing_ledger, "capture_background_exception", lambda *a, **kw: None
        )
        owner = _owner(db)
        ev = _event(db, owner, price=200)
        r = client.post(f"/events/{ev.id}/registrations", json=_signup())
        assert r.status_code == 201, r.text
        assert db.query(Registration).filter_by(event_id=ev.id).count() == 1
        assert _rows(db) == []


class TestGroupBuy:
    def _funded(self, db):
        producer, owner = _producer_user(db)
        gb = _make_group_buy(db, producer, status="funded")
        for i, qty in enumerate((1, 3)):
            buyer = make_user(db, email=f"gbbuyer{i}@example.com")
            db.add(GroupBuyCommit(group_buy_id=gb.id, user_id=buyer.id, quantity=qty))
        db.commit()
        return producer, owner, gb

    def _patch(self, client, gb, status, user, expected="funded"):
        return client.patch(
            f"/group-buys/{gb.id}/status",
            json={"status": status, "expected_status": expected},
            headers=auth_header(user),
        )

    def test_each_order_counts_when_the_group_is_fulfilled(self, client, db):
        producer, owner, gb = self._funded(db)
        assert _rows(db) == []  # funded alone counts nothing
        r = self._patch(client, gb, "fulfilled", owner)
        assert r.status_code == 200, r.text

        rows = _rows(db)
        assert {x.kind for x in rows} == {"group_buy_order"}
        assert {x.producer_id for x in rows} == {producer.id}
        # 90 ₪ a unit: 1 unit → 9000 / 450, 3 units → 27000 / 1350.
        assert sorted(
            (x.quantity, x.base_amount_agorot, x.fee_agorot) for x in rows
        ) == [
            (1, 9000, 450),
            (3, 27000, 1350),
        ]

    def test_the_admin_route_counts_a_fulfilled_group_too(self, client, db):
        producer, _, gb = self._funded(db)
        admin = make_user(db, email="ledger-admin@example.com", role="admin")
        db.commit()
        r = client.patch(
            f"/admin/group-buys/{gb.id}/status",
            params={"status": "fulfilled"},
            headers=auth_header(admin),
        )
        assert r.status_code == 200, r.text
        rows = _rows(db)
        assert len(rows) == 2
        assert {x.producer_id for x in rows} == {producer.id}

    def test_a_cancelled_group_counts_nothing(self, client, db):
        _, owner, gb = self._funded(db)
        r = self._patch(client, gb, "cancelled", owner)
        assert r.status_code == 200, r.text
        assert _rows(db) == []

    def test_recording_twice_is_idempotent(self, db):
        _, _, gb = self._funded(db)
        for _ in range(2):
            billing_ledger.record_group_buy_fulfilled(db, gb, gb.commits)
            db.commit()
        assert len(_rows(db)) == 2


class TestRescueBag:
    def test_a_collected_bag_counts_with_the_fixed_fee(self, client, db, bag_shop):
        offer = _seed_offer(db, bag_shop["location"], qty_total=4)
        buyer = make_user(db, email="bagbuyer@example.com")
        db.commit()
        order = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 2},
            headers=auth_header(buyer),
        )
        assert order.status_code == 201, order.text
        assert _rows(db) == []  # a reservation is not a collected bag

        r = client.post(
            f"/rescue/orders/{order.json()['id']}/handed",
            headers=auth_header(bag_shop["owner"]),
        )
        assert r.status_code == 200, r.text
        (row,) = _rows(db)
        assert (row.kind, row.producer_id) == ("rescue_bag", bag_shop["producer"].id)
        # 2 bags at 15 ₪; the fee is 2 ₪ a bag, whatever the bag costs.
        assert (row.quantity, row.base_amount_agorot, row.fee_agorot) == (2, 3000, 400)


def test_the_ledger_holds_no_personal_data():
    """Column names are the contract: no who, only which business and how much."""
    assert set(BillableEvent.__table__.columns.keys()) == {
        "id",
        "producer_id",
        "producer_ref",
        "kind",
        "source_id",
        "occurred_at",
        "quantity",
        "base_amount_agorot",
        "fee_agorot",
        "price_list_version",
        "status",
        "voided_at",
        "created_at",
    }


@pytest.mark.parametrize(
    ("amount", "agorot"),
    [(None, 0), (0, 0), (200, 20000), ("19.99", 1999), (-5, 0)],
)
def test_shekels_to_agorot(amount, agorot):
    assert billing_ledger.shekels_to_agorot(amount) == agorot
