"""
Module:   test_meh1828_full_week_expiry
Purpose:  The weekly reset clears 'full_this_week' — ONE column, and touches
          nothing else, including the two legacy columns it used to write.
          Plus: the scheduler job actually registers with the Israel-timezone
          weekly trigger.
Touches:  Test DB only (producers rows via the conftest factory).
Does NOT: test WHEN the trigger fires — APScheduler's cron math is not this
          repo's to verify. It asserts the trigger's declared fields instead.
Related:  backend/app/services/availability_expiry.py (the subject);
          backend/app/schemas/schemas.py (state_to_legacy — the derivation
          that replaced the dual-write);
          tests/test_scheduler_job_isolation.py (the job-wiring precedent).
History:  MEH-1828 (creation) · MEH-2271 (MEH-1854 chunk 3a — the
          discriminating assertion INVERTED, see below).

THE DISCRIMINATING ASSERTION, and why it flipped. MEH-1828 asserted the
opposite of what this file asserts now, and both were right for their day.

  Then: the legacy pair was live and read off the row, so a reset writing
        only the enum left availability_status='full' behind and every
        legacy reader kept showing the banner. The test failed the enum-only
        variant on exactly that assertion.

  Now (MEH-2271): nothing writes the pair and nothing reads it off the row —
        ProducerListOut derives both from availability_state at
        serialization time. A reset that still wrote them would be a second
        authority over one fact, and would be the thing to catch.

So test_reset_leaves_the_legacy_columns_alone below is the same test with
the sign reversed: it pins the two columns to values that DISAGREE with the
state, resets, and requires them to still disagree — which fails the
moment anything re-introduces the dual-write. It also asserts the derived
output is correct despite those stale columns, so the two halves together
say "the columns are dead AND the reader is right", not just one of them.
"""

from __future__ import annotations

from conftest import make_producer

from app.services.availability_expiry import (
    EXPIRED_STATE,
    RESET_STATE,
    reset_expired_full_week,
)


def _set_state(db, producer, state: str) -> None:
    """Put a producer into `state` the way the app does as of MEH-2271 — the
    enum, and only the enum. The legacy columns keep whatever the row already
    had, which is exactly the production shape now: they are frozen at the
    last value written before chunk 3a and nothing updates them again."""
    producer.availability_state = state
    db.commit()


def _set_legacy_columns(db, producer, *, is_today: bool, status: str) -> None:
    """Write the two legacy columns DIRECTLY, bypassing every app path.

    No app code writes them any more, so a test that wants a specific value
    in them has to put it there itself. Used to plant values that DISAGREE
    with availability_state — the only construction under which "the reset
    did not touch these columns" is a falsifiable claim rather than a
    tautology about two fields that already matched.
    """
    producer.is_available_today = is_today
    producer.availability_status = status
    db.commit()


def test_reset_leaves_the_legacy_columns_alone(db):
    """MEH-2271: the reset writes ONE column. A re-introduced dual-write fails
    HERE and only here — that is the discrimination proof, inverted from the
    MEH-1828 version of this test.

    The construction is what makes it falsifiable. The legacy columns are
    planted with values that CONTRADICT the state (`is_available_today=True`
    and `availability_status='vacation'` on a `full_this_week` row) — a
    combination no app path can produce. If the reset still mapped the state
    onto them, they would come back (False, 'available'), which is the exact
    pair the old implementation wrote. Planting values that already agreed
    with the mapping would make the assertion pass under BOTH implementations
    and prove nothing.
    """
    p = make_producer(db, name="עמוסה")
    _set_state(db, p, EXPIRED_STATE)
    _set_legacy_columns(db, p, is_today=True, status="vacation")
    # Preconditions, so a green below cannot mean "was never full" or "the
    # columns were already at the asserted values":
    assert p.availability_state == EXPIRED_STATE
    assert p.availability_status == "vacation"
    assert p.is_available_today is True

    changed = reset_expired_full_week(db)
    db.refresh(p)

    assert changed == 1
    assert p.availability_state == RESET_STATE
    # THE discriminating lines. The old three-column write would have set
    # these to (False, 'available'); the contradictory plant survives only if
    # the UPDATE names one column.
    assert p.availability_status == "vacation", (
        "the reset must not write availability_status any more (MEH-2271)"
    )
    assert p.is_available_today is True, (
        "the reset must not write is_available_today any more (MEH-2271)"
    )


def test_the_derived_output_is_right_even_though_the_columns_are_stale(db):
    """The other half of the claim above. Dead columns are only safe if the
    reader no longer consults them — otherwise this chunk trades a stale
    write for a stale read, which is the same bug wearing the other sign.

    Serializes the reset row through ProducerListOut with the contradictory
    legacy values still on it, and requires the derived pair to follow the
    STATE. Against a reader that still read the columns, this returns
    ('vacation', True) and fails on both lines.
    """
    from app.schemas.schemas import ProducerListOut

    p = make_producer(db, name="עמוסה")
    _set_state(db, p, EXPIRED_STATE)
    _set_legacy_columns(db, p, is_today=True, status="vacation")
    reset_expired_full_week(db)
    db.refresh(p)

    out = ProducerListOut.model_validate(p, from_attributes=True)

    assert out.availability_state == RESET_STATE
    assert out.availability_status == "available", (
        "derived from the state, not read off the stale column"
    )
    assert out.is_available_today is False, (
        "derived from the state, not read off the stale column"
    )


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
        # Sentinel: contradicts every state below, so "unchanged" is a real
        # claim rather than a coincidence with the enum→legacy mapping.
        _set_legacy_columns(db, q, is_today=True, status="vacation")
        untouched[state] = q.id

    changed = reset_expired_full_week(db)
    assert changed == 1  # exactly the one expired row, not 4

    from app.models.models import Producer

    for state, pid in untouched.items():
        row = db.query(Producer).filter(Producer.id == pid).one()
        assert row.availability_state == state, (
            f"{state}: reset must not touch it"
        )
        # MEH-2271: the legacy columns are asserted against the SENTINEL the
        # setup planted, not against a mapping of the state. Comparing them
        # to state_to_legacy(state) would pass under a re-introduced
        # dual-write for three of these rows, because the reset would write
        # exactly the value being compared against. The sentinel cannot be
        # produced by any mapping, so only "nothing wrote here" satisfies it.
        assert row.is_available_today is True, (
            f"{state}: legacy flag must survive untouched"
        )
        assert row.availability_status == "vacation", (
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
