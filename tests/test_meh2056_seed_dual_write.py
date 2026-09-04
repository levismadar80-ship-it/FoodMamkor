"""MEH-2056 (MEH-1938 chunk 2) — both seed writers create the primary
`branch` row on producer_locations, so a seed run can never recreate the
"coordinates and no location row" gap the backfill revision repairs.

Measured 02/09 on staging: 13 producers with coordinates and no row — five
are `backend/seed_data.py`'s fixtures (recreated after every
`seed_demo_producers --reset`, which names all five in TEST_NAME_PATTERNS)
and eight are `seed_demo_producers.py`'s ARCHETYPE_BUSINESSES. Neither
writer called `create_primary_branch_location`; registration (MEH-1939),
admin (MEH-2059) and import (MEH-2140) all do.

Discrimination (.claude/rules/testing.md, MEH-1619): with the two one-line
fixes stashed, `test_boot_seed_leaves_no_producer_without_a_location_row`
reads a gap equal to the number of geocoded fixtures (5) and
`test_demo_seed_writes_a_primary_branch_row` finds zero rows; with the
fixes both pass. The gap query is the SAME text Sapir runs by hand as P0,
so the number here and the number in the Railway console answer one
question.

Related: tests/test_seed_env_gate.py (the production gate this must not
weaken — asserted below rather than assumed), tests/test_meh2056_backfill_migration.py
(the repair for rows already written).
"""

import importlib.util
import os

import pytest
from sqlalchemy import text

from app.config import settings
from app.models import Producer, ProducerLocation
from seed_data import PRODUCERS, seed

# The P0 query, verbatim (MEH-1938 card, 02/09) — NOT a paraphrase.
GAP_SQL = text(
    """
    SELECT COUNT(*)
    FROM producers p
    WHERE p.lat IS NOT NULL AND p.lng IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM producer_locations l WHERE l.producer_id = p.id
      )
    """
)

# Derived from the fixture list, never a literal: adding or geocoding a
# fixture moves every expectation below with it.
GEOCODED = [
    p for p in PRODUCERS if p.get("lat") is not None and p.get("lng") is not None
]

_BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
_DEMO_SCRIPT = os.path.join(_BACKEND, "scripts", "seed_demo_producers.py")


def _gap(db) -> int:
    return db.execute(GAP_SQL).scalar_one()


def _rows(db, producer_id) -> list[ProducerLocation]:
    return (
        db.query(ProducerLocation)
        .filter(ProducerLocation.producer_id == producer_id)
        .all()
    )


@pytest.fixture
def staging_env(monkeypatch):
    """seed() reads settings.env at call time (test_seed_env_gate.py:57-62);
    staging is the environment where both writers actually run."""
    monkeypatch.setattr(settings, "env", "staging")


@pytest.fixture
def demo_mod(monkeypatch):
    """The demo-seed script as a module, with Cloudinary neutralised.

    REUSES: tests/test_seed_demo_producers_upload.py (spec_from_file_location
    on the script path). `_upload_hero` is patched to the value it returns
    when Cloudinary is unconfigured, so no network is touched.
    """
    spec = importlib.util.spec_from_file_location("seed_demo_producers", _DEMO_SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.setattr(mod, "_upload_hero", lambda slug, url: None)
    return mod


# ------------------------------------------------------------ boot seed


def test_fixture_list_has_geocoded_rows():
    """Control for every derived count below: a fixture list with no
    coordinates would make `gap == 0` true of a seed that wrote nothing."""
    assert len(GEOCODED) >= 1
    assert len(GEOCODED) <= len(PRODUCERS)


def test_boot_seed_leaves_no_producer_without_a_location_row(db, staging_env):
    """THE DISCRIMINATION CASE — stash the seed_data.py fix and this reads
    len(GEOCODED), not 0. The producer count is asserted first so a seed
    that inserted nothing cannot satisfy the gap check by emptiness."""
    seed()

    assert db.query(Producer).count() == len(PRODUCERS)
    assert _gap(db) == 0


def test_boot_seed_row_mirrors_each_geocoded_fixture(db, staging_env):
    seed()

    for fixture in GEOCODED:
        producer = db.query(Producer).filter(Producer.slug == fixture["slug"]).one()
        rows = _rows(db, producer.id)
        assert len(rows) == 1, fixture["slug"]
        row = rows[0]
        assert (row.kind, row.is_primary, row.location_precision) == (
            "branch",
            True,
            "exact",
        )
        assert (row.lat, row.lng, row.city) == (
            fixture["lat"],
            fixture["lng"],
            fixture["city"],
        )
        assert row.label is None


def test_boot_seed_twice_does_not_duplicate_rows(db, staging_env):
    """seed() skips a slug that exists (seed_data.py `existing → continue`),
    so the second run must add zero rows — asserted as the exact count,
    not as "at least one"."""
    seed()
    seed()

    assert db.query(ProducerLocation).count() == len(GEOCODED)


def test_production_seed_still_writes_no_location_rows(db, monkeypatch):
    """The MEH-2092 gate is upstream of the new call: on production seed()
    inserts no producers, so there is no instance to mirror. Pinned here so
    this PR cannot be read as having widened what production seeds."""
    monkeypatch.setattr(settings, "env", "production")

    seed()

    assert db.query(Producer).count() == 0
    assert db.query(ProducerLocation).count() == 0


# ------------------------------------------------------------ demo seed


def test_demo_fixtures_all_carry_coordinates(demo_mod):
    """Anchors the writer's contract to the real fixture data: every demo
    row has lat AND lng, so `create_primary_branch_location` returns a row
    for each of them (a coordinate-less fixture would get none, by design)."""
    fixtures = list(demo_mod.DEMO_BUSINESSES) + list(demo_mod.ARCHETYPE_BUSINESSES)
    assert len(fixtures) >= 1
    missing = [
        b["slug"] for b in fixtures if b.get("lat") is None or b.get("lng") is None
    ]
    assert missing == []


def test_demo_seed_writes_a_primary_branch_row(db, staging_env, demo_mod):
    """THE DISCRIMINATION CASE for the second writer — stash the
    seed_demo_producers.py fix and `rows` is empty."""
    seed()  # categories: _seed_one aborts without them (seed_demo_producers.py:782-787)
    biz = demo_mod.ARCHETYPE_BUSINESSES[0]

    _line, inserted = demo_mod._seed_one(db, biz, confirm=True)

    assert inserted is True
    producer = db.query(Producer).filter(Producer.slug == biz["slug"]).one()
    rows = _rows(db, producer.id)
    assert len(rows) == 1
    row = rows[0]
    assert (row.kind, row.is_primary, row.location_precision) == (
        "branch",
        True,
        "exact",
    )
    assert (row.lat, row.lng, row.city, row.address) == (
        biz["lat"],
        biz["lng"],
        biz["city"],
        biz["address"],
    )
    assert _gap(db) == 0


def test_demo_seed_skip_path_adds_no_row(db, staging_env, demo_mod):
    """Idempotency: the second _seed_one on the same slug returns
    was_inserted=False and the row count stays exactly one."""
    seed()
    biz = demo_mod.ARCHETYPE_BUSINESSES[0]
    demo_mod._seed_one(db, biz, confirm=True)

    _line, inserted = demo_mod._seed_one(db, biz, confirm=True)

    assert inserted is False
    producer = db.query(Producer).filter(Producer.slug == biz["slug"]).one()
    assert len(_rows(db, producer.id)) == 1
