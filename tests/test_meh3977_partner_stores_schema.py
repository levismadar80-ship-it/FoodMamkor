"""MEH-3977 chunk 1: producers.partner_stores and the widened CHECK.

A business sold only through other stores (no pickup of its own, no own
delivery) must be storable; a business with none of the three must not.
"""

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.models import Producer


def _producer(**kw) -> Producer:
    return Producer(
        name="משק שותפים",
        description="sold through other stores",
        city="שעל",
        status="approved",
        images=[],
        delivery_nationwide=False,
        **kw,
    )


def test_partner_stores_alone_satisfies_location_mode(db):
    db.add(_producer(has_physical_location=False, offers_delivery=False, partner_stores=["פארמרים", "הענתיות"]))
    db.commit()
    row = db.query(Producer).filter_by(name="משק שותפים").one()
    assert row.partner_stores == ["פארמרים", "הענתיות"]


def test_none_of_the_three_is_still_rejected(db):
    db.add(_producer(has_physical_location=False, offers_delivery=False))
    with pytest.raises(IntegrityError) as exc:
        db.commit()
    assert "producer_location_mode" in str(exc.value)
    db.rollback()


def test_existing_rows_default_to_no_partner_stores(db):
    db.add(_producer(has_physical_location=True, offers_delivery=False))
    db.commit()
    assert db.query(Producer).filter_by(name="משק שותפים").one().partner_stores == []


def test_more_than_ten_partner_stores_is_rejected(db):
    db.add(_producer(has_physical_location=True, offers_delivery=False, partner_stores=[f"חנות {i}" for i in range(11)]))
    with pytest.raises(IntegrityError) as exc:
        db.commit()
    assert "producer_partner_stores_cap" in str(exc.value)
    db.rollback()
