"""
MEH-1849 chunk 2 — the DB refuses a business that is nationwide but declares
it does not deliver.

MEH-1848 shipped the read half: producer_listing.py's two delivery predicates
consult `offers_delivery`, so a contradictory row is no longer SHOWN. This is
the write half — the row cannot EXIST. The read fix alone leaves psql, seeds
and importers free to create it, after which every other consumer of the
column still reads the wrong value.

The assertion is on the DATABASE's behaviour, not on the presence of a
CheckConstraint object in models.py (ADR-032 §3.6). Asserting the declaration
would pass against a constraint that never reached the schema; only a rejected
write proves the constraint bit. The error text is asserted too, because a
bare `pytest.raises(IntegrityError)` also passes on a NOT NULL violation, a
FK violation, or a typo'd column — i.e. for reasons that have nothing to do
with this constraint.

Note on the harness: conftest builds the schema with
`Base.metadata.create_all`, not `alembic upgrade`, so what this exercises is
the ORM `__table_args__` mirror. That is deliberate — it is the half a
migration-only change would silently skip, and the two are asserted to agree
by the `alembic check` drift gate in CI. The migration side is proven
separately by the real-Postgres round trip in the PR body.
"""

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.models import Producer

CONSTRAINT = "producer_nationwide_requires_delivery"


def test_nationwide_without_offers_delivery_is_rejected(db):
    """delivery_nationwide=true + offers_delivery=false → IntegrityError."""
    db.add(
        Producer(
            name="ארצי שלא משלח",
            description="contradiction: nationwide scope, delivery switched off",
            city="תל אביב",
            status="approved",
            images=[],
            has_physical_location=True,  # keeps producer_location_mode satisfied
            offers_delivery=False,
            delivery_nationwide=True,
        )
    )

    with pytest.raises(IntegrityError) as exc:
        db.commit()

    # Name the constraint. Without this the test passes on any IntegrityError,
    # including ones this change did not cause.
    assert CONSTRAINT in str(exc.value), (
        f"expected {CONSTRAINT} to reject the row, got: {exc.value}"
    )
    db.rollback()


def test_nationwide_with_offers_delivery_is_accepted(db):
    """The control. Same row with the switch ON must still be writable —
    otherwise the constraint is over-broad and the rejection above proves
    nothing about WHICH pair is forbidden."""
    db.add(
        Producer(
            name="ארצי שמשלח",
            description="consistent: nationwide scope, delivery on",
            city="תל אביב",
            status="approved",
            images=[],
            has_physical_location=True,
            offers_delivery=True,
            delivery_nationwide=True,
        )
    )
    db.commit()

    assert (
        db.query(Producer).filter(Producer.name == "ארצי שמשלח").one().offers_delivery
        is True
    )


def test_non_nationwide_without_offers_delivery_is_accepted(db):
    """The other control. A pickup-only business — no nationwide flag, no
    delivery — is a perfectly ordinary row and the constraint must not touch
    it. This is the column default, so a constraint that rejected it would
    break registration."""
    db.add(
        Producer(
            name="איסוף עצמי בלבד",
            description="pickup only",
            city="תל אביב",
            status="approved",
            images=[],
            has_physical_location=True,
            offers_delivery=False,
            delivery_nationwide=False,
        )
    )
    db.commit()

    assert (
        db.query(Producer).filter(Producer.name == "איסוף עצמי בלבד").one() is not None
    )
