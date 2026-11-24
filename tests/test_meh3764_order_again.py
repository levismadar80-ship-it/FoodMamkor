"""MEH-3764 — «להזמין שוב» needs to know which product each order line was.

The order response carries `product_id` / `variant_id` on every line, so the
buyer's order page can put the same items back in the cart. A product (or
variant) deleted since is null on the line, and the page skips it by name.
"""

from app.models.catalog import ProductVariant
from _test_meh3263_order_route__common import (  # noqa: F401 — fixtures
    Shop,
    code_for,
    flag_on,
    sent,
    slot_of,
    valid_order_payload,
)


def _order(client, shop, sent, items):
    slot = slot_of(client, shop)
    body = valid_order_payload(shop, slot, code_for(client, shop, sent), items=items)
    res = client.post("/product-orders", json=body)
    assert res.status_code == 201, res.text
    return res.json()


def _read(client, token):
    res = client.post("/product-orders/status", json={"token": token})
    assert res.status_code == 200, res.text
    return res.json()


def test_each_line_names_its_product_and_variant(client, db, flag_on, sent):  # noqa: F811
    shop = Shop(db)
    big = ProductVariant(
        product_id=shop.cheese.id, name="גדול", price_agorot=None, in_stock=True
    )
    db.add(big)
    db.commit()
    made = _order(
        client,
        shop,
        sent,
        [
            {"product_id": str(shop.bread.id), "qty": 2},
            {"product_id": str(shop.cheese.id), "variant_id": str(big.id), "qty": 1},
        ],
    )
    lines = {line["name"]: line for line in _read(client, made["status_token"])["items"]}
    assert lines["חלה"]["product_id"] == str(shop.bread.id)
    assert lines["חלה"]["variant_id"] is None
    assert lines["גבינה"]["product_id"] == str(shop.cheese.id)
    assert lines["גבינה"]["variant_id"] == str(big.id)


def test_a_deleted_product_reads_as_null_and_keeps_its_name(client, db, flag_on, sent):  # noqa: F811
    shop = Shop(db)
    made = _order(client, shop, sent, [{"product_id": str(shop.bread.id), "qty": 2}])
    db.delete(shop.bread)
    db.commit()
    line = _read(client, made["status_token"])["items"][0]
    assert line["product_id"] is None
    assert line["name"] == "חלה"
