"""MEH-3474 — «למארז» (pack) is a price unit of its own.

Imported «מארז» rows used to land as «ליחידה». One vocabulary
(PRODUCT_PRICE_UNITS) feeds the model CHECKs, the schema Literal, the
frontend list and revision e4b8d2f6a1c3; these tests pin them together and
show pack is counted, not weighed, in orders.
"""

import re
import typing
import uuid
from pathlib import Path

import pytest
from sqlalchemy import CheckConstraint
from sqlalchemy.exc import IntegrityError

from app.models import Product
from app.models.product_orders import (
    PRODUCT_PRICE_UNITS,
    WEIGHED_PRICE_UNITS,
    ProductOrderItem,
)
from app.schemas.product_order_offer import PriceUnit
from tests.conftest import auth_header, make_producer, make_user

REPO = Path(__file__).resolve().parents[1]
REVISION = REPO / "backend/alembic/versions/20261120_1130_e4b8d2f6a1c3_meh3474_price_unit_pack.py"


def _quoted(fragment: str) -> tuple[str, ...]:
    return tuple(re.findall(r"'([a-z0-9]+)'", fragment))


def test_pack_is_in_the_vocabulary_and_counted_not_weighed():
    assert PRODUCT_PRICE_UNITS[-1] == "pack"
    assert "pack" not in WEIGHED_PRICE_UNITS


def test_every_copy_of_the_vocabulary_is_the_model_tuple():
    assert typing.get_args(PriceUnit) == PRODUCT_PRICE_UNITS
    found = re.search(r'^_UNITS = "(.*?)"', REVISION.read_text(encoding="utf-8"), re.M)
    assert found and _quoted(found.group(1)) == PRODUCT_PRICE_UNITS
    for model in (Product, ProductOrderItem):
        checks = [
            str(c.sqltext)
            for c in model.__table__.constraints
            if isinstance(c, CheckConstraint) and "price_unit" in str(c.sqltext)
        ]
        assert len(checks) == 1 and _quoted(checks[0]) == PRODUCT_PRICE_UNITS, model
    source = (REPO / "frontend/lib/product-price.js").read_text(encoding="utf-8")
    listed = re.search(r"PRICE_UNITS = \[(.*?)\]", source, re.S)
    assert listed and tuple(re.findall(r'"([a-z0-9]+)"', listed.group(1))) == PRODUCT_PRICE_UNITS


@pytest.mark.parametrize("raw", ["מארז", "למארז", "package", "pack", "Pack"])
def test_the_import_reads_a_pack_as_pack(raw):
    from app.services.product_import import _unit

    assert _unit(raw)[0] == "pack"


@pytest.mark.parametrize(("raw", "unit"), [("ליחידה", "unit"), ("לארגז", "box"), ('לק"ג', "kg")])
def test_the_other_import_mappings_are_unchanged(raw, unit):
    from app.services.product_import import _unit

    assert _unit(raw)[0] == unit


def test_the_owner_saves_a_pack_product(client, db):
    producer = make_producer(db, name=f"מטע {uuid.uuid4().hex[:6]}")
    owner = make_user(db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com")
    owner.producer_id = producer.id
    owner.is_producer = True
    db.commit()
    res = client.post(
        "/producers/me/products",
        json={"name": "אוכמניות קפואות", "price_min": 79, "price_unit": "pack"},
        headers=auth_header(owner),
    )
    assert res.status_code == 201, res.text
    assert res.json()["price_unit"] == "pack"


def test_the_db_check_accepts_pack_and_refuses_an_unknown_unit(db):
    producer = make_producer(db)
    db.add(Product(producer_id=producer.id, name="מיץ רימון", price_min=35, price_unit="pack"))
    db.commit()
    db.add(Product(producer_id=producer.id, name="משהו", price_min=10, price_unit="crate"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
