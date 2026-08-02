"""
MEH-1824 — the daily scheduler tick fail-isolates its two senders from
each other.

`app.startup._run_followup_job` runs two independent passes:
  * `onboarding_followup.send_due_followups` (MEH-539, approved-only)
  * `pending_nudge.send_pending_nudges`      (MEH-1818, pending-only)

They shared a single `try/except` until MEH-1824. These tests pin the two
properties that fixed:

  1. A session-level crash in the FIRST pass — one raised outside its own
     per-producer loop, which its internal fail-isolation cannot catch —
     must NOT skip the second pass.
  2. A crash in the SECOND pass must be reported to Sentry under its own
     `task="pending_nudge"` tag, not the first pass's tag.

Both are asserted against the REAL `_run_followup_job`, with the two
senders and the Sentry sink monkeypatched at their source modules — the
function imports them locally, so patching the module attribute is what
intercepts the call.

Shown failing by construction against the pre-MEH-1824 shared-`try` form:
test 1 fails (nudge never called) and test 2 fails (tag reads
"onboarding_followups"). Neither is a tautology — each names the exact
value the old code produced.
"""
from __future__ import annotations

import pytest

from app import startup
from app.services import onboarding_followup, pending_nudge


@pytest.fixture
def scheduler_spies(monkeypatch, db):
    """Patch both senders, the Sentry sink, and the session factory.

    Returns a dict the test mutates to choose which sender raises, and
    reads back to see what happened.
    """
    state: dict = {
        "followup_called": False,
        "nudge_called": False,
        "followup_raises": False,
        "nudge_raises": False,
        "sentry": [],  # list of task= tags captured
    }

    def fake_followups(_db):
        state["followup_called"] = True
        if state["followup_raises"]:
            # A session-level failure: raised OUTSIDE the per-producer loop,
            # so send_due_followups' own fail-isolation never sees it. This
            # is the only class that can reach _run_followup_job's handler.
            raise RuntimeError("session-level failure in send_due_followups")
        return {2: 0, 3: 0, 4: 0, 5: 0}

    def fake_nudges(_db):
        state["nudge_called"] = True
        if state["nudge_raises"]:
            raise RuntimeError("session-level failure in send_pending_nudges")
        return {"sent": 0, "stamped_nothing_missing": 0}

    def fake_capture(_exc, task=None, **_kw):
        state["sentry"].append(task)

    monkeypatch.setattr(onboarding_followup, "send_due_followups", fake_followups)
    monkeypatch.setattr(pending_nudge, "send_pending_nudges", fake_nudges)
    monkeypatch.setattr(startup, "capture_background_exception", fake_capture)
    # The job opens its own session; hand it the test session and make close()
    # a no-op so the fixture's teardown still owns the real one.
    monkeypatch.setattr(
        "app.database.SessionLocal", lambda: _NonClosing(db), raising=False
    )
    return state


class _NonClosing:
    """Proxy that forwards everything to the test session but swallows
    close(), which _run_followup_job calls in its `finally`."""

    def __init__(self, real):
        self._real = real

    def __getattr__(self, name):
        return getattr(self._real, name)

    def close(self):
        return None


def test_followup_crash_does_not_skip_the_pending_nudge(scheduler_spies):
    """Property 1 — the passes are independent.

    Under the pre-MEH-1824 shared `try`, the raise below jumped straight to
    the common handler and `send_pending_nudges` was never reached: a
    business waiting on a photo silently lost its nudge for that day because
    an unrelated sender failed.
    """
    scheduler_spies["followup_raises"] = True

    startup._run_followup_job()

    assert scheduler_spies["followup_called"] is True
    assert scheduler_spies["nudge_called"] is True, (
        "the pending nudge must still run when the follow-up pass crashes — "
        "neither sender is a precondition for the other"
    )
    assert scheduler_spies["sentry"] == ["onboarding_followups"], (
        "the follow-up crash keeps its own tag"
    )


def test_nudge_crash_is_reported_under_its_own_sentry_task(scheduler_spies):
    """Property 2 — the nudge crash is not filed under the other stream.

    Under the shared `try` this reported `task="onboarding_followups"`,
    pointing whoever was debugging at the wrong sender entirely.
    """
    scheduler_spies["nudge_raises"] = True

    startup._run_followup_job()

    assert scheduler_spies["sentry"] == ["pending_nudge"], (
        f"expected the nudge's own Sentry task tag, got "
        f"{scheduler_spies['sentry']!r}"
    )


def test_nudge_crash_does_not_suppress_a_successful_followup(scheduler_spies):
    """The mirror of test 1 — order independence in the other direction.

    Asserted separately so a regression that reverses the two calls, or
    wraps only one of them, cannot pass by covering just one direction.
    """
    scheduler_spies["nudge_raises"] = True

    startup._run_followup_job()

    assert scheduler_spies["followup_called"] is True
    assert scheduler_spies["nudge_called"] is True


def test_clean_run_reports_nothing_to_sentry(scheduler_spies):
    """The control. Without it, an implementation that captured on EVERY run
    would satisfy both assertions above — a green with two possible causes.
    """
    startup._run_followup_job()

    assert scheduler_spies["followup_called"] is True
    assert scheduler_spies["nudge_called"] is True
    assert scheduler_spies["sentry"] == []
