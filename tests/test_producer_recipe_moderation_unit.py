"""Unit tests for app.services.producer_recipe_moderation.

Pure-logic + fail-open coverage for the producer-recipe AI moderation
path. No network, no DB.
"""
import json

import pytest

from app.services import producer_recipe_moderation as mod


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


class TestParseResponseText:
    def test_plain(self):
        assert mod._parse_response_text('{"status":"APPROVED"}') == {
            "status": "APPROVED"
        }

    def test_fenced(self):
        assert mod._parse_response_text('```json\n{"a":2}\n```') == {"a": 2}

    def test_prose(self):
        assert mod._parse_response_text('result: {"status":"REJECTED"}!') == {
            "status": "REJECTED"
        }

    def test_invalid(self):
        with pytest.raises(json.JSONDecodeError):
            mod._parse_response_text("garbage")


class TestBuildPrompt:
    def test_includes_recipe_fields(self):
        prompt = mod._build_prompt(
            {
                "title": "מרק עדשים",
                "description": "חורפי",
                "ingredients": "עדשים, בצל",
                "instructions": "לבשל",
            }
        )
        assert "מרק עדשים" in prompt
        assert "JSON" in prompt

    def test_missing_fields_no_crash(self):
        assert isinstance(mod._build_prompt({}), str)


class TestValidateProducerRecipe:
    def test_fail_open_no_client(self, _no_key):
        assert mod.validate_producer_recipe({"title": "t"}) == {
            "status": "APPROVED",
            "reason": None,
            "suggestion": None,
        }

    @pytest.mark.parametrize("verdict", ["APPROVED", "FLAGGED", "REJECTED"])
    def test_valid_verdicts(self, monkeypatch, verdict):
        payload = json.dumps({"status": verdict, "reason": "r", "suggestion": None})
        _install_client(monkeypatch, _FakeClient([_FakeBlock(payload)]))
        result = mod.validate_producer_recipe({"title": "t"})
        assert result["status"] == verdict
        assert result["reason"] == "r"

    def test_lowercase_status_normalized(self, monkeypatch):
        # status is upper()-cased before the VALID_STATUSES check.
        _install_client(
            monkeypatch, _FakeClient([_FakeBlock('{"status":"approved"}')])
        )
        assert (
            mod.validate_producer_recipe({"title": "t"})["status"] == "APPROVED"
        )

    def test_unknown_status_approved(self, monkeypatch):
        _install_client(
            monkeypatch, _FakeClient([_FakeBlock('{"status":"WAT"}')])
        )
        assert (
            mod.validate_producer_recipe({"title": "t"})["status"] == "APPROVED"
        )

    def test_empty_response_approved(self, monkeypatch):
        _install_client(monkeypatch, _FakeClient([_FakeBlock("")]))
        assert (
            mod.validate_producer_recipe({"title": "t"})["status"] == "APPROVED"
        )

    def test_client_raises_approved(self, monkeypatch):
        _install_client(monkeypatch, _FakeClient(raises=RuntimeError("x")))
        assert (
            mod.validate_producer_recipe({"title": "t"})["status"] == "APPROVED"
        )
