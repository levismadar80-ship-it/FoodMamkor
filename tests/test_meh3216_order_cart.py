"""MEH-3216 stage 5b — the business page learns whether it can take an order.

The page reads `takes_site_orders` off the business it already loads, and only
then asks for the order menu. Without it, every business page would ask for a
menu that 404s for almost every business, one more read per page view against
a per-IP limit the whole E2E suite shares.
"""

import uuid

import pytest

from app.config import settings
from app.models.product_orders import ProducerOrderSettings
from tests.conftest import make_producer


@pytest.fixture
def flag_on(monkeypatch):
    monkeypatch.setattr(settings, "product_orders_enabled", True, raising=False)


@pytest.fixture
def flag_off(monkeypatch):
    monkeypatch.setattr(settings, "product_orders_enabled", False, raising=False)


def _business(
    db, *, enabled: bool | None, business_id_number: str | None = "512345678"
):
    producer = make_producer(db, name=f"מאפייה {uuid.uuid4().hex[:6]}")
    producer.slug = f"bakery-{uuid.uuid4().hex[:8]}"
    if enabled is not None:
        db.add(
            ProducerOrderSettings(
                producer_id=producer.id,
                enabled=enabled,
                business_id_number=business_id_number,
            )
        )
    db.commit()
    return producer


def _both_reads(client, producer) -> tuple[bool, bool]:
    by_id = client.get(f"/producers/{producer.id}")
    by_slug = client.get(f"/producers/by-slug/{producer.slug}")
    assert (by_id.status_code, by_slug.status_code) == (200, 200)
    return by_id.json()["takes_site_orders"], by_slug.json()["takes_site_orders"]


def test_a_business_taking_orders_says_so_on_both_reads(client, db, flag_on):
    producer = _business(db, enabled=True)
    assert _both_reads(client, producer) == (True, True)


def test_switched_on_without_a_business_id_number_reads_false(client, db, flag_on):
    producer = _business(db, enabled=True, business_id_number=None)
    assert _both_reads(client, producer) == (False, False)


def test_ordering_switched_off_or_never_set_reads_false(client, db, flag_on):
    off = _business(db, enabled=False)
    never = _business(db, enabled=None)
    assert _both_reads(client, off) == (False, False)
    assert _both_reads(client, never) == (False, False)


def test_the_site_flag_off_hides_a_business_that_switched_ordering_on(
    client, db, flag_off
):
    producer = _business(db, enabled=True)
    assert _both_reads(client, producer) == (False, False)


def test_a_test_business_never_takes_orders(client, db, flag_on):
    producer = _business(db, enabled=True)
    producer.is_test = True
    db.commit()
    # A test row is hidden from strangers; its owner and admins still read it
    # by id, so the by-id read is the one that can show the field at all.
    from tests.conftest import auth_header, make_user

    admin = make_user(db, role="admin", email=f"a{uuid.uuid4().hex[:8]}@example.com")
    res = client.get(f"/producers/{producer.id}", headers=auth_header(admin))
    assert res.status_code == 200
    assert res.json()["takes_site_orders"] is False
