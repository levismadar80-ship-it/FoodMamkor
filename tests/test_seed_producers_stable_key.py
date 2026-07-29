"""MEH-1530 — seed producers are keyed by slug, not by display name.

Same bug family as MEH-1104/MEH-1107, one table over. ``seed()`` used to check
whether a sample producer already existed with
``Producer.name == p_data["name"]``. ``producers.name`` is display text an admin
edits at runtime (``admin.py`` / ``producer_me.py`` both write it), so a rename
made that lookup miss its own row and the next boot INSERTed a second copy.

``producers.name`` carries NO unique constraint (``models.py:48``), so unlike
the category case there is no DB-level backstop: the duplicate lands silently
and both rows render. ``producers.slug`` is unique and part of the public URL —
it is the stable identity key, and that is what the lookup now matches on.

Uses the shared Postgres test DB via the `db` fixture; `_clean_tables`
(conftest) TRUNCATEs with RESTART IDENTITY before each test. ``seed()`` opens
its OWN ``SessionLocal`` against the same database, so every assertion here
calls ``db.expire_all()`` first — otherwise the fixture session serves rows
from its identity map and would not see the seed's writes.
"""
from seed_data import PRODUCERS, seed

from app.models.models import Producer

RENAMED = "שם שהמנהלת שינתה"


def _producers(db):
    db.expire_all()  # seed() wrote through a different session
    return db.query(Producer).order_by(Producer.slug).all()


def _slugs(db):
    return [p.slug for p in _producers(db)]


def test_seed_populates_a_fresh_table(db):
    """Bootstrap still works: empty table → one row per PRODUCERS entry."""
    assert db.query(Producer).count() == 0

    seed()

    assert _slugs(db) == sorted(p["slug"] for p in PRODUCERS)


def test_reseed_is_idempotent(db):
    """Two consecutive runs leave the producer set unchanged."""
    seed()
    first = {(p.id, p.slug, p.name) for p in _producers(db)}

    seed()

    assert {(p.id, p.slug, p.name) for p in _producers(db)} == first


def test_reseed_after_rename_does_not_duplicate(db):
    """The MEH-1530 guarantee: renaming a seed producer's DISPLAY name must not
    make the next seed re-insert it.

    Under the old name-keyed lookup this test failed on the row count — the
    renamed row survived AND a second row with the original name was inserted,
    with no unique constraint to catch it.
    """
    seed()
    before = _producers(db)
    target = before[0]
    target_slug, target_id = target.slug, target.id

    target.name = RENAMED
    db.commit()

    seed()  # second run — must skip the renamed row, not re-insert it

    after = _producers(db)
    assert len(after) == len(before), (
        "seed re-inserted a renamed producer — the lookup is keyed on a mutable "
        f"column again. slugs: {[p.slug for p in after]}"
    )
    slugs = [p.slug for p in after]
    assert len(slugs) == len(set(slugs)), f"duplicate slugs: {slugs}"
    # The rename stands (seed is insert-only, never a reconciler) and it is
    # still the same row — not a replacement carrying the same slug.
    renamed = db.query(Producer).filter(Producer.slug == target_slug).one()
    assert renamed.id == target_id
    assert renamed.name == RENAMED


def test_reseed_after_rename_leaves_exactly_one_row_per_seed_slug(db):
    """Every seed slug resolves to exactly one row after a rename + re-seed.

    Guards the shape a bare count would miss: a count stays correct if one slug
    duplicates while another is deleted.
    """
    seed()
    renamed_count = 0
    for producer in _producers(db):
        producer.name = f"{RENAMED} {renamed_count}"
        renamed_count += 1
    db.commit()

    seed()

    db.expire_all()
    for entry in PRODUCERS:
        assert (
            db.query(Producer).filter(Producer.slug == entry["slug"]).count() == 1
        ), f"slug {entry['slug']} is no longer unique after a re-seed"
