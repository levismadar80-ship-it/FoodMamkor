"""MEH-1533 — background-task exceptions must reach Sentry.

Regression test for the capture gap found while diagnosing MEH-1530: a
``seed()`` failure fired on EVERY staging boot and produced zero Sentry events
in 90 days. Root cause is structural, not incidental:

- ``init_sentry`` configures ``FastApiIntegration()`` only
  (``app/sentry.py:56``), which observes the ASGI request cycle and nothing
  else. The DB init runs in ``asyncio.to_thread`` (``app/startup.py:162``).
- The handler catches, logs via structlog, and never re-raises
  (``app/startup.py:166-175``), so nothing propagates to an integration.
- ``LoggingIntegration`` would NOT close the gap either: structlog uses
  ``logger_factory=structlog.PrintLoggerFactory(sys.stdout)``
  (``app/logging_config.py:84``) and never routes through stdlib ``logging``.

These tests assert the explicit ``capture_exception`` call, its tag, and the
capture-BEFORE-log ordering required by getsentry/sentry-python#1468.

No real events are sent: ``sentry_sdk.capture_exception`` and the scope factory
are monkeypatched, and no DSN is configured under pytest.
"""
import asyncio
import contextlib
from types import SimpleNamespace

import pytest

from app.sentry import BACKGROUND_TASK_TAG, capture_background_exception
from app import startup as startup_mod

# The SDK is a declared runtime dep (backend/pyproject.toml:30) so it is present
# in CI; skip rather than fail in a minimal environment that lacks it.
sentry_sdk = pytest.importorskip("sentry_sdk")


class _RecordingScope:
    """Stands in for a Sentry scope; records set_tag calls, sends nothing."""

    def __init__(self):
        self.tags = {}

    def set_tag(self, key, value):
        self.tags[key] = value


@pytest.fixture
def sentry_probe(monkeypatch):
    """Intercept the SDK so captures are recorded instead of transmitted."""
    captured = []
    scope = _RecordingScope()

    @contextlib.contextmanager
    def fake_scope_factory():
        yield scope

    # capture_background_exception prefers new_scope (2.x) over push_scope (1.x);
    # patching new_scope always wins the getattr chain in app/sentry.py.
    monkeypatch.setattr(sentry_sdk, "new_scope", fake_scope_factory, raising=False)
    monkeypatch.setattr(
        sentry_sdk, "capture_exception", lambda exc: captured.append(exc)
    )
    return SimpleNamespace(captured=captured, scope=scope)


# --- the helper itself -------------------------------------------------------


def test_capture_background_exception_sends_the_exception(sentry_probe):
    """The exact exception object is handed to Sentry."""
    exc = RuntimeError("boom")

    capture_background_exception(exc, task="db_init")

    assert sentry_probe.captured == [exc]


def test_capture_background_exception_tags_the_task(sentry_probe):
    """Events are filterable by which background task produced them."""
    capture_background_exception(RuntimeError("boom"), task="db_init")

    assert sentry_probe.scope.tags == {BACKGROUND_TASK_TAG: "db_init"}


def test_capture_background_exception_never_raises(monkeypatch):
    """Reporting failure must not escalate into a boot failure (fail-open)."""

    def explode(_exc):
        raise ValueError("sentry transport down")

    monkeypatch.setattr(sentry_sdk, "capture_exception", explode)

    # No exception escapes.
    capture_background_exception(RuntimeError("boom"), task="db_init")


# --- the background DB-init handler -----------------------------------------


def test_background_db_init_failure_is_captured(monkeypatch, sentry_probe):
    """MEH-1533 core: a raising _run_db_init_sync reaches Sentry, and the
    existing structlog + db_init_status behaviour is preserved."""
    boom = RuntimeError("seed exploded")

    def _raise():
        raise boom

    monkeypatch.setattr(startup_mod, "_run_db_init_sync", _raise)
    app = SimpleNamespace(state=SimpleNamespace())

    asyncio.run(startup_mod._init_db_background(app))

    assert sentry_probe.captured == [boom], "exception never reached Sentry"
    assert sentry_probe.scope.tags == {BACKGROUND_TASK_TAG: "db_init"}
    # Pre-existing contract must survive (health.py:68-72 reads this).
    assert app.state.db_init_status == "failed"


def test_capture_happens_before_the_log_call(monkeypatch):
    """getsentry/sentry-python#1468: a capture that FOLLOWS a logging call in the
    same except block can be swallowed by deduplication. Order is load-bearing."""
    calls = []

    def _raise():
        raise RuntimeError("seed exploded")

    monkeypatch.setattr(startup_mod, "_run_db_init_sync", _raise)
    monkeypatch.setattr(
        startup_mod,
        "capture_background_exception",
        lambda exc, task: calls.append("capture"),
    )
    # Swap the whole logger rather than one bound method — structlog's filtering
    # bound loggers are not guaranteed to accept per-attribute monkeypatching.
    monkeypatch.setattr(
        startup_mod,
        "log",
        SimpleNamespace(
            error=lambda *a, **kw: calls.append("log"),
            info=lambda *a, **kw: None,
        ),
    )

    asyncio.run(startup_mod._init_db_background(SimpleNamespace(state=SimpleNamespace())))

    assert calls == ["capture", "log"], f"expected capture before log, got {calls}"


def test_success_path_captures_nothing(monkeypatch, sentry_probe):
    """A healthy boot must not emit Sentry events."""
    monkeypatch.setattr(startup_mod, "_run_db_init_sync", lambda: None)
    app = SimpleNamespace(state=SimpleNamespace())

    asyncio.run(startup_mod._init_db_background(app))

    assert sentry_probe.captured == []
    assert app.state.db_init_status == "ready"
