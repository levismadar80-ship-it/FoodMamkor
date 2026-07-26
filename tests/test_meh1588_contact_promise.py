"""
MEH-1588 — contact form: one promise across both surfaces, and a notification
failure that is no longer silent.

Two independent guarantees are asserted here:

  1. The success `detail` states the same 3-business-day SLA the frontend
     states (messages/he.json:2882 / :2884), in the feminine voice (ADR-014),
     with no emoji (a toast surface — outside the email/WhatsApp/share
     carve-out in docs/BRAND.md:70-72).

  2. A notification failure never turns a saved submission into an error
     response, AND is reported rather than swallowed.

REUSES: tests/conftest.py `client` fixture. The router-level helper is
monkeypatched at its module surface (the same technique
tests/test_onboarding_followup.py uses for send_email), so no Resend HTTP call
is attempted from the test process.
"""
from __future__ import annotations

import logging

import pytest

from app.routers import marketing

# The exact string the endpoint must return. Locked by the MEH-1588 spec —
# if this test needs editing to pass, the copy changed and that needs sign-off.
EXPECTED_DETAIL = "תודה! נחזור אלייך תוך 3 ימי עסקים"


def _payload(**overrides):
    body = {
        "name": "ספיר ניסוי",
        "email": "contact_promise@example.com",
        "message": "הודעת בדיקה עם מספיק תוכן כדי לעבור ולידציה.",
    }
    body.update(overrides)
    return body


# --- 1. the promise ---------------------------------------------------------


def test_success_detail_states_the_three_day_sla(client):
    res = client.post("/contact", json=_payload())

    assert res.status_code == 200
    assert res.json()["detail"] == EXPECTED_DETAIL


def test_success_detail_has_no_vague_timeframe_and_no_emoji(client):
    """The two defects the ticket names, asserted separately from the exact
    string so a future reword cannot silently reintroduce either."""
    detail = client.post("/contact", json=_payload()).json()["detail"]

    # Vague-vs-numeric: the frontend commits to a number, so the backend must.
    assert "בקרוב" not in detail
    # Feminine singular (ADR-014), not plural.
    assert "אלייך" in detail
    assert "אליכם" not in detail
    # Emoji LOCK v2 — this renders as a UI toast, not an email body.
    assert not any(ord(ch) > 0x2100 for ch in detail), (
        f"emoji/pictograph found in toast copy: {detail!r}"
    )


# --- 2. the failure is fail-open AND visible --------------------------------


def test_submission_succeeds_when_notification_raises(client, monkeypatch, caplog):
    """The row is already committed and the visitor has already been promised a
    reply — a notification failure must not become an error response."""

    def boom(_msg, _label):
        raise RuntimeError("resend exploded")

    monkeypatch.setattr(marketing, "_send_contact_email", boom)

    with caplog.at_level(logging.ERROR, logger=marketing.logger.name):
        res = client.post("/contact", json=_payload())

    assert res.status_code == 200, "a failed notification must not fail the form"
    assert res.json()["detail"] == EXPECTED_DETAIL


def test_notification_failure_is_reported_with_the_row_id(
    client, db, monkeypatch, caplog
):
    """Fail-open is not the same as silent. The failure must be logged at ERROR
    and must carry the ContactMessage id, so a submission nobody was emailed
    about is still recoverable by primary key."""
    from app.models.models import ContactMessage

    def boom(_msg, _label):
        raise RuntimeError("resend exploded")

    monkeypatch.setattr(marketing, "_send_contact_email", boom)

    with caplog.at_level(logging.ERROR, logger=marketing.logger.name):
        client.post("/contact", json=_payload(email="rowid@example.com"))

    row = (
        db.query(ContactMessage)
        .filter(ContactMessage.email == "rowid@example.com")
        .first()
    )
    assert row is not None, "the submission must still be persisted"

    errors = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert errors, "the failure must be reported at ERROR, not swallowed"
    assert any(str(row.id) in r.getMessage() for r in errors), (
        "the ERROR log must name the ContactMessage row id so the lost "
        f"submission is recoverable; got: {[r.getMessage() for r in errors]}"
    )


def test_missing_recipient_is_reported_at_error(client, db, monkeypatch, caplog):
    """The live silent failure this ticket closes: with neither CONTACT_EMAIL
    nor ADMIN_EMAIL configured, nobody is ever emailed. That was logged at INFO
    (invisible); it must be ERROR and must carry the row id."""
    from app.models.models import ContactMessage

    monkeypatch.setattr(marketing.settings, "contact_email", None, raising=False)
    monkeypatch.setattr(marketing.settings, "admin_email", None, raising=False)

    with caplog.at_level(logging.ERROR, logger=marketing.logger.name):
        res = client.post("/contact", json=_payload(email="norecipient@example.com"))

    assert res.status_code == 200

    row = (
        db.query(ContactMessage)
        .filter(ContactMessage.email == "norecipient@example.com")
        .first()
    )
    assert row is not None

    errors = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert errors, "a total notification outage must not be logged at INFO"
    assert any(str(row.id) in r.getMessage() for r in errors)


@pytest.mark.parametrize("raiser", [RuntimeError, ValueError, KeyError])
def test_fail_open_holds_for_any_exception_type(client, monkeypatch, raiser):
    """The guard is `except Exception`, not a narrow catch — assert that
    explicitly so narrowing it later shows up as a failure here."""

    def boom(_msg, _label):
        raise raiser("boom")

    monkeypatch.setattr(marketing, "_send_contact_email", boom)

    assert client.post("/contact", json=_payload()).status_code == 200
