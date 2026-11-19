"""MEH-3384 (rulings 17/11 §א9): prompt caching on the fixed system prompt.

The chat answer call and the intent classifier send `system` as a list of
blocks. The fixed part carries `cache_control: ephemeral`; the live JSON of a
db_query turn rides in its own block AFTER the breakpoint, so a changing
question never invalidates the cached prefix. The usage counters are read
defensively, so a response without them never breaks the reply.
"""

import inspect
import logging
from types import SimpleNamespace

from starlette.requests import Request

from app.routers import chat
from app.schemas.schemas import ChatRequest
from app.services import chat_intent_router as router


def _request(ip: str = "203.0.113.84") -> Request:
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


def _client(calls, usage=None):
    class _Client:
        class messages:  # mirrors the SDK attribute name
            @staticmethod
            def create(**kwargs):
                calls.append(kwargs)
                return SimpleNamespace(
                    content=[SimpleNamespace(type="text", text="שלום")],
                    usage=usage,
                )

        @staticmethod
        def with_options(**_kwargs):
            return _Client

    return _Client()


def _chat(monkeypatch, live, usage=None):
    calls: list[dict] = []
    monkeypatch.setattr(chat, "_get_client", lambda: _client(calls, usage))
    monkeypatch.setattr(chat, "_live_data_context", lambda *a, **k: live)
    body = ChatRequest(messages=[{"role": "user", "content": "כמה עסקים יש?"}])
    reply = inspect.unwrap(chat.chat)(_request(), body)
    assert reply.reply == "שלום"
    return calls[0]["system"]


def test_freeform_turn_sends_one_cached_block(monkeypatch):
    system = _chat(monkeypatch, live=None)
    assert isinstance(system, list) and len(system) == 1
    assert system[0]["text"] == chat._base_system_prompt()
    assert system[0]["cache_control"] == {"type": "ephemeral"}


def test_live_data_goes_after_the_breakpoint_uncached(monkeypatch):
    live = "<live_data>\n{}\n</live_data>"
    system = _chat(monkeypatch, live=live)
    assert [b["text"] for b in system] == [chat._base_system_prompt(), live]
    assert system[0]["cache_control"] == {"type": "ephemeral"}
    # The live block changes per question: a breakpoint on it (or the live
    # text inside the cached block) would make every db_query turn a miss.
    assert "cache_control" not in system[1]
    assert live not in system[0]["text"]


def test_classifier_system_is_cached(monkeypatch):
    calls: list[dict] = []
    router.classify(_client(calls), "שלום", [{"name": "לחם", "slug": "bread"}])
    system = calls[0]["system"]
    assert len(system) == 1
    assert "bread" in system[0]["text"]
    assert system[0]["cache_control"] == {"type": "ephemeral"}


def test_cache_read_tokens_are_logged(monkeypatch, caplog):
    usage = SimpleNamespace(cache_read_input_tokens=1234, cache_creation_input_tokens=0)
    with caplog.at_level(logging.DEBUG, logger="app.services.chat_intent_router"):
        _chat(monkeypatch, live=None, usage=usage)
    assert "chat prompt cache: read=1234 written=0" in caplog.text


def test_usage_without_cache_fields_never_breaks_the_reply(monkeypatch, caplog):
    # A fake client, an older SDK, or a usage object with no cache counters:
    # the reply still goes out and nothing is logged.
    with caplog.at_level(logging.DEBUG, logger="app.services.chat_intent_router"):
        _chat(monkeypatch, live=None, usage=SimpleNamespace(input_tokens=10))
        _chat(monkeypatch, live=None, usage=None)
    assert "prompt cache" not in caplog.text
