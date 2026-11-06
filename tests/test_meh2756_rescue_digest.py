"""MEH-2756 — the pickup_start WhatsApp digest of codes to the business.

WHAT THIS FILE IS ABOUT: when the stamp is written and when it is NOT.
`rescue_offers.codes_sent_at` is the only duplicate-send guarantee the digest
has, so every skip path has to be deliberate about it:

  - nothing was sent and may still be        → stays NULL (retried next tick)
  - nothing was sent and never will be here  → stamped (so ticks stop looking)

Getting that backwards either spams a business every 5 minutes for the length
of its pickup window, or silently loses the codes it needs at the counter.

The other subject is the AlertLog cap. Its key is
(user_id, producer_id, channel, sent_at) and `alert_type` is deliberately NOT
part of it, so a digest on channel "whatsapp" would collapse with a consumer
favorite-alert about the same business. `test_the_cap_is_disjoint_from_the_
consumer_channel` is the test that pins the separate channel; it fails if
someone "simplifies" CHANNEL_DIGEST back to "whatsapp".
"""

from datetime import timedelta

import pytest
from conftest import make_producer, make_user

from app.models.models import AlertLog, ProducerLocation, RescueOffer, RescueOrder
from app.routers import rescue as rescue_module
from app.services import rescue_digest as digest_module
from app.services.rescue_digest import (
    CHANNEL_DIGEST,
    build_codes_param,
    build_window_param,
    send_rescue_digests,
)
from app.utils.clock import israel_today, utc_now


class _Sent(list):
    """The captured sends, with an `ok` switch so a test can make Meta refuse.

    A list subclass rather than a bare list: a plain list has no __dict__, so
    the switch cannot be hung off it.
    """

    ok: dict


@pytest.fixture
def sent(monkeypatch):
    """Capture every send instead of calling Meta. Holds (phone, template)
    tuples; set `sent.ok["ok"] = False` to simulate a Meta rejection."""
    calls = _Sent()
    calls.ok = {"ok": True}

    def _fake(to, template):
        calls.append((to, template))
        return calls.ok["ok"]

    monkeypatch.setattr(digest_module, "send_template", _fake)
    return calls


@pytest.fixture
def gates_on(monkeypatch):
    """Pilot on, digest on, one pilot town."""
    monkeypatch.setattr(rescue_module, "rescue_bags_enabled", lambda: True)
    monkeypatch.setattr(rescue_module, "rescue_cities", lambda: ("חיפה",))
    monkeypatch.setattr(digest_module, "digest_enabled", lambda: True)


@pytest.fixture
def shop(db):
    producer = make_producer(db, name="מאפיית הקודים", city="חיפה")
    producer.phone = "+972501112233"
    owner = make_user(db, email="digest-owner@example.com", role="producer")
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


def _offer(db, shop, *, started_min_ago=10, ends_in_min=120, city=None, status="active"):
    """An offer whose window is OPEN by default: started 10 min ago, 2h left.

    `pickup_start`/`pickup_end` are naive-UTC columns (models.py), so the seeds
    are built from `utc_now()` and stripped — NOT from `datetime.now()`, which
    would be the runner's local clock.
    """
    if city is not None:
        shop["location"].city = city
        db.commit()
    now = utc_now().replace(tzinfo=None)
    offer = RescueOffer(
        producer_location_id=shop["location"].id,
        date=israel_today(),
        qty_total=5,
        qty_left=3,
        price_agorot=1500,
        pickup_start=now - timedelta(minutes=started_min_ago),
        pickup_end=now + timedelta(minutes=ends_in_min),
        cancel_until=now - timedelta(minutes=started_min_ago + 1),
        status=status,
    )
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return offer


def _order(db, offer, shop, *, code="0431", qty=1, status="reserved", email=None):
    buyer = make_user(db, email=email or f"buyer-{code}@example.com")
    order = RescueOrder(
        offer_id=offer.id,
        user_id=buyer.id,
        qty=qty,
        pickup_code=code,
        status=status,
    )
    db.add(order)
    db.commit()
    return order


# --------------------------------------------------------------------------
class TestTheHappyPath:
    def test_a_due_offer_sends_once_and_stamps(self, db, shop, gates_on, sent):
        offer = _offer(db, shop)
        _order(db, offer, shop, code="0431", qty=2)

        counts = send_rescue_digests(db)

        assert counts["sent"] == 1, counts
        assert len(sent) == 1
        phone, template = sent[0]
        assert phone == "+972501112233"
        assert template.name == "rescue_codes_digest_v1"
        assert template.producer_name == "מאפיית הקודים"
        assert template.codes == "0431 (2)"
        db.refresh(offer)
        assert offer.codes_sent_at is not None

    def test_the_send_is_logged_on_its_own_channel(self, db, shop, gates_on, sent):
        offer = _offer(db, shop)
        _order(db, offer, shop)

        send_rescue_digests(db)

        rows = db.query(AlertLog).all()
        assert len(rows) == 1
        assert rows[0].channel == CHANNEL_DIGEST == "whatsapp_digest"
        assert rows[0].user_id == shop["owner"].id
        assert rows[0].producer_id == shop["producer"].id

    def test_only_reserved_orders_reach_the_list(self, db, shop, gates_on, sent):
        offer = _offer(db, shop)
        _order(db, offer, shop, code="0431", qty=1)
        _order(db, offer, shop, code="0555", qty=1, status="cancelled")
        _order(db, offer, shop, code="0777", qty=1, status="handed")
        _order(db, offer, shop, code="0999", qty=1, status="no_show")

        send_rescue_digests(db)

        assert sent[0][1].codes == "0431 (1)"

    def test_several_codes_are_sorted_and_single_line(self, db, shop, gates_on, sent):
        offer = _offer(db, shop)
        _order(db, offer, shop, code="0887", qty=1)
        _order(db, offer, shop, code="0431", qty=2)

        send_rescue_digests(db)

        codes = sent[0][1].codes
        # Sorted by CODE, not by insertion: the person at the counter is
        # matching four digits against a list.
        assert codes == "0431 (2), 0887 (1)"
        # Meta rejects a parameter carrying a newline or a tab, and
        # send_template returns False without raising — so this is the
        # assertion that keeps the failure from being silent.
        assert "\n" not in codes and "\t" not in codes
        assert "     " not in codes


# --------------------------------------------------------------------------
class TestWhenTheStampMustStayNull:
    def test_no_reserved_orders_sends_nothing_and_does_not_stamp(
        self, db, shop, gates_on, sent
    ):
        offer = _offer(db, shop)

        counts = send_rescue_digests(db)

        assert counts["skipped_no_reserved"] == 1
        assert sent == []
        db.refresh(offer)
        # NOT stamped: a reservation made later in the window must still be
        # digested. Stamping here would lose it.
        assert offer.codes_sent_at is None

    def test_a_reservation_arriving_later_is_still_digested(
        self, db, shop, gates_on, sent
    ):
        offer = _offer(db, shop)
        assert send_rescue_digests(db)["skipped_no_reserved"] == 1

        _order(db, offer, shop, code="0222", qty=1)
        counts = send_rescue_digests(db)

        assert counts["sent"] == 1
        assert sent[0][1].codes == "0222 (1)"

    def test_a_failed_send_leaves_the_stamp_null_for_the_next_tick(
        self, db, shop, gates_on, sent
    ):
        offer = _offer(db, shop)
        _order(db, offer, shop)
        sent.ok["ok"] = False

        counts = send_rescue_digests(db)

        assert counts["failed"] == 1
        assert len(sent) == 1  # it was attempted
        db.refresh(offer)
        assert offer.codes_sent_at is None

        # ... and the retry succeeds, which is the point of not stamping.
        sent.ok["ok"] = True
        assert send_rescue_digests(db)["sent"] == 1
        db.refresh(offer)
        assert offer.codes_sent_at is not None

    def test_a_business_with_no_phone_is_skipped_unstamped(
        self, db, shop, gates_on, sent
    ):
        shop["producer"].phone = "   "
        db.commit()
        offer = _offer(db, shop)
        _order(db, offer, shop)

        counts = send_rescue_digests(db)

        assert counts["skipped_no_phone"] == 1
        assert sent == []
        db.refresh(offer)
        assert offer.codes_sent_at is None


# --------------------------------------------------------------------------
class TestIdempotencyAndTheGates:
    def test_a_stamped_offer_is_never_sent_again(self, db, shop, gates_on, sent):
        offer = _offer(db, shop)
        _order(db, offer, shop)

        assert send_rescue_digests(db)["sent"] == 1
        counts = send_rescue_digests(db)

        assert counts["sent"] == 0
        assert counts["scanned"] == 0, "a stamped offer must not even be a candidate"
        assert len(sent) == 1

    def test_the_digest_gate_off_sends_nothing(self, db, shop, monkeypatch, sent):
        monkeypatch.setattr(rescue_module, "rescue_bags_enabled", lambda: True)
        monkeypatch.setattr(rescue_module, "rescue_cities", lambda: ("חיפה",))
        monkeypatch.setattr(digest_module, "digest_enabled", lambda: False)
        offer = _offer(db, shop)
        _order(db, offer, shop)

        counts = send_rescue_digests(db)

        assert counts["skipped_gate_off"] == 1
        assert counts["sent"] == 0
        assert sent == []
        db.refresh(offer)
        assert offer.codes_sent_at is None

    def test_the_gate_defaults_off(self):
        # The real function, not the fixture's lambda: merging this PR must not
        # send anything until Sapir adds the field and turns it on.
        assert digest_module.digest_enabled() is False

    def test_the_pilot_flag_off_sends_nothing(self, db, shop, monkeypatch, sent):
        monkeypatch.setattr(rescue_module, "rescue_bags_enabled", lambda: False)
        monkeypatch.setattr(digest_module, "digest_enabled", lambda: True)
        offer = _offer(db, shop)
        _order(db, offer, shop)

        assert send_rescue_digests(db)["sent"] == 0
        assert sent == []

    def test_a_town_outside_the_pilot_is_skipped(self, db, shop, gates_on, sent):
        offer = _offer(db, shop, city="אילת")
        _order(db, offer, shop)

        counts = send_rescue_digests(db)

        assert counts["skipped_not_in_pilot"] == 1
        assert sent == []
        db.refresh(offer)
        assert offer.codes_sent_at is None

    def test_a_cancelled_offer_is_not_a_candidate(self, db, shop, gates_on, sent):
        offer = _offer(db, shop, status="cancelled")
        _order(db, offer, shop)

        assert send_rescue_digests(db)["scanned"] == 0
        assert sent == []


# --------------------------------------------------------------------------
class TestTheWindow:
    def test_before_pickup_start_nothing_is_due(self, db, shop, gates_on, sent):
        offer = _offer(db, shop, started_min_ago=-30, ends_in_min=180)
        _order(db, offer, shop)

        assert send_rescue_digests(db)["scanned"] == 0
        assert sent == []
        db.refresh(offer)
        assert offer.codes_sent_at is None

    def test_after_pickup_end_the_offer_drops_out_and_stays_null(
        self, db, shop, gates_on, sent
    ):
        offer = _offer(db, shop, started_min_ago=300, ends_in_min=-60)
        _order(db, offer, shop)

        assert send_rescue_digests(db)["scanned"] == 0
        assert sent == []
        db.refresh(offer)
        # Deliberate: codes for a window that already closed are worse than no
        # message, and `pickup_end > now` keeps it out of the candidate set, so
        # a permanent NULL costs no repeated work.
        assert offer.codes_sent_at is None

    def test_the_window_param_is_the_israel_clock(self, db, shop, gates_on):
        offer = _offer(db, shop)
        window = build_window_param(offer)
        assert "–" in window
        hh, mm = window.split("–")[0].split(":")
        assert 0 <= int(hh) <= 23 and 0 <= int(mm) <= 59
        assert "\n" not in window


# --------------------------------------------------------------------------
class TestTheAlertLogCap:
    def test_the_cap_suppresses_a_second_digest_within_24h(
        self, db, shop, gates_on, sent
    ):
        first = _offer(db, shop)
        _order(db, first, shop, code="0431")
        assert send_rescue_digests(db)["sent"] == 1

        # A SECOND offer the same day — e.g. a second pickup point.
        second = RescueOffer(
            producer_location_id=shop["location"].id,
            date=israel_today(),
            qty_total=4,
            qty_left=4,
            price_agorot=1200,
            pickup_start=utc_now().replace(tzinfo=None) - timedelta(minutes=5),
            pickup_end=utc_now().replace(tzinfo=None) + timedelta(minutes=90),
            cancel_until=utc_now().replace(tzinfo=None) - timedelta(minutes=6),
            status="active",
        )
        db.add(second)
        db.commit()
        db.refresh(second)
        _order(db, second, shop, code="0888", email="second@example.com")

        counts = send_rescue_digests(db)

        assert counts["skipped_capped"] == 1
        assert counts["sent"] == 0
        assert len(sent) == 1, "the cap is what stops the second send"
        db.refresh(second)
        # STAMPED, unlike the other skips: the cap is a decision about this
        # offer. Leaving it NULL would re-evaluate and re-log it every 5
        # minutes for the rest of the window.
        assert second.codes_sent_at is not None

    def test_the_cap_is_disjoint_from_the_consumer_channel(
        self, db, shop, gates_on, sent
    ):
        """A consumer favorite-alert must NOT eat the business's digest.

        This is the test that fails if CHANNEL_DIGEST is "simplified" back to
        "whatsapp": AlertLog's cap key excludes `alert_type`
        (models.py:1590-1606), so one shared channel makes these two unrelated
        messages share a 24h budget.
        """
        db.add(
            AlertLog(
                user_id=shop["owner"].id,
                producer_id=shop["producer"].id,
                channel="whatsapp",  # the CONSUMER channel
                alert_type="new_product",
            )
        )
        db.commit()

        offer = _offer(db, shop)
        _order(db, offer, shop)

        counts = send_rescue_digests(db)

        assert counts["sent"] == 1, (
            "a consumer-channel alert_log row must not cap the business digest"
        )
        assert counts["skipped_capped"] == 0


# --------------------------------------------------------------------------
class TestTheCodesParam:
    def test_a_newline_in_a_name_cannot_reach_meta(self, db, shop, gates_on, sent):
        shop["producer"].name = "מאפיית\nהקודים"
        db.commit()
        offer = _offer(db, shop)
        _order(db, offer, shop)

        send_rescue_digests(db)

        assert "\n" not in sent[0][1].producer_name
        assert sent[0][1].producer_name == "מאפיית הקודים"

    def test_build_codes_param_is_total_over_the_offer_cap(self):
        class _O:
            def __init__(self, code, qty):
                self.pickup_code = code
                self.qty = qty

        # RESCUE_MAX_QTY_PER_OFFER = 20, so 20 single-bag orders is the widest
        # list possible. It must stay well inside Meta's 1024-char body budget.
        orders = [_O(f"{i:04d}", 1) for i in range(20)]
        param = build_codes_param(orders)
        assert len(param) < 400, len(param)
        assert param.startswith("0000 (1), 0001 (1)")
        assert "\n" not in param
