"""MEH-2056 (MEH-1938 chunk 2) — the backfill revision 7c1e2a9f4b3d, driven
through a real alembic Operations context against the test database.

Why a test at all: CI's `alembic upgrade head` runs this revision against an
EMPTY table, which proves the SQL parses and nothing else — a WHERE clause
that matched every producer, or none, would pass identically. These cases
seed the four shapes the revision's two rulings (MEH-1938, 01/09) are about
and assert the row count per producer AFTER the run:

  gap       coordinates, no row            -> exactly one new primary branch row
  covered   coordinates, an owner's row    -> untouched (same row id)
  nocoords  no coordinates, no row         -> still no row
  cleared   coordinates, a coordinate-less -> still ONE row (ruling 1: NOT EXISTS
            primary (admin cleared the pin)   any row, never a second primary)

Discrimination (MEH-1619), shown on copies of the revision file:
  - NOT EXISTS removed  -> `covered` and `cleared` gain a second primary; red.
  - lat/lng guard removed -> `nocoords` gains a row; red.
The real file passes. Postgres-only (gen_random_uuid, IS NOT DISTINCT FROM) —
the suite's database is Postgres in CI and locally (tests/conftest.py:17-19).

Related: tests/test_meh2056_seed_dual_write.py (the writers that caused the
gap), backend/alembic/versions/a9f4c2e7b1d3_meh1395_producer_locations.py
(the original backfill whose row shape this reproduces).
"""

import importlib.util
import os

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from conftest import make_producer
from sqlalchemy import text

from app.database import engine
from app.models import ProducerLocation

_REV_FILE = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "backend",
        "alembic",
        "versions",
        "20260902_0900_7c1e2a9f4b3d_meh2056_backfill_primary_locations.py",
    )
)


@pytest.fixture(scope="module")
def rev():
    spec = importlib.util.spec_from_file_location("rev_7c1e2a9f4b3d", _REV_FILE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.revision == "7c1e2a9f4b3d"
    return mod


def _run(rev, step: str) -> None:
    """Call upgrade()/downgrade() the way alembic does: the module's `op`
    proxy resolves inside Operations.context() on a MigrationContext bound
    to a live connection. Committed on exit so the session fixture sees it."""
    with engine.begin() as conn:
        ctx = MigrationContext.configure(conn)
        with Operations.context(ctx):
            getattr(rev, step)()


def _rows(db, producer_id) -> list[ProducerLocation]:
    return (
        db.query(ProducerLocation)
        .filter(ProducerLocation.producer_id == producer_id)
        .order_by(ProducerLocation.created_at.asc())
        .all()
    )


def _gap(db, rev) -> int:
    return db.execute(text(rev.GAP_COUNT_SQL)).scalar_one()


@pytest.fixture
def world(db):
    """The four shapes. Coordinates that differ between the owner's row and
    the producer mirror are deliberate: they make `covered` distinguishable
    from a row the revision could have written."""
    gap = make_producer(db, name="פער — קואורדינטות בלי שורה")
    gap.address = "רחוב הדוגמה 1"
    gap.opening_hours = "א-ה 09:00-17:00"
    gap.phone = "0501234567"

    covered = make_producer(db, name="מכוסה — שורה של הבעלים")
    covered_row = ProducerLocation(
        producer_id=covered.id,
        kind="branch",
        is_primary=True,
        city="חיפה",
        lat=32.7940,
        lng=34.9896,
    )
    db.add(covered_row)

    nocoords = make_producer(db, name="בלי קואורדינטות")
    nocoords.lat = None
    nocoords.lng = None

    cleared = make_producer(db, name="נוקה — שורה ראשית בלי קואורדינטות")
    db.add(
        ProducerLocation(
            producer_id=cleared.id,
            kind="branch",
            is_primary=True,
            city="תל אביב",
            lat=None,
            lng=None,
            label="הסניף הראשי",
        )
    )
    db.commit()
    return {
        "gap": gap.id,
        "covered": covered.id,
        "covered_row": covered_row.id,
        "nocoords": nocoords.id,
        "cleared": cleared.id,
    }


def test_world_starts_with_exactly_one_gap(db, rev, world):
    """Control: the fixture must present the revision with work to do, or a
    revision that inserts nothing passes every count below."""
    assert _gap(db, rev) == 1


def test_upgrade_fills_exactly_the_gap(db, rev, world):
    _run(rev, "upgrade")
    db.expire_all()

    gap_rows = _rows(db, world["gap"])
    assert len(gap_rows) == 1
    row = gap_rows[0]
    assert (row.kind, row.is_primary, row.location_precision, row.label) == (
        "branch",
        True,
        "exact",
        None,
    )
    # Mirror of the producer's columns, INCLUDING hours + phone (ruling 2).
    assert (row.lat, row.lng, row.city, row.address) == (
        32.0853,
        34.7818,
        "תל אביב",
        "רחוב הדוגמה 1",
    )
    assert (row.opening_hours, row.phone) == ("א-ה 09:00-17:00", "0501234567")

    covered_rows = _rows(db, world["covered"])
    assert [r.id for r in covered_rows] == [world["covered_row"]]

    assert _rows(db, world["nocoords"]) == []

    # Ruling 1: an existing coordinate-less primary is "a row", so no second
    # primary is inserted beside it.
    cleared_rows = _rows(db, world["cleared"])
    assert len(cleared_rows) == 1
    assert cleared_rows[0].lat is None

    assert _gap(db, rev) == 0


def test_upgrade_twice_inserts_nothing(db, rev, world):
    _run(rev, "upgrade")
    db.expire_all()
    total_after_first = db.query(ProducerLocation).count()

    _run(rev, "upgrade")
    db.expire_all()

    assert db.query(ProducerLocation).count() == total_after_first


def test_downgrade_is_a_documented_noop(db, rev, world):
    """The Phase 0 draft's DELETE would also remove a9f4c2e7b1d3's rows (same
    shape); the revision therefore reverts nothing, on purpose, and says so.
    Asserted as the exact count so a future 'helpful' DELETE goes red."""
    _run(rev, "upgrade")
    db.expire_all()
    before = db.query(ProducerLocation).count()

    _run(rev, "downgrade")
    db.expire_all()

    assert db.query(ProducerLocation).count() == before
    assert len(_rows(db, world["gap"])) == 1
