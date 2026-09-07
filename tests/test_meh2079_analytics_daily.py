"""
Module:   test_meh2079_analytics_daily
Purpose:  Chunk A guard for `producer_analytics_daily` — the table exists with
          the declared shape, one row per (producer, day), CASCADE on the
          business, and NOTHING reads or writes it yet.
Touches:  The test DB via `db` (inserts aggregate rows). No HTTP.
Does NOT: assert the roll-up job (chunk B) or the purge (chunk C). Neither
          exists, and a test that pretended to cover them would be the
          "artifact that asserts coverage" shape.
Related:  backend/app/models/models.py::ProducerAnalyticsDaily;
          backend/alembic/versions/20260906_1100_c4a9e2b7d3f8_*.py;
          backend/alembic/versions/20260906_2040_0396917da2ea_*.py;
          docs/ci/meh-2079-expected-tables-43.patch.md.
History:  MEH-2079 chunk A (creation, 06/09);
          MEH-2282 chunk B1 (the id server default, 06/09).

WHY "NOTHING READS IT" IS AN ASSERTION AND NOT A COMMENT
--------------------------------------------------------
Expand-only is the property that makes this mergeable ahead of the purge: the
table can appear on production and change nothing. A comment claiming that is
exactly the kind of coverage assertion nobody re-checks, so it is measured
here against the source tree instead.
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import pytest
import sqlalchemy as sa
from conftest import make_producer
from sqlalchemy.exc import IntegrityError

from app.models.models import Producer, ProducerAnalyticsDaily

REPO = Path(__file__).resolve().parents[1]


# ── shape ─────────────────────────────────────────────────────────────────
def test_the_table_carries_three_counts_and_a_day():
    cols = {c.name: c for c in ProducerAnalyticsDaily.__table__.columns}
    assert set(cols) == {
        "id",
        "producer_id",
        "day",
        "views_unique",
        "views_search_unique",
        "whatsapp_clicks",
    }
    # A DATE, not a timestamp: the grain is an Israel calendar day, and a
    # timestamp here re-creates the MEH-1883 class of bug.
    assert isinstance(cols["day"].type, sa.Date)
    assert not isinstance(cols["day"].type, sa.DateTime)
    for name in ("views_unique", "views_search_unique", "whatsapp_clicks"):
        assert isinstance(cols[name].type, sa.Integer), name
        # NOT NULL with a 0 default: an upsert that touches one column must not
        # leave the others NULL, or every SUM over the table becomes NULL.
        assert cols[name].nullable is False, name
        assert cols[name].server_default is not None, name


def test_it_carries_nothing_about_a_person():
    """The licence to keep this table unbounded, while the rows it summarises
    are deleted at 90 days, is that it is anonymous. `viewer_ip_hash` is
    pseudonymous (salted SHA-256, re-identifiable with the salt) and is
    personal data under Amendment 13; a per-business per-day count is not.

    Asserted by NAME so that adding any of them later goes red here rather
    than in a privacy review."""
    cols = set(ProducerAnalyticsDaily.__table__.columns.keys())
    for forbidden in ("viewer_ip_hash", "city", "user_id", "ip", "referrer"):
        assert forbidden not in cols, forbidden


def test_one_row_per_business_per_day(db):
    p = make_producer(db, name="עסק לאגרגט")
    today = date(2026, 9, 1)
    db.add(ProducerAnalyticsDaily(producer_id=p.id, day=today, views_unique=4))
    db.commit()

    # A second row for the same day must be refused — chunk B's roll-up upserts
    # on this constraint, so without it a re-run would double every count
    # instead of correcting it.
    db.add(ProducerAnalyticsDaily(producer_id=p.id, day=today, views_unique=9))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    # The mirror: a DIFFERENT day is fine, or the constraint is on the wrong
    # columns and the assertion above passes for the wrong reason.
    db.add(
        ProducerAnalyticsDaily(
            producer_id=p.id, day=today + timedelta(days=1), views_unique=9
        )
    )
    db.commit()
    assert (
        db.query(ProducerAnalyticsDaily)
        .filter(ProducerAnalyticsDaily.producer_id == p.id)
        .count()
        == 2
    )


def test_the_aggregate_dies_with_the_business(db):
    """Retention and deletion are different rights, and the card is explicit
    that the existing CASCADE is not a substitute for a retention window. It is
    still the correct behaviour for deletion: a deleted business's numbers go
    with it, anonymous or not."""
    p = make_producer(db, name="עסק שיימחק")
    db.add(ProducerAnalyticsDaily(producer_id=p.id, day=date(2026, 9, 2)))
    db.commit()
    assert db.query(ProducerAnalyticsDaily).count() == 1

    db.query(Producer).filter(Producer.id == p.id).delete()
    db.commit()
    assert db.query(ProducerAnalyticsDaily).count() == 0


# ── expand-only ───────────────────────────────────────────────────────────
def test_nothing_reads_or_writes_it_in_chunk_a():
    """The property that makes this safe to merge before the purge exists.

    Two declaration sites are expected and allowed: the model itself and the
    package export. A third mention means a reader or a writer arrived, which
    is chunk B — and chunk B changes what a downgrade costs, so it must not
    ride in on this PR unnoticed.
    """
    # NO SUBPROCESS. Three review rounds landed on this one probe — an
    # unchecked exit code, then GNU-only `\\|` alternation that a BSD grep
    # reads literally — and both had the same shape: the shell-out has
    # semantics (exit codes, regex dialects, PATH) that are not the subject of
    # this test and that fail by producing a MISLEADING message rather than an
    # honest one. Reading the files directly removes the whole class instead of
    # patching its third instance.
    root = REPO / "backend" / "app"
    scanned = 0
    files = set()
    for path in sorted(root.rglob("*.py")):
        scanned += 1
        text = path.read_text(encoding="utf-8")
        if "ProducerAnalyticsDaily" in text or "producer_analytics_daily" in text:
            files.add(path.relative_to(REPO).as_posix())

    # CONTROL: the scan actually walked a source tree. Without this, a wrong
    # `root` yields zero files, zero matches, and an assertion that reads as
    # "nothing references the table" — the reassuring null.
    #
    # 50 rather than the current count: the tree holds 99 files today
    # (measured — the first draft said 100 and reddened immediately, which is
    # the control doing its job on its own author), and a bound pinned to the
    # live number would fail on the next file anyone deletes while a wrong
    # root still produces 0.
    assert scanned > 50, (
        f"only {scanned} .py files under {root} — the scan is aimed wrong"
    )

    # MEH-2283 (chunk B2): the reader and the writer arrived, and they are
    # the ONLY two sites allowed to — plus the scheduler wiring that names
    # the job. A sixth file means a second writer or a second reader, which
    # is the two-parallel-mechanisms smell (workflow.md, MEH-271) and the
    # exact thing `unique_views_count`'s docstring warns about for readers.
    assert files == {
        "backend/app/models/models.py",
        "backend/app/models/__init__.py",
        "backend/app/services/analytics_rollup.py",
        "backend/app/routers/producer_me.py",
        "backend/app/startup.py",
    }, files


# ── MEH-2282 (chunk B1): the DB can mint the id itself ──────────────────────
#
# Chunk B2's roll-up writes with a raw `INSERT … ON CONFLICT DO NOTHING` that
# never instantiates the ORM class, so `default=uuid.uuid4` is never consulted
# on the one path that writes every row. The column therefore needs a
# server-side default, declared on BOTH the model and a migration.
#
# The test DB is built from `Base.metadata.create_all` (conftest.py:200), so
# the model's `server_default` IS the default the test DB carries — which makes
# the raw-INSERT case below an end-to-end check of the ORM half, not a
# metadata read. The migration half is asserted by parsing the revision file:
# the migration is never applied in the test DB, and MEH-1909 is explicit that
# a probe over a revision file must be anchored to the REAL file, not a fixture.


def test_id_declares_a_server_default_on_the_model():
    col = ProducerAnalyticsDaily.__table__.columns["id"]
    assert col.server_default is not None
    assert "gen_random_uuid()" in str(col.server_default.arg)
    # The Python-side default stays: the ORM path must keep working unchanged.
    assert col.default is not None


def test_a_raw_insert_with_no_id_is_minted_one_by_the_db(db):
    """The behaviour the default exists for. Against the pre-MEH-2282 model
    this raises IntegrityError (NOT NULL on id) — the exact failure chunk
    B2's writer would hit."""
    p = make_producer(db, name="B1 raw-insert")
    db.commit()
    res = db.execute(
        sa.text(
            "INSERT INTO producer_analytics_daily (producer_id, day) "
            "VALUES (:pid, :day) RETURNING id"
        ),
        {"pid": p.id, "day": date(2026, 9, 1)},
    )
    minted = res.scalar_one()
    db.commit()
    assert minted is not None
    row = db.get(ProducerAnalyticsDaily, minted)
    assert row is not None and row.producer_id == p.id
    # The count defaults still apply on the same raw path — a partial INSERT
    # must not leave NULLs that poison every SUM (chunk A's own guarantee).
    assert (row.views_unique, row.views_search_unique, row.whatsapp_clicks) == (0, 0, 0)


def test_the_b1_revision_sets_the_default_and_chains_after_chunk_a():
    import ast

    versions = REPO / "backend" / "alembic" / "versions"
    matches = sorted(versions.glob("*_0396917da2ea_*.py"))
    assert len(matches) == 1, matches
    tree = ast.parse(matches[0].read_text(encoding="utf-8"))

    # Identifiers: annotated assignments (the shape this repo's revisions use —
    # MEH-1909 caught a probe that only handled the plain form).
    ids = {
        n.target.id: n.value.value
        for n in tree.body
        if isinstance(n, ast.AnnAssign)
        and isinstance(n.target, ast.Name)
        and isinstance(n.value, ast.Constant)
    }
    assert ids["revision"] == "0396917da2ea"
    assert ids["down_revision"] == "c4a9e2b7d3f8"

    # upgrade() alters exactly producer_analytics_daily.id and sets a
    # gen_random_uuid() server_default; downgrade() clears it.
    def alter_calls(fn_name):
        fn = next(
            n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == fn_name
        )
        out = []
        for node in ast.walk(fn):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr == "alter_column"
            ):
                args = [a.value for a in node.args if isinstance(a, ast.Constant)]
                kw = {k.arg: ast.unparse(k.value) for k in node.keywords}
                out.append((args, kw))
        return out

    up = alter_calls("upgrade")
    assert len(up) == 1
    assert up[0][0] == ["producer_analytics_daily", "id"]
    assert "gen_random_uuid()" in up[0][1]["server_default"]

    down = alter_calls("downgrade")
    assert len(down) == 1
    assert down[0][0] == ["producer_analytics_daily", "id"]
    assert down[0][1]["server_default"] == "None"
