"""
Module:   test_meh3225_rescue_verified_email
Purpose:  MEH-3225 (D5 of the 14/11 grill retro) — reserving a rescue bag
          needs a verified email: the pickup code and the no-show mails go
          there. Same 403 as every other verified-email gate, no new copy.
Related:  backend/app/routers/rescue.py::create_order · auth.py
          require_verified_email
History:  MEH-3225 (creation)
"""

from app.models.models import RescueOffer, RescueOrder
from tests.conftest import auth_header, make_user
from tests.test_rescue import _seed_offer, rescue_on, shop  # noqa: F401


def _reserve(client, offer, user):
    return client.post(
        "/rescue/orders",
        json={"offer_id": str(offer.id), "qty": 1},
        headers=auth_header(user),
    )


def test_an_unverified_buyer_gets_the_verified_email_403(client, db, shop, rescue_on):
    buyer = make_user(db, email="new@example.com", email_verified=False)
    offer = _seed_offer(db, shop["location"], qty_total=2)
    r = _reserve(client, offer, buyer)
    assert r.status_code == 403
    assert r.json()["detail"] == {
        "code": "email_unverified",
        "message": "יש לאמת את כתובת האימייל תחילה",
    }
    db.expire_all()
    assert db.query(RescueOrder).count() == 0
    assert db.get(RescueOffer, offer.id).qty_left == 2


def test_a_verified_buyer_still_reserves(client, db, shop, rescue_on):
    buyer = make_user(db, email="ok@example.com", email_verified=True)
    offer = _seed_offer(db, shop["location"], qty_total=2)
    assert _reserve(client, offer, buyer).status_code == 201
