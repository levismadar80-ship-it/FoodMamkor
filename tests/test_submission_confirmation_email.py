"""MEH-2112 — the submission-confirmation email.

Copy is Sapir-approved (17/08) and asserted verbatim, because the point of
this email is to fix a promise IN WRITING: the timestamp the SLA counts from
and the "עד 3 ימי עסקים" commitment. A reworded body is a different promise.

WHERE FAIL-OPEN IS TESTED, and why not at the endpoint. Starlette's TestClient
runs background tasks INLINE, so patching the task to raise and asserting a
200 would prove a fact about the test client, not about the endpoint — the
same reasoning test_meh2100_draft_submit.py records for the admin ping. The
real contract lives inside send_email (it swallows every transport failure),
so that is the layer these tests exercise: a raising Resend must not escape
send_submission_confirmation.
"""

import uuid
from datetime import datetime, timezone

import pytest

from app.services.submission_confirmation import (
    SUPPORT_REPLY_TO,
    build_submission_confirmation,
    send_submission_confirmation,
)
from conftest import auth_header, make_submit_ready_producer


# --- the copy, verbatim ------------------------------------------------------


def test_subject_is_the_approved_string():
    subject, _ = build_submission_confirmation(
        "מאפיית שקד", datetime(2026, 8, 18, 9, 0, tzinfo=timezone.utc)
    )
    assert subject == "קיבלנו את הפרופיל — תשובה עד 3 ימי עסקים"


def test_body_carries_every_approved_line_and_both_interpolations():
    _, body = build_submission_confirmation(
        "מאפיית שקד", datetime(2026, 8, 18, 9, 0, tzinfo=timezone.utc)
    )
    assert "הפרופיל של מאפיית שקד נשלח לבדיקה ב-18/08/2026." in body
    assert "מה עכשיו? הצוות שלנו עובר על הפרטים ומאשר עד 3 ימי עסקים." in body
    assert "ברגע שהעסק מאושר — הוא עולה לאתר ונעדכן אתכם במייל." in body
    assert "בינתיים אפשר להמשיך לעדכן את הפרופיל בלוח הבקרה — כל שינוי נשמר." in body
    assert "יש שאלה? אפשר פשוט להשיב למייל הזה." in body
    # No unreplaced placeholder ever reaches a business owner.
    assert "[" not in body and "{" not in body


def test_date_is_israel_local_not_utc():
    """23:30 UTC is already the NEXT day in Israel. Rendering the UTC date
    would tell the owner she submitted on a day she did not — and this is the
    assertion that fails if the tz conversion is ever dropped."""
    _, body = build_submission_confirmation(
        "מאפיית שקד", datetime(2026, 8, 18, 23, 30, tzinfo=timezone.utc)
    )
    assert "19/08/2026" in body, body


def test_naive_timestamp_is_treated_as_utc_not_a_crash():
    """SQLite hands tz-naive values back even for DateTime(timezone=True).
    A raise here would break a fail-open promise over a formatting detail."""
    _, body = build_submission_confirmation("מאפיית שקד", datetime(2026, 8, 18, 9, 0))
    assert "18/08/2026" in body


# --- the reply-to, which the copy depends on ---------------------------------


def test_send_sets_an_explicit_reply_to(monkeypatch):
    """The body invites a reply, but the sender is noreply@ (config.py:81).
    Without this the copy promises a channel that bounces.

    RED against the first implementation of this feature, which called
    send_email positionally and left reply_to unset.
    """
    captured = {}
    monkeypatch.setattr(
        "app.services.submission_confirmation.send_email",
        lambda to, subject, body, **kw: captured.update(to=to, **kw),
    )
    send_submission_confirmation(
        "owner@example.com", "מאפיית שקד", datetime.now(timezone.utc)
    )
    assert captured["to"] == "owner@example.com"
    assert captured.get("reply_to") == SUPPORT_REPLY_TO
    assert "noreply" not in captured.get("reply_to", "")


def test_reply_to_is_omitted_when_unset_so_existing_senders_are_unchanged(monkeypatch):
    """send_email gained an optional parameter; every other caller must keep
    sending the exact payload it sent before. The key is absent, not None."""
    sent = {}
    monkeypatch.setattr("app.services.email.settings.resend_api_key", "test-key")

    class _FakeEmails:
        @staticmethod
        def send(params):
            sent.update(params)
            return {"id": "fake"}

    fake_resend = type("R", (), {"Emails": _FakeEmails, "api_key": None})
    monkeypatch.setitem(__import__("sys").modules, "resend", fake_resend)

    from app.services.email import send_email

    send_email("someone@example.com", "נושא", "גוף")
    assert "reply_to" not in sent, sent


def test_reply_to_reaches_the_transport_when_set(monkeypatch):
    sent = {}
    monkeypatch.setattr("app.services.email.settings.resend_api_key", "test-key")

    class _FakeEmails:
        @staticmethod
        def send(params):
            sent.update(params)
            return {"id": "fake"}

    fake_resend = type("R", (), {"Emails": _FakeEmails, "api_key": None})
    monkeypatch.setitem(__import__("sys").modules, "resend", fake_resend)

    from app.services.email import send_email

    send_email("someone@example.com", "נושא", "גוף", reply_to=SUPPORT_REPLY_TO)
    assert sent.get("reply_to") == SUPPORT_REPLY_TO


# --- fail-open, at the layer that owns it ------------------------------------


def test_a_raising_transport_does_not_escape(monkeypatch):
    """A Resend outage must not propagate. The submission is already committed
    by the time this runs, so an exception here would turn a successful submit
    into a 500 for a business owner who has already been told it worked."""
    monkeypatch.setattr("app.services.email.settings.resend_api_key", "test-key")

    class _Boom:
        @staticmethod
        def send(params):
            raise RuntimeError("resend is down")

    fake_resend = type("R", (), {"Emails": _Boom, "api_key": None})
    monkeypatch.setitem(__import__("sys").modules, "resend", fake_resend)

    send_submission_confirmation(
        "owner@example.com", "מאפיית שקד", datetime.now(timezone.utc)
    )  # must not raise


# --- fired exactly on the transition -----------------------------------------


def test_sent_on_successful_submit(client, db, monkeypatch):
    calls: list[tuple] = []
    monkeypatch.setattr(
        "app.routers.producer_me.send_submission_confirmation",
        lambda to, name, when: calls.append((to, name, when)),
    )
    producer, user = make_submit_ready_producer(db)
    resp = client.post("/producers/me/submit-for-review", headers=auth_header(user))

    assert resp.status_code == 200, resp.text
    assert len(calls) == 1, f"expected exactly one confirmation, got {calls}"
    to, name, when = calls[0]
    assert to == user.email
    assert name == "חוות הניסוי"
    assert when is not None, "the confirmation must carry the stamp just written"


def test_not_sent_when_the_gate_rejects_422(client, db, monkeypatch):
    calls: list[tuple] = []
    monkeypatch.setattr(
        "app.routers.producer_me.send_submission_confirmation",
        lambda *a: calls.append(a),
    )
    producer, user = make_submit_ready_producer(db)
    producer.images = []  # break exactly one requirement
    db.commit()

    resp = client.post("/producers/me/submit-for-review", headers=auth_header(user))
    assert resp.status_code == 422, resp.text
    assert calls == [], "a rejected submission must not be confirmed to the owner"


@pytest.mark.parametrize("status", ["pending", "approved", "rejected", "inactive"])
def test_not_sent_on_409_non_draft(client, db, monkeypatch, status):
    calls: list[tuple] = []
    monkeypatch.setattr(
        "app.routers.producer_me.send_submission_confirmation",
        lambda *a: calls.append(a),
    )
    producer, user = make_submit_ready_producer(db, status=status)
    resp = client.post("/producers/me/submit-for-review", headers=auth_header(user))
    assert resp.status_code == 409, resp.text
    assert calls == [], f"no confirmation for a {status} business"
