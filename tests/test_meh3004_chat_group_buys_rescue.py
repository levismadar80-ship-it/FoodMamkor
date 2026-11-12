"""MEH-3004 — the site chat knows about group buys always, and about rescue
bags only while the pilot is on and open in at least one town."""

from app.config import settings
from app.routers import chat


def _pilot(monkeypatch, enabled, cities):
    monkeypatch.setattr(settings, "rescue_bags_enabled", enabled, raising=False)
    monkeypatch.setattr(settings, "rescue_bags_cities", cities, raising=False)


def test_group_buys_are_in_the_fixed_knowledge():
    assert "**מה זה קבוצת רכישה?**" in chat.SYSTEM_PROMPT
    assert "**איפה מוצאים קבוצות רכישה ואיך מצטרפים?**" in chat.SYSTEM_PROMPT
    assert "אין שום התחייבות" in chat.SYSTEM_PROMPT


def test_rescue_bags_never_in_the_fixed_knowledge():
    # The unconditional prompt must not carry the pilot (prod has it off).
    assert "סלי הפתעה" not in chat.SYSTEM_PROMPT
    assert "סל הפתעה" not in chat.SYSTEM_PROMPT


def test_pilot_off_no_rescue(monkeypatch):
    _pilot(monkeypatch, False, "חיפה")
    assert chat._base_system_prompt() == chat.SYSTEM_PROMPT


def test_pilot_on_no_town_no_rescue(monkeypatch):
    _pilot(monkeypatch, True, "")
    assert chat._base_system_prompt() == chat.SYSTEM_PROMPT


def test_pilot_on_one_town(monkeypatch):
    _pilot(monkeypatch, True, "חיפה")
    prompt = chat._base_system_prompt()
    assert prompt.startswith(chat.SYSTEM_PROMPT)
    assert "**מה זה סל הפתעה?**" in prompt
    assert "כרגע הם פועלים רק ב: חיפה." in prompt


def test_pilot_on_many_towns(monkeypatch):
    _pilot(monkeypatch, True, "חיפה, בנימינה")
    prompt = chat._base_system_prompt()
    assert "כרגע הם פועלים רק ב: חיפה, בנימינה" in prompt  # canonical name may follow
    assert "{cities}" not in prompt


def test_router_sends_group_buys_and_rescue_to_freeform():
    text = chat.chat_intent_router._classifier_prompt([])
    assert "group buys (קבוצות רכישה)" in text
    assert "rescue bags (סלי הפתעה)" in text
