"""
Module:   test_meh3668_no_emoji_in_ai_text
Purpose:  The site shows no emoji (Sapir 22/11, MEH-3668). Text a model writes
          for a person (the chat reply, the owner-side description and reply
          drafts) leaves the server with every emoji removed, whatever the
          model sent. The prompts ask; this is the part that enforces.
Related:  backend/app/services/ai_text.py (strip_emoji, ask),
          backend/app/routers/chat.py (the reply), and
          scripts/checks/no-emoji-backend-guard.sh, which locks the strings
          the server itself writes.
"""

import inspect
from types import SimpleNamespace

import pytest
from starlette.requests import Request

from app.routers import chat
from app.schemas.schemas import ChatRequest
from app.services import ai_text


@pytest.mark.parametrize(
    "raw, want",
    [
        ("שלום 🌿", "שלום"),
        ("🌿 עסק חדש במהמקור!", "עסק חדש במהמקור!"),
        ("אפשר להזמין 😊 ולקבל עד הבית.", "אפשר להזמין ולקבל עד הבית."),
        ("כן ❤️.", "כן."),  # U+2764 + FE0F, and no space left before the dot
        ("מעולה 👍🏽", "מעולה"),  # skin-tone modifier rides along
        ("משפחה 👨‍👩‍👧 שלמה", "משפחה שלמה"),  # ZWJ sequence
        ("שורה 🌱\nשורה שנייה", "שורה\nשורה שנייה"),
    ],
    ids=[
        "trailing",
        "leading",
        "middle",
        "fe0f-before-dot",
        "skin-tone",
        "zwj",
        "newline",
    ],
)
def test_strip_emoji_removes_the_emoji_and_closes_the_gap(raw, want):
    assert ai_text.strip_emoji(raw) == want


def test_strip_emoji_keeps_the_typographic_marks():
    # MEH-1681: ✓ ✗ ✕ ★ ☆ are typography on the site, not emoji.
    text = "★ 4.8 ✓ מאומת ✗ ✕ ☆"
    assert ai_text.strip_emoji(text) == text


def test_strip_emoji_leaves_clean_text_byte_identical():
    text = "  בלי אימוג׳י,  עם רווחים כפולים.  "
    assert ai_text.strip_emoji(text) is text


def _request():
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/chat",
            "headers": [],
            "client": ("198.51.100.7", 40000),
            "query_string": b"",
        }
    )


def _client(text):
    class _Client:
        class messages:  # mirrors the SDK attribute name
            @staticmethod
            def create(**kwargs):
                return SimpleNamespace(
                    content=[SimpleNamespace(type="text", text=text)]
                )

    return _Client()


def test_chat_reply_reaches_the_visitor_without_emoji(monkeypatch):
    monkeypatch.setattr(
        chat, "_get_client", lambda: _client("בטח 🌿 אפשר לחפש לפי עיר 😊")
    )
    monkeypatch.setattr(chat, "_live_data_context", lambda *a, **k: None)
    handler = inspect.unwrap(chat.chat)
    body = ChatRequest(messages=[{"role": "user", "content": "היי"}])
    assert handler(_request(), body).reply == "בטח אפשר לחפש לפי עיר"


def test_chat_prompt_asks_for_no_emoji():
    assert "בלי אימוג׳י בכלל" in chat.SYSTEM_PROMPT


def test_chat_fixed_replies_carry_no_emoji():
    assert ai_text.strip_emoji(chat.OFFLINE_REPLY) == chat.OFFLINE_REPLY


def test_owner_side_drafts_come_back_without_emoji(monkeypatch):
    class _Client:
        class messages:
            @staticmethod
            def create(**kwargs):
                return SimpleNamespace(
                    stop_reason="end_turn",
                    content=[
                        SimpleNamespace(type="text", text="תודה רבה 🙏 שמחנו לשמוע")
                    ],
                )

    monkeypatch.setattr(ai_text, "_get_client", lambda: _Client())
    assert ai_text.ask("x", tag="reply") == "תודה רבה שמחנו לשמוע"
