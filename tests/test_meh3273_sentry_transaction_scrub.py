"""MEH-3273 — bearer tokens in URLs must not reach Sentry on TRACES.

`before_send` (MEH-2974 scrub) never runs for `type == "transaction"`
events; sentry-sdk routes those to `before_send_transaction`. The
end-to-end test drives the REAL SDK + FastApiIntegration with a capturing
transport, so it proves both halves: the SDK does put the raw path in a
transaction's `request.url`, and our hook removes the token.
"""

from unittest.mock import patch

import pytest

TOKEN = "A" * 43  # token_urlsafe(32) shape, above the 40-char floor


def _transaction_event(url: str, query: str = "") -> dict:
    return {
        "type": "transaction",
        "transaction": "/auth/owner-invite/{token}",
        "request": {"url": url, "query_string": query},
    }


def test_init_registers_before_send_transaction(monkeypatch):
    monkeypatch.setenv("BACKEND_SENTRY_DSN", "https://example@sentry.io/1")
    from app.sentry import before_send_transaction, init_sentry

    with patch("sentry_sdk.init") as mock_init:
        init_sentry()
    assert mock_init.call_args.kwargs["before_send_transaction"] is (
        before_send_transaction
    )


def test_hook_scrubs_path_token():
    from app.sentry import before_send_transaction

    event = _transaction_event(f"https://api.example.com/auth/owner-invite/{TOKEN}")
    out = before_send_transaction(event, {})
    assert out is event
    assert TOKEN not in out["request"]["url"]
    assert out["request"]["url"].endswith("/auth/owner-invite/[token]")


def test_hook_scrubs_query_token():
    from app.sentry import before_send_transaction

    event = _transaction_event(
        "https://api.example.com/auth/verify-email", f"lang=he&token={TOKEN}"
    )
    out = before_send_transaction(event, {})
    assert out["request"]["query_string"] == "lang=he&token=[token]"


def test_hook_fails_open_on_malformed_event():
    from app.sentry import before_send_transaction

    event = {"type": "transaction", "request": "not-a-dict"}
    assert before_send_transaction(event, {}) is event


def _run_real_sdk(with_hook: bool) -> list[dict]:
    sentry_sdk = pytest.importorskip("sentry_sdk")
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.transport import Transport

    from app.sentry import before_send, before_send_transaction

    captured: list[dict] = []

    class _Capture(Transport):
        def capture_envelope(self, envelope):
            for item in envelope.items:
                payload = item.payload.json
                if payload:
                    captured.append(payload)

    app = FastAPI()

    @app.get("/auth/owner-invite/{token}")
    def _preview(token: str) -> dict:
        return {"ok": True}

    kwargs = {
        "dsn": "https://public@example.com/1",
        "transport": _Capture,
        "traces_sample_rate": 1.0,
        "integrations": [FastApiIntegration()],
        "before_send": before_send,
    }
    if with_hook:
        kwargs["before_send_transaction"] = before_send_transaction
    sentry_sdk.init(**kwargs)
    try:
        TestClient(app).get(f"/auth/owner-invite/{TOKEN}?token={TOKEN}")
        sentry_sdk.flush()
    finally:
        sentry_sdk.init(dsn=None)
    return [e for e in captured if e.get("type") == "transaction"]


def test_control_without_hook_the_sdk_ships_the_token():
    """Premise check: before_send alone does NOT cover traces. If this ever
    goes red, the SDK stopped filling request.url and the next test is void."""
    transactions = _run_real_sdk(with_hook=False)
    assert len(transactions) == 1
    assert TOKEN in str(transactions[0])


def test_real_sdk_transaction_does_not_carry_token():
    transactions = _run_real_sdk(with_hook=True)
    assert len(transactions) == 1
    assert "/auth/owner-invite/" in transactions[0]["request"]["url"]
    assert TOKEN not in str(transactions[0])
