"""MEH-3976: the reason a business gives when it declines or cancels reaches
the buyer's order page.

The decline dialog asks for «הסיבה, כפי שהלקוח יראה אותה» and the cancel
dialog for «הסבר ללקוח», but the note was kept only in the event log: the
buyer read a bare «לא יכול למלא» or «בוטלה».
"""

import pytest

from _test_meh3263_order_route__common import Shop  # noqa: F401
from _test_meh3263_order_route__common import flag_on  # noqa: F401
from _test_meh3263_order_route__common import stored_order
from app.models.product_orders import ProductOrderEvent
from app.services import product_order_actions as actions
from app.services import product_order_create as create_module
from app.services.product_order_state import SYSTEM, Actor

TOKEN = "n" * 43
BUSINESS = Actor("business")
CUSTOMER = Actor("customer")


def _order(db, status="pending"):
    shop = Shop(db)
    order = stored_order(
        db, shop, status, status_token_hash=create_module.token_hash(TOKEN)
    )
    return order


def _note(client) -> str | None:
    res = client.post("/product-orders/status", json={"token": TOKEN})
    assert res.status_code == 200, res.text
    return res.json()["business_note"]


def test_a_decline_reason_reaches_the_buyer(client, db, flag_on):  # noqa: F811
    order = _order(db)
    actions.business_simple_move(db, order.id, BUSINESS, "declined", "אזל המלאי")
    db.commit()
    assert _note(client) == "אזל המלאי"


def test_a_cancel_note_reaches_the_buyer(client, db, flag_on):  # noqa: F811
    order = _order(db, "confirmed")
    actions.business_simple_move(
        db, order.id, BUSINESS, "cancelled", "התנור התקלקל, מצטערים"
    )
    db.commit()
    assert _note(client) == "התנור התקלקל, מצטערים"


def test_a_cancel_with_no_note_has_none(client, db, flag_on):  # noqa: F811
    order = _order(db, "confirmed")
    actions.business_simple_move(db, order.id, BUSINESS, "cancelled", None)
    db.commit()
    assert _note(client) is None


def test_the_buyers_own_cancel_shows_no_note(client, db, flag_on):  # noqa: F811
    order = _order(db)
    actions.buyer_cancel(db, order.id, CUSTOMER)
    db.commit()
    assert _note(client) is None


def test_a_system_close_note_is_not_shown(client, db, flag_on):  # noqa: F811
    # The system's notes are internal wording, not a message to the buyer.
    order = _order(db)
    from app.services.product_order_state import apply_transition

    apply_transition(db, order, "cancelled", SYSTEM, "internal: business delisted")
    db.commit()
    assert _note(client) is None


def test_a_blank_note_is_none(client, db, flag_on):  # noqa: F811
    order = _order(db, "confirmed")
    actions.business_simple_move(db, order.id, BUSINESS, "cancelled", "   ")
    db.commit()
    assert _note(client) is None


def test_an_admin_acting_for_the_business_is_shown(client, db, flag_on):  # noqa: F811
    # The admin override uses the same dialog, which tells her the buyer
    # sees the reason.
    order = _order(db)
    actions.business_simple_move(db, order.id, Actor("admin"), "declined", "סגור לחג")
    db.commit()
    assert _note(client) == "סגור לחג"


@pytest.mark.parametrize("status", ["confirmed", "change_proposed"])
def test_an_open_order_shows_no_note_even_with_one_logged(
    client, db, flag_on, status  # noqa: F811
):
    order = _order(db, status)
    db.add(
        ProductOrderEvent(
            order_id=order.id,
            from_status="pending",
            to_status=status,
            actor="business",
            note="רק להחלפה במועד",
        )
    )
    db.commit()
    assert _note(client) is None
