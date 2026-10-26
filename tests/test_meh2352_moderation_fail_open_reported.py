"""MEH-2352: every moderation fail-open is reported, a real verdict is not.

Fail-open itself is LOCKed (APPROVED on any failure). These tests pin that a
fail-open now also calls ``report_fail_open(surface, reason)`` — the signal
that feeds the Sentry ``moderation_fail_open`` alert — and that a genuine
model verdict or a refusal does not.
"""

from __future__ import annotations

import json

import pytest


class _Text:
    type = "text"

    def __init__(self, text):
        self.text = text


class _Msg:
    def __init__(self, text, stop_reason="end_turn"):
        self.content = [_Text(text)] if text is not None else []
        self.stop_reason = stop_reason


class _Client:
    def __init__(self, msg=None, exc=None):
        self._msg, self._exc = msg, exc
        self.messages = self

    def create(self, **kwargs):
        if self._exc:
            raise self._exc
        return self._msg


def _experience():
    from app.services import experience_moderation as mod

    return (
        mod,
        "_get_client",
        lambda: mod.validate_experience({"title": "t"})["status"],
        "experience",
    )


def _recipe():
    from app.services import producer_recipe_moderation as mod

    return (
        mod,
        "_get_client",
        lambda: mod.validate_producer_recipe({"title": "t"})["status"],
        "recipe",
    )


def _review():
    from app.routers import reviews as mod

    return (
        mod,
        "_get_ai_client",
        lambda: mod._moderate_review_body("ביקורת כלשהי לבדיקה"),
        "review",
    )


SURFACES = [_experience, _recipe, _review]
OK = json.dumps({"status": "REJECTED", "reason": "x", "suggestion": None})


@pytest.fixture
def calls(monkeypatch):
    seen: list[tuple[str, str]] = []

    def patch(mod):
        monkeypatch.setattr(mod, "report_fail_open", lambda s, r: seen.append((s, r)))

    return seen, patch


@pytest.mark.parametrize(
    ("client", "reason"),
    [
        (None, "no_client"),
        (_Client(_Msg("not json at all")), "unparseable"),
        (_Client(_Msg('{"status": "REJ', stop_reason="max_tokens")), "truncated"),
        (_Client(exc=RuntimeError("boom")), "error"),
        (_Client(_Msg(json.dumps({"status": "WAT"}))), "bad_status"),
    ],
    ids=["no-client", "garbage-text", "cut-at-max-tokens", "call-raises", "bad-status"],
)
@pytest.mark.parametrize("surface", SURFACES, ids=["experience", "recipe", "review"])
def test_fail_open_is_reported(monkeypatch, calls, surface, client, reason):
    seen, patch = calls
    mod, getter, run, name = surface()
    patch(mod)
    monkeypatch.setattr(mod, getter, lambda: client)
    assert run() == "APPROVED"
    assert seen == [(name, reason)]


@pytest.mark.parametrize(
    "msg",
    [_Msg(OK), _Msg(None, stop_reason="refusal")],
    ids=["real-verdict", "refusal"],
)
@pytest.mark.parametrize("surface", SURFACES, ids=["experience", "recipe", "review"])
def test_model_verdict_is_not_reported(monkeypatch, calls, surface, msg):
    seen, patch = calls
    mod, getter, run, _ = surface()
    patch(mod)
    monkeypatch.setattr(mod, getter, lambda: _Client(msg))
    assert run() in {"REJECTED", "FLAGGED"}
    assert seen == []


def test_classify_failure_names():
    from app.services.moderation_fail_open import classify_failure

    assert classify_failure(ValueError(), truncated=True) == "truncated"
    try:
        json.loads("x")
    except json.JSONDecodeError as exc:
        assert classify_failure(exc) == "unparseable"
    assert classify_failure(RuntimeError()) == "error"


def test_report_fail_open_never_raises_without_sentry():
    from app.services.moderation_fail_open import report_fail_open

    report_fail_open("review", "no_client")  # sentry_sdk uninitialised here


def test_producer_risk_failures_are_reported(monkeypatch):
    # Risk scoring fails open to a NULL score (admin sees no score), not to
    # an approval — but a dead key there is the same outage, so it reports.
    from app.services import producer_risk as mod

    seen: list[tuple[str, str]] = []
    monkeypatch.setattr(mod, "report_fail_open", lambda s, r: seen.append((s, r)))
    monkeypatch.setattr(mod.settings, "anthropic_api_key", "sk-test")

    import anthropic

    class _Boom:
        def __init__(self, *a, **k):
            self.messages = self

        def create(self, **kwargs):
            raise RuntimeError("boom")

    monkeypatch.setattr(anthropic, "Anthropic", _Boom)
    assert mod._call_anthropic({"name": "x"}) == (None, None)

    class _Garbage(_Boom):
        def create(self, **kwargs):
            return _Msg("no json here")

    monkeypatch.setattr(anthropic, "Anthropic", _Garbage)
    assert mod._call_anthropic({"name": "x"}) == (None, None)
    assert seen == [("producer_risk", "error"), ("producer_risk", "unparseable")]
