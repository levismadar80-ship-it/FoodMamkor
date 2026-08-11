"""Unit tests for app.services.producer_queries.attach_badge_fields.

attach_badge_fields hydrates the computed fields the badge system
consumes from already-loaded ORM collections. These tests exercise it
against lightweight stand-ins (no DB) to lock the dietary-flag
aggregation, license boolean, and counts.
"""
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.services.producer_queries import attach_badge_fields


def _product(**flags):
    base = {"is_gluten_free": False, "is_vegan": False, "is_lactose_free": False}
    base.update(flags)
    return SimpleNamespace(**base)


def _producer(products=None, delivery_areas=None, license_number=None, created_at=None):
    return SimpleNamespace(
        id="00000000-0000-0000-0000-000000000001",
        products=products or [],
        delivery_areas=delivery_areas or [],
        producer_license_number=license_number,
        created_at=created_at,
    )


class TestAttachBadgeFields:
    def test_counts_products_and_delivery(self):
        p = _producer(
            products=[_product(), _product()],
            delivery_areas=[object(), object(), object()],
        )
        attach_badge_fields(p)
        assert p.products_count == 2
        assert p.delivery_count == 3

    def test_dietary_flags_aggregate_any(self):
        p = _producer(
            products=[_product(is_vegan=True), _product(is_gluten_free=True)]
        )
        attach_badge_fields(p)
        assert p.has_vegan_products is True
        assert p.has_gluten_free_products is True
        assert p.has_lactose_free_products is False

    def test_no_products_all_flags_false(self):
        p = _producer(products=[])
        attach_badge_fields(p)
        assert p.products_count == 0
        assert p.has_vegan_products is False
        assert p.has_gluten_free_products is False
        assert p.has_lactose_free_products is False

    def test_license_boolean_true_when_present(self):
        p = _producer(license_number="12345")
        attach_badge_fields(p)
        assert p.has_producer_license is True

    def test_license_boolean_false_when_blank(self):
        p = _producer(license_number="   ")
        attach_badge_fields(p)
        assert p.has_producer_license is False

    def test_license_boolean_false_when_none(self):
        p = _producer(license_number=None)
        attach_badge_fields(p)
        assert p.has_producer_license is False

    def test_days_since_created_computed(self):
        p = _producer(created_at=datetime.utcnow() - timedelta(days=5))
        attach_badge_fields(p)
        assert p.days_since_created == 5

    def test_days_since_created_none_when_missing(self):
        p = _producer(created_at=None)
        attach_badge_fields(p)
        assert p.days_since_created is None

    def test_returns_the_producer(self):
        p = _producer()
        assert attach_badge_fields(p) is p
