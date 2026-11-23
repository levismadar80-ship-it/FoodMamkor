"""GET /health/ai — is the Anthropic client buildable and answering?

The AI features fail open: a client that cannot be built makes chat,
moderation, bio writing, menu reading and risk scoring go "offline" with no
5xx and no failing test (the anthropic 2.x bump, #5154, was exactly that).
These tests hold the probe that makes the breakage visible.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.routers import health as health_mod
from app.services import moderation_common


@pytest.fixture(autouse=True)
def _reset_throttle(monkeypatch):
    monkeypatch.setattr(health_mod, "_last_ai_report_at", {})
    monkeypatch.setattr(health_mod, "_ai_probe_cache", None)


def _fake_client(list_result=None, list_error: Exception | None = None):
    def _list(**_kw):
        if list_error:
            raise list_error
        return list_result

    models = SimpleNamespace(list=_list)
    with_options = lambda **_kw: SimpleNamespace(models=models)  # noqa: E731
    return SimpleNamespace(with_options=with_options, close=lambda: None)


def test_disabled_without_a_key(monkeypatch):
    monkeypatch.setattr(health_mod.settings, "anthropic_api_key", "")
    assert health_mod._ai_probe() == (200, {"status": "disabled"})


def test_ok_when_the_client_builds_and_answers(monkeypatch):
    monkeypatch.setattr(health_mod.settings, "anthropic_api_key", "sk-test")
    monkeypatch.setattr(
        moderation_common, "make_anthropic_client", lambda _t: _fake_client([])
    )
    assert health_mod._ai_probe() == (200, {"status": "ok"})


def test_init_failure_is_a_503_naming_the_stage(monkeypatch):
    monkeypatch.setattr(health_mod.settings, "anthropic_api_key", "sk-test")
    monkeypatch.setattr(moderation_common, "make_anthropic_client", lambda _t: None)
    status, body = health_mod._ai_probe()
    assert status == 503 and body["stage"] == "init"


def test_call_failure_is_a_503_with_the_exception_class(monkeypatch):
    monkeypatch.setattr(health_mod.settings, "anthropic_api_key", "sk-test")
    monkeypatch.setattr(
        moderation_common,
        "make_anthropic_client",
        lambda _t: _fake_client(list_error=ConnectionError("down")),
    )
    status, body = health_mod._ai_probe()
    assert (status, body["stage"], body["code"]) == (503, "call", "ConnectionError")


def test_the_real_factory_gets_past_init(monkeypatch):
    """No fake here: the real make_anthropic_client with the installed SDK.
    The network call may fail in CI (no egress) — that is stage "call". What
    must never happen is stage "init": that is the #5154 failure."""
    monkeypatch.setattr(health_mod.settings, "anthropic_api_key", "sk-test")
    monkeypatch.setattr(moderation_common.settings, "anthropic_api_key", "sk-test")
    _status, body = health_mod._ai_probe()
    assert body.get("stage") != "init", body


def test_error_is_reported_once_per_window(monkeypatch):
    sent: list[str] = []

    class _Scope:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def set_tag(self, *a):
            pass

    import sentry_sdk

    monkeypatch.setattr(sentry_sdk, "new_scope", lambda: _Scope(), raising=False)
    monkeypatch.setattr(
        sentry_sdk, "capture_message", lambda m, level=None: sent.append(m)
    )
    body = {"status": "error", "stage": "init", "code": "ClientInitFailed"}
    health_mod._report_ai_error(body)
    health_mod._report_ai_error(body)
    assert len(sent) == 1 and "init" in sent[0]
    # A different failure inside the window still reports.
    health_mod._report_ai_error(
        {"status": "error", "stage": "call", "code": "APITimeoutError"}
    )
    assert len(sent) == 2


def test_probe_result_is_cached_so_anthropic_sees_one_call_a_minute(monkeypatch):
    calls = []
    monkeypatch.setattr(
        health_mod, "_ai_probe", lambda: calls.append(1) or (200, {"status": "ok"})
    )
    health_mod._ai_probe_cached()
    health_mod._ai_probe_cached()
    assert len(calls) == 1


def test_client_is_closed_after_the_probe(monkeypatch):
    closed = []
    fake = _fake_client([])
    fake.close = lambda: closed.append(1)
    monkeypatch.setattr(health_mod.settings, "anthropic_api_key", "sk-test")
    monkeypatch.setattr(moderation_common, "make_anthropic_client", lambda _t: fake)
    health_mod._ai_probe()
    assert closed == [1]


# --- the route itself (uses the DB-backed `client` fixture, like the Places tests) ---

URL = "/health/ai"


def test_route_answers_503_with_the_stage_on_init_failure(client, monkeypatch):
    monkeypatch.setattr(health_mod.settings, "anthropic_api_key", "sk-test")
    monkeypatch.setattr(moderation_common, "make_anthropic_client", lambda _t: None)
    r = client.get(URL)
    assert r.status_code == 503 and r.json()["stage"] == "init"


def test_route_answers_200_disabled_without_a_key(client, monkeypatch):
    monkeypatch.setattr(health_mod.settings, "anthropic_api_key", "")
    r = client.get(URL)
    assert r.status_code == 200 and r.json() == {"status": "disabled"}
