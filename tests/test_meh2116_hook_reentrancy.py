"""MEH-2116: the Sentry hooks must not re-enter themselves via their own logging.

Measured before the fix: forcing the fail-open branch of ``before_send`` gave a
``logging.Logger.handle`` nesting depth of **40** at ``recursionlimit=600`` and
**134** at 2000 — linear in the limit, i.e. bounded only by stack exhaustion.
Healthy hooks gave depth 1.

The driver is *not* this module. It is sentry-sdk's patched ``callHandlers``,
which runs in a ``finally`` and therefore fires at any level::

    logger.warning/exception (app.sentry)
      -> sentry_patched_callhandlers   integrations/logging.py:191
      -> _handle_record                integrations/logging.py:143
      -> emit -> capture_event -> _prepare_event
      -> before_send                   client.py:878
      -> logger.warning/exception      <- closes the cycle

``_ReentrantCaptureHandler`` below models exactly that path with a stdlib
handler, so these tests need **no ``sentry_sdk`` import** — matching
``test_meh2114_sentry_budget.py``, and for the same reason: the SDK is pinned
but not installed in the CC sandbox, and per MEH-2114's verification step a
skipped test is not a green one. Every test here runs everywhere.

WHY THE CONSTRUCTION IS TRUSTED: ``test_construction_discriminates`` runs the
same harness against a deliberately UNGUARDED copy of the hook and requires it
to recurse *and to scale with the recursion limit*. If that case ever stops
going deep, the harness has lost its power to detect the bug and this whole
file fails — rather than reporting a green of unknown meaning. That is the
exact gap that let the loop ship in #2994: a test asserting only "the event
passes through" cannot tell a guarded hook from an unguarded one.
"""

import logging
import sys

import pytest

from app import sentry as sentry_mod
from app.sentry import (
    _reset_budget_state,
    _reset_hook_reentry,
    before_send,
    error_sampler,
    logger as sentry_logger,
)

LOW_LIMIT = 400
HIGH_LIMIT = 800


@pytest.fixture(autouse=True)
def _clean_state():
    _reset_budget_state()
    _reset_hook_reentry()
    yield
    _reset_budget_state()
    _reset_hook_reentry()


class _ReentrantCaptureHandler(logging.Handler):
    """Stand-in for LoggingIntegration: every record re-invokes a hook.

    This is the cycle-closing edge. A real handler would build an event and
    hand it to the hooks; the only property under test is that it calls back
    in, so it calls back with a fixed event.

    ``hook`` need not be the hook under test. In production sentry-sdk applies
    ``error_sampler`` and ``before_send`` to the SAME event, so a record
    emitted from inside one hook re-enters the OTHER — the case
    ``test_cross_hook_reentry_is_blocked`` covers, and the reason the latch is
    shared between them rather than one latch per hook.
    """

    def __init__(self, hook, event):
        super().__init__(level=logging.NOTSET)
        self._hook = hook
        self._event = event
        self.calls = 0
        self.returned = []

    def emit(self, record):
        self.calls += 1
        self.returned.append(self._hook(self._event, {}))


class _DepthProbe:
    """Measures re-entrancy depth of ``logging.Logger.handle`` — the exact
    frame the production traceback bottomed out in."""

    def __init__(self):
        self.depth = 0
        self.max_depth = 0
        self._orig = logging.Logger.handle

    def __enter__(self):
        probe = self

        def counting_handle(logger_self, record):
            probe.depth += 1
            probe.max_depth = max(probe.max_depth, probe.depth)
            try:
                return probe._orig(logger_self, record)
            finally:
                probe.depth -= 1

        logging.Logger.handle = counting_handle
        return self

    def __exit__(self, *exc):
        logging.Logger.handle = self._orig
        return False


def _event():
    return {"exception": {"values": [{"type": "ValueError", "value": "boom"}]}}


def _force_internal_failure(monkeypatch):
    """Force the documented fail-open branch in BOTH hooks.

    Same forcing technique the MEH-1906 Phase 0 used on hypothesis 1: drive the
    branch directly rather than waiting for a natural failure.
    """

    def _boom(*_a, **_k):
        raise RuntimeError("forced internal failure")

    monkeypatch.setattr(sentry_mod, "_burst_allow", _boom)
    monkeypatch.setattr(sentry_mod, "_is_noisy", _boom)


def _run_at_limit(hook, limit, monkeypatch, reenter_hook=None):
    """Run one hook under the reentrant handler at a given recursion limit.

    ``reenter_hook`` is the hook the handler calls back into; it defaults to
    the hook under test (the self-re-entry case).

    Returns (max_handle_depth, handler_calls, handler_return_values, event).
    """
    _reset_hook_reentry()
    event = _event()
    handler = _ReentrantCaptureHandler(reenter_hook or hook, event)
    original_limit = sys.getrecursionlimit()
    original_level = sentry_logger.level
    sentry_logger.addHandler(handler)
    sentry_logger.setLevel(logging.DEBUG)
    try:
        sys.setrecursionlimit(limit)
        with _DepthProbe() as probe:
            try:
                hook(event, {})
            except RecursionError:
                pass  # the unguarded case is expected to blow the stack
        return probe.max_depth, handler.calls, handler.returned, event
    finally:
        sys.setrecursionlimit(original_limit)
        sentry_logger.removeHandler(handler)
        sentry_logger.setLevel(original_level)
        _reset_hook_reentry()


# ----------------------------------------------------------------------
# SELF-TEST FIRST: prove the harness can see the bug at all.
# ----------------------------------------------------------------------


def test_construction_discriminates(monkeypatch):
    """An UNGUARDED hook must recurse, and must scale with the recursion limit.

    Without this, a passing guarded test is a green of unknown meaning.
    """

    def unguarded_before_send(event, hint=None):
        # The shipped hook's SHAPE minus the _hook_guard latch: fail-open
        # `except` that logs, on the same logger. Deliberately NOT a faithful
        # copy — `_drop_reason` is omitted and the fingerprint is a constant,
        # because `_force_internal_failure` makes `_burst_allow` raise before
        # either could matter. What must match is the logging edge, and only
        # that. (Saying "byte-for-byte" here would be the same overstated-
        # coverage claim this file exists to catch.)
        try:
            sentry_mod._burst_allow("x")
            return event
        except Exception:
            sentry_logger.warning("forced failure", exc_info=True)
            return event

    _force_internal_failure(monkeypatch)
    low, *_ = _run_at_limit(unguarded_before_send, LOW_LIMIT, monkeypatch)
    high, *_ = _run_at_limit(unguarded_before_send, HIGH_LIMIT, monkeypatch)

    assert low > 1, f"harness failed to reproduce the loop at all (depth={low})"
    assert high > low, (
        "unguarded depth did not scale with the recursion limit "
        f"({low} at {LOW_LIMIT}, {high} at {HIGH_LIMIT}) — the harness is no "
        "longer measuring stack-bounded recursion"
    )


# ----------------------------------------------------------------------
# THE GUARD
# ----------------------------------------------------------------------


@pytest.mark.parametrize("hook_name", ["before_send", "error_sampler"])
def test_guard_holds_depth_at_one_and_does_not_scale(hook_name, monkeypatch):
    """The shipped hooks must stay at depth 1 — at BOTH limits.

    Depth is asserted as an exact count, not `< 40`: a bound that loose would
    pass on a partially-broken guard.
    """
    hook = {"before_send": before_send, "error_sampler": error_sampler}[hook_name]
    _force_internal_failure(monkeypatch)

    low, low_calls, _, _ = _run_at_limit(hook, LOW_LIMIT, monkeypatch)
    high, high_calls, _, _ = _run_at_limit(hook, HIGH_LIMIT, monkeypatch)

    assert low == 1, f"{hook_name} re-entered logging (depth={low} at {LOW_LIMIT})"
    assert high == 1, f"{hook_name} re-entered logging (depth={high} at {HIGH_LIMIT})"
    assert low == high, "depth scaled with the recursion limit — guard not holding"
    # The handler still fired: the fail-open branch really was exercised.
    # Split rather than compounded, so a failure names which limit it was.
    assert low_calls == 1, f"fail-open branch not exercised at {LOW_LIMIT}"
    assert high_calls == 1, f"fail-open branch not exercised at {HIGH_LIMIT}"


@pytest.mark.parametrize(
    "entered, reentered, expected",
    [
        ("before_send", "error_sampler", 1.0),
        ("error_sampler", "before_send", "EVENT"),
    ],
)
def test_cross_hook_reentry_is_blocked(entered, reentered, expected, monkeypatch):
    """The latch is SHARED between the hooks — assert it, don't imply it.

    sentry-sdk applies ``error_sampler`` and ``before_send`` to the same event,
    so the record a failing hook emits re-enters the OTHER one. A latch per
    hook would leave that edge wide open while every same-hook test still
    passed. This is the case that makes the sharing load-bearing rather than
    incidental, so it is pinned in both directions.
    """
    hooks = {"before_send": before_send, "error_sampler": error_sampler}
    _force_internal_failure(monkeypatch)

    depth, calls, returned, event = _run_at_limit(
        hooks[entered], LOW_LIMIT, monkeypatch, reenter_hook=hooks[reentered]
    )

    assert depth == 1, (
        f"{entered} -> {reentered} re-entered logging (depth={depth}) — "
        "the latch is not shared between the hooks"
    )
    assert calls == 1, "the fail-open branch never fired; nothing was tested"

    # The blocked hook still fails OPEN, each with its own documented value.
    # Asserted against a value fixed OUTSIDE this call (the event object that
    # went in, or the literal 1.0) — never against the returned value itself,
    # which would be true no matter what came back.
    if expected == "EVENT":
        assert returned == [event], (
            "blocked before_send must return the event UNCHANGED; "
            f"got {returned!r} (None would mean the event was dropped)"
        )
        assert returned[0] is event, "it must be the same object, not a copy"
    else:
        assert returned == [expected], (
            f"blocked error_sampler must fail open at {expected}; got {returned!r}"
        )


def test_reentrant_before_send_returns_event_unchanged():
    """Fail-open on re-entry: the event passes through untouched."""
    event = _event()
    with _hook_active():
        assert before_send(event, {}) is event


def test_reentrant_error_sampler_returns_one():
    with _hook_active():
        assert error_sampler(_event(), {}) == 1.0


class _hook_active:
    """Simulate 'already inside a hook on this thread'."""

    def __enter__(self):
        sentry_mod._hook_reentry.active = True

    def __exit__(self, *exc):
        _reset_hook_reentry()
        return False


def test_latch_is_released_after_a_normal_call():
    """A latch that leaked would silently disable the budget from then on."""
    before_send(_event(), {})
    assert getattr(sentry_mod._hook_reentry, "active", False) is False
    error_sampler(_event(), {})
    assert getattr(sentry_mod._hook_reentry, "active", False) is False


def test_latch_is_released_even_when_the_hook_fails(monkeypatch):
    _force_internal_failure(monkeypatch)
    before_send(_event(), {})
    assert getattr(sentry_mod._hook_reentry, "active", False) is False


# ----------------------------------------------------------------------
# LAYER 1 — the name passed to ignore_logger
# ----------------------------------------------------------------------


def test_ignored_logger_name_is_exact_not_a_parent():
    """`_IGNORED_LOGGERS` is a FLAT set, membership-tested at
    integrations/logging.py:174,177 — not hierarchical
    (getsentry/sentry-python#511). Passing a parent would silently no-op, so
    the name must be the module logger's own, in full."""
    assert sentry_logger.name == "app.sentry"
    assert sentry_logger.name != sentry_logger.name.split(".")[0]
