"""MEH-3180 — billing state per business and the paid-tool gate (switched off).

Two things must hold together:
  1. While billing is off (the shipped state) no state closes anything.
  2. Once it is on, `page_only` and `unpaid` cannot open NEW paid bookings on
     any of the routes listed in capabilities.PAID_TOOL_ROUTES, and the other
     states can.
"""

# ruff: noqa: F811 — `shop` / `rescue_on` are fixtures imported from test_rescue
import importlib
import inspect
from datetime import timedelta

import pytest

from app import pricing
from app.models.billing import BILLING_STATES, BusinessBilling
from app.services import capabilities
from app.utils.clock import israel_today
from conftest import auth_header
from test_experiences import _payload as _experience_payload
from test_group_buys_api import _producer_user, _valid_create_payload
from test_meh2763_registrations import _event, _event_payload, _experience, _owner
from test_rescue import _offer_payload, rescue_on, shop  # noqa: F401 — fixtures

CLOSED = sorted(capabilities.CLOSED_STATES)
OPEN = sorted(set(BILLING_STATES) - capabilities.CLOSED_STATES)


@pytest.fixture
def billing_on(monkeypatch):
    monkeypatch.setattr(pricing, "BILLING_PHASE", "billing")


def _set_state(db, producer, state):
    row = db.get(BusinessBilling, producer.id)
    if row is None:
        db.add(BusinessBilling(producer_id=producer.id, state=state))
    else:
        row.state = state
    db.commit()


def _producer_of(db, user):
    from app.models.models import Producer

    return db.query(Producer).filter(Producer.id == user.producer_id).first()


# ---------- the authority itself ----------


def test_the_shipped_switch_is_off():
    assert pricing.BILLING_PHASE == "launch"
    assert pricing.billing_is_on() is False


def test_the_switch_stays_off_while_a_known_hole_is_open():
    """A listed blocker is a way to pay less than was earned once billing
    runs; the phase cannot move while one is listed."""
    assert not pricing.SWITCH_ON_BLOCKERS or pricing.BILLING_PHASE == "launch"


def test_every_state_has_an_answer_and_closed_states_are_real_states():
    assert capabilities.CLOSED_STATES < set(BILLING_STATES)
    assert capabilities.LAUNCH_STATE in BILLING_STATES
    assert set(capabilities.PAID_TOOL_ROUTES) == set(capabilities.PAID_TOOLS)


@pytest.mark.parametrize("state", [None, *BILLING_STATES])
def test_while_billing_is_off_every_state_is_open(state):
    assert capabilities.paid_tools_open(state) is True


@pytest.mark.parametrize(
    ("state", "is_open"),
    [(None, True)] + [(s, True) for s in OPEN] + [(s, False) for s in CLOSED],
)
def test_the_state_matrix_once_billing_is_on(billing_on, state, is_open):
    assert capabilities.paid_tools_open(state) is is_open


def test_a_business_with_no_row_is_in_the_launch_state(db):
    from conftest import make_producer

    producer = make_producer(db, name="בלי שורה")
    assert capabilities.billing_state(db, producer.id) == "launch"
    _set_state(db, producer, "notice")
    assert capabilities.billing_state(db, producer.id) == "notice"


def test_an_unknown_state_is_an_error_not_a_silent_open(billing_on):
    with pytest.raises(ValueError, match="unknown billing state"):
        capabilities.paid_tools_open("gold")


def test_a_host_with_no_business_is_never_closed(billing_on, db):
    capabilities.require_paid_tool(db, None, "paid_signup")  # does not raise


def test_an_unknown_tool_is_an_error(db):
    with pytest.raises(ValueError, match="unknown paid tool"):
        capabilities.require_paid_tool(db, None, "delivery")


@pytest.mark.parametrize(
    ("price", "method", "paid"),
    [
        (100, "site_form", True),
        (0, "site_form", False),
        (None, "site_form", False),
        (100, "whatsapp", False),
        (100, "external_url", False),
    ],
)
def test_only_a_priced_site_form_signup_is_a_paid_tool(price, method, paid):
    assert capabilities.is_paid_site_signup(price, method) is paid


# ---------- every listed route asks the authority ----------


@pytest.mark.parametrize(
    ("tool", "target"),
    [(t, r) for t, routes in capabilities.PAID_TOOL_ROUTES.items() for r in routes],
)
def test_each_listed_route_asks_about_its_own_tool(tool, target):
    module_name, func_name = target.split(":")
    func = getattr(importlib.import_module(module_name), func_name)
    source = inspect.getsource(func)
    assert capabilities.PAID_TOOL_CALLS[tool] in source, target


# ---------- behaviour, route by route ----------


def _post_group_buy(client, db, state):
    producer, user = _producer_user(db, email=f"gb-{state}@example.com")
    user.email_verified = True
    _set_state(db, producer, state)
    return client.post(
        "/group-buys", json=_valid_create_payload(), headers=auth_header(user)
    )


def _post_paid_event(client, db, state):
    owner = _owner(db, email=f"ev-{state}@example.com")
    _set_state(db, _producer_of(db, owner), state)
    return client.post(
        "/events", json=_event_payload(price=120), headers=auth_header(owner)
    )


def _make_free_event_paid(client, db, state):
    owner = _owner(db, email=f"evu-{state}@example.com")
    ev = _event(db, owner)
    _set_state(db, _producer_of(db, owner), state)
    return client.put(
        f"/events/{ev.id}", json={"price": 120}, headers=auth_header(owner)
    )


def _post_paid_experience(client, db, state):
    owner = _owner(db, email=f"ex-{state}@example.com")
    _set_state(db, _producer_of(db, owner), state)
    return client.post(
        "/experiences",
        json=_experience_payload(registration_method="site_form"),
        headers=auth_header(owner),
    )


def _make_free_experience_paid(client, db, state):
    owner = _owner(db, email=f"exu-{state}@example.com")
    ex = _experience(db, owner)
    _set_state(db, _producer_of(db, owner), state)
    return client.put(
        f"/experiences/{ex.id}",
        json={"price_per_person": 150},
        headers=auth_header(owner),
    )


def _reactivate_cancelled_paid_event(client, db, state):
    owner = _owner(db, email=f"evr-{state}@example.com")
    ev = _event(db, owner, price=120, is_active=False)
    _set_state(db, _producer_of(db, owner), state)
    return client.put(
        f"/events/{ev.id}", json={"is_active": True}, headers=auth_header(owner)
    )


def _move_past_paid_event_forward(client, db, state):
    owner = _owner(db, email=f"evd-{state}@example.com")
    ev = _event(db, owner, price=120, event_date=israel_today() - timedelta(days=3))
    _set_state(db, _producer_of(db, owner), state)
    return client.put(
        f"/events/{ev.id}",
        json={"event_date": (israel_today() + timedelta(days=5)).isoformat()},
        headers=auth_header(owner),
    )


def _make_whatsapp_event_a_paid_site_signup(client, db, state):
    """Price and method change together in one PUT."""
    owner = _owner(db, email=f"evm-{state}@example.com")
    ev = _event(db, owner, registration_method="whatsapp")
    _set_state(db, _producer_of(db, owner), state)
    return client.put(
        f"/events/{ev.id}",
        json={"price": 120, "registration_method": "site_form"},
        headers=auth_header(owner),
    )


def _reactivate_cancelled_paid_experience(client, db, state):
    owner = _owner(db, email=f"exr-{state}@example.com")
    ex = _experience(db, owner, price_per_person=150)
    ex.is_active = False
    db.commit()
    _set_state(db, _producer_of(db, owner), state)
    return client.put(
        f"/experiences/{ex.id}", json={"is_active": True}, headers=auth_header(owner)
    )


ROUTE_CALLS = [
    _reactivate_cancelled_paid_event,
    _move_past_paid_event_forward,
    _make_whatsapp_event_a_paid_site_signup,
    _reactivate_cancelled_paid_experience,
    _post_group_buy,
    _post_paid_event,
    _make_free_event_paid,
    _post_paid_experience,
    _make_free_experience_paid,
]


@pytest.mark.parametrize("call", ROUTE_CALLS)
@pytest.mark.parametrize("state", CLOSED)
def test_a_closed_state_cannot_open_a_new_paid_booking(
    client, db, billing_on, call, state
):
    r = call(client, db, state)
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == capabilities.PAID_TOOL_CLOSED_DETAIL


@pytest.mark.parametrize("call", ROUTE_CALLS)
@pytest.mark.parametrize("state", OPEN)
def test_an_open_state_goes_through_once_billing_is_on(
    client, db, billing_on, call, state
):
    r = call(client, db, state)
    assert r.status_code in (200, 201), r.text


@pytest.mark.parametrize("call", ROUTE_CALLS)
@pytest.mark.parametrize("state", CLOSED)
def test_while_billing_is_off_a_closed_state_still_goes_through(
    client, db, call, state
):
    """The shipped behaviour: the columns exist and close nothing."""
    r = call(client, db, state)
    assert r.status_code in (200, 201), r.text


class TestRescueBags:
    def _publish(self, client, shop):
        return client.post(
            "/rescue/offers",
            json=_offer_payload(shop["location"]),
            headers=auth_header(shop["owner"]),
        )

    @pytest.mark.parametrize("state", CLOSED)
    def test_closed_state_cannot_publish_a_bag(
        self,
        client,
        db,
        shop,
        rescue_on,
        billing_on,
        state,  # noqa: F811
    ):
        _set_state(db, shop["producer"], state)
        r = self._publish(client, shop)
        assert r.status_code == 403, r.text
        assert r.json()["detail"] == capabilities.PAID_TOOL_CLOSED_DETAIL

    @pytest.mark.parametrize("state", CLOSED)
    def test_while_billing_is_off_the_bag_is_published(
        self,
        client,
        db,
        shop,
        rescue_on,
        state,  # noqa: F811
    ):
        _set_state(db, shop["producer"], state)
        assert self._publish(client, shop).status_code == 201


class TestWhatIsNeverClosed:
    def test_a_free_event_and_a_whatsapp_event_stay_open(self, client, db, billing_on):
        owner = _owner(db, email="free@example.com")
        _set_state(db, _producer_of(db, owner), "page_only")
        free = client.post("/events", json=_event_payload(), headers=auth_header(owner))
        assert free.status_code == 201, free.text
        by_whatsapp = client.post(
            "/events",
            json=_event_payload(price=120, registration_method="whatsapp"),
            headers=auth_header(owner),
        )
        assert by_whatsapp.status_code == 201, by_whatsapp.text

    def test_a_running_paid_event_can_still_be_cancelled(self, client, db, billing_on):
        owner = _owner(db, email="cancel@example.com")
        ev = _event(db, owner, price=120)
        _set_state(db, _producer_of(db, owner), "page_only")
        r = client.put(
            f"/events/{ev.id}", json={"is_active": False}, headers=auth_header(owner)
        )
        assert r.status_code == 200, r.text

    def test_a_cancelled_paid_event_can_be_edited_while_it_stays_cancelled(
        self, client, db, billing_on
    ):
        owner = _owner(db, email="stays-cancelled@example.com")
        ev = _event(db, owner, price=120, is_active=False)
        _set_state(db, _producer_of(db, owner), "unpaid")
        r = client.put(
            f"/events/{ev.id}", json={"title": "שם חדש"}, headers=auth_header(owner)
        )
        assert r.status_code == 200, r.text

    def test_a_paid_event_with_no_method_in_the_payload_is_a_site_signup(
        self, client, db, billing_on
    ):
        """The create schema defaults the method to the site form, so leaving
        it out is not a way around the gate."""
        owner = _owner(db, email="no-method@example.com")
        _set_state(db, _producer_of(db, owner), "page_only")
        payload = _event_payload(price=120)
        assert "registration_method" not in payload
        r = client.post("/events", json=payload, headers=auth_header(owner))
        assert r.status_code == 403, r.text

    def test_an_existing_paid_event_can_still_be_edited(self, client, db, billing_on):
        """What exists carries on: only a NEW paid booking is closed."""
        owner = _owner(db, email="edit@example.com")
        ev = _event(db, owner, price=120)
        _set_state(db, _producer_of(db, owner), "unpaid")
        r = client.put(
            f"/events/{ev.id}",
            json={"title": "שם חדש", "max_participants": 30},
            headers=auth_header(owner),
        )
        assert r.status_code == 200, r.text

    @pytest.mark.parametrize(
        "change",
        [
            lambda ev: {"event_date": (ev.event_date + timedelta(days=30)).isoformat()},
            lambda ev: {"price": float(ev.price) + 50},
        ],
        ids=["a-later-date", "a-higher-price"],
    )
    def test_an_open_paid_event_cannot_be_recycled_into_new_bookings(
        self, client, db, billing_on, change
    ):
        """One running paid event must not serve as an endless supply of new
        paid bookings for a business whose paid tools are closed."""
        owner = _owner(db, email="recycle@example.com")
        ev = _event(db, owner, price=120)
        _set_state(db, _producer_of(db, owner), "page_only")
        r = client.put(f"/events/{ev.id}", json=change(ev), headers=auth_header(owner))
        assert r.status_code == 403, r.text

    def test_an_earlier_date_and_a_lower_price_are_ordinary_edits(
        self, client, db, billing_on
    ):
        owner = _owner(db, email="ordinary@example.com")
        ev = _event(db, owner, price=120)
        _set_state(db, _producer_of(db, owner), "page_only")
        sooner = max(israel_today(), ev.event_date - timedelta(days=1))
        r = client.put(
            f"/events/{ev.id}",
            json={"event_date": sooner.isoformat(), "price": 90},
            headers=auth_header(owner),
        )
        assert r.status_code == 200, r.text


def test_the_database_refuses_a_state_outside_the_list(db):
    from sqlalchemy.exc import IntegrityError

    from conftest import make_producer

    producer = make_producer(db, name="מצב לא קיים")
    db.add(BusinessBilling(producer_id=producer.id, state="gold"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_deleting_a_business_removes_its_state_row(db):
    from conftest import make_producer

    producer = make_producer(db, name="נמחק")
    _set_state(db, producer, "active")
    db.delete(producer)
    db.commit()
    assert db.query(BusinessBilling).count() == 0


def test_a_tool_with_no_route_yet_is_still_a_known_tool(db):
    """`product_orders` (MEH-3216) is listed before its route exists."""
    assert capabilities.PAID_TOOL_ROUTES["product_orders"] == ()
    capabilities.require_paid_tool(db, None, "product_orders")  # does not raise
