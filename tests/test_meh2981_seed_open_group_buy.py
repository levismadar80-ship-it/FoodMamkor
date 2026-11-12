"""MEH-2981 — a plain seed run restores the demo group buy, without --refresh.

On staging the demo group buy (relative deadline) expires, `GET /group-buys`
goes empty and the «קבוצות רכישה» hub tab disappears. `seed_open_group_buy`
adds one only when none is open with a future deadline, and never deletes.
"""

import importlib.util
import os
from datetime import timedelta

import pytest

from app.models.models import GroupBuy, Producer
from app.utils.clock import utc_now

from tests.conftest import make_category

_SCRIPT = os.path.join(
    os.path.dirname(__file__), "..", "backend", "scripts", "seed_demo_business.py"
)


@pytest.fixture()
def seed_mod():
    spec = importlib.util.spec_from_file_location("seed_demo_business", _SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def demo(db, seed_mod):
    make_category(db, name=seed_mod.DEMO_CATEGORY_NAME, emoji="🍞")
    producer = seed_mod.seed_demo_business(db)
    assert producer is not None
    return db.query(Producer).filter(Producer.slug == seed_mod.DEMO_SLUG).one()


def _open_live(db, producer_id):
    return (
        db.query(GroupBuy)
        .filter(
            GroupBuy.producer_id == producer_id,
            GroupBuy.status == "open",
            GroupBuy.deadline >= utc_now(),
        )
        .count()
    )


def test_live_group_buy_is_left_alone(db, seed_mod, demo):
    # The fresh seed already created one open, future group buy.
    before = db.query(GroupBuy).filter(GroupBuy.producer_id == demo.id).count()
    assert _open_live(db, demo.id) == 1

    assert seed_mod.seed_open_group_buy(db) is False
    assert db.query(GroupBuy).filter(GroupBuy.producer_id == demo.id).count() == before


def test_expired_group_buy_gets_a_fresh_one_and_is_kept(db, seed_mod, demo):
    expired = db.query(GroupBuy).filter(GroupBuy.producer_id == demo.id).one()
    expired.deadline = utc_now() - timedelta(days=1)
    db.commit()
    assert _open_live(db, demo.id) == 0

    assert seed_mod.seed_open_group_buy(db) is True
    assert _open_live(db, demo.id) == 1
    # Nothing deleted: the expired row is still there, untouched.
    rows = db.query(GroupBuy).filter(GroupBuy.producer_id == demo.id).all()
    assert len(rows) == 2
    assert any(r.id == expired.id for r in rows)

    # Idempotent: a second run adds nothing.
    assert seed_mod.seed_open_group_buy(db) is False
    assert db.query(GroupBuy).filter(GroupBuy.producer_id == demo.id).count() == 2


def test_no_demo_producer_is_a_no_op(db, seed_mod):
    assert seed_mod.seed_open_group_buy(db) is False
    assert db.query(GroupBuy).count() == 0


def test_refresh_then_plain_run_does_not_double_up(db, seed_mod, demo):
    # --refresh recreates the business (and its group buy); the follow-up call
    # in main() must see that one as live and add nothing.
    seed_mod.seed_demo_business(db, refresh=True)
    producer = db.query(Producer).filter(Producer.slug == seed_mod.DEMO_SLUG).one()
    assert seed_mod.seed_open_group_buy(db) is False
    assert _open_live(db, producer.id) == 1
