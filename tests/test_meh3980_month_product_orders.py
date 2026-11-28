"""MEH-3980: the dashboard's «החודש הגיעו דרך האתר» line counts product orders.

The billing summary reads only the billable-events ledger, and product orders
are never written there (their commission is not set yet, docs/PRICING.md).
So the summary also returns the month's handed product orders and their value,
as separate fields; the ledger, the fees and the threshold do not move.
"""

from datetime import datetime

from _test_meh3263_order_route__common import Shop, stored_order

from app.services import freshness_month_numbers
from app.services.billing_summary import Month

MONTH = "2026-11"


def _summary(client, shop) -> dict:
    res = client.get(
        f"/producers/me/billing/summary?month={MONTH}", headers=shop.headers
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_a_handed_order_this_month_is_counted_with_its_value(client, db):
    shop = Shop(db)
    stored_order(db, shop, "handed", handed_at=datetime(2026, 11, 10, 9), final_total_agorot=4200)
    stored_order(db, shop, "handed", handed_at=datetime(2026, 11, 12, 9))  # no final: the estimate, 5600
    body = _summary(client, shop)
    assert body["product_orders"] == 2
    assert body["product_orders_value_agorot"] == 4200 + 5600


def test_the_month_is_the_israel_month(client, db):
    shop = Shop(db)
    # 31/10 22:30 UTC is 1/11 00:30 in Israel: November.
    stored_order(db, shop, "handed", handed_at=datetime(2026, 10, 31, 22, 30))
    # 30/11 22:30 UTC is 1/12 00:30 in Israel: December.
    stored_order(db, shop, "handed", handed_at=datetime(2026, 11, 30, 22, 30))
    assert _summary(client, shop)["product_orders"] == 1


def test_orders_not_handed_or_of_another_business_are_not_counted(client, db):
    shop, other = Shop(db), Shop(db)
    for status in ("pending", "confirmed", "ready", "declined", "cancelled", "no_show"):
        stored_order(db, shop, status)
    stored_order(db, other, "handed", handed_at=datetime(2026, 11, 10, 9))
    body = _summary(client, shop)
    assert body["product_orders"] == 0
    assert body["product_orders_value_agorot"] == 0


def test_the_ledger_numbers_do_not_move(client, db):
    shop = Shop(db)
    stored_order(db, shop, "handed", handed_at=datetime(2026, 11, 10, 9), final_total_agorot=200_000)
    body = _summary(client, shop)
    assert body["bookings"] == 0
    assert body["value_agorot"] == 0
    assert body["over_threshold"] is False
    assert body["fee_without_subscription_agorot"] == 0


def test_a_guest_is_refused(client):
    assert client.get(f"/producers/me/billing/summary?month={MONTH}").status_code == 401


def test_a_final_total_of_zero_is_kept_not_the_estimate(client, db):
    shop = Shop(db)
    stored_order(db, shop, "handed", handed_at=datetime(2026, 11, 10, 9), final_total_agorot=0)
    body = _summary(client, shop)
    assert body["product_orders"] == 1
    assert body["product_orders_value_agorot"] == 0


def test_the_monthly_email_counts_them_like_the_line(db):
    # The owner email of the 1st (MEH-3194) reads the same month numbers;
    # it must not say 0 while the dashboard line says 1.
    shop = Shop(db)
    stored_order(db, shop, "handed", handed_at=datetime(2026, 11, 10, 9), final_total_agorot=4200)
    numbers = freshness_month_numbers.month_numbers(db, shop.producer.id, Month(2026, 11))
    assert numbers["bookings"] == 1
    assert numbers["value_agorot"] == 4200
