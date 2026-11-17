"""MEH-3306 — the admin audit log (server half).

Every successful change made by an ADMIN ACCOUNT leaves one append-only row:
who, what (method + route template), on what, when, from where. The write is
scheduled inside `get_current_user` — the one place every signed-in request
passes — so it covers a route gated by `require_admin` and equally an owner
route an admin enters through an inline role check. No route carries logging
code, and none can skip it.

What is NOT logged, on purpose, and pinned here: reads (GET), a request that
did not go through (404 / 409 / 422 — nothing changed), and a non-admin who
was refused.
"""

import inspect
import re
import uuid
from pathlib import Path

import importlib.util
import sys

from app.auth import (
    get_current_user,
    get_current_user_lenient,
    get_current_user_optional,
)
from datetime import timedelta

from app.models.admin_ops import AdminAuditLog
from app.models.models import Event
from app.utils.clock import israel_today

from tests.conftest import auth_header, make_producer, make_user

MUTATING = {"POST", "PUT", "PATCH", "DELETE"}
ROOT = Path(__file__).resolve().parents[1]
BACKEND_APP = ROOT / "backend" / "app"

# REUSES: tests/test_meh3022_resource_caps.py — same loader for the collector.
_SPEC = importlib.util.spec_from_file_location(
    "action_map", ROOT / "scripts" / "release" / "action_map.py"
)
am = importlib.util.module_from_spec(_SPEC)
sys.modules.setdefault("action_map", am)
_SPEC.loader.exec_module(am)


def _rows(db):
    db.expire_all()
    return db.query(AdminAuditLog).order_by(AdminAuditLog.created_at).all()


def _write_routes():
    """Every mutating route of the real app, via the repo's own collector
    (scripts/release/action_map.py — the one test_meh3022 walks with)."""
    return [r for r in am.collect_routes(am.load_app()) if set(r.methods) & MUTATING]


def _admin_write_routes():
    return [r for r in _write_routes() if "require_admin" in r.deps]


# ---------- what a row carries ----------


def test_role_change_leaves_one_row_with_actor_action_target_and_before_after(
    client, db
):
    admin = make_user(db, role="admin")
    target = make_user(db, role="consumer")
    resp = client.put(
        f"/admin/users/{target.id}/role",
        json={"role": "admin"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    rows = _rows(db)
    assert len(rows) == 1
    row = rows[0]
    assert row.actor_id == admin.id
    assert row.action == "PUT /admin/users/{user_id}/role"
    assert (row.target_type, row.target_id) == ("user", str(target.id))
    assert row.details == {"before": {"role": "consumer"}, "after": {"role": "admin"}}
    assert row.created_at is not None and row.created_at.tzinfo is not None
    assert row.ip


def test_block_toggle_records_the_new_state(client, db):
    admin = make_user(db, role="admin")
    target = make_user(db, role="consumer")
    client.post(f"/admin/users/{target.id}/block", headers=auth_header(admin))
    client.post(f"/admin/users/{target.id}/block", headers=auth_header(admin))
    rows = _rows(db)
    assert [r.action for r in rows] == ["POST /admin/users/{user_id}/block"] * 2
    assert [r.details["after"]["is_blocked"] for r in rows] == [True, False]


def test_a_route_with_no_details_still_leaves_the_generic_row(client, db):
    """Before/after is an extra a route may add. The row itself needs nothing
    from the route: this one (pause a business) adds no note at all."""
    admin = make_user(db, role="admin")
    producer = make_producer(db, status="approved")
    resp = client.post(
        f"/admin/producers/{producer.id}/toggle-status", headers=auth_header(admin)
    )
    assert resp.status_code == 200, resp.text
    (row,) = _rows(db)
    assert row.action == "POST /admin/producers/{producer_id}/toggle-status"
    assert (row.target_type, row.target_id) == ("producer", str(producer.id))


# ---------- what is not logged ----------


def test_a_read_is_not_logged(client, db):
    admin = make_user(db, role="admin")
    assert client.get("/admin/users", headers=auth_header(admin)).status_code == 200
    assert _rows(db) == []


def test_a_change_that_did_not_go_through_is_not_logged(client, db):
    admin = make_user(db, role="admin")
    missing = uuid.uuid4()
    resp = client.put(
        f"/admin/users/{missing}/role",
        json={"role": "admin"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 404
    consumer = make_user(db, role="consumer")
    resp = client.put(
        f"/admin/users/{consumer.id}/role",
        json={"role": "producer"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 422
    assert _rows(db) == []


def test_a_refused_non_admin_is_not_logged(client, db):
    owner = make_user(db, role="producer")
    target = make_user(db, role="consumer")
    resp = client.put(
        f"/admin/users/{target.id}/role",
        json={"role": "admin"},
        headers=auth_header(owner),
    )
    assert resp.status_code == 403
    assert _rows(db) == []


def test_a_failed_audit_write_never_fails_the_admin_action(client, db, monkeypatch):
    import app.services.admin_audit as audit

    def boom(*a, **k):
        raise RuntimeError("audit store is down")

    monkeypatch.setattr(audit, "SessionLocal", boom)
    admin = make_user(db, role="admin")
    target = make_user(db, role="consumer")
    resp = client.put(
        f"/admin/users/{target.id}/role",
        json={"role": "admin"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200
    db.expire_all()
    assert db.get(type(target), target.id).role == "admin"


# ---------- every admin write route is covered ----------


def test_every_mutating_admin_route_goes_through_the_one_dependency_that_logs():
    """Two halves. (1) The single place really schedules the write — pinned by
    reading its source, and the telemetry variant must NOT (an admin browsing
    the site is not an admin action). (2) Every mutating route under /admin
    resolves its user through it. A new admin write route that authenticates
    some other way fails (2); removing the call fails (1)."""
    assert "admin_audit.schedule(" in inspect.getsource(get_current_user)
    assert "background_tasks=background_tasks" in inspect.getsource(
        get_current_user_optional
    )
    assert "background_tasks" not in inspect.getsource(get_current_user_lenient)

    admin_paths = [r for r in _write_routes() if r.path.startswith("/admin")]
    assert len(admin_paths) > 20, "control: the walk found the admin routers"
    missing = [
        f"{sorted(r.methods)} {r.path}"
        for r in admin_paths
        if not {"require_admin", "get_current_user"} <= set(r.deps)
    ]
    assert missing == []


def test_an_admin_acting_through_an_owner_route_is_logged_too(client, db):
    """DELETE /events/{id} is an owner route with an inline admin override
    (routers/events.py). The reviewer's case: «who removed my event» must
    have an answer when it was an admin."""
    admin = make_user(db, role="admin")
    producer = make_producer(db, status="approved")
    event = Event(
        producer_id=producer.id,
        title="יום פתוח",
        event_date=israel_today() + timedelta(days=5),
        category="שוק",
        city="חדרה",
        is_active=True,
    )
    db.add(event)
    db.commit()
    event_id = event.id  # read now: the row is gone after the call
    resp = client.delete(f"/events/{event_id}", headers=auth_header(admin))
    assert resp.status_code in (200, 204), resp.text
    (row,) = _rows(db)
    assert row.actor_id == admin.id
    assert row.action == "DELETE /events/{event_id}"
    assert (row.target_type, row.target_id) == ("event", str(event_id))


def test_the_same_kind_of_change_by_an_owner_is_not_an_admin_action(client, db):
    owner = make_user(db, role="producer")
    producer = make_producer(db, status="approved")
    owner.producer_id = producer.id
    db.commit()
    resp = client.post(
        "/producers/me/availability-state",
        json={"state": "accepting_orders"},
        headers=auth_header(owner),
    )
    assert resp.status_code == 200, resp.text
    assert _rows(db) == []


# ---------- append-only ----------


_FORBIDDEN_ON_AUDIT = (
    # ORM bulk forms, across line breaks (a formatter wraps long chains)
    r"query\(\s*AdminAuditLog\b[\s\S]{0,400}?\.(delete|update)\(",
    r"\b(delete|update)\(\s*AdminAuditLog\b",
)
# The only files allowed to name the model or the table at all. Raw SQL, a
# script, a second writer: each would have to be added here by hand, and that
# is the review this test asks for. (Raw-SQL sample strings are not written
# out in this file: the repo's Bash safety hook rejects them, rightly.)
_MAY_MENTION = {
    "backend/app/models/admin_ops.py",  # the model
    "backend/app/models/models.py",  # re-export
    "backend/app/services/admin_audit.py",  # the one writer (INSERT)
    "backend/app/routers/admin_extra.py",  # the one reader
}


def _audit_offenders(files: dict[str, str]) -> list[str]:
    found = []
    for name, text in files.items():
        for bad in _FORBIDDEN_ON_AUDIT:
            if re.search(bad, text):
                found.append(f"{name}: {bad}")
    return found


def test_the_append_only_scan_catches_the_shapes_it_claims():
    """Self-test first (MEH-1619): each forbidden shape, written the way a
    formatter would leave it, is caught; an insert and a read are not."""
    caught = {
        "wrapped.py": "db.query(AdminAuditLog).filter(\n    AdminAuditLog.id == x\n).delete()",
        "bulk.py": "db.execute(update(AdminAuditLog).values(ip=None))",
        "core.py": "db.execute(delete(AdminAuditLog))",
    }
    assert len(_audit_offenders(caught)) == len(caught)
    clean = {
        "ok.py": "db.add(AdminAuditLog(**row))\n"
        "rows = db.query(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).all()"
    }
    assert _audit_offenders(clean) == []


def test_no_code_updates_or_deletes_audit_rows():
    """The real corpus: backend/app, backend/scripts and scripts/. Alembic is
    left out on purpose — the revision's downgrade drops the table, and that
    is the rollback of a failed deploy."""
    roots = [BACKEND_APP, ROOT / "backend" / "scripts", ROOT / "scripts"]
    files = {}
    for root in roots:
        for path in root.rglob("*.py"):
            text = path.read_text(encoding="utf-8")
            if "AdminAuditLog" in text or "admin_audit_log" in text:
                files[str(path.relative_to(ROOT))] = text
    assert "backend/app/services/admin_audit.py" in files, (
        "control: the scan saw the writer"
    )
    assert set(files) <= _MAY_MENTION, sorted(set(files) - _MAY_MENTION)
    assert _audit_offenders(files) == []


def test_a_note_cannot_carry_contact_details():
    """`note()` keeps a bool, an int, None or a code-like string. An email, a
    phone or a sentence is dropped, whatever the caller passes."""
    from app.services.admin_audit import _reduced

    kept = _reduced(
        {
            "role": "admin",
            "status": "approved",
            "is_blocked": True,
            "count": 3,
            "email": "dana@example.com",
            "phone": "052-7654321",
            "name": "דנה כהן",
            "reason": "לא עומד בתנאים",
        }
    )
    assert kept == {
        "role": "admin",
        "status": "approved",
        "is_blocked": True,
        "count": 3,
    }


# ---------- reading it ----------


def test_the_log_is_readable_by_admins_only_newest_first(client, db):
    admin = make_user(db, role="admin")
    a, b = make_user(db, role="consumer"), make_user(db, role="consumer")
    client.post(f"/admin/users/{a.id}/block", headers=auth_header(admin))
    client.post(f"/admin/users/{b.id}/block", headers=auth_header(admin))

    assert client.get("/admin/audit-log").status_code == 401
    assert client.get("/admin/audit-log", headers=auth_header(a)).status_code == 403

    resp = client.get("/admin/audit-log", headers=auth_header(admin))
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert [i["target_id"] for i in items] == [str(b.id), str(a.id)]
    assert items[0]["actor_id"] == str(admin.id)
    assert set(items[0]) == {
        "id",
        "actor_id",
        "action",
        "target_type",
        "target_id",
        "details",
        "created_at",
    }, "the IP is stored for an investigation, not shown in the list"

    one = client.get("/admin/audit-log?limit=1", headers=auth_header(admin)).json()[
        "items"
    ]
    assert len(one) == 1
    assert (
        client.get(
            "/admin/audit-log?limit=5000", headers=auth_header(admin)
        ).status_code
        == 422
    )
