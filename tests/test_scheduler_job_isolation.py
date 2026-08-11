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

    Takes the `db` fixture because `_run_followup_job` opens its OWN session
    via `SessionLocal()` and closes it in a `finally`. We hand it the test
    session wrapped in `_NonClosing` so that close() is a no-op and the
    fixture still owns the real one — and so the DB-error test below can
    poison and inspect a genuine session rather than a mock.
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
        f"expected the nudge's own Sentry task tag, got {scheduler_spies['sentry']!r}"
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


def test_db_level_failure_in_pass_one_does_not_poison_pass_two(
    monkeypatch, db, scheduler_spies
):
    """The failure class the RuntimeError tests above do NOT cover.

    A `RuntimeError` raised by a monkeypatched sender never touches the
    Session, so the four tests above would pass even with no `db.rollback()`
    anywhere. A **DB-level** failure is different: it leaves the Session in a
    needs-rollback state, and the next query on it raises instead of running.
    Without the rollback in the first `except`, the nudge pass is still
    skipped — it just fails with a nudge-shaped error instead, which is worse
    than the original bug because it looks like the nudge's own fault.

    Measured before this test was written (Postgres 16, real Session):
    poisoned → the pass-2 query raises `InternalError`; after `rollback()` →
    it succeeds. So this asserts a real behaviour, not a theory.

    The nudge here runs a REAL query rather than returning a canned dict —
    that is the whole point. A stubbed nudge cannot detect a poisoned session.
    """
    import sqlalchemy as sa

    from app.models.models import Producer

    def poisoning_followups(session):
        scheduler_spies["followup_called"] = True
        # A genuine DB-level error, not a synthetic one: this is what an
        # OperationalError on the candidate query does to the session.
        session.execute(sa.text("SELECT * FROM table_that_does_not_exist"))

    def querying_nudges(session):
        scheduler_spies["nudge_called"] = True
        # Reaches the DB. Raises on a poisoned session; succeeds on a clean one.
        session.query(Producer).filter(
            Producer.status.in_(("pending", "pending_whatsapp"))
        ).all()
        scheduler_spies["nudge_query_ok"] = True
        return {"sent": 0, "stamped_nothing_missing": 0}

    monkeypatch.setattr(onboarding_followup, "send_due_followups", poisoning_followups)
    monkeypatch.setattr(pending_nudge, "send_pending_nudges", querying_nudges)
    scheduler_spies["nudge_query_ok"] = False

    startup._run_followup_job()

    assert scheduler_spies["nudge_called"] is True
    assert scheduler_spies["nudge_query_ok"] is True, (
        "the nudge pass reached the DB but its query failed — the session was "
        "left in a needs-rollback state by the first pass, so isolation only "
        "held for Python-level errors"
    )
    assert scheduler_spies["sentry"] == ["onboarding_followups"], (
        "only the first pass should have reported; a second entry means the "
        "nudge failed on the poisoned session"
    )

    # Leave the session usable for the fixture's teardown.
    db.rollback()


def test_clean_run_reports_nothing_to_sentry(scheduler_spies):
    """The control. Without it, an implementation that captured on EVERY run
    would satisfy both assertions above — a green with two possible causes.
    """
    startup._run_followup_job()

    assert scheduler_spies["followup_called"] is True
    assert scheduler_spies["nudge_called"] is True
    assert scheduler_spies["sentry"] == []
