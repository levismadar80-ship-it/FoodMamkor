"""Part 2 of 2 of `tests/test_meh3263_order_route.py`: test_a_proposed_change_becomes_the_order_when_the_buyer_accepts, test_a_change_of_total_alone_keeps_the_slot, test_ready_then_handed_with_the_buyers_code, test_a_no_show_can_only_be_reported_after_the_slot, test_decline_and_cancel_carry_the_business_note_into_the_log, test_a_new_pickup_code_skips_the_ones_still_in_use, test_the_database_refuses_two_live_orders_with_one_code, test_deleting_an_account_cancels_her_open_orders_and_removes_her_from_all, test_only_the_state_service_assigns_an_orders_status, test_the_status_probe_catches_each_way_of_writing_a_status, test_asking_for_a_code_does_not_say_whether_a_phone_is_blocked, test_an_order_whose_slot_has_passed_cannot_be_confirmed, test_a_proposal_whose_slot_has_passed_cannot_be_accepted, test_the_business_cannot_set_a_total_the_buyer_never_saw, test_a_proposal_does_not_stay_on_an_order_that_closed_without_it, test_an_order_too_large_for_the_site_is_refused_not_crashed, test_a_twin_request_that_loses_the_race_gets_409_not_500, test_one_address_gets_five_codes_an_hour_whatever_the_phones, test_an_exact_price_is_an_estimate_only_for_a_weighed_unit.

Moved here verbatim by the MEH-3540 mechanical split. Not collected
directly (no `test_` prefix): `tests/test_meh3263_order_route.py` imports these tests, so
their node ids stay `tests/test_meh3263_order_route.py::...`. Run them with
`pytest tests/test_meh3263_order_route.py` (add `-k <ClassName>` to narrow).
"""

from app.models.models import Product
from app.models.models import User
from app.models.product_orders import ProductOrder
from app.models.product_orders import ProductOrderEvent
from app.services import product_order_actions as actions
from app.services import product_order_create as create_module
from app.utils.clock import utc_now
from datetime import timedelta
from sqlalchemy.exc import IntegrityError
from tests.conftest import auth_header
from tests.conftest import make_user
import pytest
import uuid
from _test_meh3263_order_route__common import ORDER_FILES  # noqa: F401
from _test_meh3263_order_route__common import OTHER_PHONE  # noqa: F401
from _test_meh3263_order_route__common import PHONE  # noqa: F401
from _test_meh3263_order_route__common import Shop  # noqa: F401
from _test_meh3263_order_route__common import _status_assignments  # noqa: F401
from _test_meh3263_order_route__common import send  # noqa: F401
from _test_meh3263_order_route__common import sent  # noqa: F401
from _test_meh3263_order_route__common import slot_of  # noqa: F401
from _test_meh3263_order_route__common import stored_order  # noqa: F401

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


# MEH-2936: the stored order line, not only the menu, counts bottle/box like
# `unit` and weighs kg/100g — services/product_order_create.py decides it.
@pytest.mark.parametrize(
    ("unit", "estimate"), [("bottle", False), ("box", False), ("pack", False), ("unit", False), ("100g", True)]
)
def test_an_exact_price_is_an_estimate_only_for_a_weighed_unit(
    client, db, flag_on, sent, unit, estimate
):
    shop = Shop(db)
    product = Product(producer_id=shop.producer.id, name="שמן", price_min=60, price_max=60, price_unit=unit)
    db.add(product)
    db.commit()
    res = send(client, shop, sent, items=[{"product_id": str(product.id), "qty": 1}])
    assert res.status_code == 201, res.text
    line = res.json()["items"][0]
    assert (line["price_unit"], line["price_is_estimate"]) == (unit, estimate)
