"""MEH-3630: the weekly staging reset job (app/services/staging_reset_job.py).

Registered only on Railway staging; runs the real reset script with
--confirm; one run at a time across processes; never kills the scheduler.
"""

from __future__ import annotations

import subprocess
import time
from datetime import UTC, datetime

import pytest
from apscheduler.schedulers.background import BackgroundScheduler
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
    fri = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)  # a Friday
    assert reset.trigger.get_next_fire_time(None, fri) == datetime(
        2026, 11, 21, 23, 0, tzinfo=UTC
    )
    sun = datetime(2026, 11, 22, 0, 30, tzinfo=UTC)
    assert reset.trigger.get_next_fire_time(None, sun) == datetime(
        2026, 11, 28, 23, 0, tzinfo=UTC
    )


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


class _FakePopen:
    calls: list[tuple[list[str], dict]] = []

    def __init__(self, cmd, **kw):
        self.args, self.pid = cmd, 0
        _FakePopen.calls.append((cmd, kw))

    def wait(self, timeout=None):
        return 0


def _advisory_locks_held() -> int:
    """Counted from a separate session: a re-entrant lock on the pooled
    connection would hide a missing unlock from the same session."""
    with engine.connect() as conn:
        return conn.execute(
            text(
                "SELECT count(*) FROM pg_locks "
                "WHERE locktype = 'advisory' AND objid = :k AND granted"
            ),
            {"k": job.ADVISORY_LOCK_KEY},
        ).scalar_one()


def test_run_starts_the_reset_script_with_confirm(monkeypatch):
    _FakePopen.calls = []
    monkeypatch.setattr(subprocess, "Popen", _FakePopen)
    job.run()
    assert len(_FakePopen.calls) == 1
    cmd, kw = _FakePopen.calls[0]
    assert cmd[1:] == ["scripts/reset_staging.py", "--confirm"]
    assert (kw["cwd"] / "scripts" / "reset_staging.py").is_file()
    assert kw["start_new_session"] is True
    assert _advisory_locks_held() == 0


def test_run_holds_the_lock_while_the_script_runs(monkeypatch):
    seen: list[int] = []
    monkeypatch.setattr(job, "_run_script", lambda: seen.append(_advisory_locks_held()))
    job.run()
    assert seen == [1]
    assert _advisory_locks_held() == 0


def test_run_skips_while_another_process_holds_the_lock(monkeypatch):
    calls: list[int] = []
    monkeypatch.setattr(job, "_run_script", lambda: calls.append(1))
    with engine.connect() as other:
        # try_lock, not lock: a lock leaked by an earlier test fails here, not hangs
        assert other.execute(
            text("SELECT pg_try_advisory_lock(:k)"), {"k": job.ADVISORY_LOCK_KEY}
        ).scalar_one()
        try:
            job.run()
        finally:
            other.execute(
                text("SELECT pg_advisory_unlock(:k)"), {"k": job.ADVISORY_LOCK_KEY}
            )
    assert calls == []
    job.run()  # lock released: the next run goes ahead
    assert calls == [1]


def test_failed_reset_is_reported_releases_the_lock_and_does_not_raise(monkeypatch):
    reported: list[str] = []
    monkeypatch.setattr(job, "SCRIPT", ("-c", "import sys; sys.exit(3)"))
    monkeypatch.setattr(
        job, "capture_background_exception", lambda exc, task: reported.append(task)
    )
    job.run()
    assert reported == ["staging_weekly_reset"]
    assert _advisory_locks_held() == 0


def test_timeout_kills_the_seed_steps_too(monkeypatch, tmp_path):
    """reset_staging.py runs each seed step as its own child; a timeout must
    not leave one writing to the database after the lock is released."""
    pid_file = tmp_path / "grandchild.pid"
    script = (
        "import subprocess, sys, time\n"
        "p = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])\n"
        f"open({str(pid_file)!r}, 'w').write(str(p.pid))\n"
        "time.sleep(60)\n"
    )
    monkeypatch.setattr(job, "SCRIPT", ("-c", script))
    monkeypatch.setattr(job, "TIMEOUT_SECONDS", 3)
    with pytest.raises(subprocess.TimeoutExpired):
        job._run_script()
    grandchild = int(pid_file.read_text())
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and _alive(grandchild):
        time.sleep(0.1)
    assert not _alive(grandchild)


def _alive(pid: int) -> bool:
    try:
        with open(f"/proc/{pid}/stat") as f:
            return f.read().split()[2] != "Z"  # a zombie has already exited
    except (FileNotFoundError, ProcessLookupError):
        # The process can exit between open() and read(); the read then
        # raises ESRCH (MEH-3772). Either way it is no longer alive.
        return False
