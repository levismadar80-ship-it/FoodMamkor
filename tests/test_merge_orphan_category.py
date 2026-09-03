"""MEH-1606 — revision e6b2d4f81a37 (merge the orphan «קרמים ושמנים» into
«קוסמטיקה טבעית»), driven through a real alembic Operations context against
the test database.

Why a test at all: CI's `alembic upgrade head` runs this revision against a
database that has never carried the orphan, so it proves the no-op path parses
and nothing else. The merge path — the one that runs exactly once, on
production — is exercised only here. Every `categories` count below is an
EXACT number derived from the count taken before the run, never a literal.

The both-linked-pair case is the one that matters: producer_categories has a
composite PK (producer_id, category_id) — baseline ef8fb1858f5b:228,
models.py:852-859 — so a producer linked to BOTH rows makes the naive
`UPDATE … SET category_id = survivor` violate the PK. The control test proves
that construction actually collides on this schema (a pair fixture that did
not collide would let a naive revision pass every count here), then the
revision is shown to collapse it to one link with no violation.

Postgres-only (LEAST, row_number() OVER, the composite-PK error shape) — the
suite's database is Postgres in CI and locally (tests/conftest.py:17-19).

Related: tests/test_meh2056_backfill_migration.py (the pattern this copies),
backend/alembic/versions/20260623_1945_c3f8a1d27e94_meh927_taxonomy_cats.py
(the name-keyed data revision this one follows).
"""

import importlib.util
import os

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from conftest import make_category, make_producer
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.database import engine
from app.models import Category, ProducerCategory

_REV_FILE = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "backend",
        "alembic",
        "versions",
        "20260903_1000_e6b2d4f81a37_meh1606_merge_orphan_category.py",
    )
)


@pytest.fixture(scope="module")
def rev():
    spec = importlib.util.spec_from_file_location("rev_e6b2d4f81a37", _REV_FILE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.revision == "e6b2d4f81a37"
    assert mod.down_revision == "7c1e2a9f4b3d"
    return mod


def _run(rev, step: str) -> None:
    """Call upgrade()/downgrade() the way alembic does: the module's `op`
    proxy resolves inside Operations.context() on a MigrationContext bound
    to a live connection. Committed on exit so the session fixture sees it;
    rolled back on a raise, exactly like a failed `alembic upgrade`."""
    with engine.begin() as conn:
        ctx = MigrationContext.configure(conn)
        with Operations.context(ctx):
            getattr(rev, step)()


def _cat_count(db) -> int:
    return db.query(Category).count()


def _links(db, category_id: int) -> list[ProducerCategory]:
    return (
        db.query(ProducerCategory)
        .filter(ProducerCategory.category_id == category_id)
        .order_by(ProducerCategory.producer_id)
        .all()
    )


def _links_of(db, producer_id) -> list[ProducerCategory]:
    return (
        db.query(ProducerCategory)
        .filter(ProducerCategory.producer_id == producer_id)
        .order_by(ProducerCategory.position)
        .all()
    )


@pytest.fixture
def taxonomy(db, rev):
    """The survivor plus two bystanders, so a count of "minus one" cannot be
    satisfied by deleting the wrong row."""
    survivor = make_category(db, name=rev.SURVIVOR_NAME, emoji="🌸")
    make_category(db, name="דבש", emoji="🍯")
    make_category(db, name="ביצים", emoji="🥚")
    return survivor


@pytest.fixture
def orphan(db, rev, taxonomy):
    return make_category(db, name=rev.ORPHAN_NAME, emoji="🌸")


def test_orphan_absent_is_a_noop(db, rev, taxonomy):
    before = _cat_count(db)
    assert before == 3  # the fixture's own shape, so the next line means something
    linked = make_producer(db, name="עסק על השורדת", category=taxonomy)
    links_before = db.query(ProducerCategory).count()

    _run(rev, "upgrade")
    db.expire_all()

    assert _cat_count(db) == before
    assert db.query(ProducerCategory).count() == links_before
    assert [r.category_id for r in _links_of(db, linked.id)] == [taxonomy.id]


def test_survivor_missing_raises_and_changes_nothing(db, rev):
    make_category(db, name="דבש", emoji="🍯")
    orphan = make_category(db, name=rev.ORPHAN_NAME, emoji="🌸")
    make_producer(db, name="עסק על היתומה", category=orphan)
    before = _cat_count(db)

    with pytest.raises(RuntimeError, match="nothing to merge into"):
        _run(rev, "upgrade")
    db.expire_all()

    assert _cat_count(db) == before
    assert db.query(Category).filter_by(name=rev.ORPHAN_NAME).one().id == orphan.id
    assert len(_links(db, orphan.id)) == 1


def test_orphan_with_zero_links_is_deleted(db, rev, taxonomy, orphan):
    before = _cat_count(db)
    orphan_id = orphan.id

    _run(rev, "upgrade")
    db.expire_all()

    assert _cat_count(db) == before - 1
    assert db.query(Category).filter_by(id=orphan_id).one_or_none() is None
    assert db.query(Category).filter_by(name=rev.SURVIVOR_NAME).one().id == taxonomy.id


def test_orphan_links_are_repointed_then_row_deleted(db, rev, taxonomy, orphan):
    a = make_producer(db, name="עסק א — רק על היתומה", category=orphan)
    b = make_producer(db, name="עסק ב — רק על היתומה", category=orphan)
    c = make_producer(db, name="עסק ג — רק על השורדת", category=taxonomy)
    before = _cat_count(db)
    orphan_id = orphan.id
    assert len(_links(db, orphan_id)) == 2  # control: the revision has work to do

    _run(rev, "upgrade")
    db.expire_all()

    assert _links(db, orphan_id) == []
    assert {r.producer_id for r in _links(db, taxonomy.id)} == {a.id, b.id, c.id}
    assert db.query(Category).filter_by(id=orphan_id).one_or_none() is None
    assert _cat_count(db) == before - 1


def test_control_naive_update_violates_the_composite_pk(db, rev, taxonomy, orphan):
    """The construction must discriminate (MEH-1619): prove the pair fixture
    collides under the naive re-point on this schema. If this ever passes
    silently, the PK changed and the pair handling below is untested."""
    both = make_producer(db, name="עסק על שתיהן", category=orphan)
    db.add(ProducerCategory(producer_id=both.id, category_id=taxonomy.id, position=1))
    db.commit()

    with pytest.raises(IntegrityError, match="producer_categories_pkey"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE producer_categories SET category_id = :s "
                    "WHERE category_id = :o"
                ),
                {"s": taxonomy.id, "o": orphan.id},
            )


def test_both_linked_pair_collapses_to_one_link(db, rev, taxonomy, orphan):
    # The orphan is this business's PRIMARY (position 0); the survivor sits
    # at 2 behind a bystander at 1 — the shape where a bare delete of the
    # orphan side would demote the business's primary and leave a hole.
    honey = db.query(Category).filter_by(name="דבש").one()
    both = make_producer(db, name="עסק על שתיהן", category=orphan)
    db.add(ProducerCategory(producer_id=both.id, category_id=honey.id, position=1))
    db.add(ProducerCategory(producer_id=both.id, category_id=taxonomy.id, position=2))
    only_orphan = make_producer(db, name="עסק רק על היתומה", category=orphan)
    db.commit()
    before = _cat_count(db)
    orphan_id = orphan.id

    _run(rev, "upgrade")  # must not raise IntegrityError
    db.expire_all()

    remaining = _links_of(db, both.id)
    assert [(r.category_id, r.position) for r in remaining] == [
        (taxonomy.id, 0),
        (honey.id, 1),
    ]
    assert [r.category_id for r in _links_of(db, only_orphan.id)] == [taxonomy.id]
    assert _links(db, orphan_id) == []
    assert _cat_count(db) == before - 1


def test_upgrade_twice_is_idempotent(db, rev, taxonomy, orphan):
    make_producer(db, name="עסק על היתומה", category=orphan)
    before = _cat_count(db)

    _run(rev, "upgrade")
    _run(rev, "upgrade")
    db.expire_all()

    assert _cat_count(db) == before - 1
    assert len(_links(db, taxonomy.id)) == 1


def test_downgrade_recreates_the_row_with_a_new_id_and_no_links(
    db, rev, taxonomy, orphan
):
    moved = make_producer(db, name="עסק על היתומה", category=orphan)
    old_id = orphan.id
    before = _cat_count(db)

    _run(rev, "upgrade")
    _run(rev, "downgrade")
    db.expire_all()

    restored = db.query(Category).filter_by(name=rev.ORPHAN_NAME).one()
    assert restored.id != old_id  # the sequence moved; the old id is gone
    assert (restored.slug, restored.emoji) == (rev.ORPHAN_SLUG, rev.ORPHAN_EMOJI)
    assert _cat_count(db) == before
    # Links are NOT moved back — they stay on the survivor.
    assert _links(db, restored.id) == []
    assert [r.category_id for r in _links_of(db, moved.id)] == [taxonomy.id]


def test_downgrade_when_orphan_present_is_a_noop(db, rev, taxonomy, orphan):
    before = _cat_count(db)

    _run(rev, "downgrade")
    db.expire_all()

    assert _cat_count(db) == before
    assert db.query(Category).filter_by(name=rev.ORPHAN_NAME).count() == 1
