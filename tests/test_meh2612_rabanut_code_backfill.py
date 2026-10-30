"""MEH-2612 — the data revision turns «rabanut_mekomit» into «rabanut».

The seed wrote a code nothing knows (see test_seed_demo_producers_kashrut.py);
revision 4b7e1d2c9a60 rewrites the staging rows it already inserted. The SQL is
captured from the revision's own upgrade() — never a copy — and run against the
test database.
"""

import importlib.util
import os

from sqlalchemy import text

from app.models.models import Producer
from tests.conftest import make_producer

_REVISION = os.path.join(
    os.path.dirname(__file__),
    "..",
    "backend",
    "alembic",
    "versions",
    "20261030_1430_4b7e1d2c9a60_meh2612_rabanut_code_backfill.py",
)


def _upgrade_sql(monkeypatch):
    spec = importlib.util.spec_from_file_location("meh2612_rev", _REVISION)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    captured = []
    monkeypatch.setattr(mod.op, "execute", captured.append)
    mod.upgrade()
    assert len(captured) == 1, captured
    return captured[0]


def _badges(db, producer):
    db.expire_all()
    return db.get(Producer, producer.id).kashrut_badges


def test_backfill_rewrites_only_the_bad_code(db, monkeypatch):
    bad = make_producer(db, name="מאפיית קוד ישן")
    both = make_producer(db, name="מאפיית שני קודים")
    other = make_producer(db, name="מאפיית בדצ")
    none = make_producer(db, name="מאפיית בלי כשרות")
    bad.kashrut_badges = ["rabanut_mekomit"]
    both.kashrut_badges = ["rabanut", "rabanut_mekomit"]
    other.kashrut_badges = ["badatz"]
    none.kashrut_badges = []
    db.commit()

    sql = _upgrade_sql(monkeypatch)
    db.execute(text(sql))
    db.commit()

    assert _badges(db, bad) == ["rabanut"]
    assert _badges(db, both) == ["rabanut"]  # one code, not two
    assert _badges(db, other) == ["badatz"]
    assert _badges(db, none) == []

    # Idempotent: a second run changes nothing.
    db.execute(text(sql))
    db.commit()
    assert _badges(db, bad) == ["rabanut"]
    assert _badges(db, both) == ["rabanut"]
