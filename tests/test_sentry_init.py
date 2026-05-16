"""MEH-500: unit tests for backend/app/sentry.py:init_sentry().

Pure unit tests — no DB, no FastAPI client, no live Sentry. Mocks
``sentry_sdk.init`` and asserts on the kwargs / call shape under the
release-priority rules locked in the MEH-500 plan.
"""

from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def _clear_sentry_env(monkeypatch):
    """Strip Sentry-related env vars so each test sets exactly what it
    needs. Sandbox / dev shells may have stale values."""
    for var in (
        "BACKEND_SENTRY_DSN",
        "APP_VERSION",
        "RAILWAY_GIT_COMMIT_SHA",
        "ENV",
    ):
        monkeypatch.delenv(var, raising=False)


def test_no_dsn_returns_early_without_init():
    from app.sentry import init_sentry

    with patch("sentry_sdk.init") as mock_init:
        init_sentry()
    mock_init.assert_not_called()


def test_empty_dsn_returns_early_without_init(monkeypatch):
    monkeypatch.setenv("BACKEND_SENTRY_DSN", "")
    from app.sentry import init_sentry

    with patch("sentry_sdk.init") as mock_init:
        init_sentry()
    mock_init.assert_not_called()


def test_dsn_initializes_with_expected_kwargs(monkeypatch):
    monkeypatch.setenv("BACKEND_SENTRY_DSN", "https://example@sentry.io/1")
    monkeypatch.setenv("ENV", "staging")
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "abc1234")
    from app.sentry import init_sentry

    with patch("sentry_sdk.init") as mock_init:
        init_sentry()
    assert mock_init.call_count == 1
    kwargs = mock_init.call_args.kwargs
    assert kwargs["dsn"] == "https://example@sentry.io/1"
    assert kwargs["environment"] == "staging"
    assert kwargs["release"] == "abc1234"
    assert kwargs["traces_sample_rate"] == 0.1
    assert len(kwargs["integrations"]) == 1
    assert type(kwargs["integrations"][0]).__name__ == "FastApiIntegration"


def test_app_version_overrides_railway_sha(monkeypatch):
    monkeypatch.setenv("BACKEND_SENTRY_DSN", "https://example@sentry.io/1")
    monkeypatch.setenv("APP_VERSION", "v1.2.3")
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "abc1234")
    from app.sentry import init_sentry

    with patch("sentry_sdk.init") as mock_init:
        init_sentry()
    assert mock_init.call_args.kwargs["release"] == "v1.2.3"


def test_release_unknown_when_no_source(monkeypatch):
    monkeypatch.setenv("BACKEND_SENTRY_DSN", "https://example@sentry.io/1")
    from app.sentry import init_sentry

    with patch("sentry_sdk.init") as mock_init:
        init_sentry()
    assert mock_init.call_args.kwargs["release"] == "unknown"


def test_init_swallows_sdk_exceptions(monkeypatch):
    """Sentry init must never raise into app boot — fail-open per spec."""
    monkeypatch.setenv("BACKEND_SENTRY_DSN", "https://example@sentry.io/1")
    from app.sentry import init_sentry

    with patch("sentry_sdk.init", side_effect=RuntimeError("boom")) as mock_init:
        init_sentry()
    mock_init.assert_called_once()
