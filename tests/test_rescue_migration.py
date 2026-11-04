"""MEH-2644 — revision a1c9f3e8d204 (rescue bags, chunk 1) driven through a
real alembic Operations context against the test database.

Why a test at all, when CI already runs `alembic upgrade head`: that run
creates the four tables on an EMPTY database and proves the DDL parses. It
cannot see any of the things this file asserts —

  - that `downgrade()` is complete. CI never calls it, so a forgotten
    `drop_table` or a missing column removal ships green and only bites the
    first person who rolls back.
  - that re-running `upgrade()` after a rollback works, which is what a failed
    deploy followed by a retry actually does.
  - that `users.rescue_no_show_count` lands on a POPULATED table. CI's users
    table is empty, so a NOT NULL column with no server_default would pass
    there and fail in production on the first existing row.
  - that UNIQUE (offer_id, pickup_code) is per-offer, not global. A globally
    unique code passes `upgrade head` identically and breaks the pilot on the
    day two businesses issue the same four digits.
  - that the revision's literal CHECK strings still match the status tuples in
    models.py. Two copies of a vocabulary is the MEH-271 smell; this is the
    guard that keeps the model the single authority.

DISCRIMINATION (MEH-1619) — six mutations, each run against this module and
each red; the unmutated module green before and after. Note WHICH side each
one targets, because the two sides are checked by different tests: the
behavioural tests run against the schema conftest builds from the MODEL
(create_all), while the round-trip test runs against the schema the REVISION
builds. A mutation to one is invisible to the other, which is the whole reason
both are here. Runs pasted in the PR body:

  revision file (round-trip test):
  - the users-counter removal taken out of downgrade()   -> red: the column is
    still there after downgrade, and the retry upgrade hits DuplicateColumn.
  - UNIQUE narrowed to ("pickup_code",) — a global code  -> red: the constraint
    definition read back from pg_constraint is no longer (offer_id,
    pickup_code). A name-only assertion would NOT have caught this.
  - `qty_left <= qty_total` dropped from the CHECK       -> red: the oversell
    guard is missing from the definition.
  - 'paid' added back to the status CHECK literal        -> red TWICE: the
    vocabulary test on the source, and the round-trip test on the catalog.

  models.py (behavioural tests, which the revision cannot fix):
  - UniqueConstraint narrowed to ("pickup_code",)        -> red: the second
    business's identical code raises UniqueViolation.
  - the qty_left CHECK removed                           -> red: the oversell
    INSERT succeeds.

Postgres-only (JSONB, regex CHECK) — the suite's database is Postgres in CI
and locally (tests/conftest.py:17-19).

Related: tests/test_meh2056_backfill_migration.py (the Operations.context
pattern this reuses), backend/app/models/models.py (RescueOffer and siblings).
"""

import ast
import importlib.util
import os
import re
import uuid

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from conftest import make_producer, make_user
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.database import Base, engine
from app.models import (
    RESCUE_OFFER_STATUSES,
    RESCUE_ORDER_STATUSES,
    ProducerLocation,
)

RESCUE_TABLES = (
    "rescue_offers",
    "rescue_orders",
    "rescue_reviews",
    "rescue_typical_items",
)

_REV_FILE = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "backend",
        "alembic",
        "versions",
        "20261104_0020_a1c9f3e8d204_meh2644_rescue_bags.py",
    )
)


@pytest.fixture(scope="module")
def rev():
    spec = importlib.util.spec_from_file_location("rev_a1c9f3e8d204", _REV_FILE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.revision == "a1c9f3e8d204"
    assert mod.down_revision == "4b7e1d2c9a60"
    return mod


def _run(rev, step: str) -> None:
    """Call upgrade()/downgrade() the way alembic does: the module's `op`
    proxy resolves inside Operations.context() on a MigrationContext bound to
    a live connection. Committed on exit."""
    with engine.begin() as conn:
        ctx = MigrationContext.configure(conn)
        with Operations.context(ctx):
            getattr(rev, step)()


def _present_tables() -> set[str]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
                "AND table_name = ANY(:names)"
            ),
            {"names": list(RESCUE_TABLES)},
        ).scalars()
        return set(rows)


def _users_has_counter() -> bool:
    with engine.connect() as conn:
        return bool(
            conn.execute(
                text(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_name = 'users' "
                    "AND column_name = 'rescue_no_show_count'"
                )
            ).first()
        )


def _constraint_defs(table: str) -> dict[str, str]:
    """name -> `pg_get_constraintdef`. The DEFINITION, not just the name: a
    constraint whose name survives while its column list changes is exactly
    the mutation a name-only assertion cannot see, and `alembic check` does
    not diff CHECK conditions either (models.py:1146-1151).
    """
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint "
                "WHERE conrelid = CAST(:t AS regclass)"
            ),
            {"t": table},
        ).all()
        return {name: definition for name, definition in rows}


def _column_spec(table: str, column: str) -> tuple[str, str | None]:
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT is_nullable, column_default FROM information_schema.columns "
                "WHERE table_name = :t AND column_name = :c"
            ),
            {"t": table, "c": column},
        ).first()
        assert row is not None, f"{table}.{column} missing"
        return row[0], row[1]


def _to_pre_revision_state() -> None:
    """The schema as it stood before a1c9f3e8d204. conftest built this database
    with create_all, so the four tables and the counter column are already
    there; the revision has to be able to create them, which means removing
    them first. This goes through Base.metadata / Operations — the same
    mechanism conftest.py:201 uses — not hand-written DDL text.
    """
    tables = [Base.metadata.tables[name] for name in RESCUE_TABLES]
    with engine.begin() as conn:
        Base.metadata.drop_all(bind=conn, tables=tables)
        ctx = MigrationContext.configure(conn)
        Operations(ctx).drop_column("users", "rescue_no_show_count")


@pytest.fixture
def restore_schema(rev):
    """Safety net, not the rewind: the test rewinds the schema itself, because
    it has to seed a row BEFORE the counter column goes away (an ORM INSERT
    names every mapped column, so a user created after the rewind fails). This
    fixture only guarantees the database is handed back the way conftest's
    create_all built it, however the test ends — the autouse per-test cleanup
    fixture and every later module still see all four tables.
    """
    yield
    if _present_tables() != set(RESCUE_TABLES) or not _users_has_counter():
        _run(rev, "upgrade")


def test_revision_vocabularies_match_the_models(rev):
    """The literal CHECK strings in the revision are the model tuples.

    Reads the revision's SOURCE, not its effect: a CHECK built by string
    formatting in the model cannot drift from itself, but the revision's
    hand-written literal can, and `alembic check` does not diff CHECK
    conditions (models.py:1146-1151).
    """
    with open(_REV_FILE, encoding="utf-8") as fh:
        src = fh.read()
    # The module docstring NAMES the fields the pilot drops, so the bans below
    # have to read the code only — otherwise they fire on the prose explaining
    # why the fields are absent, and the test can never go green.
    doc = ast.get_docstring(ast.parse(src), clean=False)
    code = src.replace(f'"""{doc}"""', "", 1) if doc else src
    assert "Revision ID: a1c9f3e8d204" not in code, "docstring not stripped"

    def literal(name: str) -> tuple[str, ...]:
        m = re.search(
            r'"status IN \(([^)]*)\)",\s*\n?\s*name="' + name + '"',
            code,
        )
        assert m, f"no CHECK literal found for {name}"
        return tuple(v.strip().strip("'") for v in m.group(1).split(","))

    assert literal("rescue_offers_status_check") == RESCUE_OFFER_STATUSES
    assert literal("rescue_orders_status_check") == RESCUE_ORDER_STATUSES
    # The pilot has no payment: 'paid' must not be reachable from either side.
    assert "paid" not in RESCUE_ORDER_STATUSES
    assert "paid" not in literal("rescue_orders_status_check")
    # And no payment column slipped in with it.
    assert "amount_agorot" not in code
    assert "paid_at" not in code


def test_upgrade_downgrade_upgrade_round_trip(db, rev, restore_schema):
    # An account that predates the column, so the re-add has a row to fill.
    # Seeded BEFORE the rewind on purpose — see restore_schema.
    existing = make_user(db, email="pre-rescue@example.com")
    existing_id = existing.id
    db.commit()
    assert existing_id is not None

    _to_pre_revision_state()

    assert _present_tables() == set()
    assert _users_has_counter() is False

    _run(rev, "upgrade")
    assert _present_tables() == set(RESCUE_TABLES)
    assert _users_has_counter() is True
    # The server_default did the backfill — no separate pass, no NULL.
    with engine.connect() as conn:
        assert (
            conn.execute(
                text("SELECT rescue_no_show_count FROM users WHERE id = :i"),
                {"i": existing_id},
            ).scalar()
            == 0
        )
    # The column the pilot's 422 gate reads: NOT NULL, defaulting to 0.
    nullable, default = _column_spec("users", "rescue_no_show_count")
    assert nullable == "NO"
    assert default is not None and default.startswith("0")

    # What the REVISION built, read back from the catalog by definition.
    orders = _constraint_defs("rescue_orders")
    # Per offer, not global: both columns, in this order.
    assert orders["uq_rescue_orders_code"] == "UNIQUE (offer_id, pickup_code)"
    status_def = orders["rescue_orders_status_check"]
    for value in RESCUE_ORDER_STATUSES:
        assert f"'{value}'" in status_def
    assert "'paid'" not in status_def, "the pilot has no payment"
    assert "qty <= 2" in orders["rescue_orders_qty_check"]
    assert "handed_by" in orders["rescue_orders_handed_by_fkey"]
    # SET NULL, not CASCADE: losing the staff account must not lose the record
    # that the bag was handed over.
    assert "ON DELETE SET NULL" in orders["rescue_orders_handed_by_fkey"]

    offers = _constraint_defs("rescue_offers")
    qty_left_def = offers["rescue_offers_qty_left_check"]
    assert "qty_left >= 0" in qty_left_def
    assert "qty_left <= qty_total" in qty_left_def, "oversell guard missing"

    reviews = _constraint_defs("rescue_reviews")
    assert reviews["uq_rescue_reviews_order"] == "UNIQUE (order_id)"

    typical = _constraint_defs("rescue_typical_items")
    assert typical["uq_rescue_typical_items_producer"] == "UNIQUE (producer_id)"

    _run(rev, "downgrade")
    assert _present_tables() == set(), "downgrade left a rescue table behind"
    assert _users_has_counter() is False, "downgrade left the counter column"

    # A failed deploy retried: upgrade must work a second time.
    _run(rev, "upgrade")
    assert _present_tables() == set(RESCUE_TABLES)
    assert _users_has_counter() is True


def _seed_offer(db, *, qty_total=4, qty_left=4):
    producer = make_producer(db, name=f"מאפיית בדיקה {uuid.uuid4().hex[:6]}")
    location = ProducerLocation(
        producer_id=producer.id,
        kind="branch",
        is_primary=True,
        city="חיפה",
        lat=32.7940,
        lng=34.9896,
        location_precision="exact",
    )
    db.add(location)
    db.commit()
    offer_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO rescue_offers (id, producer_location_id, date, qty_total,"
            " qty_left, price_agorot, pickup_start, pickup_end, cancel_until,"
            " status, created_at) VALUES (:id, :loc, CURRENT_DATE, :total, :left,"
            " 1500, now(), now() + interval '2 hours', now() + interval '1 hour',"
            " 'active', now())"
        ),
        {"id": offer_id, "loc": location.id, "total": qty_total, "left": qty_left},
    )
    db.commit()
    return offer_id


def _insert_order(db, offer_id, user_id, code, qty=1):
    db.execute(
        text(
            "INSERT INTO rescue_orders (id, offer_id, user_id, qty, pickup_code,"
            " status, created_at) VALUES (:id, :offer, :user, :qty, :code,"
            " 'reserved', now())"
        ),
        {
            "id": uuid.uuid4(),
            "offer": offer_id,
            "user": user_id,
            "qty": qty,
            "code": code,
        },
    )
    db.commit()


def test_pickup_code_is_unique_per_offer_not_globally(db):
    """Two businesses may both issue 0431 on the same evening; one business
    may not issue it twice for the same bag."""
    buyer = make_user(db, email="buyer-a@example.com")
    other = make_user(db, email="buyer-b@example.com")
    db.commit()

    offer_one = _seed_offer(db)
    offer_two = _seed_offer(db)

    _insert_order(db, offer_one, buyer.id, "0431")
    # Same code, different offer: allowed.
    _insert_order(db, offer_two, buyer.id, "0431")

    # Same code, same offer: refused, or the business cannot type 4 digits and
    # land on exactly one order.
    with pytest.raises(IntegrityError):
        _insert_order(db, offer_one, other.id, "0431")
    db.rollback()


def test_pickup_code_must_be_four_digits(db):
    buyer = make_user(db, email="buyer-c@example.com")
    db.commit()
    offer = _seed_offer(db)
    for bad in ("abcd", "12 4", "0 42"):
        with pytest.raises(IntegrityError):
            _insert_order(db, offer, buyer.id, bad)
        db.rollback()


def test_qty_left_cannot_exceed_total_or_go_negative(db):
    """The CHECK that turns a lost oversell race into a failed transaction
    rather than negative stock (chunk 2 locks with with_for_update)."""
    with pytest.raises(IntegrityError):
        _seed_offer(db, qty_total=2, qty_left=3)
    db.rollback()

    with pytest.raises(IntegrityError):
        _seed_offer(db, qty_total=2, qty_left=-1)
    db.rollback()


def test_order_qty_is_capped_at_two(db):
    """The pilot's "max 2 bags" rule, held at the database and not only in a
    chunk-2 validator."""
    buyer = make_user(db, email="buyer-d@example.com")
    db.commit()
    offer = _seed_offer(db, qty_total=20, qty_left=20)
    _insert_order(db, offer, buyer.id, "0001", qty=2)
    with pytest.raises(IntegrityError):
        _insert_order(db, offer, buyer.id, "0002", qty=3)
    db.rollback()
