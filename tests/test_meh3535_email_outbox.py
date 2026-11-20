"""MEH-3535: the durable email queue (services/email_outbox.py), the two
routes that now queue instead of sending, and the worker loop (app/worker.py).

What each test would catch if it broke is said in its name: an email lost to
a Resend error, an email sent for a rolled-back cause, a test business
emailed, a stale backlog sent, a row taken by two dispatchers, the worker not
stopping on SIGTERM, the web process dispatching after the worker took over.
"""

import ast
import os
import re
import signal
import threading
import time
from datetime import timedelta
from pathlib import Path

import pytest

import app.routers.admin_decisions as admin_module
import app.services.email_outbox as outbox
from app import startup, worker
from app.config import settings
from app.database import SessionLocal
from app.models.email_outbox import EMAIL_OUTBOX_OUTCOMES, EmailOutbox
from app.services import retention_purge
from app.utils.clock import utc_now
from conftest import auth_header, make_producer, make_user
from app.models.models import Registration
from test_meh2763_registrations import _event, _experience, _owner, _signup

REVISION = (
    Path(__file__).resolve().parents[1]
    / "backend/alembic/versions/20261120_2300_c5e7a9b1d3f6_meh3535_email_outbox.py"
)
TEST_IMAGE = "https://res.cloudinary.com/demo/image/upload/v1/test.jpg"


@pytest.fixture
def provider(monkeypatch):
    """Resend, as the dispatcher sees it: answers from `script` in turn
    ("sent" once it runs out), and records every address it was handed."""
    state = {"script": [], "to": []}

    def _send(to, subject, body, html=None, reply_to=None):
        state["to"].append(to)
        return state["script"].pop(0) if state["script"] else "sent"

    monkeypatch.setattr(outbox.email_service, "send_email_result", _send)
    return state


def _rows(db, **filters):
    db.expire_all()
    return db.query(EmailOutbox).filter_by(**filters).order_by(EmailOutbox.created_at).all()


def _queue_one(db, to="her@example.com", **kw):
    outbox.enqueue_email(db, kw.pop("kind", "probe"), to, "נושא", "גוף", **kw)
    db.commit()
    return _rows(db)[-1]


# --- the schema ---------------------------------------------------------------


def test_the_revision_literals_match_the_model():
    tree = ast.parse(REVISION.read_text(encoding="utf-8"))
    literal = next(
        node.value
        for node in tree.body
        if isinstance(node, ast.Assign) and node.targets[0].id == "OUTCOMES"  # type: ignore[attr-defined]
    )
    assert ast.literal_eval(literal) == EMAIL_OUTBOX_OUTCOMES


# --- the queue ------------------------------------------------------------------


def test_a_resend_error_is_retried_not_lost(db, provider):
    row = _queue_one(db)
    provider["script"] = ["failed"]
    now = utc_now()

    assert outbox.dispatch_due(db, now=now) == 1
    row = _rows(db, id=row.id)[0]
    assert (row.outcome, row.attempts, row.last_error) == ("pending", 1, "provider")
    assert row.send_after == now + outbox.RETRY_BASE
    assert row.to_email == "her@example.com"  # kept until it is sent

    # Not due yet: nothing is sent again before the backoff.
    assert outbox.dispatch_due(db, now=now) == 0
    assert outbox.dispatch_due(db, now=row.send_after) == 1
    row = _rows(db, id=row.id)[0]
    assert row.outcome == "sent"
    assert provider["to"] == ["her@example.com", "her@example.com"]


def test_a_sent_row_keeps_no_address_and_no_words(db, provider):
    row = _queue_one(db, html="<p>גוף</p>", reply_to="r@example.com")
    outbox.dispatch_due(db)
    row = _rows(db, id=row.id)[0]
    assert row.outcome == "sent" and row.sent_at is not None
    assert (row.to_email, row.subject, row.body, row.html, row.reply_to) == (None,) * 5
    assert row.kind == "probe"


def test_five_provider_failures_close_the_row_as_failed(db, provider):
    row = _queue_one(db)
    provider["script"] = ["failed"] * outbox.MAX_ATTEMPTS
    for _ in range(outbox.MAX_ATTEMPTS):
        # Each retry at the moment its backoff says it is due.
        outbox.dispatch_due(db, now=_rows(db, id=row.id)[0].send_after)
    row = _rows(db, id=row.id)[0]
    assert (row.outcome, row.attempts) == ("failed", outbox.MAX_ATTEMPTS)
    assert row.to_email is None
    assert len(provider["to"]) == outbox.MAX_ATTEMPTS


def test_a_final_answer_that_is_not_sent_is_skipped_once(db, provider):
    row = _queue_one(db)
    provider["script"] = ["skipped"]  # a reserved test domain
    outbox.dispatch_due(db)
    row = _rows(db, id=row.id)[0]
    assert (row.outcome, row.last_error, row.attempts) == ("skipped", "skipped", 0)
    assert outbox.dispatch_due(db) == 0


def test_a_dispatcher_without_the_resend_key_leaves_the_row_waiting(db, provider):
    """A worker deployed without RESEND_API_KEY must not eat the queue."""
    row = _queue_one(db)
    provider["script"] = ["unconfigured"]
    now = utc_now()
    outbox.dispatch_due(db, now=now)
    row = _rows(db, id=row.id)[0]
    assert (row.outcome, row.attempts, row.last_error) == ("pending", 0, "unconfigured")
    assert row.to_email == "her@example.com"
    assert row.send_after == now + outbox.RETRY_BASE
    # The key arrives: the same row goes out.
    outbox.dispatch_due(db, now=row.send_after)
    assert _rows(db, id=row.id)[0].outcome == "sent"


def test_a_stale_backlog_is_dropped_not_sent(db, provider):
    row = _queue_one(db)
    later = row.created_at + outbox.STALE_AFTER + timedelta(minutes=1)
    outbox.dispatch_due(db, now=later)
    row = _rows(db, id=row.id)[0]
    assert (row.outcome, row.last_error) == ("skipped", "stale")
    assert provider["to"] == []


def test_a_rolled_back_cause_queues_nothing(db, provider):
    outbox.enqueue_email(db, "probe", "her@example.com", "נושא", "גוף")
    db.rollback()
    assert _rows(db) == []


def test_a_test_row_and_a_missing_address_queue_nothing(db):
    outbox.enqueue_email(db, "probe", "her@example.com", "s", "b", test_cause=True)
    outbox.enqueue_email(db, "probe", None, "s", "b")
    outbox.enqueue_email(db, "probe", "", "s", "b")
    db.commit()
    assert _rows(db) == []


def test_a_row_locked_by_one_dispatcher_is_skipped_by_the_other(db, provider):
    row = _queue_one(db)
    holder = SessionLocal()
    try:
        held = (
            holder.query(EmailOutbox)
            .filter_by(id=row.id)
            .with_for_update()
            .one()
        )
        assert held.outcome == "pending"
        other = SessionLocal()
        try:
            assert outbox.dispatch_due(other) == 0
        finally:
            other.close()
    finally:
        holder.rollback()
        holder.close()
    assert provider["to"] == []
    assert outbox.dispatch_due(db) == 1


def test_one_crashing_row_does_not_stop_the_batch(db, provider, monkeypatch):
    first = _queue_one(db, to="a@example.com")
    _queue_one(db, to="b@example.com")
    real = outbox._handle

    def _handle(row, now):
        if row.id == first.id:
            raise RuntimeError("boom")
        real(row, now)

    monkeypatch.setattr(outbox, "_handle", _handle)
    assert outbox.dispatch_due(db) == 2
    assert sorted(r.outcome for r in _rows(db)) == ["failed", "sent"]
    assert provider["to"] == ["b@example.com"]


# --- the routes that queue ----------------------------------------------------------


def _approvable(db, *, is_test=False):
    producer = make_producer(
        db, status="pending", images=[TEST_IMAGE], phone_verified=True
    )
    producer.is_test = is_test
    owner = make_user(db, role="producer", email="owner3535@example.com")
    owner.producer_id = producer.id
    db.commit()
    return producer


@pytest.fixture
def quiet_whatsapp(monkeypatch):
    monkeypatch.setattr(admin_module, "notify_producer_approved", lambda *a, **k: None)
    monkeypatch.setattr(admin_module, "_send_whatsapp", lambda *a, **k: None)


def test_approval_queues_the_welcome_email_and_resend_down_does_not_lose_it(
    client, db, provider, quiet_whatsapp
):
    producer = _approvable(db)
    admin = make_user(db, role="admin")
    provider["script"] = ["failed"]

    r = client.post(f"/admin/producers/{producer.id}/approve", headers=auth_header(admin))
    assert r.status_code == 200, r.text
    (row,) = _rows(db)
    assert (row.kind, row.to_email, row.outcome) == (
        "producer_approved",
        "owner3535@example.com",
        "pending",
    )
    assert row.subject == "ברוכים הבאים למהמקור"
    assert row.html and "<html" in row.html  # the HTML part rides along
    assert provider["to"] == []  # not sent inside the request

    outbox.dispatch_due(db)  # Resend is down
    row = _rows(db, id=row.id)[0]
    assert row.outcome == "pending" and row.attempts == 1
    outbox.dispatch_due(db, now=row.send_after)  # back up
    assert _rows(db, id=row.id)[0].outcome == "sent"
    assert provider["to"] == ["owner3535@example.com"] * 2


def test_approving_a_test_business_queues_nothing(client, db, provider, quiet_whatsapp):
    producer = _approvable(db, is_test=True)
    admin = make_user(db, role="admin")
    r = client.post(f"/admin/producers/{producer.id}/approve", headers=auth_header(admin))
    assert r.status_code == 200, r.text
    assert _rows(db) == []


def test_reject_and_request_changes_queue_their_emails(
    client, db, provider, quiet_whatsapp, monkeypatch
):
    monkeypatch.setattr(
        admin_module, "notify_producer_changes_requested", lambda *a, **k: None
    )
    admin = make_user(db, role="admin")
    producer = _approvable(db)
    r = client.post(
        f"/admin/producers/{producer.id}/request-changes",
        json={"feedback": "נא להוסיף תמונה של הרישיון"},
        headers=auth_header(admin),
    )
    assert r.status_code == 200, r.text
    r = client.post(
        f"/admin/producers/{producer.id}/reject",
        json={"reason": "חסר רישיון עסק"},
        headers=auth_header(admin),
    )
    assert r.status_code == 200, r.text
    assert [row.kind for row in _rows(db)] == [
        "producer_changes_requested",
        "producer_rejected",
    ]


def test_a_signup_queues_both_emails_in_its_own_transaction(client, db, provider):
    owner = _owner(db, email="owner-ev3535@example.com")
    ev = _event(db, owner, max_participants=10)
    r = client.post(f"/events/{ev.id}/registrations", json=_signup())
    assert r.status_code == 201, r.text
    rows = _rows(db)
    assert sorted((row.kind, row.to_email) for row in rows) == [
        ("owner_new_registration", "owner-ev3535@example.com"),
        ("visitor_confirmation", "dana@example.com"),
    ]
    assert provider["to"] == []
    assert outbox.dispatch_due(db) == 2
    assert sorted(provider["to"]) == ["dana@example.com", "owner-ev3535@example.com"]


def test_a_300_character_title_still_signs_up(client, db, provider):
    owner = _owner(db, email="owner-long@example.com")
    ev = _event(db, owner, title="א" * 300, max_participants=10)
    r = client.post(f"/events/{ev.id}/registrations", json=_signup())
    assert r.status_code == 201, r.text
    assert len(_rows(db)) == 2
    assert all(len(row.subject) > 300 for row in _rows(db))


def test_a_workshop_signup_queues_both_emails(client, db, provider):
    host = _owner(db, email="host3535@example.com")
    ex = _experience(db, host, max_participants=5)
    r = client.post(f"/experiences/{ex.id}/registrations", json=_signup())
    assert r.status_code == 201, r.text
    assert sorted((row.kind, row.to_email) for row in _rows(db)) == [
        ("owner_new_registration", "host3535@example.com"),
        ("visitor_confirmation", "dana@example.com"),
    ]


def test_a_full_event_queues_only_the_waitlist_email_and_commits_it(client, db, provider):
    owner = _owner(db, email="owner-full@example.com")
    ev = _event(db, owner, max_participants=1)
    assert client.post(f"/events/{ev.id}/registrations", json=_signup(email="a@example.com")).status_code == 201
    r = client.post(
        f"/events/{ev.id}/registrations",
        json={**_signup(email="w@example.com"), "waitlist": True},
    )
    assert r.status_code == 201 and r.json() == {"status": "waitlisted"}, r.text
    assert [row.kind for row in _rows(db) if row.to_email == "w@example.com"] == [
        "waitlist_confirmation"
    ]
    assert db.query(Registration).filter_by(email="w@example.com").count() == 1


def test_a_signup_with_a_test_host_queues_nothing(client, db, provider):
    host = _owner(db, email="host-test@example.com")
    host.is_test = True
    db.commit()
    ex = _experience(db, host, max_participants=5)
    r = client.post(f"/experiences/{ex.id}/registrations", json=_signup())
    assert r.status_code == 201, r.text
    assert _rows(db) == []


def test_if_the_email_cannot_be_queued_the_signup_is_not_kept_either(
    client, db, monkeypatch
):
    """One transaction: no sign-up row without its emails."""
    owner = _owner(db, email="owner-atomic@example.com")
    ev = _event(db, owner, max_participants=10)

    def _boom(*a, **k):
        raise RuntimeError("queue down")

    import app.routers.registrations as reg_router

    monkeypatch.setattr(reg_router, "enqueue_email", _boom)
    with pytest.raises(RuntimeError):
        client.post(f"/events/{ev.id}/registrations", json=_signup())
    db.expire_all()
    assert db.query(Registration).count() == 0
    assert _rows(db) == []


def test_an_approval_whose_email_cannot_be_queued_still_answers_200(
    client, db, quiet_whatsapp, monkeypatch
):
    producer = _approvable(db)
    admin = make_user(db, role="admin")

    def _boom(*a, **k):
        raise RuntimeError("queue down")

    monkeypatch.setattr(admin_module, "enqueue_email", _boom)
    r = client.post(f"/admin/producers/{producer.id}/approve", headers=auth_header(admin))
    assert r.status_code == 200, r.text
    db.expire_all()
    assert db.get(type(producer), producer.id).status == "approved"


# --- who dispatches -----------------------------------------------------------------


class _Scheduler:
    def __init__(self):
        self.ids = []

    def add_job(self, func, trigger, **kw):
        self.ids.append(kw["id"])


def test_the_web_scheduler_dispatches_until_the_worker_takes_over(monkeypatch):
    monkeypatch.setattr(settings, "outbox_external_worker", False)
    web = _Scheduler()
    startup._register_outbox_jobs(web)
    assert "meh_3535_email_outbox" in web.ids

    monkeypatch.setattr(settings, "outbox_external_worker", True)
    handed_over = _Scheduler()
    startup._register_outbox_jobs(handed_over)
    assert handed_over.ids == []


def test_the_overdue_check_watches_the_worker_once_it_owns_the_queue(monkeypatch):
    import app.routers.product_orders as po

    monkeypatch.setattr(po, "product_orders_enabled", lambda: True)
    monkeypatch.setattr(settings, "outbox_external_worker", False)
    assert startup._outbox_jobs_run_elsewhere() == []
    monkeypatch.setattr(settings, "outbox_external_worker", True)
    assert [slug for slug, _ in startup._outbox_jobs_run_elsewhere()] == [
        "email-outbox-tick",
        "product-orders-tick",
    ]


def test_the_worker_sends_the_queue_every_tick_and_orders_every_fourth(monkeypatch):
    calls = []
    monkeypatch.setattr(startup, "_run_email_outbox_job", lambda: calls.append("email"))
    monkeypatch.setattr(startup, "_run_product_order_jobs", lambda: calls.append("orders"))
    import app.routers.product_orders as po

    monkeypatch.setattr(po, "product_orders_enabled", lambda: True)
    for tick in range(5):
        worker.run_once(tick)
    assert calls.count("email") == 5
    assert calls.count("orders") == 2  # ticks 0 and 4: every two minutes

    calls.clear()
    monkeypatch.setattr(po, "product_orders_enabled", lambda: False)
    worker.run_once(0)
    assert calls == ["email"]


def test_the_worker_actually_sends_a_queued_row(db, provider):
    _queue_one(db, to="w@example.com")
    worker.run_once(1)
    assert provider["to"] == ["w@example.com"]
    assert _rows(db)[0].outcome == "sent"


@pytest.mark.skipif(
    threading.current_thread() is not threading.main_thread(),
    reason="MEH-3535: signal handlers install only on the main thread",
)
def test_the_worker_stops_on_sigterm_without_waiting_out_the_tick(monkeypatch):
    monkeypatch.setattr(worker, "run_once", lambda tick: [])
    monkeypatch.setattr(worker, "TICK_SECONDS", 60)
    previous = signal.getsignal(signal.SIGTERM)
    timer = threading.Timer(0.3, lambda: os.kill(os.getpid(), signal.SIGTERM))
    started = time.monotonic()
    timer.start()
    try:
        assert worker.main() == 0
    finally:
        timer.cancel()
        signal.signal(signal.SIGTERM, previous)
    assert time.monotonic() - started < 5


def test_the_railway_worker_config_starts_the_worker_and_not_the_web_boot():
    text = (Path(__file__).resolve().parents[1] / "railway.worker.json").read_text()
    assert re.search(r'"startCommand":\s*"python -u -m app\.worker"', text)
    assert "migrate_on_boot" not in text and "uvicorn" not in text


# --- retention ----------------------------------------------------------------------


def test_the_purge_deletes_outbox_rows_after_thirty_days(db, provider):
    old = _queue_one(db, to="old@example.com")
    new = _queue_one(db, to="new@example.com")
    old.created_at = utc_now() - timedelta(days=retention_purge.EMAIL_OUTBOX_RETENTION_DAYS + 1)
    db.commit()
    result = retention_purge.run_purge(db)
    assert result.email_outbox_deleted == 1
    assert [r.id for r in _rows(db)] == [new.id]
