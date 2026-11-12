"""MEH-3010 — a site-wide daily cap on /chat (not per IP), and the 500-char
visitor message limit enforced by the server, not only by the widget."""

import inspect
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from starlette.requests import Request

from app.routers import chat
from app.schemas.schemas import ChatMessage, ChatRequest


def _request(ip):
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/chat",
            "headers": [],
            "client": (ip, 40000),
            "query_string": b"",
        }
    )


def _client(calls):
    class _Client:
        class messages:  # mirrors the SDK attribute name
            @staticmethod
            def create(**kwargs):
                calls.append(kwargs)
                return SimpleNamespace(
                    content=[SimpleNamespace(type="text", text="שלום")]
                )

    return _Client()


def test_global_cap_is_shared_across_ips_and_skips_the_model(monkeypatch):
    calls = []
    monkeypatch.setattr(chat, "_get_client", lambda: _client(calls))
    monkeypatch.setattr(chat, "_live_data_context", lambda *a, **k: None)
    monkeypatch.setattr(chat, "GLOBAL_DAILY_LIMIT", "2/day")
    handler = inspect.unwrap(chat.chat)
    body = ChatRequest(messages=[{"role": "user", "content": "היי"}])
    # Three different IPs: a per-IP limit would let all three through.
    replies = [handler(_request(f"198.51.100.{i}"), body).reply for i in (1, 2, 3)]
    assert replies[:2] == ["שלום", "שלום"]
    assert replies[2] == chat.OFFLINE_REPLY
    assert len(calls) == 2  # the over-cap message never reached the model


def test_global_cap_fails_open_when_the_counter_breaks(monkeypatch):
    monkeypatch.setattr(chat, "GLOBAL_DAILY_LIMIT", "not a limit")
    assert chat._global_chat_allowed() is True


def test_user_message_500_ok_501_rejected():
    ChatMessage(role="user", content="א" * 500)
    with pytest.raises(ValidationError):
        ChatMessage(role="user", content="א" * 501)


def test_assistant_message_keeps_the_wider_limit():
    ChatMessage(role="assistant", content="א" * 1500)


def test_chat_endpoint_rejects_long_user_message(client):
    res = client.post(
        "/chat", json={"messages": [{"role": "user", "content": "א" * 501}]}
    )
    assert res.status_code == 422
