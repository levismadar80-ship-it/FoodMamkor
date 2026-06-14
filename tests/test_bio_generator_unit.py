"""Unit tests for app.services.bio_generator (MEH-56).

Covers the pure handle-extraction helper and generate_bio's fail-open /
happy / truncation branches. The Instagram scrape and Anthropic call are
both stubbed, so no network traffic occurs.
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

    def create(self, **kwargs):
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


class TestExtractInstagramHandle:
    def test_full_url(self):
        assert (
            mod._extract_instagram_handle("https://instagram.com/cool.bakery/")
            == "cool.bakery"
        )

    def test_url_with_www_and_query(self):
        assert (
            mod._extract_instagram_handle("instagram.com/my_shop?hl=he")
            == "my_shop"
        )

    def test_at_prefixed(self):
        assert mod._extract_instagram_handle("@bake_house") == "bake_house"

    def test_bare_handle(self):
        assert mod._extract_instagram_handle("nofar.cakes") == "nofar.cakes"

    def test_free_text_is_not_a_handle(self):
        assert mod._extract_instagram_handle("עוגות יום הולדת מהבית") is None

    def test_too_long_is_not_a_handle(self):
        assert mod._extract_instagram_handle("a" * 40) is None


class TestGenerateBio:
    def test_fail_open_no_client_returns_empty(self, _no_key):
        assert mod.generate_bio("מאפייה ביתית") == ""

    def test_happy_path_returns_bio(self, monkeypatch):
        monkeypatch.setattr(mod, "_get_client", lambda: _FakeClient([_FakeBlock("ביו נחמד")]))
        # free text → no Instagram scrape attempted
        assert mod.generate_bio("מאפייה ביתית טרייה") == "ביו נחמד"

    def test_bio_truncated_to_150_chars(self, monkeypatch):
        long_text = "א" * 300
        monkeypatch.setattr(
            mod, "_get_client", lambda: _FakeClient([_FakeBlock(long_text)])
        )
        assert len(mod.generate_bio("מאפייה")) == 150

    def test_empty_source_returns_empty(self, monkeypatch):
        # client present but source strips to empty → early return ""
        monkeypatch.setattr(
            mod, "_get_client", lambda: _FakeClient([_FakeBlock("x")])
        )
        assert mod.generate_bio("   ") == ""

    def test_client_raises_returns_empty(self, monkeypatch):
        monkeypatch.setattr(
            mod, "_get_client", lambda: _FakeClient(raises=RuntimeError("down"))
        )
        assert mod.generate_bio("מאפייה ביתית") == ""

    def test_uses_scraped_instagram_bio(self, monkeypatch):
        monkeypatch.setattr(
            mod, "_get_client", lambda: _FakeClient([_FakeBlock("from-claude")])
        )
        monkeypatch.setattr(mod, "_fetch_instagram_bio", lambda h: "scraped bio text")
        # handle input triggers the scrape branch (stubbed, no network)
        assert mod.generate_bio("@my_bakery") == "from-claude"
