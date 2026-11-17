"""MEH-3306 — the admin audit log (server half).

Every successful change an admin makes through a route gated by
`require_admin` leaves one append-only row: who, what (method + route
template), on what, when, from where. The write is scheduled inside
`require_admin` itself, so a route cannot be an admin route and skip it.

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

from app.auth import require_admin
from app.models.admin_ops import AdminAuditLog

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
    """The log is written by `require_admin`, so the walk has two halves:
    (1) the dependency really schedules the write — pinned by reading its
    source, since that is the single place; (2) every mutating route under
    /admin depends on it. A new admin write route without the gate fails (2);
    removing the call from the gate fails (1)."""
    source = inspect.getsource(require_admin)
    assert "admin_audit.schedule(" in source

    admin_paths = [r for r in _write_routes() if r.path.startswith("/admin")]
    assert len(admin_paths) > 20, "control: the walk found the admin routers"
    missing = [
        f"{sorted(r.methods)} {r.path}"
        for r in admin_paths
        if "require_admin" not in r.deps
    ]
    assert missing == []


def test_the_gate_is_what_logs_not_the_url_prefix():
    """Derived, not stated: how many mutating routes are admin-gated, and that
    the set under /admin and the set behind the gate are the same set today.
    If an admin-gated write appears under another prefix it is logged all the
    same (the gate logs), and this count moves with it."""
    gated = _admin_write_routes()
    under_admin = [r for r in _write_routes() if r.path.startswith("/admin")]
    assert len(gated) >= len(under_admin) > 20


# ---------- append-only ----------


def test_no_code_updates_or_deletes_audit_rows():
    """Scan, with a control: the only thing the app does to the table is add
    a row and read it."""
    offenders, mentions = [], 0
    for path in BACKEND_APP.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "AdminAuditLog" not in text:
            continue
        mentions += 1
        for bad in (
            r"query\(AdminAuditLog\)[^\n]*\.(delete|update)\(",
            r"(delete|update)\(AdminAuditLog",
            r"db\.delete\([^)]*audit",
        ):
            if re.search(bad, text):
                offenders.append(f"{path.name}: {bad}")
    assert mentions >= 2, "control: the scan saw the model and its writer"
    assert offenders == []


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
