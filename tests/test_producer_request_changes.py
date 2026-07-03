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
    assert "https://mehamakor.online/producer/dashboard" in mail_body


# --- approve clears the request-changes trail -------------------------------


def test_approve_clears_requested_changes(client, db, monkeypatch):
    monkeypatch.setattr(
        admin_module, "notify_producer_approved", lambda *a, **k: None
    )
    producer = make_producer(db, status="pending", images=[TEST_IMAGE])
    # seed a prior request-changes
    resp = _request_changes(client, producer.id, _admin(db))
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.requested_changes is not None

    resp = client.post(
        f"/admin/producers/{producer.id}/approve", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.status == "approved"
    assert producer.requested_changes is None, "approve must clear requested_changes"
    assert producer.changes_requested_at is None, "approve must clear the stamp"
