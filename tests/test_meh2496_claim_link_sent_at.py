"""MEH-2496 (MEH-2494 sub-card B) — `producers.claim_link_sent_at`.

`POST /admin/producers/{id}/claim-link` stamps when the latest owner-claim
link was minted, in the same transaction, on success only. The drafts list
reads it (admin-only) to show «קישור נשלח ב-…» and the 7-day marker.

Two halves:
  - behaviour: stamp on success, overwrite on re-mint, nothing on any refusal,
    admin-only exposure;
  - the revision itself, read with `ast` (docs/MIGRATIONS.md: the instrument
    is ast, not grep). The session cannot run `alembic upgrade/downgrade`
    (.claude/settings.json deny), and pytest builds its schema with
    create_all, so this is what pins the downgrade's content. CI's fresh
    `alembic upgrade head` + `alembic check` covers the upgrade path.

Each guard was shown red against a construction that removes exactly it — see
the PR body.
"""

import ast
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import DateTime

from conftest import auth_header, make_producer, make_user
from app.models import Producer
from app.schemas.schemas import (
    ProducerAdminOut,
    ProducerDetailOut,
    ProducerListOut,
    ProducerOwnerOut,
)

VERSIONS = Path(__file__).resolve().parents[1] / "backend" / "alembic" / "versions"
REVISION = "8600916f1942"
PRECEDENT = "2c1033ca5745"  # MEH-2210 resubmitted_at — a real, known revision


def _link(pid):
    return f"/admin/producers/{pid}/claim-link"


def _stamp(db, producer):
    db.expire_all()
    return db.get(Producer, producer.id).claim_link_sent_at


def _own(db, producer):
    u = make_user(db, role="producer")
    u.producer_id = producer.id
    db.commit()
    return u


# ---------- behaviour ----------


class TestStamp:
    def test_success_stamps_now(self, client, db):
        admin = make_user(db, role="admin")
        d = make_producer(db, status="draft")
        before = datetime.now(timezone.utc)
        r = client.post(_link(d.id), headers=auth_header(admin))
        after = datetime.now(timezone.utc)
        assert r.status_code == 200, r.text
        stamp = _stamp(db, d)
        assert stamp is not None
        assert stamp.tzinfo is not None
        assert before <= stamp <= after

    def test_second_mint_overwrites_with_a_later_stamp(self, client, db):
        admin = make_user(db, role="admin")
        d = make_producer(db, status="draft")
        assert client.post(_link(d.id), headers=auth_header(admin)).status_code == 200
        first = _stamp(db, d)
        assert client.post(_link(d.id), headers=auth_header(admin)).status_code == 200
        assert _stamp(db, d) > first

    def test_never_minted_draft_reads_null(self, client, db):
        admin = make_user(db, role="admin")
        d = make_producer(db, status="draft")
        r = client.get(f"/admin/producers/{d.id}", headers=auth_header(admin))
        assert r.status_code == 200, r.text
        assert r.json()["claim_link_sent_at"] is None


class TestRefusalsStampNothing:
    @pytest.mark.parametrize("status", ["pending", "approved", "rejected", "inactive"])
    def test_409_not_a_draft(self, client, db, status):
        admin = make_user(db, role="admin")
        p = make_producer(db, status=status)
        assert client.post(_link(p.id), headers=auth_header(admin)).status_code == 409
        assert _stamp(db, p) is None

    def test_409_already_claimed(self, client, db):
        admin = make_user(db, role="admin")
        d = make_producer(db, status="draft")
        _own(db, d)
        assert client.post(_link(d.id), headers=auth_header(admin)).status_code == 409
        assert _stamp(db, d) is None

    def test_409_keeps_the_previous_stamp_untouched(self, client, db):
        admin = make_user(db, role="admin")
        d = make_producer(db, status="draft")
        assert client.post(_link(d.id), headers=auth_header(admin)).status_code == 200
        minted = _stamp(db, d)
        _own(db, d)
        assert client.post(_link(d.id), headers=auth_header(admin)).status_code == 409
        assert _stamp(db, d) == minted

    def test_non_admin_403_stamps_nothing(self, client, db):
        consumer = make_user(db)
        d = make_producer(db, status="draft")
        assert (
            client.post(_link(d.id), headers=auth_header(consumer)).status_code == 403
        )
        assert _stamp(db, d) is None


class TestAdminOnly:
    def test_declared_on_the_admin_shape_only(self):
        assert "claim_link_sent_at" in ProducerAdminOut.model_fields
        for shape in (ProducerListOut, ProducerDetailOut, ProducerOwnerOut):
            assert "claim_link_sent_at" not in shape.model_fields, shape.__name__

    def test_admin_list_carries_the_stamp(self, client, db):
        admin = make_user(db, role="admin")
        d = make_producer(db, status="draft")
        client.post(_link(d.id), headers=auth_header(admin))
        r = client.get(
            "/admin/producers", params={"status": "draft"}, headers=auth_header(admin)
        )
        row = {x["id"]: x for x in r.json()}[str(d.id)]
        assert row["claim_link_sent_at"] is not None

    def test_public_detail_does_not_carry_it(self, client, db):
        admin = make_user(db, role="admin")
        p = make_producer(db, status="draft")
        client.post(_link(p.id), headers=auth_header(admin))
        p.status = "approved"
        db.commit()
        r = client.get(f"/producers/{p.id}")
        assert r.status_code == 200, r.text
        assert "claim_link_sent_at" not in r.json()


class TestModelColumn:
    def test_tz_aware_nullable_no_server_default(self):
        col = Producer.__table__.c.claim_link_sent_at
        assert isinstance(col.type, DateTime)
        assert col.type.timezone is True
        assert col.nullable is True
        assert col.server_default is None


# ---------- the revision, read with ast ----------


def _revision_file(rev):
    hits = [p for p in VERSIONS.glob("*.py") if _module_str(p, "revision") == rev]
    assert len(hits) == 1, f"{rev}: {hits}"
    return hits[0]


def _module_str(path, name):
    for node in ast.parse(path.read_text(encoding="utf-8")).body:
        target = (
            node.target
            if isinstance(node, ast.AnnAssign)
            else node.targets[0]
            if isinstance(node, ast.Assign)
            else None
        )
        if isinstance(target, ast.Name) and target.id == name:
            return ast.literal_eval(node.value) if node.value is not None else None
    return None


def _op_calls(path, func_name):
    """Every `op.<x>(...)` lexically inside the top-level `func_name`."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    fn = next(
        n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == func_name
    )
    return [
        n
        for n in ast.walk(fn)
        if isinstance(n, ast.Call)
        and isinstance(n.func, ast.Attribute)
        and isinstance(n.func.value, ast.Name)
        and n.func.value.id == "op"
    ]


def _kw(call, name):
    return next((k.value for k in call.keywords if k.arg == name), None)


class TestRevisionShape:
    def test_self_test_reader_on_a_real_precedent_revision(self):
        # Control FIRST (testing.md): the reader must see what a known file
        # holds — 2c1033ca5745 adds 3 producers columns and drops the same 3.
        # If this fails, every assertion below is void.
        path = _revision_file(PRECEDENT)
        ups = _op_calls(path, "upgrade")
        downs = _op_calls(path, "downgrade")
        assert [c.func.attr for c in ups] == ["add_column"] * 3
        assert [c.func.attr for c in downs] == ["drop_column"] * 3
        assert _module_str(path, "down_revision") == "e6b2d4f81a37"

    def test_chains_onto_an_existing_revision(self):
        down = _module_str(_revision_file(REVISION), "down_revision")
        assert down == "c3d8e2f1a9b4"  # MEH-2528 retired_slugs, the head when this merged
        _revision_file(down)  # exists exactly once

    def test_upgrade_adds_exactly_the_one_nullable_tz_column(self):
        calls = _op_calls(_revision_file(REVISION), "upgrade")
        assert [c.func.attr for c in calls] == ["add_column"]
        table, column = calls[0].args
        assert ast.literal_eval(table) == "producers"
        assert ast.literal_eval(column.args[0]) == "claim_link_sent_at"
        col_type = column.args[1]
        assert col_type.func.attr == "DateTime"
        assert ast.literal_eval(_kw(col_type, "timezone")) is True
        assert ast.literal_eval(_kw(column, "nullable")) is True
        assert _kw(column, "server_default") is None

    def test_downgrade_drops_exactly_that_column(self):
        calls = _op_calls(_revision_file(REVISION), "downgrade")
        assert [c.func.attr for c in calls] == ["drop_column"]
        assert [ast.literal_eval(a) for a in calls[0].args] == [
            "producers",
            "claim_link_sent_at",
        ]

    def test_no_execute_or_backfill_anywhere(self):
        path = _revision_file(REVISION)
        names = {
            c.func.attr for f in ("upgrade", "downgrade") for c in _op_calls(path, f)
        }
        assert names == {"add_column", "drop_column"}


class TestFrontendTtlMatchesTheToken:
    # AdminDraftLinkAge.jsx derives «בתוקף עד» / «הקישור פג» from its own
    # CLAIM_LINK_TTL_DAYS. The token lifetime is auth.PRODUCER_CLAIM_TTL_DAYS.
    # Two owners for one fact — this is the guard that keeps them one.
    def test_admin_link_age_constant_equals_the_token_ttl(self):
        import re

        from app.auth import PRODUCER_CLAIM_TTL_DAYS

        src = (
            Path(__file__).resolve().parents[1]
            / "frontend"
            / "app"
            / "[locale]"
            / "admin"
            / "producers"
            / "AdminDraftLinkAge.jsx"
        ).read_text(encoding="utf-8")
        hits = re.findall(r"^const CLAIM_LINK_TTL_DAYS = (\d+);$", src, flags=re.M)
        assert len(hits) == 1, hits  # exactly one definition, found
        assert int(hits[0]) == PRODUCER_CLAIM_TTL_DAYS
