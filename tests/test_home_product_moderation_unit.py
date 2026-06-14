"""Unit tests for app.services.home_product_moderation.

Pure-logic + fail-open coverage for the "מהמטבח של השכן" AI moderation
path. No network, no DB: the Anthropic client is either disabled (no key
→ fail-open APPROVED) or replaced with an in-memory fake that returns a
canned message, so the verdict-parsing branches run deterministically.

Covers: _safe_decimal, _parse_response_text, _build_prompt, and every
validate_home_product branch (no-client, valid verdicts, invalid status,
empty response, client raises).
"""
import json
from decimal import Decimal

import pytest

from app.services import home_product_moderation as mod


# ---------- fake Anthropic client plumbing ----------
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
    """Force the fail-open (no client) path deterministically."""
    monkeypatch.setattr(mod.settings, "anthropic_api_key", None, raising=False)
    monkeypatch.setattr(mod, "_client", None, raising=False)


def _install_client(monkeypatch, client):
    monkeypatch.setattr(mod, "_get_client", lambda: client)


# ---------- _safe_decimal ----------
class TestSafeDecimal:
    def test_none_returns_none(self):
        assert mod._safe_decimal(None) is None

    def test_int_and_float(self):
        assert mod._safe_decimal(12) == 12.0
        assert mod._safe_decimal(12.5) == 12.5

    def test_numeric_string(self):
        assert mod._safe_decimal("19.90") == pytest.approx(19.90)

    def test_decimal_instance(self):
        assert mod._safe_decimal(Decimal("7.25")) == pytest.approx(7.25)

    def test_garbage_returns_none(self):
        assert mod._safe_decimal("not-a-number") is None
        assert mod._safe_decimal("₪50") is None


# ---------- _parse_response_text ----------
class TestParseResponseText:
    def test_plain_json(self):
        assert mod._parse_response_text('{"status": "APPROVED"}') == {
            "status": "APPROVED"
        }

    def test_surrounding_whitespace(self):
        assert mod._parse_response_text('   {"a": 1}\n  ') == {"a": 1}

    def test_markdown_fenced(self):
        raw = '```json\n{"status": "FLAGGED"}\n```'
        assert mod._parse_response_text(raw) == {"status": "FLAGGED"}

    def test_prose_wrapped_grabs_braces(self):
        raw = 'Sure! Here is the result: {"status": "REJECTED"} — done.'
        assert mod._parse_response_text(raw) == {"status": "REJECTED"}

    def test_invalid_json_raises(self):
        with pytest.raises(json.JSONDecodeError):
            mod._parse_response_text("definitely not json")


# ---------- _build_prompt ----------
class TestBuildPrompt:
    def test_includes_listing_fields(self):
        prompt = mod._build_prompt(
            {
                "title": "עוגיות שקדים",
                "description": "ביתי וטרי",
                "category": "מאפים",
                "price": 30,
            }
        )
        assert "עוגיות שקדים" in prompt
        assert "ביתי וטרי" in prompt
        assert "מאפים" in prompt
        assert "JSON" in prompt

    def test_handles_missing_fields(self):
        # None values must not crash the f-string formatting.
        prompt = mod._build_prompt({})
        assert isinstance(prompt, str) and prompt


# ---------- validate_home_product ----------
class TestValidateHomeProduct:
    def test_fail_open_when_no_client(self, _no_key):
        result = mod.validate_home_product(
            {"title": "x", "description": "y", "category": "z", "price": 10}
        )
        assert result == {"status": "APPROVED", "reason": None, "suggestion": None}

    @pytest.mark.parametrize("verdict", ["APPROVED", "FLAGGED", "REJECTED"])
    def test_passthrough_valid_verdicts(self, monkeypatch, verdict):
        payload = json.dumps(
            {"status": verdict, "reason": "סיבה", "suggestion": "הצעה"}
        )
        _install_client(monkeypatch, _FakeClient([_FakeBlock(payload)]))
        result = mod.validate_home_product({"title": "t", "price": 5})
        assert result["status"] == verdict
        assert result["reason"] == "סיבה"
        assert result["suggestion"] == "הצעה"

    def test_unknown_status_falls_back_to_approved(self, monkeypatch):
        payload = json.dumps({"status": "MAYBE", "reason": "?"})
        _install_client(monkeypatch, _FakeClient([_FakeBlock(payload)]))
        result = mod.validate_home_product({"title": "t"})
        assert result["status"] == "APPROVED"

    def test_empty_response_falls_back_to_approved(self, monkeypatch):
        _install_client(monkeypatch, _FakeClient([_FakeBlock("")]))
        result = mod.validate_home_product({"title": "t"})
        assert result["status"] == "APPROVED"

    def test_client_raises_falls_back_to_approved(self, monkeypatch):
        _install_client(
            monkeypatch, _FakeClient(raises=RuntimeError("api down"))
        )
        result = mod.validate_home_product({"title": "t"})
        assert result["status"] == "APPROVED"
