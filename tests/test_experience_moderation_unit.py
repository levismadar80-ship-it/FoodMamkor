"""Unit tests for app.services.experience_moderation.

Mirrors test_home_product_moderation_unit: pure-logic + fail-open coverage
for the experiences AI moderation path. No network, no DB.
"""
import json
from decimal import Decimal

import pytest

from app.services import experience_moderation as mod


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


def _install_client(monkeypatch, client):
    monkeypatch.setattr(mod, "_get_client", lambda: client)


@pytest.fixture
def _no_key(monkeypatch):
    monkeypatch.setattr(mod.settings, "anthropic_api_key", None, raising=False)
    monkeypatch.setattr(mod, "_client", None, raising=False)


class TestSafeDecimal:
    def test_none(self):
        assert mod._safe_decimal(None) is None

    def test_numbers(self):
        assert mod._safe_decimal("120") == pytest.approx(120.0)
        assert mod._safe_decimal(Decimal("55.5")) == pytest.approx(55.5)

    def test_garbage(self):
        assert mod._safe_decimal("free!") is None


class TestParseResponseText:
    def test_plain(self):
        assert mod._parse_response_text('{"status":"APPROVED"}') == {
            "status": "APPROVED"
        }

    def test_fenced(self):
        assert mod._parse_response_text('```\n{"x":1}\n```') == {"x": 1}

    def test_prose(self):
        assert mod._parse_response_text('blah {"status":"FLAGGED"} end') == {
            "status": "FLAGGED"
        }

    def test_invalid(self):
        with pytest.raises(json.JSONDecodeError):
            mod._parse_response_text("nope")


class TestBuildPrompt:
    def test_free_price_label(self):
        prompt = mod._build_prompt(
            {"title": "סיור שוק", "price_per_person": 0, "city": "חיפה"}
        )
        assert "חינם" in prompt
        assert "סיור שוק" in prompt
        assert "חיפה" in prompt

    def test_paid_price_label(self):
        prompt = mod._build_prompt({"title": "סדנה", "price_per_person": 80})
        assert "₪80" in prompt

    def test_missing_fields_no_crash(self):
        assert isinstance(mod._build_prompt({}), str)


class TestValidateExperience:
    def test_fail_open_no_client(self, _no_key):
        assert mod.validate_experience({"title": "t"}) == {
            "status": "APPROVED",
            "reason": None,
            "suggestion": None,
        }

    @pytest.mark.parametrize("verdict", ["APPROVED", "FLAGGED", "REJECTED"])
    def test_valid_verdicts(self, monkeypatch, verdict):
        payload = json.dumps({"status": verdict, "reason": "r", "suggestion": "s"})
        _install_client(monkeypatch, _FakeClient([_FakeBlock(payload)]))
        result = mod.validate_experience({"title": "t"})
        assert result["status"] == verdict

    def test_unknown_status_approved(self, monkeypatch):
        _install_client(
            monkeypatch, _FakeClient([_FakeBlock('{"status":"HUH"}')])
        )
        assert mod.validate_experience({"title": "t"})["status"] == "APPROVED"

    def test_empty_response_approved(self, monkeypatch):
        _install_client(monkeypatch, _FakeClient([_FakeBlock("")]))
        assert mod.validate_experience({"title": "t"})["status"] == "APPROVED"

    def test_client_raises_approved(self, monkeypatch):
        _install_client(monkeypatch, _FakeClient(raises=RuntimeError("boom")))
        assert mod.validate_experience({"title": "t"})["status"] == "APPROVED"
