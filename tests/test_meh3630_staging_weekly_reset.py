"""MEH-3630: the weekly staging reset job (app/services/staging_reset_job.py).

Registered only on Railway staging; runs the real reset script with
--confirm; one run at a time across processes; never kills the scheduler.
"""

from __future__ import annotations

import subprocess

import pytest
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import text

from app import startup
from app.config import settings
from app.database import engine
from app.services import staging_reset_job as job


def _registered_ids(monkeypatch, *, env: str, railway_env: str) -> set[str]:
    monkeypatch.setattr(settings, "env", env)
    monkeypatch.setattr(settings, "railway_environment", railway_env)
    sched = BackgroundScheduler(timezone="UTC")
    startup.register_scheduler_jobs(sched)  # never started
    return {j.id for j in sched.get_jobs()}


def test_registered_on_staging_with_the_weekly_trigger(monkeypatch):
    sched = BackgroundScheduler(timezone="UTC")
    monkeypatch.setattr(settings, "env", "development")
    monkeypatch.setattr(settings, "railway_environment", "staging")
    startup.register_scheduler_jobs(sched)
    reset = sched.get_job(job.JOB_ID)
    assert reset is not None
    assert reset.func is job.run
    expected = CronTrigger.from_crontab("0 23 * * sat", timezone="UTC")
    assert str(reset.trigger) == str(expected)


@pytest.mark.parametrize(
    "env, railway_env",
    [
        ("development", ""),  # local and CI
        ("development", "production"),
        ("production", "staging"),  # ENV=production wins
        ("development", "pr-42"),
    ],
)
def test_not_registered_outside_staging(monkeypatch, env, railway_env):
    assert job.JOB_ID not in _registered_ids(
        monkeypatch, env=env, railway_env=railway_env
    )


def test_run_calls_the_reset_script_with_confirm(monkeypatch):
    calls: list[tuple[list[str], dict]] = []
    monkeypatch.setattr(subprocess, "run", lambda cmd, **kw: calls.append((cmd, kw)))
    job.run()
    assert len(calls) == 1
    cmd, kw = calls[0]
    assert cmd[1:] == ["scripts/reset_staging.py", "--confirm"]
    assert (kw["cwd"] / "scripts" / "reset_staging.py").is_file()
    assert kw["check"] is True


def test_run_skips_while_another_process_holds_the_lock(monkeypatch):
    calls: list[object] = []
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: calls.append(a))
    with engine.connect() as other:
        other.execute(text("SELECT pg_advisory_lock(:k)"), {"k": job.ADVISORY_LOCK_KEY})
        try:
            job.run()
        finally:
            other.execute(
                text("SELECT pg_advisory_unlock(:k)"), {"k": job.ADVISORY_LOCK_KEY}
            )
    assert calls == []
    job.run()  # lock released: the next run goes ahead
    assert len(calls) == 1


def test_failed_reset_is_reported_and_does_not_raise(monkeypatch):
    def boom(*_a, **_k):
        raise subprocess.CalledProcessError(1, ["python", "reset"])

    reported: list[str] = []
    monkeypatch.setattr(subprocess, "run", boom)
    monkeypatch.setattr(
        job, "capture_background_exception", lambda exc, task: reported.append(task)
    )
    job.run()
    assert reported == ["staging_weekly_reset"]
    # the lock was released on the failure path
    with engine.connect() as conn:
        assert conn.execute(
            text("SELECT pg_try_advisory_lock(:k)"), {"k": job.ADVISORY_LOCK_KEY}
        ).scalar_one()
        conn.execute(
            text("SELECT pg_advisory_unlock(:k)"), {"k": job.ADVISORY_LOCK_KEY}
        )
