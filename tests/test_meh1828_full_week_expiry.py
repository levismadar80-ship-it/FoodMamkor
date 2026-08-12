"""
Module:   test_meh1828_full_week_expiry
Purpose:  The weekly reset clears 'full_this_week' — ALL THREE columns, not
          just the enum — and touches nothing else. Plus: the scheduler job
          actually registers with the Israel-timezone weekly trigger.
Touches:  Test DB only (producers rows via the conftest factory).
Does NOT: test WHEN the trigger fires — APScheduler's cron math is not this
          repo's to verify. It asserts the trigger's declared fields instead.
Related:  backend/app/services/availability_expiry.py (the subject);
          backend/app/routers/producer_me.py:533 (_state_to_legacy);
          tests/test_scheduler_job_isolation.py (the job-wiring precedent).
History:  MEH-1828 (creation).

THE DISCRIMINATING ASSERTION (Phase 0 finding): the legacy pair
(is_available_today, availability_status) is still live and still read until
MEH-1854 Phase 4 drops it. A reset writing only availability_state leaves
availability_status='full' behind, and legacy readers keep showing the
banner. test_reset_clears_the_legacy_pair_too fails on exactly that naive
implementation — proven by building the enum-only variant and running the
suite against it (run pasted in the PR body).
"""

from __future__ import annotations

from conftest import make_producer

from app.services.availability_expiry import (
    EXPIRED_STATE,
    RESET_STATE,
    reset_expired_full_week,
)


def _set_state(db, producer, state: str) -> None:
    """Put a producer into `state` the way the app does — enum + legacy pair
    via the router's own mapping, the single owner of that translation."""
    from app.routers.producer_me import _state_to_legacy

    is_today, legacy_status = _state_to_legacy(state)
    producer.availability_state = state
    producer.is_available_today = is_today
    producer.availability_status = legacy_status
    db.commit()


def test_reset_clears_the_legacy_pair_too(db):
    """The three-column write. The enum-only variant fails THIS test on the
    availability_status assertion — that is the discrimination proof."""
    p = make_producer(db, name="עמוסה")
    _set_state(db, p, EXPIRED_STATE)
    # Preconditions, so a green below cannot mean "was never full":
    assert p.availability_status == "full"
    assert p.is_available_today is False

    changed = reset_expired_full_week(db)
    db.refresh(p)

    assert changed == 1
    assert p.availability_state == RESET_STATE
    # THE discriminating line — the naive enum-only implementation leaves
    # availability_status='full' behind, and the construction run failed on
    # exactly this assertion ('full' == 'available') and nothing else.
    assert p.availability_status == "available"
    # NOT a discriminator, and saying so is the point (CI reviewer catch):
    # full_this_week and accepting_orders BOTH map to is_available_today=False,
    # so this line passes under the naive variant too. It is an invariant
    # check — the reset must not accidentally set the flag truthy — not proof.
    assert p.is_available_today is False


def test_reset_touches_only_full_this_week(db):
    """Every other state survives byte-identical, and the return value is the
    exact count of expired rows — not entailed by the filter (the count comes
    back from the UPDATE, the states are re-read from the DB)."""
    expired = make_producer(db, name="עמוסה")
    _set_state(db, expired, EXPIRED_STATE)

    untouched = {}
    for state in ("accepting_orders", "available_today", "on_vacation"):
        q = make_producer(db, name=f"עסק-{state}")
        _set_state(db, q, state)
        untouched[state] = q.id

    changed = reset_expired_full_week(db)
    assert changed == 1  # exactly the one expired row, not 4

    from app.models.models import Producer
    from app.routers.producer_me import _state_to_legacy

    for state, pid in untouched.items():
        row = db.query(Producer).filter(Producer.id == pid).one()
        assert row.availability_state == state, (
            f"{state}: reset must not touch it"
        )
        # The FULL row survives, not just the enum (CI reviewer catch: the
        # docstring claims byte-identical, so all three columns are asserted
        # for every untouched state — not only vacation's). available_today
        # doubles as the true-flag control: its is_available_today=True would
        # redline a reset that wrote the wrong mapping onto untouched rows.
        exp_today, exp_status = _state_to_legacy(state)
        assert row.is_available_today is exp_today, (
            f"{state}: legacy flag must survive untouched"
        )
        assert row.availability_status == exp_status, (
            f"{state}: legacy status must survive untouched"
        )


def test_reset_on_empty_set_is_a_clean_zero(db):
    """Zero expired rows → returns 0 and changes nothing. The producer here
    exists so the zero cannot also mean 'empty table' — the two-causes rule:
    a 0 against an empty DB would pass identically with the query deleted."""
    p = make_producer(db, name="פתוח")
    _set_state(db, p, RESET_STATE)

    assert reset_expired_full_week(db) == 0
    db.refresh(p)
    assert p.availability_state == RESET_STATE


def test_service_rolls_back_and_leaves_the_session_usable_on_failure(db, monkeypatch):
    """SHOULD-FIX from the adversarial review: the wrapper test patches the
    WHOLE service away, so the service's own except/rollback path — the
    MEH-1824 session-usable invariant its docstring claims — was never
    exercised by a real failure. This forces db.commit() to raise INSIDE the
    real function and asserts all three halves of the claim:

      1. the exception propagates (the wrapper is the swallow layer, not us),
      2. rollback actually ran (the expired row is still expired),
      3. the session is USABLE afterwards — the next query runs instead of
         raising PendingRollbackError, which is the exact failure MEH-1824
         measured when a poisoned session met its next caller.
    """
    import pytest as _pytest

    p = make_producer(db, name="עמוסה")
    _set_state(db, p, EXPIRED_STATE)

    real_commit = db.commit
    calls = {"rollback": 0}
    real_rollback = db.rollback

    def failing_commit():
        raise RuntimeError("synthetic commit failure")

    def counting_rollback():
        calls["rollback"] += 1
        return real_rollback()

    monkeypatch.setattr(db, "commit", failing_commit)
    monkeypatch.setattr(db, "rollback", counting_rollback)

    with _pytest.raises(RuntimeError, match="synthetic commit failure"):
        reset_expired_full_week(db)

    # Un-patch before verifying, so the verification itself is unmocked.
    monkeypatch.setattr(db, "commit", real_commit)
    monkeypatch.setattr(db, "rollback", real_rollback)

    assert calls["rollback"] == 1
    # The session must answer a fresh query — a poisoned session raises here.
    from app.models.models import Producer

    row = db.query(Producer).filter(Producer.id == p.id).one()
    # And the rollback must have undone the UPDATE: still expired.
    assert row.availability_state == EXPIRED_STATE
    assert row.availability_status == "full"


def test_weekly_job_is_registered_with_israel_timezone():
    """The wiring: the job exists on a scheduler built the way lifespan builds
    it, with a weekly Sunday trigger carrying Asia/Jerusalem — not the
    scheduler's UTC default, which would drift an hour across IST/IDT.

    Asserts the DECLARED trigger fields, not cron math. Building the real
    trigger via startup's own registration path would need full app lifespan;
    instead this pins the module-level facts a refactor could silently lose:
    the job function exists in startup, and a CronTrigger with these fields
    resolves the timezone it claims.
    """
    from apscheduler.triggers.cron import CronTrigger

    from app import startup

    # The job body exists and is the function the registration names.
    assert callable(startup._run_full_week_expiry_job)

    trig = CronTrigger(day_of_week="sun", hour=0, minute=10, timezone="Asia/Jerusalem")
    assert str(trig.timezone) == "Asia/Jerusalem"
    fields = {f.name: str(f) for f in trig.fields}
    assert fields["day_of_week"] == "sun"
    assert fields["hour"] == "0"
    assert fields["minute"] == "10"
    # And startup.py actually registers with exactly these values — read from
    # the source once, so the two cannot drift silently. A source-text probe
    # is weak evidence alone (it cannot execute), which is why the service
    # behaviour above is tested for real; this only pins the wiring strings.
    # TODO: delete the source pins when the wiring has an integration test
    # that runs lifespan's registration path for real (CI reviewer note —
    # a helper-extraction refactor breaks these strings with no behaviour
    # change, and they add nothing beyond the service tests when that lands).
    import inspect

    src = inspect.getsource(startup)
    assert 'day_of_week="sun"' in src
    assert 'timezone="Asia/Jerusalem"' in src
    assert "meh_1828_full_week_expiry_weekly" in src


def test_job_wrapper_survives_a_crash_and_reports_its_own_tag(monkeypatch, db):
    """MEH-1824 shape: the wrapper swallows a crash (scheduler thread must
    not die) and reports under its OWN Sentry tag. Mirrors
    test_scheduler_job_isolation's technique — patch at the source module,
    because the wrapper imports locally."""
    from app import startup
    from app.services import availability_expiry

    captured: list[str] = []

    def boom(_db):
        raise RuntimeError("synthetic weekly-run failure")

    class _NonClosing:
        def __init__(self, real):
            self._real = real

        def __getattr__(self, name):
            if name == "close":
                return lambda: None
            return getattr(self._real, name)

    monkeypatch.setattr(availability_expiry, "reset_expired_full_week", boom)
    monkeypatch.setattr(
        startup,
        "capture_background_exception",
        lambda exc, task: captured.append(task),
    )
    monkeypatch.setattr(
        "app.database.SessionLocal", lambda: _NonClosing(db)
    )

    # Must not raise:
    startup._run_full_week_expiry_job()
    assert captured == ["full_week_expiry"]
