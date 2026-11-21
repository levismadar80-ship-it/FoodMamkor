"""Part 1 of 2 of `tests/test_meh3263_order_route.py`: test_every_route_is_404_while_the_flag_is_off, test_the_pickup_code_index_covers_exactly_the_statuses_that_carry_a_code, test_a_code_is_sent_and_only_its_keyed_hash_is_stored, test_no_code_goes_out_for_a_business_that_does_not_take_orders, test_a_number_that_is_not_an_israeli_mobile_is_refused, test_without_whatsapp_there_is_no_code_and_so_no_order, test_the_fourth_code_to_one_phone_within_an_hour_is_refused, test_the_site_wide_ceiling_closes_the_feature_instead_of_sending, test_a_guest_sends_an_order_priced_by_the_server, test_the_request_cannot_carry_a_price, test_a_price_range_is_stored_at_its_high_end_as_an_estimate, test_a_wrong_code_is_counted_even_though_the_request_fails, test_a_code_works_once_and_only_for_its_own_phone, test_an_expired_code_is_refused, test_the_same_request_twice_is_one_order_with_one_token, test_an_idempotency_key_is_not_a_way_into_someone_elses_order, test_a_logged_in_buyer_also_proves_her_phone_and_owns_the_order, test_the_fourth_open_order_from_one_phone_is_refused, test_two_recent_no_shows_close_ordering_to_that_phone, test_a_business_with_too_many_open_orders_takes_no_more, test_a_slot_the_business_does_not_offer_is_refused, test_a_product_that_cannot_be_ordered_fails_the_whole_order, test_an_order_below_the_business_minimum_is_refused, test_alcohol_needs_a_licensed_business_a_declaration_and_a_day_slot, test_the_delivery_fee, test_a_delivery_the_business_does_not_make_is_refused, test_a_delivery_order_stores_the_city_the_fee_and_the_address, test_auto_confirm_fills_a_slot_up_to_the_cap_and_no_further, test_the_slot_cap_holds_for_orders_confirmed_by_hand_too, test_a_cancelled_order_gives_its_place_in_the_slot_back, test_the_business_may_propose_a_slot_past_her_own_cap, test_without_a_cap_a_slot_never_fills, test_an_estimated_price_is_never_confirmed_automatically, test_a_confirmed_pickup_names_the_public_address, test_an_approximate_location_gives_the_city_only, test_no_address_before_confirmation_or_for_a_delivery, test_the_status_page_carries_the_address_once_confirmed, test_the_token_opens_the_order_and_nothing_else_does, test_the_pickup_code_shows_only_while_it_can_be_used, test_the_page_stops_answering_a_month_after_the_order_closed, test_my_orders_leaves_out_an_order_whose_page_has_stopped_answering, test_mask_phone_keeps_two_digits, test_a_buyer_cancels_freely_before_confirmation_and_until_the_cutoff_after, test_a_pending_order_is_cancelled_even_an_hour_before_the_slot, test_the_business_sees_its_own_orders_and_only_those, test_another_businesss_order_is_404_for_every_action, test_confirming_sets_the_final_total_and_a_pickup_code, test_a_fixed_price_order_is_confirmed_at_its_estimate.

Moved here verbatim by the MEH-3540 mechanical split. Not collected
directly (no `test_` prefix): `tests/test_meh3263_order_route.py` imports these tests, so
their node ids stay `tests/test_meh3263_order_route.py::...`. Run them with
`pytest tests/test_meh3263_order_route.py` (add `-k <ClassName>` to narrow).
"""

from app.models.models import DeliveryArea
from app.models.product_orders import PRODUCT_ORDER_CODE_STATUSES
from app.models.product_orders import ProducerOrderSettings
from app.models.product_orders import ProducerOrderWindow
from app.models.product_orders import ProductOrder
from app.models.product_orders import ProductOrderEvent
from app.models.product_orders import ProductOrderPhoneCode
from app.rate_limit import limiter
from app.routers import product_order_business as business_module
from app.routers import product_order_buyer as buyer_module
from app.services import product_order_actions as actions
from app.services import product_order_create as create_module
from app.services import product_order_delivery as delivery
from app.services import product_order_phone as phone_codes
from app.services import product_order_views as views
from app.services.product_order_views import BUYER_VIEW_AFTER_CLOSE
from app.services.product_order_views import mask_phone
from app.utils.clock import utc_now
from datetime import time
from datetime import timedelta
from tests.conftest import auth_header
from tests.conftest import make_user
import pytest
import uuid
from _test_meh3263_order_route__common import ACTIONS  # noqa: F401
from _test_meh3263_order_route__common import FACTS  # noqa: F401
from _test_meh3263_order_route__common import OTHER_PHONE  # noqa: F401
from _test_meh3263_order_route__common import PHONE  # noqa: F401
from _test_meh3263_order_route__common import PHONE_STORED  # noqa: F401
from _test_meh3263_order_route__common import REVISION  # noqa: F401
from _test_meh3263_order_route__common import Shop  # noqa: F401
from _test_meh3263_order_route__common import THIRD_PHONE  # noqa: F401
from _test_meh3263_order_route__common import _facts  # noqa: F401
from _test_meh3263_order_route__common import _menu_starts  # noqa: F401
from _test_meh3263_order_route__common import _primary  # noqa: F401
from _test_meh3263_order_route__common import code_for  # noqa: F401
from _test_meh3263_order_route__common import send  # noqa: F401
from _test_meh3263_order_route__common import sent  # noqa: F401
from _test_meh3263_order_route__common import slot_of  # noqa: F401
from _test_meh3263_order_route__common import stored_order  # noqa: F401
from _test_meh3263_order_route__common import valid_order_payload  # noqa: F401

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
        client.post(
            "/product-orders/quote",
            json={
                "producer_id": shop.id,
                "items": [{"product_id": str(shop.bread.id), "qty": 1}],
                "fulfilment": "pickup",
            },
        ),
        client.post("/product-orders/status", json=ref),
        client.post("/product-orders/status/cancel", json=ref),
        client.post("/product-orders/status/accept-change", json=ref),
        client.get("/users/me/product-orders", headers=shop.headers),
        client.get("/producers/me/product-orders", headers=shop.headers),
        # MEH-3561
        client.get("/producers/me/product-orders/customers", headers=shop.headers),
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
    # MEH-3216 gaps: the cap is the business's one cap per slot, so the order
    # past it is not left pending; the slot is gone (see the manual case below).
    shop = Shop(db, auto_confirm=True, auto_confirm_slot_cap=1)
    slot = slot_of(client, shop)
    first = send(client, shop, sent, slot_start=slot).json()
    second = send(client, shop, sent, slot_start=slot, phone=OTHER_PHONE)
    assert first["status"] == "confirmed"
    assert second.status_code == 409
    assert second.json()["detail"] == create_module.SLOT_GONE_DETAIL
    assert len(first["pickup_code"]) == 4 and first["final_total_agorot"] == 5600
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


def test_the_slot_cap_holds_for_orders_confirmed_by_hand_too(client, db, flag_on, sent):
    """«עד כמה הזמנות בכל מועד (לא חובה)»: with auto-confirm off, the cap
    still closes a slot once it holds that many live orders."""
    shop = Shop(db, auto_confirm=False, auto_confirm_slot_cap=2)
    slot = slot_of(client, shop)
    first = send(client, shop, sent, slot_start=slot)
    assert first.json()["status"] == "pending"
    assert slot in _menu_starts(client, shop)  # 1 of 2: still offered
    send(client, shop, sent, slot_start=slot, phone=OTHER_PHONE)
    assert slot not in _menu_starts(client, shop)  # 2 of 2: full
    third = send(client, shop, sent, slot_start=slot, phone=THIRD_PHONE)
    assert third.status_code == 409
    assert third.json()["detail"] == create_module.SLOT_GONE_DETAIL


def test_a_cancelled_order_gives_its_place_in_the_slot_back(client, db, flag_on, sent):
    shop = Shop(db, auto_confirm=False, auto_confirm_slot_cap=1)
    slot = slot_of(client, shop)
    order_id = send(client, shop, sent, slot_start=slot).json()["id"]
    assert slot not in _menu_starts(client, shop)
    order = db.get(ProductOrder, uuid.UUID(order_id))
    order.status = "cancelled"
    db.commit()
    assert slot in _menu_starts(client, shop)


def test_the_business_may_propose_a_slot_past_her_own_cap(client, db, flag_on, sent):
    shop = Shop(db, auto_confirm=False, auto_confirm_slot_cap=1)
    full = slot_of(client, shop, nth=1)
    other = slot_of(client, shop, nth=2)
    send(client, shop, sent, slot_start=full)
    moved = send(client, shop, sent, slot_start=other, phone=OTHER_PHONE).json()
    assert full not in _menu_starts(client, shop)
    res = client.post(
        f"/producers/me/product-orders/{moved['id']}/propose-change",
        json={"slot_start": full, "note": "נשאר מקום אצלי"},
        headers=shop.headers,
    )
    assert res.status_code == 200, res.text


def test_without_a_cap_a_slot_never_fills(client, db, flag_on, sent):
    shop = Shop(db, auto_confirm=False, auto_confirm_slot_cap=None)
    slot = slot_of(client, shop)
    send(client, shop, sent, slot_start=slot)
    send(client, shop, sent, slot_start=slot, phone=OTHER_PHONE)
    assert slot in _menu_starts(client, shop)


def test_an_estimated_price_is_never_confirmed_automatically(client, db, flag_on, sent):
    shop = Shop(db, auto_confirm=True, auto_confirm_slot_cap=5)
    res = send(
        client, shop, sent, items=[{"product_id": str(shop.cheese.id), "qty": 1}]
    )
    assert res.json()["status"] == "pending"


def test_a_confirmed_pickup_names_the_public_address(client, db, flag_on):
    shop = Shop(db)
    _primary(db, shop, address="הרצל 12", city="רחובות", location_precision="exact")
    order = stored_order(db, shop, status="confirmed", pickup_code="4821")
    assert views.pickup_address(db, order) == "הרצל 12, רחובות"


def test_an_approximate_location_gives_the_city_only(client, db, flag_on):
    shop = Shop(db)
    _primary(
        db, shop, address="הרצל 12", city="רחובות", location_precision="approximate"
    )
    order = stored_order(db, shop, status="ready", pickup_code="4821")
    assert views.pickup_address(db, order) == "רחובות"


@pytest.mark.parametrize(
    ("status", "fulfilment"),
    [("pending", "pickup"), ("change_proposed", "pickup"), ("confirmed", "delivery")],
)
def test_no_address_before_confirmation_or_for_a_delivery(
    client, db, flag_on, status, fulfilment
):
    shop = Shop(db)
    _primary(db, shop, address="הרצל 12", city="רחובות", location_precision="exact")
    order = stored_order(db, shop, status=status, fulfilment=fulfilment)
    assert views.pickup_address(db, order) is None


def test_the_status_page_carries_the_address_once_confirmed(client, db, flag_on):
    shop = Shop(db)
    _primary(db, shop, address="הרצל 12", city="רחובות", location_precision="exact")
    token = "a" * 43
    order = stored_order(
        db, shop, "pending", status_token_hash=create_module.token_hash(token)
    )
    before = client.post("/product-orders/status", json={"token": token}).json()
    order.status, order.pickup_code = "confirmed", "4821"
    db.commit()
    after = client.post("/product-orders/status", json={"token": token}).json()
    assert (before["pickup_address"], after["pickup_address"]) == (
        None,
        "הרצל 12, רחובות",
    )


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


def test_my_orders_leaves_out_an_order_whose_page_has_stopped_answering(
    client, db, flag_on
):
    """MEH-3525: the list never links to an order page that would 404."""
    shop = Shop(db)
    buyer = make_user(db, email="history@example.com")
    open_order = stored_order(db, shop, "pending", user_id=buyer.id)
    recent = stored_order(
        db,
        shop,
        "handed",
        user_id=buyer.id,
        closed_at=utc_now() - BUYER_VIEW_AFTER_CLOSE + timedelta(minutes=5),
    )
    stale = stored_order(
        db,
        shop,
        "handed",
        user_id=buyer.id,
        closed_at=utc_now() - BUYER_VIEW_AFTER_CLOSE - timedelta(minutes=5),
    )
    res = client.get("/users/me/product-orders", headers=auth_header(buyer))
    ids = {o["id"] for o in res.json()["orders"]}
    assert ids == {str(open_order.id), str(recent.id)}
    page = client.post(
        "/product-orders/status",
        json={"order_id": str(stale.id)},
        headers=auth_header(buyer),
    )
    assert page.status_code == 404


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
