"""MEH-1107 — category seed idempotency.

Proves the root-cause fix for the MEH-1104 production duplicate: re-seeding
the category taxonomy updates rows in place by stable id instead of inserting
a duplicate row when a category's name changes. Uses the shared Postgres test
DB via the `db` fixture; `_clean_tables` (conftest) TRUNCATEs with RESTART
IDENTITY before each test, so ids start at 1.
"""
from seed_data import CATEGORIES, seed_categories

from app.models.models import Category

# 12th entry in CATEGORIES == id 12 in production (the MEH-1104 cream row).
CREAM_ID = 12
CREAM_NAME = CATEGORIES[CREAM_ID - 1][0]  # tracks the live seed name automatically
OLD_CREAM_NAME = "pre-meh1098-old-name"   # any string that differs from CREAM_NAME


def _rows(db):
    return db.query(Category).order_by(Category.id).all()


def test_seed_assigns_stable_ids(db):
    seed_categories(db)
    rows = _rows(db)
    assert len(rows) == len(CATEGORIES)
    # position in CATEGORIES == row id
    assert [r.id for r in rows] == list(range(1, len(CATEGORIES) + 1))
    assert [r.name for r in rows] == [name for name, _ in CATEGORIES]
    assert db.get(Category, CREAM_ID).name == CREAM_NAME


def test_reseed_is_idempotent(db):
    seed_categories(db)
    first = {(r.id, r.name, r.emoji) for r in _rows(db)}

    seed_categories(db)  # second run — must not change anything
    second = {(r.id, r.name, r.emoji) for r in _rows(db)}

    assert first == second
    assert db.query(Category).count() == len(CATEGORIES)


def test_reseed_after_rename_updates_in_place(db):
    """The exact MEH-1104 incident: a renamed row must update, not duplicate."""
    seed_categories(db)

    # Simulate the pre-rename production state: id=12 still carries the OLD name.
    cream = db.get(Category, CREAM_ID)
    cream.name = OLD_CREAM_NAME
    db.commit()

    # Re-seed with CATEGORIES carrying the NEW name at position 12.
    seed_categories(db)

    # No duplicate row, and the existing row was updated in place.
    assert db.query(Category).count() == len(CATEGORIES)
    assert db.get(Category, CREAM_ID).name == CREAM_NAME
    assert (
        db.query(Category).filter(Category.name == OLD_CREAM_NAME).first() is None
    )
