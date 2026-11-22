"""MEH-3620 — after a hand-over the buyer's order page offers «כתבו ביקורת»
with the business's verified-review link: the same URL the owner shares
(services/review_invite.py), and only once the order was handed."""

import pytest

from _test_meh3263_order_route__common import Shop  # noqa: F401
from _test_meh3263_order_route__common import flag_on  # noqa: F401
from _test_meh3263_order_route__common import stored_order
from app.auth import decode_review_invite_token
from app.models.product_orders import PRODUCT_ORDER_STATUSES
from app.services import product_order_create as create_module

TOKEN = "r" * 43


def _read(client, db, shop, status):
    stored_order(db, shop, status, status_token_hash=create_module.token_hash(TOKEN))
    res = client.post("/product-orders/status", json={"token": TOKEN})
    assert res.status_code == 200
    return res.json()["review_url"]


def test_a_handed_order_carries_this_business_review_link(client, db, flag_on):  # noqa: F811
    shop = Shop(db)
    url = _read(client, db, shop, "handed")
    assert url.split("?rt=")[0].endswith(f"/p/{shop.producer.slug}") or url.split("?rt=")[
        0
    ].endswith(f"/producer/{shop.producer.id}")
    claims = decode_review_invite_token(url.split("?rt=")[1])
    assert claims is not None
    assert claims["producer_id"] == str(shop.producer.id)


@pytest.mark.parametrize("status", [s for s in PRODUCT_ORDER_STATUSES if s != "handed"])
def test_no_link_before_or_without_a_hand_over(client, db, flag_on, status):  # noqa: F811
    assert _read(client, db, Shop(db), status) is None


def test_no_link_for_a_business_that_is_not_live(client, db, flag_on):  # noqa: F811
    shop = Shop(db)
    shop.producer.status = "pending"
    db.commit()
    assert _read(client, db, shop, "handed") is None
