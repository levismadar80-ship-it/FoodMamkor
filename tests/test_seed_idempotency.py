"""MEH-1107 — category seed idempotency.

Guards the MEH-1104 production duplicate: re-seeding the taxonomy must never
insert a second row when a category's name changes. Uses the shared Postgres
test DB via the `db` fixture; `_clean_tables` (conftest) TRUNCATEs with RESTART
IDENTITY before each test, so ids start at 1.

MEH-1530 note: the *mechanism* changed — seeding is now insert-only
(`ON CONFLICT DO NOTHING`) rather than an id-keyed update-in-place, because the
positional id mapping was itself a bug (it crashed on every staging boot). The
no-duplicate guarantee this module exists to protect is unchanged and is now
structural. The old `test_reseed_after_rename_updates_in_place` was removed with
that mechanism: it asserted the update-in-place rename and the `print(...)`
observability line, neither of which exists any more. Renames are Alembic's
responsibility now — see `tests/test_seed_categories_idempotent.py`
(`test_seed_issues_no_update_so_renames_are_a_noop`) for the inverted guard.
"""

from seed_data import CATEGORIES, seed_categories

from app.models.models import Category

# 12th entry in CATEGORIES == id 12 in production (the MEH-1104 cream row).
CREAM_ID = 12
CREAM_NAME = CATEGORIES[CREAM_ID - 1][0]  # tracks the live seed name automatically


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


def test_reseed_never_duplicates_a_name(db):
    """The MEH-1104 guarantee, kept — now enforced structurally.

    Replaces `test_reseed_after_rename_updates_in_place` (MEH-1530): the
    update-in-place rename it asserted no longer exists, so the assertion moved
    to the property that actually matters and still holds — a re-seed cannot
    produce a duplicate name, because ON CONFLICT DO NOTHING makes it impossible.
    """
    seed_categories(db)
    seed_categories(db)

    names = [r.name for r in _rows(db)]
    assert len(names) == len(set(names)), f"duplicate names: {names}"
    assert db.query(Category).count() == len(CATEGORIES)
    assert db.get(Category, CREAM_ID).name == CREAM_NAME
