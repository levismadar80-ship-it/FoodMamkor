"""MEH-3385 — the business page's products come back in the owner's order.

Rulings 17/11 §א12: the detail endpoints moved from three collection
`joinedload`s (a cartesian product of categories × products × delivery areas)
to `selectinload`. A separate SELECT carries no ORDER BY of its own, so the
order is pinned on the relationship: `position` first, unplaced products last.

The rows are inserted in the OPPOSITE order of their positions, with an
unplaced product first, so insertion (heap) order cannot pass for the owner's
order. Products with no position keep no promised order among themselves —
the frontend keeps API order for them (frontend/lib/product-order.js:29) — so
only "after every placed product" is asserted for them.
"""

from sqlalchemy import event

from app.database import engine
from app.models import Product
from tests.conftest import make_category, make_producer


def _seed(db):
    producer = make_producer(
        db,
        images=["https://res.cloudinary.com/x/image/upload/v1/a.jpg"],
        category=make_category(db),
        delivery_cities=["חיפה", "עכו"],
    )
    producer.slug = "meh-3385-order"  # make_producer sets none
    rows = [
        Product(producer_id=producer.id, name="בלי מקום א", price_min=10),
        Product(producer_id=producer.id, name="שלישי", price_min=10, position=2),
        Product(producer_id=producer.id, name="שני", price_min=10, position=1),
        Product(producer_id=producer.id, name="בלי מקום ב", price_min=10),
        Product(producer_id=producer.id, name="ראשון", price_min=10, position=0),
    ]
    for row in rows:  # one flush each: heap order = this list's order
        db.add(row)
        db.flush()
    db.commit()
    db.refresh(producer)
    return producer


def _names(body):
    return [p["name"] for p in body["products"]]


def _assert_owner_order(names):
    assert names[:3] == ["ראשון", "שני", "שלישי"], names
    assert sorted(names[3:]) == ["בלי מקום א", "בלי מקום ב"], names


def test_detail_by_id_returns_products_in_position_order(client, db):
    producer = _seed(db)
    res = client.get(f"/producers/{producer.id}")
    assert res.status_code == 200, res.text
    _assert_owner_order(_names(res.json()))


def test_detail_by_slug_returns_products_in_position_order(client, db):
    producer = _seed(db)
    res = client.get(f"/producers/by-slug/{producer.slug}")
    assert res.status_code == 200, res.text
    _assert_owner_order(_names(res.json()))


def test_detail_does_not_multiply_rows_across_collections(client, db):
    """The cartesian is gone: no SELECT joins products to the other two
    collections, and the response carries each child exactly once."""
    producer = _seed(db)
    statements: list[str] = []

    def _record(conn, cursor, statement, *args):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", _record)
    try:
        body = client.get(f"/producers/{producer.id}").json()
    finally:
        event.remove(engine, "before_cursor_execute", _record)

    assert len(body["products"]) == 5
    assert len(body["delivery_areas"]) == 2
    joined = [
        s for s in statements
        if "FROM producers" in s and "JOIN products" in s and "JOIN delivery_areas" in s
    ]
    assert joined == [], joined[0][:400] if joined else ""
