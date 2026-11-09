"""MEH-2646 — the rescue-bags API (chunk 2/4 of MEH-2643).

Covers the six cases the chunk's spec names plus the three guards that only
exist because the pilot has no payment: the two-bag cap per buyer, the
no-show block, and the admin release.

CLOCK BASIS, stated so nobody "fixes" it into the wrong one (testing.md):
`rescue_offers.date` is an ISRAEL calendar date and is seeded with
`israel_today()`, never `date.today()`. The pickup timestamps and the 30-day
no-show window are a rolling UTC span — `_active_no_shows` compares against
`utc_now() - timedelta(days=30)` on naive columns — so they are seeded with
`utc_now() ± timedelta`, deliberately NOT `israel_days_ago`, which returns an
aware UTC value for Israel-CALENDAR-day arithmetic. Two different facts; the
seeds match the code under test.

THE FLAG: `settings.rescue_bags_enabled` does not exist yet —
`backend/app/config.py` is denied to Claude Code, so Sapir adds the field
(patch in PR #3963). Every test here sets it with `raising=False`, and
`test_routes_are_404_while_the_flag_is_absent_or_off` pins the safe default so
the field's absence can never read as "enabled".
"""

import re
from datetime import timedelta

import pytest
from conftest import auth_header, make_producer, make_user
from sqlalchemy import event

from app.database import engine
from app.models.models import ProducerLocation, RescueOffer, RescueOrder
from app.routers import rescue as rescue_module
from app.routers.rescue import (
    NO_SHOW_BLOCK_AT,
    NO_SHOW_WINDOW_DAYS,
    rescue_bags_enabled,
)
from app.utils.clock import israel_today, utc_now


@pytest.fixture
def rescue_on(monkeypatch):
    """Turn the pilot on for one test.

    Patches the gate FUNCTION, not `settings`: pydantic's BaseSettings refuses
    an assignment to a field it does not declare, and
    `settings.rescue_bags_enabled` does not exist yet — `backend/app/config.py`
    is denied to Claude Code, so Sapir adds it (the patch is in PR #3963).
    Setting it here raises `ValueError: "Settings" object has no field`, which
    is exactly how this fixture was written the first time.

    `test_the_gate_reads_a_settings_field_when_one_exists` covers the part this
    seam skips, without depending on whether the real field is there — so it
    stays green both before and after Sapir applies the patch.
    """
    monkeypatch.setattr(rescue_module, "rescue_bags_enabled", lambda: True)
    # MEH-2649: the pilot is also gated per TOWN, and the default is no town
    # at all — so every functional test has to open the one its fixtures use,
    # or publishing 403s and the public list is empty. Patched as a function
    # for the same reason as the flag: `settings` has no such field yet.
    monkeypatch.setattr(rescue_module, "rescue_cities", lambda: ("חיפה",))
    return True


@pytest.fixture
def shop(db):
    """An approved business, its owner, and an exact-precision pickup point."""
    producer = make_producer(db, name="מאפיית ההצלה", city="חיפה")
    owner = make_user(db, email="owner@example.com", role="producer")
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


def _offer_payload(location, **over):
    now = utc_now()
    payload = {
        "producer_location_id": str(location.id),
        "date": israel_today().isoformat(),
        "qty_total": 4,
        "price_agorot": 1500,
        "pickup_start": (now + timedelta(hours=1)).isoformat(),
        "pickup_end": (now + timedelta(hours=3)).isoformat(),
        "cancel_until": (now + timedelta(minutes=30)).isoformat(),
    }
    payload.update(over)
    return payload


def _seed_offer(db, location, *, qty_total=4, qty_left=None, **over):
    now = utc_now()
    offer = RescueOffer(
        producer_location_id=location.id,
        date=over.get("date", israel_today()),
        qty_total=qty_total,
        qty_left=qty_total if qty_left is None else qty_left,
        price_agorot=1500,
        pickup_start=over.get("pickup_start", now + timedelta(hours=1)),
        pickup_end=over.get("pickup_end", now + timedelta(hours=3)),
        cancel_until=over.get("cancel_until", now + timedelta(minutes=30)),
        status=over.get("status", "active"),
    )
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return offer


class TestFlagGate:
    def test_routes_are_404_while_the_flag_is_absent_or_off(self, client, db, shop):
        """No fixture flipping the flag: this is the shipped default.

        The assertion on `rescue_bags_enabled()` is the discriminating half —
        a 404 alone could come from a typo in the path, while this names WHY.
        """
        assert rescue_bags_enabled() is False
        buyer = make_user(db, email="darkbuyer@example.com")
        db.commit()
        assert client.get("/rescue/offers").status_code == 404
        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(shop["location"].id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert r.status_code == 404

    def test_the_gate_reads_a_settings_field_when_one_exists(self, monkeypatch):
        """Both arms of the getattr, against stand-in settings objects.

        Deliberately NOT `assert not hasattr(settings, "rescue_bags_enabled")`
        — that would go red the moment Sapir applies the patch, i.e. a test
        that breaks when someone does the right thing.
        """

        class WithField:
            rescue_bags_enabled = True

        class WithoutField:
            pass

        monkeypatch.setattr(rescue_module, "settings", WithField())
        assert rescue_module.rescue_bags_enabled() is True

        monkeypatch.setattr(rescue_module, "settings", WithoutField())
        assert rescue_module.rescue_bags_enabled() is False

    def test_the_list_is_public_once_the_flag_is_on(self, client, rescue_on):
        # Control: the same path that 404'd above answers without any auth, so
        # the 404 above was the flag and not a missing route.
        assert client.get("/rescue/offers").status_code == 200


class TestPublish:
    def test_approved_business_publishes_todays_bag(self, client, db, shop, rescue_on):
        r = client.post(
            "/rescue/offers",
            json=_offer_payload(shop["location"]),
            headers=auth_header(shop["owner"]),
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["qty_left"] == body["qty_total"] == 4
        assert body["status"] == "active"

    def test_an_approximate_pickup_point_cannot_host_a_bag(
        self, client, db, shop, rescue_on
    ):
        """MEH-829: a bag publishes the full address, so a fuzzy pin is refused."""
        shop["location"].location_precision = "approximate"
        db.commit()
        r = client.post(
            "/rescue/offers",
            json=_offer_payload(shop["location"]),
            headers=auth_header(shop["owner"]),
        )
        assert r.status_code == 422
        assert "מדויקת" in r.json()["detail"]

    def test_another_business_cannot_publish_on_this_point(
        self, client, db, shop, rescue_on
    ):
        other_producer = make_producer(db, name="עסק אחר")
        intruder = make_user(db, email="intruder@example.com", role="producer")
        intruder.producer_id = other_producer.id
        intruder.is_producer = True
        db.commit()
        r = client.post(
            "/rescue/offers",
            json=_offer_payload(shop["location"]),
            headers=auth_header(intruder),
        )
        assert r.status_code == 404

    def test_a_second_active_bag_on_the_same_day_is_refused(
        self, client, db, shop, rescue_on
    ):
        _seed_offer(db, shop["location"])
        r = client.post(
            "/rescue/offers",
            json=_offer_payload(shop["location"]),
            headers=auth_header(shop["owner"]),
        )
        assert r.status_code == 409


class TestReserve:
    def test_happy_path_returns_a_four_digit_code_and_decrements_stock(
        self, client, db, shop, rescue_on
    ):
        offer = _seed_offer(db, shop["location"], qty_total=2)
        buyer = make_user(db, email="happy@example.com")
        db.commit()
        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["pickup_code"].isdigit() and len(body["pickup_code"]) == 4
        assert body["status"] == "reserved"
        # The counter moved, and it moved by the quantity asked for.
        db.refresh(offer)
        assert offer.qty_left == 1
        # Price and cutoff come back with the reservation so the confirmation
        # screen needs no second request.
        assert body["price_agorot"] == offer.price_agorot

    def test_the_last_bag_cannot_be_sold_twice(self, client, db, shop, rescue_on):
        """Sequential overflow — the house pattern for capacity
        (tests/test_integrity_constraints.py::TestGroupBuyCapacity).

        This asserts the GUARD. The lock that makes it safe under genuine
        concurrency is asserted separately below, because a guard can be
        correct while the lock is missing and vice versa.
        """
        offer = _seed_offer(db, shop["location"], qty_total=1)
        first = make_user(db, email="first@example.com")
        second = make_user(db, email="second@example.com")
        db.commit()

        ok = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(first),
        )
        assert ok.status_code == 201
        clash = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(second),
        )
        assert clash.status_code == 409
        db.refresh(offer)
        assert offer.qty_left == 0, "stock went negative or was double-spent"

    def test_the_reservation_path_selects_the_offer_for_update(
        self, client, db, shop, rescue_on
    ):
        """The HANDLER's lock, observed on the statements it actually issues.

        WHY IT IS WRITTEN THIS WAY. The first version of this test opened two
        connections, took `FOR UPDATE` on the row ITSELF and asserted a second
        `FOR UPDATE NOWAIT` was refused. That passes with
        `.with_for_update()` deleted from `_offer_for_update` — measured, not
        assumed — because it was testing Postgres's locking, not this
        application's use of it. A test whose subject is the database engine
        cannot fail on a bug in our code (testing.md: "name one other world
        where this check is green").

        So this listens to the cursor and asserts that reserving a bag issued
        a `SELECT ... rescue_offers ... FOR UPDATE`. Removing
        `.with_for_update()` reds it, which is the whole point.
        """
        offer = _seed_offer(db, shop["location"], qty_total=1)
        buyer = make_user(db, email="locked@example.com")
        db.commit()

        seen: list[str] = []

        def _capture(conn, cursor, statement, params, context, executemany):
            seen.append(statement)

        event.listen(engine, "before_cursor_execute", _capture)
        try:
            r = client.post(
                "/rescue/orders",
                json={"offer_id": str(offer.id), "qty": 1},
                headers=auth_header(buyer),
            )
        finally:
            event.remove(engine, "before_cursor_execute", _capture)

        assert r.status_code == 201, r.text
        # Control: the listener really saw this request's traffic. Without it a
        # zero-match assertion below would read as "no lock" either way.
        assert any("rescue_orders" in s for s in seen), "the listener saw nothing"

        locking = [
            s for s in seen if "rescue_offers" in s and "FOR UPDATE" in s.upper()
        ]
        assert locking, (
            "reserving a bag did not lock the offer row — "
            f"{len(seen)} statements seen, none a FOR UPDATE on rescue_offers"
        )

    def test_a_buyer_cannot_hold_more_than_two_bags_of_one_offer(
        self, client, db, shop, rescue_on
    ):
        """The pilot's cap is per BUYER per offer. Two requests of two would
        walk past a per-request check, which is why the handler sums."""
        offer = _seed_offer(db, shop["location"], qty_total=20)
        buyer = make_user(db, email="greedy@example.com")
        db.commit()
        headers = auth_header(buyer)
        first = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 2},
            headers=headers,
        )
        assert first.status_code == 201
        second = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=headers,
        )
        assert second.status_code == 409
        db.refresh(offer)
        assert offer.qty_left == 18

    def test_qty_above_the_cap_is_refused_by_the_schema(
        self, client, db, shop, rescue_on
    ):
        offer = _seed_offer(db, shop["location"], qty_total=20)
        buyer = make_user(db, email="three@example.com")
        db.commit()
        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 3},
            headers=auth_header(buyer),
        )
        assert r.status_code == 422


class TestHandOver:
    def _reserved(self, client, db, shop, email="pick@example.com", **offer_over):
        offer = _seed_offer(db, shop["location"], qty_total=2, **offer_over)
        buyer = make_user(db, email=email)
        db.commit()
        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert r.status_code == 201, r.text
        return offer, buyer, r.json()

    def test_business_marks_handed_then_a_second_tap_is_409_with_the_time(
        self, client, db, shop, rescue_on
    ):
        _, _, order = self._reserved(client, db, shop)
        first = client.post(
            f"/rescue/orders/{order['id']}/handed", headers=auth_header(shop["owner"])
        )
        assert first.status_code == 200
        assert first.json()["handed_at"] is not None

        again = client.post(
            f"/rescue/orders/{order['id']}/handed", headers=auth_header(shop["owner"])
        )
        assert again.status_code == 409
        # The 409 names the time, so a repeated tap at the counter is answered
        # with "already done at HH:MM" rather than a bare conflict.
        assert "כבר נמסר" in again.json()["detail"]

    def test_a_stranger_cannot_mark_a_bag_handed(self, client, db, shop, rescue_on):
        _, buyer, order = self._reserved(client, db, shop, email="notowner@example.com")
        r = client.post(
            f"/rescue/orders/{order['id']}/handed", headers=auth_header(buyer)
        )
        assert r.status_code == 403

    def test_no_show_only_after_the_pickup_window_closed(
        self, client, db, shop, rescue_on
    ):
        now = utc_now()
        _, _, order = self._reserved(client, db, shop, email="late@example.com")
        early = client.post(
            f"/rescue/orders/{order['id']}/no_show", headers=auth_header(shop["owner"])
        )
        assert early.status_code == 409

        offer = (
            db.query(RescueOffer).filter(RescueOffer.id == order["offer_id"]).first()
        )
        offer.pickup_start = now - timedelta(hours=3)
        offer.pickup_end = now - timedelta(hours=1)
        db.commit()
        late = client.post(
            f"/rescue/orders/{order['id']}/no_show", headers=auth_header(shop["owner"])
        )
        assert late.status_code == 200
        assert late.json()["status"] == "no_show"

    # ── MEH-2865: handed / no_show lock like cancel_order ──────────────────

    def _ended(self, db, order):
        """Move the pickup window into the past so no_show is allowed."""
        now = utc_now()
        offer = db.query(RescueOffer).filter(RescueOffer.id == order["offer_id"]).first()
        offer.pickup_start = now - timedelta(hours=3)
        offer.pickup_end = now - timedelta(hours=1)
        db.commit()

    def _statements(self, fn):
        seen: list[str] = []

        def _capture(conn, cursor, statement, params, context, executemany):
            seen.append(statement)

        event.listen(engine, "before_cursor_execute", _capture)
        try:
            response = fn()
        finally:
            event.remove(engine, "before_cursor_execute", _capture)
        return response, seen

    @pytest.mark.parametrize("action", ["handed", "no_show"])
    def test_handover_actions_lock_the_offer_then_the_order(
        self, client, db, shop, rescue_on, action
    ):
        """The same two locks, in the same order, as cancel_order — observed on
        the statements the handler issues (the house pattern above)."""
        _, _, order = self._reserved(client, db, shop, email=f"lock-{action}@example.com")
        if action == "no_show":
            self._ended(db, order)
        r, seen = self._statements(
            lambda: client.post(
                f"/rescue/orders/{order['id']}/{action}", headers=auth_header(shop["owner"])
            )
        )
        assert r.status_code == 200, r.text
        assert any("rescue_orders" in s for s in seen), "the listener saw nothing"
        locks = [s for s in seen if "FOR UPDATE" in s.upper()]
        offer_lock = next((i for i, s in enumerate(locks) if "FROM rescue_offers" in s), None)
        order_lock = next((i for i, s in enumerate(locks) if "FROM rescue_orders" in s), None)
        assert offer_lock is not None, f"{action}: no FOR UPDATE on rescue_offers"
        assert order_lock is not None, f"{action}: no FOR UPDATE on rescue_orders"
        assert offer_lock < order_lock, f"{action}: order locked before offer — cancel_order takes them offer-first"

    @pytest.mark.parametrize("action", ["handed", "no_show"])
    def test_a_cancel_that_lands_first_makes_the_handover_a_409(
        self, client, db, shop, rescue_on, monkeypatch, action
    ):
        """The buyer's cancel commits between the handler's unlocked read and
        its lock. The handler must re-read under the lock and refuse — not hand
        over (or count a no-show on) a cancelled order."""
        _, buyer, order = self._reserved(client, db, shop, email=f"race-{action}@example.com")
        if action == "no_show":
            self._ended(db, order)
        real = rescue_module._offer_for_update

        def cancel_wins_then_lock(session, offer_id):
            session.query(RescueOrder).filter(RescueOrder.id == order["id"]).update(
                {RescueOrder.status: "cancelled"}, synchronize_session=False
            )
            return real(session, offer_id)

        monkeypatch.setattr(rescue_module, "_offer_for_update", cancel_wins_then_lock)
        r = client.post(
            f"/rescue/orders/{order['id']}/{action}", headers=auth_header(shop["owner"])
        )
        assert r.status_code == 409, f"{action} went through on a cancelled order: {r.text}"
        # The simulated cancel ran inside the handler's own transaction, so the
        # 409's rollback undoes it too and the row reads `reserved` again —
        # an artifact of simulating the race in one session. What matters is
        # that the handover did not happen.
        row = db.query(RescueOrder).filter(RescueOrder.id == order["id"]).first()
        db.refresh(row)
        assert row.status not in ("handed", "no_show"), row.status
        assert row.handed_at is None
        db.refresh(buyer)
        assert (buyer.rescue_no_show_count or 0) == 0

    def test_the_no_show_counter_is_one_sql_increment(self, client, db, shop, rescue_on):
        """Not a Python read-modify-write, which loses a count when two
        no-shows for one buyer land together."""
        _, buyer, order = self._reserved(client, db, shop, email="count@example.com")
        self._ended(db, order)
        r, seen = self._statements(
            lambda: client.post(
                f"/rescue/orders/{order['id']}/no_show", headers=auth_header(shop["owner"])
            )
        )
        assert r.status_code == 200, r.text
        updates = [s for s in seen if s.lstrip().upper().startswith("UPDATE USERS")]
        assert updates, "no UPDATE on users was issued"
        assert any("coalesce(users.rescue_no_show_count" in s.lower() for s in updates), updates
        db.refresh(buyer)
        assert buyer.rescue_no_show_count == 1


class TestBuyerCancel:
    def test_free_cancel_before_the_cutoff_gives_the_bag_back(
        self, client, db, shop, rescue_on
    ):
        offer = _seed_offer(db, shop["location"], qty_total=2)
        buyer = make_user(db, email="cancels@example.com")
        db.commit()
        order = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        ).json()
        db.refresh(offer)
        assert offer.qty_left == 1

        r = client.post(
            f"/rescue/orders/{order['id']}/cancel", headers=auth_header(buyer)
        )
        assert r.status_code == 200
        db.refresh(offer)
        assert offer.qty_left == 2, "the cancelled bag was not returned to stock"

    def test_cancel_after_the_cutoff_is_refused(self, client, db, shop, rescue_on):
        offer = _seed_offer(db, shop["location"], qty_total=2)
        buyer = make_user(db, email="toolate@example.com")
        db.commit()
        order = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        ).json()

        offer.cancel_until = utc_now() - timedelta(minutes=1)
        db.commit()
        r = client.post(
            f"/rescue/orders/{order['id']}/cancel", headers=auth_header(buyer)
        )
        assert r.status_code == 409
        db.refresh(offer)
        assert offer.qty_left == 1, "a refused cancel must not return stock"


class TestReview:
    def test_review_before_the_bag_was_handed_over_is_refused(
        self, client, db, shop, rescue_on
    ):
        offer = _seed_offer(db, shop["location"], qty_total=2)
        buyer = make_user(db, email="earlyreview@example.com")
        db.commit()
        order = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        ).json()
        r = client.post(
            f"/rescue/orders/{order['id']}/review",
            json={"rating": 5},
            headers=auth_header(buyer),
        )
        assert r.status_code == 409

    def test_one_review_per_bag(self, client, db, shop, rescue_on):
        offer = _seed_offer(db, shop["location"], qty_total=2)
        buyer = make_user(db, email="reviewer@example.com")
        db.commit()
        order = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        ).json()
        client.post(
            f"/rescue/orders/{order['id']}/handed", headers=auth_header(shop["owner"])
        )
        first = client.post(
            f"/rescue/orders/{order['id']}/review",
            json={"rating": 4, "contents_tags": ["לחם", "חלה"]},
            headers=auth_header(buyer),
        )
        assert first.status_code == 201
        second = client.post(
            f"/rescue/orders/{order['id']}/review",
            json={"rating": 1},
            headers=auth_header(buyer),
        )
        assert second.status_code == 409


class TestNoShowBlock:
    def _past_no_show(self, db, shop, buyer, *, days_ago):
        """One no-show whose pickup window closed `days_ago` days back.

        Seeded with `utc_now() - timedelta`, matching `_active_no_shows`, which
        measures a rolling UTC span rather than Israel calendar days.
        """
        now = utc_now()
        offer = _seed_offer(
            db,
            shop["location"],
            qty_total=1,
            qty_left=0,
            status="cancelled",
            pickup_start=now - timedelta(days=days_ago, hours=2),
            pickup_end=now - timedelta(days=days_ago),
        )
        order = RescueOrder(
            offer_id=offer.id,
            user_id=buyer.id,
            qty=1,
            pickup_code=f"{days_ago:04d}",
            status="no_show",
        )
        db.add(order)
        buyer.rescue_no_show_count = (buyer.rescue_no_show_count or 0) + 1
        db.commit()
        return order

    def test_one_no_show_does_not_block(self, client, db, shop, rescue_on):
        buyer = make_user(db, email="once@example.com")
        db.commit()
        self._past_no_show(db, shop, buyer, days_ago=3)
        offer = _seed_offer(db, shop["location"], qty_total=2)
        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert r.status_code == 201, "one no-show is a warning, not a ban"

    def test_the_second_no_show_inside_the_window_blocks(
        self, client, db, shop, rescue_on
    ):
        buyer = make_user(db, email="twice@example.com")
        db.commit()
        self._past_no_show(db, shop, buyer, days_ago=3)
        self._past_no_show(db, shop, buyer, days_ago=9)
        offer = _seed_offer(db, shop["location"], qty_total=2)
        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert r.status_code == 422
        assert r.json()["detail"] == "ההזמנות חסומות אחרי שתי אי-הגעות. כתבו לנו"

    def test_two_no_shows_outside_the_window_do_not_block(
        self, client, db, shop, rescue_on
    ):
        """The window is what the rule says it is.

        This is the case `users.rescue_no_show_count` alone gets WRONG: the
        counter reads 2 here and the buyer is not blocked, so a gate on the
        counter would ban someone whose no-shows were last season.
        """
        buyer = make_user(db, email="longago@example.com")
        db.commit()
        self._past_no_show(db, shop, buyer, days_ago=NO_SHOW_WINDOW_DAYS + 5)
        self._past_no_show(db, shop, buyer, days_ago=NO_SHOW_WINDOW_DAYS + 12)
        db.refresh(buyer)
        assert buyer.rescue_no_show_count == NO_SHOW_BLOCK_AT
        offer = _seed_offer(db, shop["location"], qty_total=2)
        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert r.status_code == 201

    def test_admin_clear_block_releases_the_buyer_without_erasing_history(
        self, client, db, shop, rescue_on
    ):
        buyer = make_user(db, email="forgiven@example.com")
        admin = make_user(db, email="admin-rescue@example.com", role="admin")
        db.commit()
        self._past_no_show(db, shop, buyer, days_ago=2)
        self._past_no_show(db, shop, buyer, days_ago=4)

        blocked = client.post(
            "/rescue/orders",
            json={"offer_id": str(_seed_offer(db, shop["location"]).id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert blocked.status_code == 422

        cleared = client.post(
            f"/admin/rescue/users/{buyer.id}/clear-block", headers=auth_header(admin)
        )
        assert cleared.status_code == 200
        state = cleared.json()
        assert state["active_no_shows"] == 0
        assert state["blocked"] is False
        # The record is kept: the lifetime counter still shows both, which is
        # what the chunk-5 no-show-rate metric reads.
        assert state["no_show_count"] == 2
        assert (
            db.query(RescueOrder)
            .filter(RescueOrder.user_id == buyer.id, RescueOrder.status == "no_show")
            .count()
            == 2
        )

        again = client.post(
            "/rescue/orders",
            json={"offer_id": str(_seed_offer(db, shop["location"]).id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert again.status_code == 201

    def test_a_non_admin_cannot_clear_a_block(self, client, db, shop, rescue_on):
        buyer = make_user(db, email="selfserve@example.com")
        db.commit()
        r = client.post(
            f"/admin/rescue/users/{buyer.id}/clear-block", headers=auth_header(buyer)
        )
        assert r.status_code == 403


class TestPublicList:
    def test_todays_bags_with_stock_appear_with_distance_and_typical_items(
        self, client, db, shop, rescue_on
    ):
        _seed_offer(db, shop["location"], qty_total=3)
        r = client.get("/rescue/offers", params={"lat": 32.79, "lng": 34.99})
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 1
        row = rows[0]
        assert row["qty_left"] == 3
        assert row["producer"]["location_address"] == "הנביאים 10"
        # Distance is to THE pickup point, and these coordinates are ~0.5 km
        # from it — not None, and not a whole-country number.
        assert row["distance_km"] is not None and row["distance_km"] < 2

    def test_a_sold_out_or_cancelled_bag_is_not_listed(
        self, client, db, shop, rescue_on
    ):
        sold_out = _seed_offer(db, shop["location"], qty_total=2, qty_left=0)
        assert client.get("/rescue/offers").json() == []
        sold_out.qty_left = 1
        sold_out.status = "cancelled"
        db.commit()
        assert client.get("/rescue/offers").json() == []
        # Control: the same row IS listed once it is active with stock, so the
        # two empties above are the filters and not a broken query.
        sold_out.status = "active"
        db.commit()
        assert len(client.get("/rescue/offers").json()) == 1

    def test_a_bag_whose_pickup_window_ended_is_not_listed(
        self, client, db, shop, rescue_on
    ):
        """MEH-2713: reserve refuses a bag once pickup_end passed ("זמן האיסוף
        חלף"), so listing it showed a button that could only fail — and the
        buyer read the 409 as «הסל הזה נגמר». Still today, still stock."""
        now = utc_now()
        ended = _seed_offer(
            db,
            shop["location"],
            pickup_start=now - timedelta(hours=3),
            pickup_end=now - timedelta(minutes=1),
            cancel_until=now - timedelta(hours=4),
        )
        assert client.get("/rescue/offers").json() == []
        # Control: the same row is listed while its window is still open, so the
        # empty list above is the window filter and not a broken seed.
        # 20 minutes, not 5: MEH-2726 closes reservations 15 minutes before
        # the end, so a 5-minute remainder is (correctly) unlisted too.
        ended.pickup_end = now + timedelta(minutes=20)
        db.commit()
        assert [row["id"] for row in client.get("/rescue/offers").json()] == [str(ended.id)]

    def test_reservations_close_15_minutes_before_the_pickup_window_ends(
        self, client, db, shop, rescue_on
    ):
        """MEH-2726 (Sapir 6/11 «תחקור ותחליט»): someone who reserves a minute
        before the end cannot get there, and the bag sits reserved for nobody.
        With 10 minutes left the bag is neither listed nor reservable; with 20
        it is both — the control that the 10-minute refusal is this rule."""
        now = utc_now()
        late = _seed_offer(
            db,
            shop["location"],
            pickup_start=now - timedelta(hours=1),
            pickup_end=now + timedelta(minutes=10),
            cancel_until=now - timedelta(hours=2),
        )
        buyer = make_user(db, email="late@example.com")
        db.commit()
        assert client.get("/rescue/offers").json() == []
        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(late.id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert r.status_code == 409, r.text
        assert r.json()["detail"] == "זמן האיסוף חלף"

        late.pickup_end = now + timedelta(minutes=20)
        db.commit()
        assert [row["id"] for row in client.get("/rescue/offers").json()] == [str(late.id)]
        ok = client.post(
            "/rescue/orders",
            json={"offer_id": str(late.id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert ok.status_code == 201, ok.text

    def test_distance_is_absent_when_the_caller_sends_no_coordinates(
        self, client, db, shop, rescue_on
    ):
        _seed_offer(db, shop["location"])
        row = client.get("/rescue/offers").json()[0]
        assert row["distance_km"] is None

    def test_the_city_filter_matches_the_pickup_town(self, client, db, shop, rescue_on):
        _seed_offer(db, shop["location"])
        assert len(client.get("/rescue/offers", params={"city": "חיפה"}).json()) == 1
        assert client.get("/rescue/offers", params={"city": "אילת"}).json() == []


class TestOfferCancel:
    def test_business_cancel_closes_every_open_reservation(
        self, client, db, shop, rescue_on
    ):
        offer = _seed_offer(db, shop["location"], qty_total=3)
        buyer = make_user(db, email="stranded@example.com")
        db.commit()
        order = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        ).json()

        r = client.post(
            f"/rescue/offers/{offer.id}/cancel", headers=auth_header(shop["owner"])
        )
        assert r.status_code == 200
        assert r.json()["status"] == "cancelled"
        row = db.query(RescueOrder).filter(RescueOrder.id == order["id"]).first()
        db.refresh(row)
        assert row.status == "cancelled"
        assert row.cancelled_at is not None

    def test_cancelling_twice_is_refused(self, client, db, shop, rescue_on):
        offer = _seed_offer(db, shop["location"])
        headers = auth_header(shop["owner"])
        assert (
            client.post(
                f"/rescue/offers/{offer.id}/cancel", headers=headers
            ).status_code
            == 200
        )
        assert (
            client.post(
                f"/rescue/offers/{offer.id}/cancel", headers=headers
            ).status_code
            == 409
        )


class TestReserveEmail:
    """MEH-2715 — the buyer gets one confirmation email per reservation.

    Copy approved word for word by Sapir on 6/11; the assertions quote it.
    Sends are captured at the service's own `send_email` reference, so nothing
    leaves the test (the same seam test_group_buys_api.py uses).
    """

    @staticmethod
    def _capture(monkeypatch):
        sent = []
        monkeypatch.setattr(
            "app.services.rescue_emails.send_email",
            lambda to, subject, body, html=None, reply_to=None: sent.append(
                {"to": to, "subject": subject, "body": body, "html": html}
            ),
        )
        return sent

    def test_a_reservation_emails_the_buyer_their_code_price_and_cutoff(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        sent = self._capture(monkeypatch)
        offer = _seed_offer(db, shop["location"], qty_total=4)
        buyer = make_user(db, email="mail@example.com")
        db.commit()

        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 2},
            headers=auth_header(buyer),
        )
        assert r.status_code == 201, r.text
        code = r.json()["pickup_code"]

        assert len(sent) == 1, sent
        mail = sent[0]
        assert mail["to"] == "mail@example.com"
        assert mail["subject"] == "שמרנו לכם סל במאפיית ההצלה"
        # The HTML is checked as rendered text: tags out, &nbsp; as a space.
        html_text = re.sub(r"<[^>]+>", "", mail["html"]).replace("&nbsp;", " ")
        for part in (mail["body"], html_text):
            assert code in part
            # Two bags at 15 ₪ each: the email quotes what is paid at the counter.
            assert "ומשלמים 30" in part
            assert "הנביאים 10, חיפה" in part
            assert "וככה הסל יגיע למישהו אחר" in part
            assert "צוות מהמקור 🌱" in part
        assert "לבטל את השריון" in mail["html"]
        assert f"/producer/{shop['producer'].id}" in mail["html"]

    def test_a_refused_reservation_sends_nothing(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        sent = self._capture(monkeypatch)
        offer = _seed_offer(db, shop["location"], qty_total=1, qty_left=0)
        buyer = make_user(db, email="nomail@example.com")
        db.commit()
        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert r.status_code == 409
        assert sent == []

    def test_the_business_name_is_escaped_in_the_html(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        sent = self._capture(monkeypatch)
        shop["producer"].name = "<b>מאפה</b>"
        db.commit()
        offer = _seed_offer(db, shop["location"])
        buyer = make_user(db, email="esc@example.com")
        db.commit()
        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert r.status_code == 201, r.text
        assert "<b>מאפה</b>" not in sent[0]["html"]
        assert "&lt;b&gt;מאפה&lt;/b&gt;" in sent[0]["html"]

    def test_no_address_drops_the_clause_and_a_line_break_never_reaches_the_subject(
        self, monkeypatch
    ):
        """Direct call: an empty address and a name with a newline are not
        reachable through the route's fixtures (exact-precision points carry an
        address), so the service is driven with plain values."""
        from app.services import rescue_emails

        sent = self._capture(monkeypatch)
        rescue_emails.send_reservation_email(
            "x@example.com",
            rescue_emails.ReservationEmail(
                producer_name="מאפה\r\nBcc: a@example.com",
                producer_id="p1",
                pickup_code="0431",
                total_agorot=1250,
                pickup_from="20:00",
                pickup_until="22:00",
                address="",
                cancel_until="19:30",
            ),
        )
        mail = sent[0]
        assert "\n" not in mail["subject"] and "\r" not in mail["subject"]
        assert mail["subject"] == "שמרנו לכם סל במאפה Bcc: a@example.com"
        assert "איסוף היום 20:00–22:00.\n" in mail["body"]
        assert ", ." not in mail["body"]
        assert "📍" not in mail["html"]
        assert "ומשלמים 12.50" in mail["body"]

    def test_a_failure_preparing_the_email_never_fails_a_committed_reservation(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        sent = self._capture(monkeypatch)

        def _boom(_value):
            raise RuntimeError("clock")

        monkeypatch.setattr(rescue_module, "israel_hhmm", _boom)
        offer = _seed_offer(db, shop["location"], qty_total=2)
        buyer = make_user(db, email="boom@example.com")
        db.commit()
        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert r.status_code == 201, r.text
        assert sent == []
        db.refresh(offer)
        assert offer.qty_left == 1


class TestBuyerCancelHardening:
    """MEH-2737 — the buyer's cancel, after the 6/11 research.

    Copy in these assertions was approved word for word by Sapir on 6/11
    («מאשרת 1-8», texts 4 and 5 here).
    """

    @staticmethod
    def _capture(monkeypatch):
        sent = []
        monkeypatch.setattr(
            "app.services.rescue_emails.send_email",
            lambda to, subject, body, html=None, reply_to=None: sent.append(
                {"to": to, "subject": subject, "body": body, "html": html}
            ),
        )
        return sent

    def _reserve(self, client, offer, buyer, qty=1):
        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": qty},
            headers=auth_header(buyer),
        )
        assert r.status_code == 201, r.text
        return r.json()

    def test_the_cancel_path_locks_the_order_row_before_giving_stock_back(
        self, client, db, shop, rescue_on
    ):
        """Two cancels of one order (a double tap, or the page and the email
        at once) both read `reserved` before either commits; without a lock on
        the ORDER both add its bags back and the offer shows a bag that does
        not exist. The offer lock alone does not stop it — the order was read
        before the lock. Observed on the statements the handler issues, the
        same way the reservation lock is tested above."""
        offer = _seed_offer(db, shop["location"], qty_total=2)
        buyer = make_user(db, email="lockcancel@example.com")
        db.commit()
        order = self._reserve(client, offer, buyer)

        seen: list[str] = []

        def _capture(conn, cursor, statement, params, context, executemany):
            seen.append(statement)

        event.listen(engine, "before_cursor_execute", _capture)
        try:
            r = client.post(
                f"/rescue/orders/{order['id']}/cancel", headers=auth_header(buyer)
            )
        finally:
            event.remove(engine, "before_cursor_execute", _capture)

        assert r.status_code == 200, r.text
        assert any("rescue_orders" in s for s in seen), "the listener saw nothing"
        locking = [
            s
            for s in seen
            if "FOR UPDATE" in s.upper()
            and "FROM rescue_orders" in s
            and "rescue_offers" not in s.split("FROM", 1)[1].split("WHERE", 1)[0]
        ]
        assert locking, (
            "cancelling did not lock the order row — "
            f"{len(seen)} statements seen, none a FOR UPDATE on rescue_orders"
        )

    def test_a_second_cancel_is_409_and_stock_rises_once(
        self, client, db, shop, rescue_on
    ):
        offer = _seed_offer(db, shop["location"], qty_total=3)
        buyer = make_user(db, email="twice@example.com")
        db.commit()
        order = self._reserve(client, offer, buyer)
        first = client.post(
            f"/rescue/orders/{order['id']}/cancel", headers=auth_header(buyer)
        )
        second = client.post(
            f"/rescue/orders/{order['id']}/cancel", headers=auth_header(buyer)
        )
        assert first.status_code == 200
        assert second.status_code == 409
        db.refresh(offer)
        assert offer.qty_left == 3

    def test_a_cancel_emails_the_buyer(self, client, db, shop, rescue_on, monkeypatch):
        sent = self._capture(monkeypatch)
        offer = _seed_offer(db, shop["location"], qty_total=2)
        buyer = make_user(db, email="cancelmail@example.com")
        db.commit()
        order = self._reserve(client, offer, buyer)
        sent.clear()  # the reservation email

        r = client.post(
            f"/rescue/orders/{order['id']}/cancel", headers=auth_header(buyer)
        )
        assert r.status_code == 200
        assert len(sent) == 1, sent
        mail = sent[0]
        assert mail["to"] == "cancelmail@example.com"
        assert mail["subject"] == "השריון במאפיית ההצלה בוטל"
        html_text = re.sub(r"<[^>]+>", "", mail["html"]).replace("&nbsp;", " ")
        for part in (mail["body"], html_text):
            assert (
                "ביטלנו את השריון שלכם לסל במאפיית ההצלה. "
                "הקוד כבר לא בתוקף ואין צורך להגיע." in part
            )
            assert "תודה שביטלתם בזמן, ככה הסל יגיע למישהו אחר." in part
            assert "צוות מהמקור 🌱" in part
        assert order["pickup_code"] not in mail["body"]

    def test_a_refused_cancel_sends_nothing(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        sent = self._capture(monkeypatch)
        offer = _seed_offer(db, shop["location"], qty_total=2)
        buyer = make_user(db, email="latecancel@example.com")
        db.commit()
        order = self._reserve(client, offer, buyer)
        sent.clear()
        offer.cancel_until = utc_now() - timedelta(minutes=1)
        db.commit()
        r = client.post(
            f"/rescue/orders/{order['id']}/cancel", headers=auth_header(buyer)
        )
        assert r.status_code == 409
        assert sent == []

    def test_a_reservation_after_the_cutoff_emails_no_cancel_line_or_button(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        sent = self._capture(monkeypatch)
        now = utc_now()
        offer = _seed_offer(
            db,
            shop["location"],
            pickup_start=now - timedelta(minutes=30),
            pickup_end=now + timedelta(hours=1),
            cancel_until=now - timedelta(hours=1),
        )
        buyer = make_user(db, email="aftercut@example.com")
        db.commit()
        self._reserve(client, offer, buyer)
        mail = sent[0]
        assert "אפשר לבטל בחינם" not in mail["body"]
        assert "אפשר לבטל בחינם" not in mail["html"]
        assert "לבטל את השריון" not in mail["html"]
        assert "לבטל את השריון" not in mail["body"]
        # The rest of the email is unchanged.
        assert "צוות מהמקור 🌱" in mail["body"]

    def test_a_reservation_before_the_cutoff_still_carries_the_cancel_line(
        self, client, db, shop, rescue_on, monkeypatch
    ):
        """Control for the test above: the same assertions inverted, so a
        change that dropped the line for everyone cannot pass both."""
        sent = self._capture(monkeypatch)
        offer = _seed_offer(db, shop["location"])
        buyer = make_user(db, email="beforecut@example.com")
        db.commit()
        self._reserve(client, offer, buyer)
        assert "אפשר לבטל בחינם עד" in sent[0]["body"]
        assert "לבטל את השריון" in sent[0]["html"]
