"""MEH-2351: every moderation call asks the API for a schema-constrained JSON.

``output_config.format`` makes the API return JSON valid against the schema,
so the "model wrapped it in ```json / added prose / invented a status" class
of fail-open (MEH-2335 eval) cannot happen on a completed response. These
tests pin that each surface sends the schema, that the status is an enum of
exactly the three verdicts, and that the effort setting survives alongside it.
"""

from __future__ import annotations

import json

import pytest

from app.config import ai_fast_request_kwargs

VERDICTS = ["APPROVED", "FLAGGED", "REJECTED"]


class _Text:
    type = "text"

    def __init__(self, text):
        self.text = text


class _Msg:
    stop_reason = "end_turn"

    def __init__(self, text):
        self.content = [_Text(text)]


class _Capture:
    def __init__(self, reply):
        self.reply = reply
        self.kwargs: dict = {}
        self.messages = self

    def create(self, **kwargs):
        self.kwargs = kwargs
        return _Msg(self.reply)


def _schema(kwargs):
    fmt = kwargs["output_config"]["format"]
    assert fmt["type"] == "json_schema"
    return fmt["schema"]


def test_kwargs_without_schema_have_no_format():
    assert "format" not in ai_fast_request_kwargs()["output_config"]


def test_kwargs_with_schema_keep_effort():
    oc = ai_fast_request_kwargs(json_schema={"type": "object"})["output_config"]
    assert oc["effort"] == "low"
    assert oc["format"] == {"type": "json_schema", "schema": {"type": "object"}}


REPLY = json.dumps({"status": "FLAGGED", "reason": "r", "suggestion": None})


@pytest.mark.parametrize(
    ("module", "getter", "call"),
    [
        (
            "app.services.experience_moderation",
            "_get_client",
            lambda m: m.validate_experience({"title": "t"}),
        ),
        (
            "app.services.producer_recipe_moderation",
            "_get_client",
            lambda m: m.validate_producer_recipe({"title": "t"}),
        ),
        (
            "app.routers.reviews",
            "_get_ai_client",
            lambda m: m._moderate_review_body("ביקורת כלשהי לבדיקה"),
        ),
    ],
    ids=["experience", "recipe", "review"],
)
def test_moderation_sends_verdict_schema(monkeypatch, module, getter, call):
    import importlib

    mod = importlib.import_module(module)
    cap = _Capture(REPLY)
    monkeypatch.setattr(mod, getter, lambda: cap)
    result = call(mod)
    assert (result if isinstance(result, str) else result["status"]) == "FLAGGED"
    schema = _schema(cap.kwargs)
    assert schema["properties"]["status"]["enum"] == VERDICTS
    assert "status" in schema["required"]
    assert schema["additionalProperties"] is False
    assert cap.kwargs["output_config"]["effort"] == "low"


def test_producer_risk_sends_score_schema(monkeypatch):
    import anthropic

    from app.services import producer_risk as mod

    cap = _Capture(json.dumps({"score": 42, "reasoning": "ok"}))
    monkeypatch.setattr(mod.settings, "anthropic_api_key", "sk-test")
    monkeypatch.setattr(anthropic, "Anthropic", lambda *a, **k: cap)
    assert mod._call_anthropic({"name": "x"}) == (42, "ok")
    schema = _schema(cap.kwargs)
    assert schema["properties"]["score"]["type"] == "integer"
    assert set(schema["required"]) == {"score", "reasoning"}
