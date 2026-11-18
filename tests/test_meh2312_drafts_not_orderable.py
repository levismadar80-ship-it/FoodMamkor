"""MEH-2312 follow-up: an imported catalog draft is not on the order menu and
cannot be ordered or configured, until the admin approves it.

Found by a retroactive security review (18/11): `_menu_products`,
`product_order_create._lines` and `put_product_ordering` queried `Product`
directly, so the `is_draft` gate on `Producer.products` did not apply.
"""

from __future__ import annotations

from app.models.models import Product
from tests.test_meh3263_order_route import (  # noqa: F401  (fixtures)
    Shop,
    flag_on,
    send,
    sent,
)


def _draft(db, shop) -> Product:
    draft = Product(
        producer_id=shop.producer.id,
        name="עוגת טיוטה",
        price_min=40,
        price_max=40,
        is_draft=True,
    )
    db.add(draft)
    db.commit()
    return draft


def test_a_draft_is_not_on_the_order_menu(client, db, flag_on):
    shop = Shop(db)
    draft = _draft(db, shop)
    menu = client.get(f"/producers/{shop.id}/order-menu").json()
    ids = {p["id"] for p in menu["products"]}
    assert str(shop.bread.id) in ids
    assert str(draft.id) not in ids


def test_a_draft_cannot_be_ordered(client, db, flag_on, sent):
    shop = Shop(db)
    draft = _draft(db, shop)
    res = send(client, shop, sent, items=[{"product_id": str(draft.id), "qty": 1}])
    assert res.status_code == 409, res.text


def test_the_owner_cannot_set_ordering_fields_on_a_draft(client, db, flag_on):
    shop = Shop(db)
    draft = _draft(db, shop)
    res = client.put(
        f"/producers/me/products/{draft.id}/ordering",
        json={"is_orderable": True, "in_stock": True, "price_unit": "unit", "contains_alcohol": False},
        headers=shop.headers,
    )
    assert res.status_code == 404, res.text
