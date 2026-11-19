"""
Module:   test_meh3218_product_orders
Purpose:  Stage 1 of on-site ordering — the status rules, the settings routes
          and the database constraints that later stages build on.
Touches:  producer_order_settings / product_orders / product_order_items /
          product_order_events rows through the real routes and the real
          state service. No message is sent by anything here.
Does NOT: test creating an order through a route — there is none yet (the
          order rows below are inserted directly). Does NOT round-trip the
          revision; CI's `alembic upgrade head` + drift check cover its DDL
          and the PR body carries the local upgrade / downgrade / upgrade run.
Related:  backend/app/services/product_order_state.py (TRANSITIONS),
          backend/app/routers/product_orders.py,
          backend/alembic/versions/20261114_2130_d5a7c3e9f1b4_meh3218_product_orders.py
History:  MEH-3218 (creation)

THE EXPECTED MATRIX IS WRITTEN OUT HERE, NOT READ FROM THE SERVICE. A test that
asked `TRANSITIONS` what is allowed and then checked that the service allows it
would pass for any table at all. `ALLOWED` below is the decision as Sapir
approved it (MEH-3216), spelled a second time, and the test walks every
(from, to, actor) triple against it — so a move added to or dropped from the
service fails by name.
"""

import re
import uuid
from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import CheckConstraint
from sqlalchemy.exc import IntegrityError

from app.models.models import Product
from app.models.product_orders import (
    PRODUCT_ORDER_ACTORS,
    PRODUCT_ORDER_DEFAULT_CUTOFF_HOURS,
    PRODUCT_ORDER_FULFILMENTS,
    PRODUCT_ORDER_MAX_CUTOFF_HOURS,
    PRODUCT_ORDER_MAX_QTY_PER_ITEM,
    PRODUCT_ORDER_PAYMENT_STATUSES,
    PRODUCT_ORDER_STATUSES,
    PRODUCT_PRICE_UNITS,
    ProducerOrderSettings,
    ProductOrder,
    ProductOrderEvent,
    ProductOrderItem,
)
from app.routers import product_orders as orders_module
from app.services import product_order_state as state
from app.services.product_order_state import Actor, InvalidTransition
from app.utils.clock import utc_now
from tests.conftest import auth_header, make_producer, make_user

REVISION = (
    Path(__file__).resolve().parents[1]
    / "backend/alembic/versions/20261114_2130_d5a7c3e9f1b4_meh3218_product_orders.py"
)

B = ("business", "admin")
ALLOWED: dict[tuple[str, str], tuple[str, ...]] = {
    ("pending", "confirmed"): (*B, "system"),
    ("pending", "change_proposed"): B,
    ("pending", "declined"): B,
    ("pending", "cancelled"): ("customer", "system"),
    ("pending", "expired"): ("system",),
    ("change_proposed", "confirmed"): ("customer",),
    ("change_proposed", "cancelled"): ("customer", *B, "system"),
    ("change_proposed", "expired"): ("system",),
    ("confirmed", "ready"): B,
    ("confirmed", "handed"): B,
    ("confirmed", "cancelled"): ("customer", *B, "system"),
    ("confirmed", "no_show"): B,
    ("ready", "handed"): B,
    ("ready", "cancelled"): (*B, "system"),
    ("ready", "no_show"): B,
}
TERMINAL = ("handed", "declined", "cancelled", "expired", "no_show")


def valid_settings_payload() -> dict:
    return {
        "enabled": True,
        "auto_confirm": False,
        "auto_confirm_slot_cap": None,
        "cancel_cutoff_hours": 24,
        "shabbat_observant": False,
        "min_order_agorot": None,
        "slot_minutes": 60,
        "lead_time_hours": 24,
        "business_id_number": "512345678",
    }


@pytest.fixture
def flag_on(monkeypatch):
    monkeypatch.setattr(orders_module, "product_orders_enabled", lambda: True)


def _owner(db):
    producer = make_producer(db, name=f"מאפייה {uuid.uuid4().hex[:6]}")
    user = make_user(db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com")
    user.producer_id = producer.id
    user.is_producer = True
    db.commit()
    db.refresh(user)
    return user, producer


def _order(db, producer, *, status="pending", **overrides) -> ProductOrder:
    now = utc_now()
    fields = {
        "producer_id": producer.id,
        "customer_name": "דנה לוי",
        "customer_phone": "+972501234567",
        "fulfilment": "pickup",
        "slot_start": now + timedelta(days=1),
        "slot_end": now + timedelta(days=1, hours=2),
        "estimated_total_agorot": 8600,
        "status": status,
    }
    fields.update(overrides)
    order = ProductOrder(**fields)
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


# --------------------------------------------------------------------------
# The status rules
# --------------------------------------------------------------------------


def test_every_transition_triple_matches_the_approved_matrix(db):
    _, producer = _owner(db)
    ran = 0
    for from_status in PRODUCT_ORDER_STATUSES:
        for to_status in PRODUCT_ORDER_STATUSES:
            for actor in PRODUCT_ORDER_ACTORS:
                order = _order(db, producer, status=from_status)
                expected = actor in ALLOWED.get((from_status, to_status), ())
                try:
                    state.apply_transition(db, order, to_status, Actor(actor))
                    happened = True
                except InvalidTransition:
                    happened = False
                    db.rollback()
                triple = f"{from_status} -> {to_status} by {actor}"
                assert happened == expected, triple
                if happened:
                    db.commit()
                    db.refresh(order)
                    assert order.status == to_status, triple
                ran += 1
    assert ran == len(PRODUCT_ORDER_STATUSES) ** 2 * len(PRODUCT_ORDER_ACTORS)


def test_terminal_statuses_are_the_five_ends_and_nothing_leaves_them():
    assert sorted(state.TERMINAL_STATUSES) == sorted(TERMINAL)
    assert {s for (s, _t) in ALLOWED}.isdisjoint(TERMINAL)


def test_a_move_writes_one_event_row_with_who_and_from_where(db):
    owner, producer = _owner(db)
    order = _order(db, producer)
    state.apply_transition(
        db, order, "confirmed", Actor("business", owner.id), note="מאושר"
    )
    db.commit()

    events = db.query(ProductOrderEvent).filter_by(order_id=order.id).all()
    assert [(e.from_status, e.to_status, e.actor) for e in events] == [
        ("pending", "confirmed", "business")
    ]
    assert events[0].actor_user_id == owner.id
    assert events[0].note == "מאושר"
    db.refresh(order)
    assert order.confirmed_at is not None
    assert order.closed_at is None  # confirmed is not an end


def test_a_refused_move_changes_nothing_and_logs_nothing(db):
    _, producer = _owner(db)
    order = _order(db, producer, status="handed")
    with pytest.raises(InvalidTransition) as refused:
        state.apply_transition(db, order, "cancelled", Actor("business"))
    db.rollback()
    db.refresh(order)

    assert refused.value.forbidden is False
    assert order.status == "handed"
    assert db.query(ProductOrderEvent).filter_by(order_id=order.id).count() == 0


def test_a_move_that_exists_for_someone_else_is_marked_forbidden(db):
    """The buyer may not confirm her own pending order — that move is the
    business's. The route answers 403 for this and 409 for a move that does
    not exist, so the two must be told apart."""
    _, producer = _owner(db)
    order = _order(db, producer)
    with pytest.raises(InvalidTransition) as refused:
        state.apply_transition(db, order, "confirmed", Actor("customer"))
    assert refused.value.forbidden is True


def test_an_end_status_stamps_closed_at(db):
    _, producer = _owner(db)
    order = _order(db, producer, status="ready")
    state.apply_transition(db, order, "handed", Actor("business"))
    db.commit()
    db.refresh(order)
    assert order.handed_at is not None
    assert order.closed_at is not None


# --------------------------------------------------------------------------
# The database
# --------------------------------------------------------------------------


def test_revision_check_literals_match_the_model_tuples():
    source = REVISION.read_text(encoding="utf-8")

    def quoted(fragment: str) -> tuple[str, ...]:
        return tuple(re.findall(r"'([a-z0-9_]+)'", fragment))

    statuses = re.search(r"_STATUSES = \((.*?)\n\)", source, re.S)
    units = re.search(r'_UNITS = "(.*?)"', source)
    assert statuses and units
    assert quoted(statuses.group(1)) == PRODUCT_ORDER_STATUSES
    assert quoted(units.group(1)) == PRODUCT_PRICE_UNITS
    for values, needle in (
        (PRODUCT_ORDER_FULFILMENTS, "fulfilment IN ("),
        (PRODUCT_ORDER_PAYMENT_STATUSES, "payment_status IN ("),
        (PRODUCT_ORDER_ACTORS, "actor IN ("),
    ):
        start = source.index(needle) + len(needle)
        assert quoted(source[start : source.index(")", start)]) == values, needle

    # The numbers, which `alembic check` does not compare either.
    for literal in (
        f"cancel_cutoff_hours <= {PRODUCT_ORDER_MAX_CUTOFF_HOURS}",
        f"qty <= {PRODUCT_ORDER_MAX_QTY_PER_ITEM}",
        f'server_default=sa.text("{PRODUCT_ORDER_DEFAULT_CUTOFF_HOURS}")',
    ):
        assert literal in source, literal


def test_the_products_model_check_lists_the_same_price_units():
    """models.py spells the units a third time (it cannot import the tuple
    without a cycle); this keeps that copy equal to the tuple."""
    checks = {
        c.name: str(c.sqltext)
        for c in Product.__table__.constraints
        if isinstance(c, CheckConstraint)
    }
    found = tuple(re.findall(r"'([a-z0-9]+)'", checks["products_price_unit_check"]))
    assert found == PRODUCT_PRICE_UNITS


def test_an_order_is_born_pending_or_not_logged_at_all(db):
    _, producer = _owner(db)
    born = _order(db, producer)
    state.record_created(db, born, Actor("customer"))
    db.commit()
    first = db.query(ProductOrderEvent).filter_by(order_id=born.id).one()
    assert (first.from_status, first.to_status) == (None, "pending")

    smuggled = _order(db, producer, status="handed")
    with pytest.raises(InvalidTransition):
        state.record_created(db, smuggled, Actor("customer"))
    assert db.query(ProductOrderEvent).filter_by(order_id=smuggled.id).count() == 0


def test_an_order_cannot_be_marked_paid(db):
    """Customer money does not pass through the site (ADR-042 §5). The one
    payment status is «directly to the business»; anything else is refused by
    the database, not only by the code."""
    _, producer = _owner(db)
    with pytest.raises(IntegrityError):
        _order(db, producer, payment_status="paid")
    db.rollback()


def test_deleting_a_product_keeps_the_order_line_and_nulls_its_product_id(db):
    """What this proves is the foreign key: the line and the values stored on
    it outlive the product. The COPY from product to line is made by the order
    route, which does not exist yet — its test arrives with it."""
    _, producer = _owner(db)
    product = Product(producer_id=producer.id, name="חלה", price_min=28, price_max=28)
    db.add(product)
    db.commit()
    order = _order(db, producer)
    db.add(
        ProductOrderItem(
            order_id=order.id,
            product_id=product.id,
            name="חלה",
            unit_price_agorot=2800,
            qty=2,
        )
    )
    db.commit()

    product.name = "חלה מתוקה"
    product.price_min = product.price_max = 35
    db.commit()
    db.delete(product)
    db.commit()

    line = db.query(ProductOrderItem).filter_by(order_id=order.id).one()
    assert (line.name, line.unit_price_agorot, line.qty) == ("חלה", 2800, 2)
    assert line.product_id is None


def test_an_existing_product_is_orderable_in_stock_and_not_alcohol_by_default(db):
    _, producer = _owner(db)
    product = Product(producer_id=producer.id, name="לחם")
    db.add(product)
    db.commit()
    db.refresh(product)
    assert (
        product.price_unit,
        product.is_orderable,
        product.in_stock,
        product.contains_alcohol,
    ) == ("unit", True, True, False)


# --------------------------------------------------------------------------
# The settings routes
# --------------------------------------------------------------------------


def test_flag_default_is_off_and_every_route_is_404(client, db):
    owner, producer = _owner(db)
    admin = make_user(db, role="admin")

    assert orders_module.product_orders_enabled() is False
    calls = [
        client.get("/producers/me/order-settings", headers=auth_header(owner)),
        client.put(
            "/producers/me/order-settings",
            json=valid_settings_payload(),
            headers=auth_header(owner),
        ),
        client.put(
            f"/admin/producers/{producer.id}/order-settings/alcohol",
            json={"alcohol_licensed": True},
            headers=auth_header(admin),
        ),
    ]
    assert [r.status_code for r in calls] == [404, 404, 404]
    assert db.query(ProducerOrderSettings).count() == 0


def test_a_business_that_never_saved_has_ordering_off(client, db, flag_on):
    owner, producer = _owner(db)
    res = client.get("/producers/me/order-settings", headers=auth_header(owner))
    assert res.status_code == 200
    assert res.json() == {
        "producer_id": str(producer.id),
        "enabled": False,
        "auto_confirm": False,
        "auto_confirm_slot_cap": None,
        "cancel_cutoff_hours": 24,
        "shabbat_observant": False,
        "min_order_agorot": None,
        "slot_minutes": 60,
        "lead_time_hours": 24,
        "alcohol_licensed": False,
        "business_id_number": None,
    }


def test_owner_saves_settings_and_reads_them_back(client, db, flag_on):
    owner, _ = _owner(db)
    body = valid_settings_payload() | {
        "auto_confirm": True,
        "auto_confirm_slot_cap": 5,
        "cancel_cutoff_hours": 48,
        "shabbat_observant": True,
        "min_order_agorot": 5000,
    }
    saved = client.put(
        "/producers/me/order-settings", json=body, headers=auth_header(owner)
    )
    assert saved.status_code == 200
    read = client.get("/producers/me/order-settings", headers=auth_header(owner)).json()
    assert {k: read[k] for k in body} == body
    assert read["alcohol_licensed"] is False


def test_saving_touches_only_the_callers_own_business(client, db, flag_on):
    owner_a, producer_a = _owner(db)
    _owner_b, producer_b = _owner(db)
    client.put(
        "/producers/me/order-settings",
        json=valid_settings_payload(),
        headers=auth_header(owner_a),
    )

    rows = {r.producer_id: r.enabled for r in db.query(ProducerOrderSettings).all()}
    assert rows == {producer_a.id: True}
    assert producer_b.id not in rows


def test_settings_need_a_logged_in_business_owner(client, db, flag_on):
    consumer = make_user(db)
    anonymous = client.put(
        "/producers/me/order-settings", json=valid_settings_payload()
    )
    as_consumer = client.put(
        "/producers/me/order-settings",
        json=valid_settings_payload(),
        headers=auth_header(consumer),
    )
    assert anonymous.status_code == 401
    assert as_consumer.status_code == 403
    assert client.get("/producers/me/order-settings").status_code == 401
    read_as_consumer = client.get(
        "/producers/me/order-settings", headers=auth_header(consumer)
    )
    assert read_as_consumer.status_code == 403
    assert db.query(ProducerOrderSettings).count() == 0


def test_owner_cannot_grant_herself_the_alcohol_licence(client, db, flag_on):
    owner, producer = _owner(db)
    res = client.put(
        "/producers/me/order-settings",
        json=valid_settings_payload() | {"alcohol_licensed": True},
        headers=auth_header(owner),
    )
    assert res.status_code == 422
    assert db.query(ProducerOrderSettings).count() == 0

    refused = client.put(
        f"/admin/producers/{producer.id}/order-settings/alcohol",
        json={"alcohol_licensed": True},
        headers=auth_header(owner),
    )
    assert refused.status_code == 403
    assert db.query(ProducerOrderSettings).count() == 0


def test_admin_licence_survives_the_owners_next_save_and_does_not_enable(
    client, db, flag_on
):
    owner, producer = _owner(db)
    admin = make_user(db, role="admin")
    marked = client.put(
        f"/admin/producers/{producer.id}/order-settings/alcohol",
        json={"alcohol_licensed": True},
        headers=auth_header(admin),
    )
    assert marked.status_code == 200
    assert marked.json()["alcohol_licensed"] is True
    assert marked.json()["enabled"] is False  # the mark is not the switch

    client.put(
        "/producers/me/order-settings",
        json=valid_settings_payload(),
        headers=auth_header(owner),
    )
    read = client.get("/producers/me/order-settings", headers=auth_header(owner)).json()
    assert (read["enabled"], read["alcohol_licensed"]) == (True, True)


def test_admin_licence_for_a_business_that_does_not_exist_is_404(client, db, flag_on):
    admin = make_user(db, role="admin")
    res = client.put(
        f"/admin/producers/{uuid.uuid4()}/order-settings/alcohol",
        json={"alcohol_licensed": True},
        headers=auth_header(admin),
    )
    assert res.status_code == 404
    assert db.query(ProducerOrderSettings).count() == 0


def test_the_alcohol_route_refuses_everyone_but_an_admin(client, db, flag_on):
    _, producer = _owner(db)
    consumer = make_user(db)
    url = f"/admin/producers/{producer.id}/order-settings/alcohol"
    anonymous = client.put(url, json={"alcohol_licensed": True})
    as_consumer = client.put(
        url, json={"alcohol_licensed": True}, headers=auth_header(consumer)
    )
    assert (anonymous.status_code, as_consumer.status_code) == (401, 403)
    assert db.query(ProducerOrderSettings).count() == 0


def test_a_business_account_with_no_business_gets_404_not_a_row(client, db, flag_on):
    orphan = make_user(db, role="producer")
    res = client.put(
        "/producers/me/order-settings",
        json=valid_settings_payload(),
        headers=auth_header(orphan),
    )
    assert res.status_code == 404
    assert db.query(ProducerOrderSettings).count() == 0


def test_omitting_a_field_is_refused_instead_of_clearing_it(client, db, flag_on):
    owner, _ = _owner(db)
    client.put(
        "/producers/me/order-settings",
        json=valid_settings_payload() | {"min_order_agorot": 5000},
        headers=auth_header(owner),
    )
    partial = valid_settings_payload()
    del partial["min_order_agorot"]
    res = client.put(
        "/producers/me/order-settings", json=partial, headers=auth_header(owner)
    )
    assert res.status_code == 422
    assert db.query(ProducerOrderSettings).one().min_order_agorot == 5000


def test_a_first_save_that_loses_the_race_writes_onto_the_winners_row(db):
    """The loser of two first saves must land on the existing row, not raise."""
    _, producer = _owner(db)
    db.add(ProducerOrderSettings(producer_id=producer.id, alcohol_licensed=True))
    db.commit()
    real = orders_module._settings_row
    # Simulate the race: the first read answers "no row" although one exists.
    calls = {"n": 0}

    def racing(session, producer_id):
        calls["n"] += 1
        return None if calls["n"] == 1 else real(session, producer_id)

    orders_module._settings_row = racing
    try:
        row = orders_module._settings_row_for_write(db, producer.id)
    finally:
        orders_module._settings_row = real
    assert row.alcohol_licensed is True
    assert db.query(ProducerOrderSettings).count() == 1


def test_auto_confirm_without_a_slot_cap_is_refused_in_hebrew(client, db, flag_on):
    owner, _ = _owner(db)
    res = client.put(
        "/producers/me/order-settings",
        json=valid_settings_payload() | {"auto_confirm": True},
        headers=auth_header(owner),
    )
    assert res.status_code == 422
    assert "לכל מועד" in res.text
    assert db.query(ProducerOrderSettings).count() == 0
