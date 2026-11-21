"""MEH-3680 — a logged-in buyer whose account phone is verified orders
without a code; everyone else still proves the phone with one."""

from datetime import timezone, datetime

from app.models.product_orders import ProductOrder, ProductOrderPhoneCode
from _test_meh3263_order_route__common import (  # noqa: F401
    PHONE,
    OTHER_PHONE,
    Shop,
    flag_on,
    sent,
    slot_of,
    valid_order_payload,
)
from tests.conftest import auth_header, make_user


def _buyer(db, *, phone="0501234567", verified=True):
    user = make_user(db, email=f"b{phone[-4:]}{verified}@example.com")
    user.phone = phone
    user.phone_verified_at = datetime.now(timezone.utc) if verified else None
    db.commit()
    return user


def _post(client, shop, headers=None, **over):
    body = valid_order_payload(shop, slot_of(client, shop), None, **over)
    body.pop("code")
    return client.post("/product-orders", json=body, headers=headers or {})


def test_a_verified_buyer_orders_to_her_own_phone_without_a_code(client, db, flag_on):
    shop = Shop(db)
    user = _buyer(db)  # stored as typed; PHONE in the body is dashed
    res = _post(client, shop, auth_header(user), phone=PHONE)
    assert res.status_code == 201, res.text
    order = db.query(ProductOrder).one()
    assert order.user_id == user.id
    assert db.query(ProductOrderPhoneCode).count() == 0


def test_a_verified_buyer_still_needs_a_code_for_another_phone(client, db, flag_on):
    shop = Shop(db)
    user = _buyer(db)
    res = _post(client, shop, auth_header(user), phone=OTHER_PHONE)
    assert res.status_code == 422, res.text
    assert db.query(ProductOrder).count() == 0


def test_an_unverified_account_phone_still_needs_a_code(client, db, flag_on):
    shop = Shop(db)
    user = _buyer(db, verified=False)
    res = _post(client, shop, auth_header(user), phone=PHONE)
    assert res.status_code == 422, res.text
    assert db.query(ProductOrder).count() == 0


def test_a_guest_without_a_code_is_refused_and_no_try_is_counted(
    client, db, flag_on, sent
):
    shop = Shop(db)
    client.post(
        "/product-orders/phone-code", json={"producer_id": shop.id, "phone": PHONE}
    )
    res = _post(client, shop, phone=PHONE)
    assert res.status_code == 422, res.text
    assert res.json()["detail"] == "הקוד לא נכון או שפג תוקפו. אפשר לבקש קוד חדש"
    assert db.query(ProductOrder).count() == 0
    row = db.query(ProductOrderPhoneCode).one()
    assert (row.used_at, row.attempts) == (None, 0)
