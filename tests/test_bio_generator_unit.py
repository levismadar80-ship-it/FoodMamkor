"""Unit tests for app.services.bio_generator (MEH-56; MEH-1173).

Covers the structured-prompt composer and generate_bio's fail-open /
happy / truncation branches. The Anthropic call is stubbed, so no network
traffic occurs. MEH-1173 deleted the Instagram-scrape path — its handle
helpers and scrape test are gone with it.
"""

import pytest

from app.services import bio_generator as mod


class _FakeBlock:
    def __init__(self, text, type="text"):
        self.text = text
        self.type = type


class _FakeMessage:
    def __init__(self, blocks):
        self.content = blocks


class _FakeMessages:
    def __init__(self, blocks, raises=None):
        self._blocks = blocks
        self._raises = raises
        self.last_content = None

    def create(self, **kwargs):
        # Capture the composed prompt so tests can assert on line-omission.
        self.last_content = kwargs["messages"][0]["content"]
        if self._raises:
            raise self._raises
        return _FakeMessage(self._blocks)


class _FakeClient:
    def __init__(self, blocks=None, raises=None):
        self.messages = _FakeMessages(blocks or [], raises=raises)


@pytest.fixture
def _no_key(monkeypatch):
    monkeypatch.setattr(mod.settings, "anthropic_api_key", None, raising=False)
    monkeypatch.setattr(mod, "_client", None, raising=False)


class TestComposePrompt:
    def test_all_fields_present(self):
        p = mod._compose_prompt("ריבות", "הגליל", "מתכון סבתא", "@jam")
        assert "מה העסק מוכר: ריבות" in p
        assert "אזור פעילות: הגליל" in p
        assert "מה מיוחד: מתכון סבתא" in p
        assert "אינסטגרם (השראה בלבד): @jam" in p

    def test_empty_optional_fields_drop_their_line(self):
        p = mod._compose_prompt("ריבות", None, "", "   ")
        assert "מה העסק מוכר: ריבות" in p
        # No dangling labels for the empty optionals.
        assert "אזור פעילות" not in p
        assert "מה מיוחד" not in p
        assert "אינסטגרם" not in p


class TestGenerateBio:
    def test_fail_open_no_client_returns_empty(self, _no_key):
        assert mod.generate_bio("מאפייה ביתית") == ""

    def test_happy_path_returns_bio(self, monkeypatch):
        monkeypatch.setattr(
            mod, "_get_client", lambda: _FakeClient([_FakeBlock("ביו נחמד")])
        )
        assert mod.generate_bio("מאפייה ביתית טרייה") == "ביו נחמד"

    def test_only_sells_reaches_prompt_when_optionals_blank(self, monkeypatch):
        fake = _FakeClient([_FakeBlock("ok")])
        monkeypatch.setattr(mod, "_get_client", lambda: fake)
        mod.generate_bio("ריבות", area=None, special="", instagram=None)
        assert "מה העסק מוכר: ריבות" in fake.messages.last_content
        assert "אזור פעילות" not in fake.messages.last_content

    def test_bio_truncated_to_150_chars(self, monkeypatch):
        long_text = "א" * 300
        monkeypatch.setattr(
            mod, "_get_client", lambda: _FakeClient([_FakeBlock(long_text)])
        )
        assert len(mod.generate_bio("מאפייה")) == 150

    def test_blank_sells_returns_empty(self, monkeypatch):
        # client present but sells strips to empty → early return ""
        monkeypatch.setattr(mod, "_get_client", lambda: _FakeClient([_FakeBlock("x")]))
        assert mod.generate_bio("   ") == ""

    def test_client_raises_returns_empty(self, monkeypatch):
        monkeypatch.setattr(
            mod, "_get_client", lambda: _FakeClient(raises=RuntimeError("down"))
        )
        assert mod.generate_bio("מאפייה ביתית") == ""
