"""MEH-293 — dietary filter via EXISTS subquery on product flags.

Replaces the legacy `Producer.vegan == TRUE` filter with
`Producer.products.any(Product.is_vegan == TRUE)`. These tests pin the
behavior matrix from the spec:

  - producer with at least one is_vegan=TRUE product → in `?vegan=true`
  - producer with only is_vegan=FALSE products → NOT in `?vegan=true`
  - producer with zero products → NOT in `?vegan=true` (intentional;
    the imprecision MEH-293 set out to fix)
  - flipping the last vegan product to FALSE drops the producer

Also pins the aggregated output field `has_vegan_products` on
ProducerListOut, which the frontend reads for badge display during the
7-day overlap.
"""
from __future__ import annotations

from app.models.models import Product
from tests.conftest import make_producer


def _add_product(db, producer, *, name="מוצר", is_vegan=False, is_gluten_free=False, is_lactose_free=False):
    p = Product(
        producer_id=producer.id,
        name=name,
        is_vegan=is_vegan,
        is_gluten_free=is_gluten_free,
        is_lactose_free=is_lactose_free,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def test_vegan_filter_returns_producer_with_at_least_one_vegan_product(client, db):
    p_with_vegan = make_producer(db, name="חוות הטבעוניות")
    _add_product(db, p_with_vegan, name="חומוס טבעוני", is_vegan=True)
    _add_product(db, p_with_vegan, name="גבינה לבנה", is_vegan=False)

    p_without = make_producer(db, name="גבינות הכפר")
    _add_product(db, p_without, name="גבינת עיזים", is_vegan=False)

    r = client.get("/producers", params={"vegan": "true"})
    assert r.status_code == 200
    names = [row["name"] for row in r.json()]
    assert "חוות הטבעוניות" in names
    assert "גבינות הכפר" not in names


def test_vegan_filter_excludes_producer_with_zero_products(client, db):
    """Intentional MEH-293 behavior change — a producer with no products
    cannot offer anything vegan, so they correctly drop out of the filter
    once dietary flags live on products instead of on the business."""
    p_empty = make_producer(db, name="עסק בלי מוצרים")

    r = client.get("/producers", params={"vegan": "true"})
    assert r.status_code == 200
    names = [row["name"] for row in r.json()]
    assert "עסק בלי מוצרים" not in names


def test_removing_last_vegan_flag_drops_producer_from_filter(client, db):
    p = make_producer(db, name="חווה אחת בלבד")
    only_vegan = _add_product(db, p, name="טופו ביתי", is_vegan=True)

    r = client.get("/producers", params={"vegan": "true"})
    assert "חווה אחת בלבד" in [row["name"] for row in r.json()]

    only_vegan.is_vegan = False
    db.commit()

    r = client.get("/producers", params={"vegan": "true"})
    assert "חווה אחת בלבד" not in [row["name"] for row in r.json()]


def test_aggregated_has_vegan_products_field_reflects_any_product(client, db):
    p_yes = make_producer(db, name="עם טבעוני")
    _add_product(db, p_yes, name="פיתה", is_vegan=True)

    p_no = make_producer(db, name="בלי טבעוני")
    _add_product(db, p_no, name="חמאה", is_vegan=False)

    r = client.get("/producers")
    assert r.status_code == 200
    by_name = {row["name"]: row for row in r.json()}
    assert by_name["עם טבעוני"]["has_vegan_products"] is True
    assert by_name["בלי טבעוני"]["has_vegan_products"] is False


def test_dietary_filters_independent_per_flag(client, db):
    """gluten_free and lactose_free filter on their own product flags
    (each flag is independent — no fall-through to the other two)."""
    p_gf_only = make_producer(db, name="ללא גלוטן בלבד")
    _add_product(db, p_gf_only, name="עוגיות שיבולת שועל", is_gluten_free=True)

    p_lf_only = make_producer(db, name="ללא לקטוז בלבד")
    _add_product(db, p_lf_only, name="חלב שקדים", is_lactose_free=True)

    r = client.get("/producers", params={"gluten_free": "true"})
    names = [row["name"] for row in r.json()]
    assert "ללא גלוטן בלבד" in names
    assert "ללא לקטוז בלבד" not in names

    r = client.get("/producers", params={"lactose_free": "true"})
    names = [row["name"] for row in r.json()]
    assert "ללא לקטוז בלבד" in names
    assert "ללא גלוטן בלבד" not in names
