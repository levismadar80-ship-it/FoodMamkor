"""MEH-2782: alembic f2b8d4c61a07 moves rows off the two removed values.

Driven through a real alembic Operations context (same harness as
tests/test_merge_orphan_category.py), so the test runs the revision's own
upgrade(), not a copy of its SQL. Reviewer ask on #4126.
"""

import importlib.util
import os

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from conftest import make_producer

from app.database import engine

_REV_FILE = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "backend",
        "alembic",
        "versions",
        "20261107_1700_f2b8d4c61a07_meh2782_drop_legacy_availability_values.py",
    )
)


@pytest.fixture(scope="module")
def rev():
    spec = importlib.util.spec_from_file_location("rev_f2b8d4c61a07", _REV_FILE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.revision == "f2b8d4c61a07"
    assert mod.down_revision == "a3f7c21e9b05"
    return mod


def _upgrade(rev) -> None:
    with engine.begin() as conn:
        ctx = MigrationContext.configure(conn)
        with Operations.context(ctx):
            rev.upgrade()


def test_upgrade_moves_both_removed_values_and_keeps_the_others(db, rev):
    rows = {}
    for state in (
        "available_today",
        "full_this_week",
        "on_vacation",
        "accepting_orders",
    ):
        p = make_producer(db, name=f"מצב {state}")
        p.availability_state = state
        rows[state] = p
    db.commit()

    _upgrade(rev)

    got = {}
    for state, p in rows.items():
        db.refresh(p)
        got[state] = p.availability_state
    assert got == {
        "available_today": "accepting_orders",
        "full_this_week": "accepting_orders",
        "on_vacation": "on_vacation",
        "accepting_orders": "accepting_orders",
    }
