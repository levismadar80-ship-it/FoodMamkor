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


def _run_real_sdk(
    with_hook: bool, real_app: bool = False, db=None
) -> list[dict]:
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

    if real_app:
        # The production app, so middleware.py's `request_info` context and
        # the Referer header are in the event exactly as in prod.
        from app.main import app
    else:
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
        path = (
            f"/auth/verify-email?token={TOKEN}"
            if real_app
            else f"/auth/owner-invite/{TOKEN}?token={TOKEN}"
        )
        TestClient(app, raise_server_exceptions=False).get(
            path,
            headers={
                "Referer": f"https://mehamakor.co.il/he/reset-password?token={TOKEN}"
            },
        )
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


def test_control_real_app_without_hook_ships_the_token(db):
    """Premise for the next test: on the real app, the query token and the
    Referer reach a trace when the hook is absent."""
    transactions = _run_real_sdk(with_hook=False, real_app=True, db=db)
    assert len(transactions) == 1
    assert TOKEN in str(transactions[0])


def test_real_app_trace_carries_no_token_anywhere(db):
    transactions = _run_real_sdk(with_hook=True, real_app=True, db=db)
    assert len(transactions) == 1
    event = transactions[0]
    assert TOKEN not in str(event)
    # The fields that carried it are still there, redacted — not dropped.
    assert "token=[token]" in event["request"]["query_string"]
    referer = {k.lower(): v for k, v in event["request"]["headers"].items()}
    assert referer["referer"].endswith("reset-password?token=[token]")


@pytest.mark.parametrize(
    "raw, expected",
    [
        (f"/register/producer/prefill/{TOKEN}", "/register/producer/prefill/[token]"),
        (f"/home-products/rate/{TOKEN}", "/home-products/rate/[token]"),
        # MEH-2974 class: the 14-day draft-preview link (#4732) is a JWT path.
        (
            "/producer-preview/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln-X_y",
            "/producer-preview/[token]",
        ),
        (
            "https://x.example/he/draft-preview/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln-X_y",
            "https://x.example/he/draft-preview/[token]",
        ),
        (f"https://x.example/he/verify-email?token={TOKEN}&a=1", "https://x.example/he/verify-email?token=[token]&a=1"),
        (f"lang=he&reset_token={TOKEN}", "lang=he&reset_token=[token]"),
        # 40-char floor: a build artifact is left alone.
        ("/rate/page-8f21c0.js", "/rate/page-8f21c0.js"),
        # a param that merely contains "token" mid-name after ? is still a token
        ("/p?page=2", "/p?page=2"),
    ],
)
def test_redact_url_tokens_new_shapes(raw, expected):
    from app.utils.pii import redact_url_tokens

    assert redact_url_tokens(raw) == expected
