"""MEH-493 unit tests for SentryRequestScopeMiddleware extensions.

Covers the no-op-shim + PII redaction surface that ships in this PR.
Dashboard receipt (request_info context, user.id, redacted email tags
arriving in Sentry) is verified once MEH-500 wires sentry_sdk.init —
see verify-on-SDK-land contract in MEH-493 PR body.
"""

from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import middleware as mw
from app.middleware import (
    SentryRequestScopeMiddleware,
    _redact_email,
    _try_extract_user_id,
)


# ─────────────────────────────────────────────
# _redact_email — pure helper, no FastAPI needed
# ─────────────────────────────────────────────


@pytest.mark.parametrize(
    "addr,expected",
    [
        ("alice@gmail.com", "a***@gmail.com"),
        ("bob@example.co.il", "b***@example.co.il"),
        ("smadar+tag@mehamakor.online", "s***@mehamakor.online"),
        # Defensive shapes — must not leak partial PII.
        ("", "<no-email>"),
        (None, "<no-email>"),
        ("no-at-sign", "<no-email>"),
        ("@nodomain.com", "<no-email>"),
    ],
)
def test_redact_email(addr, expected):
    assert _redact_email(addr) == expected


# ─────────────────────────────────────────────
# Dispatch — current state (sentry_sdk is None → fast no-op)
# ─────────────────────────────────────────────


def _build_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(SentryRequestScopeMiddleware)

    @app.get("/ping")
    def ping():
        return {"ok": True}

    return app


def test_dispatch_noop_when_sentry_unavailable(monkeypatch):
    """Current production state: _sentry_sdk is None → middleware is a
    fast-path no-op. Request must still reach the handler unaffected.
    """
    monkeypatch.setattr(mw, "_sentry_sdk", None)
    client = TestClient(_build_app())
    r = client.get("/ping")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_dispatch_sets_request_info_context_when_sdk_present(monkeypatch):
    """With sentry_sdk mocked in, set_context('request_info', ...) is
    called with url + method + client keys. Plus the existing MEH-483
    tags (route + method) still bind.
    """
    fake_scope = MagicMock()
    fake_cm = MagicMock()
    fake_cm.__enter__ = MagicMock(return_value=fake_scope)
    fake_cm.__exit__ = MagicMock(return_value=False)
    fake_sdk = MagicMock()
    fake_sdk.configure_scope.return_value = fake_cm
    monkeypatch.setattr(mw, "_sentry_sdk", fake_sdk)

    client = TestClient(_build_app())
    r = client.get("/ping")
    assert r.status_code == 200

    # request_info context bound exactly once
    fake_scope.set_context.assert_called_once()
    call = fake_scope.set_context.call_args
    assert call.args[0] == "request_info"
    payload = call.args[1]
    assert set(payload.keys()) == {"url", "method", "client"}
    assert payload["method"] == "GET"
    assert payload["url"].endswith("/ping")

    # Existing MEH-483 tags still wired
    tag_keys = {c.args[0] for c in fake_scope.set_tag.call_args_list}
    assert {"route", "method"}.issubset(tag_keys)


def test_dispatch_swallows_malformed_authorization_header(monkeypatch):
    """A garbage Bearer token must not 500 the request and must not
    set_user. The PII-guard fail-open contract from MEH-493 spec.
    """
    fake_scope = MagicMock()
    fake_cm = MagicMock()
    fake_cm.__enter__ = MagicMock(return_value=fake_scope)
    fake_cm.__exit__ = MagicMock(return_value=False)
    fake_sdk = MagicMock()
    fake_sdk.configure_scope.return_value = fake_cm
    monkeypatch.setattr(mw, "_sentry_sdk", fake_sdk)

    client = TestClient(_build_app())
    r = client.get(
        "/ping",
        headers={"Authorization": "Bearer not.a.real.jwt"},
    )
    assert r.status_code == 200
    fake_scope.set_user.assert_not_called()


# ─────────────────────────────────────────────
# _try_extract_user_id — direct unit (no Sentry coupling)
# ─────────────────────────────────────────────


class _FakeRequest:
    """Just enough of starlette.Request for header lookup."""

    def __init__(self, auth_header: str | None = None):
        self.headers = {"Authorization": auth_header} if auth_header else {}


def test_extract_user_id_no_header():
    assert _try_extract_user_id(_FakeRequest()) is None


def test_extract_user_id_non_bearer_scheme():
    assert _try_extract_user_id(_FakeRequest("Basic abcd")) is None


def test_extract_user_id_empty_bearer():
    assert _try_extract_user_id(_FakeRequest("Bearer ")) is None


def test_extract_user_id_malformed_jwt():
    assert _try_extract_user_id(_FakeRequest("Bearer not.a.real.jwt")) is None
