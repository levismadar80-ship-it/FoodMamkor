"""moderation_common — the shared client, parser and fast-model call (MEH-3619).

The three moderation services used to carry their own copies; these tests pin
the shared behaviour once, and check each service still reaches it.
"""
from __future__ import annotations

import json

import pytest

from app.services import moderation_common as mc


class _Block:
    def __init__(self, text: str) -> None:
        self.type = "text"
        self.text = text


class _Msg:
    def __init__(self, stop_reason: str, content: list) -> None:
        self.stop_reason = stop_reason
        self.content = content


class _Client:
    def __init__(self, msg: _Msg | None = None, exc: Exception | None = None) -> None:
        self._msg, self._exc = msg, exc
        self.messages = self
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self._exc:
            raise self._exc
        return self._msg


def _run(client, build=lambda: ("SYS", "USER")):
    seen: list[tuple[str, str]] = []
    out = mc.run_fast_verdict(
        client, build, surface="s", tag="[t]", report=lambda s, r: seen.append((s, r))
    )
    return out, seen


def test_parse_strips_fences_and_prose() -> None:
    assert mc.parse_verdict_json('```json\n{"status":"APPROVED"}\n```') == {"status": "APPROVED"}
    assert mc.parse_verdict_json('הנה: {"a": 1} סוף') == {"a": 1}
    with pytest.raises(json.JSONDecodeError):
        mc.parse_verdict_json("no json here")


def test_safe_decimal() -> None:
    assert mc.safe_decimal("12.50", "[t]") == 12.5
    assert mc.safe_decimal(None, "[t]") is None
    assert mc.safe_decimal("abc", "[t]") is None


def test_verdict_from_text() -> None:
    assert mc.verdict_from_text('{"status":"flagged","reason":"r"}', "[t]") == {
        "status": "FLAGGED", "reason": "r", "suggestion": None,
    }
    assert mc.verdict_from_text('{"status":"WAT"}', "[t]") is None
    assert mc.verdict_from_text("[1, 2]", "[t]") is None  # MEH-2390: not an object


def test_run_returns_the_model_verdict_and_sends_the_prompt() -> None:
    client = _Client(_Msg("end_turn", [_Block('{"status":"REJECTED","reason":"x"}')]))
    out, seen = _run(client)
    assert out == {"status": "REJECTED", "reason": "x", "suggestion": None}
    assert seen == []
    assert client.calls[0]["system"] == "SYS"
    assert client.calls[0]["messages"] == [{"role": "user", "content": "USER"}]
    assert client.calls[0]["max_tokens"] == 800


@pytest.mark.parametrize(
    ("msg", "exc", "reason"),
    [
        (_Msg("end_turn", [_Block('{"status":"HUH"}')]), None, "bad_status"),
        (_Msg("max_tokens", [_Block('{"status":"HUH"}')]), None, "truncated"),
        (_Msg("end_turn", [_Block("not json")]), None, "unparseable"),
        (_Msg("end_turn", []), None, "error"),
        (_Msg("end_turn", [_Block("")]), None, "error"),
        (None, RuntimeError("boom"), "error"),
    ],
)
def test_run_fails_open_and_reports(msg, exc, reason) -> None:
    out, seen = _run(_Client(msg, exc))
    assert out == {"status": "APPROVED", "reason": None, "suggestion": None}
    assert seen == [("s", reason)]


def test_run_refusal_is_flagged_not_reported() -> None:
    out, seen = _run(_Client(_Msg("refusal", [])))
    assert out["status"] == "FLAGGED"
    assert out["reason"] == mc.REFUSAL_REASON
    assert seen == []


def test_a_prompt_that_breaks_fails_open() -> None:
    def broken() -> tuple[str, str]:
        raise KeyError("x")

    client = _Client(_Msg("end_turn", [_Block('{"status":"REJECTED"}')]))
    out, seen = _run(client, broken)
    assert out["status"] == "APPROVED"
    assert seen == [("s", "error")]
    assert client.calls == []


def test_no_key_means_no_client(monkeypatch) -> None:
    monkeypatch.setattr(mc.settings, "anthropic_api_key", "", raising=False)
    assert mc.make_anthropic_client("[t]") is None


def test_approved_is_a_fresh_dict() -> None:
    a = mc.approved()
    a["status"] = "X"
    assert mc.approved()["status"] == "APPROVED"


@pytest.mark.parametrize(
    ("modname", "fn"),
    [
        ("app.services.experience_moderation", "validate_experience"),
        ("app.services.producer_recipe_moderation", "validate_producer_recipe"),
    ],
)
def test_each_service_reaches_the_shared_parser(monkeypatch, modname, fn) -> None:
    import importlib

    mod = importlib.import_module(modname)
    client = _Client(_Msg("end_turn", [_Block('```\n{"status":"rejected","reason":"r"}\n```')]))
    monkeypatch.setattr(mod, "_get_client", lambda: client)
    assert getattr(mod, fn)({"title": "t", "description": "d"})["status"] == "REJECTED"
    assert mod._parse_response_text is mc.parse_verdict_json


@pytest.mark.parametrize(
    ("modname", "fn", "surface"),
    [
        ("app.services.experience_moderation", "validate_experience", "experience"),
        ("app.services.producer_recipe_moderation", "validate_producer_recipe", "recipe"),
    ],
)
def test_fast_services_report_their_own_surface(monkeypatch, modname, fn, surface) -> None:
    import importlib

    mod = importlib.import_module(modname)
    seen: list[tuple[str, str]] = []
    monkeypatch.setattr(mod, "_get_client", lambda: _Client(exc=RuntimeError("x")))
    monkeypatch.setattr(mod, "report_fail_open", lambda s, r: seen.append((s, r)))
    assert getattr(mod, fn)({"title": "t"})["status"] == "APPROVED"
    assert seen == [(surface, "error")]
