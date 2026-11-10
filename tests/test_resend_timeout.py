"""MEH-2886 chunk 4 — every Resend call carries a 10 s HTTP timeout.

The SDK's stock client is ``RequestsClient(timeout=30)``. Until MEH-2886
chunk 2 a background send held a DB connection for as long as Resend took,
so 30 s per stuck send was 30 s of a pool slot. The timeout is a code
constant (Sapir 10/11: no new env var).

The assertion is on the wire, not on our helper: ``requests.request`` inside
the SDK is replaced by a recorder, and the test reads the ``timeout=`` the
SDK actually passed. Both production entry points are covered — the mail
sender and the newsletter contact sync.
"""

import json

import pytest
import resend
import resend.http_client_requests as resend_http

from app.config import settings
from app.services import newsletter_sync
from app.services.email import send_email
from app.services.resend_client import RESEND_TIMEOUT_SECONDS


class _Resp:
    def __init__(self, body):
        self.content = json.dumps(body).encode()
        self.status_code = 200
        self.headers = {"content-type": "application/json"}


@pytest.fixture
def wire(monkeypatch):
    """Record every HTTP request the Resend SDK makes; answer 200."""
    calls = []

    def fake_request(**kwargs):
        calls.append(kwargs)
        if kwargs["url"].endswith("/segments") and kwargs["method"] == "get":
            return _Resp({"data": [{"id": "seg_1", "name": "newsletter"}]})
        return _Resp({"id": "x", "data": []})

    monkeypatch.setattr(resend_http.requests, "request", fake_request)
    # Start from the SDK's stock client, and restore it afterwards.
    monkeypatch.setattr(resend, "default_http_client", resend.RequestsClient())
    monkeypatch.setattr(settings, "resend_api_key", "re_test_key")
    monkeypatch.setattr(newsletter_sync, "_segment_id", None)
    # configure_resend writes the module-level key; restore it afterwards.
    monkeypatch.setattr(resend, "api_key", getattr(resend, "api_key", None))
    return calls


def test_control_stock_sdk_client_waits_30_seconds(wire, monkeypatch):
    """Control: the recorder sees the SDK default when nothing configures it,
    so the 10 s readings below are this change and not the instrument."""
    monkeypatch.setattr(resend, "api_key", "re_test_key")
    resend.Emails.send({"from": "a@b.co", "to": "c@d.co", "subject": "s", "text": "t"})
    assert [c["timeout"] for c in wire] == [30]


def test_send_email_uses_ten_second_timeout(wire):
    send_email("someone@mehamakor-test.co.il", "subject", "body")
    assert len(wire) == 1, "send_email made no Resend call — nothing measured"
    assert wire[0]["timeout"] == RESEND_TIMEOUT_SECONDS == 10


def test_newsletter_sync_uses_ten_second_timeout(wire):
    newsletter_sync.sync_subscribe("someone@mehamakor-test.co.il")
    assert len(wire) >= 1, "sync_subscribe made no Resend call — nothing measured"
    assert {c["timeout"] for c in wire} == {RESEND_TIMEOUT_SECONDS}


def test_stub_resend_module_without_client_names_still_sends(monkeypatch):
    """Tests (and possibly a future SDK) provide a `resend` module without
    `RequestsClient` / `default_http_client`. configure_resend must still set
    the key and let the send happen — not raise into the callers' fail-open."""
    import sys
    import types

    sent = []
    stub = types.ModuleType("resend")
    stub.Emails = types.SimpleNamespace(send=lambda params: sent.append(params))
    monkeypatch.setitem(sys.modules, "resend", stub)
    monkeypatch.setattr(settings, "resend_api_key", "re_test_key")

    send_email("someone@mehamakor-test.co.il", "subject", "body")

    assert len(sent) == 1, "the stub's send was never called"
    assert stub.api_key == "re_test_key"
