"""MEH-3216: the business's «מספר עוסק או ח״פ» on its ordering settings.

The order form shows the seller's business number, as distance-selling law
requires. A business without one cannot switch ordering on, and a row that
somehow has ordering on without it does not take orders.
"""

import pytest

from app.models.product_orders import ProducerOrderSettings
from app.routers import product_orders as orders_module
from app.services.product_order_menu import takes_orders
from tests.conftest import auth_header
from tests.test_meh3218_product_orders import _owner, valid_settings_payload

NEEDS_ID = "כדי לקבל הזמנות באתר צריך למלא מספר עוסק."


@pytest.fixture
def flag_on(monkeypatch):
    monkeypatch.setattr(orders_module, "product_orders_enabled", lambda: True)


def _put(client, owner, **change):
    return client.put(
        "/producers/me/order-settings",
        json=valid_settings_payload() | change,
        headers=auth_header(owner),
    )


def test_switching_ordering_on_without_a_business_number_is_refused(
    client, db, flag_on
):
    owner, _ = _owner(db)
    res = _put(client, owner, business_id_number=None)
    assert res.status_code == 422
    assert NEEDS_ID in res.text
    assert db.query(ProducerOrderSettings).count() == 0


def test_ordering_off_may_be_saved_without_a_business_number(client, db, flag_on):
    owner, _ = _owner(db)
    res = _put(client, owner, enabled=False, business_id_number=None)
    assert res.status_code == 200
    assert res.json()["business_id_number"] is None


@pytest.mark.parametrize(
    ("typed", "stored"),
    [
        ("512345678", "512345678"),
        ("51-234567-8", "512345678"),
        (" 51 234 5678 ", "512345678"),
        ("12345678", "012345678"),
        # pasted from a Hebrew document: an RLM, a non-breaking hyphen, a no-break space
        ("\u200f51\u2011234567\u00a08", "512345678"),
    ],
)
def test_the_number_is_stored_as_nine_digits(client, db, flag_on, typed, stored):
    owner, _ = _owner(db)
    res = _put(client, owner, business_id_number=typed)
    assert res.status_code == 200, res.text
    assert res.json()["business_id_number"] == stored
    again = client.get("/producers/me/order-settings", headers=auth_header(owner))
    assert again.json()["business_id_number"] == stored


@pytest.mark.parametrize(
    "typed",
    # the last two are digits to str.isdigit() but not to the DB CHECK [0-9]:
    # they must be a Hebrew 422 here, never a 500 at commit
    ["1234567", "1234567890", "51234567a", "١٢٣٤٥٦٧٨٩", "５１２３４５６７８"],
)
def test_a_number_that_is_not_eight_or_nine_digits_is_refused(
    client, db, flag_on, typed
):
    owner, _ = _owner(db)
    res = _put(client, owner, business_id_number=typed)
    assert res.status_code == 422
    assert "9 ספרות" in res.text


def test_an_empty_number_counts_as_none(client, db, flag_on):
    owner, _ = _owner(db)
    res = _put(client, owner, enabled=False, business_id_number="  ")
    assert res.status_code == 200
    assert res.json()["business_id_number"] is None


def test_the_field_must_be_sent(client, db, flag_on):
    owner, _ = _owner(db)
    body = valid_settings_payload()
    body.pop("business_id_number")
    res = client.put(
        "/producers/me/order-settings", json=body, headers=auth_header(owner)
    )
    assert res.status_code == 422


def test_a_business_without_a_number_takes_no_orders(db):
    _, producer = _owner(db)
    row = ProducerOrderSettings(producer_id=producer.id, enabled=True)
    assert takes_orders(producer, row) is False
    row.business_id_number = "512345678"
    assert takes_orders(producer, row) is True


def test_the_revision_checks_the_same_pattern_as_the_model():
    from pathlib import Path

    from app.models.product_orders import BUSINESS_ID_PATTERN

    revision = next(
        Path(__file__)
        .resolve()
        .parents[1]
        .glob("backend/alembic/versions/*_meh3216_business_id_number.py")
    ).read_text(encoding="utf-8")
    assert f"business_id_number ~ '{BUSINESS_ID_PATTERN}'" in revision


def test_the_order_menu_carries_the_business_number(client, db, flag_on):
    from tests.test_meh3262_order_windows import _menu_fixture

    producer = _menu_fixture(db)
    res = client.get(f"/producers/{producer.id}/order-menu")
    assert res.status_code == 200, res.text
    assert res.json()["business_id_number"] == "512345678"
