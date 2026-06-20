"""Mutation-guided test expansion (2026-06, Refs MEH-214) — domain B5.

WhatsApp send-layer behavior. The existing suite tests template
*construction* (MEH-672/754) and webhook security (MEH-509), but NOT the
two send functions' runtime contract:
  - fail-open when unconfigured (no httpx call at all) — WA-1 / WA-5;
  - Israeli "+972…" → Meta-E.164 "972…" strip — WA-2;
  - HTTP error → False (never report a failed send as success) — WA-3;
  - template payload carries type="template" + the template name — WA-4.

NOTE (coverage gap, logged for Sapir): the "Graph API returns HTTP 200 but
the message is undelivered" case is NOT handled anywhere in whatsapp.py —
`_post` treats any 200 as success. That mutant family SURVIVES because the
behavior doesn't exist to test. See plan doc → Survived.

These are pure-service tests (httpx monkeypatched) — no network. Run under
CI like the rest.
"""

import httpx

from app.config import settings
from app.services import whatsapp
from app.services.whatsapp_templates import ProducerWelcomeV1


class _OkResp:
    # MEH-771 Chunk C: status_code declared so production code can read it
    # directly. Was the `_OkResp` mock debt that forced
    # services/whatsapp.py to use getattr(r, "status_code", None) — now
    # dropped (services/whatsapp.py:_post_result).
    status_code = 200

    def raise_for_status(self):
        return None


def _configure(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "PNID")
    monkeypatch.setattr(settings, "whatsapp_access_token", "TOKEN")


def _unconfigure(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "")
    monkeypatch.setattr(settings, "whatsapp_access_token", "")


# ---------- WA-1 / WA-5 — fail-open, no network when unconfigured ----------


def test_send_text_fail_open_no_network_when_unconfigured(monkeypatch):
    _unconfigure(monkeypatch)
    calls = []
    monkeypatch.setattr(
        whatsapp.httpx, "post", lambda *a, **k: calls.append(1) or _OkResp()
    )
    assert whatsapp.send_text("+972501234567", "שלום") is False
    assert calls == []  # guard short-circuits before any POST


def test_send_template_fail_open_no_network_when_unconfigured(monkeypatch):
    _unconfigure(monkeypatch)
    calls = []
    monkeypatch.setattr(
        whatsapp.httpx, "post", lambda *a, **k: calls.append(1) or _OkResp()
    )
    tmpl = ProducerWelcomeV1(producer_name="חוות הבדיקה")
    assert whatsapp.send_template("+972501234567", tmpl) is False
    assert calls == []


# ---------- WA-2 — leading "+" stripped from the destination ----------


def test_send_text_strips_leading_plus(monkeypatch):
    _configure(monkeypatch)
    captured = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        captured["json"] = json
        return _OkResp()

    monkeypatch.setattr(whatsapp.httpx, "post", fake_post)
    assert whatsapp.send_text("+972501234567", "שלום") is True
    assert captured["json"]["to"] == "972501234567"


# ---------- WA-3 — HTTP error → False (no false-positive success) ----------


def test_post_http_error_returns_false(monkeypatch):
    _configure(monkeypatch)

    def boom(*a, **k):
        raise httpx.HTTPError("network down")

    monkeypatch.setattr(whatsapp.httpx, "post", boom)
    assert whatsapp.send_text("972501234567", "שלום") is False


# ---------- WA-4 — template payload shape ----------


def test_send_template_payload_is_template_type(monkeypatch):
    _configure(monkeypatch)
    captured = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        captured["json"] = json
        return _OkResp()

    monkeypatch.setattr(whatsapp.httpx, "post", fake_post)
    tmpl = ProducerWelcomeV1(producer_name="חוות הבדיקה")
    assert whatsapp.send_template("+972501234567", tmpl) is True
    payload = captured["json"]
    assert payload["type"] == "template"
    assert payload["template"]["name"] == "producer_welcome_v1"
    assert payload["template"]["language"]["code"] == tmpl.language
