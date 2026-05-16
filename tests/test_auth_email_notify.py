"""MEH-301 → MEH-328 — Registration verify-email dispatch.

Originally (MEH-301): POST /auth/register returned an ``email_sent`` flag
so the frontend could show a diagnostic banner when RESEND_API_KEY was
absent.

MEH-328 (OWASP anti-enumeration): /auth/register now returns an
identical ack body across every branch — the flag would leak which
branch the request hit, so it was removed. These tests preserve the
underlying invariant (verify-email background task is dispatched on a
new-email signup regardless of RESEND_API_KEY) via a direct monkeypatch
of the dispatcher.
"""
from unittest.mock import MagicMock


_REGISTER_ACK_DETAIL = (
    "אם האימייל פנוי, נשלחה אלייך הודעת אימות. אנא בדקי את תיבת הדואר."
)

VALID_CONSUMER_REG = {
    "email": "consumer301@test.com",
    "name": "שרה ישראלית",
    "password": "SecurePass123!",
}


def test_register_returns_generic_ack_no_token(client):
    """MEH-328: response shape is the generic ack on all branches —
    no access_token, no email_sent flag."""
    resp = client.post("/auth/register", json=VALID_CONSUMER_REG)
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"detail": _REGISTER_ACK_DETAIL}
    assert "access_token" not in body
    assert "email_sent" not in body


def test_verify_email_task_dispatched_on_new_signup(client, monkeypatch):
    """MEH-301 invariant preserved: the background dispatch runs on a
    new-email signup. We patch the dispatcher directly because the
    response no longer signals whether the email was sent (MEH-328)."""
    sender = MagicMock()
    monkeypatch.setattr("app.routers.auth._send_verify_email", sender)
    monkeypatch.setattr(
        "app.routers.auth._send_welcome_email", lambda *a, **kw: None
    )

    resp = client.post(
        "/auth/register",
        json={**VALID_CONSUMER_REG, "email": "dispatch-ok@test.com"},
    )
    assert resp.status_code == 200
    sender.assert_called_once()
    sent_email, sent_name, _sent_token = sender.call_args.args
    assert sent_email == "dispatch-ok@test.com"


def test_dispatch_independent_of_resend_api_key(client, monkeypatch):
    """The verify-email background task is queued whether or not
    RESEND_API_KEY is configured — the key check now lives inside
    send_email itself (auth.services.email.send_email), and the
    response cannot leak that distinction (MEH-328)."""
    sender = MagicMock()
    monkeypatch.setattr("app.routers.auth._send_verify_email", sender)
    monkeypatch.setattr(
        "app.routers.auth._send_welcome_email", lambda *a, **kw: None
    )

    from app.routers import auth as auth_module
    monkeypatch.setattr(auth_module.settings, "resend_api_key", "")

    resp = client.post(
        "/auth/register",
        json={**VALID_CONSUMER_REG, "email": "no-key@test.com"},
    )
    assert resp.status_code == 200
    sender.assert_called_once()
