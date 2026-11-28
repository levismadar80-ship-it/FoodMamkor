"""MEH-3975 — an owner who signs up by email from the claim page gets back to
the claim after verifying, from any browser.

The short claim code (/c/<code>) is sent with /auth/register and rides on the
verification link as `&claim=<code>`. These tests hold the three ends of it:
the register route forwards a well-formed code, the schema refuses anything
else, and the emailed URL carries it (and nothing else) only when it is a
share code.
"""
from unittest.mock import MagicMock

import pytest

from app.services import auth_emails

CODE = "Pk8VP2JpqGI3"

REG = {
    "email": "claim3975@example.com",
    "name": "גולן אוחנה",
    "password": "SecurePass123!",
    "terms_accepted": True,
}


def _patch_senders(monkeypatch):
    sender = MagicMock()
    monkeypatch.setattr("app.routers.auth._send_verify_email", sender)
    monkeypatch.setattr("app.routers.auth._send_welcome_email", lambda *a, **kw: None)
    return sender


def test_register_forwards_claim_code_to_verify_email(client, monkeypatch):
    sender = _patch_senders(monkeypatch)
    resp = client.post("/auth/register", json={**REG, "claim_code": CODE})
    assert resp.status_code == 200
    sender.assert_called_once()
    assert sender.call_args.kwargs["claim_code"] == CODE


def test_register_without_claim_code_sends_none(client, monkeypatch):
    sender = _patch_senders(monkeypatch)
    resp = client.post("/auth/register", json={**REG, "email": "noclaim3975@example.com"})
    assert resp.status_code == 200
    assert sender.call_args.kwargs["claim_code"] is None


@pytest.mark.parametrize(
    "bad",
    [
        "short",  # too short
        "Pk8VP2JpqGI3x",  # 13 characters
        "Pk8VP2Jpq&I3",  # a character that could splice the URL
    ],
)
def test_register_rejects_malformed_claim_code(client, monkeypatch, bad):
    sender = _patch_senders(monkeypatch)
    resp = client.post("/auth/register", json={**REG, "email": "bad3975@example.com", "claim_code": bad})
    assert resp.status_code == 422
    sender.assert_not_called()


def _capture_send(monkeypatch):
    sent = {}

    def fake_send(to, subject, body, html=None, test_cause=False):
        sent["body"] = body
        sent["html"] = html
        return True

    monkeypatch.setattr(auth_emails, "send_email", fake_send)
    monkeypatch.setattr(auth_emails.settings, "resend_api_key", "re_test")
    monkeypatch.setattr(auth_emails.settings, "frontend_url", "https://example.test")
    return sent


def test_verify_link_carries_claim_code(monkeypatch):
    sent = _capture_send(monkeypatch)
    auth_emails.send_verify_email("a@example.com", "גולן", "TOK", claim_code=CODE)
    assert f"https://example.test/verify-email?token=TOK&claim={CODE}" in sent["body"]
    assert f"token=TOK&amp;claim={CODE}" in sent["html"] or f"token=TOK&claim={CODE}" in sent["html"]


def test_verify_link_without_claim_code_is_unchanged(monkeypatch):
    sent = _capture_send(monkeypatch)
    auth_emails.send_verify_email("a@example.com", "גולן", "TOK")
    assert "https://example.test/verify-email?token=TOK\n" in sent["body"]
    assert "claim=" not in sent["body"]


def test_verify_link_drops_a_malformed_claim_code(monkeypatch):
    """Defence in depth: a caller that skips the schema still cannot splice
    anything into the URL."""
    sent = _capture_send(monkeypatch)
    auth_emails.send_verify_email("a@example.com", "גולן", "TOK", claim_code="x&next=//evil")
    assert "claim=" not in sent["body"]
    assert "evil" not in sent["body"]
