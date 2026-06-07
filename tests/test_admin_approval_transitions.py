"""MEH-769 (HOT-002) — producer-approval state-machine enforcement.

The admin status-toggle (`POST /admin/producers/{id}/toggle-status`) is the
visibility switch for an already-decided business: approved ⇄ inactive only.
Before this guard its bare `else` branch force-approved ANY non-approved
producer — a rejected/pending business could be flipped straight to
`approved` (live on the public map), skipping the real approve_producer flow
and every MEH-509 side-effect (approval email, producer_approved_v1 WhatsApp,
admin WhatsApp).

Transition matrix enforced by these tests:

| Source status     | toggle-status         | approve              |
|-------------------|-----------------------|----------------------|
| approved          | → inactive (200)      | → approved (no-op)   |
| inactive          | → approved (200)      | → approved           |
| pending           | 409 (use approve flow)| → approved + hooks   |
| pending_whatsapp  | 409                   | → approved + hooks   |
| rejected          | 409                   | → approved + hooks   |

Pure HTTP/DB tests, mirroring tests/test_producer_declaration.py. The
notification hooks fail-open in the test config; we monkeypatch
notify_producer_approved to assert fire-count (exactly once on the legit
path, zero on a blocked toggle).
"""
import app.routers.admin as admin_module
from conftest import auth_header, make_producer, make_user


def _admin(db):
    return make_user(db, role="admin")


def _toggle(client, producer_id, admin):
    return client.post(
        f"/admin/producers/{producer_id}/toggle-status", headers=auth_header(admin)
    )


# --- allowed transitions: approved ⇄ inactive ------------------------------


def test_toggle_approved_to_inactive(client, db):
    producer = make_producer(db, status="approved")
    resp = _toggle(client, producer.id, _admin(db))
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "inactive"
    db.refresh(producer)
    assert producer.status == "inactive"


def test_toggle_inactive_to_approved(client, db):
    producer = make_producer(db, status="inactive")
    resp = _toggle(client, producer.id, _admin(db))
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "approved"
    db.refresh(producer)
    assert producer.status == "approved"


# --- forbidden transitions: pending / pending_whatsapp / rejected → 409 -----


def test_toggle_rejected_is_blocked(client, db):
    producer = make_producer(db, status="rejected")
    resp = _toggle(client, producer.id, _admin(db))
    assert resp.status_code == 409, resp.text
    db.refresh(producer)
    assert producer.status == "rejected", "rejected producer must NOT be force-approved"


def test_toggle_pending_is_blocked(client, db):
    producer = make_producer(db, status="pending")
    resp = _toggle(client, producer.id, _admin(db))
    assert resp.status_code == 409, resp.text
    db.refresh(producer)
    assert producer.status == "pending"


def test_toggle_pending_whatsapp_is_blocked(client, db):
    producer = make_producer(db, status="pending_whatsapp")
    resp = _toggle(client, producer.id, _admin(db))
    assert resp.status_code == 409, resp.text
    db.refresh(producer)
    assert producer.status == "pending_whatsapp"


def test_blocked_toggle_fires_no_approval_hook(client, db, monkeypatch):
    """A blocked toggle must not run the approval side-effects."""
    calls = []
    monkeypatch.setattr(
        admin_module,
        "notify_producer_approved",
        lambda *a, **k: calls.append(a),
    )
    producer = make_producer(db, status="rejected")
    resp = _toggle(client, producer.id, _admin(db))
    assert resp.status_code == 409
    assert calls == [], "toggle 409 must not fire producer_approved_v1"


# --- the legit approval path still works + fires the hook exactly once ------


def test_legit_approve_from_rejected_fires_hook_once(client, db, monkeypatch):
    calls = []
    monkeypatch.setattr(
        admin_module,
        "notify_producer_approved",
        lambda *a, **k: calls.append(a),
    )
    producer = make_producer(db, status="rejected")
    resp = client.post(
        f"/admin/producers/{producer.id}/approve", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.status == "approved"
    assert len(calls) == 1, "producer_approved_v1 must fire exactly once on approve"
