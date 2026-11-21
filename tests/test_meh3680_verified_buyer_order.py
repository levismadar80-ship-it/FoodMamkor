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


def test_a_verified_buyer_who_sends_a_code_anyway_is_not_held_to_it(
    client, db, flag_on
):
    shop = Shop(db)
    user = _buyer(db)
    body = valid_order_payload(shop, slot_of(client, shop), "000000", phone=PHONE)
    res = client.post("/product-orders", json=body, headers=auth_header(user))
    assert res.status_code == 201, res.text
    assert db.query(ProductOrderPhoneCode).count() == 0


def test_after_a_phone_change_the_old_verification_covers_nothing(client, db, flag_on):
    shop = Shop(db)
    user = _buyer(db)
    headers = auth_header(user)
    changed = client.patch("/users/me", json={"phone": OTHER_PHONE}, headers=headers)
    assert changed.status_code == 200, changed.text
    for phone in (OTHER_PHONE, PHONE):
        res = _post(client, shop, headers, phone=phone)
        assert res.status_code == 422, res.text
    assert db.query(ProductOrder).count() == 0


def test_from_the_fourth_order_in_an_hour_a_code_is_asked_again(client, db, flag_on):
    """The codeless path keeps the old bound of 3 codes an hour per phone,
    also for an order-then-cancel loop."""
    shop = Shop(db)
    user = _buyer(db)
    headers = auth_header(user)
    for _ in range(3):
        assert _post(client, shop, headers, phone=PHONE).status_code == 201
        # Cancelled at once: the open-orders cap alone would not stop a loop.
        db.query(ProductOrder).update({"status": "cancelled"})
        db.commit()
    res = _post(client, shop, headers, phone=PHONE)
    assert res.status_code == 422, res.text
    assert res.json()["detail"] == "הקוד לא נכון או שפג תוקפו. אפשר לבקש קוד חדש"
    assert db.query(ProductOrder).count() == 3
