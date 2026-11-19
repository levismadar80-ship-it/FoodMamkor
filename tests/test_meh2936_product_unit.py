"""
Module:   test_meh2936_product_unit
Purpose:  MEH-2936 — a product says what its price is per (unit / kg / 100g /
          bottle / box). One vocabulary, one column (`products.price_unit`),
          owner-editable, public, and bottle/box count like `unit` in orders.
Related:  backend/app/models/product_orders.py:PRODUCT_PRICE_UNITS ·
          backend/alembic/versions/20261119_1400_c7e2a9d4f1b8_meh2936_price_unit_bottle_box.py
History:  MEH-2936 (creation).
"""

from __future__ import annotations

import re
import typing
import uuid
from pathlib import Path

import pytest
from sqlalchemy import CheckConstraint

from app.models.models import Product
from app.models.product_orders import (
    PRODUCT_PRICE_UNITS,
    WEIGHED_PRICE_UNITS,
    ProducerOrderSettings,
    ProductOrderItem,
)
from app.routers import product_orders as orders_module
from app.schemas.product_order_offer import PriceUnit
from tests.conftest import auth_header, make_producer, make_user

REPO = Path(__file__).resolve().parents[1]
REVISION = (
    REPO
    / "backend/alembic/versions/20261119_1400_c7e2a9d4f1b8_meh2936_price_unit_bottle_box.py"
)


def _owner(db):
    producer = make_producer(db, name=f"יקב {uuid.uuid4().hex[:6]}")
    user = make_user(db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com")
    user.producer_id = producer.id
    user.is_producer = True
    db.commit()
    db.refresh(user)
    return user, producer


def _product_payload(**extra) -> dict:
    return {"name": "יין אדום", "price_min": 80, **extra}


# ── One vocabulary ─────────────────────────────────────────────────────────


def test_the_vocabulary_has_bottle_and_box():
    assert PRODUCT_PRICE_UNITS == ("unit", "kg", "100g", "bottle", "box")
    assert set(WEIGHED_PRICE_UNITS) < set(PRODUCT_PRICE_UNITS)


def test_the_schema_literal_is_the_model_tuple():
    assert typing.get_args(PriceUnit) == PRODUCT_PRICE_UNITS


def test_the_revision_check_is_the_model_tuple():
    found = re.search(r'^_UNITS = "(.*?)"', REVISION.read_text(encoding="utf-8"), re.M)
    assert found
    assert tuple(re.findall(r"'([a-z0-9]+)'", found.group(1))) == PRODUCT_PRICE_UNITS


@pytest.mark.parametrize("model", [Product, ProductOrderItem])
def test_both_model_checks_are_the_model_tuple(model):
    checks = [
        str(c.sqltext)
        for c in model.__table__.constraints
        if isinstance(c, CheckConstraint) and "price_unit" in str(c.sqltext)
    ]
    assert len(checks) == 1
    assert tuple(re.findall(r"'([a-z0-9]+)'", checks[0])) == PRODUCT_PRICE_UNITS


def test_the_frontend_list_is_the_model_tuple():
    source = (REPO / "frontend/lib/product-price.js").read_text(encoding="utf-8")
    found = re.search(r"PRICE_UNITS = \[(.*?)\]", source, re.S)
    assert found
    assert tuple(re.findall(r'"([a-z0-9]+)"', found.group(1))) == PRODUCT_PRICE_UNITS


# ── The owner sets it ──────────────────────────────────────────────────────


def test_a_product_saves_with_a_bottle_unit(client, db):
    owner, _ = _owner(db)
    res = client.post(
        "/producers/me/products",
        json=_product_payload(price_unit="bottle"),
        headers=auth_header(owner),
    )
    assert res.status_code == 201, res.text
    assert res.json()["price_unit"] == "bottle"


def test_a_product_without_a_unit_is_per_unit_as_before(client, db):
    owner, _ = _owner(db)
    res = client.post(
        "/producers/me/products", json=_product_payload(), headers=auth_header(owner)
    )
    assert res.status_code == 201, res.text
    assert res.json()["price_unit"] == "unit"


def test_an_unknown_unit_is_refused(client, db):
    owner, _ = _owner(db)
    res = client.post(
        "/producers/me/products",
        json=_product_payload(price_unit="crate"),
        headers=auth_header(owner),
    )
    assert res.status_code == 422


def test_an_update_changes_the_unit_and_omitting_it_keeps_it(client, db):
    owner, _ = _owner(db)
    headers = auth_header(owner)
    pid = client.post(
        "/producers/me/products", json=_product_payload(), headers=headers
    ).json()["id"]
    res = client.put(f"/producers/me/products/{pid}", json={"price_unit": "box"}, headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["price_unit"] == "box"
    res = client.put(f"/producers/me/products/{pid}", json={"name": "יין לבן"}, headers=headers)
    assert res.json()["price_unit"] == "box"


def test_an_explicit_null_unit_is_a_422_not_a_500(client, db):
    owner, _ = _owner(db)
    headers = auth_header(owner)
    pid = client.post(
        "/producers/me/products", json=_product_payload(), headers=headers
    ).json()["id"]
    res = client.put(f"/producers/me/products/{pid}", json={"price_unit": None}, headers=headers)
    assert res.status_code == 422


def test_the_public_page_carries_the_unit(client, db):
    _, producer = _owner(db)
    db.add(Product(producer_id=producer.id, name="יין", price_min=80, price_unit="bottle"))
    db.commit()
    res = client.get(f"/producers/{producer.id}")
    assert res.status_code == 200, res.text
    units = {p["name"]: p["price_unit"] for p in res.json()["products"]}
    assert units["יין"] == "bottle"


# ── Orders: bottle / box are counted, not weighed ──────────────────────────


@pytest.fixture
def flag_on(monkeypatch):
    monkeypatch.setattr(orders_module, "product_orders_enabled", lambda: True)


@pytest.mark.parametrize(
    ("unit", "estimate"),
    [("unit", False), ("bottle", False), ("box", False), ("kg", True), ("100g", True)],
)
def test_only_weighed_units_make_an_exact_price_an_estimate(
    client, db, flag_on, unit, estimate
):
    _, producer = _owner(db)
    db.add(
        ProducerOrderSettings(
            producer_id=producer.id, enabled=True, business_id_number="512345678"
        )
    )
    db.add(Product(producer_id=producer.id, name="מוצר", price_min=40, price_max=40, price_unit=unit))
    db.commit()
    menu = client.get(f"/producers/{producer.id}/order-menu").json()
    assert menu["products"][0]["price_is_estimate"] is estimate


@pytest.mark.parametrize(
    ("raw", "unit"),
    [("לבקבוק", "bottle"), ("בקבוק", "bottle"), ("לארגז", "box"), ("box", "box"), ("למארז", "unit")],
)
def test_the_admin_import_reads_bottle_and_box(raw, unit):
    from app.services.product_import import _unit

    assert _unit(raw)[0] == unit


def test_the_orders_tab_switch_does_not_send_an_old_unit_back(client, db, flag_on):
    """Review 19/11: the product form and the orders tab both write the row.
    A sold-out toggle without price_unit keeps the unit the form saved."""
    owner, producer = _owner(db)
    product = Product(producer_id=producer.id, name="שמן", price_min=60, price_unit="bottle")
    db.add(product)
    db.commit()
    url = f"/producers/me/products/{product.id}/ordering"
    body = {"is_orderable": True, "in_stock": False, "contains_alcohol": False}
    res = client.put(url, json=body, headers=auth_header(owner))
    assert res.status_code == 200, res.text
    db.refresh(product)
    assert (product.in_stock, product.price_unit) == (False, "bottle")
    assert client.put(url, json={**body, "price_unit": None}, headers=auth_header(owner)).status_code == 422
