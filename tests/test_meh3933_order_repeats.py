"""MEH-3933 — a buyer's weekly repeat of an order (Fischgrund bakery,
27/11/2026).

The cells: an order with «כל שבוע» starts one repeat · without it, none ·
the next week is the same Israel weekday and hour, across a clock change ·
nothing is made before it is due · when due, one order is made with no phone
code, and a second run makes no second order · a week the business cannot
take is skipped, both sides are told, and the third skip in a row stops it ·
Shabbat for an observant business waits instead of skipping · the buyer
stops it with her token, the business from its order, another business
cannot · the phone and business caps · the job follows the ordering flag.
Review round 1: a guest cannot start one, nor an order with alcohol · two
repeats due on one phone are both made (the open-order limit does not count
them) · a week the business declined counts as skipped, and the third stops
it before a fourth order is made · weeks missed while the job was off are
passed over, not counted or mailed.
"""

import uuid

from datetime import UTC, datetime, timedelta

import pytest

from app.limits import CAPS
from app.models.email_outbox import EmailOutbox
from app.models.product_order_repeats import ProductOrderRepeat
from app.models.product_orders import ProducerOrderSettings, ProductOrder
from app.routers import product_order_offer as offer_router
from app.services import product_order_create as create_service
from app.services import product_order_repeat as rep
from app.services import product_order_repeat_job as job
from app.utils.clock import ISRAEL_TZ
from _test_meh3263_order_route__common import (  # noqa: F401 — fixtures
    PHONE,
    PHONE_STORED,
    Shop,
    code_for,
    flag_on,
    sent,
    valid_order_payload,
)
from tests.conftest import auth_header, make_producer, make_user

_START = datetime.now(UTC).replace(tzinfo=None, microsecond=0)


class _Clock:
    now = _START


@pytest.fixture(autouse=True)
def _one_clock(monkeypatch):
    _Clock.now = _START
    monkeypatch.setattr(offer_router, "utc_now", lambda: _Clock.now)
    monkeypatch.setattr(create_service, "utc_now", lambda: _Clock.now)
    monkeypatch.setattr(rep, "utc_now", lambda: _Clock.now)


def _slot(client, shop, nth=2):
    menu = client.get(f"/producers/{shop.id}/order-menu").json()
    return [s["start"] for s in menu["slots"] if s["fulfilment"] == "pickup"][nth]


class _Buyer:
    user = None


def _order(client, shop, sent, repeat=True, guest=False, nth=2, **over):
    code = code_for(client, shop, sent)
    body = valid_order_payload(
        shop, _slot(client, shop, nth), code, repeat_weekly=repeat, **over
    )
    headers = None if guest else auth_header(_Buyer.user)
    return client.post("/product-orders", json=body, headers=headers)


@pytest.fixture(autouse=True)
def _a_buyer(db):
    """The repeat is for a logged-in buyer (review H2): every order here is
    sent logged in, unless a test says guest=True."""
    _Buyer.user = make_user(db, email=f"b{uuid.uuid4().hex[:8]}@example.com")


def _repeats(db, shop):
    db.expire_all()
    return db.query(ProductOrderRepeat).filter_by(producer_id=shop.producer.id).all()


def _orders(db, shop):
    db.expire_all()
    return (
        db.query(ProductOrder)
        .filter_by(producer_id=shop.producer.id)
        .order_by(ProductOrder.slot_start)
        .all()
    )


def _mails(db, kind):
    return db.query(EmailOutbox).filter(EmailOutbox.kind == kind).all()


def _to_due(repeat):
    """Move the clock to this week's slot: next week is due from then."""
    _Clock.now = repeat.last_slot_start + timedelta(minutes=1)
    return rep.next_slot_start(repeat.last_slot_start)


# --- starting one ----------------------------------------------------------------


def test_an_order_with_every_week_starts_one_repeat(client, db, flag_on, sent):
    shop = Shop(db)
    res = _order(client, shop, sent)
    assert res.status_code == 201, res.text
    assert res.json()["repeat"] == "active"
    [repeat] = _repeats(db, shop)
    [order] = _orders(db, shop)
    assert order.repeat_id == repeat.id
    assert repeat.last_slot_start == order.slot_start
    assert repeat.items == [
        {"product_id": str(shop.bread.id), "variant_id": None, "qty": 2}
    ]
    assert repeat.customer_phone == PHONE_STORED


def test_an_order_without_it_starts_none(client, db, flag_on, sent):
    shop = Shop(db)
    res = _order(client, shop, sent, repeat=False)
    assert res.status_code == 201, res.text
    assert res.json()["repeat"] is None
    assert _repeats(db, shop) == []


def test_a_fourth_repeat_for_one_phone_is_refused(client, db, flag_on, sent):
    shop = Shop(db)
    for _ in range(rep.MAX_REPEATS_PER_PHONE):
        db.add(
            ProductOrderRepeat(
                producer_id=shop.producer.id,
                customer_name="דנה לוי",
                customer_phone=PHONE_STORED,
                fulfilment="pickup",
                items=[{"product_id": str(shop.bread.id), "variant_id": None, "qty": 1}],
                last_slot_start=_START,
            )
        )
    db.commit()
    res = _order(client, shop, sent)
    assert res.status_code == 409
    assert res.json()["detail"] == rep.TOO_MANY_FOR_PHONE_DETAIL
    assert _orders(db, shop) == []  # the order was not written either
    # A stopped one does not count.
    db.query(ProductOrderRepeat).limit(1).first().state = "stopped"
    db.commit()
    assert _order(client, shop, sent).status_code == 201


def test_the_business_cap_is_registered():
    assert CAPS["order_repeats"] == 300


# --- the next week -----------------------------------------------------------------


def test_the_next_week_keeps_the_israel_hour_across_the_clock_change():
    # Friday 23/10/2026 10:00 IDT (UTC+3); the clock goes back on 25/10.
    last = datetime(2026, 10, 23, 7, 0)
    nxt = rep.next_slot_start(last)
    assert nxt == datetime(2026, 10, 30, 8, 0)  # Friday 10:00 IST (UTC+2)
    local = nxt.replace(tzinfo=UTC).astimezone(ISRAEL_TZ)
    assert (local.weekday(), local.hour) == (4, 10)


def test_nothing_is_made_before_it_is_due(client, db, flag_on, sent):
    shop = Shop(db)
    _order(client, shop, sent)
    [repeat] = _repeats(db, shop)
    just_before = repeat.last_slot_start - timedelta(minutes=1)
    assert rep.run_due(db, now=just_before).made == 0
    assert len(_orders(db, shop)) == 1


def test_when_due_one_order_is_made_and_a_second_run_makes_none(client, db, flag_on, sent):
    shop = Shop(db)
    _order(client, shop, sent)
    [repeat] = _repeats(db, shop)
    start = _to_due(repeat)
    codes_before = len(sent)

    assert rep.run_due(db, now=_Clock.now).made == 1
    assert rep.run_due(db, now=_Clock.now).made == 0

    first, made = _orders(db, shop)
    assert made.slot_start == start
    assert made.repeat_id == repeat.id
    assert made.status == "pending"
    assert [(i.product_id, i.qty) for i in made.items] == [(shop.bread.id, 2)]
    assert len(sent) == codes_before  # no phone code was asked
    [repeat] = _repeats(db, shop)
    assert repeat.last_slot_start == start and repeat.skipped_in_row == 0


def test_a_week_the_business_cannot_take_is_skipped_and_both_are_told(client, db, flag_on, sent):
    shop = Shop(db)
    _order(client, shop, sent)
    [repeat] = _repeats(db, shop)
    start = _to_due(repeat)
    db.query(ProducerOrderSettings).update({"enabled": False})
    db.commit()

    assert rep.run_due(db, now=_Clock.now).skipped == 1

    assert len(_orders(db, shop)) == 1
    [repeat] = _repeats(db, shop)
    assert (repeat.skipped_in_row, repeat.state) == (1, "active")
    assert repeat.last_slot_start == start
    [mail] = _mails(db, "order_repeat_skipped_business")
    assert mail.to_email == shop.owner.email
    assert "דנה לוי" in mail.subject
    assert "לא מקבל כרגע הזמנות" in mail.body


def test_the_third_skip_in_a_row_stops_it(client, db, flag_on, sent):
    shop = Shop(db)
    _order(client, shop, sent)
    db.query(ProducerOrderSettings).update({"enabled": False})
    db.commit()
    for _ in range(rep.SKIP_LIMIT):
        [repeat] = _repeats(db, shop)
        _to_due(repeat)
        rep.run_due(db, now=_Clock.now)
    [repeat] = _repeats(db, shop)
    assert (repeat.state, repeat.stopped_by, repeat.skipped_in_row) == (
        "stopped",
        "system",
        rep.SKIP_LIMIT,
    )
    assert len(_mails(db, "order_repeat_skipped_business")) == rep.SKIP_LIMIT - 1
    assert len(_mails(db, "order_repeat_stopped_business")) == 1
    # A stopped repeat makes nothing, even when the business is open again.
    db.query(ProducerOrderSettings).update({"enabled": True})
    db.commit()
    _to_due(repeat)
    assert rep.run_due(db, now=_Clock.now).made == 0


def test_a_made_week_resets_the_skips(client, db, flag_on, sent):
    shop = Shop(db)
    _order(client, shop, sent)
    [repeat] = _repeats(db, shop)
    repeat.skipped_in_row = 2
    db.commit()
    _to_due(repeat)
    assert rep.run_due(db, now=_Clock.now).made == 1
    assert _repeats(db, shop)[0].skipped_in_row == 0


def test_shabbat_waits_for_an_observant_business(client, db, flag_on, sent):
    shop = Shop(db)
    _order(client, shop, sent)
    db.query(ProducerOrderSettings).update({"shabbat_observant": True})
    [repeat] = _repeats(db, shop)
    # Saturday noon on the Israel clock, with this repeat due.
    day = _START.replace(tzinfo=UTC).astimezone(ISRAEL_TZ).date()
    day += timedelta(days=(5 - day.weekday()) % 7 or 7)
    saturday = datetime(day.year, day.month, day.day, 12, tzinfo=ISRAEL_TZ)
    _Clock.now = saturday.astimezone(UTC).replace(tzinfo=None)
    repeat.last_slot_start = _Clock.now - timedelta(hours=1)
    db.commit()

    counters = rep.run_due(db, now=_Clock.now)
    assert (counters.waiting, counters.skipped) == (1, 0)
    [repeat] = _repeats(db, shop)
    assert repeat.skipped_in_row == 0
    assert repeat.last_slot_start == _Clock.now - timedelta(hours=1)


# --- stopping it -----------------------------------------------------------------


def test_the_buyer_stops_it_with_her_token(client, db, flag_on, sent):
    shop = Shop(db)
    token = _order(client, shop, sent).json()["status_token"]
    res = client.post("/product-orders/status/repeat/stop", json={"token": token})
    assert res.status_code == 200, res.text
    assert res.json()["repeat"] == "stopped"
    [repeat] = _repeats(db, shop)
    assert repeat.stopped_by == "customer"
    assert _orders(db, shop)[0].status == "pending"  # the order itself stays
    [mail] = _mails(db, "order_repeat_stopped_business")
    assert mail.to_email == shop.owner.email
    # Again: no second email.
    client.post("/product-orders/status/repeat/stop", json={"token": token})
    assert len(_mails(db, "order_repeat_stopped_business")) == 1


def test_the_business_stops_it_from_its_order(client, db, flag_on, sent):
    shop = Shop(db)
    order_id = _order(client, shop, sent).json()["id"]
    res = client.post(
        f"/producers/me/product-orders/{order_id}/repeat/stop", headers=shop.headers
    )
    assert res.status_code == 200, res.text
    assert res.json()["repeat"] == "stopped"
    assert _repeats(db, shop)[0].stopped_by == "business"


def test_another_business_cannot_stop_it(client, db, flag_on, sent):
    shop = Shop(db)
    order_id = _order(client, shop, sent).json()["id"]
    stranger = make_user(db, role="producer", email="stranger3933@example.com")
    stranger.producer_id = make_producer(db, name="מאפייה אחרת").id
    stranger.is_producer = True
    db.commit()
    res = client.post(
        f"/producers/me/product-orders/{order_id}/repeat/stop",
        headers=auth_header(stranger),
    )
    assert res.status_code == 404
    assert _repeats(db, shop)[0].state == "active"


def test_stopping_needs_a_login_or_the_token(client, db, flag_on, sent):
    shop = Shop(db)
    order_id = _order(client, shop, sent).json()["id"]
    assert client.post(f"/producers/me/product-orders/{order_id}/repeat/stop").status_code == 401
    # The buyer route without a token, logged out: one 404, nothing stopped.
    res = client.post("/product-orders/status/repeat/stop", json={"order_id": order_id})
    assert res.status_code == 404
    assert _repeats(db, shop)[0].state == "active"


def test_stopping_an_order_with_no_repeat_is_refused(client, db, flag_on, sent):
    shop = Shop(db)
    token = _order(client, shop, sent, repeat=False).json()["status_token"]
    res = client.post("/product-orders/status/repeat/stop", json={"token": token})
    assert res.status_code == 409
    assert res.json()["detail"] == rep.NOT_REPEATING_DETAIL


# --- the job -----------------------------------------------------------------------


class _Scheduler:
    def __init__(self):
        self.ids = []

    def add_job(self, func, trigger, **kw):
        self.ids.append(kw["id"])


def test_the_job_follows_the_ordering_flag(monkeypatch):
    from app.routers import product_orders

    monkeypatch.setattr(product_orders, "product_orders_enabled", lambda: False)
    off = _Scheduler()
    assert job.register_order_repeats(off) is False and off.ids == []
    monkeypatch.setattr(product_orders, "product_orders_enabled", lambda: True)
    on = _Scheduler()
    assert job.register_order_repeats(on) is True and on.ids == [job.JOB_ID]


def test_deleting_her_account_deletes_her_repeats(client, db, flag_on, sent):
    from app.services.product_order_privacy import release_buyer_orders

    shop = Shop(db)
    _order(client, shop, sent)
    buyer = make_user(db, email="buyer3933@example.com")
    db.query(ProductOrderRepeat).update({"user_id": buyer.id})
    db.query(ProductOrder).update({"user_id": buyer.id})
    db.commit()
    release_buyer_orders(db, buyer.id)
    db.commit()
    assert _repeats(db, shop) == []
    assert _orders(db, shop)[0].repeat_id is None  # SET NULL, the order stays


def test_a_logged_in_buyer_is_told_of_a_skipped_week(client, db, flag_on, sent):
    shop = Shop(db)
    _order(client, shop, sent)
    _Buyer.user.email = "buyer3933b@example.com"
    db.query(ProducerOrderSettings).update({"enabled": False})
    db.commit()
    _to_due(_repeats(db, shop)[0])
    rep.run_due(db, now=_Clock.now)
    [mail] = _mails(db, "order_repeat_skipped_buyer")
    assert mail.to_email == "buyer3933b@example.com"
    assert f"/he/{shop.producer.slug or shop.producer.id}" in mail.body


# --- review round 1 ------------------------------------------------------------------


def test_a_guest_cannot_start_one(client, db, flag_on, sent):
    shop = Shop(db)
    res = _order(client, shop, sent, guest=True)
    assert res.status_code == 409
    assert res.json()["detail"] == rep.LOGIN_DETAIL
    assert _orders(db, shop) == [] and _repeats(db, shop) == []
    # The same order without «כל שבוע» goes through for a guest.
    assert _order(client, shop, sent, repeat=False, guest=True).status_code == 201


def test_an_order_with_alcohol_cannot_repeat(client, db, flag_on, sent):
    shop = Shop(db)
    db.query(ProducerOrderSettings).update({"alcohol_licensed": True})
    shop.bread.contains_alcohol = True
    db.commit()
    res = _order(client, shop, sent, age_declared=True)
    if res.status_code == 409 and res.json()["detail"] != rep.ALCOHOL_DETAIL:
        pytest.fail(f"refused for another reason: {res.json()['detail']}")
    assert res.status_code == 409
    assert res.json()["detail"] == rep.ALCOHOL_DETAIL
    assert _repeats(db, shop) == []


def test_two_repeats_due_on_one_phone_are_both_made(client, db, flag_on, sent):
    shop = Shop(db)
    assert _order(client, shop, sent, nth=2).status_code == 201
    assert _order(client, shop, sent, nth=3).status_code == 201
    # A third open one-off order: the phone is at its open-order limit.
    assert _order(client, shop, sent, repeat=False, nth=4).status_code == 201
    repeats = sorted(_repeats(db, shop), key=lambda r: r.last_slot_start)
    _Clock.now = repeats[-1].last_slot_start + timedelta(minutes=1)
    counters = rep.run_due(db, now=_Clock.now)
    assert (counters.made, counters.skipped) == (2, 0)
    assert len(_orders(db, shop)) == 5


def _decline_last(db, shop):
    [repeat] = _repeats(db, shop)
    last = (
        db.query(ProductOrder)
        .filter_by(repeat_id=repeat.id, slot_start=repeat.last_slot_start)
        .one()
    )
    last.status = "declined"
    db.commit()
    return repeat


def test_a_declined_week_counts_as_skipped(client, db, flag_on, sent):
    shop = Shop(db)
    _order(client, shop, sent)
    _to_due(_decline_last(db, shop))
    assert rep.run_due(db, now=_Clock.now).made == 1  # this week is still made
    [repeat] = _repeats(db, shop)
    assert (repeat.skipped_in_row, repeat.state) == (1, "active")


def test_the_third_declined_week_stops_it_before_a_fourth_order(client, db, flag_on, sent):
    shop = Shop(db)
    _order(client, shop, sent)
    for _ in range(rep.SKIP_LIMIT - 1):
        _to_due(_decline_last(db, shop))
        rep.run_due(db, now=_Clock.now)
    orders_before = len(_orders(db, shop))
    _to_due(_decline_last(db, shop))
    assert rep.run_due(db, now=_Clock.now).stopped == 1
    [repeat] = _repeats(db, shop)
    assert (repeat.state, repeat.stopped_by) == ("stopped", "system")
    assert len(_orders(db, shop)) == orders_before  # no fourth order
    assert len(_mails(db, "order_repeat_stopped_buyer")) == 1


def test_weeks_missed_while_the_job_was_off_are_passed_over(client, db, flag_on, sent):
    shop = Shop(db)
    _order(client, shop, sent)
    [repeat] = _repeats(db, shop)
    first = repeat.last_slot_start
    # Three weeks later, a minute after that week's slot began.
    missed = first
    for _ in range(3):
        missed = rep.next_slot_start(missed)
    _Clock.now = missed + timedelta(minutes=1)
    counters = rep.run_due(db, now=_Clock.now)
    assert (counters.made, counters.skipped, counters.stopped) == (1, 0, 0)
    [repeat] = _repeats(db, shop)
    assert repeat.skipped_in_row == 0
    assert repeat.last_slot_start == rep.next_slot_start(missed)
    assert _mails(db, "order_repeat_skipped_business") == []
    assert _orders(db, shop)[-1].slot_start == rep.next_slot_start(missed)
