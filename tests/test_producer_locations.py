"""MEH-1395 (MEH-1388 chunk 1): ProducerLocation ORM data-layer tests.

Purpose:  Prove the Expand-phase model + relationship: a producer owns many
          physical presence points, the is_primary row is queryable, and a
          producer teardown cascades its locations away.
Touches:  producer_locations table (created here via Base.metadata.create_all
          in conftest — the paired Alembic revision is drafted in the PR body
          and committed by Sapir; these tests run on the ORM-built schema, so
          they need no migration).
Does NOT: exercise serialization / routers / map queries — those are
          MEH-1388 chunks 2-4 and out of scope here.
Related:  backend/app/models/models.py (ProducerLocation), tests/conftest.py
          (make_producer factory, create_all schema bootstrap).
History:  MEH-1395 (creation).
"""

from app.models import ProducerLocation
from tests.conftest import make_producer


def _add_location(db, producer, **kw):
    loc = ProducerLocation(producer_id=producer.id, **kw)
    db.add(loc)
    return loc


def test_producer_owns_many_locations_and_is_primary_is_queryable(db):
    producer = make_producer(db)
    _add_location(
        db,
        producer,
        kind="branch",
        label="הסניף המרכזי",
        city="קריית טבעון",
        lat=32.7194,
        lng=35.1180,
        is_primary=True,
    )
    _add_location(
        db,
        producer,
        kind="pickup",
        label="נקודת איסוף",
        city="חיפה",
        is_primary=False,
    )
    db.commit()
    db.refresh(producer)

    # Relationship loads both; default lazy="select" (no eager joinedload).
    assert len(producer.locations) == 2
    assert {loc.kind for loc in producer.locations} == {"branch", "pickup"}

    # is_primary is queryable and unique to the branch row.
    primary = (
        db.query(ProducerLocation)
        .filter(
            ProducerLocation.producer_id == producer.id,
            ProducerLocation.is_primary.is_(True),
        )
        .all()
    )
    assert len(primary) == 1
    assert primary[0].kind == "branch"
    # location_precision server-default applied.
    assert primary[0].location_precision == "exact"


def test_deleting_producer_cascades_its_locations(db):
    producer = make_producer(db)
    _add_location(db, producer, kind="branch", is_primary=True)
    _add_location(db, producer, kind="market_stand", is_primary=False)
    db.commit()

    assert db.query(ProducerLocation).count() == 2

    db.delete(producer)
    db.commit()

    # cascade="all, delete-orphan" on Producer.locations removes them.
    assert db.query(ProducerLocation).count() == 0
