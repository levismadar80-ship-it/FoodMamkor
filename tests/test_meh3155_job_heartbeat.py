"""
MEH-3155: every APScheduler job sends a Sentry Crons heartbeat.

Asserted against the REAL `app.startup._run_*_job` functions (the ones
`add_job` registers), with each job's service and the check-in sink
monkeypatched. Before MEH-3155 none of the five sent any check-in, so every
`test_job_sends_checkins` case fails on the old code (0 check-ins).
"""

from __future__ import annotations

import pytest

from app import startup
from app.services import job_heartbeat


class _NoopSession:
    def close(self) -> None:
        pass

    def rollback(self) -> None:
        pass


@pytest.fixture
def checkins(monkeypatch):
    sent: list[dict] = []

    def spy(**kwargs):
        sent.append(kwargs)
        return "cid-1"

    monkeypatch.setattr(job_heartbeat, "_capture_checkin", spy)
    import app.database

    monkeypatch.setattr(app.database, "SessionLocal", lambda: _NoopSession())
    return sent


def _stub_services(monkeypatch):
    from app.services import (
        analytics_rollup,
        auto_reply_watchdog,
        onboarding_followup,
        pending_nudge,
        rescue_digest,
        retention_purge,
    )

    monkeypatch.setattr(onboarding_followup, "send_due_followups", lambda db: {})
    monkeypatch.setattr(pending_nudge, "send_pending_nudges", lambda db: {})
    monkeypatch.setattr(auto_reply_watchdog, "run_watchdog", lambda db: {})
    monkeypatch.setattr(analytics_rollup, "run_rollup", lambda db: {})
    monkeypatch.setattr(retention_purge, "run_purge", lambda db: {})
    monkeypatch.setattr(rescue_digest, "send_rescue_digests", lambda db: {})


JOBS = [
    (
        "_run_followup_job",
        "onboarding-followups-daily",
        "crontab",
        job_heartbeat.FOLLOWUP_CRON,
    ),
    (
        "_run_watchdog_job",
        "auto-reply-watchdog",
        "interval",
        job_heartbeat.WATCHDOG_INTERVAL_MINUTES,
    ),
    (
        "_run_analytics_rollup_job",
        "analytics-rollup-daily",
        "crontab",
        job_heartbeat.ANALYTICS_ROLLUP_CRON,
    ),
    (
        "_run_retention_purge_job",
        "retention-purge-daily",
        "crontab",
        job_heartbeat.RETENTION_PURGE_CRON,
    ),
    (
        "_run_rescue_digest_job",
        "rescue-codes-digest",
        "interval",
        job_heartbeat.RESCUE_DIGEST_INTERVAL_MINUTES,
    ),
]


@pytest.mark.parametrize("job", JOBS, ids=[j[0] for j in JOBS])
def test_job_sends_checkins(monkeypatch, checkins, job):
    func_name, slug, kind, value = job
    _stub_services(monkeypatch)
    getattr(startup, func_name)()

    assert [c["status"] for c in checkins] == ["in_progress", "ok"]
    assert {c["monitor_slug"] for c in checkins} == {slug}
    assert checkins[1]["check_in_id"] == "cid-1"
    schedule = checkins[0]["monitor_config"]["schedule"]
    assert schedule["type"] == kind
    assert schedule["value"] == value


def test_failed_checkin_never_breaks_the_job(monkeypatch):
    ran: list[bool] = []

    def boom(**_kwargs):
        raise RuntimeError("sentry down")

    monkeypatch.setattr(job_heartbeat, "_capture_checkin", boom)

    @job_heartbeat.heartbeat("x", job_heartbeat.interval_monitor_config(5))
    def job() -> None:
        ran.append(True)

    job()
    assert ran == [True]


def test_job_exception_reports_error_and_propagates(monkeypatch, checkins):
    @job_heartbeat.heartbeat("x", job_heartbeat.interval_monitor_config(5))
    def job() -> None:
        raise ValueError("job bug")

    with pytest.raises(ValueError):
        job()
    assert [c["status"] for c in checkins] == ["in_progress", "error"]


def test_triggers_built_from_the_same_constants():
    """The trigger and the monitor config read one value (no drift)."""
    src = open(startup.__file__, encoding="utf-8").read()
    for name in (
        "FOLLOWUP_CRON",
        "ANALYTICS_ROLLUP_CRON",
        "RETENTION_PURGE_CRON",
        "WATCHDOG_INTERVAL_MINUTES",
        "RESCUE_DIGEST_INTERVAL_MINUTES",
    ):
        # once in the @heartbeat decorator, once in the add_job trigger
        assert src.count(name) >= 2, name
