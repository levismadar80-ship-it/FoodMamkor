"""MEH-3489 — the chat opened from a business page answers about THAT
business. `producer_id` in the request names the page; a business named in the
question still wins; a page that is not a public business adds nothing.

The model is never called: chat._get_client is a recording stub (the MEH-3481
helpers are reused, not copied).
"""

import inspect
import uuid
from types import SimpleNamespace

import pytest
from conftest import make_producer
from pydantic import ValidationError
from test_meh3481_chat_business_context import PRIVATE, _business, _stub_client

from app.routers import chat
from app.schemas.schemas import ChatRequest
from app.services import chat_business_context as ctx


def _ask(db, text, producer_id):
    body = ChatRequest(
        messages=[{"role": "user", "content": text}], producer_id=producer_id
    )
    request = SimpleNamespace(
        headers={}, client=SimpleNamespace(host="203.0.113.51"), state=SimpleNamespace()
    )
    inspect.unwrap(chat.chat)(request, body, db)


def _system(calls):
    return "\n".join(b["text"] for b in calls[0]["system"])


def test_a_question_with_no_name_answers_about_the_page(db, monkeypatch):
    p = _business(db)
    calls = _stub_client(monkeypatch)
    _ask(db, "אתם מגיעים לקריית ביאליק?", p.id)
    system = _system(calls)
    assert "<business_page>" in system and "לחם כוסמין" in system
    assert '"delivers_to_asked_city": true' in system
    for value in PRIVATE.values():
        assert value not in system, value


def test_without_the_page_the_same_question_gets_no_business(db, monkeypatch):
    _business(db)
    calls = _stub_client(monkeypatch)
    _ask(db, "אתם מגיעים לקריית ביאליק?", None)
    assert "<business_page>" not in _system(calls)


def test_a_business_named_in_the_question_wins_over_the_page(db):
    page = _business(db)
    other = make_producer(db, name="גבינות הגליל", city="צפת")
    assert ctx.find(db, ["ומה עם גבינות הגליל?"], page.id).id == other.id
    assert ctx.find(db, ["ויש משלוח?"], page.id).id == page.id


def test_a_page_that_is_not_a_public_business_adds_nothing(db, monkeypatch):
    p = _business(db)
    for field, value in (("status", "pending"), ("kind", "organizer"), ("is_test", True)):
        before = getattr(p, field)
        setattr(p, field, value)
        db.commit()
        assert ctx.find(db, ["ויש משלוח?"], p.id) is None, field
        setattr(p, field, before)
        db.commit()
    calls = _stub_client(monkeypatch)
    _ask(db, "ויש משלוח?", uuid.uuid4())
    assert "<business_page>" not in _system(calls)


@pytest.mark.parametrize("bad", ["abc", "", 5])
def test_a_producer_id_must_be_a_uuid(bad):
    with pytest.raises(ValidationError):
        ChatRequest(messages=[{"role": "user", "content": "היי"}], producer_id=bad)
