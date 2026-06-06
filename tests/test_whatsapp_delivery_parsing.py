"""WhatsApp Graph-response parsing — AUD-009/010 (MEH-214).

Covers the new delivery-outcome classifier added to
`app.services.whatsapp`: HTTP-200 is no longer blindly "delivered", the
`wamid` is extracted, error objects are parsed, and the 24h-window error
codes are classified as `window_expired`. The public `send_text` /
`send_template` still return `bool` — these tests assert both the rich
result and the back-compat boolean.

Pure unit tests: `httpx.post` is stubbed, no network and no DB.
"""
from __future__ import annotations

import httpx
import pytest

from app.services import whatsapp as wa
from app.services.whatsapp import (
    OUTCOME_ACCEPTED,
    OUTCOME_FAILED,
    OUTCOME_WINDOW_EXPIRED,
    WhatsAppSendResult,
    _classify,
    _result_from_error,
    _safe_json,
)


class _FakeResponse:
    def __init__(self, status_code: int, body, *, raise_status: bool = False):
        self.status_code = status_code
        self._body = body
        self._raise_status = raise_status

    def json(self):
        if self._body is _NO_JSON:
            raise ValueError("no json")
        return self._body

    def raise_for_status(self):
        if self._raise_status:
            raise httpx.HTTPStatusError(
                "error",
                request=httpx.Request("POST", "https://graph.facebook.com/x"),
                response=self,  # type: ignore[arg-type]
            )


_NO_JSON = object()


# --- _classify (2xx body) -------------------------------------------------

def test_classify_accepted_extracts_wamid():
    body = {"messages": [{"id": "wamid.ABC123"}], "messaging_product": "whatsapp"}
    result = _classify(200, body)
    assert result.ok is True
    assert result.outcome == OUTCOME_ACCEPTED
    assert result.message_id == "wamid.ABC123"
    assert result.http_status == 200


def test_classify_200_with_error_object_is_failure():
    """A Graph 200 can still carry an error object — must not be 'delivered'."""
    body = {"error": {"code": 100, "message": "bad param"}}
    result = _classify(200, body)
    assert result.ok is False
    assert result.outcome == OUTCOME_FAILED
    assert result.error_code == 100


def test_classify_200_no_body_is_accepted_backcompat():
    """2xx with an unparseable body keeps the pre-AUD-009 success contract."""
    result = _classify(200, None)
    assert result.ok is True
    assert result.outcome == OUTCOME_ACCEPTED
    assert result.message_id is None


# --- _result_from_error (window classification) ---------------------------

@pytest.mark.parametrize("code", [470, 131047, 131051])
def test_window_expired_codes_classified(code):
    result = _result_from_error(400, {"code": code, "message": "window closed"})
    assert result.outcome == OUTCOME_WINDOW_EXPIRED
    assert result.ok is False
    assert result.error_code == code


def test_generic_error_code_is_failed_not_window():
    result = _result_from_error(400, {"code": 131026, "message": "undeliverable"})
    assert result.outcome == OUTCOME_FAILED
    assert result.ok is False


def test_error_without_int_code():
    result = _result_from_error(400, {"message": "no code field"})
    assert result.outcome == OUTCOME_FAILED
    assert result.error_code is None
    assert result.error_message == "no code field"


# --- _safe_json -----------------------------------------------------------

def test_safe_json_non_dict_returns_none():
    assert _safe_json(_FakeResponse(200, ["not", "a", "dict"])) is None


def test_safe_json_decode_failure_returns_none():
    assert _safe_json(_FakeResponse(200, _NO_JSON)) is None


# --- public bool façade (send_text) ---------------------------------------

def test_send_text_fail_open_when_unconfigured(monkeypatch):
    monkeypatch.setattr(wa.settings, "whatsapp_phone_number_id", "")
    monkeypatch.setattr(wa.settings, "whatsapp_access_token", "")
    assert wa.send_text("+972501234567", "hi") is False


def _configure(monkeypatch):
    monkeypatch.setattr(wa.settings, "whatsapp_phone_number_id", "PNID")
    monkeypatch.setattr(wa.settings, "whatsapp_access_token", "tok")


def test_send_text_accepted_returns_true(monkeypatch):
    _configure(monkeypatch)
    monkeypatch.setattr(
        wa.httpx, "post",
        lambda *a, **k: _FakeResponse(200, {"messages": [{"id": "wamid.OK"}]}),
    )
    assert wa.send_text("+972501234567", "hi") is True


def test_send_text_window_expired_returns_false(monkeypatch):
    _configure(monkeypatch)
    err_body = {"error": {"code": 131047, "message": "re-engagement"}}
    monkeypatch.setattr(
        wa.httpx, "post",
        lambda *a, **k: _FakeResponse(400, err_body, raise_status=True),
    )
    assert wa.send_text("+972501234567", "late reply") is False


def test_send_text_transport_error_returns_false(monkeypatch):
    _configure(monkeypatch)

    def _boom(*a, **k):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(wa.httpx, "post", _boom)
    assert wa.send_text("+972501234567", "hi") is False


def test_post_result_surfaces_rich_outcome(monkeypatch):
    """The internal result carries the wamid the watchdog/admin path can log."""
    _configure(monkeypatch)
    monkeypatch.setattr(
        wa.httpx, "post",
        lambda *a, **k: _FakeResponse(200, {"messages": [{"id": "wamid.RICH"}]}),
    )
    result = wa._post_result({"to": "x"}, kind="text", to="+972501234567")
    assert isinstance(result, WhatsAppSendResult)
    assert result.outcome == OUTCOME_ACCEPTED
    assert result.message_id == "wamid.RICH"
