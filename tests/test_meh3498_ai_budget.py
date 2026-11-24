"""MEH-3498 — one site-wide daily ceiling on paid AI calls, per model tier.

Above it the owner tools answer as if the key were missing (a Hebrew 503) and
the visitor chat gives its offline reply; moderation is not counted. The
model is never called: each test patches the client.
"""

import inspect
import logging
import uuid
from datetime import date
from types import SimpleNamespace

import pytest

from starlette.requests import Request

from app.routers import chat
from app.schemas.schemas import ChatRequest
from app.services import ai_budget, ai_text
from tests.conftest import auth_header, make_producer, make_user

DESCRIBE_URL = "/producers/me/product-description/suggest"
DESCRIBE_BODY = {
    "name": "לחם מחמצת",
    "group": "לחמים",
    "price_min": "32",
    "price_unit": "unit",
}


def _fake_client(calls, text="תשובה."):
    class _Client:
        class messages:  # mirrors the SDK attribute name
            @staticmethod
            def create(**kwargs):
                calls.append(kwargs)
                return SimpleNamespace(
                    content=[SimpleNamespace(type="text", text=text)],
                    stop_reason="end_turn",
                )

    return _Client()


def _owner(db):
    producer = make_producer(db)
    user = make_user(db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com")
    user.producer_id = producer.id
    user.is_producer = True
    db.commit()
    db.refresh(user)
    return user


def _freeze_day(monkeypatch, day):
    monkeypatch.setattr(ai_budget, "israel_today", lambda: day)


@pytest.fixture(autouse=True)
def _clear_alert_marks():
    # The once-per-day alert marks live in the process, beside the counter.
    ai_budget._alerted.clear()
    yield
    ai_budget._alerted.clear()


def test_a_tier_allows_its_limit_then_refuses(monkeypatch):
    _freeze_day(monkeypatch, date(2026, 11, 24))
    monkeypatch.setitem(ai_budget.DAILY_LIMITS, "fast", 3)
    assert [ai_budget.allow("fast") for _ in range(4)] == [True, True, True, False]


def test_the_tiers_are_counted_apart(monkeypatch):
    _freeze_day(monkeypatch, date(2026, 11, 24))
    monkeypatch.setitem(ai_budget.DAILY_LIMITS, "fast", 1)
    monkeypatch.setitem(ai_budget.DAILY_LIMITS, "menu", 1)
    assert ai_budget.allow("fast") is True
    assert ai_budget.allow("fast") is False
    assert ai_budget.allow("menu") is True  # a spent fast tier leaves Opus alone


def test_the_count_starts_again_on_the_next_israel_day(monkeypatch):
    monkeypatch.setitem(ai_budget.DAILY_LIMITS, "fast", 1)
    _freeze_day(monkeypatch, date(2026, 11, 24))
    assert ai_budget.allow("fast") is True
    assert ai_budget.allow("fast") is False
    _freeze_day(monkeypatch, date(2026, 11, 25))
    assert ai_budget.allow("fast") is True


def test_one_error_at_80_percent_and_one_at_the_limit(monkeypatch, caplog):
    _freeze_day(monkeypatch, date(2026, 11, 24))
    monkeypatch.setitem(ai_budget.DAILY_LIMITS, "fast", 10)
    with caplog.at_level(logging.INFO, logger="app.services.ai_budget"):
        results = [ai_budget.allow("fast") for _ in range(12)]
    assert results == [True] * 10 + [False, False]
    errors = [r.getMessage() for r in caplog.records if r.levelno == logging.ERROR]
    assert errors == [
        "[ai-budget] fast tier at 8 of 10 calls today",
        "[ai-budget] fast tier at 10 of 10 calls today",
    ]


def test_a_broken_counter_fails_open(monkeypatch):
    class _Broken:
        def hit(self, *a, **k):
            raise RuntimeError("storage down")

    monkeypatch.setattr(ai_budget.limiter, "_limiter", _Broken())
    assert ai_budget.allow("fast") is True


def test_an_owner_tool_over_the_ceiling_is_a_hebrew_503_without_a_model_call(
    client, db, monkeypatch
):
    calls = []
    _freeze_day(monkeypatch, date(2026, 11, 24))
    monkeypatch.setattr(ai_text, "_get_client", lambda: _fake_client(calls))
    monkeypatch.setitem(ai_budget.DAILY_LIMITS, "fast", 1)
    user = _owner(db)
    first = client.post(DESCRIBE_URL, json=DESCRIBE_BODY, headers=auth_header(user))
    assert first.status_code == 200, first.text
    second = client.post(DESCRIBE_URL, json=DESCRIBE_BODY, headers=auth_header(user))
    assert second.status_code == 503
    assert (
        second.json()["detail"] == "לא הצלחנו להציע תיאור הפעם. אפשר לכתוב אותו ידנית."
    )
    assert len(calls) == 1  # the refused request never reached the model


def test_the_chat_over_the_ceiling_gives_the_offline_reply(monkeypatch):
    calls = []
    monkeypatch.setattr(chat, "_get_client", lambda: _fake_client(calls, "שלום"))
    monkeypatch.setattr(chat, "_live_data_context", lambda *a, **k: None)
    _freeze_day(monkeypatch, date(2026, 11, 24))
    monkeypatch.setitem(ai_budget.DAILY_LIMITS, "fast", 1)
    handler = inspect.unwrap(chat.chat)
    body = ChatRequest(messages=[{"role": "user", "content": "היי"}])
    req = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/chat",
            "headers": [],
            "client": ("198.51.100.7", 40000),
            "query_string": b"",
        }
    )
    assert handler(req, body).reply == "שלום"
    assert handler(req, body).reply == chat.OFFLINE_REPLY
    assert len(calls) == 1


def test_the_alert_still_fires_once_when_a_threshold_is_skipped(monkeypatch, caplog):
    """Two threads can both read past 80%; the next call still alerts, once."""
    _freeze_day(monkeypatch, date(2026, 11, 24))
    monkeypatch.setitem(ai_budget.DAILY_LIMITS, "menu", 10)
    for _ in range(8):  # spend to 8 of 10 without reading the window
        ai_budget.limiter._limiter.hit(
            ai_budget.parse_limit("10/day"), ai_budget.NAMESPACE, "menu:2026-11-24"
        )
    with caplog.at_level(logging.ERROR, logger="app.services.ai_budget"):
        assert ai_budget.allow("menu") is True  # 9 of 10, past the 8 mark
        assert ai_budget.allow("menu") is True  # 10 of 10
        assert ai_budget.allow("menu") is False
    errors = [r.getMessage() for r in caplog.records if r.levelno == logging.ERROR]
    assert errors == [
        "[ai-budget] menu tier at 8 of 10 calls today",
        "[ai-budget] menu tier at 10 of 10 calls today",
    ]


def test_the_chat_intent_call_spends_its_own_unit(monkeypatch):
    _freeze_day(monkeypatch, date(2026, 11, 24))
    monkeypatch.setitem(ai_budget.DAILY_LIMITS, "fast", 0)
    called = []
    monkeypatch.setattr(
        chat.chat_intent_router, "classify", lambda *a, **k: called.append(a)
    )
    req = Request({"type": "http", "method": "POST", "path": "/chat", "headers": [],
                   "client": ("198.51.100.7", 40000), "query_string": b""})
    msgs = [{"role": "user", "content": "איפה יש לחם?"}]
    assert chat._live_data_context(object(), req, msgs) is None
    assert called == []  # refused before the second model call
