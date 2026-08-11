"""MEH-1401 — welcome email is sent as RTL HTML (not plain-text only).

The plain-text welcome body rendered broken BiDi punctuation in Gmail
(no direction declaration). send_welcome_email now mirrors the
reset-password RTL HTML template for both the consumer and producer
variants, greets by first name only, and carries the LOCKED consumer copy.

Pure construction + monkeypatch — no DB, no network. send_email is
captured so we assert on the html= kwarg it receives.
"""

from __future__ import annotations

import pytest

from app.services import auth_emails as _ae
from app.services.auth_emails import send_welcome_email
from app.config import settings

FRONTEND = settings.frontend_url


@pytest.fixture
def capture(monkeypatch):
    """Patch send_email to record its args + the resend key so the
    early-return guard doesn't short-circuit before the send."""
    rec = {}

    def fake_send(email, subject, body, html=None):
        rec.update(email=email, subject=subject, body=body, html=html)

    monkeypatch.setattr("app.services.auth_emails.send_email", fake_send)
    monkeypatch.setattr(_ae.settings, "resend_api_key", "test-key")
    return rec


def test_welcome_consumer_sends_html_with_rtl_and_locked_copy(capture):
    ok = send_welcome_email("u@example.com", "Smadar Levi", "consumer")
    assert ok is True
    html = capture["html"]
    # Core AC: send_email received an html body for welcome.
    assert html is not None and 'dir="rtl"' in html and "direction:rtl" in html
    # LOCKED consumer copy, verbatim.
    assert "מהמקור מרכז בתי עסק מקומיים לאוכל אמיתי — כל אחד נבחר ואושר אישית." in html
    assert "מה עכשיו?" in html
    assert "יש שאלה? פשוט השיבי למייל הזה." in html
    # ONE primary CTA button → frontend_url; map stays a plain inline link.
    assert "גלו בתי עסק" in html
    assert f'href="{FRONTEND}"' in html
    assert f'href="{FRONTEND}/map"' in html
    # Subject unchanged.
    assert capture["subject"] == "ברוכה הבאה למהמקור 🌿"
    # Plain-text fallback carries the same locked copy.
    assert "מהמקור מרכז בתי עסק מקומיים לאוכל אמיתי" in capture["body"]


def test_welcome_greets_by_first_name_only(capture):
    send_welcome_email("u@example.com", "Smadar Levi", "consumer")
    assert "שלום Smadar," in capture["html"]
    assert "שלום Smadar," in capture["body"]
    # The surname is never rendered in the greeting.
    assert "שלום Smadar Levi," not in capture["html"]
    assert "שלום Smadar Levi," not in capture["body"]


def test_welcome_html_escapes_name(capture):
    # First whitespace-token carries the markup; must be escaped in HTML.
    send_welcome_email("u@example.com", "<script>x</script> Levi", "consumer")
    assert "&lt;script&gt;x&lt;/script&gt;" in capture["html"]
    assert "<script>x</script>" not in capture["html"]
    # Plain text keeps the raw first name (text isn't interpreted as markup).
    assert "<script>x</script>" in capture["body"]


def test_welcome_producer_variant(capture):
    send_welcome_email("biz@example.com", "דנה כהן", "producer")
    html = capture["html"]
    assert html is not None and 'dir="rtl"' in html
    assert "העסק שלך ממתין כרגע לאישור אדמין" in html
    # Producer CTA → dashboard.
    assert "ללוח הבקרה" in html
    assert f'href="{FRONTEND}/producer/dashboard"' in html
    # Greeting by first name.
    assert "שלום דנה," in html
    # Not the consumer body.
    assert "מה עכשיו?" not in html


def test_welcome_empty_name_is_guarded(capture):
    ok = send_welcome_email("u@example.com", "", "consumer")
    assert ok is True
    assert capture["html"] is not None
    assert "שלום ," in capture["html"]


def test_welcome_skips_without_resend_key(monkeypatch):
    called = {"n": 0}

    def fake_send(*a, **kw):
        called["n"] += 1

    monkeypatch.setattr("app.services.auth_emails.send_email", fake_send)
    monkeypatch.setattr(_ae.settings, "resend_api_key", "")
    ok = send_welcome_email("u@example.com", "Smadar", "consumer")
    assert ok is False
    assert called["n"] == 0
