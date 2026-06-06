"""MEH-754 — OTP delivery via Meta AUTHENTICATION template.

Covers the migration of `_send_whatsapp_otp` from free-form `send_text`
(only delivered inside Meta's 24h window) to the `producer_otp_v1`
authentication template (delivered unconditionally).

Two surfaces:
  1. OtpCodeV1.to_components() — the code must appear TWICE (body param +
     copy-code URL button); a body-only payload 400s at Meta.
  2. _send_whatsapp_otp — calls send_template(OtpCodeV1) and stays
     fail-open (returns False, never raises) when config is missing.

Pure construction + monkeypatch; no DB, no network.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.services.whatsapp_templates import OtpCodeV1, WhatsAppTemplate


# ---- ClassVar contract ----------------------------------------------------

def test_otp_template_name_and_language():
    assert OtpCodeV1.name == "producer_otp_v1"
    assert OtpCodeV1.language == "he"
    assert issubclass(OtpCodeV1, WhatsAppTemplate)


# ---- Field validation (extra="forbid" inherited from base) ----------------

def test_otp_missing_code_raises():
    with pytest.raises(ValidationError):
        OtpCodeV1()  # type: ignore[call-arg] — missing code


def test_otp_extra_field_raises():
    with pytest.raises(ValidationError):
        OtpCodeV1(code="123456", extra="nope")  # type: ignore[call-arg]


# ---- to_components() — code appears in BOTH body and button ----------------

def test_otp_components_code_appears_twice():
    comps = OtpCodeV1(code="123456").to_components()
    assert comps == [
        {
            "type": "body",
            "parameters": [{"type": "text", "text": "123456"}],
        },
        {
            "type": "button",
            "sub_type": "url",
            "index": 0,
            "parameters": [{"type": "text", "text": "123456"}],
        },
    ]


def test_otp_components_body_and_button_both_carry_same_code():
    # Explicit count assertion guarding the Meta-400 failure class: the
    # exact same code string must surface in two distinct components.
    comps = OtpCodeV1(code="987654").to_components()
    occurrences = [
        p["text"]
        for comp in comps
        for p in comp["parameters"]
        if p["text"] == "987654"
    ]
    assert len(occurrences) == 2
    kinds = {comp["type"] for comp in comps}
    assert kinds == {"body", "button"}


# ---- _send_whatsapp_otp wrapper -------------------------------------------

def test_send_whatsapp_otp_uses_send_template(monkeypatch):
    """Wrapper sends the OTP as a template (not free-form text)."""
    from app.routers import producer_me

    captured = {}

    def fake_send_template(to, template):
        captured["to"] = to
        captured["template"] = template
        return True

    monkeypatch.setattr(producer_me, "send_template", fake_send_template)

    result = producer_me._send_whatsapp_otp("+972501234567", "246810")

    assert result is True
    assert captured["to"] == "+972501234567"
    assert isinstance(captured["template"], OtpCodeV1)
    assert captured["template"].code == "246810"
    assert captured["template"].name == "producer_otp_v1"


def test_send_whatsapp_otp_fail_open_when_config_missing(monkeypatch):
    """Missing WHATSAPP_* config → send_template returns False, no raise.

    Default test env has empty WHATSAPP_* settings, so this exercises the
    real fail-open path through send_template (caller still returns 200).
    """
    from app.routers import producer_me
    from app.services import whatsapp as whatsapp_module

    monkeypatch.setattr(whatsapp_module.settings, "whatsapp_phone_number_id", "")
    monkeypatch.setattr(whatsapp_module.settings, "whatsapp_access_token", "")

    result = producer_me._send_whatsapp_otp("+972501234567", "135790")

    assert result is False
