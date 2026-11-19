"""
Module:   test_meh2938_register_store_link
Purpose:  Registration collects the online-store / order-form link
          (`external_order_form`) — optional, http(s) only, stored on the
          producer row. No new column: MEH-296's column is reused.
Touches:  POST /auth/register/producer, producers.external_order_form.
Related:  backend/app/schemas/registration.py (ProducerRegister),
          backend/app/routers/auth_register_producer.py (Producer creation).
History:  MEH-2938 (creation).
"""

from app.models.models import Producer
from conftest import valid_producer_register_payload

REGISTER_URL = "/auth/register/producer"
VALID_PHONE = "0521234567"
STORE = "https://shop.example.com/order"


def _new_registration(**overrides) -> dict:
    return valid_producer_register_payload() | {"phone": VALID_PHONE} | overrides


def test_store_link_persists(client, db):
    resp = client.post(
        REGISTER_URL,
        json=_new_registration(email="store-1@example.com", external_order_form=STORE),
    )
    assert resp.status_code == 200, resp.text
    assert db.query(Producer).one().external_order_form == STORE


def test_store_link_is_optional(client, db):
    resp = client.post(
        REGISTER_URL, json=_new_registration(email="store-2@example.com")
    )
    assert resp.status_code == 200, resp.text
    assert db.query(Producer).one().external_order_form is None


def test_store_link_rejects_non_http_scheme(client, db):
    resp = client.post(
        REGISTER_URL,
        json=_new_registration(
            email="store-3@example.com", external_order_form="javascript:alert(1)"
        ),
    )
    assert resp.status_code == 422, resp.text
    assert db.query(Producer).count() == 0
