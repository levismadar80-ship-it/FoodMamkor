"""MEH-3746 — the owner's preview of her own order menu.

The public menu 404s until ordering is switched on with a business number, so
an owner could not see what her settings do to the order form. The preview
route answers her with the same body a buyer would get, from her own business
only, and writes nothing.
"""

import uuid
from datetime import datetime, time

import pytest

from app.models.models import Product
from app.models.product_orders import ProducerOrderSettings, ProducerOrderWindow
from app.routers import product_order_offer as offer_module
from app.routers import product_orders as orders_module
from tests.conftest import auth_header, make_producer, make_user

MON = 1  # 0 = Sunday, as in producers.order_window
PREVIEW = "/producers/me/order-menu/preview"
# Sunday 15/11/2026 10:00 Israel (UTC+2): Monday's window is ahead.
NOW = datetime(2026, 11, 15, 8, 0)


@pytest.fixture
def flag_on(monkeypatch):
    monkeypatch.setattr(orders_module, "product_orders_enabled", lambda: True)
    monkeypatch.setattr(offer_module, "utc_now", lambda: NOW)


def _owner(db, product="חלה"):
    producer = make_producer(db, name=f"מאפייה {uuid.uuid4().hex[:6]}")
    user = make_user(db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com")
    user.producer_id = producer.id
    user.is_producer = True
    db.add_all(
        [
            Product(producer_id=producer.id, name=product, price_min=28, price_max=28),
            ProducerOrderWindow(
                producer_id=producer.id,
                weekday=MON,
                start_time=time(10),
                end_time=time(12),
                fulfilment="pickup",
            ),
        ]
    )
    db.commit()
    db.refresh(user)
    return user, producer


def test_ordering_off_the_buyer_gets_404_and_the_owner_sees_the_form(client, db, flag_on):
    owner, producer = _owner(db)
    # Saved, but not switched on and no business number: the public menu is closed.
    db.add(ProducerOrderSettings(producer_id=producer.id, enabled=False, lead_time_hours=0))
    db.commit()
    assert client.get(f"/producers/{producer.id}/order-menu").status_code == 404

    res = client.get(PREVIEW, headers=auth_header(owner))
    assert res.status_code == 200
    menu = res.json()
    assert menu["producer_id"] == str(producer.id)
    assert [p["name"] for p in menu["products"]] == ["חלה"]
    assert [s["start"] for s in menu["slots"]][:2] == [
        "2026-11-16T08:00:00Z",
        "2026-11-16T09:00:00Z",
    ]


def test_the_preview_honours_her_lead_time(client, db, flag_on):
    """What «כמה זמן מראש» does is the whole point: 48 h from Sunday 10:00
    leaves no Monday slot, and the next is a week later."""
    owner, producer = _owner(db)
    db.add(ProducerOrderSettings(producer_id=producer.id, lead_time_hours=48))
    db.commit()
    menu = client.get(PREVIEW, headers=auth_header(owner)).json()
    assert menu["lead_time_hours"] == 48
    days = sorted({s["start"][:10] for s in menu["slots"]})
    assert days and days[0] == "2026-11-23"


def test_settings_never_saved_get_the_defaults_and_nothing_is_written(client, db, flag_on):
    owner, producer = _owner(db)
    res = client.get(PREVIEW, headers=auth_header(owner))
    assert res.status_code == 200
    defaults = orders_module._defaults(producer.id)
    assert res.json()["cancel_cutoff_hours"] == defaults["cancel_cutoff_hours"]
    assert res.json()["lead_time_hours"] == defaults["lead_time_hours"]
    assert db.query(ProducerOrderSettings).count() == 0


def test_the_body_is_the_buyer_body_once_ordering_is_on(client, db, flag_on):
    owner, producer = _owner(db)
    db.add(
        ProducerOrderSettings(
            producer_id=producer.id,
            enabled=True,
            business_id_number="512345678",
            lead_time_hours=0,
        )
    )
    db.commit()
    public = client.get(f"/producers/{producer.id}/order-menu")
    preview = client.get(PREVIEW, headers=auth_header(owner))
    assert public.status_code == preview.status_code == 200
    assert preview.json() == public.json()


def test_a_guest_gets_401(client, db, flag_on):
    _owner(db)
    assert client.get(PREVIEW).status_code == 401


@pytest.mark.parametrize("role", ["consumer", "admin"])
def test_a_user_who_is_not_a_business_owner_gets_403(client, db, flag_on, role):
    user = make_user(db, role=role, email=f"c{uuid.uuid4().hex[:8]}@example.com")
    assert client.get(PREVIEW, headers=auth_header(user)).status_code == 403


def test_a_producer_account_with_no_business_gets_404(client, db, flag_on):
    user = make_user(db, role="producer", email=f"n{uuid.uuid4().hex[:8]}@example.com")
    assert client.get(PREVIEW, headers=auth_header(user)).status_code == 404


def test_another_owner_sees_only_her_own_business(client, db, flag_on):
    _, first = _owner(db, product="עוגת גבינה")
    other, second = _owner(db, product="לחם שיפון")
    menu = client.get(PREVIEW, headers=auth_header(other)).json()
    assert menu["producer_id"] == str(second.id) != str(first.id)
    names = [p["name"] for p in menu["products"]]
    assert names == ["לחם שיפון"]


def test_the_route_is_closed_while_the_feature_flag_is_off(client, db, monkeypatch):
    owner, _ = _owner(db)
    monkeypatch.setattr(orders_module, "product_orders_enabled", lambda: False)
    assert client.get(PREVIEW, headers=auth_header(owner)).status_code == 404
