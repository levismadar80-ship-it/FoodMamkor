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
        (
            _Client(_Msg(json.dumps({"reason": "x"}), stop_reason="max_tokens")),
            "truncated",
        ),
        # MEH-2390: valid JSON that is not an object used to die on `.get`
        # (AttributeError) and be reported as a generic "error".
        (_Client(_Msg("[1, 2]")), "bad_status"),
    ],
    ids=[
        "no-client",
        "garbage-text",
        "cut-at-max-tokens",
        "call-raises",
        "bad-status",
        "cut-but-parses-without-status",
        "json-not-an-object",
    ],
)
@pytest.mark.parametrize("surface", SURFACES, ids=["experience", "recipe", "review"])
def test_fail_open_is_reported(monkeypatch, calls, surface, client, reason):
    seen, patch = calls
    mod, getter, run, name = surface()
    patch(mod)
    monkeypatch.setattr(mod, getter, lambda: client)
    # MEH-2390: a review has no verdict on fail-open (None → stored NULL, so
    # the next save re-checks); the item still publishes. Experiences and
    # recipes keep APPROVED — their status gates nothing an edit can reuse.
    assert run() == (None if name == "review" else "APPROVED")
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


@pytest.mark.parametrize("surface", SURFACES)
def test_lowercase_verdict_is_honoured_not_failed_open(monkeypatch, calls, surface):
    # Reviews compared case-sensitively, so a lowercase "rejected" published
    # the review as APPROVED; the other two surfaces already upper-cased.
    seen, patch = calls
    mod, getter, run, _ = surface()
    patch(mod)
    lower = json.dumps({"status": "rejected", "reason": "x", "suggestion": None})
    monkeypatch.setattr(mod, getter, lambda: _Client(_Msg(lower)))
    assert run() == "REJECTED"
    assert seen == []


def test_classify_failure_names():
    import anthropic
    import httpx

    from app.services.moderation_fail_open import classify_failure

    # No HTTP answer at all (DNS, timeout, reset): no status class to report.
    req = httpx.Request("POST", "http://x")
    conn = anthropic.APIConnectionError(request=req)
    assert classify_failure(conn) == "api_error"
    # MEH-2390: an HTTP answer carries its class, so a dead key (401) and a
    # rate limit (429) read apart from an overload (529) on the dashboard.
    for exc_cls, code, expected in [
        (anthropic.AuthenticationError, 401, "api_error_4xx"),
        (anthropic.RateLimitError, 429, "api_error_4xx"),
        (anthropic.InternalServerError, 529, "api_error_5xx"),
    ]:
        exc = exc_cls("x", response=httpx.Response(code, request=req), body=None)
        assert classify_failure(exc) == expected, (code, classify_failure(exc))

    assert classify_failure(ValueError(), truncated=True) == "truncated"
    try:
        json.loads("x")
    except json.JSONDecodeError as exc:
        assert classify_failure(exc) == "unparseable"
    assert classify_failure(RuntimeError()) == "error"


def test_report_fail_open_never_raises_when_sentry_breaks(monkeypatch):
    # A broken Sentry must not turn a fail-open into a 500: the warning is
    # still logged, the failure lands in the debug fallback, nothing raises.
    import sentry_sdk

    import app.services.moderation_fail_open as mod

    calls: list[tuple[str, str]] = []

    class _Log:
        def warning(self, msg, **kw):
            calls.append(("warning", msg))

        def debug(self, msg, **kw):
            calls.append(("debug", msg))

    def _boom():
        raise RuntimeError("sentry down")

    monkeypatch.setattr(mod, "logger", _Log())
    monkeypatch.setattr(sentry_sdk, "new_scope", _boom)

    mod.report_fail_open("review", "no_client")

    assert [level for level, _ in calls] == ["warning", "debug"]


def test_report_fail_open_sentry_tags_and_fingerprint(monkeypatch):
    # The Sentry alert rule in MANUAL_TESTING filters on these exact names;
    # a rename must go red here, not silently break the alert.
    import contextlib

    import sentry_sdk

    from app.services.moderation_fail_open import report_fail_open

    class _Scope:
        def __init__(self):
            self.tags: dict[str, str] = {}
            self.fingerprint = None

        def set_tag(self, k, v):
            self.tags[k] = v

    scope = _Scope()
    captured: list[tuple[str, str]] = []

    @contextlib.contextmanager
    def _new_scope():
        yield scope

    monkeypatch.setattr(sentry_sdk, "new_scope", _new_scope, raising=False)
    monkeypatch.setattr(
        sentry_sdk,
        "capture_message",
        lambda msg, level=None: captured.append((msg, level)),
    )
    report_fail_open("review", "api_error")
    assert scope.tags == {
        "moderation_fail_open": "true",
        "moderation_surface": "review",
        "fail_open_reason": "api_error",
    }
    assert scope.fingerprint == ["moderation-fail-open", "review", "api_error"]
    assert captured == [("moderation fail-open: review (api_error)", "warning")]


def test_producer_risk_failures_are_reported(monkeypatch):
    # Risk scoring fails open to a NULL score (admin sees no score), not to
    # an approval — but a dead key there is the same outage, so it reports.
    from app.services import producer_risk as mod

    seen: list[tuple[str, str]] = []
    monkeypatch.setattr(mod, "report_fail_open", lambda s, r: seen.append((s, r)))
    monkeypatch.setattr(mod.settings, "anthropic_api_key", "")
    assert mod._call_anthropic({"name": "x"}) == (None, None)
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

    class _Cut(_Boom):
        def create(self, **kwargs):
            return _Msg('{"score": 4', stop_reason="max_tokens")

    monkeypatch.setattr(anthropic, "Anthropic", _Cut)
    assert mod._call_anthropic({"name": "x"}) == (None, None)

    class _EmptyCut(_Boom):
        def create(self, **kwargs):
            return _Msg(None, stop_reason="max_tokens")

    monkeypatch.setattr(anthropic, "Anthropic", _EmptyCut)
    assert mod._call_anthropic({"name": "x"}) == (None, None)

    class _NoContentAttr(_Boom):
        def create(self, **kwargs):
            return object()  # no .content → AttributeError path

    monkeypatch.setattr(anthropic, "Anthropic", _NoContentAttr)
    assert mod._call_anthropic({"name": "x"}) == (None, None)

    class _Refused(_Boom):
        def create(self, **kwargs):
            return _Msg(None, stop_reason="refusal")

    monkeypatch.setattr(anthropic, "Anthropic", _Refused)
    assert mod._call_anthropic({"name": "x"}) == (None, None)
    assert seen == [
        ("producer_risk", "no_client"),
        ("producer_risk", "error"),
        ("producer_risk", "unparseable"),
        ("producer_risk", "truncated"),
        ("producer_risk", "truncated"),
        ("producer_risk", "error"),
        ("producer_risk", "refusal"),
    ]


def test_review_fail_open_reaches_sentry_end_to_end(monkeypatch):
    # MEH-2390: one path from the failing call to the Sentry event, with
    # nothing in between stubbed — the pieces above are each tested alone.
    import contextlib

    import sentry_sdk

    from app.routers import reviews as mod

    class _Scope:
        def __init__(self):
            self.tags: dict[str, str] = {}
            self.fingerprint = None

        def set_tag(self, k, v):
            self.tags[k] = v

    scope = _Scope()
    captured: list[tuple[str, str]] = []

    @contextlib.contextmanager
    def _new_scope():
        yield scope

    monkeypatch.setattr(sentry_sdk, "new_scope", _new_scope, raising=False)
    monkeypatch.setattr(
        sentry_sdk,
        "capture_message",
        lambda msg, level=None: captured.append((msg, level)),
    )
    monkeypatch.setattr(mod, "_get_ai_client", lambda: _Client(exc=RuntimeError("x")))

    assert mod._moderate_review_body("ביקורת כלשהי לבדיקה") is None
    assert scope.tags == {
        "moderation_fail_open": "true",
        "moderation_surface": "review",
        "fail_open_reason": "error",
    }
    assert scope.fingerprint == ["moderation-fail-open", "review", "error"]
    assert captured == [("moderation fail-open: review (error)", "warning")]
