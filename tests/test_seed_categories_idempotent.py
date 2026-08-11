"""MEH-1530 — seed_categories is insert-only and hole-tolerant.

Regression test for the crash that rolled back the seed transaction on every
staging boot. The MEH-1107 design mapped list position to primary key
(``cat_id = idx + 1``) and renamed whichever row sat at that id. Staging's id
sequence has holes (ids 1, 5, 13, 15) because ``admin_extra.py`` and the MEH-927
migration both create rows at autoincrement ids — so the first iteration looked
up id 1, found nothing, INSERTed 'בשר' (already live on id 22) and violated
``categories_name_key``.

That rollback was the ONLY thing preventing four categories from being silently
renamed, so the fix removes the rename capability rather than repairing the
mapping. Renames/deletions now belong exclusively to Alembic migrations.

Uses the shared Postgres test DB via the `db` fixture; `_clean_tables`
(conftest) TRUNCATEs with RESTART IDENTITY before each test.
"""

from sqlalchemy import text

from seed_data import CATEGORIES, seed_categories

from app.models.models import Category

# Positions deliberately left empty, mirroring the staging shape. Position 1
# ('בשר') is the one that actually crashed: its name was live on a high id.
HOLE_POSITIONS = (1, 5)
_HIGH_ID_BASE = 100


def _snapshot(db):
    return sorted((r.id, r.name, r.emoji) for r in db.query(Category).all())


def _names(db):
    # ORDER BY is explicit: test_seed_populates_a_fresh_table compares this
    # list positionally against CATEGORIES, and Postgres guarantees no row
    # order without it (insertion/heap order happens to hold after TRUNCATE
    # RESTART IDENTITY, but that is not a contract).
    return [r.name for r in db.query(Category).order_by(Category.id).all()]


def _seed_staging_shaped(db):
    """Build a table with holes at HOLE_POSITIONS, those names parked on high ids.

    This is the exact collision geometry of staging: every canonical name is
    present, but NOT at its positional id — so any position-keyed write either
    renames the wrong row or collides on the UNIQUE name constraint.
    """
    for idx, (name, emoji) in enumerate(CATEGORIES):
        position = idx + 1
        row_id = _HIGH_ID_BASE + position if position in HOLE_POSITIONS else position
        db.add(Category(id=row_id, name=name, emoji=emoji))
    db.commit()
    # Inserting with EXPLICIT ids does not advance the SERIAL sequence, but every
    # real row (admin_extra.py, the MEH-927 migration) is created by autoincrement
    # and does advance it. Re-sync so the fixture matches production: otherwise a
    # genuine INSERT draws a stale id and dies on categories_pkey — an artifact of
    # the fixture, not a property of the code under test.
    db.execute(
        text(
            "SELECT setval(pg_get_serial_sequence('categories', 'id'), "
            "(SELECT max(id) FROM categories))"
        )
    )
    db.commit()


def test_seed_with_id_holes_does_not_raise(db):
    """The MEH-1530 crash itself: this used to raise IntegrityError."""
    _seed_staging_shaped(db)

    seed_categories(db)  # must complete, not roll back

    assert db.query(Category).count() == len(CATEGORIES)


def test_seed_with_id_holes_changes_nothing(db):
    """Zero row delta against staging-shaped data — the acceptance criterion."""
    _seed_staging_shaped(db)
    before = _snapshot(db)

    seed_categories(db)

    assert _snapshot(db) == before, "seed mutated rows it should have left alone"


def test_double_seed_with_holes_is_byte_identical(db):
    """Two consecutive runs: same row count, same ids, same names."""
    _seed_staging_shaped(db)

    seed_categories(db)
    first = _snapshot(db)
    seed_categories(db)
    second = _snapshot(db)

    assert first == second


def test_seed_never_duplicates_a_name(db):
    """ON CONFLICT DO NOTHING preserves the MEH-1104 guarantee (no duplicates)."""
    _seed_staging_shaped(db)

    seed_categories(db)
    seed_categories(db)

    names = _names(db)
    assert len(names) == len(set(names)), f"duplicate names: {names}"


def test_seed_never_updates_a_row_and_reinserts_the_freed_name(db):
    """The rename capability is GONE: a row whose name differs from CATEGORIES
    at its positional id survives untouched. If the renamed row ever comes back
    as its canonical name, an UPDATE path was reintroduced — that is the
    MEH-1530 bug returning, not a test to relax.

    Insert-only has a corollary worth pinning down, because it is the visible
    behaviour change for admins: renaming a row FREES its canonical name, so the
    next seed re-inserts that name as a NEW row rather than reverting the rename.
    The old id-keyed code silently reverted the admin's edit; this keeps it and
    re-adds the canonical row alongside. That is the safer half of the trade (no
    silent data loss), and renaming a seeded category from the admin API is
    out-of-contract anyway — renames belong in a migration (MEH-927 pattern).
    """
    _seed_staging_shaped(db)
    squatter_id = 2  # a non-hole position, so a position-keyed write would hit it
    freed_name = db.get(Category, squatter_id).name
    db.get(Category, squatter_id).name = "admin-created-name"
    db.commit()
    before = db.query(Category).count()

    seed_categories(db)

    # No UPDATE: the admin's rename stands.
    assert db.get(Category, squatter_id).name == "admin-created-name"
    # The freed canonical name returns as exactly one NEW row.
    assert db.query(Category).count() == before + 1
    assert db.query(Category).filter(Category.name == freed_name).count() == 1


def test_seed_populates_a_fresh_table(db):
    """Bootstrap still works: empty table → the full taxonomy."""
    assert db.query(Category).count() == 0

    seed_categories(db)

    assert _names(db) == [name for name, _ in CATEGORIES]
    assert db.query(Category).count() == len(CATEGORIES)
