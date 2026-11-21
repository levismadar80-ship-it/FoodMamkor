"""MEH-3561 — «הלקוחות שלכם»: GET /producers/me/product-orders/customers.

One row per customer (a phone number), the name on their latest order, the
count of orders the business took, the date of the last one; newest first.

Discrimination: count a declined / expired / cancelled order → the exclusion
case goes red; group by name instead of phone → the rename case goes red (two
rows); take the oldest name → the rename case goes red; drop the producer filter
→ the isolation case goes red; order oldest-first → the order case goes red; drop the empty-phone filter → the
deleted-account case goes red.
"""

from datetime import timedelta

from app.utils.clock import utc_now
from tests._test_meh3263_order_route__common import (  # noqa: F401 — fixtures
    OTHER_PHONE,
    PHONE_STORED,
    Shop,
    flag_on,
    stored_order,
)
from tests.conftest import auth_header, make_user

URL = "/producers/me/product-orders/customers"
OTHER_STORED = "972529876543"


def _ago(days: int):
    return utc_now() - timedelta(days=days)


def test_no_orders_no_customers(client, db, flag_on):
    shop = Shop(db)
    res = client.get(URL, headers=shop.headers)
    assert res.status_code == 200
    assert res.json() == {"customers": []}
    assert res.headers["cache-control"] == "no-store"


def test_one_row_per_phone_latest_name_count_and_date(client, db, flag_on):
    shop = Shop(db)
    stored_order(db, shop, "handed", customer_name="דנה", created_at=_ago(20))
    stored_order(db, shop, "handed", customer_name="דנה לוי", created_at=_ago(5))
    last = stored_order(db, shop, "confirmed", customer_name="דנה לוי", created_at=_ago(1))
    rows = client.get(URL, headers=shop.headers).json()["customers"]
    assert len(rows) == 1
    (row,) = rows
    assert row["phone"] == PHONE_STORED
    assert row["name"] == "דנה לוי"  # the newest order's name, not the first
    assert row["order_count"] == 3
    assert row["last_order_at"].startswith(last.created_at.isoformat()[:16])


def test_an_order_she_never_took_does_not_count(client, db, flag_on):
    shop = Shop(db)
    stored_order(db, shop, "handed", created_at=_ago(3))
    for status in ("declined", "expired", "cancelled"):
        stored_order(db, shop, status, created_at=_ago(1))
    stored_order(db, shop, "declined", customer_phone=OTHER_STORED, created_at=_ago(1))
    rows = client.get(URL, headers=shop.headers).json()["customers"]
    assert [(r["phone"], r["order_count"]) for r in rows] == [(PHONE_STORED, 1)]


def test_a_deleted_account_is_not_a_customer(client, db, flag_on):
    from app.services.product_order_privacy import DELETED_BUYER_NAME

    shop = Shop(db)
    stored_order(db, shop, "handed")
    for _ in range(2):
        stored_order(db, shop, "handed", customer_phone="", customer_name=DELETED_BUYER_NAME)
    rows = client.get(URL, headers=shop.headers).json()["customers"]
    assert [r["phone"] for r in rows] == [PHONE_STORED]


def test_newest_buyer_first(client, db, flag_on):
    shop = Shop(db)
    stored_order(db, shop, "handed", created_at=_ago(9))
    stored_order(db, shop, "handed", customer_phone=OTHER_STORED, customer_name="יוסי", created_at=_ago(2))
    rows = client.get(URL, headers=shop.headers).json()["customers"]
    assert [r["phone"] for r in rows] == [OTHER_STORED, PHONE_STORED]


def test_only_the_callers_business(client, db, flag_on):
    shop, other = Shop(db), Shop(db)
    stored_order(db, other, "handed", customer_phone=OTHER_STORED)
    stored_order(db, shop, "handed")
    rows = client.get(URL, headers=shop.headers).json()["customers"]
    assert [r["phone"] for r in rows] == [PHONE_STORED]


def test_guards(client, db, flag_on):
    assert client.get(URL).status_code == 401
    consumer = make_user(db, email="c3561@example.com")
    assert client.get(URL, headers=auth_header(consumer)).status_code == 403


def test_off_when_ordering_is_off(client, db):
    shop = Shop(db)
    assert client.get(URL, headers=shop.headers).status_code == 404
