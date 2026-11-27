"""MEH-3956: an order's answer deadline never falls after its slot starts.

A Friday-evening order for Sunday 08:00 got «until Sunday 21:00» (24 hours not
counting Shabbat), though a confirm after the slot begins is refused. The same
for the buyer's answer to a proposed change.
"""

from datetime import datetime

from app.models.product_orders import ProductOrder
from app.services.product_order_clock import active_deadline, answer_deadline
from tests import test_meh3263_order_route as route
from tests.test_meh3263_order_route import Shop, send, slot_of

flag_on = route.flag_on
sent = route.sent

# Friday 27 Nov 2026 19:00 Israel (17:00 UTC), Shabbat already in.
FRIDAY_EVENING = datetime(2026, 11, 27, 17)
# Sunday 29 Nov 2026 08:00 Israel (06:00 UTC).
SUNDAY_MORNING = datetime(2026, 11, 29, 6)
# Thursday 3 Dec 2026 08:00 Israel.
NEXT_THURSDAY = datetime(2026, 12, 3, 6)


def test_a_friday_evening_order_for_sunday_morning_lapses_at_the_slot():
    # The bug: 24 active hours from inside Shabbat end Sunday 21:00 Israel.
    assert active_deadline(FRIDAY_EVENING, 24) == datetime(2026, 11, 29, 19)
    assert answer_deadline(FRIDAY_EVENING, 24, SUNDAY_MORNING) == SUNDAY_MORNING


def test_a_slot_far_ahead_keeps_the_full_answer_window():
    assert answer_deadline(FRIDAY_EVENING, 24, NEXT_THURSDAY) == active_deadline(
        FRIDAY_EVENING, 24
    )


def test_a_new_order_for_a_slot_within_a_day_lapses_by_its_slot(
    client, db, flag_on, sent
):
    # lead_time_hours=0: the second slot on the menu is an hour or two away,
    # well inside the 24-hour answer window.
    shop = Shop(db)
    assert send(client, shop, sent).status_code == 201
    order = db.query(ProductOrder).one()
    assert order.expires_at <= order.slot_start


def test_a_proposed_slot_sooner_than_a_day_bounds_the_buyers_answer(
    client, db, flag_on, sent
):
    shop = Shop(db)
    created = send(client, shop, sent, slot_start=slot_of(client, shop, nth=5)).json()
    sooner = slot_of(client, shop, nth=2)
    res = client.post(
        f"/producers/me/product-orders/{created['id']}/propose-change",
        json={"slot_start": sooner, "note": "אפשר מוקדם יותר"},
        headers=shop.headers,
    )
    assert res.status_code == 200, res.text
    db.expire_all()
    order = db.query(ProductOrder).one()
    assert order.proposed_slot_start is not None
    assert order.expires_at <= order.proposed_slot_start
