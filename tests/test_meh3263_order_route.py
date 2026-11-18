"""MEH-3263 — on-site ordering, stage 2b: the order itself.

A buyer proves her phone with a code, sends an order, follows it with a token
and may cancel it or accept a change; the business confirms, declines,
proposes a change, marks ready, hands over, reports a no-show or cancels.

Everything is dark while PRODUCT_ORDERS_ENABLED is off.

The clock is the real one: the test business hands orders over every day of
the week, so "a slot the business offers now" always exists, at any hour and
on either clock-change night. Where a rule depends on WHEN (the cancel
cutoff, a no-show, the 90-day window, the 30-day view) the test moves the
order's own timestamps instead of the clock.
"""

import ast
import re
import uuid
from datetime import time, timedelta
from pathlib import Path

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.models import DeliveryArea, Product, User
from app.models.product_orders import (
    PRODUCT_ORDER_CODE_STATUSES,
    ProducerOrderSettings,
    ProducerOrderWindow,
    ProductOrder,
    ProductOrderEvent,
    ProductOrderPhoneCode,
)
from app.rate_limit import limiter
from app.routers import product_order_business as business_module
from app.routers import product_order_buyer as buyer_module
from app.routers import product_orders as orders_module
from app.services import product_order_actions as actions
from app.services import product_order_create as create_module
from app.services import product_order_delivery as delivery
from app.services import product_order_phone as phone_codes
from app.services.product_order_views import BUYER_VIEW_AFTER_CLOSE, mask_phone
from app.utils.clock import utc_now
from tests.conftest import auth_header, make_producer, make_user

REPO = Path(__file__).resolve().parents[1]
APP = REPO / "backend" / "app"
REVISION = (
    REPO
    / "backend"
    / "alembic"
    / "versions"
    / "20261114_2330_f7c1a5e9b3d2_meh3263_order_route.py"
)

PHONE = "050-123-4567"
PHONE_STORED = "972501234567"
OTHER_PHONE = "0529876543"


@pytest.fixture
def flag_on(monkeypatch):
    monkeypatch.setattr(orders_module, "product_orders_enabled", lambda: True)


@pytest.fixture
def sent(monkeypatch):
    """WhatsApp "configured", and every code that would be sent, captured."""
    codes: list[tuple[str, str]] = []
    monkeypatch.setattr(buyer_module.whatsapp, "is_configured", lambda: True)
    monkeypatch.setattr(
        buyer_module,
        "_send_whatsapp_otp",
        lambda phone, code, test_cause=False: codes.append((phone, code)) or True,
    )
    return codes


class Shop:
    def __init__(self, db, **settings):
        self.producer = make_producer(db, name=f"מאפייה {uuid.uuid4().hex[:6]}")
        self.owner = make_user(
            db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com"
        )
        self.owner.producer_id = self.producer.id
        self.owner.is_producer = True
        fields = {"enabled": True, "lead_time_hours": 0, "cancel_cutoff_hours": 2}
        fields.update(settings)
        db.add(ProducerOrderSettings(producer_id=self.producer.id, **fields))
        self.bread = Product(
            producer_id=self.producer.id, name="חלה", price_min=28, price_max=28
        )
        self.cheese = Product(
            producer_id=self.producer.id,
            name="גבינה",
            price_min=110,
            price_max=130,
            price_unit="kg",
        )
        self.wine = Product(
            producer_id=self.producer.id,
            name="יין",
            price_min=90,
            contains_alcohol=True,
        )
        db.add_all([self.bread, self.cheese, self.wine])
        for weekday in range(7):
            for fulfilment in ("pickup", "delivery"):
                db.add(
                    ProducerOrderWindow(
                        producer_id=self.producer.id,
                        weekday=weekday,
                        start_time=time(8),
                        end_time=time(20),
                        fulfilment=fulfilment,
                    )
                )
        db.commit()
        self.id = str(self.producer.id)
        self.headers = auth_header(self.owner)


def slot_of(client, shop, fulfilment="pickup", nth=1, alcohol_ok=None) -> str:
    # nth=1, not 0: the first slot can start at the next full hour, and a
    # test that reads the menu at xx:59:59 would post after it began.
    menu = client.get(f"/producers/{shop.id}/order-menu").json()
    slots = [
        s
        for s in menu["slots"]
        if s["fulfilment"] == fulfilment
        and (alcohol_ok is None or s["alcohol_ok"] is alcohol_ok)
    ]
    return slots[nth]["start"]


def code_for(client, shop, sent, phone=PHONE) -> str:
    res = client.post(
        "/product-orders/phone-code", json={"producer_id": shop.id, "phone": phone}
    )
    assert res.status_code == 200, res.text
    return sent[-1][1]


def valid_order_payload(shop, slot_start, code, **over) -> dict:
    body = {
        "producer_id": shop.id,
        "items": [{"product_id": str(shop.bread.id), "qty": 2}],
        "fulfilment": "pickup",
        "slot_start": slot_start,
        "customer_name": "דנה לוי",
        "phone": PHONE,
        "code": code,
        "idempotency_key": str(uuid.uuid4()),
    }
    body.update(over)
    return body


def send(client, shop, sent, headers=None, **over):
    """One whole order: a fresh code, then the request."""
    phone = over.get("phone", PHONE)
    slot = over.pop("slot_start", None) or slot_of(
        client, shop, over.get("fulfilment", "pickup")
    )
    body = valid_order_payload(shop, slot, code_for(client, shop, sent, phone), **over)
    return client.post("/product-orders", json=body, headers=headers or {})


def stored_order(db, shop, status="pending", **over) -> ProductOrder:
    now = utc_now()
    fields = {
        "producer_id": shop.producer.id,
        "customer_name": "דנה לוי",
        "customer_phone": PHONE_STORED,
        "fulfilment": "pickup",
        "slot_start": now + timedelta(days=1),
        "slot_end": now + timedelta(days=1, hours=1),
        "estimated_total_agorot": 5600,
        "status": status,
    }
    fields.update(over)
    order = ProductOrder(**fields)
    db.add(order)
    db.commit()
    return order


# --- dark while the flag is off ----------------------------------------------


def test_every_route_is_404_while_the_flag_is_off(client, db):
    shop = Shop(db)
    order = stored_order(db, shop)
    ref = {"token": "t" * 43}
    act = f"/producers/me/product-orders/{order.id}"
    answers = [
        client.post(
            "/product-orders/phone-code", json={"producer_id": shop.id, "phone": PHONE}
        ),
        client.post(
            "/product-orders",
            json=valid_order_payload(shop, "2026-11-20T10:00:00Z", "123456"),
        ),
        client.post("/product-orders/status", json=ref),
        client.post("/product-orders/status/cancel", json=ref),
        client.post("/product-orders/status/accept-change", json=ref),
        client.get("/users/me/product-orders", headers=shop.headers),
        client.get("/producers/me/product-orders", headers=shop.headers),
        client.post(f"{act}/confirm", json={}, headers=shop.headers),
        client.post(f"{act}/decline", json={}, headers=shop.headers),
        client.post(f"{act}/ready", json={}, headers=shop.headers),
        client.post(f"{act}/cancel", json={}, headers=shop.headers),
        client.post(f"{act}/handed", json={}, headers=shop.headers),
        client.post(f"{act}/no-show", headers=shop.headers),
        client.post(
            f"{act}/propose-change",
            json={"total_agorot": 100, "note": "חסר במלאי"},
            headers=shop.headers,
        ),
    ]
    assert [a.status_code for a in answers] == [404] * len(answers)
    # Counted off the routers, so a route added without a line here fails.
    assert len(answers) == len(buyer_module.router.routes) + len(
        business_module.router.routes
    )
    db.expire_all()
    assert db.query(ProductOrderPhoneCode).count() == 0
    assert db.query(ProductOrder).one().status == "pending"


# --- the revision mirrors the model ------------------------------------------


def test_the_pickup_code_index_covers_exactly_the_statuses_that_carry_a_code():
    predicate = "status IN ({})".format(
        ", ".join(f"'{s}'" for s in PRODUCT_ORDER_CODE_STATUSES)
    )
    assert PRODUCT_ORDER_CODE_STATUSES == ("confirmed", "ready")
    assert predicate in REVISION.read_text(encoding="utf-8")
    index = next(
        i
        for i in ProductOrder.__table__.indexes
        if i.name == "uq_product_orders_open_pickup_code"
    )
    assert str(index.dialect_options["postgresql"]["where"]) == predicate
    assert index.unique


# --- the phone code -----------------------------------------------------------


def test_a_code_is_sent_and_only_its_keyed_hash_is_stored(client, db, flag_on, sent):
    shop = Shop(db)
    code = code_for(client, shop, sent)
    assert sent == [(f"+{PHONE_STORED}", code)]
    assert len(code) == 6 and code.isdigit()
    row = db.query(ProductOrderPhoneCode).one()
    assert row.phone == PHONE_STORED
    assert len(row.code_hash) == 64 and code not in row.code_hash
    # Keyed and bound to the phone: a bare sha256 of the code is not it.
    import hashlib

    assert row.code_hash != hashlib.sha256(code.encode()).hexdigest()
    assert row.code_hash != phone_codes._code_hash(OTHER_PHONE, code)


@pytest.mark.parametrize("case", ["off", "unknown", "test_row", "not_approved"])
def test_no_code_goes_out_for_a_business_that_does_not_take_orders(
    client, db, flag_on, sent, case
):
    shop = Shop(db)
    target = shop.id
    if case == "off":
        db.query(ProducerOrderSettings).update({"enabled": False})
    elif case == "unknown":
        target = str(uuid.uuid4())
    elif case == "test_row":
        shop.producer.is_test = True
    else:
        shop.producer.status = "pending"
    db.commit()
    res = client.post(
        "/product-orders/phone-code", json={"producer_id": target, "phone": PHONE}
    )
    assert res.status_code == 404
    assert sent == [] and db.query(ProductOrderPhoneCode).count() == 0


def test_a_number_that_is_not_an_israeli_mobile_is_refused(client, db, flag_on, sent):
    shop = Shop(db)
    res = client.post(
        "/product-orders/phone-code",
        json={"producer_id": shop.id, "phone": "04-8123456"},
    )
    assert res.status_code == 422
    assert phone_codes.PHONE_INVALID_DETAIL in res.text
    assert sent == []


def test_without_whatsapp_there_is_no_code_and_so_no_order(client, db, flag_on):
    shop = Shop(db)  # the `sent` fixture is absent: WhatsApp is not configured
    res = client.post(
        "/product-orders/phone-code", json={"producer_id": shop.id, "phone": PHONE}
    )
    assert res.status_code == 503
    assert db.query(ProductOrderPhoneCode).count() == 0


def test_the_fourth_code_to_one_phone_within_an_hour_is_refused(
    client, db, flag_on, sent
):
    shop = Shop(db)
    body = {"producer_id": shop.id, "phone": PHONE}
    answers = [client.post("/product-orders/phone-code", json=body) for _ in range(4)]
    assert [a.status_code for a in answers] == [200, 200, 200, 429]
    assert len(sent) == 3
    # Another phone is not affected, and an hour later the first one is free.
    other = {"producer_id": shop.id, "phone": OTHER_PHONE}
    assert client.post("/product-orders/phone-code", json=other).status_code == 200
    db.query(ProductOrderPhoneCode).filter_by(phone=PHONE_STORED).update(
        {"created_at": utc_now() - timedelta(minutes=61)}
    )
    db.commit()
    # The per-IP limit (5/hour) is a separate fence; this test is about the
    # per-phone one, so the test client's own address gets a fresh hour too.
    limiter._storage.reset()
    assert client.post("/product-orders/phone-code", json=body).status_code == 200


def test_the_site_wide_ceiling_closes_the_feature_instead_of_sending(
    client, db, flag_on, sent, monkeypatch
):
    monkeypatch.setattr(phone_codes, "CODES_PER_DAY_SITE_WIDE", 2)
    shop = Shop(db)
    phones = ["0501111111", "0502222222", "0503333333"]
    answers = [
        client.post(
            "/product-orders/phone-code", json={"producer_id": shop.id, "phone": p}
        )
        for p in phones
    ]
    assert [a.status_code for a in answers] == [200, 200, 503]
    assert len(sent) == 2


# --- sending an order ---------------------------------------------------------


def test_a_guest_sends_an_order_priced_by_the_server(client, db, flag_on, sent):
    shop = Shop(db)
    res = send(client, shop, sent, note="  בלי   שומשום ")
    assert res.status_code == 201, res.text
    body = res.json()
    assert res.headers["cache-control"] == "no-store"
    assert body["status"] == "pending"
    assert body["estimated_total_agorot"] == 5600  # 2 × 28.00 ₪, from the DB
    assert body["delivery_fee_agorot"] == 0
    assert body["note"] == "בלי שומשום"
    assert body["pickup_code"] is None
    assert body["phone_masked"].endswith("67") and "50123" not in body["phone_masked"]
    assert "delivery_address" not in body and "customer_phone" not in body

    order = db.query(ProductOrder).one()
    assert (order.customer_phone, order.user_id) == (PHONE_STORED, None)
    assert order.status_token_hash == create_module.token_hash(body["status_token"])
    assert body["status_token"] not in (order.status_token_hash, order.idempotency_key)
    assert order.expires_at is not None
    assert [(i.name, i.qty, i.unit_price_agorot) for i in order.items] == [
        ("חלה", 2, 2800)
    ]
    events = db.query(ProductOrderEvent).filter_by(order_id=order.id).all()
    assert [(e.from_status, e.to_status, e.actor) for e in events] == [
        (None, "pending", "customer")
    ]
    assert db.query(ProductOrderPhoneCode).one().used_at is not None


@pytest.mark.parametrize("extra", ["unit_price_agorot", "estimated_total_agorot"])
def test_the_request_cannot_carry_a_price(client, db, flag_on, sent, extra):
    shop = Shop(db)
    body = valid_order_payload(
        shop, slot_of(client, shop), code_for(client, shop, sent)
    )
    body[extra] = 1
    assert client.post("/product-orders", json=body).status_code == 422
    assert db.query(ProductOrder).count() == 0


def test_a_price_range_is_stored_at_its_high_end_as_an_estimate(
    client, db, flag_on, sent
):
    shop = Shop(db)
    res = send(
        client, shop, sent, items=[{"product_id": str(shop.cheese.id), "qty": 1}]
    )
    assert res.status_code == 201
    line = res.json()["items"][0]
    assert (line["unit_price_agorot"], line["price_is_estimate"]) == (13000, True)


def test_a_wrong_code_is_counted_even_though_the_request_fails(
    client, db, flag_on, sent
):
    shop = Shop(db)
    code = code_for(client, shop, sent)
    wrong = "000000" if code != "000000" else "111111"
    slot = slot_of(client, shop)
    for tries in range(1, phone_codes.MAX_WRONG_TRIES + 1):
        res = client.post(
            "/product-orders", json=valid_order_payload(shop, slot, wrong)
        )
        assert res.status_code == 422
        db.expire_all()
        assert db.query(ProductOrderPhoneCode).one().attempts == tries
    # Five wrong tries burn the code: the right one no longer works.
    res = client.post("/product-orders", json=valid_order_payload(shop, slot, code))
    assert res.status_code == 422
    assert phone_codes.CODE_WRONG_DETAIL in res.text
    assert db.query(ProductOrder).count() == 0


def test_a_code_works_once_and_only_for_its_own_phone(client, db, flag_on, sent):
    shop = Shop(db)
    code = code_for(client, shop, sent)
    slot = slot_of(client, shop)
    other = valid_order_payload(shop, slot, code, phone=OTHER_PHONE)
    assert client.post("/product-orders", json=other).status_code == 422
    first = client.post("/product-orders", json=valid_order_payload(shop, slot, code))
    again = client.post("/product-orders", json=valid_order_payload(shop, slot, code))
    assert (first.status_code, again.status_code) == (201, 422)
    assert db.query(ProductOrder).count() == 1


def test_an_expired_code_is_refused(client, db, flag_on, sent):
    shop = Shop(db)
    code = code_for(client, shop, sent)
    db.query(ProductOrderPhoneCode).update(
        {"expires_at": utc_now() - timedelta(seconds=1)}
    )
    db.commit()
    res = client.post(
        "/product-orders", json=valid_order_payload(shop, slot_of(client, shop), code)
    )
    assert res.status_code == 422
    assert db.query(ProductOrder).count() == 0


def test_the_same_request_twice_is_one_order_with_one_token(client, db, flag_on, sent):
    shop = Shop(db)
    body = valid_order_payload(
        shop, slot_of(client, shop), code_for(client, shop, sent)
    )
    first = client.post("/product-orders", json=body)
    again = client.post("/product-orders", json=body)  # the code is used by now
    assert (first.status_code, again.status_code) == (201, 201)
    assert first.json()["id"] == again.json()["id"]
    assert first.json()["status_token"] == again.json()["status_token"]
    assert db.query(ProductOrder).count() == 1


@pytest.mark.parametrize("case", ["other_phone", "stale"])
def test_an_idempotency_key_is_not_a_way_into_someone_elses_order(
    client, db, flag_on, sent, case
):
    shop = Shop(db)
    body = valid_order_payload(
        shop, slot_of(client, shop), code_for(client, shop, sent)
    )
    assert client.post("/product-orders", json=body).status_code == 201
    if case == "other_phone":
        body["phone"] = OTHER_PHONE
    else:
        db.query(ProductOrder).update(
            {
                "created_at": utc_now()
                - create_module.REPLAY_WINDOW
                - timedelta(seconds=5)
            }
        )
        db.commit()
    res = client.post("/product-orders", json=body)
    assert res.status_code == 409
    assert "status_token" not in res.text


def test_a_logged_in_buyer_also_proves_her_phone_and_owns_the_order(
    client, db, flag_on, sent
):
    shop = Shop(db)
    buyer = make_user(db, email="buyer@example.com")
    no_code = valid_order_payload(shop, slot_of(client, shop), "123456")
    refused = client.post("/product-orders", json=no_code, headers=auth_header(buyer))
    assert refused.status_code == 422
    res = send(client, shop, sent, headers=auth_header(buyer))
    assert res.status_code == 201
    assert db.query(ProductOrder).one().user_id == buyer.id
    mine = client.get("/users/me/product-orders", headers=auth_header(buyer))
    assert [o["id"] for o in mine.json()["orders"]] == [res.json()["id"]]
    stranger = make_user(db, email="stranger@example.com")
    theirs = client.get("/users/me/product-orders", headers=auth_header(stranger))
    assert theirs.json()["orders"] == []
    assert client.get("/users/me/product-orders").status_code == 401


# --- the limits on a phone and on a business ---------------------------------


def test_the_fourth_open_order_from_one_phone_is_refused(client, db, flag_on, sent):
    shop, elsewhere = Shop(db), Shop(db)
    # Across the site, not per business; a closed order does not count.
    stored_order(db, shop, "pending")
    stored_order(db, elsewhere, "confirmed")
    stored_order(db, elsewhere, "handed")
    assert send(client, shop, sent).status_code == 201
    res = send(client, shop, sent)
    assert res.status_code == 409
    assert create_module.TOO_MANY_OPEN_DETAIL in res.text
    assert send(client, shop, sent, phone=OTHER_PHONE).status_code == 201


def test_two_recent_no_shows_close_ordering_to_that_phone(client, db, flag_on, sent):
    shop = Shop(db)
    recent = utc_now() - timedelta(days=10)
    long_ago = utc_now() - create_module.NO_SHOW_WINDOW - timedelta(days=1)
    stored_order(db, shop, "no_show", closed_at=recent)
    old = stored_order(db, shop, "no_show", closed_at=long_ago)
    assert send(client, shop, sent).status_code == 201  # one recent, one old
    old.closed_at = recent
    db.commit()
    res = send(client, shop, sent)
    assert res.status_code == 403
    assert create_module.PHONE_BLOCKED_DETAIL in res.text


def test_a_business_with_too_many_open_orders_takes_no_more(
    client, db, flag_on, sent, monkeypatch
):
    monkeypatch.setattr(create_module, "MAX_OPEN_ORDERS_PER_BUSINESS", 1)
    shop = Shop(db)
    stored_order(db, shop, "ready", customer_phone="972500000000")
    res = send(client, shop, sent)
    assert res.status_code == 409
    assert create_module.BUSINESS_FULL_DETAIL in res.text


# --- what can be ordered, and when -------------------------------------------


def test_a_slot_the_business_does_not_offer_is_refused(client, db, flag_on, sent):
    shop = Shop(db)
    offered = slot_of(client, shop)
    off_grid = offered.replace(":00:00", ":20:00")
    assert off_grid != offered
    res = send(client, shop, sent, slot_start=off_grid)
    assert res.status_code == 409
    assert create_module.SLOT_GONE_DETAIL in res.text
    # A pickup slot is not a delivery slot. The business does deliver to the
    # city, so only the slot can be what refuses; then drop the delivery windows.
    shop.producer.offers_delivery = True
    shop.producer.delivery_cities = ["חיפה"]
    shop.producer.delivery_fee = 30
    db.query(ProducerOrderWindow).filter_by(fulfilment="delivery").delete()
    db.commit()
    res = send(
        client,
        shop,
        sent,
        slot_start=offered,
        fulfilment="delivery",
        delivery_city="חיפה",
        delivery_address="הרצל 1",
    )
    assert res.status_code == 409
    assert create_module.SLOT_GONE_DETAIL in res.text


@pytest.mark.parametrize("case", ["not_orderable", "out_of_stock", "other_business"])
def test_a_product_that_cannot_be_ordered_fails_the_whole_order(
    client, db, flag_on, sent, case
):
    shop, other = Shop(db), Shop(db)
    product = shop.bread
    if case == "not_orderable":
        product.is_orderable = False
    elif case == "out_of_stock":
        product.in_stock = False
    else:
        product = other.bread
    db.commit()
    res = send(client, shop, sent, items=[{"product_id": str(product.id), "qty": 1}])
    assert res.status_code == 409
    assert create_module.PRODUCT_GONE_DETAIL in res.text
    assert db.query(ProductOrder).count() == 0


def test_an_order_below_the_business_minimum_is_refused(client, db, flag_on, sent):
    shop = Shop(db, min_order_agorot=5601)
    assert send(client, shop, sent).status_code == 409  # 56.00 ₪
    db.query(ProducerOrderSettings).update({"min_order_agorot": 5600})
    db.commit()
    assert send(client, shop, sent).status_code == 201


def test_alcohol_needs_a_licensed_business_a_declaration_and_a_day_slot(
    client, db, flag_on, sent
):
    shop = Shop(db)
    wine = [{"product_id": str(shop.wine.id), "qty": 1}]
    unlicensed = send(client, shop, sent, items=wine, age_declared=True)
    assert unlicensed.status_code == 409
    assert create_module.PRODUCT_GONE_DETAIL in unlicensed.text

    db.query(ProducerOrderSettings).update({"alcohol_licensed": True})
    db.add(
        ProducerOrderWindow(
            producer_id=shop.producer.id,
            weekday=(utc_now().weekday() + 3) % 7,
            start_time=time(5),
            end_time=time(7),
            fulfilment="pickup",
        )
    )
    db.commit()
    undeclared = send(client, shop, sent, items=wine)
    assert undeclared.status_code == 422
    assert create_module.AGE_DETAIL in undeclared.text
    night = slot_of(client, shop, alcohol_ok=False)
    at_night = send(client, shop, sent, items=wine, age_declared=True, slot_start=night)
    assert at_night.status_code == 409
    assert create_module.ALCOHOL_SLOT_DETAIL in at_night.text

    shop2 = Shop(db, alcohol_licensed=True)
    wine2 = [{"product_id": str(shop2.wine.id), "qty": 1}]
    ok = send(client, shop2, sent, items=wine2, age_declared=True, phone=OTHER_PHONE)
    assert ok.status_code == 201
    assert db.query(ProductOrder).one().age_declared is True


# --- delivery -----------------------------------------------------------------

FACTS = delivery.DeliveryFacts(
    offers_delivery=True,
    nationwide=False,
    cities=frozenset({"חיפה", "עכו"}),
    excluded_cities=frozenset(),
    fee=30,
    free_above=200,
)


def _facts(**over):
    return delivery.DeliveryFacts(**{**FACTS.__dict__, **over})


@pytest.mark.parametrize(
    ("facts", "city", "subtotal", "expected"),
    [
        (FACTS, "חיפה", 5000, 3000),  # the business's fee, shekels -> agorot
        (FACTS, "חיפה", 20000, 0),  # at the free-delivery threshold
        (FACTS, "חיפה", 19999, 3000),  # one agora under it
        (_facts(has_area=True, area_fee=15), "נשר", 5000, 1500),  # the city's own
        (_facts(has_area=True, area_fee=0), "נשר", 5000, 0),  # 0 is "free", not "unset"
        (_facts(has_area=True), "נשר", 5000, 3000),  # area without a fee inherits
        (_facts(nationwide=True, cities=frozenset()), "אילת", 5000, 3000),
        (_facts(fee=0), "עכו", 100, 0),
    ],
)
def test_the_delivery_fee(facts, city, subtotal, expected):
    assert delivery.quote(facts, city, subtotal) == expected


@pytest.mark.parametrize(
    ("facts", "city", "subtotal", "detail"),
    [
        (_facts(offers_delivery=False), "חיפה", 5000, delivery.NO_DELIVERY_DETAIL),
        (FACTS, "אילת", 5000, delivery.CITY_NOT_SERVED_DETAIL),
        (
            _facts(nationwide=True, excluded_cities=frozenset({"אילת"})),
            "אילת",
            5000,
            delivery.CITY_NOT_SERVED_DETAIL,
        ),
        (_facts(fee=None), "חיפה", 5000, delivery.FEE_NOT_PUBLISHED_DETAIL),
        # Even above the free threshold: a fee nobody published is not "free".
        (_facts(fee=None), "חיפה", 50000, delivery.FEE_NOT_PUBLISHED_DETAIL),
        (
            _facts(has_area=True, area_min_order=100),
            "נשר",
            9999,
            delivery.AREA_MINIMUM_DETAIL,
        ),
    ],
)
def test_a_delivery_the_business_does_not_make_is_refused(
    facts, city, subtotal, detail
):
    with pytest.raises(delivery.DeliveryRefused) as refused:
        delivery.quote(facts, city, subtotal)
    assert refused.value.detail == detail


def test_a_delivery_order_stores_the_city_the_fee_and_the_address(
    client, db, flag_on, sent
):
    shop = Shop(db)
    shop.producer.offers_delivery = True
    shop.producer.delivery_cities = ["חיפה"]
    shop.producer.delivery_fee = 30
    db.add(DeliveryArea(producer_id=shop.producer.id, city="עכו", delivery_fee=12))
    db.commit()
    going = {"fulfilment": "delivery", "delivery_address": "הרצל 1, דירה 4"}

    missing = send(client, shop, sent, fulfilment="delivery", delivery_city="חיפה")
    assert missing.status_code == 422
    unserved = send(client, shop, sent, delivery_city="אילת", **going)
    assert unserved.status_code == 409
    assert delivery.CITY_NOT_SERVED_DETAIL in unserved.text

    res = send(client, shop, sent, delivery_city=" עכו ", **going)
    assert res.status_code == 201, res.text
    body = res.json()
    assert (body["delivery_city"], body["delivery_fee_agorot"]) == ("עכו", 1200)
    assert body["estimated_total_agorot"] == 5600  # goods only; the fee is apart
    assert "הרצל" not in res.text  # the buyer's page never shows the street
    order = db.query(ProductOrder).one()
    assert order.delivery_address == "הרצל 1, דירה 4"


# --- automatic confirmation ---------------------------------------------------


def test_auto_confirm_fills_a_slot_up_to_the_cap_and_no_further(
    client, db, flag_on, sent
):
    shop = Shop(db, auto_confirm=True, auto_confirm_slot_cap=1)
    slot = slot_of(client, shop)
    first = send(client, shop, sent, slot_start=slot).json()
    second = send(client, shop, sent, slot_start=slot, phone=OTHER_PHONE).json()
    assert (first["status"], second["status"]) == ("confirmed", "pending")
    assert len(first["pickup_code"]) == 4 and first["final_total_agorot"] == 5600
    assert second["pickup_code"] is None
    events = (
        db.query(ProductOrderEvent)
        .filter_by(order_id=uuid.UUID(first["id"]))
        .order_by(ProductOrderEvent.created_at)
        .all()
    )
    assert [(e.to_status, e.actor) for e in events] == [
        ("pending", "customer"),
        ("confirmed", "system"),
    ]


def test_an_estimated_price_is_never_confirmed_automatically(client, db, flag_on, sent):
    shop = Shop(db, auto_confirm=True, auto_confirm_slot_cap=5)
    res = send(
        client, shop, sent, items=[{"product_id": str(shop.cheese.id), "qty": 1}]
    )
    assert res.json()["status"] == "pending"


# --- the buyer follows her order ----------------------------------------------


def test_the_token_opens_the_order_and_nothing_else_does(client, db, flag_on, sent):
    shop = Shop(db)
    token = send(client, shop, sent).json()["status_token"]
    res = client.post("/product-orders/status", json={"token": token})
    assert res.status_code == 200
    assert res.headers["cache-control"] == "no-store"
    assert res.json()["producer_name"] == shop.producer.name
    assert "status_token" not in res.json()
    wrong = client.post("/product-orders/status", json={"token": token[:-1] + "x"})
    assert wrong.status_code == 404
    order_id = str(db.query(ProductOrder).one().id)
    # An id alone is not a credential — not anonymously, not for another account.
    assert (
        client.post("/product-orders/status", json={"order_id": order_id}).status_code
        == 404
    )
    stranger = make_user(db, email="stranger@example.com")
    by_id = client.post(
        "/product-orders/status",
        json={"order_id": order_id},
        headers=auth_header(stranger),
    )
    assert by_id.status_code == 404


def test_the_pickup_code_shows_only_while_it_can_be_used(client, db, flag_on):
    shop = Shop(db)
    token = "k" * 43
    order = stored_order(
        db, shop, "pending", status_token_hash=create_module.token_hash(token)
    )
    order.pickup_code = "4821"

    def shown(status):
        db.query(ProductOrder).update({"status": status})
        db.commit()
        res = client.post("/product-orders/status", json={"token": token})
        return res.json()["pickup_code"]

    assert [shown(s) for s in ("pending", "confirmed", "ready", "handed")] == [
        None,
        "4821",
        "4821",
        None,
    ]


def test_the_page_stops_answering_a_month_after_the_order_closed(client, db, flag_on):
    shop = Shop(db)
    token = "k" * 43
    order = stored_order(
        db,
        shop,
        "handed",
        status_token_hash=create_module.token_hash(token),
        closed_at=utc_now() - BUYER_VIEW_AFTER_CLOSE + timedelta(minutes=5),
    )
    assert (
        client.post("/product-orders/status", json={"token": token}).status_code == 200
    )
    order.closed_at = utc_now() - BUYER_VIEW_AFTER_CLOSE - timedelta(minutes=5)
    db.commit()
    assert (
        client.post("/product-orders/status", json={"token": token}).status_code == 404
    )


def test_mask_phone_keeps_two_digits():
    assert mask_phone(PHONE_STORED) == "••••••••••67"
    assert mask_phone("") == ""


def test_a_buyer_cancels_freely_before_confirmation_and_until_the_cutoff_after(
    client, db, flag_on, sent
):
    shop = Shop(db)  # cancel_cutoff_hours=2
    token = send(client, shop, sent).json()["status_token"]
    ref = {"token": token}
    order = db.query(ProductOrder).one()

    def set_order(status, hours_to_slot):
        start = utc_now() + timedelta(hours=hours_to_slot)
        db.query(ProductOrder).update(
            {
                "status": status,
                "slot_start": start,
                "slot_end": start + timedelta(hours=1),
            }
        )
        db.commit()

    set_order("confirmed", 1.9)  # inside the cutoff
    assert client.post("/product-orders/status", json=ref).json()["can_cancel"] is False
    late = client.post("/product-orders/status/cancel", json=ref)
    assert late.status_code == 409
    assert actions.CUTOFF_PASSED_DETAIL in late.text

    set_order("ready", 30)  # packed: the buyer cannot cancel at all
    packed = client.post("/product-orders/status/cancel", json=ref)
    assert packed.status_code == 409
    assert actions.CUTOFF_PASSED_DETAIL in packed.text

    set_order("confirmed", 2.1)  # outside the cutoff
    assert client.post("/product-orders/status", json=ref).json()["can_cancel"] is True
    done = client.post("/product-orders/status/cancel", json=ref)
    assert (done.status_code, done.json()["status"]) == (200, "cancelled")
    db.expire_all()
    last = (
        db.query(ProductOrderEvent)
        .filter_by(order_id=order.id)
        .order_by(ProductOrderEvent.created_at.desc())
        .first()
    )
    assert (last.to_status, last.actor) == ("cancelled", "customer")
    again = client.post("/product-orders/status/cancel", json=ref)
    assert again.status_code == 409


def test_a_pending_order_is_cancelled_even_an_hour_before_the_slot(
    client, db, flag_on, sent
):
    shop = Shop(db, cancel_cutoff_hours=48)
    token = send(client, shop, sent).json()["status_token"]
    res = client.post("/product-orders/status/cancel", json={"token": token})
    assert (res.status_code, res.json()["status"]) == (200, "cancelled")


# --- the business acts --------------------------------------------------------


def test_the_business_sees_its_own_orders_and_only_those(client, db, flag_on):
    shop, other = Shop(db), Shop(db)
    mine = stored_order(db, shop, "pending", delivery_address="הרצל 1")
    stored_order(db, shop, "handed")
    stored_order(db, other, "pending")
    res = client.get("/producers/me/product-orders", headers=shop.headers)
    assert res.status_code == 200 and res.json()["total"] == 2
    pending = client.get(
        "/producers/me/product-orders?status=pending", headers=shop.headers
    ).json()
    assert [o["id"] for o in pending["orders"]] == [str(mine.id)]
    seen = pending["orders"][0]
    assert seen["customer_phone"] == PHONE_STORED
    assert seen["delivery_address"] == "הרצל 1"
    assert "pickup_code" not in seen  # the buyer says it; the business types it
    assert client.get("/producers/me/product-orders").status_code == 401
    consumer = make_user(db, email="c@example.com")
    assert (
        client.get(
            "/producers/me/product-orders", headers=auth_header(consumer)
        ).status_code
        == 403
    )


ACTIONS = [
    ("confirm", {}),
    ("decline", {}),
    ("ready", {}),
    ("cancel", {}),
    ("handed", {}),
    ("no-show", None),
    ("propose-change", {"total_agorot": 100, "note": "חסר במלאי"}),
]


@pytest.mark.parametrize(("action", "body"), ACTIONS)
def test_another_businesss_order_is_404_for_every_action(
    client, db, flag_on, action, body
):
    shop, other = Shop(db), Shop(db)
    order = stored_order(db, other, "confirmed")
    url = f"/producers/me/product-orders/{order.id}/{action}"
    kwargs = {} if body is None else {"json": body}
    assert client.post(url, headers=shop.headers, **kwargs).status_code == 404
    assert client.post(url, **kwargs).status_code == 401
    db.expire_all()
    assert db.query(ProductOrder).one().status == "confirmed"
    assert db.query(ProductOrderEvent).count() == 0


def test_confirming_sets_the_final_total_and_a_pickup_code(client, db, flag_on, sent):
    shop = Shop(db)
    created = send(
        client, shop, sent, items=[{"product_id": str(shop.cheese.id), "qty": 1}]
    ).json()
    url = f"/producers/me/product-orders/{created['id']}/confirm"
    # A weighed product: the business must say what it actually came to.
    blind = client.post(url, json={}, headers=shop.headers)
    assert blind.status_code == 422
    assert actions.NEEDS_FINAL_TOTAL_DETAIL in blind.text
    res = client.post(url, json={"final_total_agorot": 11850}, headers=shop.headers)
    assert res.status_code == 200, res.text
    assert (res.json()["status"], res.json()["final_total_agorot"]) == (
        "confirmed",
        11850,
    )
    order = db.query(ProductOrder).one()
    assert order.pickup_code is not None and order.confirmed_at is not None
    seen = client.post(
        "/product-orders/status", json={"token": created["status_token"]}
    ).json()
    assert seen["pickup_code"] == order.pickup_code
    twice = client.post(url, json={"final_total_agorot": 1}, headers=shop.headers)
    assert twice.status_code == 409
    db.expire_all()
    assert db.query(ProductOrder).one().final_total_agorot == 11850


def test_a_fixed_price_order_is_confirmed_at_its_estimate(client, db, flag_on, sent):
    shop = Shop(db)
    created = send(client, shop, sent).json()
    res = client.post(
        f"/producers/me/product-orders/{created['id']}/confirm",
        json={},
        headers=shop.headers,
    )
    assert res.json()["final_total_agorot"] == 5600


def test_a_proposed_change_becomes_the_order_when_the_buyer_accepts(
    client, db, flag_on, sent
):
    shop = Shop(db, lead_time_hours=24)
    created = send(client, shop, sent).json()
    ref = {"token": created["status_token"]}
    url = f"/producers/me/product-orders/{created['id']}/propose-change"
    new_slot = slot_of(client, shop, nth=3)
    assert new_slot != created["slot_start"]

    for bad in ({"note": "חסר במלאי"}, {"total_agorot": 100, "note": "!!"}):
        assert client.post(url, json=bad, headers=shop.headers).status_code == 422
    off_grid = {"slot_start": new_slot.replace(":00:00", ":20:00"), "note": "מועד אחר"}
    refused = client.post(url, json=off_grid, headers=shop.headers)
    assert refused.status_code == 409
    assert actions.PROPOSED_SLOT_DETAIL in refused.text

    res = client.post(
        url,
        json={"slot_start": new_slot, "total_agorot": 5000, "note": "נשארה חלה אחת"},
        headers=shop.headers,
    )
    assert res.status_code == 200, res.text
    seen = client.post("/product-orders/status", json=ref).json()
    assert seen["status"] == "change_proposed"
    assert seen["proposal"] == {
        "slot_start": new_slot,
        "slot_end": seen["proposal"]["slot_end"],
        "total_agorot": 5000,
        "note": "נשארה חלה אחת",
    }
    assert seen["slot_start"] == created["slot_start"]  # not yet

    done = client.post("/product-orders/status/accept-change", json=ref).json()
    assert (done["status"], done["slot_start"], done["final_total_agorot"]) == (
        "confirmed",
        new_slot,
        5000,
    )
    assert done["proposal"] is None and len(done["pickup_code"]) == 4
    order = db.query(ProductOrder).one()
    assert (order.proposed_slot_start, order.proposed_total_agorot) == (None, None)
    assert order.slot_end - order.slot_start == timedelta(hours=1)
    again = client.post("/product-orders/status/accept-change", json=ref)
    assert again.status_code == 409


def test_a_change_of_total_alone_keeps_the_slot(client, db, flag_on, sent):
    shop = Shop(db)
    created = send(client, shop, sent).json()
    client.post(
        f"/producers/me/product-orders/{created['id']}/propose-change",
        json={"total_agorot": 6100, "note": "חלה גדולה יותר"},
        headers=shop.headers,
    )
    done = client.post(
        "/product-orders/status/accept-change", json={"token": created["status_token"]}
    ).json()
    assert (done["slot_start"], done["final_total_agorot"]) == (
        created["slot_start"],
        6100,
    )


def test_ready_then_handed_with_the_buyers_code(client, db, flag_on):
    shop = Shop(db)
    order = stored_order(db, shop, "confirmed", pickup_code="4821")
    base = f"/producers/me/product-orders/{order.id}"
    assert (
        client.post(f"{base}/ready", json={}, headers=shop.headers).status_code == 200
    )
    wrong = client.post(
        f"{base}/handed", json={"pickup_code": "0000"}, headers=shop.headers
    )
    assert wrong.status_code == 409
    assert actions.WRONG_PICKUP_CODE_DETAIL in wrong.text
    db.expire_all()
    assert db.query(ProductOrder).one().status == "ready"
    res = client.post(
        f"{base}/handed", json={"pickup_code": "4821"}, headers=shop.headers
    )
    assert (res.status_code, res.json()["status"]) == (200, "handed")
    db.expire_all()
    order = db.query(ProductOrder).one()
    assert order.handed_at is not None and order.closed_at is not None


def test_a_no_show_can_only_be_reported_after_the_slot(client, db, flag_on):
    shop = Shop(db)
    order = stored_order(db, shop, "confirmed")
    url = f"/producers/me/product-orders/{order.id}/no-show"
    early = client.post(url, headers=shop.headers)
    assert early.status_code == 409
    assert actions.TOO_EARLY_NO_SHOW_DETAIL in early.text
    past = utc_now() - timedelta(hours=3)
    db.query(ProductOrder).update(
        {"slot_start": past, "slot_end": past + timedelta(hours=1)}
    )
    db.commit()
    res = client.post(url, headers=shop.headers)
    assert (res.status_code, res.json()["status"]) == (200, "no_show")


def test_decline_and_cancel_carry_the_business_note_into_the_log(client, db, flag_on):
    shop = Shop(db)
    declined = stored_order(db, shop, "pending")
    cancelled = stored_order(db, shop, "confirmed")
    base = "/producers/me/product-orders"
    a = client.post(
        f"{base}/{declined.id}/decline",
        json={"note": "סגורים השבוע"},
        headers=shop.headers,
    )
    b = client.post(f"{base}/{cancelled.id}/cancel", json={}, headers=shop.headers)
    assert (a.json()["status"], b.json()["status"]) == ("declined", "cancelled")
    notes = {
        (e.to_status, e.actor, e.note, e.actor_user_id)
        for e in db.query(ProductOrderEvent).all()
    }
    assert notes == {
        ("declined", "business", "סגורים השבוע", shop.owner.id),
        ("cancelled", "business", None, shop.owner.id),
    }
    # A buyer's «decline» does not exist: a business cannot decline what it confirmed.
    late = client.post(f"{base}/{cancelled.id}/decline", json={}, headers=shop.headers)
    assert late.status_code == 409


# --- pickup codes -------------------------------------------------------------


def test_a_new_pickup_code_skips_the_ones_still_in_use(db, monkeypatch):
    shop = Shop(db)
    stored_order(db, shop, "confirmed", pickup_code="0007")
    stored_order(db, shop, "ready", pickup_code="0008")
    stored_order(db, shop, "handed", pickup_code="0009")  # closed: free again
    order = stored_order(db, shop, "confirmed")
    draws = iter([7, 8, 9])
    monkeypatch.setattr(actions.secrets, "randbelow", lambda _n: next(draws))
    actions.assign_pickup_code(db, order)
    assert order.pickup_code == "0009"


def test_the_database_refuses_two_live_orders_with_one_code(db):
    shop, other = Shop(db), Shop(db)
    stored_order(db, shop, "confirmed", pickup_code="1234")
    stored_order(db, other, "confirmed", pickup_code="1234")  # another business
    stored_order(db, shop, "handed", pickup_code="1234")  # closed
    with pytest.raises(IntegrityError):
        stored_order(db, shop, "ready", pickup_code="1234")
    db.rollback()


# --- deleting a buyer's account ----------------------------------------------


def test_deleting_an_account_cancels_her_open_orders_and_removes_her_from_all(
    client, db, flag_on
):
    shop = Shop(db)
    buyer = make_user(db, email="buyer@example.com")
    buyer_id, buyer_headers = buyer.id, auth_header(buyer)
    private = {
        "user_id": buyer_id,
        "delivery_address": "הרצל 1",
        "note": "לצלצל פעמיים",
    }
    token = create_module.status_token_for(str(uuid.uuid4()))
    stored_order(
        db,
        shop,
        "ready",
        pickup_code="4821",
        status_token_hash=create_module.token_hash(token),
        **private,
    )
    assert (
        client.post("/product-orders/status", json={"token": token}).status_code == 200
    )
    stored_order(db, shop, "pending", **private)
    stored_order(db, shop, "handed", **private)
    someone_else = stored_order(db, shop, "pending", customer_phone="972500000000")

    res = client.post(
        "/auth/me/delete", json={"password": "Zx7Yp9Mq2Lr4"}, headers=buyer_headers
    )
    assert res.status_code == 200, res.text
    # The link she was given stops opening the order.
    assert (
        client.post("/product-orders/status", json={"token": token}).status_code == 404
    )
    db.expire_all()
    assert db.query(User).filter(User.id == buyer_id).count() == 0
    hers = db.query(ProductOrder).filter(ProductOrder.id != someone_else.id).all()
    assert sorted(o.status for o in hers) == ["cancelled", "cancelled", "handed"]
    for order in hers:
        assert (order.customer_phone, order.delivery_address, order.note) == (
            "",
            None,
            None,
        )
        assert "דנה" not in order.customer_name
        assert (order.user_id, order.pickup_code) == (None, None)
    cancels = db.query(ProductOrderEvent).filter_by(to_status="cancelled").all()
    assert {(e.actor, e.from_status) for e in cancels} == {
        ("system", "ready"),
        ("system", "pending"),
    }
    db.refresh(someone_else)
    assert (someone_else.status, someone_else.customer_name) == ("pending", "דנה לוי")


# --- one writer of an order's status -----------------------------------------


def _status_assignments(path: Path) -> list[int]:
    """Lines where `<something>.status = ...` is assigned, or `status` is set
    through a bulk `.update({...})` / a constructor keyword other than the
    order's birth."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    lines = []
    for node in ast.walk(tree):
        targets = []
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, ast.AugAssign | ast.AnnAssign):
            targets = [node.target]
        # MEH-3296: a tuple target (`row.status, row.x = ...`) slipped past
        # the plain check; its elements are targets too.
        flat = []
        for t in targets:
            flat += t.elts if isinstance(t, ast.Tuple | ast.List) else [t]
        lines += [
            t.lineno
            for t in flat
            if isinstance(t, ast.Attribute) and t.attr == "status"
        ]
        if isinstance(node, ast.Call) and getattr(node.func, "attr", "") == "update":
            for arg in node.args:
                if isinstance(arg, ast.Dict) and any(
                    (isinstance(k, ast.Constant) and k.value == "status")
                    or (isinstance(k, ast.Attribute) and k.attr == "status")
                    for k in arg.keys
                ):
                    lines.append(node.lineno)
        if isinstance(node, ast.Call):
            name = getattr(node.func, "attr", "") or getattr(node.func, "id", "")
            by_keyword = name in ("ProductOrder", "values", "update") and any(
                k.arg == "status" for k in node.keywords
            )
            by_setattr = (
                name == "setattr"
                and len(node.args) > 1
                and isinstance(node.args[1], ast.Constant)
                and node.args[1].value == "status"
            )
            if by_keyword or by_setattr:
                lines.append(node.lineno)
    return lines


# Every app file that names the order model, wherever it lives: a status
# written from an admin router or a scheduler is the same breach. A file that
# starts using ProductOrder joins this list by itself.
ORDER_FILES = sorted(
    p
    for p in APP.rglob("*.py")
    if p.parent.name != "models"
    and (
        p.name.startswith("product_order")
        or re.search(r"\bProductOrder\b", p.read_text(encoding="utf-8"))
    )
)


def test_only_the_state_service_assigns_an_orders_status():
    by_file = {p.name: _status_assignments(p) for p in ORDER_FILES}
    # Control: the probe sees the one real assignment, so its silence
    # elsewhere means "none", not "blind".
    assert by_file.pop("product_order_state.py"), "the probe found no writer at all"
    # The files are a fixed list, not whatever the glob happens to find.
    assert {
        "product_order_actions.py",
        "product_order_create.py",
        "product_order_privacy.py",
        "product_order_buyer.py",
        "product_order_business.py",
    } <= set(by_file)
    assert {name: lines for name, lines in by_file.items() if lines} == {}


def test_the_status_probe_catches_each_way_of_writing_a_status(tmp_path):
    for source in (
        "order.status = 'confirmed'\n",
        "self.order.status: str = 'x'\n",
        "db.query(ProductOrder).update({'status': 'x'})\n",
        "db.query(ProductOrder).update({ProductOrder.status: 'x'})\n",
        "order = ProductOrder(producer_id=1, status='confirmed')\n",
        "setattr(order, 'status', 'confirmed')\n",
        "db.execute(update(ProductOrder).values(status='x'))\n",
        "order.status, order.note = 'x', None\n",
    ):
        probe = tmp_path / "probe.py"
        probe.write_text(source, encoding="utf-8")
        assert _status_assignments(probe) == [1], source
    probe.write_text("if order.status == 'x':\n    pass\n", encoding="utf-8")
    assert _status_assignments(probe) == []


# --- answers to the independent review (MEH-3263) ----------------------------


def test_asking_for_a_code_does_not_say_whether_a_phone_is_blocked(
    client, db, flag_on, sent
):
    shop = Shop(db)
    recent = utc_now() - timedelta(days=1)
    for _ in range(create_module.NO_SHOW_LIMIT):
        stored_order(db, shop, "no_show", closed_at=recent)
    res = client.post(
        "/product-orders/phone-code", json={"producer_id": shop.id, "phone": PHONE}
    )
    assert res.status_code == 200, res.text
    assert len(sent) == 1


def test_an_order_whose_slot_has_passed_cannot_be_confirmed(client, db, flag_on):
    shop = Shop(db)
    past = utc_now() - timedelta(hours=3)
    order = stored_order(
        db, shop, "pending", slot_start=past, slot_end=past + timedelta(hours=1)
    )
    act = f"/producers/me/product-orders/{order.id}"
    late = client.post(f"{act}/confirm", json={}, headers=shop.headers)
    assert late.status_code == 409
    assert actions.SLOT_PASSED_DETAIL in late.text
    # ...and so it can never be turned into a no-show against the buyer.
    assert client.post(f"{act}/no-show", headers=shop.headers).status_code in (403, 409)
    db.expire_all()
    assert db.query(ProductOrder).one().status == "pending"


def test_a_proposal_whose_slot_has_passed_cannot_be_accepted(client, db, flag_on):
    shop = Shop(db)
    past = utc_now() - timedelta(hours=3)
    token = create_module.status_token_for(str(uuid.uuid4()))
    stored_order(
        db,
        shop,
        "change_proposed",
        proposed_slot_start=past,
        proposed_slot_end=past + timedelta(hours=1),
        status_token_hash=create_module.token_hash(token),
    )
    late = client.post("/product-orders/status/accept-change", json={"token": token})
    assert late.status_code == 409
    assert actions.PROPOSAL_PASSED_DETAIL in late.text
    db.expire_all()
    assert db.query(ProductOrder).one().status == "change_proposed"


def test_the_business_cannot_set_a_total_the_buyer_never_saw(client, db, flag_on, sent):
    shop = Shop(db)
    fixed = send(client, shop, sent).json()  # two loaves, 56 ₪, a fixed price
    url = f"/producers/me/product-orders/{fixed['id']}/confirm"
    for total in (0, 5600, 9_900_000):
        res = client.post(url, json={"final_total_agorot": total}, headers=shop.headers)
        assert res.status_code == 422, total
        assert actions.FINAL_TOTAL_FIXED_DETAIL in res.text

    weighed = send(
        client, shop, sent, items=[{"product_id": str(shop.cheese.id), "qty": 1}]
    ).json()  # shown to the buyer at the high end: 130 ₪
    url = f"/producers/me/product-orders/{weighed['id']}/confirm"
    above = client.post(url, json={"final_total_agorot": 13001}, headers=shop.headers)
    assert above.status_code == 422
    assert actions.FINAL_TOTAL_TOO_HIGH_DETAIL in above.text
    at_most = client.post(url, json={"final_total_agorot": 13000}, headers=shop.headers)
    assert at_most.status_code == 200, at_most.text
    db.expire_all()
    assert sorted(o.status for o in db.query(ProductOrder)) == ["confirmed", "pending"]


def test_a_proposal_does_not_stay_on_an_order_that_closed_without_it(
    client, db, flag_on
):
    shop = Shop(db)
    for close in ("business", "buyer"):
        token = create_module.status_token_for(str(uuid.uuid4()))
        order = stored_order(
            db,
            shop,
            "change_proposed",
            proposed_total_agorot=6100,
            proposal_note="חלה גדולה יותר",
            status_token_hash=create_module.token_hash(token),
        )
        if close == "business":
            res = client.post(
                f"/producers/me/product-orders/{order.id}/cancel",
                json={"note": "נגמר המלאי"},
                headers=shop.headers,
            )
        else:
            res = client.post("/product-orders/status/cancel", json={"token": token})
        assert res.status_code == 200, (close, res.text)
        db.refresh(order)
        assert (order.status, order.proposed_total_agorot, order.proposal_note) == (
            "cancelled",
            None,
            None,
        ), close


def test_an_order_too_large_for_the_site_is_refused_not_crashed(
    client, db, flag_on, sent
):
    shop = Shop(db)
    shop.bread.price_min = shop.bread.price_max = 10_000
    db.commit()
    res = send(
        client, shop, sent, items=[{"product_id": str(shop.bread.id), "qty": 99}]
    )
    assert res.status_code == 409
    assert create_module.TOO_LARGE_DETAIL in res.text
    assert db.query(ProductOrder).count() == 0


def test_a_twin_request_that_loses_the_race_gets_409_not_500(
    client, db, flag_on, sent, monkeypatch
):
    """Two requests with one idempotency key on two phones: each holds its
    own phone's lock, so the second passes the replay check and meets the
    unique index when it writes. Staged by blinding the replay check."""
    shop = Shop(db)
    first = send(client, shop, sent)
    assert first.status_code == 201
    key = db.query(ProductOrder).one().idempotency_key
    monkeypatch.setattr(create_module, "_replayed", lambda *a: None)
    twin = send(client, shop, sent, phone=OTHER_PHONE, idempotency_key=key)
    assert twin.status_code == 409
    assert create_module.KEY_REUSED_DETAIL in twin.text
    assert db.query(ProductOrder).count() == 1


def test_one_address_gets_five_codes_an_hour_whatever_the_phones(
    client, db, flag_on, sent
):
    shop = Shop(db)
    answers = [
        client.post(
            "/product-orders/phone-code",
            json={"producer_id": shop.id, "phone": f"050-555-000{n}"},
        ).status_code
        for n in range(6)
    ]
    assert answers == [200] * 5 + [429]
    assert len(sent) == 5
