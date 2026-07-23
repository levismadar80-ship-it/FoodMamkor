"""MEH-1011 — producer request-changes (completion request) flow.

`POST /admin/producers/{id}/request-changes` is the non-terminal twin of
reject: it records the admin's free-text feedback (missing photo / license),
emails the producer, pings admin on WhatsApp, and KEEPS the producer pending.
approve_producer clears the trail on success.

Transition contract:

| action                  | status effect      | requested_changes      |
|-------------------------|--------------------|------------------------|
| request-changes (ok)    | unchanged (pending)| set to feedback        |
| request-changes (empty) | 400, no change     | unchanged              |
| approve                 | → approved         | cleared to NULL        |

Pure HTTP/DB tests, mirroring tests/test_admin_approval_transitions.py. The
email/WhatsApp side-effects fail-open in the test config; we monkeypatch
_send_notification_email to assert it fires with the producer's own address.
"""
import app.routers.admin as admin_module
from app.config import settings
from conftest import auth_header, make_producer, make_user

TEST_IMAGE = "https://res.cloudinary.com/demo/image/upload/v1/test.jpg"
FEEDBACK = "חסרה תמונה — יש להעלות לפחות תמונה אחת"


def _admin(db):
    return make_user(db, role="admin")


def _request_changes(client, producer_id, admin, feedback=FEEDBACK):
    return client.post(
        f"/admin/producers/{producer_id}/request-changes",
        json={"feedback": feedback},
        headers=auth_header(admin),
    )


# --- happy path -------------------------------------------------------------


def test_request_changes_happy_path(client, db):
    producer = make_producer(db, status="pending")
    resp = _request_changes(client, producer.id, _admin(db))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["requested_changes"] == FEEDBACK
    assert body["changes_requested_at"] is not None
    db.refresh(producer)
    assert producer.requested_changes == FEEDBACK
    assert producer.changes_requested_at is not None
    # status stays pending — this is NOT a rejection
    assert producer.status == "pending"


def test_request_changes_trims_feedback(client, db):
    producer = make_producer(db, status="pending")
    resp = _request_changes(client, producer.id, _admin(db), feedback=f"  {FEEDBACK}  ")
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.requested_changes == FEEDBACK  # stripped


# --- empty feedback → 400 ---------------------------------------------------


def test_request_changes_empty_feedback_is_400(client, db):
    producer = make_producer(db, status="pending")
    resp = _request_changes(client, producer.id, _admin(db), feedback="")
    assert resp.status_code == 400, resp.text
    db.refresh(producer)
    assert producer.requested_changes is None
    assert producer.status == "pending"


def test_request_changes_whitespace_feedback_is_400(client, db):
    producer = make_producer(db, status="pending")
    resp = _request_changes(client, producer.id, _admin(db), feedback="   ")
    assert resp.status_code == 400, resp.text
    db.refresh(producer)
    assert producer.requested_changes is None


# --- 404 unknown id ---------------------------------------------------------


def test_request_changes_unknown_producer_is_404(client, db):
    import uuid

    resp = _request_changes(client, uuid.uuid4(), _admin(db))
    assert resp.status_code == 404, resp.text


# --- auth guard (require_admin) — send a schema-valid body so the 401/403 is
# the guard talking, not body validation (regression rule 6) --------------


def test_request_changes_unauthenticated_is_401(client, db):
    producer = make_producer(db, status="pending")
    resp = client.post(
        f"/admin/producers/{producer.id}/request-changes",
        json={"feedback": FEEDBACK},
    )
    assert resp.status_code == 401, resp.text
    db.refresh(producer)
    assert producer.requested_changes is None


def test_request_changes_non_admin_is_403(client, db):
    producer = make_producer(db, status="pending")
    consumer = make_user(db, role="consumer")
    resp = client.post(
        f"/admin/producers/{producer.id}/request-changes",
        json={"feedback": FEEDBACK},
        headers=auth_header(consumer),
    )
    assert resp.status_code == 403, resp.text
    db.refresh(producer)
    assert producer.requested_changes is None


# --- status guard — pending-only (MEH-769 409 precedent) --------------------


def test_request_changes_on_approved_producer_is_409(client, db):
    """request-changes leaves status unchanged, so it must refuse a
    non-pending producer — else it leaves an incoherent approved+trail state."""
    producer = make_producer(db, status="approved", images=[TEST_IMAGE])
    resp = _request_changes(client, producer.id, _admin(db))
    assert resp.status_code == 409, resp.text
    db.refresh(producer)
    assert producer.requested_changes is None
    assert producer.status == "approved", "guard must not change status"


def test_request_changes_on_pending_whatsapp_is_allowed(client, db):
    """pending_whatsapp is still a pre-approval state → allowed."""
    producer = make_producer(db, status="pending_whatsapp")
    resp = _request_changes(client, producer.id, _admin(db))
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.requested_changes == FEEDBACK
    assert producer.status == "pending_whatsapp"


# --- email fires to the producer's own address ------------------------------


def test_request_changes_sends_email_to_producer(client, db, monkeypatch):
    calls = []
    monkeypatch.setattr(
        admin_module,
        "_send_notification_email",
        lambda to, subject, body: calls.append((to, subject, body)),
    )
    producer = make_producer(db, status="pending")
    # link a user to the producer so the email branch runs
    owner = make_user(db, email="owner@example.com", role="producer")
    owner.producer_id = producer.id
    db.commit()

    resp = _request_changes(client, producer.id, _admin(db))
    assert resp.status_code == 200, resp.text
    assert len(calls) == 1, "request-changes must email the producer exactly once"
    to, subject, mail_body = calls[0]
    assert to == "owner@example.com"
    assert producer.name in subject
    assert FEEDBACK in mail_body
    # env-aware dashboard link (mirrors auth_emails.py) — not a hardcoded host
    assert f"{settings.frontend_url}/producer/dashboard" in mail_body


# --- approve clears the request-changes trail -------------------------------


def test_approve_clears_requested_changes(client, db, monkeypatch):
    monkeypatch.setattr(
        admin_module, "notify_producer_approved", lambda *a, **k: None
    )
    admin = _admin(db)
    producer = make_producer(db, status="pending", images=[TEST_IMAGE])
    # seed a prior request-changes
    resp = _request_changes(client, producer.id, admin)
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.requested_changes is not None

    resp = client.post(
        f"/admin/producers/{producer.id}/approve", headers=auth_header(admin)
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.status == "approved"
    assert producer.requested_changes is None, "approve must clear requested_changes"
    assert producer.changes_requested_at is None, "approve must clear the stamp"


def test_reject_clears_requested_changes(client, db):
    """A producer that got a request-changes, then rejected, must not keep a
    stale trail — symmetric with approve-clears (MEH-1011)."""
    admin = _admin(db)
    producer = make_producer(db, status="pending")
    resp = _request_changes(client, producer.id, admin)
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.requested_changes is not None

    resp = client.post(
        f"/admin/producers/{producer.id}/reject",
        json={"reason": "לא מתאים"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.status == "rejected"
    assert producer.requested_changes is None, "reject must clear requested_changes"
    assert producer.changes_requested_at is None, "reject must clear the stamp"
