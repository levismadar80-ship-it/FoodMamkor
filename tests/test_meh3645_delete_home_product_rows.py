"""MEH-3645 — the migration empties the three neighbour-listing tables and
touches nothing else.

Driven through a real alembic Operations context, like
tests/test_merge_orphan_category.py.
"""
import importlib.util
import os

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from conftest import make_producer, make_user

from app.database import engine
from app.models import (
    Category,
    HomeProduct,
    HomeProductRating,
    HomeProductWhatsAppClick,
    Producer,
    Product,
    User,
)

_REV_FILE = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "backend",
        "alembic",
        "versions",
        "20261121_1940_d6f8b0c2e4a7_meh3645_delete_home_product_rows.py",
    )
)


@pytest.fixture(scope="module")
def rev():
    spec = importlib.util.spec_from_file_location("rev_d6f8b0c2e4a7", _REV_FILE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.revision == "d6f8b0c2e4a7"
    return mod


def _run(rev, step: str) -> None:
    with engine.begin() as conn:
        ctx = MigrationContext.configure(conn)
        with Operations.context(ctx):
            getattr(rev, step)()


def _seed(db):
    seller = make_user(db, email="seller@example.com")
    buyer = make_user(db, email="buyer@example.com")
    hp = HomeProduct(user_id=seller.id, title="עוגה", phone="0501234567", street="הרצל 1", zip_code="1234567")
    db.add(hp)
    db.flush()
    click = HomeProductWhatsAppClick(user_id=buyer.id, home_product_id=hp.id)
    db.add(click)
    db.flush()
    db.add(HomeProductRating(click_id=click.id, user_id=buyer.id, home_product_id=hp.id, stars=5))
    db.commit()


def test_upgrade_deletes_every_listing_rating_and_click(db, rev):
    _seed(db)
    assert db.query(HomeProduct).count() == 1
    assert db.query(HomeProductRating).count() == 1
    assert db.query(HomeProductWhatsAppClick).count() == 1
    _run(rev, "upgrade")
    db.expire_all()
    assert db.query(HomeProduct).count() == 0
    assert db.query(HomeProductRating).count() == 0
    assert db.query(HomeProductWhatsAppClick).count() == 0


def test_upgrade_leaves_users_and_businesses(db, rev):
    _seed(db)
    make_producer(db)
    before = [db.query(m).count() for m in (User, Producer, Product, Category)]
    _run(rev, "upgrade")
    db.expire_all()
    assert [db.query(m).count() for m in (User, Producer, Product, Category)] == before
    assert before[0] == 2 and before[1] == 1  # the seed is really there

